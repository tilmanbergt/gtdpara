/**
 * Meeting prep/review tracking (docs/dev/history/technical-design-meeting-tracking.md).
 *
 * A Note setup (domain/noteSetups.ts, docs/dev/history/technical-design-note-setups.md
 * §4.2) can switch on two checkpoints for the meetings it matches: "prepare before" and
 * "review after". Neither creates a todo - each is a single tick on the
 * meeting itself, stored as a bare `#prepped` / `#reviewed` tag on the meeting
 * line (same mechanism as `#now` on tasks, via domain/flowState.ts's
 * hasBareTag/setBareTag), and shown as one icon on the meeting's row.
 *
 * Which checkpoint is relevant depends only on time: before the meeting's end
 * it's prep, after it it's review. "End" is domain/meetingTime.ts's
 * `meetingAutoUpdateCutoffMs` (its end time, or start + 1h, or end of the last
 * day for a date-only meeting) - deliberately the same instant that already freezes a meeting's
 * note, so the app has one notion of "the meeting is over".
 *
 * State lives in tags, one flag per meeting line (the app has no recurring
 * meetings, so a line is exactly one meeting). Pure, zero RN/SDK imports
 * (design-overview.md §3).
 */
import {hasBareTag, setBareTag, stripBareTags} from './flowState';
import {deriveMeetingFields} from './markdown';
import {isoDateOffset, meetingAutoUpdateCutoffMs} from './meetingTime';
import {matchingSetups, MeetingTracking, NoteSetupConfig} from './noteSetups';
import {Meeting} from './types';

export type MeetingTrackingKind = 'prep' | 'review';

/** What a meeting's row/review step needs: which checkpoint is current, and whether it's already ticked. */
export interface MeetingTrackingState {
  kind: MeetingTrackingKind;
  done: boolean;
}

/** The bare tag each checkpoint is stored as. */
const TRACKING_TAG: Record<MeetingTrackingKind, string> = {prep: 'prepped', review: 'reviewed'};

/** How far back the Review step's "Meetings to close out" looks - older unreviewed meetings quietly drop off rather than piling up forever. */
export const REVIEW_LOOKBACK_DAYS = 7;

type TrackedMeeting = Pick<Meeting, 'date' | 'time' | 'tags' | 'cancelled'> & Partial<Pick<Meeting, 'endTime' | 'days'>>;

/**
 * The tracking of every enabled setup `tags` match, or the Default's when
 * none does (docs/dev/history/technical-design-loops.md §1.2): a meeting of a
 * loop that also carries a thread's tag is tracked when either setup asks.
 */
function matchingTracking(tags: readonly string[], config: NoteSetupConfig): MeetingTracking[] {
  const matched = matchingSetups(tags, config.setups);
  return matched.length > 0 ? matched.map(s => s.tracking) : [config.defaults.tracking];
}

/**
 * Which checkpoint is current for `meeting` right now and whether it's done -
 * or `null` when nothing is tracked in the current phase (none of the
 * matching setups - or the Default - tracks this phase, or the meeting is
 * cancelled). The one
 * function both the row icon and the review aggregate call, so they can never
 * disagree.
 */
export function resolveMeetingTracking(
  meeting: TrackedMeeting,
  config: NoteSetupConfig,
  now: Date = new Date(),
): MeetingTrackingState | null {
  if (meeting.cancelled) return null;
  const matching = matchingTracking(meeting.tags, config);
  const kind: MeetingTrackingKind = now.getTime() > meetingAutoUpdateCutoffMs(meeting) ? 'review' : 'prep';
  const tracked = matching.some(t => (kind === 'prep' ? t.trackPrep : t.trackReview));
  if (!tracked) return null;
  return {kind, done: hasBareTag(meeting.tags, TRACKING_TAG[kind])};
}

/**
 * Whether `meeting` belongs in the Review step's "Meetings to close out":
 * review is the current phase, tracked, not yet ticked, and the meeting is
 * within REVIEW_LOOKBACK_DAYS.
 */
export function isReviewOutstanding(
  meeting: TrackedMeeting,
  config: NoteSetupConfig,
  now: Date = new Date(),
): boolean {
  const state = resolveMeetingTracking(meeting, config, now);
  if (!state || state.kind !== 'review' || state.done) return false;
  return meeting.date >= isoDateOffset(-REVIEW_LOOKBACK_DAYS, now);
}

/** Short label for what a setup tracks, for the Note setups list ("prep", "review", "prep + review") - '' when nothing. */
export function trackingSummary(tracking: MeetingTracking): string {
  return [tracking.trackPrep ? 'prep' : '', tracking.trackReview ? 'review' : ''].filter(Boolean).join(' + ');
}

/**
 * `meeting` with checkpoint `kind` flipped (ticked -> unticked and back):
 * the title gets the tag added/removed and `tags` is re-derived from it, the
 * same "text is truth, tags are a derived read" contract every other tag
 * mutator follows. Returns a new object; the caller persists it through its
 * own meetings mutator.
 */
export function toggleMeetingTracking<T extends Pick<Meeting, 'title' | 'tags'>>(
  meeting: T,
  kind: MeetingTrackingKind,
): T {
  const tag = TRACKING_TAG[kind];
  const title = setBareTag(meeting.title, tag, !hasBareTag(meeting.tags, tag));
  return {...meeting, title, ...deriveMeetingFields(title)};
}

/**
 * `meetings` with checkpoint `kind` flipped on the one at `index` - the
 * list-level form of toggleMeetingTracking, so a screen's persist handler is
 * one line inside its own meetings mutator (`meetings => toggleMeetingTrackingAt(meetings, index, kind)`).
 * An out-of-range `index` returns the list unchanged (the meeting vanished
 * between render and tap; the screen's usual refresh path recovers).
 */
export function toggleMeetingTrackingAt<T extends Pick<Meeting, 'title' | 'tags'>>(
  meetings: T[],
  index: number,
  kind: MeetingTrackingKind,
): T[] {
  if (index < 0 || index >= meetings.length) return meetings;
  const next = meetings.slice();
  next[index] = toggleMeetingTracking(meetings[index], kind);
  return next;
}

/**
 * The meeting's title as it should be SHOWN - without the machine-managed
 * state tags. Every place that renders a meeting title (rows, the note's
 * title piece and file name, review lists) goes through this one function.
 */
export function meetingDisplayTitle(meeting: Pick<Meeting, 'title'>): string {
  // `#monthly` (the Month view's highlight flag, docs/dev/technical-design-
  // monthly-view.md §2.4) is machine-managed the same way and shown as the
  // row's small "M" mark instead of as text.
  return stripBareTags(meeting.title, [TRACKING_TAG.prep, TRACKING_TAG.review, 'monthly']);
}

/**
 * `title` without `#prepped`/`#reviewed` - what Quick Add's edit form shows
 * (docs/dev/history/technical-design-meeting-reflection.md §2.5, M7): the
 * checkpoints are ticked in the list toolbar, not typed.
 */
export function stripTrackingTags(title: string): string {
  return stripBareTags(title, [TRACKING_TAG.prep, TRACKING_TAG.review]);
}

/**
 * `title` (an edited title, typed without state tags) with `#prepped`/
 * `#reviewed` exactly as the `stored` meeting has them: Save keeps the
 * meeting's current state, so a tick made while the edit was open is never
 * undone. `stored` must be the current copy, read inside the save's mutator.
 */
export function withTrackingTagsOf(title: string, stored: Pick<Meeting, 'tags'>): string {
  let out = stripTrackingTags(title);
  for (const kind of ['prep', 'review'] as const) {
    if (hasBareTag(stored.tags, TRACKING_TAG[kind])) out = setBareTag(out, TRACKING_TAG[kind], true);
  }
  return out;
}
