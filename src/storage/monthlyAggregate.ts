/**
 * Cross-project aggregation for the Month view (docs/dev/technical-design-
 * monthly-view.md §4.4) - the monthly counterpart of storage/weeklyAggregate.ts,
 * same "pure, synchronous transform over the already-warm cache" pattern.
 *
 * - `days`: one entry per calendar day of the month, each with the Month
 *   highlights (`#monthly` meetings) covering that day. A multi-day
 *   date-only meeting (`3d`) covers every one of its days, including ones
 *   that spill in from a meeting starting before the month (up to
 *   MAX_MEETING_DAYS back) - `part` says where in its run a day sits.
 * - `focusCards` / `historicalGoals`: the shared period helpers
 *   (storage/periodFocusCards.ts, storage/periodGoals.ts), monthly scope.
 * - `meetingsOnDay`: EVERY meeting (highlighted or not) covering one date -
 *   the Month view's day panel, where highlights are picked.
 */
import {entriesInRange, SpanPart, spanDayOn, spanScanStart} from '../domain/meetingSpan';
import {meetingTimestampMs} from '../domain/meetingTime';
import {isHighlight, monthLabel} from '../domain/monthHighlight';
import {addDaysIso, isoWeekNumberOf, Period} from '../domain/period';
import {CachedItem} from './dataCache';
import {DailyInboxInput, DailyItemRef, inboxItemRef} from './dailyAggregate';
import {buildPeriodFocusCards, PeriodFocusCardData} from './periodFocusCards';
import {findGoalsForPeriod, GoalHistoryEntry} from './periodGoals';
import {WeeklyMeetingEntry} from './weeklyAggregate';
import {perfTime} from '../utils/perf';

export type {SpanPart} from '../domain/meetingSpan';

export interface MonthDayEntry {
  entry: WeeklyMeetingEntry;
  /** Short form or tag-stripped title (domain/monthHighlight.ts's monthLabel). */
  label: string;
  part: SpanPart;
  /** 1-based position within a multi-day run, and the run length - "2/3" in the day panel. */
  dayNumber: number;
  dayCount: number;
}

export interface MonthDay {
  /** YYYY-MM-DD */
  date: string;
  /** Mon=0 .. Sun=6 */
  weekday: number;
  /** ISO week number, set on Mondays only (the Month view's week rule label). */
  isoWeek: number | null;
  highlights: MonthDayEntry[];
}

export interface MonthlyAggregate {
  days: MonthDay[];
  /** Distinct highlighted meetings touching the month (a 3-day one counts once). */
  highlightCount: number;
  focusCards: PeriodFocusCardData[];
  historicalGoals: GoalHistoryEntry[];
}

function itemRefOf(cachedItem: CachedItem): DailyItemRef {
  return {
    kind: cachedItem.kind,
    name: cachedItem.name,
    path: cachedItem.path,
    dailyFocus: cachedItem.dailyFocus,
    weeklyFocus: cachedItem.weeklyFocus,
    monthlyFocus: cachedItem.monthlyFocus,
    abbrev: cachedItem.abbrev,
  };
}

/** Every not-cancelled meeting from every item plus Inbox, with its source ref. */
function allMeetingEntries(items: CachedItem[], inbox: DailyInboxInput | null, basePath: string): WeeklyMeetingEntry[] {
  const out: WeeklyMeetingEntry[] = [];
  for (const cachedItem of items) {
    if (cachedItem.loadError) continue;
    const item = itemRefOf(cachedItem);
    cachedItem.meetings.forEach((meeting, meetingIndex) => {
      if (!meeting.cancelled) out.push({item, meetingIndex, meeting});
    });
  }
  if (inbox) {
    const item = inboxItemRef(basePath);
    inbox.meetings.forEach((meeting, meetingIndex) => {
      if (!meeting.cancelled) out.push({item, meetingIndex, meeting});
    });
  }
  return out;
}

/** Timed meetings first by time, then date-only ones - the order a day's row and panel list use. */
function byDayOrder(a: WeeklyMeetingEntry, b: WeeklyMeetingEntry): number {
  const at = a.meeting.time ? 0 : 1;
  const bt = b.meeting.time ? 0 : 1;
  if (at !== bt) return at - bt;
  return meetingTimestampMs(a.meeting) - meetingTimestampMs(b.meeting);
}

function buildMonthlyAggregateImpl(
  items: CachedItem[],
  inbox: DailyInboxInput | null,
  basePath: string,
  period: Period,
  today: Date = new Date(),
): MonthlyAggregate {
  // Candidates: highlights that start inside the month, or up to
  // MAX_MEETING_DAYS before it (a long run spilling into the month).
  const earliest = spanScanStart(period.start);
  const highlights = allMeetingEntries(items, inbox, basePath).filter(
    e => isHighlight(e.meeting) && e.meeting.date >= earliest && e.meeting.date <= period.end,
  );

  const days: MonthDay[] = [];
  const touched = new Set<WeeklyMeetingEntry>();
  for (let date = period.start; date <= period.end; date = addDaysIso(date, 1)) {
    const [y, m, d] = date.split('-').map(Number);
    const weekday = (new Date(y, m - 1, d).getDay() + 6) % 7;
    const dayEntries: MonthDayEntry[] = [];
    for (const e of highlights) {
      const span = spanDayOn(e.meeting, date);
      if (!span) continue;
      touched.add(e);
      dayEntries.push({entry: e, label: monthLabel(e.meeting), part: span.part, dayNumber: span.dayNumber, dayCount: span.dayCount});
    }
    dayEntries.sort((a, b) => byDayOrder(a.entry, b.entry));
    days.push({date, weekday, isoWeek: weekday === 0 ? isoWeekNumberOf(date) : null, highlights: dayEntries});
  }

  return {
    days,
    highlightCount: touched.size,
    focusCards: buildPeriodFocusCards(items, period, today),
    historicalGoals: findGoalsForPeriod(items, 'monthly', period.key),
  };
}

/**
 * Every not-cancelled meeting (highlighted or not) covering `date` - the day
 * panel's list (ui/DayMeetingsPanel.tsx), in day order. A multi-day meeting
 * carries its `span` for that day (domain/meetingSpan.ts's entriesInRange),
 * the same entry shape the Week and Daily lists use.
 */
function meetingsOnDayImpl(
  items: CachedItem[],
  inbox: DailyInboxInput | null,
  basePath: string,
  date: string,
): WeeklyMeetingEntry[] {
  const earliest = spanScanStart(date);
  const out: WeeklyMeetingEntry[] = [];
  for (const e of allMeetingEntries(items, inbox, basePath)) {
    if (e.meeting.date < earliest || e.meeting.date > date) continue;
    out.push(...entriesInRange(e, date, date));
  }
  return out.sort(byDayOrder);
}

/** Perf-traced entry point (docs/dev/technical-design-perf-tracing.md) - see buildMonthlyAggregateImpl above for the actual logic. */
export function buildMonthlyAggregate(...args: Parameters<typeof buildMonthlyAggregateImpl>): ReturnType<typeof buildMonthlyAggregateImpl> {
  return perfTime('agg:monthly', () => buildMonthlyAggregateImpl(...args));
}

/** Perf-traced entry point (docs/dev/technical-design-perf-tracing.md) - see meetingsOnDayImpl above for the actual logic. */
export function meetingsOnDay(...args: Parameters<typeof meetingsOnDayImpl>): ReturnType<typeof meetingsOnDayImpl> {
  return perfTime('agg:meetingsOnDay', () => meetingsOnDayImpl(...args));
}
