/**
 * Review step "Inbox to zero": every open Inbox todo and every Inbox meeting
 * from today on, to be filed to a Project/Area (Refile in Quick Add's edit
 * mode, or an abbreviation tag), finished, or cancelled. Same rows, Quick Add
 * and Files pane (link a file, pick a filing target) as the Inbox tab.
 * Past meetings in the Inbox are left out: they can't be prepared for any more.
 */
import React, {useEffect, useState} from 'react';
import {Text, View} from 'react-native';
import {AbbrevFileMatch} from '../../../domain/abbrev';
import {Destination, destinationLabel} from '../../../domain/destination';
import {withTaskCancelled, withTaskDone} from '../../../domain/taskEdit';
import {isTodayOrFuture, todayIso} from '../../../domain/meetingTime';
import {toggleMeetingTrackingAt} from '../../../domain/meetingTracking';
import {Meeting, Task} from '../../../domain/types';
import {findCachedItem, setCachedInbox} from '../../../storage/dataCache';
import {InboxFilingTarget, resolveFilingPick} from '../../../storage/inboxFiling';
import {itemTarget, moveMeeting, moveTask} from '../../../storage/entryMove';
import {useEntryMoveUi} from '../../../ui/useEntryMoveUi';
import {linkedFileStatus, locateLinkedFile, openLinkedFile, toLinkedFile} from '../../../storage/linkedFiles';
import {openOrCreateMeetingNote, openOrCreateTodoNote} from '../../../storage/meetingNoteContent';
import {useNoteCreateConfirm} from '../../../ui/useNoteCreateConfirm';
import {addMeetingToDestination, applyMeetingEdit, applyTaskEdit, buildMeeting, mutateEntryMeetings, mutateEntryTasks} from '../../../storage/itemMutations';
import {loadSettings} from '../../../storage/settingsStorage';
import {FolderEntry} from '../../../supernote/fileSystem';
import {log, logError} from '../../../utils/log';
import {requestEinkRefresh} from '../../../utils/screenRefresh';
import FileBrowserPane, {ARMING_TEXT, FileBrowserRoot, LinkTarget} from '../../../ui/FileBrowserPane';
import {COLUMN_WIDTH_PX} from '../../../ui/itemEntryRow';
import MeetingRow, {MeetingTrackingConfig} from '../../../ui/MeetingRow';
import MeetingList from '../../../ui/MeetingList';
import {useEditTarget} from '../../../ui/useEditTarget';
import PagedSection from '../../../ui/PagedSection';
import QuickAddWidget, {MeetingQuickAddFields, QuickFilePayload} from '../../../ui/QuickAddWidget';
import {displayTaskText} from '../../../domain/taskLabels';
import TaskRow, {taskRowHeight, taskRowLines} from '../../../ui/TaskRow';
import {common} from '../../../ui/commonStyles';
import MarksCard from '../../../ui/MarksCard';
import {errorMessage} from '../../../utils/errorMessage';
import {styles} from '../reviewStyles';
import {FIXED_INBOX_DESTINATION, ReviewStepProps} from '../shared';
import {bump} from '../reviewVisit';
import {useActionError} from '../../../ui/useActionError';
import {ProjectFileState} from '../../../storage/projectFile';
import {MarkScope} from '../../../domain/marks';


// Tasks and Meetings share the column 8:6, like the Inbox tab.
const TASKS_WEIGHT = 8;
const MEETINGS_WEIGHT = 6;

const INBOX_NOT_LOADED = 'Inbox not loaded yet - Settings → Advanced → Reload all files.';
const INBOX_ITEM_CHANGED = 'That inbox item changed on disk - Settings → Advanced → Reload all files.';

const ALL_MARKS: MarkScope = {type: 'all'};

type InboxEditTarget = {type: 'task' | 'meeting'; index: number};
type InboxArm = InboxEditTarget & {intent: 'link' | 'file'};

/** The step's rows: open todos, and meetings from today on (the hub counts the same). */
export function inboxStepEntries(inbox: ProjectFileState | null): {
  openTasks: {task: Task; taskIndex: number}[];
  openMeetings: {meeting: Meeting; meetingIndex: number}[];
} {
  return {
    openTasks: (inbox?.tasks ?? []).map((task, taskIndex) => ({task, taskIndex})).filter(({task}) => !task.cancelled && !task.done),
    openMeetings: (inbox?.meetings ?? [])
      .map((meeting, meetingIndex) => ({meeting, meetingIndex}))
      .filter(({meeting}) => !meeting.cancelled && isTodayOrFuture(meeting.date)),
  };
}

export default function InboxStep({
  data,
  onOpenItem,
  onAddTask,
  textColor,
  borderColor,
  placeholderColor,
}: ReviewStepProps): React.JSX.Element {
  const {settings, inbox, inboxPath, paths, refreshFromCache} = data;
  const action = useActionError('ReviewScreen.inboxActionError', 'ReviewScreen: inbox action failed');
  const confirmNoteCreate = useNoteCreateConfirm('ReviewScreen.noteCreateConfirm');
  const moveUi = useEntryMoveUi('ReviewScreen');
  const {
    target: editTarget,
    arm: inboxZeroArmTarget,
    start: startEditTarget,
    cancel: cancelEditTarget,
    armFor,
    cancelArm: cancelInboxArming,
    flushEditRef,
  } = useEditTarget<InboxEditTarget, InboxArm>();
  const {openTasks: inboxOpenTasks, openMeetings: inboxOpenMeetings} = inboxStepEntries(inbox);

  const inboxContext = () => {
    if (!inbox || !inboxPath) throw new Error(INBOX_NOT_LOADED);
    return {inbox, inboxPath, source: {kind: 'inbox' as const, path: inboxPath}};
  };

  /** Rewrites the Inbox's todos (file, shared Inbox state) - `mutate` gets a copy of the full list. */
  const writeTasks = async (index: number, mutate: (tasks: Task[]) => Task[]): Promise<void> => {
    const ctx = inboxContext();
    const task = ctx.inbox.tasks[index];
    if (!task) throw new Error(INBOX_ITEM_CHANGED);
    const {nextInbox} = await mutateEntryTasks({item: ctx.source, taskIndex: index, task}, mutate, ctx);
    if (nextInbox) setCachedInbox(nextInbox);
  };
  const writeMeetings = async (index: number, mutate: (meetings: Meeting[]) => Meeting[]): Promise<void> => {
    const ctx = inboxContext();
    const meeting = ctx.inbox.meetings[index];
    if (!meeting) throw new Error(INBOX_ITEM_CHANGED);
    const {nextInbox} = await mutateEntryMeetings({item: ctx.source, meetingIndex: index, meeting}, mutate, ctx);
    if (nextInbox) setCachedInbox(nextInbox);
  };
  const changeTask = (index: number, change: (task: Task) => Task) =>
    writeTasks(index, tasks => tasks.map((t, i) => (i === index ? change(t) : t)));
  const changeMeeting = (index: number, change: (meeting: Meeting) => Meeting) =>
    writeMeetings(index, meetings => meetings.map((m, i) => (i === index ? change(m) : m)));

  const handleInboxTaskDone = (taskIndex: number) =>
    action.run(async () => {
      await changeTask(taskIndex, t => withTaskDone(t, true, todayIso()));
      bump('inboxCleared');
      log('ReviewScreen: inbox task done', taskIndex);
    });

  /** Quick Add's Delete in edit mode: a soft cancel; edit mode closes only when it saved. */
  const handleDeleteEditForWidget = () => {
    if (!editTarget) return;
    const {type, index} = editTarget;
    action.run(async () => {
      if (type === 'task') await changeTask(index, t => withTaskCancelled(t, true));
      else await changeMeeting(index, m => ({...m, cancelled: true}));
      cancelEditTarget();
      bump('inboxCleared');
      log('ReviewScreen: inbox', type, 'cancelled', index);
    });
  };

  const handleFile = (type: 'task' | 'meeting', index: number, target: InboxFilingTarget) =>
    action.run(async () => {
      const {inbox: current, source} = inboxContext();
      const moved =
        type === 'task'
          ? await moveTask(source, index, current.tasks[index] ?? fail(), itemTarget(target), moveUi)
          : await moveMeeting(source, index, current.meetings[index] ?? fail(), itemTarget(target), moveUi);
      if (!moved) return; // cancelled in the note confirm
      refreshFromCache();
      bump('inboxCleared');
      log('ReviewScreen: filed inbox', type, index, '->', target.path);
    });

  /**
   * Quick Add's onQuickFile in edit mode: "save, but file elsewhere" (see
   * InboxScreen's handleQuickFileEdit). Throws instead of using the action
   * error, so the widget can show the failure inline; closes edit mode only
   * after the move succeeded.
   */
  const handleQuickFileEdit = async (target: AbbrevFileMatch, payload: QuickFilePayload): Promise<void> => {
    if (!editTarget) return;
    const {inbox: current, source} = inboxContext();
    const index = editTarget.index;
    let moved: Task | Meeting | null = null;
    if (editTarget.type === 'task' && payload.kind === 'task') {
      const stored = current.tasks[index] ?? fail();
      const updated: Task = applyTaskEdit(stored, payload.text, payload.linkedFile);
      moved = await moveTask(source, index, updated, itemTarget(target), moveUi);
    } else if (editTarget.type === 'meeting' && payload.kind === 'meeting') {
      const stored = current.meetings[index] ?? fail();
      moved = await moveMeeting(source, index, applyMeetingEdit(stored, payload.fields, payload.linkedFile), itemTarget(target), moveUi);
    }
    if (!moved) return; // cancelled in the note confirm (or mismatched kinds) - stay in edit mode
    refreshFromCache();
    bump('inboxCleared');
    log('ReviewScreen: quick-filed inbox', editTarget.type, index, '->', target.path);
    cancelEditTarget();
  };

  const armInboxLinkTarget = (type: 'task' | 'meeting', index: number) => armFor({type, index, intent: 'link'});
  const armInboxFileTarget = (type: 'task' | 'meeting', index: number) => armFor({type, index, intent: 'file'});
  const startEditingInboxTask = (taskIndex: number) => startEditTarget({type: 'task', index: taskIndex});
  const startEditingInboxMeeting = (meetingIndex: number) => startEditTarget({type: 'meeting', index: meetingIndex});

  const rootPathFor = (root: string): string | null =>
    root === 'resources' ? paths?.resources ?? null : root === 'browse' ? paths?.base ?? null : null;

  /** Arming's pick for intent 'link': the picked file becomes the row's linked file. */
  const handleInboxLinkPick = (root: string, relativePath: string) => {
    const arm = inboxZeroArmTarget;
    const rootPath = rootPathFor(root);
    action
      .run(async () => {
        if (!paths || !rootPath || !arm) throw new Error(INBOX_NOT_LOADED);
        const linkedFile = toLinkedFile(paths, `${rootPath.replace(/\/+$/, '')}/${relativePath}`);
        if (arm.type === 'task') await changeTask(arm.index, t => ({...t, linkedFile}));
        else await changeMeeting(arm.index, m => ({...m, linkedFile}));
        log('ReviewScreen: linked inbox item', arm.type, arm.index, '->', relativePath);
      })
      .then(cancelInboxArming);
  };

  /** Arming's pick for intent 'file': only Projects/Areas are offered while file-arming. */
  const handleInboxFilePick = (root: string, relativePath: string) => {
    if (!paths || !inboxZeroArmTarget || inboxZeroArmTarget.intent !== 'file') return;
    const target = resolveFilingPick(paths, root, relativePath);
    if (!target) return;
    handleFile(inboxZeroArmTarget.type, inboxZeroArmTarget.index, target);
    cancelInboxArming();
  };

  const handleInboxTaskSave = (taskIndex: number, nextText: string, nextLinkedFile: string): Promise<boolean> =>
    action.runSave(async () => {
      await changeTask(taskIndex, t => applyTaskEdit(t, nextText, nextLinkedFile));
      cancelEditTarget();
      log('ReviewScreen: inbox task edited', taskIndex);
    });

  const handleInboxMeetingCommitEdit = (meetingIndex: number, fields: MeetingQuickAddFields, nextLinkedFile: string): Promise<boolean> =>
    action.runSave(async () => {
      await changeMeeting(meetingIndex, m => applyMeetingEdit(m, fields, nextLinkedFile));
      cancelEditTarget();
      log('ReviewScreen: inbox meeting edited', meetingIndex);
    });

  /** Opens the todo's note, creating it first if needed. Inbox notes are always the item's own (no Project/Area to share a page in). */
  const handleInboxTaskNote = (taskIndex: number) =>
    action.run(async () => {
      const {inbox: current, inboxPath: folder} = inboxContext();
      const currentSettings = settings ?? (await loadSettings());
      const {task, changed} = await openOrCreateTodoNote(current.tasks[taskIndex], folder, currentSettings, {tasks: current.tasks}, {
        forceOwnTarget: true,
        confirmCreate: confirmNoteCreate,
      });
      if (changed) await changeTask(taskIndex, () => task);
      log('ReviewScreen: inbox task note opened/created', taskIndex);
    });

  const handleInboxMeetingNote = (meetingIndex: number) =>
    action.run(async () => {
      const {inbox: current, inboxPath: folder} = inboxContext();
      const currentSettings = settings ?? (await loadSettings());
      const {meeting, changed} = await openOrCreateMeetingNote(current.meetings[meetingIndex], folder, currentSettings, {tasks: current.tasks}, {
        forceOwnTarget: true,
        confirmCreate: confirmNoteCreate,
      });
      if (changed) await changeMeeting(meetingIndex, () => meeting);
      log('ReviewScreen: inbox meeting note opened/created', meetingIndex);
    });

  /** Quick Add's meeting add; an abbreviation tag files it straight to that Project/Area. */
  const handleAddInboxMeeting = async (fields: MeetingQuickAddFields, destination: Destination): Promise<void> => {
    const {nextInbox} = await addMeetingToDestination(buildMeeting(fields), destination, {inbox, inboxPath});
    if (nextInbox) setCachedInbox(nextInbox);
    else refreshFromCache();
    log('ReviewScreen: added meeting', destinationLabel(destination));
  };

  const inboxMeetingTrackingFor = (meetingIndex: number): MeetingTrackingConfig => ({
    rules: settings?.tagRules ?? [],
    onToggle: kind =>
      action.run(async () => {
        await writeMeetings(meetingIndex, meetings => toggleMeetingTrackingAt(meetings, meetingIndex, kind));
        requestEinkRefresh();
      }),
  });

  const editingInboxTaskIndex = editTarget?.type === 'task' ? editTarget.index : null;
  const editingInboxMeetingIndex = editTarget?.type === 'meeting' ? editTarget.index : null;
  const editingInboxTask = editingInboxTaskIndex !== null ? inbox?.tasks[editingInboxTaskIndex] ?? null : null;
  const editingInboxMeeting = editingInboxMeetingIndex !== null ? inbox?.meetings[editingInboxMeetingIndex] ?? null : null;
  const armingInboxTaskIndex = inboxZeroArmTarget?.type === 'task' ? inboxZeroArmTarget.index : null;
  const armingInboxMeetingIndex = inboxZeroArmTarget?.type === 'meeting' ? inboxZeroArmTarget.index : null;

  // Whether the edited row's linked file still exists - resolved here so Quick Add stays free of I/O.
  const editingInboxItem: Task | Meeting | null = editingInboxTask ?? editingInboxMeeting ?? null;
  const [inboxLinkedFileMissing, setInboxLinkedFileMissing] = useState(false);
  useEffect(() => {
    if (!editingInboxItem?.linkedFile || !paths) {
      setInboxLinkedFileMissing(false);
      return;
    }
    let cancelled = false;
    linkedFileStatus(paths, editingInboxItem.linkedFile).then(status => {
      if (!cancelled) setInboxLinkedFileMissing(status === 'missing');
    });
    return () => {
      cancelled = true;
    };
  }, [editingInboxItem?.linkedFile, paths]);

  const onOpenInboxLinkedFile = (linkedFile: string) => {
    if (!paths) return;
    openLinkedFile(paths, linkedFile).catch(e => logError('ReviewScreen: open linked file failed', errorMessage(e)));
  };

  // Arming (link or file) drives the Files pane; otherwise it shows where the edited row's linked file is.
  const inboxZeroLinkTarget: LinkTarget | null = inboxZeroArmTarget
    ? inboxZeroArmTarget.intent === 'file'
      ? {mode: 'arming', onPick: handleInboxFilePick, onCancel: cancelInboxArming, pickKind: 'folder', label: ARMING_TEXT.refile(inboxZeroArmTarget.type), root: 'browse'}
      : {mode: 'arming', onPick: handleInboxLinkPick, onCancel: cancelInboxArming, label: ARMING_TEXT.link(inboxZeroArmTarget.type)}
    : editingInboxItem?.linkedFile && paths
    ? (() => {
        const location = locateLinkedFile(paths, paths.resources, editingInboxItem.linkedFile);
        if (!location) return null;
        return {
          mode: 'locating' as const,
          root: 'resources',
          folderPath: location.folderPath,
          fileName: location.fileName,
          fileMissing: inboxLinkedFileMissing,
        };
      })()
    : null;


  // Browse lists active Projects/Areas only; Resources is disabled while file-arming.
  const inboxZeroActiveOnly = (entry: FolderEntry) => findCachedItem(entry.path)?.status === 'active';
  const inboxZeroIsFileArming = inboxZeroArmTarget?.intent === 'file';
  const inboxZeroFileBrowserRoots: FileBrowserRoot[] = paths
    ? [
        {key: 'resources', label: 'Resources', rootPath: paths.resources, disabled: inboxZeroIsFileArming},
        {
          key: 'browse',
          label: 'Browse',
          rootPath: paths.base,
          sources: [
            {kind: 'project', path: paths.projects, label: 'Projects'},
            {kind: 'area', path: paths.areas, label: 'Areas'},
          ],
          entryFilter: inboxZeroActiveOnly,
          onNavigateToItem: (kind, name, path) => onOpenItem({kind, name, path}),
        },
      ]
    : [];

return (
    <View style={styles.body}>
      <View style={[styles.leftPane, {borderColor}]}>
        <Text style={[styles.paneTitle, {color: textColor}]}>Files</Text>
        <FileBrowserPane
          roots={inboxZeroFileBrowserRoots}
          linkTarget={inboxZeroLinkTarget}
          textColor={textColor}
          borderColor={borderColor}
        />
      </View>
      <View style={styles.rightPane}>
      <Text style={[common.hint, {color: textColor}]}>
        Clear every capture: file it to a Project/Area, finish it on the spot, or cancel it.
      </Text>

      {/* One shared widget above both lists (docs/technical-design-unified-
          quickadd.md §3/§8) - it isn't Tasks- or Meetings-exclusive, so it
          sits above both rather than nested in either, same placement rule
          as ProjectDataPanel.tsx/InboxScreen.tsx. */}
      <QuickAddWidget
        fixedDestination={FIXED_INBOX_DESTINATION}
        onAddTask={onAddTask}
        onAddMeeting={handleAddInboxMeeting}
        editingTask={
          editingInboxTask ? {...editingInboxTask, text: displayTaskText(editingInboxTask, 'flat')} : undefined
        }
        editingMeeting={editingInboxMeeting ?? undefined}
        onSaveEditTask={
          editingInboxTaskIndex !== null
            ? (nextText, nextLinkedFile) => handleInboxTaskSave(editingInboxTaskIndex, nextText, nextLinkedFile)
            : undefined
        }
        onSaveEditMeeting={
          editingInboxMeetingIndex !== null
            ? (fields, nextLinkedFile) => handleInboxMeetingCommitEdit(editingInboxMeetingIndex, fields, nextLinkedFile)
            : undefined
        }
        editTargetKey={editTarget ? `${editTarget.type}:${editTarget.index}` : null}
        flushEditRef={flushEditRef}
        onCancelEdit={cancelEditTarget}
        onDeleteEdit={handleDeleteEditForWidget}
        onRefile={editTarget ? () => armInboxFileTarget(editTarget.type, editTarget.index) : undefined}
        onQuickFile={editTarget ? handleQuickFileEdit : undefined}
        linkedFileMissing={inboxLinkedFileMissing}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
      <MarksCard scope={ALL_MARKS} returnTo="review" textColor={textColor} borderColor={borderColor} />

      <View style={[common.divider, {backgroundColor: borderColor}]} />

      {/* Flex-weight stacking (docs/dev/technical-design-flex-
          weight-stacking.md §3.4) - stackedColumn (flex:1) splits its
          real available height 8:6 between the Tasks/Meetings
          PagedSections below via plain sibling `flex` weights. */}
      <View style={styles.stackedColumn}>
      <View style={{flex: TASKS_WEIGHT}}>
      {/* "Tasks" heading and page controls live in one PagedSection, like
          screens/InboxScreen.tsx's Tasks pane; the empty text is its
          `emptyHint`. No header/group rows here (unlike InboxScreen's
          flow-state-grouped list), so no `isCountableRow` needed - every
          row in `inboxOpenTasks` is a real entry. */}
      <PagedSection
        header="Tasks"
        rows={inboxOpenTasks}
        rowHeight={({task}) => taskRowHeight(task, COLUMN_WIDTH_PX, 'flat')}
        renderRow={({task, taskIndex}) => (
          <TaskRow
            key={`task-${taskIndex}`}
            task={task}
            isEditing={editingInboxTaskIndex === taskIndex}
            isArming={armingInboxTaskIndex === taskIndex}
            onStartEdit={() => startEditingInboxTask(taskIndex)}
            onToggleDone={() => handleInboxTaskDone(taskIndex)}
            onCreateNote={() => handleInboxTaskNote(taskIndex)}
            onOpenNote={() => handleInboxTaskNote(taskIndex)}
            linkedFile={task.linkedFile}
            onOpenLinkedFile={onOpenInboxLinkedFile}
            onArmLink={() => armInboxLinkTarget('task', taskIndex)}
            context="flat"
            height={taskRowHeight(task, COLUMN_WIDTH_PX, 'flat')}
            numberOfLines={taskRowLines(task, COLUMN_WIDTH_PX, 'flat')}
            textColor={textColor}
            borderColor={borderColor}
          />
        )}
        emptyHint="Inbox tasks are at zero. 🎉"
        textColor={textColor}
        borderColor={borderColor}
      />
      </View>

      <View style={[common.divider, {backgroundColor: borderColor}]} />

      <View style={{flex: MEETINGS_WEIGHT}}>
      {/* The standard MeetingList (docs/dev/history/technical-design-meeting-lists.md
          §4.4) - same rows and options as InboxScreen.tsx's Meetings pane:
          1-line by default, date+time column, no source (all Inbox). */}
      <MeetingList
        listId="reviewInbox"
        defaultLayout="oneLine"
        header="Meetings"
        rows={inboxOpenMeetings}
        renderRow={({meeting, meetingIndex}, layout) => (
          <MeetingRow
            key={`meeting-${meetingIndex}`}
            meeting={meeting}
            layout={layout}
            time="dateTime"
            highlight="mark"
            tracking={inboxMeetingTrackingFor(meetingIndex)}
            note={{onOpen: () => handleInboxMeetingNote(meetingIndex), onCreate: () => handleInboxMeetingNote(meetingIndex)}}
            file={{
              linkedFile: meeting.linkedFile,
              onOpen: onOpenInboxLinkedFile,
              onArm: () => armInboxLinkTarget('meeting', meetingIndex),
            }}
            onPress={() => startEditingInboxMeeting(meetingIndex)}
            state={
              editingInboxMeetingIndex === meetingIndex
                ? 'editing'
                : armingInboxMeetingIndex === meetingIndex
                ? 'arming'
                : undefined
            }
            textColor={textColor}
            borderColor={borderColor}
          />
        )}
        emptyHint="Inbox meetings are at zero. 🎉"
        textColor={textColor}
        borderColor={borderColor}
      />
      </View>
      </View>

      </View>
    </View>
  );
}

function fail(): never {
  throw new Error(INBOX_ITEM_CHANGED);
}
