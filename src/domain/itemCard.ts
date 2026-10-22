/**
 * What the item card shows (docs/dev/history/technical-design-item-card.md K8,
 * §6): the card takes Quick Add's place when a meeting is tapped once, in the
 * same four rows. Which slots appear and what they say is decided here;
 * ui/itemCard/MeetingCard.tsx only lays them out. Pure.
 */
import {formatDayHeader} from './dateFormat';
import {formatMeetingWhen, todayIso} from './meetingTime';
import {MeetingTrackingKind, meetingDisplayTitle, resolveMeetingTracking} from './meetingTracking';
import {isHighlight} from './monthHighlight';
import {NoteSetupConfig} from './noteSetups';
import {reflectionOffered} from './reflection';
import {threadsOfTags} from './threads';
import {Meeting} from './types';

/** Whether the meeting has a reflection page: still being looked up, none, or one. */
export type ReflectionLookup = 'unknown' | 'none' | 'exists';

/** Where the meeting is in time; cancelled wins. */
export type MeetingPhase = 'before' | 'today' | 'over' | 'cancelled';

export interface MeetingCardModel {
  phase: MeetingPhase;
  /** R1: "Meeting · today". */
  heading: string;
  /** R1: the meeting's thread (`#sparring/mieke`), opening its overview; null without a nested tag. */
  thread: {tag: string; label: string} | null;
  /** R2: the title as shown (state tags stripped, the user's tags kept). */
  title: string;
  /** R2: "Thu 22.10. 10:00-11:00", or "today 10:00-11:00". */
  when: string;
  /** R3: the P or R toggle when the setup tracks the current phase. */
  checkpoint: {kind: MeetingTrackingKind; done: boolean; label: 'P' | 'R'} | null;
  /** R3: the M toggle's state. */
  monthly: boolean;
  /** R3: whether the meeting has its note yet (open) or not (create). */
  note: 'open' | 'create';
  /** R3: Reflect once the meeting is over (not cancelled); filled once the page exists, inactive while looked up. */
  reflection: ReflectionLookup | null;
  /** R3: the linked file (name opens, ✕ unlinks), "+clip" where the screen can link, or nothing. */
  file: {kind: 'linked'; path: string; name: string} | {kind: 'link'} | null;
  /** R4: the area chip - the owner's name, and whether its arrow can refile. */
  owner: {name: string; canRefile: boolean};
  /** R4: Cancel meeting, unless it already is. */
  canCancel: boolean;
}

export interface MeetingCardInput {
  meeting: Meeting;
  setups: NoteSetupConfig;
  nowMs: number;
  reflection: ReflectionLookup;
  /** The Project's or Area's name, or "Inbox". */
  ownerName: string;
  /** The screen has a Files pane to link a file through. */
  canLink: boolean;
  /** The screen can refile (a Files pane to pick the target in). */
  canRefile: boolean;
}

const PHASE_TEXT: Record<MeetingPhase, string> = {before: 'ahead', today: 'today', over: 'over', cancelled: 'cancelled'};
const CHECKPOINT_LABEL: Record<MeetingTrackingKind, 'P' | 'R'> = {prep: 'P', review: 'R'};

export function meetingPhase(meeting: Meeting, nowMs: number): MeetingPhase {
  if (meeting.cancelled) return 'cancelled';
  if (reflectionOffered(meeting, nowMs)) return 'over';
  return meeting.date === todayIso(new Date(nowMs)) ? 'today' : 'before';
}

/** The last path segment of a linked file, without its folders. */
function fileName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

export function meetingCardModel(input: MeetingCardInput): MeetingCardModel {
  const {meeting, nowMs} = input;
  const phase = meetingPhase(meeting, nowMs);
  const today = todayIso(new Date(nowMs));
  const tracking = phase === 'cancelled' ? null : resolveMeetingTracking(meeting, input.setups, new Date(nowMs));
  const thread = threadsOfTags(meeting.tags)[0] ?? null;
  return {
    phase,
    heading: `Meeting · ${PHASE_TEXT[phase]}`,
    thread: thread ? {tag: thread.tag, label: `#${thread.tag} ›`} : null,
    title: meetingDisplayTitle(meeting),
    when: `${meeting.date === today ? 'today' : formatDayHeader(meeting.date, today)} ${formatMeetingWhen(meeting)}`,
    checkpoint: tracking ? {kind: tracking.kind, done: tracking.done, label: CHECKPOINT_LABEL[tracking.kind]} : null,
    monthly: isHighlight(meeting),
    note: meeting.notePath ? 'open' : 'create',
    reflection: phase === 'over' ? input.reflection : null,
    file: meeting.linkedFile
      ? {kind: 'linked', path: meeting.linkedFile, name: fileName(meeting.linkedFile)}
      : input.canLink
        ? {kind: 'link'}
        : null,
    owner: {name: input.ownerName, canRefile: input.canRefile},
    canCancel: phase !== 'cancelled',
  };
}
