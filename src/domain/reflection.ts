/**
 * The Reflection page of a meeting (docs/dev/history/technical-design-meeting-reflection.md
 * §2.2, R1-R5): one extra page in the meeting's note, right after the meeting's
 * page and the pages added to it by hand. Whether a meeting has one is read from
 * the note itself: a page with a `reflection <date> <title>` keyword among the
 * meeting's continuation pages. Pure.
 *
 * The keyword never starts with a date and the page gets no bare date keyword,
 * so domain/pageOrder.ts reads it as a continuation page of the meeting: a later
 * meeting's page still goes after it, and it stays part of the meeting.
 */
import {fitKeyword} from './keywordLength';
import {meetingAutoUpdateCutoffMs} from './meetingTime';
import {meetingDisplayTitle} from './meetingTracking';
import {PageMark} from './pageOrder';
import {PageKeyword} from './sharedNotePages';
import {Meeting} from './types';

export const REFLECTION_KEYWORD_PREFIX = 'reflection ';

/**
 * `reflection 2026-10-14 Sparring Mieke #sparring/mieke`, fitted to the keyword
 * limit (`fitKeyword` leaves the tags out first). Built from the display title,
 * so state tags (`#prepped`, `#reviewed`, `#monthly`) never appear.
 */
export function reflectionKeyword(meeting: Pick<Meeting, 'date' | 'title'>): string {
  return fitKeyword(`${REFLECTION_KEYWORD_PREFIX}${meeting.date} ${meetingDisplayTitle(meeting)}`.replace(/\s+/g, ' ').trim());
}

/**
 * The reflection keyword a meeting linked under `pageKeyword` (its stored
 * meeting-page keyword, `2026-10-14 Sparring Mieke #sparring/mieke`) had when
 * the reflection was written - what a reflection page still carries after the
 * meeting was renamed and before it was opened again.
 */
export function reflectionKeywordOfPageKeyword(pageKeyword: string): string {
  return fitKeyword(`${REFLECTION_KEYWORD_PREFIX}${pageKeyword}`.replace(/\s+/g, ' ').trim());
}

/** Whether `keyword` is a reflection page's keyword: the prefix, then a date. */
export function isReflectionKeyword(keyword: string): boolean {
  return /^reflection \d{4}-\d{2}-\d{2}(\s|$)/.test(keyword);
}

/**
 * The reflection page among the continuation pages of the item that starts at
 * `itemPage`, or null. Scans `itemPage + 1 …` up to the next page that starts
 * an item or is pinned and returns the first page with a reflection keyword -
 * found by its place and prefix, so it survives a renamed meeting.
 */
export function reflectionPageOf(
  keywords: readonly PageKeyword[],
  marks: readonly PageMark[],
  itemPage: number,
): {page: number; keyword: string} | null {
  for (let page = itemPage + 1; page < marks.length; page++) {
    const mark = marks[page];
    if (mark.startDate !== null || mark.pinned) return null;
    const hit = keywords.find(k => k.page === page && isReflectionKeyword(k.keyword));
    if (hit) return {page, keyword: hit.keyword};
  }
  return null;
}

/** Whether a reflection is offered for `meeting` (R2): it is over and not cancelled. */
export function reflectionOffered(meeting: Pick<Meeting, 'date' | 'time' | 'cancelled'> & Partial<Pick<Meeting, 'endTime' | 'days'>>, nowMs: number): boolean {
  return !meeting.cancelled && nowMs > meetingAutoUpdateCutoffMs(meeting);
}

/** The label of a Reflect button outside the toolbar (R8): "Reflection ›" once the page exists, else "Reflect ›". */
export function reflectionPillText(state: 'unknown' | 'none' | 'exists'): 'Reflect ›' | 'Reflection ›' {
  return state === 'exists' ? 'Reflection ›' : 'Reflect ›';
}

/** Engage's quiet line on a meeting's page once it is over (R9). */
export const REFLECT_ON_MEETING_TEXT = 'Reflect on this meeting ›';
