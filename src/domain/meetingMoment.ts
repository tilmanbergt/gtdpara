/**
 * The moment of a meeting on its page (docs/dev/history/technical-design-meetings-0.21.md
 * R1-R4, §3.1): Before, During or After, preselected by time, and which
 * buttons the moment offers. Pure.
 *
 * - Before until the start, During from the start until the planned end,
 *   After from the end until REVIEW_LOOKBACK_DAYS days later - no grace
 *   period. A date-only meeting is Before before its first day, During on
 *   its days, After from the day after. Older than the window, or
 *   cancelled: no moment, so no meeting line.
 * - The strip offers at most three actions, in R4's order: Before - Mark
 *   prepped, Note from last meeting; During - + Next; After - Reflect, Mark
 *   reviewed, + Next.
 */
import {MeetingEntryRef} from './engageOwner';
import {MeetingEndInput, meetingEndMs, meetingStartMs} from './meetingTime';
import {REVIEW_LOOKBACK_DAYS} from './meetingTracking';
import {Meeting} from './types';

export type MeetingMoment = 'before' | 'during' | 'after';

export const MEETING_MOMENTS: readonly MeetingMoment[] = ['before', 'during', 'after'];

const DAY_MS = 24 * 60 * 60 * 1000;

/** The moment `nowMs` is in for `meeting` (R2); null when it is cancelled or the After window is over. */
export function momentByTime(meeting: MeetingEndInput & Pick<Meeting, 'cancelled'>, nowMs: number): MeetingMoment | null {
  if (meeting.cancelled) return null;
  const end = meetingEndMs(meeting);
  if (nowMs < meetingStartMs(meeting)) return 'before';
  if (nowMs < end) return 'during';
  return nowMs < end + REVIEW_LOOKBACK_DAYS * DAY_MS ? 'after' : null;
}

const sameEntry = (a: MeetingEntryRef, b: MeetingEntryRef) => a.item.path === b.item.path && a.meetingIndex === b.meetingIndex;

/** The meeting of `meetings` that starts latest before `of` starts (`of` itself left out); null when none. */
export function previousMeeting(meetings: readonly MeetingEntryRef[], of: MeetingEntryRef): MeetingEntryRef | null {
  const start = meetingStartMs(of.meeting);
  let best: MeetingEntryRef | null = null;
  for (const m of meetings) {
    if (sameEntry(m, of) || m.meeting.cancelled) continue;
    const s = meetingStartMs(m.meeting);
    if (s < start && (!best || s > meetingStartMs(best.meeting))) best = m;
  }
  return best;
}

/** Whether `meetings` hold one (not cancelled) that starts after `of` starts. */
export function hasMeetingAfter(meetings: readonly MeetingEntryRef[], of: MeetingEntryRef): boolean {
  const start = meetingStartMs(of.meeting);
  return meetings.some(m => !sameEntry(m, of) && !m.meeting.cancelled && meetingStartMs(m.meeting) > start);
}

export type StripAction = 'markPrepped' | 'lastNote' | 'nextMeeting' | 'reflect' | 'markReviewed';

/** At most this many buttons in the strip (R4). */
export const STRIP_LIMIT = 3;

export interface StripInput {
  /** A matching setup tracks prep / review (domain/meetingTracking.ts's `tracksCheckpoint`). */
  tracksPrep: boolean;
  prepped: boolean;
  tracksReview: boolean;
  reviewed: boolean;
  /** The owner's previous meeting has a note. */
  lastHasNote: boolean;
  /** The thread or loop has no meeting after this one. */
  nextNeeded: boolean;
  /** Engage is open on the meeting's Reflection page: Reflect is not offered. */
  onReflectionPage: boolean;
}

/** The strip's buttons for `moment`, in R4's order, at most three; [] = no row. */
export function stripActions(moment: MeetingMoment, input: StripInput): StripAction[] {
  const out: StripAction[] = [];
  const add = (action: StripAction, when: boolean) => {
    if (when) out.push(action);
  };
  switch (moment) {
    case 'before':
      add('markPrepped', input.tracksPrep && !input.prepped);
      add('lastNote', input.lastHasNote);
      break;
    case 'during':
      add('nextMeeting', input.nextNeeded);
      break;
    case 'after':
      add('reflect', !input.onReflectionPage);
      add('markReviewed', input.tracksReview && !input.reviewed);
      add('nextMeeting', input.nextNeeded);
      break;
  }
  return out.slice(0, STRIP_LIMIT);
}
