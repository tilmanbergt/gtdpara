/**
 * The meeting-list toolbar (docs/dev/history/technical-design-meeting-reflection.md
 * §2.6, M3-M5): one row between a meeting list's header and its rows that acts
 * on the selected meeting. Which slots it shows is decided here; ui/MeetingToolbar.tsx
 * only lays them out. Pure.
 */
import {MeetingTrackingKind, resolveMeetingTracking} from './meetingTracking';
import {NoteSetupConfig} from './noteSetups';
import {reflectionOffered} from './reflection';
import {Meeting} from './types';

export type ToolbarSlot =
  | {kind: 'checkpoint'; tracking: MeetingTrackingKind; done: boolean; label: 'Prepped' | 'Reviewed'}
  | {kind: 'reflection'; label: 'Reflect ›' | 'Reflection ›'; pending: boolean}
  | {kind: 'link'; label: 'Link file'};

/** Whether the selected meeting has a reflection page: still being looked up, none, or one. */
export type ReflectionLookup = 'unknown' | 'none' | 'exists';

/** What the toolbar says while no meeting is selected. */
export const TOOLBAR_EMPTY_HINT = 'Tap a meeting';

const CHECKPOINT_LABEL: Record<MeetingTrackingKind, 'Prepped' | 'Reviewed'> = {prep: 'Prepped', review: 'Reviewed'};

/**
 * The slots for `meeting`, in order (M4): the checkpoint when its setup tracks
 * the current phase; Reflect/Reflection once the meeting is over and not
 * cancelled (disabled while the lookup runs); Link file where the screen has a
 * Files pane (`canLink`). No meeting: no slots (see `emptyToolbarSlots`).
 */
export function meetingToolbarSlots(input: {
  meeting: Meeting | null;
  setups: NoteSetupConfig;
  nowMs: number;
  reflection: ReflectionLookup;
  canLink: boolean;
}): ToolbarSlot[] {
  const {meeting} = input;
  if (!meeting) return [];
  const slots: ToolbarSlot[] = [];
  const tracking = resolveMeetingTracking(meeting, input.setups, new Date(input.nowMs));
  if (tracking) slots.push({kind: 'checkpoint', tracking: tracking.kind, done: tracking.done, label: CHECKPOINT_LABEL[tracking.kind]});
  if (reflectionOffered(meeting, input.nowMs)) {
    slots.push({kind: 'reflection', label: input.reflection === 'exists' ? 'Reflection ›' : 'Reflect ›', pending: input.reflection === 'unknown'});
  }
  if (input.canLink) slots.push({kind: 'link', label: 'Link file'});
  return slots;
}

/** The greyed slots shown while nothing is selected, so the row keeps its place (M3): Reflect, and Link file where the list can link. */
export function emptyToolbarSlots(canLink: boolean): ToolbarSlot[] {
  const slots: ToolbarSlot[] = [{kind: 'reflection', label: 'Reflect ›', pending: true}];
  if (canLink) slots.push({kind: 'link', label: 'Link file'});
  return slots;
}

/** A slot's button text: `☐ Prepped` / `✓ Reviewed`, `Reflect ›`, `Link file`. */
export function toolbarSlotText(slot: ToolbarSlot): string {
  return slot.kind === 'checkpoint' ? `${slot.done ? '✓' : '☐'} ${slot.label}` : slot.label;
}
