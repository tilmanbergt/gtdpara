/**
 * Which meeting a note page belongs to - the provenance of todos captured
 * from it (docs/dev/history/technical-design-tending-threads.md §3.4).
 *
 * A capture (lasso) or a processed mark comes from one page of one note. That
 * page is a meeting's when the note is the meeting's own note, when the
 * meeting links exactly that page (`<note>#page=N`), or when the note is a
 * shared note and the page carries the meeting's keyword. The lookup itself is
 * storage/notePageEntry.ts's, limited to meetings.
 */
import {Meeting} from '../domain/types';
import {entryForNotePage} from './notePageEntry';
import {ThreadItemRef, ThreadSource} from './threadAggregate';

export interface NotePageMeeting {
  item: ThreadItemRef;
  meetingIndex: number;
  meeting: Meeting;
}

/** The meeting whose note page `absPath` (0-based `page`) is, or null; a failing keyword read reads as none. */
export async function meetingForNotePage(
  absPath: string,
  page: number | null,
  sources: readonly ThreadSource[],
): Promise<NotePageMeeting | null> {
  const hit = await entryForNotePage(absPath, page, sources, ['meeting']);
  return hit?.kind === 'meeting' ? {item: hit.item, meetingIndex: hit.meetingIndex, meeting: hit.meeting} : null;
}
