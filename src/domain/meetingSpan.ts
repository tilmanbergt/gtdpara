/**
 * Multi-day meetings (docs/dev/technical-design-monthly-view.md §2.3). A
 * date-only meeting with `days > 1` covers `date` .. `date + days - 1`;
 * every calendar view (Daily, Week, Month) lists it on each covered day,
 * marked with small arrows for where in the run that day sits. One module
 * so all three views agree. Pure, no RN/SDK imports.
 */
import {isoDateOffset, MAX_MEETING_DAYS} from './meetingTime';
import {Meeting} from './types';

/** Where in a multi-day run a day sits - drives the "Offsite ▸" / "◂ Offsite ▸" / "◂ Offsite" arrows. */
export type SpanPart = 'single' | 'first' | 'middle' | 'last';

/** One covered day of a meeting. */
export interface MeetingSpanDay {
  /** YYYY-MM-DD of this covered day. */
  date: string;
  /** 1-based day within the run, and the run length ("2/3"). */
  dayNumber: number;
  dayCount: number;
  part: SpanPart;
}

/** How far before a range a multi-day meeting may start and still reach into it. */
export const SPAN_LOOKBACK_DAYS = MAX_MEETING_DAYS;

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  return isoDateOffset(days, new Date(y, m - 1, d));
}

/** Days a meeting covers: its `days` for a date-only one (capped), always 1 for a timed one. */
export function spanDays(meeting: Pick<Meeting, 'time' | 'days'>): number {
  return meeting.time ? 1 : Math.max(1, Math.min(MAX_MEETING_DAYS, meeting.days || 1));
}

function partOf(dayNumber: number, dayCount: number): SpanPart {
  if (dayCount === 1) return 'single';
  if (dayNumber === 1) return 'first';
  return dayNumber === dayCount ? 'last' : 'middle';
}

/** Every day of `meeting` that falls inside [start, end] (inclusive, YYYY-MM-DD), in order - empty if none. */
export function coveredDaysIn(
  meeting: Pick<Meeting, 'date' | 'time' | 'days'>,
  start: string,
  end: string,
): MeetingSpanDay[] {
  const count = spanDays(meeting);
  const out: MeetingSpanDay[] = [];
  if (meeting.date > end) return out;
  for (let i = 0; i < count; i++) {
    const date = i === 0 ? meeting.date : addDays(meeting.date, i);
    if (date > end) break;
    if (date >= start) out.push({date, dayNumber: i + 1, dayCount: count, part: partOf(i + 1, count)});
  }
  return out;
}

/** The covered day of `meeting` that is `date`, or null. */
export function spanDayOn(meeting: Pick<Meeting, 'date' | 'time' | 'days'>, date: string): MeetingSpanDay | null {
  return coveredDaysIn(meeting, date, date)[0] ?? null;
}

/** Earliest start date that can still reach `start` - the lower bound a range query must scan from. */
export function spanScanStart(start: string): string {
  return addDays(start, -SPAN_LOOKBACK_DAYS);
}

/** `label` with the run arrows for `part` ("Offsite ▸", "◂ Offsite ▸", "◂ Offsite"). */
export function withSpanArrows(label: string, part: SpanPart | undefined): string {
  if (part === 'first') return `${label} ▸`;
  if (part === 'middle') return `◂ ${label} ▸`;
  if (part === 'last') return `◂ ${label}`;
  return label;
}

/**
 * One list entry per day of `base.meeting` inside [start, end]: the entry
 * itself for an ordinary meeting, or one copy per covered day (with `span`
 * set) for a multi-day one. Used by the Daily and Week aggregates.
 */
export function entriesInRange<T extends {meeting: Pick<Meeting, 'date' | 'time' | 'days'>}>(
  base: T,
  start: string,
  end: string,
): Array<T & {span?: MeetingSpanDay}> {
  const days = coveredDaysIn(base.meeting, start, end);
  if (days.length === 0) return [];
  if (days[0].dayCount === 1) return [base];
  return days.map(span => ({...base, span}));
}

/** The day a list entry belongs to - its covered day for a multi-day meeting, else the meeting's date. */
export function entryDate(entry: {meeting: Pick<Meeting, 'date'>; span?: MeetingSpanDay}): string {
  return entry.span?.date ?? entry.meeting.date;
}

/**
 * How many not-cancelled meetings touch [start, end] (inclusive) - a multi-day
 * meeting that started before `start` but reaches into the range counts, and
 * counts once however many of its days fall inside. The Review hub's
 * "Week ahead" number (storage/reviewAggregate.ts, screens/ReviewScreen.tsx).
 */
export function countMeetingsInRange(
  meetings: ReadonlyArray<Pick<Meeting, 'date' | 'time' | 'days' | 'cancelled'>>,
  start: string,
  end: string,
): number {
  return meetings.filter(m => !m.cancelled && coveredDaysIn(m, start, end).length > 0).length;
}
