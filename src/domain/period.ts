/**
 * Week/month "planning period" arithmetic in one place (docs/dev/technical-design-
 * monthly-view.md §3.1) - the Week view and the Month view ask the same
 * questions of their period (which key, which date range, can its focus/goals
 * be edited right now, how far apart are two keys, what's its label), so
 * both go through this module instead of each screen re-deriving them.
 * Week-level arithmetic still lives in domain/weekDate.ts (ISO-8601 rules),
 * this module builds on it. Pure, zero RN/SDK imports (domain/ convention) -
 * every wall-clock read goes through an explicit `now`/`today` parameter.
 */
import {isoDateOffset, todayIso} from './meetingTime';
import {isoWeekKey, isoWeekOf, shiftWeeks, weekRangeIso, weeksBetween} from './weekDate';

export type PeriodScope = 'weekly' | 'monthly';

export interface Period {
  scope: PeriodScope;
  /** "2026-W41" (weekly) or "2026-10" (monthly) - the key goals are stored under. */
  key: string;
  /** Inclusive YYYY-MM-DD bounds. */
  start: string;
  end: string;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "YYYY-MM" of `date`'s local calendar month. */
export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Number of days in `date`'s month (28..31). */
export function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/** First..last day of `date`'s month, as YYYY-MM-DD (inclusive). */
export function monthRangeIso(date: Date): {start: string; end: string} {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return {start: todayIso(first), end: todayIso(last)};
}

/** The period of `scope` containing `now`. */
export function periodOf(scope: PeriodScope, now: Date): Period {
  if (scope === 'weekly') {
    const {start, end} = weekRangeIso(now);
    return {scope, key: isoWeekKey(now), start, end};
  }
  const {start, end} = monthRangeIso(now);
  return {scope, key: monthKeyOf(now), start, end};
}

/**
 * A date `n` periods away from `now` (negative = back) - the ‹ › navigation.
 * Built from calendar fields, same DST-safety reasoning as isoDateOffset.
 * Monthly always lands on the 1st, so shifting from e.g. Jan 31 can never
 * overflow into March.
 */
export function shiftPeriod(scope: PeriodScope, now: Date, n: number): Date {
  if (scope === 'weekly') return shiftWeeks(now, n);
  return new Date(now.getFullYear(), now.getMonth() + n, 1);
}

/**
 * Whether the period `offset` steps from the real current one may have its
 * focus/goals edited, judged against the REAL `today` (not whatever period
 * is displayed):
 * - weekly: the current week, or next week when today is Fri/Sat/Sun
 *   (moved here unchanged from screens/WeekView.tsx's `canEditFocus`).
 * - monthly: the current month, or next month during the last 7 days of
 *   the current one (docs/dev/history/technical-design-monthly-view.md §0.5).
 */
export function canEditPeriod(scope: PeriodScope, offset: number, today: Date = new Date()): boolean {
  if (offset === 0) return true;
  if (offset !== 1) return false;
  if (scope === 'weekly') {
    const weekday = (today.getDay() + 6) % 7; // Mon=0 .. Sun=6
    return weekday >= 4;
  }
  return daysInMonth(today) - today.getDate() < 7;
}

/** Whole periods from key `a` to key `b` (positive when `b` is later). */
export function periodsBetween(scope: PeriodScope, a: string, b: string): number {
  if (scope === 'weekly') return weeksBetween(a, b);
  const [ya, ma] = a.split('-').map(Number);
  const [yb, mb] = b.split('-').map(Number);
  return (yb - ya) * 12 + (mb - ma);
}

/** "Week 41" / "October" - a period key as a short human label. */
export function periodLabel(scope: PeriodScope, key: string): string {
  if (scope === 'weekly') return `Week ${parseInt(key.split('-W')[1], 10)}`;
  return MONTH_NAMES[Number(key.split('-')[1]) - 1] ?? key;
}

/** "Oct" / "W41" - the compact label used on focus cards' secondary-goal line. */
export function periodShortLabel(scope: PeriodScope, key: string): string {
  if (scope === 'weekly') return `W${parseInt(key.split('-W')[1], 10)}`;
  return MONTH_SHORT[Number(key.split('-')[1]) - 1] ?? key;
}

/** "October 2026" - the Month view's header. */
export function monthTitle(date: Date): string {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

/** The month a week "belongs to" - the month containing its Thursday (the same ISO rule that decides a week's year). `weekStart` is the week's Monday, YYYY-MM-DD. */
export function monthOfWeek(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number);
  return monthKeyOf(new Date(y, m - 1, d + 3));
}

/** ISO week number of a YYYY-MM-DD date - the Month view's week rules. */
export function isoWeekNumberOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return isoWeekOf(new Date(y, m - 1, d)).week;
}

/** `iso` shifted by `days` calendar days. */
export function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDateOffset(days, new Date(y, m - 1, d));
}
