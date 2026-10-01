/**
 * Cross-project aggregation for the Week view (docs/dev/technical-design-weekly-
 * view.md §3) - the weekly counterpart of storage/dailyAggregate.ts, same
 * "pure, synchronous transform over the already-warm storage/dataCache.ts
 * cache" pattern (no filesystem I/O here at all).
 *
 * Two independent pieces, both scoped to an explicit [weekStart, weekEnd]
 * date range (inclusive, YYYY-MM-DD) rather than "today" - the Week view
 * navigates to arbitrary weeks, so unlike buildDailyAggregate this never
 * defaults its range from `new Date()`:
 *
 * - `meetings` - every not-cancelled meeting (across every Project/Area plus
 *   Inbox) dated within the range, soonest first. Reuses
 *   storage/dailyAggregate.ts's `DailyItemRef`/`inboxItemRef` for the
 *   "source item" shape (WeekView.tsx's WeeklyMeetingsColumn wants the exact
 *   same source-subtext/jump-to-item behavior DailyView's Calendar column
 *   already has - no reason to reinvent that shape).
 * - `focusCards` - one entry per currently *weekly*-focused Project/Area
 *   (storage/focusSlots.ts's `weeklyFocus` flag), carrying just the counts
 *   ui/WeeklyFocusPanel.tsx's WeeklyFocusCard needs: open #next tasks, open
 *   #someday tasks (chat decision: Next and Someday only - Waiting For/Maybe
 *   don't get their own count here), and how many of that item's own
 *   meetings fall within the same week range. Deliberately not filtered by
 *   done/cancelled for the meeting count the same way tasks are - a
 *   cancelled meeting is excluded (matches every other meeting count in this
 *   codebase), but the count itself isn't "open work remaining", just "how
 *   busy is this item this week".
 *
 * A third piece, `historicalGoals` (V2, docs/dev/technical-design-weekly-goals.md),
 * added alongside `weekKey`: unlike `focusCards`, this is goal-driven rather
 * than focus-driven - every item (any kind, regardless of its *current*
 * weeklyFocus flag) that has a `## Weekly Goals` entry matching `weekKey`
 * specifically. Always computed (cheap - a filter over already-cached items,
 * no extra I/O), whether or not the displayed week is one where goals can be
 * edited - screens/WeekView.tsx decides whether to render it.
 */
import {entriesInRange, entryDate, MeetingSpanDay} from '../domain/meetingSpan';
import {meetingTimestampMs} from '../domain/meetingTime';
import {Meeting} from '../domain/types';
import {CachedItem} from './dataCache';
import {DailyInboxInput, DailyItemRef, inboxItemRef} from './dailyAggregate';
import {buildPeriodFocusCards, PeriodFocusCardData} from './periodFocusCards';
import {findGoalsForPeriod, GoalHistoryEntry} from './periodGoals';
import {perfTime} from '../utils/perf';

export interface WeeklyMeetingEntry {
  item: DailyItemRef;
  meetingIndex: number;
  meeting: Meeting;
  /**
   * Set only for a multi-day meeting (`3d`): which covered day this entry
   * stands for. Such a meeting yields one entry per covered day in range
   * (docs/dev/technical-design-monthly-view.md, 2026-09-23 follow-up), each
   * listed under `span.date` with continuation arrows.
   */
  span?: MeetingSpanDay;
}

export {entryDate} from '../domain/meetingSpan';

/** Kept as a name for the weekly callers - the card shape is shared with the Month view since docs/dev/technical-design-monthly-view.md §4.3. */
export type WeeklyFocusCardData = PeriodFocusCardData;

/** One item that had a goal recorded for a specific week - see storage/periodGoals.ts's findGoalsForPeriod. */
export type WeeklyGoalHistoryEntry = GoalHistoryEntry;

export interface WeeklyAggregate {
  /** Every not-cancelled meeting (all items plus Inbox) dated within the range, soonest first. */
  meetings: WeeklyMeetingEntry[];
  /** One card per currently weekly-focused Project/Area, in cache order. */
  focusCards: WeeklyFocusCardData[];
  /** Every item (any kind, any current weeklyFocus state) with a goal recorded for `weekKey` specifically. */
  historicalGoals: WeeklyGoalHistoryEntry[];
}

/** Every item with a `## Weekly Goals` entry for `weekKey` - storage/periodGoals.ts's findGoalsForPeriod, weekly scope. Cache-only, no file scan. */
export function findWeeklyGoalsForWeek(items: CachedItem[], weekKey: string): WeeklyGoalHistoryEntry[] {
  return findGoalsForPeriod(items, 'weekly', weekKey);
}

/** Pure in-memory aggregation over already-cached items plus Inbox's own tasks/meetings - see the module doc comment. `inboxPath` addresses the synthetic Inbox item (same `inboxItemRef` DailyView/dailyAggregate.ts use); ignored when `inbox` is null. `weekStart`/`weekEnd` are inclusive YYYY-MM-DD bounds - domain/weekDate.ts's `weekRangeIso` (optionally shifted via `shiftWeeks`) is how WeekView.tsx produces them. `weekKey` is that same displayed week's ISO key (domain/weekDate.ts's `isoWeekKey`) - drives both `focusCards[].goal` and `historicalGoals`. */
function buildWeeklyAggregateImpl(
  items: CachedItem[],
  inbox: DailyInboxInput | null,
  inboxPath: string,
  weekStart: string,
  weekEnd: string,
  weekKey: string,
): WeeklyAggregate {
  const meetings: WeeklyMeetingEntry[] = [];

  for (const cachedItem of items) {
    if (cachedItem.loadError) continue;
    const item: DailyItemRef = {
      kind: cachedItem.kind,
      name: cachedItem.name,
      path: cachedItem.path,
      dailyFocus: cachedItem.dailyFocus,
      weeklyFocus: cachedItem.weeklyFocus,
      monthlyFocus: cachedItem.monthlyFocus,
      abbrev: cachedItem.abbrev,
    };

    cachedItem.meetings.forEach((meeting, meetingIndex) => {
      if (!meeting.cancelled) meetings.push(...entriesInRange({item, meetingIndex, meeting}, weekStart, weekEnd));
    });
  }

  if (inbox) {
    const item = inboxItemRef(inboxPath);
    inbox.meetings.forEach((meeting, meetingIndex) => {
      if (!meeting.cancelled) meetings.push(...entriesInRange({item, meetingIndex, meeting}, weekStart, weekEnd));
    });
  }

  // By listed day, then time (date-only after timed ones, as a whole day).
  meetings.sort((a, b) => {
    const da = entryDate(a);
    const db = entryDate(b);
    if (da !== db) return da < db ? -1 : 1;
    return meetingTimestampMs(a.meeting) - meetingTimestampMs(b.meeting);
  });

  // Cache order (folder scan order) is preserved for focusCards, matching
  // ui/DailyFocusPanel.tsx's own FixedSlotSection `items.filter(...)` order
  // today - no further sort needed since every entry here is already a
  // weekly-focused item by construction.

  const focusCards = buildPeriodFocusCards(items, {scope: 'weekly', key: weekKey, start: weekStart, end: weekEnd});
  return {meetings, focusCards, historicalGoals: findWeeklyGoalsForWeek(items, weekKey)};
}

/** Perf-traced entry point (docs/dev/technical-design-perf-tracing.md) - see buildWeeklyAggregateImpl above for the actual logic. */
export function buildWeeklyAggregate(...args: Parameters<typeof buildWeeklyAggregateImpl>): ReturnType<typeof buildWeeklyAggregateImpl> {
  return perfTime('agg:weekly', () => buildWeeklyAggregateImpl(...args));
}
