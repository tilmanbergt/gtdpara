/**
 * Focus-panel cards for either planning period (docs/dev/technical-design-
 * monthly-view.md §4.3) - pulled out of storage/weeklyAggregate.ts so the
 * Week and Month views build their cards the same way. Pure, synchronous,
 * over the already-warm cache (no I/O).
 *
 * Per focused item: open #next / #someday counts, a meeting count for the
 * period (weekly: meetings in the week; monthly: Month highlights in the
 * month), this period's goal, and one "other level" goal line:
 * - weekly card -> the item's goal for the month the week belongs to
 * - monthly card -> the item's goal for the REAL current week, only while
 *   the displayed month is the current one (a weekly sub-goal of that month)
 */
import {coveredDaysIn} from '../domain/meetingSpan';
import {isHighlight} from '../domain/monthHighlight';
import {monthOfWeek, Period, periodOf, periodShortLabel} from '../domain/period';
import {Meeting} from '../domain/types';
import {CachedItem} from './dataCache';
import {FOCUS_SCOPES} from './focusSlots';
import {goalFor} from './periodGoals';

export interface PeriodFocusCardData {
  item: CachedItem;
  /** Open (not done, not cancelled) #next tasks. */
  nextCount: number;
  /** Open (not done, not cancelled) #someday tasks. */
  somedayCount: number;
  /** Weekly: the item's not-cancelled meetings in the week. Monthly: its Month highlights in the month. */
  meetingCount: number;
  /** This item's goal for the period's key, or null. */
  goal: string | null;
  /** The other planning level's goal, e.g. {label: 'Oct', text: ...} on a weekly card - see the module doc comment. */
  secondaryGoal: {label: string; text: string} | null;
}

/** Meetings touching the period - a multi-day one that starts before it but runs into it counts too. */
function countMeetings(meetings: Meeting[], period: Period): number {
  return meetings.filter(
    m =>
      !m.cancelled &&
      coveredDaysIn(m, period.start, period.end).length > 0 &&
      (period.scope === 'weekly' || isHighlight(m)),
  ).length;
}

export function buildPeriodFocusCards(items: CachedItem[], period: Period, today: Date = new Date()): PeriodFocusCardData[] {
  const field = FOCUS_SCOPES[period.scope].field;
  const currentWeek = periodOf('weekly', today);
  const isCurrentMonth = period.scope === 'monthly' && currentWeek.start <= period.end && currentWeek.end >= period.start;
  const cards: PeriodFocusCardData[] = [];
  for (const item of items) {
    if (item.loadError || !item[field]) continue;
    const openTasks = item.tasks.filter(t => !t.done && !t.cancelled);
    let secondaryGoal: PeriodFocusCardData['secondaryGoal'] = null;
    if (period.scope === 'weekly') {
      const monthKey = monthOfWeek(period.start);
      const text = goalFor(item, 'monthly', monthKey);
      if (text) secondaryGoal = {label: periodShortLabel('monthly', monthKey), text};
    } else if (isCurrentMonth) {
      const text = goalFor(item, 'weekly', currentWeek.key);
      if (text) secondaryGoal = {label: periodShortLabel('weekly', currentWeek.key), text};
    }
    cards.push({
      item,
      nextCount: openTasks.filter(t => t.flowState === 'next').length,
      somedayCount: openTasks.filter(t => t.flowState === 'someday').length,
      meetingCount: countMeetings(item.meetings, period),
      goal: goalFor(item, period.scope, period.key),
      secondaryGoal,
    });
  }
  return cards;
}
