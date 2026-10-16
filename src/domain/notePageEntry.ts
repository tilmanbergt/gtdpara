/**
 * Which todo or meeting a note page belongs to - the pure part
 * (docs/dev/history/technical-design-engage.md §3.4, first written for
 * meetings in docs/dev/history/technical-design-tending-threads.md §3.4).
 *
 * A page is an entry's when the note is the entry's own note, when the entry
 * links exactly that page (`<note>#page=N`), or when the note is a shared
 * notebook and the page carries the entry's keyword. Only the last case needs
 * the device (storage/notePageEntry.ts reads that one page's keywords); this
 * module says what the files alone tell. Pure.
 */
import {joinNotePath, meetingPageKeyword, parsePageAnchor, parseSharedNoteAnchor, todoPageKeyword} from './sharedNotePages';
import {Meeting, Task} from './types';

export type PageEntryKind = 'task' | 'meeting';

/** One item's lists as the lookup reads them; `ref` is passed through to the result. */
export interface PageEntrySource<R extends {path: string}> {
  ref: R;
  tasks: readonly Task[];
  meetings: readonly Meeting[];
}

export type PageEntry<R> =
  | {kind: 'task'; item: R; taskIndex: number; task: Task}
  | {kind: 'meeting'; item: R; meetingIndex: number; meeting: Meeting};

/** What the files alone say about a page: a direct match, or entries whose shared page may be it. */
export interface NotePageCandidates<R> {
  direct: PageEntry<R> | null;
  shared: Array<PageEntry<R> & {keyword: string}>;
}

export const ALL_PAGE_ENTRY_KINDS: readonly PageEntryKind[] = ['meeting', 'task'];

/** The keyword `openOrCreate…Note` puts on the entry's page in a shared notebook. */
export function pageEntryKeyword(entry: PageEntry<unknown>): string {
  return entry.kind === 'task' ? todoPageKeyword(entry.task) : meetingPageKeyword(entry.meeting);
}

/**
 * Own notes and page links of the entries of `kinds` (meetings before todos,
 * cancelled ones left out), plus the shared-page candidates. A literal own
 * note wins over a page link (an own note named with `#` reads like an
 * anchor, so the literal path is checked first).
 */
export function notePageCandidates<R extends {path: string}>(
  absPath: string,
  page: number | null,
  sources: ReadonlyArray<PageEntrySource<R>>,
  kinds: readonly PageEntryKind[] = ALL_PAGE_ENTRY_KINDS,
): NotePageCandidates<R> {
  let pageLink: PageEntry<R> | null = null;
  const shared: NotePageCandidates<R>['shared'] = [];
  for (const source of sources) {
    const entries: Array<{entry: PageEntry<R>; notePath: string}> = [];
    if (kinds.includes('meeting')) {
      source.meetings.forEach((meeting, meetingIndex) => {
        if (!meeting.cancelled && meeting.notePath) entries.push({entry: {kind: 'meeting', item: source.ref, meetingIndex, meeting}, notePath: meeting.notePath});
      });
    }
    if (kinds.includes('task')) {
      source.tasks.forEach((task, taskIndex) => {
        if (!task.cancelled && task.notePath) entries.push({entry: {kind: 'task', item: source.ref, taskIndex, task}, notePath: task.notePath});
      });
    }
    for (const {entry, notePath} of entries) {
      const pageAnchor = parsePageAnchor(notePath);
      if (pageAnchor) {
        if (!pageLink && page !== null && pageAnchor.page === page && joinNotePath(source.ref.path, pageAnchor.filePath) === absPath) {
          pageLink = entry;
        }
        continue;
      }
      if (joinNotePath(source.ref.path, notePath) === absPath) return {direct: entry, shared: []};
      const anchor = parseSharedNoteAnchor(notePath);
      if (anchor && joinNotePath(source.ref.path, anchor.filePath) === absPath) shared.push({...entry, keyword: anchor.keyword});
    }
  }
  return {direct: pageLink, shared};
}

/** The first shared candidate whose keyword (as stored, or as it would be written now) is on the page. */
export function sharedPageHit<R>(shared: NotePageCandidates<R>['shared'], keywordsOnPage: readonly string[]): PageEntry<R> | null {
  const hit = shared.find(c => keywordsOnPage.includes(c.keyword) || keywordsOnPage.includes(pageEntryKeyword(c)));
  if (!hit) return null;
  return hit.kind === 'task'
    ? {kind: 'task', item: hit.item, taskIndex: hit.taskIndex, task: hit.task}
    : {kind: 'meeting', item: hit.item, meetingIndex: hit.meetingIndex, meeting: hit.meeting};
}
