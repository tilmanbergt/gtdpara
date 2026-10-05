/**
 * Recognized lasso text -> what the capture panel shows
 * (docs/dev/technical-design-lasso-0.8.md §3.5). Pure.
 *
 * - A todo whose text has at least two bullet lines becomes a list of items
 *   (split): bullets stripped, a line without a bullet continues the item
 *   above it, heading lines before the first bullet are put in front of
 *   every item ("Team sync: book room").
 * - Anything else becomes one item: a single leading bullet is stripped and
 *   all whitespace collapses to single spaces. A meeting is always one item.
 */

/**
 * A bullet at the start of a line: dash, bullet dots, boxes and checks (as
 * the recognizer returns them: ☐ U+2610, • U+2022), or a number like
 * `1.`, `1)`, `(1)` followed by a space - so `3.5 hours` is not a bullet.
 */
const BULLET_RE = /^\s*(?:[-–—•·*☐□☑☒✓✔]|\(?\d{1,2}[.)](?=\s))\s*/;

export function hasBullet(line: string): boolean {
  return BULLET_RE.test(line) && line.replace(BULLET_RE, '').trim().length > 0;
}

export function stripBullet(line: string): string {
  return line.replace(BULLET_RE, '').trim();
}

/** All whitespace runs (line breaks included) -> one space, trimmed. */
export function collapseText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** The non-empty lines of `text`, trimmed, whitespace inside collapsed. */
export function splitItems(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map(collapseText)
    .filter(line => line.length > 0);
}

function withHeading(heading: string, item: string): string {
  if (!heading) return item;
  return /[:\-–—]$/.test(heading) ? `${heading} ${item}` : `${heading}: ${item}`;
}

export interface PreparedCaptureText {
  /** One entry per item; exactly one when `split` is false. */
  items: string[];
  split: boolean;
}

export function prepareCaptureText(raw: string, kind: 'todo' | 'meeting'): PreparedCaptureText {
  const lines = raw.split(/\r?\n/).filter(line => line.trim().length > 0);
  const bulletCount = lines.filter(hasBullet).length;
  if (kind === 'todo' && bulletCount >= 2) {
    const headingParts: string[] = [];
    const items: string[] = [];
    for (const line of lines) {
      if (hasBullet(line)) {
        items.push(stripBullet(line));
      } else if (items.length === 0) {
        headingParts.push(collapseText(line));
      } else {
        items[items.length - 1] = `${items[items.length - 1]} ${collapseText(line)}`;
      }
    }
    const heading = collapseText(headingParts.join(' '));
    return {items: items.map(item => withHeading(heading, collapseText(item))), split: true};
  }
  const first = lines.length > 0 && hasBullet(lines[0]) ? [stripBullet(lines[0]), ...lines.slice(1)] : lines;
  return {items: [collapseText(first.join(' '))], split: false};
}

/** Split toggled on by hand: one item per line of the current text (no heading logic). */
export function splitByHand(text: string): string[] {
  const items = splitItems(text);
  return items.length > 0 ? items : [''];
}

/** Split toggled off: the items joined into one. */
export function joinItems(items: string[]): string {
  return collapseText(items.join(' '));
}
