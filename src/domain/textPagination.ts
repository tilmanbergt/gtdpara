/**
 * Splits a long text across fixed-height pages (docs/dev/technical-design-gmail-
 * email-note.md 3.2). Pure: the height measurement is INJECTED, so this file has no
 * RN/SDK imports and is unit-testable with a fake measurer. The algorithm is the
 * one from the sister project NoteDraft/textboxHelper
 * (`paginateTextIntoTextboxPages`): fill a page paragraph by paragraph, and only
 * split a paragraph that cannot fit on a page by itself. Differences: the split
 * order for an oversized paragraph is line -> sentence -> word -> character
 * (email text is line-structured - signatures, quoted `>` blocks - which the
 * sister project's sentence-first split would flatten), and there is a page cap
 * with a truncation notice.
 */

/** Height in px of `text` rendered at the note's text width/font. Must be monotonic: more text never measures shorter. */
export type MeasureHeight = (text: string) => Promise<number>;

export interface PaginateOptions {
  /** Pages hold at most this much height (px). */
  maxHeightPx: number;
  /** Hard cap on the number of pages. */
  maxPages: number;
  /** Appended (as its own paragraph) to the last kept page when the text was cut. */
  truncationNotice: string;
}

export interface TextPage {
  text: string;
  /** Measured height, capped at maxHeightPx. */
  heightPx: number;
}

export interface PaginateResult {
  pages: TextPage[];
  truncated: boolean;
  /** Approximate number of characters that did not make it into the kept pages (0 when not truncated). */
  droppedChars: number;
}

/** CRLF -> LF, trailing spaces per line stripped, runs of blank lines -> one blank line, trimmed. */
export function normalizePageText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[ \t ]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitSentences(line: string): string[] {
  const words = line.split(' ');
  const sentences: string[] = [];
  let current: string[] = [];
  for (const word of words) {
    current.push(word);
    if (/[.!?…]["')\]]*$/.test(word)) {
      sentences.push(current.join(' '));
      current = [];
    }
  }
  if (current.length > 0) sentences.push(current.join(' '));
  return sentences;
}

// Split levels for an oversized paragraph, coarse to fine. Each level says how
// to cut a text into pieces and which separator glues pieces back together.
const LEVELS: {split: (text: string) => string[]; join: string}[] = [
  {split: text => text.split('\n'), join: '\n'},
  {split: splitSentences, join: ' '},
  {split: text => text.split(' '), join: ' '},
];

/** Cuts inside a surrogate pair would corrupt an emoji: move the cut back one unit. */
function safeCut(text: string, index: number): number {
  if (index <= 0 || index >= text.length) return index;
  const code = text.charCodeAt(index - 1);
  return code >= 0xd800 && code <= 0xdbff ? index - 1 : index;
}

export async function paginateText(
  rawText: string,
  measure: MeasureHeight,
  options: PaginateOptions,
): Promise<PaginateResult> {
  const {maxHeightPx, maxPages, truncationNotice} = options;
  const text = normalizePageText(rawText);
  if (text.length === 0) return {pages: [], truncated: false, droppedChars: 0};

  const cache = new Map<string, number>();
  const heightOf = async (candidate: string): Promise<number> => {
    const cached = cache.get(candidate);
    if (cached !== undefined) return cached;
    const height = await measure(candidate);
    cache.set(candidate, height);
    return height;
  };
  const fits = async (candidate: string): Promise<boolean> => (await heightOf(candidate)) <= maxHeightPx;

  // More chunks than this are never needed: anything beyond maxPages + 1 is cut anyway.
  const chunkCap = maxPages + 1;

  /** Longest prefix of `text` that fits (binary search); always at least one character so the caller makes progress. */
  const longestFittingPrefix = async (chunk: string): Promise<number> => {
    let lo = 1;
    let hi = chunk.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (await fits(chunk.slice(0, safeCut(chunk, mid)))) lo = mid;
      else hi = mid - 1;
    }
    return Math.max(1, safeCut(chunk, lo));
  };

  /** Packs an oversized `chunk` into pieces that each fit, splitting at `level` and finer. */
  const pack = async (chunk: string, level: number): Promise<string[]> => {
    if (level >= LEVELS.length) {
      const out: string[] = [];
      let rest = chunk;
      while (rest.length > 0 && out.length < chunkCap) {
        if (await fits(rest)) {
          out.push(rest);
          break;
        }
        const cut = await longestFittingPrefix(rest);
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      return out;
    }
    const {split, join} = LEVELS[level];
    const pieces = split(chunk);
    // Nothing to split at this level (one line / one sentence / one word): go finer.
    if (pieces.length <= 1) return pack(chunk, level + 1);

    const out: string[] = [];
    let buffer = '';
    for (const piece of pieces) {
      if (out.length >= chunkCap) break;
      const candidate = buffer ? `${buffer}${join}${piece}` : piece;
      if (await fits(candidate)) {
        buffer = candidate;
        continue;
      }
      if (buffer) {
        out.push(buffer);
        buffer = '';
      }
      if (await fits(piece)) {
        buffer = piece;
      } else {
        const sub = await pack(piece, level + 1);
        for (let i = 0; i < sub.length - 1; i++) out.push(sub[i]);
        buffer = sub.length > 0 ? sub[sub.length - 1] : '';
      }
    }
    if (buffer) out.push(buffer);
    return out;
  };

  const paragraphs = text.split('\n\n');
  const pages: string[] = [];
  let current = '';
  let cut = false;

  for (const paragraph of paragraphs) {
    // A page beyond the cap has been started: stop measuring, the rest is dropped.
    if (pages.length >= maxPages) {
      cut = true;
      break;
    }
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (await fits(candidate)) {
      current = candidate;
      continue;
    }
    if (current) {
      pages.push(current);
      current = '';
      if (pages.length >= maxPages) {
        cut = true;
        break;
      }
    }
    if (await fits(paragraph)) {
      current = paragraph;
      continue;
    }
    const pieces = await pack(paragraph, 0);
    for (let i = 0; i < pieces.length - 1; i++) pages.push(pieces[i]);
    current = pieces.length > 0 ? pieces[pieces.length - 1] : '';
  }
  if (!cut && current) pages.push(current);
  // A single huge paragraph can overshoot the cap in one go.
  if (pages.length > maxPages) {
    pages.length = maxPages;
    cut = true;
  }

  let droppedChars = 0;
  if (cut && pages.length > 0) {
    const kept = pages.reduce((sum, page) => sum + page.length, 0) + 2 * (pages.length - 1);
    droppedChars = Math.max(0, text.length - kept);
    pages[pages.length - 1] = await withNotice(pages[pages.length - 1], truncationNotice, fits);
  }

  const result: TextPage[] = [];
  for (const page of pages) {
    result.push({text: page, heightPx: Math.min(maxHeightPx, Math.ceil(await heightOf(page)))});
  }
  return {pages: result, truncated: cut, droppedChars};
}

/** Appends `notice` as its own paragraph, removing trailing content (paragraph, then line, then word) until the page still fits. */
async function withNotice(
  pageText: string,
  notice: string,
  fits: (candidate: string) => Promise<boolean>,
): Promise<string> {
  let body = pageText;
  for (;;) {
    const candidate = body ? `${body}\n\n${notice}` : notice;
    if (body === '' || (await fits(candidate))) return candidate;
    const paragraphCut = body.lastIndexOf('\n\n');
    if (paragraphCut > 0) {
      body = body.slice(0, paragraphCut);
      continue;
    }
    const lineCut = body.lastIndexOf('\n');
    if (lineCut > 0) {
      body = body.slice(0, lineCut);
      continue;
    }
    const wordCut = body.lastIndexOf(' ');
    if (wordCut > 0) {
      body = body.slice(0, wordCut);
      continue;
    }
    body = '';
  }
}
