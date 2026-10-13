/**
 * Page order in a notebook or loop note
 * (docs/dev/history/technical-design-note-setups.md §13): where a new page
 * for a meeting or todo goes. The one place that computes a page position;
 * storage/sharedNotePages.ts's `insertItemPage` reads the keywords and
 * inserts. Pure.
 *
 * A file's pages are read as items: a page that starts an item (it has a
 * date) and the pages after it without one, which the user added to that
 * item. A new page goes before the next page that starts an item, never
 * between an item's pages. Only one order exists (Timeline); another one
 * would be a second function over the same `PageMark`s.
 */
import {LOOP_PAGE_KEYWORD_PREFIX} from './loops';
import {isBareDateKeyword} from './noteFindability';
import {PageKeyword, parseKeywordLeadingDate} from './sharedNotePages';

/** One page as the order sees it: the start of an item (with its date) or a continuation page. */
export interface PageMark {
  /** YYYY-MM-DD when the page starts an item; null for a continuation page. */
  startDate: string | null;
  /** A loop note's first page (keyword `loop <kind>/<name>`): always stays first. */
  pinned: boolean;
}

/**
 * The marks of a file's pages from its keywords and page count. A page starts
 * an item when it has a bare date keyword (every page gtdpara fills gets
 * one) or, on pages from before 0.13, an anchor keyword starting with a date
 * (a meeting's). Every other page is a continuation page.
 */
export function pageMarks(keywords: readonly PageKeyword[], totalPages: number): PageMark[] {
  const marks: PageMark[] = Array.from({length: Math.max(0, totalPages)}, () => ({startDate: null, pinned: false}));
  const anchorDates: Array<string | null> = marks.map(() => null);
  for (const {page, keyword} of keywords) {
    const mark = marks[page];
    if (!mark) continue;
    if (keyword.startsWith(LOOP_PAGE_KEYWORD_PREFIX)) mark.pinned = true;
    if (isBareDateKeyword(keyword)) mark.startDate ??= keyword;
    else anchorDates[page] ??= parseKeywordLeadingDate(keyword);
  }
  marks.forEach((mark, page) => {
    mark.startDate ??= anchorDates[page];
  });
  return marks;
}

/**
 * Timeline: the index to insert a page dated `date` at - before the first
 * page that starts an item dated later than `date`; after all items of the
 * same date (stable); never before a pinned page; at the end when none.
 */
export function timelineInsertIndex(marks: readonly PageMark[], date: string): number {
  let from = 0;
  marks.forEach((mark, page) => {
    if (mark.pinned) from = page + 1;
  });
  for (let page = from; page < marks.length; page++) {
    const start = marks[page].startDate;
    if (start !== null && start > date) return page;
  }
  return marks.length;
}
