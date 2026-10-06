/**
 * The unified Todo/Meeting add-and-edit widget (docs/dev/technical-design-
 * unified-quickadd.md) - replaces ui/TaskQuickAdd.tsx and ui/
 * MeetingQuickAdd.tsx, both retired once every call site has moved over
 * (design doc §10 step 5). Sits inside one Todo/Meeting mini-tab (Todo
 * default) rather than two independent fixed-slot forms side by side, so
 * every screen has exactly one add/edit surface no matter which of the four
 * styles (Create·Todo, Edit·Todo, Create·Meeting, Edit·Meeting) is showing -
 * see the design doc §1 for why (screen estate, a stable spot for text
 * input, no more "editing a Todo silently closes because a Meeting row was
 * tapped", room for Refile/a wider meeting date field later).
 *
 * Four fixed rows, same slots in every style (design doc §3):
 *   R1 Tabs      - Todo/Meeting mini-tab. Never disappears; the inactive tab
 *                  greys out (doesn't hide) while locked - taskOnly or an
 *                  edit of the other type in progress.
 *   R2 Input     - task text + a due-date affordance (icon that unfolds into
 *                  an inline field, never re-collapses once opened), or
 *                  meeting title + date (meetings show the date field
 *                  inline from the start - they almost always have one).
 *   R3 Metadata  - flow chips (create) or flow chips + attachment (edit) for
 *                  Todo; time only (create) or time + attachment (edit) for
 *                  Meeting. Selecting the w/f chip swaps the other three
 *                  chips out for a "Waiting on" field in this same row,
 *                  rather than growing a fifth row for it.
 *   R4 Actions   - create styles: "+ Add" right (status texts go to the
 *                  central status slot, docs/dev/technical-design-status-slot.md)
 *                  (relabels to "+ Add to <Name>" and creates there directly
 *                  when a recognized abbreviation #tag is typed - feature_
 *                  abbrev_quick_file, 2026-09-17, docs/dev/technical-design-
 *                  abbrev-quick-file.md).
 *                  edit styles: trash icon (delete; was the text "Delete"
 *                  until 2026-09-21) + Refile (Refile only when the caller
 *                  passes onRefile - storage/inboxFiling.ts's module doc
 *                  comment, 2026-09-09 §7) on the left, Cancel + Save on
 *                  the right - Refile's
 *                  own slot shows "File: <Name>" instead whenever a
 *                  recognized abbreviation #tag is present (onQuickFile,
 *                  independent of onRefile's own presence).
 *
 * Two persistent drafts, one edit-fields slot (design doc §5). `taskDraft`/
 * `meetingDraft` are created once and never reset by switching tabs or by an
 * edit starting/ending elsewhere on the same screen - that's what makes
 * "flip tabs mid-typing, come back, draft's still there" and "an edit
 * detour doesn't lose what you were adding" both true for free: neither
 * draft is touched by anything except its own submit/reset. `editFields`
 * holds the separate form state for whichever of `editingTask`/
 * `editingMeeting` is currently set - seeded by an effect, not by
 * remounting.
 *
 * No more `key`-remount trick. TaskQuickAdd/MeetingQuickAdd used to rely on
 * every call site passing `key={editingXKey ?? 'add'}` so the component
 * remounted (and re-ran its useState initializers) on every edit-target
 * change. That can't survive here - remounting this widget would wipe
 * taskDraft/meetingDraft, defeating the point above. QuickAddWidget must be
 * a stable, long-lived instance per screen; call sites pass no `key` at
 * all. The seeding effect below only reacts to `editingTask`/`editingMeeting`
 * *transitioning* between unset and set (tracked via `wasEditingRef`, not
 * the effect's dependency identity) - callers hand in a freshly-spread
 * object on every render (e.g. `{...task, text: displayTaskText(...)}`), so
 * keying naively off that object reference would reseed - and clobber
 * whatever the user just typed - on every unrelated re-render while an edit
 * is open.
 *
 * Direct switches (2026-09-29, docs/dev/technical-design-meeting-lists.md §10):
 * the screens no longer block tapping another row while an edit is open
 * ("Finish edit!"). A screen passes `editTargetKey` (a stable id of the
 * target, e.g. "meeting:/p#3"); when it changes while editing, the fields
 * reload from the new target. Before the screen switches, it calls
 * `flushEditRef.current()` (ui/useEditFlush.ts's afterSave), which saves the
 * current target's changes - only if the fields differ from what was loaded
 * - and resolves false when that save failed, so the screen stays on the
 * current target and the error shows. Leaving the tab (unmount) saves the
 * same way. Drafts of new items are separate and never saved implicitly.
 *
 * Row 2/row 3 never remount on tab switch (bugfix 2026-09-09). Task's and
 * Meeting's row2/row3 are both always in the tree; only their `display`
 * (styles.hidden) toggles with the active tab, so their TextInputs are
 * created once and stay mounted for the widget's whole lifetime. Swapping
 * the two subtrees in and out of the JSX instead (as this originally
 * shipped) forced Android to freshly create each TextInput's native view
 * on every tab switch, which briefly measured at its own intrinsic size
 * before the custom border/padding style applied - a one-frame "widget
 * grows, then shrinks back" flicker. Because the fields now stay mounted,
 * `autoFocus` can no longer reliably grab focus when an edit starts (it
 * only fires on mount); `taskInputRef`/`meetingInputRef` do that
 * imperatively instead, from a small dedicated effect below.
 *
 * Third mini-tab "Note" (2026-09-16, memory: feature_standalone_note_
 * quickadd.md) - creates a standalone, unlinked .note file (storage/
 * standaloneNotes.ts), not a fourth kind of edit-able item: `onAddNote`/
 * `noteFolderPath` are the only new props, both optional, and Row 1's Note
 * tab is rendered at all only when `onAddNote` is passed (same "absent, not
 * permanently greyed" convention `onRefile` already uses) - so screens with
 * no Files pane (Daily, Review's bare add-only cards) never show it. Where
 * it IS rendered, it's `disabled` purely off `noteFolderPath` being `null`
 * (no extra label/banner) - the Files pane's currently-browsed folder,
 * re-read fresh at the moment "+Add" is pressed, not frozen when the Note
 * tab was opened, so freely switching the Files pane around mid-draft does
 * nothing until Add is actually pressed. Tags aren't a separate input: typing
 * `#tag` into the title (or tapping a TagChips suggestion, which inserts/
 * removes `#tag` in the title text exactly like Todo/Meeting already do)
 * pins it; `#tag` tokens are stripped back out of the title before it's
 * saved, and become real Supernote page-keywords instead (`insertKeyWord`),
 * not this app's own `#context` markdown-tag convention. No edit mode, no
 * persistent per-tab drafts beyond the plain `noteDraft` below, no
 * project.txt/area.txt footprint at all.
 *
 * Date fields (2026-09-20, docs/dev/technical-design-meeting-date-nudge-and-new-
 * from-this.md §A): the Meeting date and the Todo due date are both
 * ui/DateInput.tsx now - a text field that shows a -1/Today/+1/+7 button strip
 * above itself while focused. Tapping the Todo 📅 icon unfolds the due field
 * and focuses it (`dueInputRef` + `dueFocusRequested` below) so the strip is
 * there straight away; an edit that merely starts with an existing due date
 * does NOT focus it (that focus belongs to the text field).
 *
 * "New from this" (2026-09-20, same design doc §B): a Meeting-edit-only Row 4
 * button (`handleNewFromThis`) that cancels the edit through the screen's own
 * `onCancelEdit` and flips this widget to Create·Meeting with the draft
 * pre-filled from the edit form's current values - so a meeting can be used
 * as the starting point for a new one. Where the original lives in a
 * different file than this widget would create in (Daily, Week: their
 * `fixedDestination` is always Inbox), the original's Project/Area
 * abbreviation #tag is appended to the draft title, which makes the existing
 * abbreviation quick-file machinery show "+ Add to <Name>", file it there and
 * strip the tag again on Add - the destination is visible and overridable by
 * deleting the tag.
 */
import React, {useEffect, useRef, useState} from 'react';
import {Keyboard, LayoutChangeEvent, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {AbbrevFileMatch, resolveAbbrevFileTarget} from '../domain/abbrev';
import {copyCutRange, Selection, spliceAtSelection} from '../domain/clipboardText';
import {describeAddedDate} from '../domain/dateLabel';
import {Destination, destinationLabel} from '../domain/destination';
import {joinItems, splitAtSelection, splitByHand} from '../domain/captureText';
import {composeTaskText} from '../domain/quickAddCompose';
import {extractContextTags, insertTagAtPosition, removeTagFromText, stripSpaceAfterHash} from '../domain/markdown';
import {formatMeetingWhen, MeetingField, todayIso, validateMeetingFields} from '../domain/meetingTime';
import {isHighlight, setHighlight} from '../domain/monthHighlight';
import {meetingDisplayTitle} from '../domain/meetingTracking';
import {FlowState, Meeting, Task} from '../domain/types';
import {getRecentTags, getRecentTagsSync, recordTagsUsed} from '../storage/tagUsage';
import {getRecentDestinations, getRecentDestinationsSync, recordDestinationUsed} from '../storage/destinationUsage';
import {FILE_TO_SHORT, fileToEligible, fileToLabel, fileToShortList} from '../domain/captureFileTo';
import ClipboardTextInput from './ClipboardTextInput';
import DateInput, {DateInputHandle} from './DateInput';
import FlowStateChips from './FlowStateChips';
import {ClipIcon, TrashIcon, WarningIcon} from './icons';
import {COLORS, FONT} from './theme';
import HighlightMark from './HighlightMark';
import TagChips from './TagChips';
import TagChipGrid, {GridChip} from './TagChipGrid';
import {useTagRowBudget} from './tagChipLayout';
import {useStatus} from './status/StatusProvider';
import MarkWrap from './status/StatusMark';
import {usePerfRender} from '../utils/perf';
import {useAbbrevItems} from './useAbbrevItems';
import {useOnScreenHide} from './screenActivity';
import {common} from './commonStyles';
import {errorMessage} from '../utils/errorMessage';

/** Same shape MeetingQuickAdd.tsx used to export - QuickAddWidget is now this type's home; other files import it from here. */
export interface MeetingQuickAddFields {
  title: string;
  date: string;
  /** Already normalized (HH:mm, zero-padded) or '' - see validateMeetingFields. */
  time: string;
  /** HH:mm end or '' (docs/dev/technical-design-monthly-view.md §2.3) - parsed from the same time field ("15-16.30"). */
  endTime: string;
  /** Whole days of a date-only meeting ("3d"), 1 for a timed one. A blank time field saves as 1 day. */
  days: number;
}

/**
 * `Selection`, `spliceAtSelection` and `copyCutRange` - the pure logic
 * behind the custom Select All/Copy/Cut/Paste overlay below (2026-09-11) -
 * now live in domain/clipboardText.ts (extracted 2026-09-11, same day as
 * the original bugfix, so ui/ClipboardTextInput.tsx - a reusable version of
 * the same field, used by any *new* plain text input that wants the same
 * copy/paste affordance - can share them instead of re-deriving them). See
 * that module for the full doc comment on why a custom overlay exists at
 * all on this hardware, and why the selection itself is tracked in a ref
 * (`taskLastSelectionRef`/`meetingLastSelectionRef` below), never React
 * state.
 */

interface TaskDraft {
  text: string;
  flowState: FlowState;
  waitingOnText: string;
  dueDate: string;
  /** Whether the due-date field has been unfolded - independent of dueDate's value, and stays true for the life of this draft once set (chat decision: "no need to hide date field again once shown"). */
  dueDateOpen: boolean;
}

interface MeetingDraft {
  title: string;
  date: string;
  /** The time field's raw text - "15", "15-16.30", "3d" or '' (= 1d); parsed on submit by validateMeetingFields. */
  time: string;
  /** The "M" toggle (docs/dev/technical-design-monthly-view.md §5.1) - composed into the title as `#monthly` on submit, never shown in the title field. */
  monthly: boolean;
}

/** Note has no edit mode and no metadata beyond its (taggable) title - one field is all this needs. */
interface NoteDraft {
  titleRaw: string;
}

interface TaskEditFields {
  text: string;
  flowState: FlowState;
  waitingOnText: string;
  dueDate: string;
  dueDateOpen: boolean;
  linkedFile: string;
}

interface MeetingEditFields {
  title: string;
  date: string;
  time: string;
  monthly: boolean;
  linkedFile: string;
}

type EditFields = {kind: 'task'; fields: TaskEditFields} | {kind: 'meeting'; fields: MeetingEditFields};

function makeTaskDraft(): TaskDraft {
  return {text: '', flowState: null, waitingOnText: '', dueDate: '', dueDateOpen: false};
}

function makeMeetingDraft(initialDate?: string, initialMonthly = false): MeetingDraft {
  // Time starts EMPTY (Tilman, 2026-09-23: "keep it empty, but fill it with
  // 1d if left empty" - most meetings get a time); a blank field is saved as 1d.
  return {title: '', date: initialDate ?? todayIso(), time: '', monthly: initialMonthly};
}

function makeNoteDraft(): NoteDraft {
  return {titleRaw: ''};
}

/**
 * Keeps Row 4's "+ Add to <Name>"/"File: <Name>" buttons from growing
 * unboundedly on a long Project/Area name (feature_abbrev_quick_file,
 * 2026-09-17 - "limit very long area and project names... enough to have
 * starting 10-15 characters") - shows the first 14 characters verbatim,
 * "…" beyond that. Display-only; never affects which item actually gets
 * matched/filed (resolveAbbrevFileTarget always sees the real, untruncated
 * name).
 */
/** Which field a Quick Add error is about - the in-place ⚠ mark goes there. */
type QuickAddField = 'text' | MeetingField;

/** Per-instance suffix for this widget's status-slot ids (several widgets can be mounted at once). */
let nextQuickAddInstance = 0;

function truncateItemName(name: string, max = 14): string {
  return name.length > max ? `${name.slice(0, max)}…` : name;
}

/**
 * What `onQuickFile` (edit mode) hands the caller to save at the resolved
 * target (feature_abbrev_quick_file, 2026-09-18 bugfix) - the widget's own
 * currently-edited text/fields, fully composed exactly the way `Save` itself
 * composes them (flow-state/due tags folded in via `setFlowStateTag`/
 * `setDueTag` for a task, `validateMeetingFields`-normalized for a meeting)
 * and with the matched abbreviation tag already stripped out via
 * `removeTagFromText`. Callers must NOT re-read their own last-*saved*
 * task/meeting for the text/title - that would silently discard whatever the
 * user typed or changed during this edit session (the original
 * implementation's bug: it moved the stale stored copy, tag and all,
 * ignoring any live edits). `linkedFile` is threaded through the same way
 * `onSaveEditTask`/`onSaveEditMeeting`'s own second parameter already is.
 * The `kind` always matches whichever of `editingTask`/`editingMeeting` is
 * currently set - callers already know this from their own edit-target
 * state, but it's included so this type stands alone as a single parameter.
 */
export type QuickFilePayload =
  | {kind: 'task'; text: string; linkedFile: string}
  | {kind: 'meeting'; fields: MeetingQuickAddFields; linkedFile: string};

/** Which Save button of the capture variant was pressed (docs/dev/technical-design-lasso-0.8.md §3.9). */
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

interface Props {
  /**
   * 'capture' (docs/dev/technical-design-lasso-0.8.md §3.9): the wide panel of
   * the lasso capture / marks screen - multi-line text or one row per item
   * (Split lines), flow chips without the paged tag row, Save & next / view /
   * close right under the input, then tag and "File to" chips in wrapped rows
   * and the screen's own extras. `fixedDestination` is the destination
   * picked there; a typed #ABBR still wins, as in Quick Add.
   */
  variant?: 'default' | 'capture';
  captureSeed?: CaptureSeed | null;
  /** After a successful capture save (all split items saved). */
  onCaptureSaved?: (mode: CaptureSaveMode) => void;
  /** "File to" chip pressed. */
  onCaptureDestinationChange?: (destination: Destination) => void;
  /** The mark's or lasso's own Project/Area - always in the short "File to" list. */
  captureOwnDestination?: Destination | null;
  /** Rendered below the chips (link checkbox, Mark for later / Cancel, ...). */
  captureExtras?: React.ReactNode;
  /**
   * Optional id of the screen slot this widget sits in (e.g. 'daily',
   * 'current') - its tag-row widths are remembered under it, so a revisit
   * needs no re-measure render (docs/dev/technical-design-render-perf-ab.md §3
   * A2). Omitted: widths are measured fresh on every mount, as before.
   */
  layoutKey?: string;
  /** Every add/edit goes to this one destination - no picker is ever shown (docs/dev/technical-design-filing-unification.md §7). */
  fixedDestination: Destination;
  /** Default false. When true, row 1 still renders both tabs (uniform shape everywhere), but Meeting is permanently greyed and non-interactive. */
  taskOnly?: boolean;
  /** Meeting create-mode default date (e.g. Daily's Today/Tomorrow toggle). Ignored while editing a meeting. */
  initialDate?: string;
  /** Meeting create-mode default for the "M" (month highlight) toggle - the Month view's day panel passes true. Ignored while editing. */
  initialMonthly?: boolean;
  /**
   * Whether a meeting dated `date` shows up in the list this screen is
   * currently displaying (Week: inside the displayed week; Daily: the shown
   * Today/Tomorrow tab's day). When given and it returns false for a
   * just-added meeting, the status-slot success message says where it went - `Added meeting "Team
   * sync" - next week` / `- tomorrow` / `- 09/28` (domain/dateLabel.ts) - so an
   * Add that legitimately lands off-screen is never mistaken for a lost one
   * (docs/dev/technical-design-cache-subscription-and-shared-add-path.md §C).
   * Omit on screens that list every meeting anyway (Inbox, Project/Area,
   * Review): no suffix, message unchanged.
   */
  isMeetingDateVisible?: (date: string) => boolean;

  onAddTask: (text: string, destination: Destination) => Promise<void>;
  onAddMeeting: (fields: MeetingQuickAddFields, destination: Destination) => Promise<void>;

  /** Mutually exclusive - the caller's own single edit-target state already keeps that invariant (design doc §6). */
  editingTask?: Task;
  editingMeeting?: Meeting;
  /** Resolve `false` when the save failed (the screen showed its own error) - the widget then keeps the edit open. */
  onSaveEditTask?: (nextText: string, nextLinkedFile: string) => Promise<void | boolean>;
  onSaveEditMeeting?: (fields: MeetingQuickAddFields, nextLinkedFile: string) => Promise<void | boolean>;
  /**
   * Identity of the item being edited (e.g. "path#index"). When it changes
   * while editing, the fields reload from the new target - switching
   * directly from one row to another used to keep the previous row's
   * fields (and Save then wrote them onto the new row). Without it, only
   * unset<->set transitions reload (the old behaviour).
   */
  editTargetKey?: string | null;
  /**
   * Save-then-switch (docs/dev/technical-design-meeting-lists.md §10, Tilman
   * 2026-09-29): the widget puts a `flush()` here that saves pending edits
   * of the current target (only when something changed) and resolves
   * whether the screen may move on. ui/useEditFlush.ts wraps a screen's
   * "start editing another row" handlers with it.
   */
  flushEditRef?: React.MutableRefObject<(() => Promise<boolean>) | null>;
  onCancelEdit?: () => void;
  onDeleteEdit?: () => void;
  /** Renders the "Refile" button in edit mode when provided (storage/inboxFiling.ts's module doc comment, 2026-09-09) - arms the caller's own Files pane (Projects/Areas tabs) for the item currently being edited, same shape onDeleteEdit already has. Only passed by screens with a Files pane to arm (Current tab, Inbox tab, Review's Inbox-to-zero step) - its absence (Daily, Review's week-ahead/stalled-project/neglected-area cards) is what makes those screens' edit mode show no Refile control at all, rather than a disabled one. */
  onRefile?: () => void;
  /**
   * Performs the abbreviation quick-file move directly (no Browse picker)
   * once a recognized #tag resolves to a registered Project/Area's
   * abbreviation, while editing an existing task/meeting
   * (feature_abbrev_quick_file, 2026-09-17) - renders "File: <Name>" in
   * Refile's own Row 4 slot whenever a match is present, independent of
   * onRefile's own presence (so it also works on a screen with no Files
   * pane to arm, like Daily, which never passes onRefile at all). Absent
   * entirely (no fallback, no error) on a screen whose edit mode doesn't
   * support moving an item to a different file yet. See `QuickFilePayload`'s
   * own doc comment for why this also hands the caller the fully-composed,
   * tag-stripped current text/fields rather than just the target.
   */
  onQuickFile?: (target: AbbrevFileMatch, payload: QuickFilePayload) => Promise<void>;
  /**
   * The REAL current location of the item being edited right now, for
   * resolveAbbrevFileTarget's self-exclude check (feature_abbrev_quick_file,
   * 2026-09-17) - `null` when it's an Inbox item (Inbox never carries an
   * abbreviation, so it can never self-match anyway). Omit this prop
   * entirely on a screen where `fixedDestination` already always names
   * whatever's being edited (Inbox tab, Current tab, Review's
   * Inbox-to-zero step - every one of those is either always `{type:
   * 'inbox'}` or always that Project/Area's own path): the exclude check
   * then falls back to deriving it from `fixedDestination` exactly as
   * before this prop existed. Daily is the one screen where that
   * fallback is wrong and this prop is required: Daily's
   * `fixedDestination` is always `{type: 'inbox'}` (its own create-mode
   * default, unrelated to any given entry), while the
   * DailyTaskEntry/DailyMeetingEntry actually being edited can live in
   * Inbox OR any Project/Area - passing this prop lets self-exclusion
   * check the entry's real path instead of always assuming Inbox (which
   * would otherwise show a same-place "File: <Name>" no-op button, or
   * worse, whenever the tag typed while editing happened to name the
   * item's own current Project/Area).
   */
  editingItemPath?: string | null;
  linkedFileMissing?: boolean;

  /**
   * Renders Row 1's third "Note" mini-tab when passed - creates a
   * standalone, unlinked .note file (storage/standaloneNotes.ts) at
   * `noteFolderPath`. `title` is already tag-stripped; `tags` are the
   * `#tag` tokens the widget parsed back out of the typed title, to be
   * applied as real Supernote page-keywords. Absent entirely (no tab
   * rendered at all) on screens with no Files pane to source a destination
   * from - see the module doc comment's "Third mini-tab" note.
   */
  onAddNote?: (title: string, tags: string[], folderPath: string) => Promise<void>;
  /**
   * Where a new Note would be created *right now* - the Files pane's
   * currently active location, `null` whenever its active root isn't the
   * item's own root ('Project Files'/'Area Files'). Re-read at the moment
   * "+Add" is pressed, not captured when the Note tab was opened - see the
   * module doc comment. Ignored when `onAddNote` isn't passed.
   */
  noteFolderPath?: string | null;

  /**
   * One-shot "put this text into the create draft" request (Gmail inbox
   * review, 2026-09-21 - selected email text -> Todo/Meeting, see
   * docs/dev/technical-design-gmail-body-select.md). Acts exactly when `nonce`
   * changes (a fresh `{...}` object with the SAME nonce does nothing, so a
   * caller can hold it in state without it re-firing on every re-render):
   * switches to the Todo or Meeting tab and APPENDS `text` to that draft's
   * task text / meeting title, separated by one space when the field already
   * has content (Tilman: several passages can be collected into one item).
   * Line breaks and repeated whitespace in `text` are collapsed to single
   * spaces first (a Todo/Meeting title is one line). Ignored while an edit
   * is open (the tabs are locked then) and for `kind: 'meeting'` on a
   * `taskOnly` widget. Never touches date/time/flow state, never focuses
   * a field (no soft keyboard pop-up on e-ink).
   */
  prefill?: {kind: 'task' | 'meeting'; text: string; nonce: number} | null;

  /** Set by the caller when a row tap was blocked because an edit is already open elsewhere on screen (design doc §6). Shown as a warning in the central status slot while editing (docs/dev/technical-design-status-slot.md §7.3); cleared by the caller, not the widget. */
  blockedMessage?: string;

  /** Task input only; defaults to "New task" everywhere (this pass drops the old per-screen "New todo" override as incidental cleanup). */
  placeholder?: string;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}

function QuickAddWidget({
  variant = 'default',
  captureSeed,
  onCaptureSaved,
  onCaptureDestinationChange,
  captureOwnDestination = null,
  captureExtras,
  layoutKey,
  fixedDestination,
  taskOnly = false,
  initialDate,
  initialMonthly,
  isMeetingDateVisible,
  onAddTask,
  onAddMeeting,
  editingTask,
  editingMeeting,
  onSaveEditTask,
  onSaveEditMeeting,
  editTargetKey,
  flushEditRef,
  onCancelEdit,
  onDeleteEdit,
  onRefile,
  onQuickFile,
  editingItemPath,
  linkedFileMissing,
  onAddNote,
  noteFolderPath = null,
  prefill,
  blockedMessage,
  placeholder = 'New task',
  textColor,
  borderColor,
  placeholderColor,
}: Props): React.JSX.Element {
  usePerfRender('QuickAddWidget');
  const [activeType, setActiveType] = useState<'task' | 'meeting' | 'note'>('task');
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(makeTaskDraft);
  const [meetingDraft, setMeetingDraft] = useState<MeetingDraft>(() => makeMeetingDraft(initialDate, initialMonthly));
  // Follow a changed `initialDate`/`initialMonthly` (the Month view's day
  // panel: tapping another day retargets the draft) - but only while the
  // draft is still untouched, so a half-typed meeting never jumps dates.
  useEffect(() => {
    setMeetingDraft(d =>
      d.title.trim() || d.time.trim()
        ? d
        : {...d, date: initialDate ?? d.date, monthly: initialMonthly ?? d.monthly},
    );
  }, [initialDate, initialMonthly]);
  const [noteDraft, setNoteDraft] = useState<NoteDraft>(makeNoteDraft);
  // ---- capture variant (docs/dev/technical-design-lasso-0.8.md §3.9) ----
  const isCapture = variant === 'capture';
  // One row per item while "Split lines" is on; null = one item in taskDraft.text.
  const [splitRows, setSplitRows] = useState<string[] | null>(null);
  const [splitPage, setSplitPage] = useState(0);
  // "File to": short list, or the full alphabetical list (paged) behind More….
  const [recentDestinations, setRecentDestinations] = useState<string[]>(() => getRecentDestinationsSync() ?? []);
  const [fileToAll, setFileToAll] = useState(false);
  const [fileToPage, setFileToPage] = useState(0);
  useEffect(() => {
    if (!isCapture) return;
    let alive = true;
    getRecentDestinations().then(paths => {
      if (alive) setRecentDestinations(paths);
    });
    return () => {
      alive = false;
    };
  }, [isCapture]);
  const seedKeyRef = useRef<string | null>(null);
  // The user typed since the last seed - recognition then never overwrites.
  const captureTouchedRef = useRef(false);
  const seedSignature = captureSeed
    ? `${captureSeed.key}\u0000${captureSeed.split}\u0000${captureSeed.items.join('\n')}\u0000${captureSeed.meetingTitle ?? ''}`
    : null;
  useEffect(() => {
    if (!isCapture || !captureSeed) return;
    const newKey = captureSeed.key !== seedKeyRef.current;
    if (!newKey && captureTouchedRef.current) return;
    seedKeyRef.current = captureSeed.key;
    captureTouchedRef.current = false;
    const items = captureSeed.items.length > 0 ? captureSeed.items : [''];
    const split = captureSeed.split && items.length > 1;
    if (newKey) {
      setTaskDraft({...makeTaskDraft(), text: split ? '' : items[0]});
      setMeetingDraft({...makeMeetingDraft(captureSeed.date ?? initialDate), title: captureSeed.meetingTitle ?? joinItems(items)});
    } else {
      setTaskDraft(d => ({...d, text: split ? '' : items[0]}));
      setMeetingDraft(d => ({...d, title: captureSeed.meetingTitle ?? joinItems(items)}));
    }
    setSplitRows(split ? items : null);
    setSplitPage(0);
    taskLastSelectionRef.current = null;
    meetingLastSelectionRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCapture, seedSignature]);
  const [taskJustAdded, setTaskJustAdded] = useState<string | null>(null);
  const [meetingJustAdded, setMeetingJustAdded] = useState<string | null>(null);
  // Set together with meetingJustAdded when the added meeting's date is not in the screen's visible list (isMeetingDateVisible); null otherwise.
  const [meetingAddedWhen, setMeetingAddedWhen] = useState<string | null>(null);
  // Row 4's centre note after "New from this" (a complete string, unlike
  // meetingJustAdded's bare title). Mutually exclusive with meetingJustAdded:
  // handleNewFromThis clears the latter, and any edit or Add clears this one.
  const [meetingCopyNote, setMeetingCopyNote] = useState<string | null>(null);
  const [noteJustAdded, setNoteJustAdded] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<EditFields | null>(null);
  const [pending, setPending] = useState(false);
  // Validation/save error, plus which field it's about (drives the in-place
  // ⚠ mark; null = the Add/Save button gets it). The text itself goes to
  // the central status slot (docs/dev/technical-design-status-slot.md §7.3).
  const [errorState, setErrorState] = useState<{text: string; field: QuickAddField | null} | null>(null);
  const error = errorState?.text ?? null;
  const setError = (text: string | null, field: QuickAddField | null = null) =>
    setErrorState(text ? {text, field} : null);
  const fieldMark = (field: QuickAddField) => (errorState?.field === field ? ('warning' as const) : null);
  // "Saved …" after a successful edit save (D9) - shown once the edit form
  // closes, cleared like the "Added" messages on the next typing.
  const [savedNote, setSavedNote] = useState<string | null>(null);

  // Context-tag suggestion row state (technical-design-context-tags.md §5,
  // §8). `recentTags` is loaded once on mount and refreshed after every
  // successful add/edit save (recordTagsUsed may have changed the order);
  // `taskTagPage`/`meetingTagPage` are lifted here rather than owned inside
  // TagChips because for Todo the page number also decides whether
  // FlowStateChips shows at all (see TagChips.tsx's own doc comment) - reset
  // to 0 wherever the create/edit target changes (the wasEditingRef
  // transition effect below, and each successful create submit).
  // Starts from the last list read this session (render-perf-ab §3 A1), so
  // the mount-time refresh below only re-renders if the list changed.
  const [recentTags, setRecentTags] = useState<string[]>(() => getRecentTagsSync() ?? []);
  const applyRecentTags = (tags: string[]) =>
    setRecentTags(prev => (prev.length === tags.length && prev.every((t, i) => t === tags[i]) ? prev : tags));
  const [taskTagPage, setTaskTagPage] = useState(0);
  const [meetingTagPage, setMeetingTagPage] = useState(0);
  const [noteTagPage, setNoteTagPage] = useState(0);
  // Set for exactly one render right after a tag is inserted, so the
  // TextInput's `selection` prop can jump the cursor to just past the
  // inserted tag - then released back to uncontrolled (see the domain
  // Selection type's doc comment on why this isn't controlled all the
  // time). Cleared by the field's own onSelectionChange once RN reports
  // the selection actually landed there.
  const [taskSelectionOverride, setTaskSelectionOverride] = useState<Selection>(null);
  const [meetingSelectionOverride, setMeetingSelectionOverride] = useState<Selection>(null);
  // Whether the task-text/meeting-title field currently has focus - shows/
  // hides the custom Select All/Copy/Cut/Paste overlay (Tilman, 2026-09-11:
  // "only while that field is focused"). See that overlay's render for why
  // it stays mounted (display:none) rather than being conditionally
  // included/excluded from the tree.
  const [taskInputFocused, setTaskInputFocused] = useState(false);
  const [meetingInputFocused, setMeetingInputFocused] = useState(false);

  const refreshRecentTags = () => {
    getRecentTags().then(applyRecentTags);
  };

  useEffect(() => {
    let cancelled = false;
    getRecentTags().then(tags => {
      if (!cancelled) applyRecentTags(tags);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Task/Meeting field groups (row 2 + row 3) stay mounted at all times -
  // see the "no tab-switch flicker" note below on taskRow2/meetingRow2 - so
  // the main TextInput for each is a stable, long-lived native view rather
  // than something freshly created when a tab becomes active. That means
  // the `autoFocus` prop (which only fires on mount) can't reliably grab
  // focus when an edit starts, so it's done imperatively via these refs
  // instead, in the focus effect further below.
  const taskInputRef = useRef<TextInput>(null);
  const meetingInputRef = useRef<TextInput>(null);
  // The Todo due-date field only exists in the tree once unfolded (or once an
  // edit seeds an existing due date), so focusing it right after the 📅 tap
  // has to wait for that render to commit - `dueFocusRequested` is set by
  // openTaskDueDate and consumed by the effect below, same idea as the
  // `hasEditFields` focus effect further down.
  const dueInputRef = useRef<DateInputHandle>(null);
  const [dueFocusRequested, setDueFocusRequested] = useState(false);
  useEffect(() => {
    if (!dueFocusRequested) return;
    dueInputRef.current?.focus();
    setDueFocusRequested(false);
  }, [dueFocusRequested]);
  // Last known cursor/selection position for each field's text - see the
  // `Selection` type's doc comment above for why these are refs (no
  // re-render) rather than part of TaskDraft/TaskEditFields state.
  const taskLastSelectionRef = useRef<Selection>(null);
  const meetingLastSelectionRef = useRef<Selection>(null);

  // See the module doc comment's "No more key-remount trick" note - only
  // reacts to unset<->set transitions, never to editingTask/editingMeeting
  // being a fresh object with the same underlying target.
  const wasEditingRef = useRef(false);
  // The target the fields were last loaded from, and those fields as loaded
  // (JSON) - `flush` compares against it to save only real changes.
  const lastTargetKeyRef = useRef<string | null | undefined>(undefined);
  const loadedFieldsRef = useRef<string | null>(null);
  useEffect(() => {
    const isEditingNow = !!editingTask || !!editingMeeting;
    const targetChanged = editTargetKey !== undefined && editTargetKey !== lastTargetKeyRef.current;
    if (isEditingNow && (!wasEditingRef.current || targetChanged)) {
      // Fresh edit target: the previous field's cursor position is no
      // longer meaningful, same as the old `lastSelection: null` reset this
      // used to do inline - see taskLastSelectionRef/meetingLastSelectionRef's
      // doc comment for why this now lives in a ref instead of field state.
      taskLastSelectionRef.current = null;
      meetingLastSelectionRef.current = null;
      let loaded: EditFields | null = null;
      if (editingTask) {
        loaded = {
          kind: 'task',
          fields: {
            text: editingTask.text,
            flowState: editingTask.flowState,
            waitingOnText: editingTask.waitingOn ?? '',
            dueDate: editingTask.dueDate ?? '',
            dueDateOpen: !!editingTask.dueDate,
            linkedFile: editingTask.linkedFile ?? '',
          },
        };
      } else if (editingMeeting) {
        loaded = {
          kind: 'meeting',
          fields: {
            // `#monthly` is edited through the M toggle, not as title text.
            title: setHighlight(editingMeeting.title, false),
            date: editingMeeting.date,
            time: formatMeetingWhen(editingMeeting),
            monthly: isHighlight(editingMeeting),
            linkedFile: editingMeeting.linkedFile ?? '',
          },
        };
      }
      setEditFields(loaded);
      loadedFieldsRef.current = loaded ? JSON.stringify(loaded.fields) : null;
      setError(null);
      setSavedNote(null);
      setTaskTagPage(0);
      setMeetingTagPage(0);
    } else if (!isEditingNow && wasEditingRef.current) {
      setEditFields(null);
      loadedFieldsRef.current = null;
      setError(null);
      setTaskTagPage(0);
      setMeetingTagPage(0);
    }
    wasEditingRef.current = isEditingNow;
    lastTargetKeyRef.current = isEditingNow ? editTargetKey : undefined;
  }, [editingTask, editingMeeting, editTargetKey]);

  // Applies a caller's one-shot `prefill` request (see the prop's doc
  // comment). Keyed on the nonce only - `prefill` itself may be a fresh
  // object on every parent render. `handledPrefillNonceRef` additionally
  // guards against a remount/StrictMode double-run applying the same request
  // twice (which would append the text twice).
  const handledPrefillNonceRef = useRef<number | null>(prefill ? prefill.nonce : null);
  useEffect(() => {
    if (!prefill || prefill.nonce === handledPrefillNonceRef.current) return;
    handledPrefillNonceRef.current = prefill.nonce;
    if (isEditing) return;
    const addition = prefill.text.replace(/\s+/g, ' ').trim();
    if (!addition) return;
    const appendTo = (current: string): string => (current.trim() ? `${current.replace(/\s+$/, '')} ${addition}` : addition);
    if (prefill.kind === 'task') {
      setTaskDraft(d => ({...d, text: stripSpaceAfterHash(appendTo(d.text))}));
      taskLastSelectionRef.current = null;
      setTaskJustAdded(null);
      setTaskTagPage(0);
      setActiveType('task');
    } else if (!taskOnly) {
      setMeetingDraft(d => ({...d, title: stripSpaceAfterHash(appendTo(d.title))}));
      meetingLastSelectionRef.current = null;
      setMeetingJustAdded(null);
      setMeetingAddedWhen(null);
      setMeetingCopyNote(null);
      setMeetingTagPage(0);
      setActiveType('meeting');
    }
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefill?.nonce]);

  // Focusing the right field on edit-start has to be its own effect, keyed
  // off `editFields` (state) rather than done inline in the seeding effect
  // above. At the point the seeding effect runs, editFields has only just
  // been *scheduled* to update - the row's `display: none -> flex` toggle
  // (which depends on displayType, which depends on editFields) hasn't
  // committed yet, so a same-tick `.focus()` call can land on a still-
  // hidden native view and silently no-op. This effect instead fires after
  // React commits the render where editFields (and so displayType) has
  // actually taken effect - the dependency is deliberately `editFields !==
  // null` rather than `editFields` itself, so retyping into an open edit
  // (which replaces editFields on every keystroke) doesn't keep stealing
  // focus back.
  const hasEditFields = editFields !== null;
  useEffect(() => {
    if (editFields?.kind === 'task') taskInputRef.current?.focus();
    else if (editFields?.kind === 'meeting') meetingInputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasEditFields]);

  // What's actually showing - the edit target's own type while one is open
  // (row 1 "forced to match" per design doc §5), the freely-toggled
  // activeType otherwise. Deliberately never writes editFields' type back
  // into activeType, so activeType (and therefore the create draft it
  // points at) is exactly where it was before the edit detour once
  // editFields clears again - the "draft + active tab stashed" flow the
  // mockup demonstrates falls out of this for free.
  const displayType: 'task' | 'meeting' | 'note' = editFields ? editFields.kind : activeType;
  const isEditing = editFields !== null;

  const todoTabDisabled = editFields?.kind === 'meeting';
  const meetingTabDisabled = taskOnly || editFields?.kind === 'task';
  // Note has no edit mode of its own, so it's never locked by editFields -
  // only by not having a valid destination right now (see the module doc
  // comment's "Third mini-tab" note).
  const noteTabDisabled = !noteFolderPath;

  const selectTab = (type: 'task' | 'meeting' | 'note') => {
    if (isEditing) return; // locked tabs are non-interactive while editing
    if (type === 'meeting' && taskOnly) return;
    if (type === 'note' && !noteFolderPath) return;
    setActiveType(type);
  };

  // Any typing/chip change in the widget clears its own slot messages:
  // the ✓ and "Added …" go as soon as the next item is started (§8 Q13),
  // and an error (with its ⚠ mark) as soon as the user starts fixing it.
  const clearTransientMessages = () => {
    if (errorState !== null) setErrorState(null);
    if (savedNote !== null) setSavedNote(null);
  };
  const clearTaskJustAdded = () => {
    if (taskJustAdded !== null) setTaskJustAdded(null);
    clearTransientMessages();
  };
  const clearMeetingJustAdded = () => {
    if (meetingJustAdded !== null) setMeetingJustAdded(null);
    if (meetingAddedWhen !== null) setMeetingAddedWhen(null);
    if (meetingCopyNote !== null) setMeetingCopyNote(null);
    clearTransientMessages();
  };
  const clearNoteJustAdded = () => {
    if (noteJustAdded !== null) setNoteJustAdded(null);
    clearTransientMessages();
  };

  const updateTaskEditField = (patch: Partial<TaskEditFields>) => {
    setEditFields(current => (current?.kind === 'task' ? {kind: 'task', fields: {...current.fields, ...patch}} : current));
  };
  const updateMeetingEditField = (patch: Partial<MeetingEditFields>) => {
    setEditFields(current => (current?.kind === 'meeting' ? {kind: 'meeting', fields: {...current.fields, ...patch}} : current));
  };

  const submitTaskCreate = () => {
    Keyboard.dismiss();
    const trimmed = taskDraft.text.trim();
    if (!trimmed) return;
    // Flow-state, due and - for abbreviation quick-file (feature_abbrev_quick_file,
    // 2026-09-18 bugfix) - removing the matched #tag, which did its job picking the
    // destination: domain/quickAddCompose.ts, shared with the lasso capture panel.
    const finalText = composeTaskText(taskDraft, taskAbbrevTarget ? taskAbbrevTarget.tag : null);
    setError(null);
    setPending(true);
    onAddTask(finalText, taskAbbrevTarget ? abbrevDestination(taskAbbrevTarget) : fixedDestination)
      .then(() => {
        setTaskDraft(d => ({...d, text: '', flowState: null, waitingOnText: '', dueDate: ''}));
        taskLastSelectionRef.current = null;
        setTaskJustAdded(
          `Added todo "${truncateItemName(trimmed, 40)}" to ${destinationLabel(
            taskAbbrevTarget ? abbrevDestination(taskAbbrevTarget) : fixedDestination,
          )}`,
        );
        setTaskTagPage(0);
        recordTagsUsed(extractContextTags(finalText)).then(refreshRecentTags);
      })
      .catch(e => setError(errorMessage(e)))
      .finally(() => setPending(false));
  };

  const submitTaskEdit = (): Promise<boolean> => {
    if (!editFields || editFields.kind !== 'task') return Promise.resolve(true);
    Keyboard.dismiss();
    const trimmed = editFields.fields.text.trim();
    if (!trimmed) {
      setError('A todo needs some text.', 'text');
      return Promise.resolve(false);
    }
    const finalText = composeTaskText(editFields.fields);
    setError(null);
    setPending(true);
    return (onSaveEditTask ?? (() => Promise.resolve()))(finalText, editFields.fields.linkedFile)
      .then(result => {
        if (result === false) return false;
        setSavedNote(`Saved todo "${truncateItemName(trimmed, 40)}"`);
        recordTagsUsed(extractContextTags(finalText)).then(refreshRecentTags);
        return true;
      })
      .catch(e => {
        setError(errorMessage(e));
        return false;
      })
      .finally(() => setPending(false));
  };

  const submitMeetingCreate = () => {
    Keyboard.dismiss();
    const result = validateMeetingFields(meetingDraft.title, meetingDraft.date, meetingDraft.time);
    if (!result.ok) {
      setError(result.error, result.field);
      return;
    }
    // Abbreviation quick-file (feature_abbrev_quick_file, 2026-09-18
    // bugfix): see submitTaskCreate's identical note just above.
    const trimmedTitle = setHighlight(
      meetingAbbrevTarget
        ? removeTagFromText(meetingDraft.title.trim(), meetingAbbrevTarget.tag)
        : meetingDraft.title.trim(),
      meetingDraft.monthly,
    );
    const addedDate = meetingDraft.date;
    setError(null);
    setPending(true);
    onAddMeeting(
      {title: trimmedTitle, date: addedDate, time: result.time, endTime: result.endTime, days: result.days},
      meetingAbbrevTarget ? abbrevDestination(meetingAbbrevTarget) : fixedDestination,
    )
      .then(() => {
        setMeetingDraft(makeMeetingDraft(initialDate, initialMonthly));
        meetingLastSelectionRef.current = null;
        setMeetingCopyNote(null);
        setMeetingJustAdded(
          `Added meeting "${truncateItemName(meetingDisplayTitle({title: trimmedTitle}), 40)}" to ${destinationLabel(
            meetingAbbrevTarget ? abbrevDestination(meetingAbbrevTarget) : fixedDestination,
          )}`,
        );
        setMeetingAddedWhen(isMeetingDateVisible && !isMeetingDateVisible(addedDate) ? describeAddedDate(addedDate) : null);
        setMeetingTagPage(0);
        recordTagsUsed(extractContextTags(trimmedTitle)).then(refreshRecentTags);
      })
      .catch(e => setError(errorMessage(e)))
      .finally(() => setPending(false));
  };

  const submitMeetingEdit = (): Promise<boolean> => {
    if (!editFields || editFields.kind !== 'meeting') return Promise.resolve(true);
    Keyboard.dismiss();
    const result = validateMeetingFields(editFields.fields.title, editFields.fields.date, editFields.fields.time);
    if (!result.ok) {
      setError(result.error, result.field);
      return Promise.resolve(false);
    }
    const trimmedTitle = setHighlight(editFields.fields.title.trim(), editFields.fields.monthly);
    setError(null);
    setPending(true);
    return (onSaveEditMeeting ?? (() => Promise.resolve()))(
      {title: trimmedTitle, date: editFields.fields.date, time: result.time, endTime: result.endTime, days: result.days},
      editFields.fields.linkedFile,
    )
      .then(saved => {
        if (saved === false) return false;
        setSavedNote(`Saved meeting "${truncateItemName(meetingDisplayTitle({title: trimmedTitle}), 40)}"`);
        recordTagsUsed(extractContextTags(trimmedTitle)).then(refreshRecentTags);
        return true;
      })
      .catch(e => {
        setError(errorMessage(e));
        return false;
      })
      .finally(() => setPending(false));
  };

  /**
   * Save-then-switch (see the `flushEditRef` prop): saves the current edit
   * target's pending changes - only if something changed - and resolves
   * whether the caller may move on (false = validation or save failed; the
   * error is showing and the edit stays open). Also run when the widget
   * unmounts mid-edit (leaving the tab/screen), fire-and-forget.
   */
  const flushEdit = (): Promise<boolean> => {
    if (!editFields) return Promise.resolve(true);
    if (JSON.stringify(editFields.fields) === loadedFieldsRef.current) return Promise.resolve(true);
    return editFields.kind === 'task' ? submitTaskEdit() : submitMeetingEdit();
  };
  const latestFlushRef = useRef(flushEdit);
  latestFlushRef.current = flushEdit;
  if (flushEditRef) flushEditRef.current = () => latestFlushRef.current();
  useEffect(
    () => () => {
      // Unmount while editing (tab/screen left): save what changed.
      latestFlushRef.current().catch(() => undefined);
      if (flushEditRef) flushEditRef.current = null;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  // Kept tab hidden (docs/dev/technical-design-keep-tabs-alive.md §4.1, D2):
  // same as leaving the tab used to be - save what changed, then close the
  // edit. If the save fails, the edit stays open and its error shows when
  // the tab is shown again. Drafts of new items are left as they are (D3).
  useOnScreenHide(() => {
    Keyboard.dismiss();
    if (!editFields) return;
    latestFlushRef
      .current()
      .then(ok => {
        if (ok) onCancelEdit?.();
      })
      .catch(() => undefined);
  });

  // ---- Note create (no edit mode) ----
  const setNoteTitleRaw = (t: string) => {
    setNoteDraft(d => ({...d, titleRaw: stripSpaceAfterHash(t)}));
    clearNoteJustAdded();
  };
  const insertNoteTag = (tag: string) => {
    setNoteTitleRaw(insertTagAtPosition(noteDraft.titleRaw, tag, null).text);
  };
  const removeNoteTag = (tag: string) => {
    setNoteTitleRaw(removeTagFromText(noteDraft.titleRaw, tag));
  };

  const submitNoteCreate = () => {
    Keyboard.dismiss();
    if (!onAddNote) return;
    const tags = extractContextTags(noteDraft.titleRaw);
    const cleanTitle = tags.reduce((t, tag) => removeTagFromText(t, tag), noteDraft.titleRaw).trim();
    if (!cleanTitle) return;
    if (!noteFolderPath) {
      setError('Switch the Files pane back to Project Files/Area Files to add a note here.');
      return;
    }
    setError(null);
    setPending(true);
    onAddNote(cleanTitle, tags, noteFolderPath)
      .then(() => {
        setNoteDraft(makeNoteDraft());
        setNoteJustAdded(`Created note "${truncateItemName(cleanTitle, 40)}"`);
        setNoteTagPage(0);
        recordTagsUsed(tags).then(refreshRecentTags);
      })
      .catch(e => setError(errorMessage(e)))
      .finally(() => setPending(false));
  };

  const handleDelete = () => {
    Keyboard.dismiss();
    onDeleteEdit?.();
  };

  const handleRefile = () => {
    Keyboard.dismiss();
    onRefile?.();
  };

  /**
   * "New from this" (docs/dev/technical-design-meeting-date-nudge-and-new-from-
   * this.md §B) - Meeting edit mode only. Uses the edit form's CURRENT values
   * (unsaved tweaks included) as the starting point of a new meeting: puts
   * them in the Meeting create draft (replacing whatever was in it), switches
   * to the Meeting tab, and ends the edit via the screen's own onCancelEdit
   * (highlight off, nothing saved, original untouched). Not carried over:
   * linked file/note (they belong to the original) and the
   * #prepped/#reviewed tick tags (a copy starts un-ticked -
   * meetingDisplayTitle strips them).
   *
   * Destination: when the original lives somewhere other than where this
   * widget creates (Daily and Week create in Inbox no matter where the edited
   * meeting is), the original's Project/Area abbreviation tag is appended to
   * the draft title. That is all it takes - resolveAbbrevFileTarget then
   * matches it, Row 4 shows "+ Add to <Name>", submitMeetingCreate files it
   * there and strips the tag - and the user can override by deleting the tag.
   * Only inserted when the tag will actually resolve (the item has an
   * abbreviation and is Active/On Hold, same eligibility as
   * resolveAbbrevFileTarget) and the title doesn't already carry a recognized
   * abbreviation tag of its own (an explicit tag wins). On screens whose
   * fixedDestination already IS the original's file (Current tab, Inbox tab,
   * Review's Inbox-to-zero) nothing is inserted - it would only self-exclude.
   *
   * All state changes happen in one event handler (one batched render), and
   * the draft is set BEFORE the edit ends, so no frame shows an empty draft.
   */
  const handleNewFromThis = () => {
    if (editFields?.kind !== 'meeting' || !onCancelEdit) return;
    Keyboard.dismiss();
    const fields = editFields.fields;
    const displayTitle = meetingDisplayTitle({title: fields.title});
    let draftTitle = displayTitle;
    const originPath = editingItemPath !== undefined ? editingItemPath : fixedExcludePath;
    const origin = originPath && originPath !== fixedExcludePath ? cachedAbbrevItems.find(item => item.path === originPath) : undefined;
    if (
      origin?.abbrev &&
      (origin.status === 'active' || origin.status === 'on-hold') &&
      !resolveAbbrevFileTarget(displayTitle, cachedAbbrevItems, fixedExcludePath)
    ) {
      draftTitle = insertTagAtPosition(displayTitle, origin.abbrev, null).text;
    }
    // M is not carried over - highlights are hand-picked per meeting.
    setMeetingDraft({title: draftTitle, date: fields.date, time: fields.time, monthly: false});
    meetingLastSelectionRef.current = null;
    setMeetingTagPage(0);
    setMeetingJustAdded(null);
    setMeetingAddedWhen(null);
    setMeetingCopyNote(`Copied "${truncateItemName(displayTitle, 16)}" - adjust, then Add`);
    setError(null);
    setActiveType('meeting');
    onCancelEdit();
  };

  // ---- Row 1: Tabs ----
  const row1 = (
    <View style={styles.row1}>
      <View style={styles.tabs}>
        <Pressable onPress={() => selectTab('task')} hitSlop={8} disabled={isEditing || todoTabDisabled}>
          <Text
            style={[
              styles.tabText,
              {color: textColor},
              displayType === 'task' && styles.tabTextActive,
              todoTabDisabled && styles.tabTextDisabled,
            ]}>
            Todo
          </Text>
        </Pressable>
        <Pressable onPress={() => selectTab('meeting')} hitSlop={8} disabled={isEditing || meetingTabDisabled}>
          <Text
            style={[
              styles.tabText,
              {color: textColor},
              displayType === 'meeting' && styles.tabTextActive,
              meetingTabDisabled && styles.tabTextDisabled,
            ]}>
            Meeting
          </Text>
        </Pressable>
        {onAddNote && (
          <Pressable onPress={() => selectTab('note')} hitSlop={8} disabled={isEditing || noteTabDisabled}>
            <Text
              style={[
                styles.tabText,
                {color: textColor},
                displayType === 'note' && styles.tabTextActive,
                noteTabDisabled && styles.tabTextDisabled,
              ]}>
              Note
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );

  // ---- Tag display: recognized-abbreviation uppercasing (2026-09-18) ----
  // Tilman: "write recognized area or project tags with upper case letters
  // so they are immediately visible as such in the tag list" - purely a
  // TagChips display transform (Row 3's tag chip row, both pinned and
  // suggested chips), never touches the stored/typed text, matching, or
  // `onInsertTag`/`onRemoveTag`'s own tag string. "Recognized" uses the same
  // Active-or-On-Hold eligibility resolveAbbrevFileTarget itself applies
  // (chat, 2026-09-18) - a Done/Archived item's old abbreviation still
  // renders as a plain lowercase tag, consistent with it no longer being a
  // valid quick-file target either. Hoisted above Row 2/3 (rather than
  // living alongside the abbrev quick-file section below, which also reads
  // `getCachedData()`) purely so it's declared before every TagChips call
  // site that needs it; `cachedAbbrevItems` below reuses this same read
  // rather than calling `getCachedData()` a second time.
  // Subscribed (not a plain getCachedData() read) since this component is
  // React.memo'd (render-perf-ab §3 B2): it must re-render by itself when an
  // abbreviation or status changes, as it did before through its parent -
  // but only then (useAbbrevItems, render-perf-ab §7), not on every cache
  // change. Returns [] while no cache exists yet.
  const cachedAbbrevItems = useAbbrevItems();
  const recognizedAbbrevTags = new Set(
    cachedAbbrevItems
      .filter(item => item.abbrev !== null && (item.status === 'active' || item.status === 'on-hold'))
      .map(item => item.abbrev!.toLowerCase()),
  );

  // ---- Row 2 + Row 3: Task style ----
  const taskFields = editFields?.kind === 'task' ? editFields.fields : taskDraft;
  const setTaskText = (t: string) => {
    captureTouchedRef.current = true;
    const stripped = stripSpaceAfterHash(t);
    if (editFields?.kind === 'task') updateTaskEditField({text: stripped});
    else setTaskDraft(d => ({...d, text: stripped}));
    clearTaskJustAdded();
  };
  const setTaskDueDate = (d: string) => {
    if (editFields?.kind === 'task') updateTaskEditField({dueDate: d});
    else setTaskDraft(dr => ({...dr, dueDate: d}));
    clearTaskJustAdded();
  };
  const openTaskDueDate = () => {
    if (editFields?.kind === 'task') updateTaskEditField({dueDateOpen: true});
    else setTaskDraft(d => ({...d, dueDateOpen: true}));
    // Focus the freshly unfolded field so its -1/Today/+1/+7 strip shows at once.
    setDueFocusRequested(true);
  };
  const setTaskFlowState = (next: FlowState) => {
    if (editFields?.kind === 'task') updateTaskEditField({flowState: next});
    else setTaskDraft(d => ({...d, flowState: next}));
    clearTaskJustAdded();
  };
  const setTaskWaitingOn = (w: string) => {
    const stripped = stripSpaceAfterHash(w);
    if (editFields?.kind === 'task') updateTaskEditField({waitingOnText: stripped});
    else setTaskDraft(d => ({...d, waitingOnText: stripped}));
    clearTaskJustAdded();
  };
  const clearTaskLinkedFile = () => updateTaskEditField({linkedFile: ''});
  const insertTaskTag = (tag: string) => {
    const {text, cursor} = insertTagAtPosition(taskFields.text, tag, taskLastSelectionRef.current?.start ?? null);
    setTaskText(text);
    const selection = {start: cursor, end: cursor};
    taskLastSelectionRef.current = selection;
    setTaskSelectionOverride(selection);
  };
  const removeTaskTag = (tag: string) => {
    setTaskText(removeTagFromText(taskFields.text, tag));
  };
  // No setState here on purpose - see the `Selection` type's doc comment.
  // onSelectionChange fires on almost every cursor/selection movement, and
  // a setState-driven re-render on every one of those was what broke native
  // text selection (drag handles, the copy/cut/paste/select-all action bar)
  // on Android (2026-09-11 bugfix).
  const onTaskSelectionChange = (selection: Selection) => {
    taskLastSelectionRef.current = selection;
    if (taskSelectionOverride) setTaskSelectionOverride(null);
  };

  // Custom Select All/Copy/Cut/Paste (see the module doc comment on
  // spliceAtSelection/copyCutRange for why these exist at all).
  const handleTaskSelectAll = () => {
    const selection = {start: 0, end: taskFields.text.length};
    taskLastSelectionRef.current = selection;
    setTaskSelectionOverride(selection);
  };
  const handleTaskCopy = () => {
    const {start, end} = copyCutRange(taskFields.text, taskLastSelectionRef.current);
    Clipboard.setString(taskFields.text.slice(start, end));
  };
  const handleTaskCut = () => {
    const range = copyCutRange(taskFields.text, taskLastSelectionRef.current);
    Clipboard.setString(taskFields.text.slice(range.start, range.end));
    const {text, cursor} = spliceAtSelection(taskFields.text, range, '');
    setTaskText(text);
    const selection = {start: cursor, end: cursor};
    taskLastSelectionRef.current = selection;
    setTaskSelectionOverride(selection);
  };
  const handleTaskPaste = async () => {
    const clip = await Clipboard.getString();
    if (!clip) return;
    const {text, cursor} = spliceAtSelection(taskFields.text, taskLastSelectionRef.current, clip);
    setTaskText(text);
    const selection = {start: cursor, end: cursor};
    taskLastSelectionRef.current = selection;
    setTaskSelectionOverride(selection);
  };

  // The due-date control: in R2 next to the field; in the capture variant
  // in the options row under it (checkpoint B).
  const taskDueControl =
    taskFields.dueDateOpen ? (
      <View style={styles.dateInline}>
        <DateInput
          ref={dueInputRef}
          value={taskFields.dueDate}
          onChangeText={setTaskDueDate}
          placeholder="Due YYYY-MM-DD"
          placeholderColor={placeholderColor}
          textColor={textColor}
          borderColor={borderColor}
        />
        {taskFields.dueDate.length > 0 && (
          <Pressable onPress={() => setTaskDueDate('')} hitSlop={8}>
            <Text style={[styles.clearX, {color: textColor}]}>✕</Text>
          </Pressable>
        )}
      </View>
    ) : (
      <Pressable style={[styles.iconButton, {borderColor}]} onPress={openTaskDueDate} hitSlop={8}>
        <Text style={[styles.iconButtonText, {color: textColor}]}>📅</Text>
      </Pressable>
    );
  // ---- Capture: Split lines (docs/dev/technical-design-lasso-0.8.md §3.5, §3.9) ----
  // One editable row per item, each removable; more than SPLIT_ROWS_PER_PAGE
  // rows page with ‹ › instead of scrolling. Chips apply to every row.
  function toggleSplit() {
    captureTouchedRef.current = true;
    splitCursorRef.current = null;
    if (splitRows) {
      setTaskDraft(d => ({...d, text: joinItems(splitRows)}));
      setSplitRows(null);
    } else {
      setSplitRows(splitByHand(taskDraft.text));
      setTaskDraft(d => ({...d, text: ''}));
    }
    setSplitPage(0);
    clearTaskJustAdded();
  }
  const updateSplitRow = (index: number, value: string) => {
    captureTouchedRef.current = true;
    setSplitRows(rows => (rows ? rows.map((r, i) => (i === index ? stripSpaceAfterHash(value) : r)) : rows));
    clearTaskJustAdded();
  };
  const removeSplitRow = (index: number) => {
    captureTouchedRef.current = true;
    splitCursorRef.current = null;
    setSplitRows(rows => {
      if (!rows) return rows;
      const next = rows.filter((_, i) => i !== index);
      return next.length > 0 ? next : [''];
    });
    clearTaskJustAdded();
  };
  // ✂ Split at cursor (checkpoint B: the recognizer gives no reliable line
  // breaks). A plain cursor splits there; a selection is cut out and becomes
  // the next item. The single field turns into rows; in rows the focused row
  // is split and the new item goes right below it. Where the cursor was is
  // kept in refs (onSelectionChange), as for Cut/Paste above - pressing the
  // button blurs the field first.
  const splitCursorRef = useRef<{index: number; selection: Selection} | null>(null);
  const splitAtCursor = () => {
    captureTouchedRef.current = true;
    clearTaskJustAdded();
    if (splitRows) {
      const at = splitCursorRef.current;
      const parts =
        at && at.selection && at.index < splitRows.length
          ? splitAtSelection(splitRows[at.index], at.selection.start, at.selection.end)
          : null;
      if (!at || !parts) {
        setError('Tap into the text where it should be split.', 'text');
        return;
      }
      const next = [...splitRows.slice(0, at.index), parts[0], parts[1], ...splitRows.slice(at.index + 1)];
      setSplitRows(next);
      setSplitPage(Math.floor((at.index + 1) / SPLIT_ROWS_PER_PAGE));
      splitCursorRef.current = null;
      setError(null);
      return;
    }
    const selection = taskLastSelectionRef.current;
    const parts = selection ? splitAtSelection(taskDraft.text, selection.start, selection.end) : null;
    if (!parts) {
      setError('Tap into the text where it should be split.', 'text');
      return;
    }
    setSplitRows(parts);
    setTaskDraft(d => ({...d, text: ''}));
    setSplitPage(0);
    taskLastSelectionRef.current = null;
    splitCursorRef.current = null;
    setError(null);
  };
  const captureOptionsRow =
    isCapture && displayType === 'task' && !isEditing ? (
      <View style={styles.captureOptions}>
        <Pressable onPress={toggleSplit} hitSlop={8} accessibilityRole="checkbox">
          <Text style={[styles.splitToggleText, {color: textColor}]}>{splitRows ? '☑' : '☐'} Split lines</Text>
        </Pressable>
        <Pressable style={[styles.ghostButton, {borderColor}]} onPress={splitAtCursor} hitSlop={6}>
          <Text style={[styles.ghostButtonText, {color: textColor}]}>✂ Split at cursor</Text>
        </Pressable>
        <View style={styles.centerSpacer} />
        {taskDueControl}
      </View>
    ) : null;
  const splitPageCount = splitRows ? Math.max(1, Math.ceil(splitRows.length / SPLIT_ROWS_PER_PAGE)) : 1;
  const safeSplitPage = Math.min(splitPage, splitPageCount - 1);
  const splitRowsBlock = splitRows ? (
    <View>
      <View style={styles.splitHeader}>
        <Text style={[styles.splitHeaderText, {color: textColor}]}>
          {splitRows.filter(r => r.trim()).length} items
        </Text>
        {splitPageCount > 1 ? (
          <View style={styles.splitPager}>
            <Pressable onPress={() => setSplitPage(Math.max(0, safeSplitPage - 1))} disabled={safeSplitPage === 0} hitSlop={8}>
              <Text style={[styles.splitPagerText, {color: textColor}, safeSplitPage === 0 && styles.tabTextDisabled]}>‹</Text>
            </Pressable>
            <Text style={[styles.splitHeaderText, {color: textColor}]}>
              {safeSplitPage + 1}/{splitPageCount}
            </Text>
            <Pressable
              onPress={() => setSplitPage(Math.min(splitPageCount - 1, safeSplitPage + 1))}
              disabled={safeSplitPage >= splitPageCount - 1}
              hitSlop={8}>
              <Text style={[styles.splitPagerText, {color: textColor}, safeSplitPage >= splitPageCount - 1 && styles.tabTextDisabled]}>›</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
      {splitRows.slice(safeSplitPage * SPLIT_ROWS_PER_PAGE, (safeSplitPage + 1) * SPLIT_ROWS_PER_PAGE).map((row, i) => {
        const index = safeSplitPage * SPLIT_ROWS_PER_PAGE + i;
        return (
          <View key={index} style={styles.splitRow}>
            <Text style={[styles.splitIndex, {color: textColor}]}>{index + 1}</Text>
            <TextInput
              style={[styles.input, styles.inputFlex, {color: textColor, borderColor}]}
              value={row}
              onChangeText={t => updateSplitRow(index, t)}
              onFocus={() => {
                if (splitCursorRef.current?.index !== index) splitCursorRef.current = {index, selection: null};
              }}
              onSelectionChange={e => {
                splitCursorRef.current = {index, selection: e.nativeEvent.selection};
              }}
              placeholder="Todo"
              placeholderTextColor={placeholderColor}
              autoCapitalize="none"
            />
            <Pressable onPress={() => removeSplitRow(index)} hitSlop={8} accessibilityLabel={`Remove item ${index + 1}`}>
              <Text style={[styles.splitRemove, {color: textColor}]}>✕</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  ) : null;

  // Row 2 and row 3 for both Task and Meeting stay mounted at all times -
  // only their `display` toggles with the active tab (styles.hidden below)
  // - rather than the two variants being swapped in and out of the JSX
  // tree. Swapping subtrees means Android has to freshly create each
  // TextInput's native view on every tab switch, which briefly renders at
  // its native intrinsic size before the custom padding/border style
  // settles - exactly the "widget grows for an instant, then shrinks back"
  // flicker Tilman reported (2026-09-09). Keeping both variants' native
  // views alive the whole time and just hiding the inactive one avoids
  // that remount entirely, consistent with this widget's fixed-row,
  // avoid-reflow design (design doc §3).
  const taskRow2 = (
    <View style={[styles.row2, displayType !== 'task' && styles.hidden]}>
      {isCapture && splitRows ? splitRowsBlock : null}
      <View style={[styles.row2Wrap, isCapture && splitRows !== null && styles.hidden]}>
        <MarkWrap mark={fieldMark('text')} textColor={textColor} flex>
        <TextInput
          ref={taskInputRef}
          style={[styles.input, styles.inputFlex, isCapture && styles.inputMultiline, {color: textColor, borderColor}]}
          multiline={isCapture}
          textAlignVertical={isCapture ? 'top' : undefined}
          value={taskFields.text}
          onChangeText={setTaskText}
          onSubmitEditing={editFields?.kind === 'task' ? submitTaskEdit : submitTaskCreate}
          onSelectionChange={e => onTaskSelectionChange(e.nativeEvent.selection)}
          selection={taskSelectionOverride ?? undefined}
          onFocus={() => setTaskInputFocused(true)}
          onBlur={() => setTaskInputFocused(false)}
          placeholder={placeholder}
          placeholderTextColor={placeholderColor}
          autoCapitalize="none"
        />
        </MarkWrap>
        {isCapture ? null : taskDueControl}
      </View>
      {/* Custom Select All/Copy/Cut/Paste overlay (Tilman, 2026-09-11) -
          hovers above the field, right-aligned so it clears row 1's Todo/
          Meeting tabs (which sit top-left, directly above this row) rather
          than covering them. Absolutely positioned (`bottom: '100%'` = flush
          above this row's own top edge) so it never pushes row2's height or
          anything below it - stays mounted at all times with `display`
          toggling on focus (styles.hidden), not conditional JSX, so a tap
          on one of these buttons isn't lost to the same native-view-torn-
          out-from-under-the-gesture race that motivated the row2/row3
          `display:none` pattern above (blur fires on touch-down, but the
          already-claimed touch responder keeps receiving the rest of that
          gesture as long as the view instance itself survives). */}
      <View style={[common.floatingStrip, {borderColor}, !taskInputFocused && styles.hidden]}>
        <Pressable style={[common.floatingStripButton, {borderColor}]} onPress={handleTaskSelectAll} hitSlop={6}>
          <Text style={[common.floatingStripButtonText, {color: textColor}]}>All</Text>
        </Pressable>
        <Pressable style={[common.floatingStripButton, {borderColor}]} onPress={handleTaskCopy} hitSlop={6}>
          <Text style={[common.floatingStripButtonText, {color: textColor}]}>Copy</Text>
        </Pressable>
        <Pressable style={[common.floatingStripButton, {borderColor}]} onPress={handleTaskCut} hitSlop={6}>
          <Text style={[common.floatingStripButtonText, {color: textColor}]}>Cut</Text>
        </Pressable>
        <Pressable style={[common.floatingStripButton, {borderColor}]} onPress={handleTaskPaste} hitSlop={6}>
          <Text style={[common.floatingStripButtonText, {color: textColor}]}>Paste</Text>
        </Pressable>
      </View>
    </View>
  );

  // `onLayout` feeds that row's tag budget (ui/tagChipLayout.ts) so the
  // chips leave room for this cluster instead of painting over the ✕
  // (bugfix 2026-09-29).
  const attachmentCluster = (linkedFile: string, onClear: () => void, onLayout?: (e: LayoutChangeEvent) => void) =>
    linkedFile ? (
      <View style={styles.attachCluster} onLayout={onLayout}>
        <ClipIcon color={textColor} />
        {linkedFileMissing && <WarningIcon color={textColor} />}
        <Pressable onPress={onClear} hitSlop={8}>
          <Text style={[styles.attachRemove, {color: textColor}]}>✕</Text>
        </Pressable>
      </View>
    ) : null;

  // Row 3 pixel budgets for TagChips (bugfix 2026-09-29, ui/tagChipLayout.ts):
  // each variant measures its row, the element sharing page 0 with the tags,
  // and the attachment cluster, instead of trusting fixed chip counts.
  // Widths remembered per screen via `layoutKey` (render-perf-ab §3 A2).
  const taskTagBudget = useTagRowBudget(
    editFields?.kind === 'task' && !!editFields.fields.linkedFile,
    layoutKey ? `${layoutKey}:task` : undefined,
  );
  const meetingTagBudget = useTagRowBudget(
    editFields?.kind === 'meeting' && !!editFields.fields.linkedFile,
    layoutKey ? `${layoutKey}:meeting` : undefined,
  );
  const noteTagBudget = useTagRowBudget(false, layoutKey ? `${layoutKey}:note` : undefined);

  const taskRow3Hidden = displayType !== 'task' && styles.hidden;
  // Row 3, page 0 vs page 1+ (technical-design-context-tags.md §8): past
  // page 0, TagChips takes the whole row at its wide capacity and
  // FlowStateChips (or the waiting-for mini-layout, which is also flow-
  // state UI) drops out entirely - "‹" on the chip row itself is the way
  // back to page 0, where flow chips reappear. Page 0 keeps today's layout,
  // with a narrow TagChips squeezed in alongside FlowStateChips; the
  // waiting-for mini-layout's "Waiting on" text field already fills the row
  // on its own, so no room for tags there either - reachable via page 1+'s
  // "‹" any time.
  const taskRow3 =
    taskTagPage > 0 ? (
      <View style={[styles.row3, taskRow3Hidden]} onLayout={taskTagBudget.onRowLayout}>
        <TagChips
          text={taskFields.text}
          recentTags={recentTags}
          recognizedTags={recognizedAbbrevTags}
          page={taskTagPage}
          onPageChange={setTaskTagPage}
          page0Width={taskTagBudget.page0Width}
          laterWidth={taskTagBudget.laterWidth}
          onInsertTag={insertTaskTag}
          onRemoveTag={removeTaskTag}
          textColor={textColor}
          borderColor={borderColor}
        />
        {editFields?.kind === 'task' && attachmentCluster(editFields.fields.linkedFile, clearTaskLinkedFile, taskTagBudget.onAttachLayout)}
      </View>
    ) : taskFields.flowState === 'waiting-for' ? (
      <View style={[styles.row3, taskRow3Hidden]}>
        <Pressable
          style={[styles.chip, styles.chipSelected]}
          onPress={() => setTaskFlowState(null)}
          hitSlop={8}>
          <Text style={styles.chipTextSelected}>w/f</Text>
        </Pressable>
        <TextInput
          style={[styles.input, styles.waitingInput, {color: textColor, borderColor}]}
          value={taskFields.waitingOnText}
          onChangeText={setTaskWaitingOn}
          placeholder="Waiting on (who/what)"
          placeholderTextColor={placeholderColor}
          autoCapitalize="none"
        />
        {editFields?.kind === 'task' && attachmentCluster(editFields.fields.linkedFile, clearTaskLinkedFile, taskTagBudget.onAttachLayout)}
      </View>
    ) : (
      <View style={[styles.row3, taskRow3Hidden]} onLayout={taskTagBudget.onRowLayout}>
        <View style={styles.row3ChipsGroup}>
          <View style={styles.row3Lead} onLayout={taskTagBudget.onLeadLayout}>
            <FlowStateChips value={taskFields.flowState} onChange={setTaskFlowState} textColor={textColor} borderColor={borderColor} />
          </View>
          {!isCapture && <TagChips
            text={taskFields.text}
            recentTags={recentTags}
            recognizedTags={recognizedAbbrevTags}
            page={taskTagPage}
            onPageChange={setTaskTagPage}
            page0Width={taskTagBudget.page0Width}
            laterWidth={taskTagBudget.laterWidth}
            onInsertTag={insertTaskTag}
            onRemoveTag={removeTaskTag}
            textColor={textColor}
            borderColor={borderColor}
          />}
        </View>
        {editFields?.kind === 'task' && attachmentCluster(editFields.fields.linkedFile, clearTaskLinkedFile, taskTagBudget.onAttachLayout)}
      </View>
    );

  // ---- Row 2 + Row 3: Meeting style ----
  const meetingFields = editFields?.kind === 'meeting' ? editFields.fields : meetingDraft;
  const setMeetingTitle = (t: string) => {
    captureTouchedRef.current = true;
    const stripped = stripSpaceAfterHash(t);
    if (editFields?.kind === 'meeting') updateMeetingEditField({title: stripped});
    else setMeetingDraft(d => ({...d, title: stripped}));
    clearMeetingJustAdded();
  };
  const setMeetingDate = (d: string) => {
    if (editFields?.kind === 'meeting') updateMeetingEditField({date: d});
    else setMeetingDraft(dr => ({...dr, date: d}));
    clearMeetingJustAdded();
  };
  const setMeetingTime = (t: string) => {
    if (editFields?.kind === 'meeting') updateMeetingEditField({time: t});
    else setMeetingDraft(d => ({...d, time: t}));
    clearMeetingJustAdded();
  };
  const clearMeetingLinkedFile = () => updateMeetingEditField({linkedFile: ''});
  const toggleMeetingMonthly = () => {
    if (editFields?.kind === 'meeting') updateMeetingEditField({monthly: !editFields.fields.monthly});
    else setMeetingDraft(d => ({...d, monthly: !d.monthly}));
  };
  // The "M" box left of + Add / Save (meeting tab only) - see ui/HighlightMark.tsx.
  const monthlyToggle =
    displayType === 'meeting' ? (
      <HighlightMark on={meetingFields.monthly} variant="toggle" onPress={toggleMeetingMonthly} disabled={pending} textColor={textColor} />
    ) : null;
  const insertMeetingTag = (tag: string) => {
    const {text, cursor} = insertTagAtPosition(meetingFields.title, tag, meetingLastSelectionRef.current?.start ?? null);
    setMeetingTitle(text);
    const selection = {start: cursor, end: cursor};
    meetingLastSelectionRef.current = selection;
    setMeetingSelectionOverride(selection);
  };
  const removeMeetingTag = (tag: string) => {
    setMeetingTitle(removeTagFromText(meetingFields.title, tag));
  };
  // No setState here on purpose - see onTaskSelectionChange's comment above.
  const onMeetingSelectionChange = (selection: Selection) => {
    meetingLastSelectionRef.current = selection;
    if (meetingSelectionOverride) setMeetingSelectionOverride(null);
  };

  // Custom Select All/Copy/Cut/Paste - see handleTaskSelectAll's comment above.
  const handleMeetingSelectAll = () => {
    const selection = {start: 0, end: meetingFields.title.length};
    meetingLastSelectionRef.current = selection;
    setMeetingSelectionOverride(selection);
  };
  const handleMeetingCopy = () => {
    const {start, end} = copyCutRange(meetingFields.title, meetingLastSelectionRef.current);
    Clipboard.setString(meetingFields.title.slice(start, end));
  };
  const handleMeetingCut = () => {
    const range = copyCutRange(meetingFields.title, meetingLastSelectionRef.current);
    Clipboard.setString(meetingFields.title.slice(range.start, range.end));
    const {text, cursor} = spliceAtSelection(meetingFields.title, range, '');
    setMeetingTitle(text);
    const selection = {start: cursor, end: cursor};
    meetingLastSelectionRef.current = selection;
    setMeetingSelectionOverride(selection);
  };
  const handleMeetingPaste = async () => {
    const clip = await Clipboard.getString();
    if (!clip) return;
    const {text, cursor} = spliceAtSelection(meetingFields.title, meetingLastSelectionRef.current, clip);
    setMeetingTitle(text);
    const selection = {start: cursor, end: cursor};
    meetingLastSelectionRef.current = selection;
    setMeetingSelectionOverride(selection);
  };

  const meetingRow2 = (
    <View style={[styles.row2, displayType !== 'meeting' && styles.hidden]}>
      <View style={styles.row2Wrap}>
        <MarkWrap mark={fieldMark('title')} textColor={textColor} flex>
        <TextInput
          ref={meetingInputRef}
          style={[styles.input, styles.inputFlex, {color: textColor, borderColor}]}
          value={meetingFields.title}
          onChangeText={setMeetingTitle}
          onSelectionChange={e => onMeetingSelectionChange(e.nativeEvent.selection)}
          selection={meetingSelectionOverride ?? undefined}
          onFocus={() => setMeetingInputFocused(true)}
          onBlur={() => setMeetingInputFocused(false)}
          placeholder="New meeting title"
          placeholderTextColor={placeholderColor}
          autoCapitalize="none"
        />
        </MarkWrap>
        <MarkWrap mark={fieldMark('date')} textColor={textColor}>
          <DateInput
            value={meetingFields.date}
            onChangeText={setMeetingDate}
            placeholder="YYYY-MM-DD"
            placeholderColor={placeholderColor}
            textColor={textColor}
            borderColor={borderColor}
          />
        </MarkWrap>
      </View>
      {/* Same hovering overlay as taskRow2's - see its comment for why. */}
      <View style={[common.floatingStrip, {borderColor}, !meetingInputFocused && styles.hidden]}>
        <Pressable style={[common.floatingStripButton, {borderColor}]} onPress={handleMeetingSelectAll} hitSlop={6}>
          <Text style={[common.floatingStripButtonText, {color: textColor}]}>All</Text>
        </Pressable>
        <Pressable style={[common.floatingStripButton, {borderColor}]} onPress={handleMeetingCopy} hitSlop={6}>
          <Text style={[common.floatingStripButtonText, {color: textColor}]}>Copy</Text>
        </Pressable>
        <Pressable style={[common.floatingStripButton, {borderColor}]} onPress={handleMeetingCut} hitSlop={6}>
          <Text style={[common.floatingStripButtonText, {color: textColor}]}>Cut</Text>
        </Pressable>
        <Pressable style={[common.floatingStripButton, {borderColor}]} onPress={handleMeetingPaste} hitSlop={6}>
          <Text style={[common.floatingStripButtonText, {color: textColor}]}>Paste</Text>
        </Pressable>
      </View>
    </View>
  );

  // Meeting Row 3 has no flow chips ever competing for space, so TagChips
  // runs wide from page 0 on (technical-design-context-tags.md §8) - the
  // time field shrinks to make room for it (chat round 1: "Time itself
  // would remain visible always, but become smaller"), same paging as
  // Todo's page 1+ once tag count exceeds one page.
  const meetingRow3 = (
    <View style={[styles.row3, displayType !== 'meeting' && styles.hidden]} onLayout={meetingTagBudget.onRowLayout}>
      <View style={styles.row3ChipsGroup}>
        <View style={styles.row3Lead} onLayout={meetingTagBudget.onLeadLayout}>
        <MarkWrap mark={fieldMark('time')} textColor={textColor}>
          <TextInput
            style={[styles.input, styles.timeInputCompact, {color: textColor, borderColor}]}
            value={meetingFields.time}
            onChangeText={setMeetingTime}
            placeholder="15 · 15-16.30 · 2d"
            placeholderTextColor={placeholderColor}
            autoCapitalize="none"
          />
        </MarkWrap>
        </View>
        {!isCapture && <TagChips
          text={meetingFields.title}
          recentTags={recentTags}
          recognizedTags={recognizedAbbrevTags}
          page={meetingTagPage}
          onPageChange={setMeetingTagPage}
          page0Width={meetingTagBudget.page0Width}
          laterWidth={meetingTagBudget.laterWidth}
          onInsertTag={insertMeetingTag}
          onRemoveTag={removeMeetingTag}
          textColor={textColor}
          borderColor={borderColor}
        />}
      </View>
      {editFields?.kind === 'meeting' && attachmentCluster(editFields.fields.linkedFile, clearMeetingLinkedFile, meetingTagBudget.onAttachLayout)}
    </View>
  );

  // ---- Row 2 + Row 3: Note style ----
  // No due-date affordance, no clipboard overlay, no edit mode - a plain
  // title field (ClipboardTextInput already gives it the same Select All/
  // Copy/Cut/Paste affordance Task/Meeting's own fields have, without
  // re-deriving the selection-ref/overlay dance inline - see that
  // component's own doc comment) plus the same TagChips primitive Task/
  // Meeting already use, pinning/toggling `#tag` tokens directly in the
  // title text.
  const noteRow2 = (
    <View style={[styles.row2, displayType !== 'note' && styles.hidden]}>
      <ClipboardTextInput
        value={noteDraft.titleRaw}
        onChangeText={setNoteTitleRaw}
        onSubmitEditing={submitNoteCreate}
        placeholder="New note"
        placeholderColor={placeholderColor}
        textColor={textColor}
        borderColor={borderColor}
        editable={!pending}
      />
    </View>
  );

  const noteRow3 = (
    <View style={[styles.row3, displayType !== 'note' && styles.hidden]} onLayout={noteTagBudget.onRowLayout}>
      <TagChips
        text={noteDraft.titleRaw}
        recentTags={recentTags}
        recognizedTags={recognizedAbbrevTags}
        page={noteTagPage}
        onPageChange={setNoteTagPage}
        page0Width={noteTagBudget.page0Width}
        laterWidth={noteTagBudget.laterWidth}
        onInsertTag={insertNoteTag}
        onRemoveTag={removeNoteTag}
        textColor={textColor}
        borderColor={borderColor}
      />
    </View>
  );

  // ---- Abbreviation quick-file (feature_abbrev_quick_file, 2026-09-17) ----
  // The one Project/Area a recognized #tag in the CURRENT field's text
  // resolves to, or null - see domain/abbrev.ts's resolveAbbrevFileTarget
  // for the match/status-filter/self-exclude rules. Deliberately derived
  // from taskFields/meetingFields (not taskDraft/meetingDraft directly) so
  // this one pair of consts serves both submitTaskCreate/submitMeetingCreate
  // above (create mode: taskFields === taskDraft, so this closure reference
  // resolves to the live draft text by the time those handlers actually
  // run - safe despite being declared later in this same component
  // function, since neither submit function is invoked until well after
  // this render has finished assigning it) and Row 4's "File: <Name>" render
  // below (edit mode: taskFields === editFields.fields). Recomputed every
  // render, same as TagChips already re-deriving extractContextTags(text)
  // every render - one array scan over however many Projects/Areas exist,
  // cheap enough to not memoize. `cachedAbbrevItems` itself is declared up
  // above, before Row 2/3, so the tag-display recognizedAbbrevTags Set (see
  // that section's own comment) can reuse this same getCachedData() read.
  // A tag naming wherever this item already is/would be created is a no-op,
  // not a destination. In create mode (and on every screen where
  // fixedDestination always names the edited item's own location - Current
  // tab's own item; Inbox/Review's Inbox-to-zero step are always {type:
  // 'inbox'}, which has no path and so never self-excludes, correctly,
  // since Inbox itself can never carry an abbreviation) this is exactly
  // fixedDestination's own path. While editing, `editingItemPath` - when the
  // caller passes it - overrides that: Daily's fixedDestination is always
  // {type: 'inbox'} regardless of which Project/Area the entry being edited
  // actually lives in, so it passes the entry's real path here instead (see
  // that prop's own doc comment).
  const fixedExcludePath = fixedDestination.type === 'item' ? fixedDestination.path : null;
  const abbrevExcludePath = isEditing && editingItemPath !== undefined ? editingItemPath : fixedExcludePath;
  const taskAbbrevTarget = resolveAbbrevFileTarget(taskFields.text, cachedAbbrevItems, abbrevExcludePath);
  const meetingAbbrevTarget = resolveAbbrevFileTarget(meetingFields.title, cachedAbbrevItems, abbrevExcludePath);
  // Note has no filing concept (feature_standalone_note_quickadd) - never matched.
  const abbrevTarget = displayType === 'task' ? taskAbbrevTarget : displayType === 'meeting' ? meetingAbbrevTarget : null;

  const abbrevDestination = (target: AbbrevFileMatch): Destination => ({
    type: 'item',
    kind: target.kind,
    name: target.name,
    path: target.path,
  });

  /**
   * Edit-mode quick-file (feature_abbrev_quick_file, 2026-09-18 bugfix).
   * Composes the payload exactly the way submitTaskEdit/submitMeetingEdit
   * compose their own `nextText`/`fields` - flow-state/due tags folded in,
   * meeting fields validated/normalized - so any OTHER edit made during this
   * session (text changes, a flow-state/due/time change, a pending linked-
   * file pick) is carried over to the new location instead of silently
   * discarded in favor of the last-saved copy (the original bug: `onQuickFile`
   * used to take only the target, so every caller re-read its own stale
   * stored task/meeting). The one difference from Save: the matched
   * abbreviation tag is additionally stripped via `removeTagFromText`, same
   * as the create-mode submit functions just above.
   */
  const handleQuickFile = () => {
    if (!abbrevTarget || !onQuickFile || !editFields) return;
    Keyboard.dismiss();
    if (editFields.kind === 'task') {
      const trimmed = editFields.fields.text.trim();
      if (!trimmed) return;
      const finalText = composeTaskText(editFields.fields, abbrevTarget.tag);
      setError(null);
      setPending(true);
      onQuickFile(abbrevTarget, {kind: 'task', text: finalText, linkedFile: editFields.fields.linkedFile})
        .then(() => recordTagsUsed(extractContextTags(finalText)).then(refreshRecentTags))
        .catch(e => setError(errorMessage(e)))
        .finally(() => setPending(false));
    } else {
      const result = validateMeetingFields(editFields.fields.title, editFields.fields.date, editFields.fields.time);
      if (!result.ok) {
        setError(result.error, result.field);
        return;
      }
      const trimmedTitle = setHighlight(
        removeTagFromText(editFields.fields.title.trim(), abbrevTarget.tag),
        editFields.fields.monthly,
      );
      setError(null);
      setPending(true);
      onQuickFile(abbrevTarget, {
        kind: 'meeting',
        fields: {title: trimmedTitle, date: editFields.fields.date, time: result.time, endTime: result.endTime, days: result.days},
        linkedFile: editFields.fields.linkedFile,
      })
        .then(() => recordTagsUsed(extractContextTags(trimmedTitle)).then(refreshRecentTags))
        .catch(e => setError(errorMessage(e)))
        .finally(() => setPending(false));
    }
  };

  // ---- Row 4: Actions ----
  // Row 4 has no status text any more: errors, the "blocked" warning and
  // the success messages go to the central status slot
  // (docs/dev/technical-design-status-slot.md §7.3); only a ⚠/✓ mark stays in
  // place (on the field concerned, or on the Add/Save button). This also
  // fixes edit mode never showing the widget's own `error` at all.
  const justAdded = displayType === 'task' ? taskJustAdded : displayType === 'meeting' ? meetingJustAdded : noteJustAdded;
  const successText = isEditing
    ? null
    : displayType === 'meeting' && meetingCopyNote
      ? null
      : justAdded
        ? displayType === 'meeting' && meetingAddedWhen
          ? `${justAdded} - ${meetingAddedWhen}`
          : justAdded
        : savedNote;
  const infoText = !isEditing && displayType === 'meeting' ? meetingCopyNote : null;
  const dismissSuccess = () => {
    setTaskJustAdded(null);
    setMeetingJustAdded(null);
    setMeetingAddedWhen(null);
    setNoteJustAdded(null);
    setSavedNote(null);
  };

  const statusId = useRef(`quickadd.${++nextQuickAddInstance}`).current;
  useStatus(`${statusId}.error`, error ? {kind: 'error', text: error, onDismiss: () => setError(null)} : null);
  useStatus(`${statusId}.blocked`, isEditing && blockedMessage ? {kind: 'warning', text: blockedMessage} : null);
  useStatus(`${statusId}.success`, successText ? {kind: 'success', text: successText, onDismiss: dismissSuccess} : null);
  useStatus(`${statusId}.info`, infoText ? {kind: 'info', text: infoText, onDismiss: () => setMeetingCopyNote(null)} : null);

  const buttonMark = errorState && errorState.field === null ? ('warning' as const) : successText ? ('success' as const) : null;

  // ---- Capture: save, buttons, chips (docs/dev/technical-design-lasso-0.8.md §3.9) ----
  const captureItems = (): string[] =>
    (splitRows ?? [taskDraft.text]).map(t => t.trim()).filter(t => t.length > 0);
  // A typed #ABBR in any item wins over the "File to" choice, as in Quick Add.
  const captureAbbrevTarget = isCapture
    ? displayType === 'meeting'
      ? meetingAbbrevTarget
      : resolveAbbrevFileTarget(splitRows ? splitRows.join(' ') : taskDraft.text, cachedAbbrevItems, fixedExcludePath)
    : null;
  const captureDestination: Destination = captureAbbrevTarget ? abbrevDestination(captureAbbrevTarget) : fixedDestination;
  const captureCount = displayType === 'task' ? captureItems().length : 1;

  const rememberCaptureDestination = (dest: Destination) => {
    if (dest.type !== 'item') return;
    setRecentDestinations(prev => [dest.path, ...prev.filter(p => p !== dest.path)]);
    recordDestinationUsed(dest.path);
  };

  const submitCapture = async (mode: CaptureSaveMode) => {
    Keyboard.dismiss();
    if (pending) return;
    if (displayType === 'meeting') {
      const result = validateMeetingFields(meetingDraft.title, meetingDraft.date, meetingDraft.time);
      if (!result.ok) {
        setError(result.error, result.field);
        return;
      }
      const title = setHighlight(
        meetingAbbrevTarget ? removeTagFromText(meetingDraft.title.trim(), meetingAbbrevTarget.tag) : meetingDraft.title.trim(),
        meetingDraft.monthly,
      );
      setError(null);
      setPending(true);
      try {
        await onAddMeeting(
          {title, date: meetingDraft.date, time: result.time, endTime: result.endTime, days: result.days},
          captureDestination,
        );
      } catch (e) {
        setError(errorMessage(e));
        setPending(false);
        return;
      }
      setPending(false);
      setMeetingDraft(d => ({...makeMeetingDraft(d.date, false)}));
      setMeetingJustAdded(`Added meeting "${truncateItemName(meetingDisplayTitle({title}), 40)}" to ${destinationLabel(captureDestination)}`);
      recordTagsUsed(extractContextTags(title)).then(refreshRecentTags);
      rememberCaptureDestination(captureDestination);
      captureTouchedRef.current = false;
      onCaptureSaved?.(mode);
      return;
    }
    const items = captureItems();
    if (items.length === 0) {
      setError('Nothing to save - write a todo first.', 'text');
      return;
    }
    const tag = captureAbbrevTarget ? captureAbbrevTarget.tag : null;
    const texts = items.map(item => composeTaskText({...taskDraft, text: item}, tag));
    setError(null);
    setPending(true);
    let saved = 0;
    try {
      for (const text of texts) {
        await onAddTask(text, captureDestination);
        saved += 1;
      }
    } catch (e) {
      const message = errorMessage(e);
      // Saved ones are gone from the list; the rest stays for another try.
      if (splitRows && saved > 0) setSplitRows(splitRows.filter(r => r.trim()).slice(saved));
      setError(saved > 0 ? `Saved ${saved} of ${texts.length}. ${message}` : message);
      setPending(false);
      return;
    }
    setPending(false);
    setTaskDraft(d => ({...d, text: '', flowState: null, waitingOnText: '', dueDate: ''}));
    setSplitRows(null);
    taskLastSelectionRef.current = null;
    captureTouchedRef.current = false;
    setTaskJustAdded(
      texts.length === 1
        ? `Added todo "${truncateItemName(items[0], 40)}" to ${destinationLabel(captureDestination)}`
        : `Added ${texts.length} todos to ${destinationLabel(captureDestination)}`,
    );
    recordTagsUsed(texts.flatMap(t => extractContextTags(t))).then(refreshRecentTags);
    rememberCaptureDestination(captureDestination);
    onCaptureSaved?.(mode);
  };

  // Tags: toggled in the single text, or in every row while split.
  // Tags already in the text come first (like Quick Add's pinned chips), then the recent ones.
  const captureTagSource = isCapture
    ? Array.from(
        new Set([
          ...extractContextTags(
            displayType === 'meeting' ? meetingFields.title : splitRows ? splitRows.join(' ') : taskFields.text,
          ),
          ...recentTags,
        ]),
      )
    : [];
  const captureTagChips: GridChip[] = isCapture
    ? captureTagSource.map(tag => {
        const lower = tag.toLowerCase();
        const has = (text: string) => extractContextTags(text).some(t => t.toLowerCase() === lower);
        const on =
          displayType === 'meeting'
            ? has(meetingFields.title)
            : splitRows
              ? splitRows.length > 0 && splitRows.every(has)
              : has(taskFields.text);
        const onPress = () => {
          if (displayType === 'meeting') {
            if (on) removeMeetingTag(tag);
            else insertMeetingTag(tag);
          } else if (splitRows) {
            captureTouchedRef.current = true;
            setSplitRows(rows =>
              rows ? rows.map(r => (on ? removeTagFromText(r, tag) : has(r) ? r : insertTagAtPosition(r, tag, null).text)) : rows,
            );
          } else if (on) removeTaskTag(tag);
          else insertTaskTag(tag);
        };
        return {key: tag, label: `#${recognizedAbbrevTags.has(lower) ? tag.toUpperCase() : tag}`, on, onPress};
      })
    : [];
  // Short list: Inbox, own place, current choice, focused, recent (checkpoint B);
  // More… shows every Active Project/Area alphabetically, FILE_TO_PAGE per page.
  const fileToChip = (item: {kind: 'project' | 'area'; name: string; path: string; abbrev: string | null}): GridChip => ({
    key: item.path,
    label: fileToLabel(item),
    on: captureDestination.type === 'item' && captureDestination.path === item.path,
    onPress: () => onCaptureDestinationChange?.({type: 'item', kind: item.kind, name: item.name, path: item.path}),
  });
  const inboxChip: GridChip = {
    key: 'inbox',
    label: 'Inbox',
    on: captureDestination.type === 'inbox',
    onPress: () => onCaptureDestinationChange?.({type: 'inbox'}),
  };
  let fileToChips: GridChip[] = [];
  if (isCapture && !fileToAll) {
    const short = fileToShortList(cachedAbbrevItems, captureOwnDestination, captureDestination, recentDestinations);
    const total = fileToEligible(cachedAbbrevItems).length;
    fileToChips = [inboxChip, ...short.map(fileToChip)];
    if (total > short.length) {
      fileToChips.push({key: 'more', label: 'More…', on: false, onPress: () => setFileToAll(true)});
    }
  } else if (isCapture) {
    const all = fileToEligible(cachedAbbrevItems);
    const pages = Math.max(1, Math.ceil(all.length / FILE_TO_PAGE));
    const page = Math.min(fileToPage, pages - 1);
    fileToChips = [
      {key: 'less', label: '‹ Short list', on: false, onPress: () => setFileToAll(false)},
      // A pick goes back to the short list, which always shows the current choice.
      ...all.slice(page * FILE_TO_PAGE, (page + 1) * FILE_TO_PAGE).map(item => {
        const chip = fileToChip(item);
        return {
          ...chip,
          onPress: () => {
            chip.onPress();
            setFileToAll(false);
          },
        };
      }),
    ];
    if (pages > 1) {
      fileToChips.push({
        key: 'page',
        label: `${page + 1}/${pages} ›`,
        on: false,
        onPress: () => setFileToPage((page + 1) % pages),
      });
    }
  }
  const countLabel = captureCount > 1 ? ` ${captureCount}` : '';
  const captureRow4 = (
    <View style={styles.row4}>
      <Text style={[styles.captureDest, {color: textColor}]} numberOfLines={1}>
        → {truncateItemName(destinationLabel(captureDestination), 24)}
      </Text>
      <Pressable style={[styles.ghostButton, {borderColor}]} onPress={() => submitCapture('next')} disabled={pending} hitSlop={6}>
        <Text style={[styles.ghostButtonText, {color: textColor}]}>Save{countLabel} & next</Text>
      </Pressable>
      <Pressable style={[styles.ghostButton, {borderColor}]} onPress={() => submitCapture('view')} disabled={pending} hitSlop={6}>
        <Text style={[styles.ghostButtonText, {color: textColor}]}>Save{countLabel} & view</Text>
      </Pressable>
      <MarkWrap mark={errorState && errorState.field === null ? 'warning' : null} textColor={textColor}>
        <Pressable style={styles.primaryButton} onPress={() => submitCapture('close')} disabled={pending} hitSlop={6}>
          <Text style={styles.primaryButtonText}>Save{countLabel} & close</Text>
        </Pressable>
      </MarkWrap>
      {monthlyToggle}
    </View>
  );
  const captureBelow = isCapture ? (
    <View style={styles.captureBelow}>
      {captureTagChips.length > 0 ? (
        <>
          <Text style={[styles.captureLabel, {color: textColor}]}>Tags</Text>
          <TagChipGrid chips={captureTagChips} maxChips={18} textColor={textColor} borderColor={borderColor} />
        </>
      ) : null}
      <Text style={[styles.captureLabel, {color: textColor}]}>File to</Text>
      <TagChipGrid
        chips={fileToChips}
        maxChips={fileToAll ? FILE_TO_PAGE + 2 : FILE_TO_SHORT + 1}
        maxLabelChars={22}
        textColor={textColor}
        borderColor={borderColor}
      />
      {captureExtras}
    </View>
  ) : null;

  const row4 = isCapture && !isEditing ? captureRow4 : isEditing ? (
    <View style={styles.row4}>
      <View style={styles.actionsLeft}>
        {/* Icon instead of the word "Delete" (2026-09-21) - frees ~40px in
            this crowded row. Leftmost on purpose and hitSlop 4 (not the 8 the
            text buttons use): delete is one tap with no confirmation, so its
            touch area must not spill into "New from this" next to it. */}
        <Pressable
          style={[styles.ghostButton, styles.trashButton, {borderColor}]}
          onPress={handleDelete}
          disabled={pending}
          hitSlop={4}
          accessibilityRole="button"
          accessibilityLabel="Delete">
          <TrashIcon size={18} color={textColor} />
        </Pressable>
        {editFields?.kind === 'meeting' && onCancelEdit && (
          <Pressable style={[styles.ghostButton, {borderColor}]} onPress={handleNewFromThis} disabled={pending} hitSlop={8}>
            <Text style={[styles.ghostButtonText, {color: textColor}]} numberOfLines={1}>
              New from this
            </Text>
          </Pressable>
        )}
        {onRefile && !abbrevTarget && (
          <Pressable style={[styles.ghostButton, {borderColor}]} onPress={handleRefile} disabled={pending} hitSlop={8}>
            <Text style={[styles.ghostButtonText, {color: textColor}]}>Refile</Text>
          </Pressable>
        )}
        {onQuickFile && abbrevTarget && (
          <Pressable style={[styles.ghostButton, {borderColor}]} onPress={handleQuickFile} disabled={pending} hitSlop={8}>
            <Text style={[styles.ghostButtonText, {color: textColor}]} numberOfLines={1}>
              File: {truncateItemName(abbrevTarget.name)}
            </Text>
          </Pressable>
        )}
      </View>
      <View style={styles.centerSpacer} />
      <View style={styles.actionsRight}>
        <Pressable onPress={onCancelEdit} hitSlop={8}>
          <Text style={[styles.textButton, {color: textColor}]}>Cancel</Text>
        </Pressable>
        {monthlyToggle}
        <MarkWrap mark={errorState && errorState.field === null ? 'warning' : null} textColor={textColor}>
          <Pressable
            style={styles.primaryButton}
            onPress={editFields?.kind === 'meeting' ? submitMeetingEdit : submitTaskEdit}
            disabled={pending}
            hitSlop={8}>
            <Text style={styles.primaryButtonText}>Save</Text>
          </Pressable>
        </MarkWrap>
      </View>
    </View>
  ) : (
    <View style={styles.row4}>
      <View style={styles.actionsLeft} />
      <View style={styles.centerSpacer} />
      <View style={styles.actionsRight}>
        {monthlyToggle}
        <MarkWrap mark={buttonMark} textColor={textColor}>
          <Pressable
            style={styles.primaryButton}
            onPress={displayType === 'meeting' ? submitMeetingCreate : displayType === 'note' ? submitNoteCreate : submitTaskCreate}
            disabled={pending}
            hitSlop={8}>
            <Text style={styles.primaryButtonText} numberOfLines={1}>
              {abbrevTarget ? `+ Add to ${truncateItemName(abbrevTarget.name)}` : '+ Add'}
            </Text>
          </Pressable>
        </MarkWrap>
      </View>
    </View>
  );

  return (
    <View style={[styles.card, {borderColor}]}>
      {row1}
      {taskRow2}
      {captureOptionsRow}
      {meetingRow2}
      {noteRow2}
      {taskRow3}
      {meetingRow3}
      {noteRow3}
      {row4}
      {captureBelow}
    </View>
  );
}

/** Capture's Split lines: rows shown per page before ‹ › paging. */
const SPLIT_ROWS_PER_PAGE = 6;
/** Capture's "File to" full list: items per page behind More…. */
const FILE_TO_PAGE = 15;

// Row 3 tag paging is width-based since the 2026-09-29 overflow bugfix -
// the old fixed TASK/MEETING/NOTE_TAG_CAPACITY chip counts are gone; see
// ui/tagChipLayout.ts and useTagRowBudget above.

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
  },
  row1: {
    minHeight: 22,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  tabs: {
    flexDirection: 'row',
  },
  tabText: {
    fontSize: FONT.small,
    fontWeight: '600',
    marginRight: 18,
  },
  tabTextActive: {
    textDecorationLine: 'underline',
  },
  tabTextDisabled: {
    opacity: 0.35,
  },
  row2: {
    minHeight: 36,
    marginBottom: 6,
    // Positioning context for the clipboard strip (common.floatingStrip) - it is
    // absolutely positioned against *this* row, not the whole widget, so it
    // hovers right above the input regardless of which row2 (task/meeting)
    // is currently showing.
    position: 'relative',
  },
  row2Wrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Custom Select All/Copy/Cut/Paste overlay (Tilman, 2026-09-11) - see
  // taskRow2's comment for the full reasoning. `bottom: '100%'` sits it
  // flush above row2's own top edge without any hardcoded height; `right: 0`
  // keeps it clear of row 1's Todo/Meeting tabs (top-left) instead of
  // hovering over them.
  row3: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  row4: {
    minHeight: 32,
    flexDirection: 'row',
    alignItems: 'center',
  },
  /** Keeps the inactive tab's row2/row3 native views mounted (see taskRow2's comment) instead of unmounting them - Yoga skips display:none entirely, so it contributes no height. */
  hidden: {
    display: 'none',
  },
  input: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: FONT.medium,
  },
  inputFlex: {
    flex: 1,
    marginRight: 6,
  },
  /** Capture: recognized text can be several lines (3 visible, up to ~6). */
  inputMultiline: {
    minHeight: 96,
    maxHeight: 170,
  },
  captureOptions: {flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6, minHeight: 36},
  splitToggleText: {fontSize: FONT.small, fontWeight: '600'},
  splitHeader: {flexDirection: 'row', alignItems: 'center', marginBottom: 6, minHeight: 32},
  splitHeaderText: {fontSize: FONT.small, fontWeight: '600', marginRight: 10},
  splitPager: {flexDirection: 'row', alignItems: 'center'},
  splitPagerText: {fontSize: FONT.large, fontWeight: '600', paddingHorizontal: 8},
  splitRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 6},
  splitIndex: {width: 24, fontSize: FONT.small, fontWeight: '600'},
  splitRemove: {fontSize: FONT.medium, paddingHorizontal: 8},
  captureDest: {flex: 1, fontSize: FONT.small, fontWeight: '600', marginRight: 8},
  captureBelow: {borderTopWidth: 1, borderTopColor: COLORS.borderLight, marginTop: 10, paddingTop: 8},
  captureLabel: {fontSize: FONT.small, fontWeight: '700', marginBottom: 6, marginTop: 4},
  /** Meeting Row 3's time field, sized to leave room for TagChips alongside it (see meetingRow3's own comment) - roughly half the old fixed-width field's size, still wide enough for "HH:mm". */
  timeInputCompact: {
    fontSize: FONT.small,
    // 70 -> 110 (docs/dev/technical-design-monthly-view.md §5.1): the field now
    // also takes a range/length - "15:00-16:30" must fit. Tag capacity below
    // gives back one chip for it.
    width: 110,
    marginRight: 6,
  },
  /** Groups FlowStateChips/time-input with TagChips so the pair flows together on the row's left side, leaving row3's existing space-between to place the attachment cluster (when present) on the right - unchanged from before this feature. */
  row3ChipsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    // Safety net (bugfix 2026-09-29): tags can never paint past this group
    // into the attachment cluster.
    overflow: 'hidden',
  },
  /** Wraps FlowStateChips / the meeting time field so its width can be measured for the tag budget; never shrinks. */
  row3Lead: {
    flexShrink: 0,
  },
  waitingInput: {
    flex: 1,
    marginRight: 6,
  },
  dateInline: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  clearX: {
    fontSize: FONT.small,
    opacity: 0.7,
    marginLeft: 3,
    paddingHorizontal: 4,
  },
  iconButton: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonText: {
    fontSize: FONT.medium,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginRight: 6,
    borderColor: COLORS.accent,
  },
  chipSelected: {
    backgroundColor: COLORS.accent,
  },
  chipTextSelected: {
    fontSize: FONT.small,
    fontWeight: '600',
    color: COLORS.accentText,
  },
  attachCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    // Never squeezed by the tags (bugfix 2026-09-29); the padding keeps a
    // visible gap to the last chip and is included in the measured width.
    flexShrink: 0,
    paddingLeft: 8,
  },
  attachRemove: {
    fontSize: FONT.small,
    opacity: 0.7,
    marginLeft: 3,
    paddingHorizontal: 4,
  },
  actionsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  /** Keeps actionsLeft/actionsRight at the row's two ends - was the status text's slot until the central status slot took it over. */
  centerSpacer: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  primaryButtonText: {
    color: COLORS.accentText,
    fontSize: FONT.small,
    fontWeight: '600',
  },
  ghostButton: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
  },
  ghostButtonText: {
    fontSize: FONT.small,
    fontWeight: '600',
    opacity: 0.8,
  },
  /** Icon-only variant of ghostButton (edit-mode delete): tighter horizontal padding, icon centred; height still matches its text-labelled neighbours (icon 18 + 2x6 padding ~ line height + 2x6). */
  trashButton: {
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textButton: {
    fontSize: FONT.small,
    opacity: 0.7,
    fontWeight: '600',
    marginRight: 12,
  },
});

/**
 * Memoized (docs/dev/technical-design-render-perf-ab.md §3 B2): re-renders only
 * when its props change. Call sites pass stable callbacks
 * (ui/useStableCallback.ts); an unstable prop somewhere only means the memo
 * doesn't skip there, never a stale render.
 */
export default React.memo(QuickAddWidget);
