/**
 * Lifecycle dates of a Project/Area - `doneAt` and `archivedAt`
 * (docs/dev/history/technical-design-project-close-out.md §4.1) - kept as plain
 * `key: YYYY-MM-DD` lines in the frontmatter block.
 *
 * They deliberately live in FrontMatterFields' `extraLines` (the verbatim
 * pass-through every frontmatter save already carries - domain/markdown.ts)
 * instead of becoming two more first-class fields: that would have meant
 * threading them through ProjectFileState, CachedItem, frontMatterOf,
 * updateItemFrontMatter and three screens' local snapshots, for values only
 * status changes and the close-out ever read or write. This module is the
 * one typed accessor; nothing else should parse these lines by hand.
 */

export type LifecycleDateKey = 'doneAt' | 'archivedAt';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function keyRe(key: LifecycleDateKey): RegExp {
  return new RegExp(`^\\s*${key}:\\s*(.*)$`);
}

/** The date stored under `key`, or null if absent or not a YYYY-MM-DD value. */
export function readLifecycleDate(extraLines: string[], key: LifecycleDateKey): string | null {
  const re = keyRe(key);
  for (const line of extraLines) {
    const m = re.exec(line);
    if (m) {
      const value = m[1].trim();
      return DATE_RE.test(value) ? value : null;
    }
  }
  return null;
}

/** `extraLines` with `key` set to `date` (replacing an existing line in place), or removed when `date` is null. */
export function writeLifecycleDate(extraLines: string[], key: LifecycleDateKey, date: string | null): string[] {
  const re = keyRe(key);
  const index = extraLines.findIndex(line => re.test(line));
  if (date === null) return index === -1 ? extraLines : extraLines.filter((_, i) => i !== index);
  const line = `${key}: ${date}`;
  if (index === -1) return [...extraLines, line];
  return extraLines.map((l, i) => (i === index ? line : l));
}

/** Local calendar date as YYYY-MM-DD (the same convention domain/weekDate.ts uses for "today"). */
export function isoDate(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
