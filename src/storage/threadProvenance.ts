/**
 * Which meeting a note page belongs to - the provenance of todos captured
 * from it (docs/dev/history/technical-design-tending-threads.md §3.4).
 *
 * A capture (lasso) or a processed mark comes from one page of one note. That
 * page is a meeting's when the note is the meeting's own note, when the
 * meeting links exactly that page (`<note>#page=N`), or when the note is a
 * shared note and the page carries the meeting's keyword
 * (`meetingPageKeyword`). Only the last case needs the device: one
 * `getKeyWords` call for that one page, and only when a meeting's shared
 * anchor points into the note at all.
 */
import {Meeting} from '../domain/types';
import {joinNotePath, meetingPageKeyword, parsePageAnchor, parseSharedNoteAnchor} from '../domain/sharedNotePages';
import {getKeyWords} from '../supernote/fileSystem';
import {logError} from '../utils/log';
import {errorMessage} from '../utils/errorMessage';
import {ThreadItemRef, ThreadSource} from './threadAggregate';

export interface NotePageMeeting {
  item: ThreadItemRef;
  meetingIndex: number;
  meeting: Meeting;
}

/** What the files alone say about `absPath`/`page`: a direct match, or meetings whose shared page may be it. */
export interface NotePageCandidates {
  direct: NotePageMeeting | null;
  shared: Array<NotePageMeeting & {keyword: string}>;
}

/** The pure part of `meetingForNotePage`: own notes and page links, plus the shared-page candidates. */
export function notePageCandidates(absPath: string, page: number | null, sources: readonly ThreadSource[]): NotePageCandidates {
  let pageLink: NotePageMeeting | null = null;
  const shared: NotePageCandidates['shared'] = [];
  for (const source of sources) {
    for (let meetingIndex = 0; meetingIndex < source.meetings.length; meetingIndex++) {
      const meeting = source.meetings[meetingIndex];
      if (meeting.cancelled || !meeting.notePath) continue;
      const found = {item: source.ref, meetingIndex, meeting};
      const pageAnchor = parsePageAnchor(meeting.notePath);
      if (pageAnchor) {
        if (!pageLink && page !== null && pageAnchor.page === page && joinNotePath(source.ref.path, pageAnchor.filePath) === absPath) {
          pageLink = found;
        }
        continue;
      }
      // An own note named with `#` reads like an anchor; the literal path is checked first.
      if (joinNotePath(source.ref.path, meeting.notePath) === absPath) return {direct: found, shared: []};
      const anchor = parseSharedNoteAnchor(meeting.notePath);
      if (anchor && joinNotePath(source.ref.path, anchor.filePath) === absPath) shared.push({...found, keyword: anchor.keyword});
    }
  }
  return {direct: pageLink, shared};
}

/**
 * The meeting whose note page `absPath` (0-based `page`) is, or null - see
 * the module doc comment. A failing keyword read is logged and reads as no
 * meeting: provenance is an extra, never a reason to block a capture.
 */
export async function meetingForNotePage(
  absPath: string,
  page: number | null,
  sources: readonly ThreadSource[],
): Promise<NotePageMeeting | null> {
  const {direct, shared} = notePageCandidates(absPath, page, sources);
  if (direct) return direct;
  if (shared.length === 0 || page === null) return null;
  try {
    const keywords = (await getKeyWords(absPath, [page])).filter(kw => kw.page === page).map(kw => kw.keyword);
    const hit = shared.find(c => keywords.includes(c.keyword) || keywords.includes(meetingPageKeyword(c.meeting)));
    return hit ? {item: hit.item, meetingIndex: hit.meetingIndex, meeting: hit.meeting} : null;
  } catch (e) {
    logError('threadProvenance: reading page keywords failed', errorMessage(e));
    return null;
  }
}
