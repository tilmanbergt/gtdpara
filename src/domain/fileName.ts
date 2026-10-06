/**
 * The one rule for file and folder names gtdpara creates (docs/dev/technical-design-cleanup-0.5.md
 * S3a). Pure, no RN/SDK imports.
 *
 * Replaced characters:
 * - `\ / : * ? " < > |` and control characters: not allowed in file names on
 *   the Supernote or on the computers the files sync to.
 * - `#`: reserved by domain/sharedNotePages.ts's anchor encoding
 *   (`"relativePath#keyword"`) to mark where a shared-note anchor's file path
 *   ends - a `#` in an own note's name was misread as that separator (fixed
 *   2026-09-23). It also breaks Obsidian links.
 * - `[ ] ^`: break Obsidian's `[[link]]` targets (`|` is already above), so
 *   files synced into an Obsidian vault stay linkable.
 *
 * Only affects names created from now on; existing files keep theirs.
 */

// eslint-disable-next-line no-control-regex -- control characters are exactly what is not allowed
const INVALID_FILE_NAME_CHAR = /[\\/:*?"<>|#[\]^\u0000-\u001f]/;
const INVALID_FILE_NAME_CHARS = new RegExp(INVALID_FILE_NAME_CHAR.source, 'g');

/**
 * Replaces every character of the rule with a space, collapses whitespace and
 * trims; `fallback` for an empty result.
 */
export function sanitizeFileNameComponent(input: string, fallback = 'Untitled'): string {
  const cleaned = input.replace(INVALID_FILE_NAME_CHARS, ' ').replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : fallback;
}

/** The distinct characters of `input` the rule doesn't allow, in order of appearance (control characters shown as `\uXXXX`). */
export function invalidFileNameChars(input: string): string[] {
  const found: string[] = [];
  for (const ch of input) {
    if (!INVALID_FILE_NAME_CHAR.test(ch)) continue;
    const shown = ch < ' ' ? `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}` : ch;
    if (!found.includes(shown)) found.push(shown);
  }
  return found;
}
