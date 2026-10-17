/**
 * The Contents of a home notebook
 * (docs/dev/history/technical-design-home-notebooks.md §3.5): one entry per
 * heading, in page order. Pages gtdpara made are titled from what they belong
 * to - no title lookup: the Home page from the item's name, an item page from
 * its todo or meeting, a loop's page from the loop. Every heading on any
 * other page shows the typed text of the textbox it covers, or "Handwritten
 * heading". Pure: storage/notebookContents.ts reads the note.
 */
import {formatDate} from './dateFormat';
import {HOME_PAGE_KEYWORD} from './homeNotebook';
import {LOOP_PAGE_KEYWORD_PREFIX} from './loops';
import {tagsAsWords} from './markdown';
import {meetingDisplayTitle} from './meetingTracking';
import {meetingPageKeyword, PageKeyword, todoPageKeyword} from './sharedNotePages';
import {Meeting, Task} from './types';

export const HANDWRITTEN_HEADING = 'Handwritten heading';

export type ContentsSource = 'home' | 'meeting' | 'todo' | 'loop' | 'typed' | 'handwritten';

export interface ContentsEntry {
  /** 0-based page. */
  page: number;
  /** Position on the page (a heading's top); 0 for a page gtdpara titles itself. */
  y: number;
  text: string;
  /** A meeting's date, "todo" for a todo's page; '' otherwise. */
  detail: string;
  source: ContentsSource;
}

/** One heading as the note has it; `text` is the covered textbox's typed text, null when there is none (handwriting). */
export interface ContentsTitle {
  page: number;
  y: number;
  text: string | null;
}

/** What the notebook's own item holds, to title its pages. */
export interface ContentsItem {
  name: string;
  tasks: ReadonlyArray<Pick<Task, 'text'>>;
  meetings: ReadonlyArray<Pick<Meeting, 'date' | 'title'>>;
}

/** The entry for a page gtdpara titles itself, from one of its keywords; null when no keyword is gtdpara's. */
function pageEntry(page: number, keyword: string, item: ContentsItem, today: string): ContentsEntry | null {
  if (keyword === HOME_PAGE_KEYWORD) return {page, y: 0, text: item.name, detail: '', source: 'home'};
  if (keyword.startsWith(LOOP_PAGE_KEYWORD_PREFIX)) {
    return {page, y: 0, text: keyword.slice(LOOP_PAGE_KEYWORD_PREFIX.length).replace(/\//g, ' '), detail: '', source: 'loop'};
  }
  const meeting = item.meetings.find(m => meetingPageKeyword(m) === keyword);
  if (meeting) return {page, y: 0, text: tagsAsWords(meetingDisplayTitle(meeting)), detail: formatDate(meeting.date, today), source: 'meeting'};
  const task = item.tasks.find(t => todoPageKeyword(t) === keyword);
  if (task) return {page, y: 0, text: tagsAsWords(todoPageKeyword(task)), detail: 'todo', source: 'todo'};
  return null;
}

/**
 * The pages gtdpara titles itself, with their entry (first gtdpara keyword
 * of the page wins). storage/notebookContents.ts reads the headings' text
 * only on the other pages.
 */
export function gtdparaPages(keywords: readonly PageKeyword[], item: ContentsItem, today: string): Map<number, ContentsEntry> {
  const pages = new Map<number, ContentsEntry>();
  for (const {page, keyword} of keywords) {
    if (pages.has(page)) continue;
    const entry = pageEntry(page, keyword, item, today);
    if (entry) pages.set(page, entry);
  }
  return pages;
}

/** The Contents, sorted by page, then by position on the page. `today` is YYYY-MM-DD (dates of this year without the year). */
export function buildContents(input: {
  keywords: readonly PageKeyword[];
  titles: readonly ContentsTitle[];
  item: ContentsItem;
  today: string;
}): ContentsEntry[] {
  const own = gtdparaPages(input.keywords, input.item, input.today);
  const entries: ContentsEntry[] = [...own.values()];
  for (const title of input.titles) {
    if (own.has(title.page)) continue;
    const text = title.text?.split('\n')[0].trim();
    entries.push(
      text
        ? {page: title.page, y: title.y, text, detail: '', source: 'typed'}
        : {page: title.page, y: title.y, text: HANDWRITTEN_HEADING, detail: '', source: 'handwritten'},
    );
  }
  return entries.sort((a, b) => a.page - b.page || a.y - b.y);
}
