/**
 * The Projects tab of an Area page
 * (docs/dev/history/technical-design-projects-findable-notes.md §1): one row
 * per Project assigned to the Area (`area:` frontmatter) with its signals. A
 * pure, synchronous transform over the warm cache, like
 * storage/threadAggregate.ts - no file reads here.
 *
 * - Listed: Active Projects, then On hold ones; Done and Archived are not.
 *   Each group alphabetically.
 * - Meetings: not cancelled. The last one is the latest that is over
 *   (`meetingEndMs <= now`), the next one the soonest that is not.
 * - Open todos: not done, not cancelled. `next`: open and flow state `next`.
 * - Stalled: no actionable open todo - the Review's definition
 *   (storage/reviewAggregate.ts's `isActionableOpenTask`).
 * - Oldest Waiting For: today minus the created date of the oldest open
 *   Waiting For todo (the age the thread overview shows); those without a
 *   created date give no age.
 *
 * Counts and dates only: no hints, no ranking (§1.1).
 */
import {formatDate} from '../domain/dateFormat';
import {meetingEndMs} from '../domain/meetingTime';
import {daysBetween} from '../domain/nextMeeting';
import {ItemStatus} from '../domain/types';
import {CachedItem} from './dataCache';
import {isActionableOpenTask} from './reviewAggregate';

export interface ProjectGlanceRow {
  item: CachedItem;
  status: Extract<ItemStatus, 'active' | 'on-hold'>;
  /** Date of the latest meeting that is over, or null. */
  lastMeeting: string | null;
  /** Date of the next meeting that is not over yet, or null. */
  nextMeeting: string | null;
  open: number;
  next: number;
  stalled: boolean;
  waitingCount: number;
  /** Days since the oldest open Waiting For todo was created; null when none has a created date. */
  oldestWaitingDays: number | null;
}

function glanceOf(item: CachedItem, status: ProjectGlanceRow['status'], today: string, nowMs: number): ProjectGlanceRow {
  let last: {date: string; end: number} | null = null;
  let next: {date: string; end: number} | null = null;
  for (const meeting of item.meetings) {
    if (meeting.cancelled) continue;
    const end = meetingEndMs(meeting);
    if (end <= nowMs) {
      if (!last || end > last.end) last = {date: meeting.date, end};
    } else if (!next || end < next.end) {
      next = {date: meeting.date, end};
    }
  }
  const open = item.tasks.filter(t => !t.done && !t.cancelled);
  const waiting = open.filter(t => t.flowState === 'waiting-for');
  const ages = waiting
    .map(t => (t.fields.created ? daysBetween(t.fields.created, today) : null))
    .filter((d): d is number => d !== null);
  return {
    item,
    status,
    lastMeeting: last?.date ?? null,
    nextMeeting: next?.date ?? null,
    open: open.length,
    next: open.filter(t => t.flowState === 'next').length,
    stalled: !item.tasks.some(isActionableOpenTask),
    waitingCount: waiting.length,
    oldestWaitingDays: ages.length > 0 ? Math.max(...ages) : null,
  };
}

/** The Projects of Area `areaName`: Active first, then On hold, each alphabetically. */
export function buildProjectGlance(areaName: string, items: readonly CachedItem[], today: string, now: Date): ProjectGlanceRow[] {
  const byName = (a: CachedItem, b: CachedItem) => a.name.localeCompare(b.name, undefined, {sensitivity: 'base'});
  const assigned = items.filter(i => i.kind === 'project' && i.area === areaName);
  const nowMs = now.getTime();
  return (['active', 'on-hold'] as const).flatMap(status =>
    assigned
      .filter(i => i.status === status)
      .sort(byName)
      .map(i => glanceOf(i, status, today, nowMs)),
  );
}

/** Line 2, left: `last 30.9. · next 14.10.`, a dash for a missing date. */
export function glanceMeetingText(row: ProjectGlanceRow, today: string): string {
  const date = (iso: string | null) => (iso ? formatDate(iso, today) : '—');
  return `last ${date(row.lastMeeting)} · next ${date(row.nextMeeting)}`;
}

/** Line 2, right: `7 open · 2 next · w/f 12 d`; "no next action" instead of the next count when stalled. */
export function glanceCountsText(row: ProjectGlanceRow): string {
  const parts = [`${row.open} open`, row.stalled ? 'no next action' : `${row.next} next`];
  if (row.waitingCount > 0) parts.push(row.oldestWaitingDays !== null ? `w/f ${row.oldestWaitingDays} d` : `${row.waitingCount} w/f`);
  return parts.join(' · ');
}
