/**
 * Shared Note Pages (docs/dev/technical-design-shared-note-pages.md).
 *
 * Pure domain layer for the "file this Todo/Meeting's note as a PAGE in one
 * shared `.note` per Project/Area, located by keyword" Tag Rule option
 * (`TagRule.noteTarget === 'shared'`, domain/tagRules.ts).
 * Covers everything this feature needs that doesn't touch the device:
 * encoding/decoding the anchor stored in `Task.notePath`/`Meeting.notePath`,
 * deriving a page's keyword from the item it belongs to, and the pure array
 * math behind chronological page insertion. Zero RN/SDK imports (design-
 * overview.md §3) - the actual PluginFileAPI calls (insertNotePage/
 * insertKeyWord/getKeyWords/deleteKeyWord/...) live in the sibling
 * `storage/sharedNotePages.ts` (Slice 2), which calls into this file for
 * every decision that doesn't need the device.
 *
 * Slice 1 of 4 (technical-design-shared-note-pages.md §12) - data model +
 * pure logic only. Nothing here is wired into note creation yet.
 */
import {setFlowStateTag} from './flowState';
import {RESERVED_BARE_TAGS, stripBareTags} from './flowState';
import {setDueTag} from './markdown';
import {meetingDisplayTitle} from './meetingTracking';
import {Meeting, Task} from './types';

/**
 * A shared-target note's anchor: which file, and which keyword locates this
 * item's own page inside it. `filePath` is relative to the item's Project/
 * Area folder, the same convention `createLinkedNote`'s own-note `notePath`
 * already uses (design doc §2.2) - so `filePath` alone, with no anchor, is
 * exactly what an own-note `notePath` already looks like.
 */
export interface SharedNoteAnchor {
  filePath: string;
  keyword: string;
}

/**
 * Page link (docs/dev/technical-design-lasso-0.8.md §3.7): `<note>#page=<n>`,
 * n 1-based - a todo/meeting captured with "Link to this page" opens its
 * source note at that page. Told apart from a shared-note keyword anchor by
 * its exact `page=<digits>` form; parseSharedNoteAnchor never reads it as
 * a keyword.
 */
const PAGE_ANCHOR_RE = /^(.+)#page=(\d+)$/;

export function buildPageAnchor(filePath: string, pageIndex: number): string {
  return `${filePath}#page=${pageIndex + 1}`;
}

/** `{filePath, page}` (page 0-based) for a page link, else null. */
export function parsePageAnchor(notePath: string): {filePath: string; page: number} | null {
  const m = PAGE_ANCHOR_RE.exec(notePath);
  if (!m) return null;
  const page = Number(m[2]) - 1;
  return page >= 0 ? {filePath: m[1], page} : null;
}

/** The note path without a page link's `#page=<n>` (unchanged otherwise). */
export function stripPageAnchor(notePath: string): string {
  return parsePageAnchor(notePath)?.filePath ?? notePath;
}

/**
 * Encodes an anchor into the string stored on `Task.notePath`/
 * `Meeting.notePath` - `"relativePath#keyword"` (design doc §2.2 example:
 * `"Meetings/Daily.note#2026-09-21 Daily"`). No escaping of `#` inside
 * `keyword` - see `parseSharedNoteAnchor`'s doc comment for why that's safe
 * despite that (design doc §10, risk #5 - the risk was real, but not the
 * one originally guessed at; see that comment for what actually happened).
 */
export function buildSharedNoteAnchor(filePath: string, keyword: string): string {
  return `${filePath}#${keyword}`;
}

/**
 * Decodes a stored `notePath` back into `{filePath, keyword}`, or `null`
 * when it isn't a shared-note anchor at all (every own-note `notePath` has
 * no `#`, so this is a cheap, safe check to run unconditionally on any
 * `notePath` - see `resolveNotePath`/`resolveItemNoteAnchor`, both of which
 * do exactly that).
 *
 * Splits on the FIRST `#` ([[bugfix_shared_note_content_missing]], two
 * rounds of the same underlying issue):
 *
 * 1. (2026-09-22) Originally split on the LAST `#`, reasoned to "degrade
 *    gracefully" if a title's own `#` collided with the separator - backwards:
 *    a Tag Rule that matches on `#Daily` normally matches items whose
 *    title/text also carries that exact tag, so a shared-target `keyword`
 *    (built straight from the item's title, §3, deliberately unsanitized so
 *    `#Daily` shows up in the real on-page Supernote keyword) contains `#` on
 *    essentially every real use of this feature, not as a rare edge case.
 *    Splitting on the last `#` found the `#` *inside* `keyword` instead of the
 *    true separator right after `filePath`, corrupting both halves (confirmed
 *    on-device: `"Meetings/Daily.note#2026-09-23 #Daily"` parsed to filePath
 *    `"Meetings/Daily.note#2026-09-23 "` / keyword `"Daily"`). Fixed by
 *    splitting on the first `#` instead - safe as long as `filePath` itself
 *    never contains one.
 * 2. (2026-09-23) That "filePath never contains #" assumption held for a
 *    shared anchor's filePath (built from a Tag Rule's file name) but NOT for
 *    an ordinary OWN-note `notePath`: `todoNoteBaseName`/`meetingNoteBaseName`
 *    (storage/noteLinks.ts) deliberately keep context tags like `#daily` in a
 *    note's file name, so a perfectly normal single-note Todo/Meeting could
 *    have a `#` in its stored `notePath` - and since `resolveNotePath`/
 *    `resolveItemNoteAnchor` run every `notePath` through this function
 *    unconditionally, that `#` got misread as the anchor separator, truncating
 *    the path (confirmed on-device: a Todo titled "...von #demand aufsetzen
 *    #daily" broke the exact same way, despite never being a shared target).
 *    Fixed at the source instead of here: `sanitizeFileNameComponent`
 *    (storage/noteLinks.ts) now strips `#` from every filename it builds -
 *    todo/meeting note names AND (a second, previously-unsanitized gap found
 *    at the same time) a shared rule's file name - so `filePath` is now
 *    actually guaranteed `#`-free on both sides, not just assumed so for one
 *    of them. `keyword` remains deliberately untouched either way.
 */
export function parseSharedNoteAnchor(notePath: string): SharedNoteAnchor | null {
  if (parsePageAnchor(notePath)) return null;
  const separatorIndex = notePath.indexOf('#');
  if (separatorIndex < 0) return null;
  const filePath = notePath.slice(0, separatorIndex);
  const keyword = notePath.slice(separatorIndex + 1);
  if (!filePath || !keyword) return null;
  return {filePath, keyword};
}

/**
 * Joins `itemPath` + a relative note target the same way
 * `storage/noteLinks.ts`'s `resolveNotePath` always has: a target starting
 * with `/` is an absolute path (the lasso "link to source note" case) and
 * used as-is; anything else resolves relative to `itemPath`. Pulled out as
 * its own pure/sync helper (2026-09-23,
 * [[bugfix_shared_note_content_missing]] round 3) so `resolveNotePath`'s
 * now-async, device-checking resolution and `domain/integrityCheck.ts`'s
 * existence-check candidates (which can't do device I/O themselves - this
 * file stays zero-RN/SDK-import, design-overview.md §3) share the exact
 * same joining rule instead of two copies drifting apart.
 */
export function joinNotePath(itemPath: string, target: string): string {
  if (target.startsWith('/')) return target;
  return `${itemPath.replace(/\/+$/, '')}/${target}`;
}

/**
 * A meeting's page keyword: `"YYYY-MM-DD <display title>"` (design doc §3) -
 * date first so `parseKeywordLeadingDate` below can recover it for
 * chronological insertion. `meetingDisplayTitle` (domain/meetingTracking.ts)
 * already strips `#prepped`/`#reviewed` and any other bare state tags, so
 * those never leak into the keyword - same title text `meetingNoteBaseName`
 * (storage/noteLinks.ts) already uses for an own-note file name, just not
 * filename-sanitized (a keyword isn't a filename).
 */
export function meetingPageKeyword(meeting: Pick<Meeting, 'date' | 'title'>): string {
  return `${meeting.date} ${meetingDisplayTitle(meeting)}`.replace(/\s+/g, ' ').trim();
}

/**
 * A todo's page keyword: its text with the plugin's own functional tags
 * stripped (flow-state, `#due:`, and the reserved bare tags `#next`/
 * `#someday`/`#maybe`/`#now`/`#prepped`/`#reviewed`) - free/context tags
 * stay, mirroring `todoNoteBaseName` (storage/noteLinks.ts) exactly except
 * for the filename sanitization step, which doesn't belong on a keyword.
 * Two todos whose text reduces to the same keyword intentionally share one
 * page (design doc §3: "probably they are related anyway").
 */
export function todoPageKeyword(task: Pick<Task, 'text'>): string {
  const withoutDue = setDueTag(task.text, null);
  const withoutFlowState = setFlowStateTag(withoutDue, null); // also covers #waiting-for:<slug>
  return stripBareTags(withoutFlowState, RESERVED_BARE_TAGS);
}

/** Leading `YYYY-MM-DD` of a keyword (meeting keywords always start with one, §3), or `null` for anything else - defensively tolerant of hand-edited/foreign keywords already on a shared file, not just the ones this feature wrote. */
export function parseKeywordLeadingDate(keyword: string): string | null {
  const match = /^(\d{4}-\d{2}-\d{2})\b/.exec(keyword);
  return match ? match[1] : null;
}

/** One raw `{page, keyword}` pair - the shape `PluginFileAPI.getKeyWords`' `KeyWord[]` result reduces to once its own `index` field (irrelevant here) is dropped; several entries can share a `page`. */
export interface PageKeyword {
  page: number;
  keyword: string;
}

/**
 * The page index a NEW keyword's exact match sits at, given every existing
 * keyword already on file - or `null` if there is no exact match. The pure
 * half of `storage/sharedNotePages.ts`'s `findKeywordPage` (design doc §4);
 * the storage wrapper does the `getKeyWords` call and hands its result here.
 */
export function findExactKeywordPage(existingKeywords: PageKeyword[], keyword: string): number | null {
  const hit = existingKeywords.find(kw => kw.keyword === keyword);
  return hit ? hit.page : null;
}

/**
 * Where a NEW dated page should be inserted among `totalPages` existing
 * pages, given every keyword already on file (design doc §4's
 * `insertChronologicalPage`, dated/meeting case). Only the first
 * parseable-date keyword found for each page counts as that page's "date"
 * for ordering; a page can carry several keywords, and pages with no dated
 * keyword at all (foreign content, or a page this feature wrote for an
 * undated todo keyword) are skipped when deciding where the new page goes -
 * never treated as "after" or "before", so they can't force a dated page to
 * the wrong end of the file. Ties (an existing page with the SAME leading
 * date) are inserted after - new same-day pages append within the day
 * rather than jumping ahead of same-day siblings.
 *
 * `newKeyword` with no parseable leading date (shouldn't happen for a
 * meeting keyword this feature builds itself - defensive only) is treated
 * as unorderable and appended at the very end, same as
 * `insertTodoPageIndex` below always does.
 */
export function chronologicalInsertIndex(
  existingKeywords: PageKeyword[],
  totalPages: number,
  newKeyword: string,
): number {
  const newDate = parseKeywordLeadingDate(newKeyword);
  if (newDate === null) return totalPages;

  const firstDateByPage = new Map<number, string>();
  for (const kw of existingKeywords) {
    if (firstDateByPage.has(kw.page)) continue;
    const date = parseKeywordLeadingDate(kw.keyword);
    if (date !== null) firstDateByPage.set(kw.page, date);
  }

  for (let page = 0; page < totalPages; page++) {
    const date = firstDateByPage.get(page);
    if (date !== undefined && date > newDate) return page;
  }
  return totalPages;
}

/** A todo page always appends at the end (design doc §4/§9: todos have no date to order by) - named for symmetry with `chronologicalInsertIndex`, not because it does any real math. */
export function insertTodoPageIndex(totalPages: number): number {
  return totalPages;
}

/**
 * The line written onto a page recreated after its keyword went missing
 * (design doc §7) - one place so the wording can't drift between call
 * sites. `isoDate` is the recreation date (`YYYY-MM-DD`), supplied by the
 * caller rather than computed here (this file takes no dependency on the
 * current time).
 */
export function recreatedPageNoticeText(isoDate: string): string {
  return `Recreated ${isoDate}: page keyword not found`;
}

// ---- Shared file-name placeholders (docs/dev/technical-design-split-by-tag.md §3.3) ----

/** The placeholders a Tag Rule's "Shared file name" understands, in the order the Settings chips show them. */
export const SHARED_FILE_NAME_PLACEHOLDERS: readonly string[] = ['{subtag}', '{year}', '{quarter}', '{month}'];

export interface SharedFileNameInput {
  /** The rule's "Shared file name" (or its rule name when that field is blank) - `resolvedSharedFileName`. */
  template: string;
  /** Fallback when the rendered name comes out empty. */
  ruleName: string;
  /** `ruleSubtag(...)` (domain/tagRules.ts) - `''` when the item has no nested tag under the rule. */
  subtag: string;
  /** `YYYY-MM-DD` - a meeting's own date, today for a todo. */
  date: string;
}

/**
 * Renders a shared file's base name (no folder, no ".note") from the rule's
 * template: `{subtag}` -> the nested-tag part (lowercased), `{year}` -> `2026`,
 * `{quarter}` -> `Q4`, `{month}` -> `10`. Placeholders are matched
 * case-insensitively; any other `{...}` text is left exactly as typed. Runs
 * of whitespace collapse and the ends are trimmed, so a missing subtag
 * doesn't leave a double space (`Coaching {subtag} {year}` -> `Coaching 2026`).
 * An empty result falls back to `ruleName` (e.g. the field is just
 * `{subtag}` and the item has no subtag). Filename sanitizing (illegal
 * characters, `#`, the `/` of a deeper subtag) is the caller's job -
 * storage/noteLinks.ts's `sanitizeFileNameComponent`, as for every other
 * file name.
 */
export function renderSharedFileName(input: SharedFileNameInput): string {
  const match = /^(\d{4})-(\d{2})/.exec(input.date);
  const year = match ? match[1] : '';
  const month = match ? match[2] : '';
  const quarter = match ? `Q${Math.floor((Number(month) - 1) / 3) + 1}` : '';
  const values: Record<string, string> = {subtag: input.subtag, year, quarter, month};
  const rendered = input.template
    .replace(/\{(subtag|year|quarter|month)\}/gi, (_all, key: string) => values[key.toLowerCase()])
    .replace(/\s+/g, ' ')
    .trim();
  return rendered || input.ruleName.trim();
}
