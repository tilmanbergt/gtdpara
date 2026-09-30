/**
 * Parses the small markdown subset used by CHANGELOG.md and the user docs
 * into blocks the app can render and page (ui/MarkdownBlocks.tsx;
 * docs/dev/technical-design-about-debug-experimental.md §3.5).
 *
 * Supported: `#`-`######` headings, `-`/`*`/`1.` list items (one nesting
 * level; wrapped continuation lines join the item), paragraphs,
 * `> quotes` (rendered as paragraphs), inline `**bold**`, `` `code` `` and
 * `[text](url)` (shown as text), and fenced code blocks (lines between
 * two ``` fences, kept verbatim; long ones are split into chunks of
 * CODE_CHUNK_LINES so a pager can place them). Anything else is shown as
 * plain text.
 * Pure; no RN imports.
 */

export type InlineSpan = {text: string; bold?: boolean; code?: boolean};

export type MarkdownBlock =
  | {kind: 'heading'; level: number; spans: InlineSpan[]}
  | {kind: 'item'; depth: number; marker: string; spans: InlineSpan[]}
  | {kind: 'paragraph'; spans: InlineSpan[]}
  | {kind: 'code'; lines: string[]};

/** Longest code block kept together; longer ones continue in the next block. */
export const CODE_CHUNK_LINES = 14;
const FENCE = /^\s*```/;

const HEADING = /^(#{1,6})\s+(.*)$/;
const ITEM = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;

/** Splits one line of text into bold / code / plain spans; links become their text. */
export function parseInline(text: string): InlineSpan[] {
  const withoutLinks = text.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '$1');
  const spans: InlineSpan[] = [];
  const re = /(\*\*([^*]+)\*\*|`([^`]+)`)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(withoutLinks)) !== null) {
    if (m.index > last) {spans.push({text: withoutLinks.slice(last, m.index)});}
    if (m[2] !== undefined) {spans.push({text: m[2], bold: true});}
    else {spans.push({text: m[3], code: true});}
    last = m.index + m[0].length;
  }
  if (last < withoutLinks.length) {spans.push({text: withoutLinks.slice(last)});}
  return spans.length > 0 ? spans : [{text: ''}];
}

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  // The block being assembled from several lines (item or paragraph).
  let open: {kind: 'item'; depth: number; marker: string; text: string} | {kind: 'paragraph'; text: string} | null = null;

  const close = () => {
    if (!open) {return;}
    const spans = parseInline(open.text.trim());
    blocks.push(open.kind === 'item' ? {kind: 'item', depth: open.depth, marker: open.marker, spans} : {kind: 'paragraph', spans});
    open = null;
  };

  let code: string[] | null = null;
  const closeCode = () => {
    if (!code) {return;}
    for (let i = 0; i < code.length; i += CODE_CHUNK_LINES) {
      blocks.push({kind: 'code', lines: code.slice(i, i + CODE_CHUNK_LINES)});
    }
    code = null;
  };

  for (const rawLine of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.replace(/\s+$/, '');
    if (FENCE.test(line)) {
      if (code) {
        closeCode();
      } else {
        close();
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }
    if (line.trim() === '') {
      close();
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      close();
      blocks.push({kind: 'heading', level: heading[1].length, spans: parseInline(heading[2])});
      continue;
    }
    const item = ITEM.exec(line);
    if (item) {
      close();
      const indent = item[1].replace(/\t/g, '    ').length;
      const marker = /^\d/.test(item[2]) ? item[2] : '•';
      open = {kind: 'item', depth: indent >= 2 ? 1 : 0, marker, text: item[3]};
      continue;
    }
    const text = line.trim().replace(/^>\s?/, '');
    if (open) {
      open.text += ' ' + text; // wrapped continuation of the item/paragraph
    } else {
      open = {kind: 'paragraph', text};
    }
  }
  close();
  closeCode(); // an unclosed fence runs to the end
  return blocks;
}

/** Plain text of a block (for line-count estimates and tests). */
export function blockText(block: MarkdownBlock): string {
  return block.kind === 'code' ? block.lines.join('\n') : block.spans.map(s => s.text).join('');
}
