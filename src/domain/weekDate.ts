/**
 * Date/week helpers for the Week view (docs/dev/technical-design-weekly-view.md
 * §2) - the ISO-8601 (Monday-start, Thursday-of-the-week-decides-the-year)
 * week-numbering rules, plus the plain "Monday..Sunday of this week"
 * range helper WeekView.tsx needs for its meetings/focus queries. Pure, zero
 * RN/SDK imports (domain/ convention, see markdown.ts/meetingTime.ts) - all
 * wall-clock reads happen through an injectable `now` parameter, same as
 * domain/meetingTime.ts, so this stays testable without mocking global Date.
 *
 * Deliberately its own module rather than folded into meetingTime.ts - week
 * arithmetic (ISO week numbers, Monday-start ranges) is a distinct concern
 * from meetingTime.ts's day-level helpers, and nothing outside the Week
 * view needs it yet.
 */
import {isoDateOffset, todayIso} from './meetingTime';

/** The Monday..Sunday range containing `now`, as YYYY-MM-DD strings (inclusive). Built from isoDateOffset's calendar-field arithmetic, same DST-safety as every other date helper in this codebase. */
export function weekRangeIso(now: Date = new Date()): {start: string; end: string} {
  const isoWeekday = (now.getDay() + 6) % 7; // Mon=0 .. Sun=6
  return {start: isoDateOffset(-isoWeekday, now), end: isoDateOffset(6 - isoWeekday, now)};
}

/** A calendar date `weeks` away from `now` (may be negative) - WeekView.tsx's prev/next navigation. Built from calendar fields (year/month/date + weeks*7), same DST-safety reasoning as isoDateOffset. */
export function shiftWeeks(now: Date, weeks: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + weeks * 7);
}

/** ISO-8601 week number of `now`'s week (Thursday-of-the-week rule: a week belongs to the year containing its Thursday, so the first week of a year is the one containing that year's first Thursday). Standard ISO week algorithm - shift to the week's Thursday, find that Thursday's year, then count whole weeks from that year's own week-1 Monday. */
export function isoWeekOf(now: Date = new Date()): {year: number; week: number} {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayNum = (d.getDay() + 6) % 7; // Mon=0 .. Sun=6
  d.setDate(d.getDate() - dayNum + 3); // Thursday of this week
  const isoYear = d.getFullYear();
  const jan4DayNum = (new Date(isoYear, 0, 4).getDay() + 6) % 7;
  const week1Monday = new Date(isoYear, 0, 4 - jan4DayNum);
  const week = Math.round((d.getTime() - week1Monday.getTime()) / (7 * 86400000)) + 1;
  return {year: isoYear, week};
}

/** "YYYY-Www" key for `now`'s ISO week (e.g. "2026-W37") - the format V2's per-week goal storage keys goals by (docs/dev/technical-design-weekly-view.md §12), and what WeekView.tsx's header displays. Zero-padded to 2 digits, per ISO-8601. */
export function isoWeekKey(now: Date = new Date()): string {
  const {year, week} = isoWeekOf(now);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

/**
 * Whole ISO weeks between two week keys (`b` minus `a` - positive when `b`
 * is later). Added 2026-09-16 (docs/dev/technical-design-review-master-
 * detail.md §4.2) for `ItemGoalRow`'s "(Week NN, N weeks ago)" phrasing -
 * finds each key's own week-1 Monday (same jan4DayNum/week1Monday
 * construction `isoWeekOf` above already uses to go the other direction,
 * year+week -> date), then diffs in whole weeks. Pure, no wall-clock read -
 * every caller passes both keys explicitly, same testability reasoning as
 * every other helper in this file.
 */
export function weeksBetween(a: string, b: string): number {
  const mondayOf = (key: string): number => {
    const [yearStr, weekStr] = key.split('-W');
    const year = parseInt(yearStr, 10);
    const week = parseInt(weekStr, 10);
    const jan4DayNum = (new Date(year, 0, 4).getDay() + 6) % 7;
    const week1Monday = new Date(year, 0, 4 - jan4DayNum);
    return new Date(
      week1Monday.getFullYear(),
      week1Monday.getMonth(),
      week1Monday.getDate() + (week - 1) * 7,
    ).getTime();
  };
  return Math.round((mondayOf(b) - mondayOf(a)) / (7 * 86400000));
}

// Re-exported for convenience so callers that only need "today, as a week
// key" don't have to import meetingTime.ts separately just for todayIso.
export {todayIso};
