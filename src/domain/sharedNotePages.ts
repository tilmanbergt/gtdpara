/**
 * Shared Note Pages (docs/dev/history/technical-design-shared-note-pages.md).
 *
 * Pure domain layer for the "file this Todo/Meeting's note as a PAGE in one
 * shared `.note` per Project/Area, located by keyword" mechanism behind a
 * Note setup's notebook and the loop note (domain/noteSetups.ts).
 * Covers everything this feature needs that doesn't touch the device:
 * encoding/decoding the anchor stored in `Task.notePath`/`Meeting.notePath`,
 * deriving a page's keyword from the item it belongs to (where a new page
 * goes is domain/pageOrder.ts). Zero RN/SDK imports (design-
 * overview.md §3) - the actual PluginFileAPI calls (insertNotePage/
 * insertKeyWord/getKeyWords/deleteKeyWord/...) live in the sibling
 * `storage/sharedNotePages.ts`, which calls into this file for
 * every decision that doesn't need the device.
 */
import {setFlowStateTag} from './flowState';
import {RESERVED_BARE_TAGS, stripBareTags} from './flowState';
import {setDueInLine} from './markdown';
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
 * Page link (docs/dev/history/technical-design-lasso-0.8.md §3.7): `<note>#page=<n>`,
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
 * (design doc §10, risk #5).
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
 * Splits on the FIRST `#`. A shared-target `keyword` is built straight from
 * the item's title (§3), deliberately unsanitized so a tag like `#Daily`
 * shows up in the on-page Supernote keyword - so the keyword contains `#` on
 * nearly every real use (e.g. `"Meetings/Daily.note#2026-09-23 #Daily"`).
 * Splitting on the last `#` would cut inside the keyword and corrupt both
 * halves.
 *
 * This relies on `filePath` never containing `#`:
 * `sanitizeFileNameComponent` (storage/noteLinks.ts) strips `#` from every
 * file name it builds - own todo/meeting note names (which would otherwise
 * keep context tags like `#daily`) and a notebook's file name alike.
 * `keyword` stays untouched.
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
 * `storage/noteLinks.ts`'s `resolveNotePath` does: a target starting
 * with `/` is an absolute path (the lasso "link to source note" case) and
 * used as-is; anything else resolves relative to `itemPath`. A pure/sync
 * helper so `resolveNotePath`'s async, device-checking resolution and
 * `domain/integrityCheck.ts`'s existence-check candidates (which can't do
 * device I/O themselves - this file stays zero-RN/SDK-import,
 * design-overview.md §3) share one joining rule.
 */
export function joinNotePath(itemPath: string, target: string): string {
  if (target.startsWith('/')) return target;
  return `${itemPath.replace(/\/+$/, '')}/${target}`;
}

/**
 * A meeting's page keyword: `"YYYY-MM-DD <display title>"` (design doc §3) -
 * date first so `parseKeywordLeadingDate` below can recover it (the page
 * order reads it on pages from before 0.13, domain/pageOrder.ts). `meetingDisplayTitle` (domain/meetingTracking.ts)
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
  const withoutDue = setDueInLine(task.text, null);
  const withoutFlowState = setFlowStateTag(withoutDue, null); // also covers #wf/<slug> and #waiting-for:<slug>
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
 * The line written onto a page recreated after its keyword went missing
 * (design doc §7) - one place so the wording can't drift between call
 * sites. `isoDate` is the recreation date (`YYYY-MM-DD`), supplied by the
 * caller rather than computed here (this file takes no dependency on the
 * current time).
 */
export function recreatedPageNoticeText(isoDate: string): string {
  return `Recreated ${isoDate}: page keyword not found`;
}

// ---- Shared file-name placeholders (docs/dev/history/technical-design-split-by-tag.md §3.3) ----

/** The placeholders a notebook name understands, in the order the Settings chips show them. */
export const SHARED_FILE_NAME_PLACEHOLDERS: readonly string[] = ['{tag}', '{subtag}', '{year}', '{quarter}', '{month}', '{day}'];

export interface SharedFileNameInput {
  /** The notebook name (or the setup name when that field is blank). */
  template: string;
  /** Fallback when the rendered name comes out empty (the setup name). */
  fallbackName: string;
  /** `setupTypeTag(...)` (domain/noteSetups.ts) - the setup tag the item matched; `''` when none. */
  tag?: string;
  /** `setupSubtag(...)` (domain/noteSetups.ts) - `''` when the item has no nested tag under the setup's tags. */
  subtag: string;
  /** `YYYY-MM-DD` - a meeting's own date, today for a todo, a loop's main date; `''` when there is none. */
  date: string;
}

/** A run of date placeholders joined by `-`, `.` or `_`, with one such separator before it. */
const DATE_PLACEHOLDER_RUN = /[-._]?\{(?:year|quarter|month|day)\}(?:[-._]\{(?:year|quarter|month|day)\})*/gi;

/**
 * Renders a shared file's base name (no folder, no ".note") from the
 * notebook name: `{tag}` -> the setup tag the item matched, `{subtag}` -> the
 * nested-tag part (both lowercased), `{year}` -> `2026`,
 * `{quarter}` -> `Q4`, `{month}` -> `10`, `{day}` -> `07`. Without a date
 * the date placeholders are left out together with the `-`, `.` or `_`
 * joining them (`{year}-{month} {tag}` -> `{tag}`). Placeholders are matched
 * case-insensitively; any other `{...}` text is left exactly as typed. Runs
 * of whitespace collapse and the ends are trimmed, so a missing subtag
 * doesn't leave a double space (`Coaching {subtag} {year}` -> `Coaching 2026`).
 * An empty result falls back to `fallbackName` (e.g. the field is just
 * `{subtag}` and the item has no subtag). Filename sanitizing (illegal
 * characters, `#`, the `/` of a deeper subtag) is the caller's job -
 * storage/noteLinks.ts's `sanitizeFileNameComponent`, as for every other
 * file name.
 */
export function renderSharedFileName(input: SharedFileNameInput): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(input.date);
  const year = match ? match[1] : '';
  const month = match ? match[2] : '';
  const day = match ? match[3] : '';
  const quarter = match ? `Q${Math.floor((Number(month) - 1) / 3) + 1}` : '';
  const values: Record<string, string> = {tag: input.tag ?? '', subtag: input.subtag, year, quarter, month, day};
  const template = match ? input.template : input.template.replace(DATE_PLACEHOLDER_RUN, '');
  const rendered = template
    .replace(/\{(tag|subtag|year|quarter|month|day)\}/gi, (_all, key: string) => values[key.toLowerCase()])
    .replace(/\s+/g, ' ')
    .trim();
  return rendered || input.fallbackName.trim();
}
