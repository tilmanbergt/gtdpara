/**
 * The types Quick Add (ui/QuickAddWidget.tsx) and the lasso capture panel
 * (ui/quickAdd/CaptureQuickAdd.tsx) share with each other and with the
 * screens that host them: the drafts of new items, what an add or edit
 * hands the screen, the edit target, and the capture seed.
 */
import {AbbrevFileMatch} from '../../domain/abbrev';
import {AgreementRef} from '../../domain/agreementOwner';
import {Destination} from '../../domain/destination';
import {MeetingField, todayIso} from '../../domain/meetingTime';
import {FlowState, Meeting, Task} from '../../domain/types';

/** The fields of a meeting being added or edited. */
export interface MeetingQuickAddFields {
  title: string;
  date: string;
  /** Already normalized (HH:mm, zero-padded) or '' - see validateMeetingFields. */
  time: string;
  /** HH:mm end or '' (docs/dev/history/technical-design-monthly-view.md §2.3) - parsed from the same time field ("15-16.30"). */
  endTime: string;
  /** Whole days of a date-only meeting ("3d"), 1 for a timed one. A blank time field saves as 1 day. */
  days: number;
}

/**
 * What `onQuickFile` (edit mode) hands the caller to save at the resolved
 * target - the widget's own currently-edited text/fields, fully composed
 * exactly the way `Save` itself composes them (flow-state tag and
 * `[due:: …]` field folded in by domain/quickAddCompose.ts's
 * `composeTaskText` for a task, `validateMeetingFields`-normalized for a
 * meeting), the matched abbreviation tag stripped via `removeTagFromText`.
 * Callers must NOT re-read their own last-*saved* task/meeting for the
 * text/title - that would silently discard whatever the user typed or
 * changed during this edit session. `linkedFile` is threaded through the
 * same way `onSaveEditTask`/`onSaveEditMeeting`'s own second parameter is.
 * The `kind` always matches the edit target's kind, so this type stands
 * alone as a single parameter.
 */
export type QuickFilePayload =
  | {kind: 'task'; text: string; linkedFile: string}
  | {kind: 'meeting'; fields: MeetingQuickAddFields; linkedFile: string};

/**
 * The item Quick Add edits. `key` is a stable id of the target (e.g.
 * "meeting:/p#3"): when it changes while editing, the fields reload from the
 * new target, so switching directly from one row to another never keeps the
 * previous row's fields. `loop`: the todo stands for a loop
 * (screens/loop/LoopOverview.tsx) - no flow chips, no Delete, "Save loop".
 * `mode`: 'card' shows the item card in the box (where the screen passes
 * one), 'edit' the edit form (ui/useEditTarget.ts). `agreement`: an
 * agreement's edit (Save keeps it the same agreement); `agreementChange`:
 * the form prefilled from `replaces`, whose + Add ends it and adds the new
 * one (docs/dev/history/technical-design-meetings-0.21.md §5).
 */
export type QuickAddEditTarget =
  | {kind: 'task'; mode: EditMode; key: string | null; task: Task}
  | {kind: 'loop'; mode: EditMode; key: string | null; task: Task}
  | {kind: 'meeting'; mode: EditMode; key: string | null; meeting: Meeting}
  | {kind: 'agreement'; mode: EditMode; key: string | null; agreement: AgreementRef}
  | {kind: 'agreementChange'; mode: EditMode; key: string | null; replaces: AgreementRef};

export type EditMode = 'card' | 'edit';

/** The edit target for a screen's edited todo or meeting (a todo wins), or null when nothing is edited. */
export function editTargetFor(
  key: string | null,
  item: {task?: Task | null; meeting?: Meeting | null; loop?: boolean},
  mode: EditMode = 'edit',
): QuickAddEditTarget | null {
  if (item.task) return {kind: item.loop ? 'loop' : 'task', mode, key, task: item.task};
  if (item.meeting) return {kind: 'meeting', mode, key, meeting: item.meeting};
  return null;
}

/** Whether two edit targets name the same item the same way (React.memo's prop check). */
export function sameEditTarget(a: QuickAddEditTarget | null | undefined, b: QuickAddEditTarget | null | undefined): boolean {
  if (!a || !b) return !a === !b;
  if (a.kind !== b.kind || a.mode !== b.mode || a.key !== b.key) return false;
  switch (a.kind) {
    case 'meeting':
      return a.meeting === (b as typeof a).meeting;
    case 'agreement':
      return a.agreement.agreement === (b as typeof a).agreement.agreement;
    case 'agreementChange':
      return a.replaces.agreement === (b as typeof a).replaces.agreement;
    default:
      return a.task === (b as typeof a).task;
  }
}

/** Which Save button of the capture variant was pressed (docs/dev/history/technical-design-lasso-0.8.md §3.9). */
export type CaptureSaveMode = 'next' | 'view' | 'close';

/**
 * Text the capture screen puts into the draft (recognized lasso or mark).
 * A new `key` (another lasso/mark) replaces the whole draft; the same key
 * again (recognition finished) only fills the text, and only while the
 * user hasn't typed.
 */
export interface CaptureSeed {
  key: string;
  /** One entry per item; several only with `split`. */
  items: string[];
  split: boolean;
  /** Meeting date default (the mark's day). */
  date?: string;
  /** Meeting title when the user switches to Meeting (one line); defaults to the items joined. */
  meetingTitle?: string;
}

export interface TaskDraft {
  text: string;
  flowState: FlowState;
  waitingOnText: string;
  dueDate: string;
  /** Whether the due-date field has been unfolded - independent of dueDate's value, and stays true for the life of this draft once set (no need to hide the field again once shown). */
  dueDateOpen: boolean;
}

export interface MeetingDraft {
  title: string;
  date: string;
  /** The time field's raw text - "15", "15-16.30", "3d" or '' (= 1d); parsed on submit by validateMeetingFields. */
  time: string;
  /** The "M" toggle (docs/dev/history/technical-design-monthly-view.md §5.1) - composed into the title as `#monthly` on submit, never shown in the title field. */
  monthly: boolean;
}

/** An agreement being added: its words (tags inline) and its valid-till date. */
export interface AgreementDraft {
  text: string;
  valid: string | null;
}

/** Note has no edit mode and no metadata beyond its (taggable) title - one field is all this needs. */
export interface NoteDraft {
  titleRaw: string;
}

export function makeTaskDraft(): TaskDraft {
  return {text: '', flowState: null, waitingOnText: '', dueDate: '', dueDateOpen: false};
}

export function makeMeetingDraft(initialDate?: string, initialMonthly = false): MeetingDraft {
  // Time starts EMPTY (most meetings get a time); a blank field is saved as
  // 1d.
  return {title: '', date: initialDate ?? todayIso(), time: '', monthly: initialMonthly};
}

export function makeNoteDraft(): NoteDraft {
  return {titleRaw: ''};
}

/** Which field a Quick Add error is about - the in-place ⚠ mark goes there. */
export type QuickAddField = 'text' | MeetingField;

/** The tab showing: the edit target's own kind while one is open, the freely toggled tab otherwise. */
export type QuickAddType = 'task' | 'meeting' | 'note' | 'agreement';

/**
 * Keeps Row 4's "+ Add to <Name>"/"File: <Name>" buttons and the status
 * texts from growing unboundedly on a long name - the first `max`
 * characters verbatim, "…" beyond that. Display-only; never affects which
 * item actually gets matched/filed (resolveAbbrevFileTarget always sees the
 * real, untruncated name).
 */
export function truncateItemName(name: string, max = 14): string {
  return name.length > max ? `${name.slice(0, max)}…` : name;
}

/** Where an abbreviation quick-file match files the item. */
export function abbrevDestination(target: AbbrevFileMatch): Destination {
  return {type: 'item', kind: target.kind, name: target.name, path: target.path};
}
