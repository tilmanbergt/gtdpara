/**
 * "+ Next <type>" (docs/dev/history/technical-design-tending-threads.md §3.6):
 * the next meeting of a thread, copied from its latest one. Pure.
 *
 * - base: the latest meeting of the thread, planned ones included, so "+ Next"
 *   always goes past the last meeting already set up; none -> null;
 * - interval: the days between the two latest meetings; with one meeting (or
 *   two on the same day) a week;
 * - date: base date + interval, stepped on by the interval until it is today
 *   or later;
 * - title, time, end time and days are copied; the title without the state
 *   tags (`#prepped`, `#reviewed`, `#monthly`); note and linked file are not.
 */
import {addDaysToIso} from './dateNudge';
import {meetingDisplayTitle} from './meetingTracking';
import {Meeting} from './types';

/** The fields of a new meeting (storage/itemMutations.ts's MeetingInput has the same shape). */
export interface MeetingSeedFields {
  title: string;
  date: string;
  time: string;
  endTime: string;
  days: number;
}

export const DEFAULT_MEETING_INTERVAL_DAYS = 7;

function dayNumber(iso: string): number {
  const [year, month, day] = iso.split('-').map(Number);
  return Math.round(Date.UTC(year, month - 1, day) / 86400000);
}

/** Days from `a` to `b` (both YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  return dayNumber(b) - dayNumber(a);
}

function startKey(meeting: Pick<Meeting, 'date' | 'time'>): string {
  return `${meeting.date} ${meeting.time || '00:00'}`;
}

/** The latest of `meetings` (not cancelled) by start, or null. */
export function latestMeeting<T extends Pick<Meeting, 'date' | 'time' | 'cancelled'>>(meetings: readonly T[]): T | null {
  let latest: T | null = null;
  for (const m of meetings) {
    if (m.cancelled) continue;
    if (!latest || startKey(m) > startKey(latest)) latest = m;
  }
  return latest;
}

/** The seed for the thread's next meeting - see the module doc comment. */
export function nextMeetingSeed(threadMeetings: readonly Meeting[], today: string): MeetingSeedFields | null {
  const sorted = threadMeetings.filter(m => !m.cancelled).sort((a, b) => startKey(b).localeCompare(startKey(a)));
  const base = sorted[0];
  if (!base) return null;
  const previous = sorted[1];
  const gap = previous ? daysBetween(previous.date, base.date) : 0;
  const interval = gap > 0 ? gap : DEFAULT_MEETING_INTERVAL_DAYS;
  let date = addDaysToIso(base.date, interval);
  while (date < today) date = addDaysToIso(date, interval);
  return {
    title: meetingDisplayTitle(base),
    date,
    time: base.time,
    endTime: base.time ? base.endTime : '',
    days: base.time ? 1 : Math.max(1, base.days),
  };
}
