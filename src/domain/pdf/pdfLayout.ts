/**
 * Pure layout for gtdpara's PDF pipeline (docs/dev/technical-design-project-
 * close-out.md §3.2): turns a PdfDocument (domain/pdf/pdfDocument.ts) plus
 * the already-rendered image parts into the positioned PdfSpec the native
 * writer consumes (domain/pdf/pdfSpec.ts). No I/O, no React Native.
 *
 * - Text parts flow over as many pages as needed: word wrap by real
 *   Helvetica widths (helveticaMetrics.ts), headings kept with the next
 *   line, rows cut with "…" when too wide.
 * - Every text part starts on a fresh page; every image part is one page.
 * - Anchors -> page numbers are resolved here, for links, bookmarks and
 *   "page N" cells. Because a table of contents' own length shifts the
 *   numbers it prints, layout runs until the anchor pages stop changing
 *   (normally 2 passes, capped at MAX_PASSES).
 */
import {textWidth} from './helveticaMetrics';
import {PdfBlock, PdfDocument, PdfOutlineEntry, ResolvedImage, TextStyle} from './pdfDocument';
import {PdfLink, PdfOutlineNode, PdfPageSpec, PdfSpec, PdfTextItem} from './pdfSpec';

export const TEXT_STYLES: Record<TextStyle, {size: number; bold: boolean}> = {
  title: {size: 22, bold: true},
  h1: {size: 16, bold: true},
  h2: {size: 13, bold: true},
  h3: {size: 11, bold: true},
  body: {size: 10.5, bold: false},
  small: {size: 9, bold: false},
};

/** Line height as a multiple of font size. */
export const LINE_FACTOR = 1.35;

export const MARGIN = {top: 44, bottom: 52, side: 40};

const MAX_PASSES = 4;
const ELLIPSIS = '…';
const HEADING_SPACE_BEFORE: Record<1 | 2 | 3, number> = {1: 12, 2: 8, 3: 6};
const HEADING_SPACE_AFTER = 4;
const HEADING_STYLE: Record<1 | 2 | 3, TextStyle> = {1: 'h1', 2: 'h2', 3: 'h3'};

export interface LayoutResult {
  spec: PdfSpec;
  /** Anchor -> 0-based page index. */
  anchorPages: Record<string, number>;
  pageCount: number;
  /** Anchors that were linked to or bookmarked but never defined (their links/bookmarks are dropped). */
  unresolvedAnchors: string[];
  /** Labels of image parts that became placeholder pages. */
  placeholders: string[];
}

export interface LayoutOptions {
  encoding?: 'flate' | 'jpeg';
}

// ---- text measuring helpers (exported for tests and callers that pre-size things) ----

export function lineHeight(style: TextStyle): number {
  return TEXT_STYLES[style].size * LINE_FACTOR;
}

/** Greedy word wrap into lines no wider than `width`; words longer than a line are broken by character. '\n' forces a break. */
export function wrapText(text: string, width: number, size: number, bold: boolean): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/ +/).filter(w => w.length > 0);
    if (words.length === 0) {
      out.push('');
      continue;
    }
    let line = '';
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (textWidth(candidate, size, bold) <= width) {
        line = candidate;
        continue;
      }
      if (line) out.push(line);
      if (textWidth(word, size, bold) <= width) {
        line = word;
        continue;
      }
      // Hard-break an over-long word.
      let chunk = '';
      for (const ch of word) {
        if (chunk && textWidth(chunk + ch, size, bold) > width) {
          out.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      line = chunk;
    }
    out.push(line);
  }
  return out;
}

/** `text` unchanged if it fits `width`, otherwise shortened with a trailing "…". */
export function truncateText(text: string, width: number, size: number, bold: boolean): string {
  if (textWidth(text, size, bold) <= width) return text;
  const chars = Array.from(text);
  while (chars.length > 0 && textWidth(chars.join('') + ELLIPSIS, size, bold) > width) chars.pop();
  return chars.length > 0 ? chars.join('').trimEnd() + ELLIPSIS : '';
}

// ---- one layout pass ----

interface TextPageBuild {
  kind: 'text';
  w: number;
  h: number;
  items: PdfTextItem[];
  links: {x: number; y: number; w: number; h: number; anchor: string}[];
}

type PageBuild = TextPageBuild | {kind: 'image'; w: number; h: number; layers: string[]};

interface PassResult {
  pages: PageBuild[];
  anchorPages: Record<string, number>;
  placeholders: string[];
}

function runPass(doc: PdfDocument, images: (ResolvedImage | undefined)[], knownAnchors: Record<string, number>): PassResult {
  const {w: pageW, h: pageH} = doc.textPage;
  const contentW = pageW - 2 * MARGIN.side;
  const bottom = pageH - MARGIN.bottom;
  const pages: PageBuild[] = [];
  const anchorPages: Record<string, number> = {};
  const placeholders: string[] = [];
  let page: TextPageBuild | null = null;
  let y = MARGIN.top;

  const setAnchor = (anchor: string | undefined, index: number) => {
    if (anchor && anchorPages[anchor] === undefined) anchorPages[anchor] = index;
  };
  const newTextPage = (): TextPageBuild => {
    const p: TextPageBuild = {kind: 'text', w: pageW, h: pageH, items: [], links: []};
    pages.push(p);
    page = p;
    y = MARGIN.top;
    return p;
  };
  const current = (): TextPageBuild => page ?? newTextPage();
  const atTop = () => y === MARGIN.top;
  /** Makes sure `height` fits on the current page, starting a new one if not. */
  const ensure = (height: number): TextPageBuild => {
    const p = current();
    if (!atTop() && y + height > bottom) return newTextPage();
    return p;
  };
  const emit = (text: string, x: number, style: TextStyle, bold?: boolean) => {
    const s = TEXT_STYLES[style];
    current().items.push({text, x, y, size: s.size, bold: bold ?? s.bold});
  };

  const layoutBlock = (block: PdfBlock) => {
    switch (block.kind) {
      case 'heading': {
        const style = HEADING_STYLE[block.level];
        const s = TEXT_STYLES[style];
        const lh = lineHeight(style);
        const lines = wrapText(block.text, contentW, s.size, s.bold);
        const before = atTop() ? 0 : HEADING_SPACE_BEFORE[block.level];
        // Keep with next: the heading plus one body line must fit.
        ensure(before + lines.length * lh + HEADING_SPACE_AFTER + lineHeight('body'));
        if (!atTop()) y += before;
        setAnchor(block.anchor, pages.length - 1);
        for (const line of lines) {
          emit(line, MARGIN.side, style);
          y += lh;
        }
        y += HEADING_SPACE_AFTER;
        return;
      }
      case 'paragraph': {
        const style = block.style ?? 'body';
        const s = TEXT_STYLES[style];
        const bold = block.bold ?? s.bold;
        const lh = lineHeight(style);
        for (const line of wrapText(block.text, contentW, s.size, bold)) {
          ensure(lh);
          emit(line, MARGIN.side, style, bold);
          y += lh;
        }
        return;
      }
      case 'row': {
        const style = block.style ?? 'body';
        const s = TEXT_STYLES[style];
        const bold = block.bold ?? s.bold;
        const lh = lineHeight(style);
        const p = ensure(lh);
        const left = MARGIN.side + (block.indent ?? 0);
        const rowW = pageW - MARGIN.side - left;
        const cells = block.cells.slice();
        if (block.pageOf !== undefined && cells.length > 0) {
          const target = knownAnchors[block.pageOf];
          cells[cells.length - 1] = target === undefined ? '000' : String(target + 1);
        }
        let x = left;
        cells.forEach((cell, i) => {
          const isLast = i === cells.length - 1;
          const cellW = isLast ? left + rowW - x : rowW * (block.widths[i] ?? 0);
          const gap = isLast ? 0 : 6;
          if (isLast && block.pageOf !== undefined) {
            // Right-aligned page number.
            emit(cell, left + rowW - textWidth(cell, s.size, bold), style, bold);
          } else {
            emit(truncateText(cell, Math.max(0, cellW - gap), s.size, bold), x, style, bold);
          }
          x += cellW;
        });
        if (block.linkTo) p.links.push({x: left, y, w: rowW, h: lh, anchor: block.linkTo});
        y += lh;
        return;
      }
      case 'spacer':
        if (page && !atTop()) y += block.height;
        return;
      case 'pageBreak':
        if (page && !atTop()) newTextPage();
        return;
    }
  };

  doc.parts.forEach((part, index) => {
    if (part.kind === 'text') {
      newTextPage();
      setAnchor(part.anchor, pages.length - 1);
      part.blocks.forEach(layoutBlock);
      return;
    }
    const resolved = images[index];
    if (resolved && resolved.ok) {
      pages.push({kind: 'image', w: resolved.w, h: resolved.h, layers: resolved.layers});
      setAnchor(part.anchor, pages.length - 1);
      page = null;
      return;
    }
    // Placeholder page for an image that could not be rendered.
    placeholders.push(part.label);
    newTextPage();
    setAnchor(part.anchor, pages.length - 1);
    layoutBlock({kind: 'heading', level: 2, text: part.label});
    layoutBlock({kind: 'paragraph', text: `This page could not be rendered: ${resolved ? resolved.reason : 'not rendered'}.`});
    page = null;
  });

  return {pages, anchorPages, placeholders};
}

function sameAnchors(a: Record<string, number>, b: Record<string, number>): boolean {
  const ka = Object.keys(a);
  if (ka.length !== Object.keys(b).length) return false;
  return ka.every(k => a[k] === b[k]);
}

function resolveOutline(entries: PdfOutlineEntry[], anchors: Record<string, number>, missing: Set<string>): PdfOutlineNode[] {
  const out: PdfOutlineNode[] = [];
  for (const e of entries) {
    const page = anchors[e.anchor];
    if (page === undefined) {
      missing.add(e.anchor);
      continue;
    }
    const children = e.children ? resolveOutline(e.children, anchors, missing) : [];
    out.push(children.length > 0 ? {title: e.title, page, children} : {title: e.title, page});
  }
  return out;
}

/**
 * Lays out `doc`. `images[i]` is the resolved image for `doc.parts[i]` when
 * that part is an image (undefined entries for text parts; a missing or
 * failed entry for an image part becomes a placeholder page).
 */
export function layoutDocument(doc: PdfDocument, images: (ResolvedImage | undefined)[], options: LayoutOptions = {}): LayoutResult {
  let known: Record<string, number> = {};
  let pass = runPass(doc, images, known);
  for (let i = 1; i < MAX_PASSES && !sameAnchors(pass.anchorPages, known); i++) {
    known = pass.anchorPages;
    pass = runPass(doc, images, known);
  }
  const anchors = pass.anchorPages;
  const missing = new Set<string>();
  const total = pass.pages.length;

  const pages: PdfPageSpec[] = pass.pages.map((p, index) => {
    if (p.kind === 'image') return p;
    const items = p.items.slice();
    if (doc.pageNumbers) {
      const label = `${index + 1} / ${total}`;
      const s = TEXT_STYLES.small;
      items.push({text: label, x: p.w - MARGIN.side - textWidth(label, s.size), y: p.h - MARGIN.bottom + 18, size: s.size});
    }
    const links: PdfLink[] = [];
    for (const l of p.links) {
      const target = anchors[l.anchor];
      if (target === undefined) missing.add(l.anchor);
      else links.push({x: l.x, y: l.y, w: l.w, h: l.h, page: target});
    }
    return links.length > 0 ? {kind: 'text', w: p.w, h: p.h, items, links} : {kind: 'text', w: p.w, h: p.h, items};
  });

  const outline = resolveOutline(doc.outline, anchors, missing);
  return {
    spec: {title: doc.title, encoding: options.encoding ?? 'flate', pages, outline},
    anchorPages: anchors,
    pageCount: total,
    unresolvedAnchors: Array.from(missing),
    placeholders: pass.placeholders,
  };
}
