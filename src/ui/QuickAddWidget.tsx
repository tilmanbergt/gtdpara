/**
 * The unified Todo/Meeting/Note add-and-edit widget
 * (docs/dev/history/technical-design-unified-quickadd.md). Every screen has exactly
 * one add/edit surface: a box of four rows, 170 dp in every state
 * (ui/quickAdd/QuickAddFrame.tsx, docs/dev/history/technical-design-item-card.md),
 * whose contents follow the tab and whether an item is being edited:
 *   R1 Tabs + main button - Todo/Meeting(/Agreement/Note) on the left; create: [M] + Add
 *                  ("+ Add to <Name>" when a recognized abbreviation #tag
 *                  files it elsewhere, technical-design-abbrev-quick-file.md);
 *                  edit: Cancel · Save ("Save to <Name>" with such a tag:
 *                  saved and moved in one step).
 *   R2 Input     - todo text + due date, or meeting title + date, or note title.
 *   R3 Metadata  - flow chips + tag chips (or "Waiting on"), or meeting time +
 *                  tag chips, or note tag chips.
 *   R4           - more tag chips (one page spans R3 and R4); the provenance
 *                  line while a screen adds one.
 *
 * A meeting or todo selected once shows its item card in the box instead
 * (`editTarget.mode === 'card'`, ui/itemCard/, where the screen passes
 * `meetingCard` / `todoCard`); its edit form then holds fields only. Where a
 * screen passes no card - and for a loop's own edit - the edit form keeps
 * the commands that act at once in R4 (delete, New from this, Refile, the
 * linked file's ✕, M - ui/quickAdd/ActionRow.tsx).
 *
 * The Agreement tab (docs/dev/history/technical-design-meetings-0.21.md §5)
 * shows where a screen passes `onAddAgreement`; its draft, edit and change
 * live in ui/quickAdd/useAgreementDraft.ts and AgreementRows.tsx, its card
 * in ui/itemCard/AgreementCard.tsx - the widget only routes.
 *
 * The parts: one hook per draft (ui/quickAdd/useTaskDraft.ts,
 * useMeetingDraft.ts, useNoteDraft.ts) over the shared state of
 * ui/quickAdd/useQuickAddCore.ts; the edit session (loading, focus,
 * save-then-switch) in ui/quickAdd/useEditSession.ts; the rows in
 * ui/quickAdd/*Rows.tsx. The lasso capture panel is its own shell over the
 * same parts (ui/quickAdd/CaptureQuickAdd.tsx).
 *
 * No key-remount: remounting would wipe the create drafts, so the widget is
 * a stable, long-lived instance per screen and call sites pass no `key`.
 * An edit detour never touches the drafts, and a tab switch never remounts a
 * row (they are hidden with `display: none`).
 *
 * Direct switches (docs/dev/history/technical-design-meeting-lists.md §10):
 * tapping another row while an edit is open switches to it. Before the
 * screen switches, it calls `flushEditRef.current()` (ui/useEditFlush.ts),
 * which saves the current target's changes - only if the fields differ from
 * what was loaded - and resolves false when that save failed, so the screen
 * stays on the current target and the error shows. Leaving the tab
 * (unmount) saves the same way. Drafts of new items are never saved
 * implicitly.
 *
 * "New from this" (docs/dev/technical-design-meeting-date-nudge-and-new-
 * from-this.md §B): a Meeting-edit-only R4 button that ends the edit through
 * the screen's own `onCancelEdit` and turns the edit form's current values
 * into the Meeting create draft.
 */
import React from 'react';
import {Keyboard} from 'react-native';
import {AbbrevFileMatch, resolveAbbrevFileTarget} from '../domain/abbrev';
import {insertTagAtPosition, stripSpaceAfterHash} from '../domain/markdown';
import {replacesLabel} from '../domain/agreementText';
import {formatMeetingWhen, todayIso} from '../domain/meetingTime';
import {meetingDisplayTitle} from '../domain/meetingTracking';
import {Destination} from '../domain/destination';
import {usePerfRender} from '../utils/perf';
import MeetingCard from './itemCard/MeetingCard';
import {MeetingCardData} from './itemCard/useMeetingCard';
import AgreementCard from './itemCard/AgreementCard';
import {AgreementCardData} from './itemCard/useAgreementCard';
import TodoCard from './itemCard/TodoCard';
import {TodoCardData} from './itemCard/useTodoCard';
import {errorMessage} from '../utils/errorMessage';
import HighlightMark from './HighlightMark';
import {CreateActions, EditActions, EditCommands} from './quickAdd/ActionRow';
import {AgreementInputRow, AgreementTagRows} from './quickAdd/AgreementRows';
import {AgreementHandlers, useAgreementDraft} from './quickAdd/useAgreementDraft';
import {MeetingInputRow, MeetingMetaRows} from './quickAdd/MeetingRows';
import {NoteInputRow, NoteTagRows} from './quickAdd/NoteRows';
import ProvenanceLine, {QuickAddAdds} from './quickAdd/ProvenanceLine';
import QuickAddFrame from './quickAdd/QuickAddFrame';
import TabsRow from './quickAdd/TabsRow';
import {AttachmentCluster, TaskInputRow, TaskMetaRows} from './quickAdd/TaskRows';
import {MeetingQuickAddFields, QuickAddEditTarget, QuickFilePayload, sameEditTarget, truncateItemName} from './quickAdd/types';
import {DraftPrefill, MeetingSeed, useDraftRequests} from './quickAdd/useDraftRequests';
import {useEditSession} from './quickAdd/useEditSession';
import {useMeetingDraft} from './quickAdd/useMeetingDraft';
import {useNoteDraft} from './quickAdd/useNoteDraft';
import {useQuickAddCore} from './quickAdd/useQuickAddCore';
import {useQuickAddStatus} from './quickAdd/useQuickAddStatus';
import {useTaskDraft} from './quickAdd/useTaskDraft';

export type {CaptureSaveMode, CaptureSeed, MeetingQuickAddFields, QuickAddEditTarget, QuickFilePayload} from './quickAdd/types';
export {editTargetFor} from './quickAdd/types';

interface Props extends AgreementHandlers {
  /**
   * Optional id of the screen slot this widget sits in (e.g. 'daily',
   * 'current') - its tag-row widths are remembered under it, so a revisit
   * needs no re-measure render (docs/dev/history/technical-design-render-perf-ab.md §3
   * A2). Omitted: widths are measured fresh on every mount.
   */
  layoutKey?: string;
  /** Every add/edit goes to this one destination - no picker is ever shown (docs/dev/history/technical-design-filing-unification.md §7). */
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
   * (docs/dev/history/technical-design-cache-subscription-and-shared-add-path.md §C).
   * Omit on screens that list every meeting anyway (Inbox, Project/Area,
   * Review): no suffix, message unchanged.
   */
  isMeetingDateVisible?: (date: string) => boolean;

  onAddTask: (text: string, destination: Destination) => Promise<void>;
  onAddMeeting: (fields: MeetingQuickAddFields, destination: Destination) => Promise<void>;

  /** The item being edited, or null/absent (create mode). Build it with `editTargetFor`. */
  editTarget?: QuickAddEditTarget | null;
  /**
   * The selected meeting's card (ui/itemCard/useMeetingCard.ts), shown in the
   * box while `editTarget` is a meeting in 'card' mode. Where a screen passes
   * it, the meeting's edit form holds fields only: the commands are on the card.
   */
  meetingCard?: MeetingCardData | null;
  /** The selected todo's card (ui/itemCard/useTodoCard.ts), the same way: shown while `editTarget` is a todo in 'card' mode. */
  todoCard?: TodoCardData | null;
  /** The selected agreement's card (ui/itemCard/useAgreementCard.ts): shown while `editTarget` is an agreement in 'card' mode. */
  agreementCard?: AgreementCardData | null;
  /** Resolve `false` when the save failed (the screen showed its own error) - the widget then keeps the edit open. */
  onSaveEditTask?: (nextText: string, nextLinkedFile: string) => Promise<void | boolean>;
  onSaveEditMeeting?: (fields: MeetingQuickAddFields, nextLinkedFile: string) => Promise<void | boolean>;
  /**
   * Save-then-switch (docs/dev/history/technical-design-meeting-lists.md §10): the
   * widget puts a `flush()` here that saves pending edits of the current
   * target (only when something changed) and resolves whether the screen
   * may move on. ui/useEditFlush.ts wraps a screen's "start editing another
   * row" handlers with it.
   */
  flushEditRef?: React.MutableRefObject<(() => Promise<boolean>) | null>;
  onCancelEdit?: () => void;
  onDeleteEdit?: () => void;
  /** Renders the "Refile" button in edit mode when provided (storage/inboxFiling.ts's module doc comment) - arms the caller's own Files pane (Projects/Areas tabs) for the item currently being edited, same shape onDeleteEdit has. Only passed by screens with a Files pane to arm (Current tab, Inbox tab, Review's Inbox-to-zero step) - its absence (Daily, Review's week-ahead/stalled-project/neglected-area cards) is what makes those screens' edit mode show no Refile control at all, rather than a disabled one. */
  onRefile?: () => void;
  /**
   * Performs the abbreviation quick-file move directly (no Browse picker)
   * once a recognized #tag resolves to a registered Project/Area's
   * abbreviation, while editing an existing task/meeting - renders
   * "File: <Name>" in Refile's own Row 4 slot whenever a match is present,
   * independent of onRefile's own presence (so it also works on a screen
   * with no Files pane to arm, like Daily, which never passes onRefile at
   * all). Absent entirely (no fallback, no error) on a screen whose edit mode
   * doesn't support moving an item to a different file. See
   * `QuickFilePayload`'s own doc comment for why this also hands the caller
   * the fully-composed, tag-stripped current text/fields rather than just
   * the target.
   */
  onQuickFile?: (target: AbbrevFileMatch, payload: QuickFilePayload) => Promise<void>;
  /**
   * The REAL current location of the item being edited right now, for
   * resolveAbbrevFileTarget's self-exclude check - `null` when it's an Inbox
   * item (Inbox never carries an abbreviation, so it can never self-match
   * anyway). Omit this prop entirely on a screen where `fixedDestination`
   * already always names whatever's being edited (Inbox tab, Current tab,
   * Review's Inbox-to-zero step - every one of those is either always
   * `{type: 'inbox'}` or always that Project/Area's own path): the exclude
   * check then derives it from `fixedDestination`. Daily is the one screen
   * where that fallback is wrong and this prop is required: Daily's
   * `fixedDestination` is always `{type: 'inbox'}` (its own create-mode
   * default, unrelated to any given entry), while the
   * DailyTaskEntry/DailyMeetingEntry actually being edited can live in
   * Inbox OR any Project/Area - passing this prop lets self-exclusion
   * check the entry's real path instead of always assuming Inbox (which
   * would otherwise show a same-place "File: <Name>" no-op button whenever
   * the tag typed while editing named the item's own current Project/Area).
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
   * from (ui/quickAdd/useNoteDraft.ts).
   */
  onAddNote?: (title: string, tags: string[], folderPath: string) => Promise<void>;
  /**
   * Where a new Note would be created *right now* - the Files pane's
   * currently active location, `null` whenever its active root isn't the
   * item's own root ('Project Files'/'Area Files'). Re-read at the moment
   * "+Add" is pressed, not captured when the Note tab was opened. Ignored
   * when `onAddNote` isn't passed.
   */
  noteFolderPath?: string | null;

  /**
   * Appends text to the Todo or Meeting create draft and shows that tab, once
   * per nonce (ui/quickAdd/useDraftRequests.ts) - Gmail inbox review's
   * selected email text. Line breaks collapse to spaces; never touches
   * date/time/flow state or focuses a field (no soft keyboard on e-ink).
   */
  prefill?: DraftPrefill | null;
  /** "+ Next <type>": replaces the Meeting draft and shows the Meeting tab, once per nonce (ui/quickAdd/useDraftRequests.ts). */
  meetingSeed?: MeetingSeed | null;
  /** Create mode, Todo and Agreement tabs: one grey line saying what the screen adds to the new entry, a ✕ per part (ui/quickAdd/ProvenanceLine.tsx). */
  provenance?: QuickAddAdds | null;

  /** Task input only; defaults to "New task" everywhere. */
  placeholder?: string;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}

function QuickAddWidget(props: Props): React.JSX.Element {
  usePerfRender('QuickAddWidget');
  const {fixedDestination, editTarget, editingItemPath, taskOnly = false, onAddNote, noteFolderPath = null} = props;
  const {onCancelEdit, onQuickFile, onRefile, onDeleteEdit, provenance, layoutKey, linkedFileMissing, meetingCard, todoCard} = props;
  const {textColor, borderColor, placeholderColor} = props;
  const colors = {textColor, borderColor, placeholderColor};

  const core = useQuickAddCore({fixedDestination, editingItemPath});
  const {displayType, isEditing, editFields, pending, setError, setPending} = core;
  const task = useTaskDraft(core, {
    fixedDestination,
    editingItemPath,
    editingLoop: editTarget?.kind === 'loop',
    loopsEnabled: true,
    onAddTask: props.onAddTask,
    onSaveEditTask: props.onSaveEditTask,
  });
  const meeting = useMeetingDraft(core, {
    fixedDestination,
    initialDate: props.initialDate,
    initialMonthly: props.initialMonthly,
    isMeetingDateVisible: props.isMeetingDateVisible,
    onAddMeeting: props.onAddMeeting,
    onSaveEditMeeting: props.onSaveEditMeeting,
  });
  const note = useNoteDraft(core, {onAddNote, noteFolderPath});
  const agreement = useAgreementDraft(core, {
    onAddAgreement: props.onAddAgreement,
    onSaveEditAgreement: props.onSaveEditAgreement,
    onChangeAgreement: props.onChangeAgreement,
  });
  useEditSession(core, task, meeting, {editTarget, flushEditRef: props.flushEditRef, onCancelEdit, agreement});

  useDraftRequests(props.prefill, props.meetingSeed, isEditing, {
    text: (kind, addition) => {
      const appendTo = (current: string): string => (current.trim() ? `${current.replace(/\s+$/, '')} ${addition}` : addition);
      if (kind === 'meeting') {
        if (!taskOnly) meeting.showDraft({...meeting.draft, title: stripSpaceAfterHash(appendTo(meeting.draft.title))}, null);
        return;
      }
      task.setDraft(d => ({...d, text: stripSpaceAfterHash(appendTo(d.text))}));
      task.lastSelectionRef.current = null;
      task.setJustAdded(null);
      task.setTagPage(0);
      core.setActiveType('task');
      setError(null);
    },
    seed: fields => {
      if (!taskOnly) meeting.showDraft({title: fields.title, date: fields.date, time: formatMeetingWhen(fields), monthly: false}, null);
    },
  });

  // Note has no filing concept - never matched.
  const abbrevTarget = displayType === 'task' ? task.abbrevTarget : displayType === 'meeting' ? meeting.abbrevTarget : null;

  /**
   * Edit-mode quick-file: hands the screen the fields composed exactly the
   * way Save composes them, so every other change made during this edit
   * (text, flow state, due, time, a pending linked-file pick) moves along
   * instead of the last-saved copy; the matched abbreviation tag is
   * additionally stripped.
   */
  const handleQuickFile = () => {
    if (!abbrevTarget || !onQuickFile || !editFields) return;
    Keyboard.dismiss();
    const composed = editFields.kind === 'task' ? task.quickFilePayload(abbrevTarget) : meeting.quickFilePayload(abbrevTarget);
    if (!composed) return;
    setError(null);
    setPending(true);
    onQuickFile(abbrevTarget, composed.payload)
      .then(() => core.recordTags(composed.tags))
      .catch(e => setError(errorMessage(e)))
      .finally(() => setPending(false));
  };

  /**
   * "New from this" - Meeting edit mode only. The edit form's CURRENT values
   * (unsaved tweaks included) become the Meeting create draft, and the edit
   * ends through the screen's own onCancelEdit (nothing saved, original
   * untouched). Not carried over: the linked file and the #prepped/#reviewed
   * tick tags (meetingDisplayTitle strips them), nor M.
   *
   * When the original lives somewhere other than where this widget creates
   * (Daily and Week create in Inbox), its Project/Area abbreviation tag is
   * appended to the draft title - resolveAbbrevFileTarget then matches it,
   * R4 shows "+ Add to <Name>", and the user can override by deleting the
   * tag. Only when the tag will resolve (an abbreviation, Active/On Hold)
   * and the title carries no recognized abbreviation of its own.
   *
   * All state changes happen in one event handler (one batched render), and
   * the draft is set BEFORE the edit ends, so no frame shows an empty draft.
   */
  const newFromThis = (fields: {title: string; date: string; time: string}) => {
    if (!onCancelEdit) return;
    Keyboard.dismiss();
    const displayTitle = meetingDisplayTitle({title: fields.title});
    let draftTitle = displayTitle;
    const {fixedExcludePath, abbrevItems} = core;
    const originPath = editingItemPath !== undefined ? editingItemPath : fixedExcludePath;
    const origin = originPath && originPath !== fixedExcludePath ? abbrevItems.find(item => item.path === originPath) : undefined;
    if (
      origin?.abbrev &&
      (origin.status === 'active' || origin.status === 'on-hold') &&
      !resolveAbbrevFileTarget(displayTitle, abbrevItems, fixedExcludePath)
    ) {
      draftTitle = insertTagAtPosition(displayTitle, origin.abbrev, null).text;
    }
    meeting.showDraft(
      {title: draftTitle, date: fields.date, time: fields.time, monthly: false},
      `Copied "${truncateItemName(displayTitle, 16)}" - adjust, then Add`,
    );
    onCancelEdit();
  };

  const buttonMark = useQuickAddStatus(core, task, meeting, note, agreement);

  // The "M" box left of + Add (meeting tab only) - see ui/HighlightMark.tsx.
  const monthlyToggle =
    displayType === 'meeting' ? (
      <HighlightMark on={meeting.fields.monthly} variant="toggle" onPress={meeting.toggleMonthly} disabled={pending} textColor={textColor} />
    ) : null;
  const loopMode = task.loopMode;
  // A recognized abbreviation tag while editing: Save files the item there
  // in the same step (technical-design-item-card.md K3).
  const saveTo = onQuickFile && abbrevTarget && loopMode.kind !== 'make' && loopMode.kind !== 'loop' ? abbrevTarget : null;
  const actions = isEditing ? (
    <EditActions
      pending={pending}
      onCancel={onCancelEdit}
      saveLabel={
        agreement.changing
          ? '+ Add'
          : loopMode.kind === 'make'
            ? 'Make loop'
            : loopMode.kind === 'loop'
              ? 'Save loop'
              : saveTo
                ? `Save to ${truncateItemName(saveTo.name)}`
                : 'Save'
      }
      onSave={
        editFields?.kind === 'agreement' ? agreement.submitEdit : saveTo ? handleQuickFile : editFields?.kind === 'meeting' ? meeting.submitEdit : task.submitEdit
      }
      errorOnSave={!!core.errorState && core.errorState.field === null}
      textColor={textColor}
    />
  ) : (
    <CreateActions
      label={loopMode.kind === 'add' ? '+ Add loop' : abbrevTarget ? `+ Add to ${truncateItemName(abbrevTarget.name)}` : '+ Add'}
      onPress={
        displayType === 'meeting'
          ? meeting.submitCreate
          : displayType === 'note'
            ? note.submitCreate
            : displayType === 'agreement'
              ? agreement.submitCreate
              : task.submitCreate
      }
      disabled={pending || loopMode.kind === 'exists'}
      mark={buttonMark}
      monthlyToggle={monthlyToggle}
      textColor={textColor}
    />
  );

  const editKind = editFields?.kind ?? null;
  // The item card in the box's place: a meeting selected once, where the screen passes its card.
  const cardShown =
    editTarget?.mode === 'card' &&
    ((editTarget.kind === 'meeting' && !!meetingCard) || (editTarget.kind === 'task' && !!todoCard) || (editTarget.kind === 'agreement' && !!props.agreementCard));
  // A loop's own edit (the loop overview) has no card: it keeps the commands.
  const taskCommands = editKind === 'task' && (!todoCard || editTarget?.kind === 'loop');
  const editCommands = editKind && editKind !== 'agreement' ? (
    <EditCommands
      pending={pending}
      onDelete={
        loopMode.kind === 'loop'
          ? undefined
          : () => {
              Keyboard.dismiss();
              onDeleteEdit?.();
            }
      }
      onNewFromThis={editFields?.kind === 'meeting' && onCancelEdit ? () => newFromThis(editFields.fields) : undefined}
      onRefile={
        onRefile && !saveTo
          ? () => {
              Keyboard.dismiss();
              onRefile();
            }
          : undefined
      }
      attachment={
        <AttachmentCluster
          linkedFile={editKind === 'task' ? task.linkedFile : meeting.linkedFile}
          missing={linkedFileMissing}
          onClear={editKind === 'task' ? task.clearLinkedFile : meeting.clearLinkedFile}
          textColor={textColor}
        />
      }
      monthlyToggle={editKind === 'meeting' ? monthlyToggle : null}
      textColor={textColor}
      borderColor={borderColor}
    />
  ) : null;
  // R4 of the Todo tab: the provenance line while creating (K6), the
  // commands while editing without a card, else the second tag row.
  const taskRow4 = taskCommands
    ? editCommands
    : editKind === 'task'
      ? undefined
      : provenance && provenance.length > 0 && !isEditing ? <ProvenanceLine parts={provenance} textColor={textColor} /> : undefined;
  // R4 of the Agreement tab: "↳ replaces …" while changing one (its ✕ cancels), the screen's line while creating.
  const replaces = editTarget?.kind === 'agreementChange' ? editTarget.replaces.agreement : null;
  const agreementRow4 =
    replaces && agreement.changing ? (
      <ProvenanceLine parts={[{key: 'replaces', label: replacesLabel(replaces), onClear: () => onCancelEdit?.()}]} textColor={textColor} />
    ) : provenance && provenance.length > 0 && !isEditing ? (
      <ProvenanceLine parts={provenance} textColor={textColor} />
    ) : undefined;
  const today = todayIso();

  return (
    <QuickAddFrame
      row1={
        <TabsRow
          core={core}
          taskOnly={taskOnly}
          hasNoteTab={!!onAddNote}
          hasAgreementTab={!!props.onAddAgreement || editKind === 'agreement'}
          noteFolderPath={noteFolderPath}
          actions={actions}
          textColor={textColor}
        />
      }
      row2={
        <>
          <TaskInputRow core={core} task={task} placeholder={props.placeholder ?? 'New task'} {...colors} />
          <MeetingInputRow core={core} meeting={meeting} {...colors} />
          <NoteInputRow core={core} note={note} {...colors} />
          <AgreementInputRow core={core} agreement={agreement} today={today} {...colors} />
        </>
      }
      rows34={
        <>
          <TaskMetaRows core={core} task={task} layoutKey={layoutKey} row4={taskRow4} {...colors} />
          <MeetingMetaRows
            core={core}
            meeting={meeting}
            layoutKey={layoutKey}
            row4={editKind === 'meeting' && !meetingCard ? editCommands : undefined}
            {...colors}
          />
          <NoteTagRows core={core} note={note} layoutKey={layoutKey} textColor={textColor} borderColor={borderColor} />
          <AgreementTagRows core={core} agreement={agreement} layoutKey={layoutKey} row4={agreementRow4} textColor={textColor} borderColor={borderColor} />
        </>
      }
      card={
        !cardShown ? null : editTarget?.kind === 'agreement' && props.agreementCard ? (
          <AgreementCard card={props.agreementCard} textColor={textColor} borderColor={borderColor} />
        ) : editTarget?.kind === 'task' && todoCard ? (
          <TodoCard card={todoCard} textColor={textColor} borderColor={borderColor} />
        ) : meetingCard ? (
          <MeetingCard
            card={meetingCard}
            onNewFromThis={() =>
              newFromThis({title: meetingCard.meeting.title, date: meetingCard.meeting.date, time: formatMeetingWhen(meetingCard.meeting)})
            }
            textColor={textColor}
            borderColor={borderColor}
          />
        ) : null
      }
      borderColor={borderColor}
    />
  );
}

/** React.memo's prop check: shallow, except that an edit target counts as equal when it names the same item. */
function sameProps(prev: Props, next: Props): boolean {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)] as Array<keyof Props>);
  for (const key of keys) {
    if (key === 'editTarget' ? !sameEditTarget(prev.editTarget, next.editTarget) : prev[key] !== next[key]) return false;
  }
  return true;
}

/**
 * Memoized (docs/dev/history/technical-design-render-perf-ab.md §3 B2): re-renders only
 * when its props change. Call sites pass stable callbacks
 * (ui/useStableCallback.ts); an unstable prop somewhere only means the memo
 * doesn't skip there, never a stale render.
 */
export default React.memo(QuickAddWidget, sameProps);
