/**
 * Pure helper behind the Gmail inbox step's collapsed "not viewable"
 * attachment line: attachments the device can't open are not listed one by
 * one - "+4 .png" instead. See screens/ReviewScreen.tsx's GmailDetailPanel
 * and docs/dev/history/technical-design-gmail-body-select.md §2.4.
 */

/** File extensions longer than this (incl. the dot) are treated as "no real extension" - e.g. "Invoice 2026.final version" must not become a bucket of its own. */
const MAX_EXTENSION_LENGTH = 8;

/** Bucket label for a name with no usable extension. */
export const NO_EXTENSION_LABEL = 'other';

/** The lower-cased extension of `fileName` including its dot (".png"), or NO_EXTENSION_LABEL when there is none (no dot, a leading-dot-only name like ".env", a trailing dot, whitespace inside, or an over-long "extension"). */
export function attachmentExtension(fileName: string): string {
  const name = fileName.trim();
  const dot = name.lastIndexOf('.');
  if (dot <= 0 || dot === name.length - 1) return NO_EXTENSION_LABEL;
  const ext = name.slice(dot).toLowerCase();
  if (ext.length > MAX_EXTENSION_LENGTH || /\s/.test(ext)) return NO_EXTENSION_LABEL;
  return ext;
}

/**
 * "+4 .png, +2 .jpg" - one entry per extension, most frequent first (ties:
 * alphabetical, with NO_EXTENSION_LABEL last), so the summary is stable. ''
 * for an empty list.
 */
export function summarizeAttachmentsByExtension(fileNames: string[]): string {
  const counts = new Map<string, number>();
  for (const name of fileNames) {
    const ext = attachmentExtension(name);
    counts.set(ext, (counts.get(ext) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      if (a[0] === NO_EXTENSION_LABEL) return 1;
      if (b[0] === NO_EXTENSION_LABEL) return -1;
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0;
    })
    .map(([ext, count]) => `+${count} ${ext}`)
    .join(', ');
}
