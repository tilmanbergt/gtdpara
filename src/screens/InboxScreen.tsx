/**
 * Inbox as its own tab (docs/dev/technical-design-inbox-tab.md §2, 2026-09-03) -
 * the fallback destination for every task/meeting captured with no
 * Project/Area (unchanged from before this feature).
 *
 * Layout (technical-design-linked-files.md §1/§8/§10.5, 2026-09-07 rebuild;
 * docs/dev/technical-design-filing-unification.md §3, 2026-09-07 filing
 * unification): mirrors screens/ItemDetail.tsx's two-pane shape - left pane
 * is ui/FileBrowserPane.tsx with two roots, `resources` and `browse` (a
 * two-level, always-Active-only Projects/Areas browser - 2026-09-09,
 * replacing the earlier separate `projects`/`areas` roots this comment used
 * to describe; see ui/FileBrowserPane.tsx's `sources` doc comment), right pane
 * stacks Tasks above Meetings (previously side by side - stacking is what
 * makes room for the Files pane on the left, same as ItemDetail's
 * Files-pane-on-the-left / data-on-the-right split).
 *
 * Reads Inbox.txt directly via storage/projectFile.ts's loadProjectFile -
 * same as screens/DailyView.tsx's and screens/ReviewScreen.tsx's own Inbox
 * reads, since it's a single flat file outside storage/dataCache.ts's
 * per-item scan. `items` (the cache) is loaded alongside it to keep the
 * Files pane's Browse root's Active-only `entryFilter` fresh after a File
 * action - this screen itself never reads/writes any cached item's own
 * tasks/meetings. `paths` (domain/settings.ts's ResolvedParaPaths, off the
 * same cache) is what the Files pane's roots and every
 * storage/linkedFiles.ts call below need - see rebuildCache's own `paths`
 * field.
 *
 * Every row is the shared ui/TaskRow.tsx/ui/MeetingRow.tsx
 * (docs/dev/technical-design-inbox-tab.md §1) - the same components
 * ProjectDataPanel.tsx, ReviewScreen.tsx, and DailyView.tsx's Inbox-sourced
 * rows use - so this screen adds zero new row markup of its own, just wires
 * its own handlers into them. Unlike Daily's Inbox-sourced rows, every row
 * here gets `onArmLink` (this tab, Current, and now Weekly Review's
 * Inbox-to-zero step are the linking surfaces - see the module doc
 * comment's "Linked file" note below). Filing (moving a row into a
 * Project/Area) has no row-level affordance any more - the old row-level
 * `onArmFile` "File" action (docs/dev/technical-design-filing-unification.md
 * §3/§4) was retired 2026-09-09 in favor of a single "Refile" button inside
 * QuickAddWidget's edit mode (storage/inboxFiling.ts's module doc comment) -
 * open the row for editing, then tap Refile.
 *
 * Scope is everything, unfiltered (docs/dev/technical-design-inbox-tab.md §2,
 * requirement 4) - no today/tomorrow-style window like Daily's Calendar,
 * every open task regardless of flow-state or due date. Tasks are grouped
 * by flow-state (domain/flowState.ts's groupTasksByFlowState - Next,
 * Waiting For, Someday, Maybe, Other) with a "Hide done tasks" toggle,
 * exactly the same convention ProjectDataPanel.tsx's own TodosSection
 * already established (GtdParaSettings.hideDoneInboxTasks, a sibling
 * setting to that screen's hideDoneProjectTasks). See
 * ProjectDataPanel.tsx's own TodosSection for why hideDone is applied
 * *after* grouping (filtering each already-indexed group's entries) rather
 * than by pre-filtering `tasks` before the group call - pre-filtering would
 * renumber entries relative to a shorter array, breaking every row action's
 * `tasks.slice(); next[index] = ...` addressing (that exact bug was found
 * and fixed there in the same pass this screen was originally built). Meetings
 * show every not-cancelled meeting, Upcoming/Past (domain/meetingTime.ts's
 * splitAndSortMeetings - same split ProjectDataPanel.tsx's own
 * MeetingsSection uses), not just today/tomorrow.
 *
 * Mutations: saveInboxTasks/saveInboxMeetings below are this screen's own
 * small "re-fetch-index, apply, write, update local state" pair - the same
 * save-shape screens/DailyView.tsx's saveEntryTasks/saveEntryMeetings and
 * screens/ReviewScreen.tsx's handleInboxTaskDone/etc. already use against
 * `inbox` state, just without those two screens' extra "which surface does
 * this row actually belong to" branching, since every row here is always an
 * Inbox row. Filing and quick-file go through storage/entryMove.ts's
 * moveTask/moveMeeting, like every other move.
 *
 * Linked file / filing / one arm target (technical-design-linked-files.md
 * §8; docs/dev/technical-design-filing-unification.md §3): the exact same lift
 * screens/ProjectDataPanel.tsx got for linking, extended with an `intent`
 * ('link' | 'file') so the one `armTarget` can drive either action - this
 * screen owns both the Tasks and Meetings sections directly, so
 * `editTarget`/`armTarget` (which row, task or meeting, is being edited or
 * armed - only one of either across the whole screen) live here as plain
 * state rather than being reported up through an `onLinkTargetChange` prop
 * the way ProjectDataPanel.tsx reports up into screens/ItemDetail.tsx. The
 * derived `linkTarget` feeds straight into this screen's own
 * FileBrowserPane - `handlePickLinkedFile` (intent 'link') always resolves
 * against whichever root was tapped, `resources` or `browse` (drilled below
 * its own depth-0 chooser - see §3.1's flagged linking side effect);
 * `handlePickFile` (intent 'file') resolves via storage/inboxFiling.ts's
 * resolveFilingPick and only ever sees 'projects'/'areas' - synthesized by
 * ui/FileBrowserPane.tsx itself from a Browse pick one level below its
 * depth-0 "Projects"/"Areas" chooser (2026-09-09, its `sources` doc
 * comment), since Resources is disabled (not removed - Tilman's "don't
 * add/remove tabs" call) while file-arming. Locating an existing link reuses
 * storage/linkedFiles.ts's
 * locateLinkedFile by passing `paths.resources` as the "item root"
 * argument - since Inbox has no item root of its own, this makes the
 * function's two checks (under item vs. under resources) identical, which
 * is exactly what's wanted: either the link resolves somewhere under
 * Resources (the only place Inbox ever links from, absent a Project/Area
 * link picked via the new tabs) or it doesn't resolve at all, and either
 * way the returned folderPath/fileName are already correctly relative to
 * `paths.resources`.
 *
 * Google Calendar tab (docs/dev/technical-design-google-calendar.md §9): now
 * lives inside the Meetings section (moved along with Meetings when this
 * screen's layout stacked) rather than the old Meetings-pane's own top-level
 * mini-tab - same <MiniTabs> (ui/MiniTabs.tsx) pattern, same "Google" =
 * shared ui/GoogleCalendarPanel.tsx at `maxDays={30}`, self-measuring
 * (2026-09-17, see below) rather than a fixed pageSize now.
 *
 * Pagination + edit reuse (docs/dev/technical-design-pagination-edit-reuse.md
 * §2/§4/§5, 2026-09-06): both the Tasks and Meetings sections page
 * (ui/PagedSection.tsx/ui/pagination.ts's `usePagedByHeight`, replacing the
 * row-count `usePagination`/`ui/PageControls.tsx` pair per docs/technical-
 * design-pagination-fixed-height.md §3.4, Batch 2, 2026-09-15) instead of
 * scrolling, flattening their own grouping (flow-state for Tasks,
 * Upcoming/Past for Meetings) into one paginated sequence with group
 * headers as in-sequence rows - same pattern DailyView/ProjectDataPanel
 * use.
 *
 * Flex-weight stacking (2026-09-17, docs/dev/technical-design-flex-weight-
 * stacking.md §3.4): the Tasks/Meetings pixel budgets this section used to
 * carry (`PAGE_SIZE.inboxTasks`/`inboxMeetings`/`googleCalendarInbox`) are
 * gone - `rightPane`'s Tasks/Meetings stack is now an 8:6 `flex`-weighted
 * split of `styles.stackedColumn` (the same ratio those two retired
 * constants had), each stacked section self-measuring into its own
 * weighted box (see `stackedColumn`'s own style comment and the render
 * below). Editing swaps the
 * shared ui/QuickAddWidget.tsx (docs/dev/technical-design-unified-quickadd.md,
 * 2026-09-08 - one widget above both stacked sections, replacing the former
 * pair of ui/TaskQuickAdd.tsx / ui/MeetingQuickAdd.tsx widgets) into its
 * `editingTask`/`editingMeeting` mode instead of an inline row form.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, View} from 'react-native';
import {AbbrevFileMatch} from '../domain/abbrev';
import {Destination} from '../domain/destination';
import {groupTasksByFlowState} from '../domain/flowState';
import {deriveTaskFields} from '../domain/markdown';
import {splitAndSortMeetings} from '../domain/meetingTime';
import {MeetingTrackingKind, toggleMeetingTrackingAt} from '../domain/meetingTracking';
import {TagRule} from '../domain/tagRules';
import {ResolvedParaPaths} from '../domain/settings';
import {Meeting, Task} from '../domain/types';
import {findCachedItem, getCachedData, rebuildCache, setCachedInbox} from '../storage/dataCache';
import {InboxFilingTarget, resolveFilingPick} from '../storage/inboxFiling';
import {EntrySource, itemTarget, moveMeeting, moveTask} from '../storage/entryMove';
import {addMeetingToDestination, addTaskToDestination} from '../storage/itemMutations';
import {useEntryMoveUi} from '../ui/useEntryMoveUi';
import {linkedFileStatus, locateLinkedFile, openLinkedFile, toLinkedFile} from '../storage/linkedFiles';
import {openOrCreateMeetingNote, openOrCreateTodoNote} from '../storage/meetingNoteContent';
import {useNoteCreateConfirm} from '../ui/useNoteCreateConfirm';
import {applyMeetingEdit, buildMeeting, buildTask} from '../storage/itemMutations';
import {loadProjectFile, saveMeetings, saveTasks} from '../storage/projectFile';
import {loadSettings, saveSettings} from '../storage/settingsStorage';
import {FolderEntry} from '../supernote/fileSystem';
import {log, logError} from '../utils/log';
import {requestEinkRefresh, useEinkRefreshOnLoad} from '../utils/screenRefresh';
import FileBrowserPane, {ARMING_TEXT, FileBrowserRoot, LinkTarget} from '../ui/FileBrowserPane';
import GoogleCalendarPanel from '../ui/GoogleCalendarPanel';
import MeetingRow, {MeetingTrackingConfig} from '../ui/MeetingRow';
import MeetingList, {MeetingListHeaderRow} from '../ui/MeetingList';
import {useEditFlush} from '../ui/useEditFlush';
import MiniTabs, {MiniTabDef} from '../ui/MiniTabs';
import {useFeatures, visibleTabs} from '../ui/featureStore';
import PagedSection from '../ui/PagedSection';
import QuickAddWidget, {MeetingQuickAddFields, QuickFilePayload} from '../ui/QuickAddWidget';
import MarksCard from '../ui/MarksCard';
import {MarkScope} from '../domain/marks';

const ALL_MARKS: MarkScope = {type: 'all'};
import {displayTaskText} from '../domain/taskLabels';
import TaskRow, {taskRowHeight, taskRowLines} from '../ui/TaskRow';
import {useCachedItems} from '../ui/useCachedItems';
import {common} from '../ui/commonStyles';
import LoadErrorNotice from '../ui/LoadErrorNotice';
import {FONT, useThemeColors} from '../ui/theme';
import {useActionError} from '../ui/useActionError';
import {errorMessage} from '../utils/errorMessage';
import {useCachedInbox} from '../ui/useCachedInbox';

// Right column width this whole screen's Tasks/Meetings panes render in
// (this screen's own `leftPane`/`rightPane`, the identical plain `flex:1`
// two-column split screens/ItemDetail.tsx uses) - see screens/
// ProjectDataPanel.tsx's own `COLUMN_WIDTH_PX` comment for the derivation
// and its not-yet-verified-on-device caveat, which applies here too.
const COLUMN_WIDTH_PX = 678;

// Flex weights (docs/dev/technical-design-flex-weight-stacking.md §3.4,
// 2026-09-17) - see screens/ProjectDataPanel.tsx's own TODOS_WEIGHT/
// MEETINGS_WEIGHT comment for the general reasoning; same approach here.
// 8:6 carries forward the same ratio the old `PAGE_SIZE.inboxTasks`/
// `inboxMeetings` pixel-budget constants had (Tilman, 2026-09-17 -
// explicitly requested this exact ratio, not the simplified 4:3).
const TASKS_WEIGHT = 8;
const MEETINGS_WEIGHT = 6;

// Group-header rows within each flattened sequence (this screen's own
// `styles.subheading`) - see screens/ProjectDataPanel.tsx's identical
// `SUBHEADING_ROW_PX` comment (docs/dev/design-device-rendering.md §5.5).
const SUBHEADING_ROW_PX = 30;

interface Props {
  /** Switches to Settings' Calendar sub-tab (docs/dev/technical-design-google-calendar.md §9) - used by the Google mini-tab's empty state when no ICS URL is configured yet. */
  onOpenCalendarSettings?: () => void;
  /** The Files pane's Browse tab (2026-09-09) - plain-browsing a top-level Project/Area entry there jumps the whole app to it (App.tsx's `openItem`), same as opening one from the Projects/Areas tabs or screens/ReviewScreen.tsx's own cards. Optional purely so this screen still type-checks if App.tsx ever forgot to wire it - Browse's navigate behavior is just a no-op without it, not a crash. */
  onOpenItem?: (kind: 'project' | 'area', entry: FolderEntry) => void;
}

const FIXED_INBOX_DESTINATION: Destination = {type: 'inbox'};

type MeetingsMainTab = 'meetings' | 'google';
const MEETINGS_MAIN_TABS: MiniTabDef<MeetingsMainTab>[] = [
  {key: 'meetings', label: 'Meetings'},
  {key: 'google', label: 'Google'},
];

/** The one edit target for this whole screen (technical-design-linked-files.md §8) - see the module doc comment's "Linked file / filing / one arm target" note. */
type EditTarget = {type: 'task' | 'meeting'; index: number};

/** The one arm target for this whole screen - extends EditTarget with which action armed it (docs/dev/technical-design-filing-unification.md §3.2). */
type ArmTarget = {type: 'task' | 'meeting'; index: number; intent: 'link' | 'file'};

const inboxSource = (inboxPath: string): EntrySource => ({kind: 'inbox', path: inboxPath});

export default function InboxScreen({
  onOpenCalendarSettings,
  onOpenItem,
}: Props): React.JSX.Element {
  const {textColor, borderColor, placeholderColor} = useThemeColors();

  // Live view of storage/dataCache.ts (docs/dev/technical-design-cache-
  // subscription-and-shared-add-path.md §A) - fed to ui/GoogleCalendarPanel.tsx
  // below; re-renders with a fresh array after every cache mutation, including
  // the File actions' write-through inside storage/inboxFiling.ts.
  const items = useCachedItems();
  const confirmNoteCreate = useNoteCreateConfirm('InboxScreen.noteCreateConfirm');
  // Moving a todo/meeting with a note: confirm, the note moves along (technical-design-files-0.6.md §3.4).
  const moveUi = useEntryMoveUi('InboxScreen');
  const [inboxPath, setInboxPath] = useState<string | null>(null);
  // storage/linkedFiles.ts's calls and the Files pane's `resources` root all
  // need the full resolved path set, not just `inboxPath` - same "keep both"
  // shape screens/ProjectDataPanel.tsx's `path`/`paths` pair uses.
  const [paths, setPaths] = useState<ResolvedParaPaths | null>(null);
  // The shared Inbox (storage/dataCache.ts, technical-design-files-0.6.md §3.3) - setCachedInbox writes it for every screen.
  const inbox = useCachedInbox();
  const [loading, setLoading] = useState(true);
  // Explicit e-ink refresh once the initial load or a manual refresh
  // actually lands - see src/utils/screenRefresh.ts.
  useEinkRefreshOnLoad(loading);
  const [error, setError] = useState<string | null>(null);
  const [hideDone, setHideDone] = useState(false);
  // Meetings/Google mini-tab (docs/dev/technical-design-google-calendar.md §9) -
  // same pattern as DailyView's calendarMainTab, now inside the Meetings
  // section rather than the old Meetings-pane's own top-level tab row.
  const [mainTabState, setMainTab] = useState<MeetingsMainTab>('meetings');
  // The Google tab only while the experimental Google Calendar integration
  // is on (docs/dev/technical-design-about-debug-experimental.md §3.2).
  const features = useFeatures();
  const mainTabs = visibleTabs(MEETINGS_MAIN_TABS, mainTabState, 'google', features.googleCalendar);
  const mainTab = mainTabs.activeKey;
  const [icsUrl, setIcsUrl] = useState('');
  // Tag Rules for the meeting rows' prep/review checkpoint icon (loaded with the rest of the settings in `load`).
  const [tagRules, setTagRules] = useState<TagRule[]>([]);

  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  const [armTarget, setArmTarget] = useState<ArmTarget | null>(null);
  const editingTaskIndex = editTarget?.type === 'task' ? editTarget.index : null;
  const editingMeetingIndex = editTarget?.type === 'meeting' ? editTarget.index : null;
  const armingTaskIndex = armTarget?.type === 'task' ? armTarget.index : null;
  const armingMeetingIndex = armTarget?.type === 'meeting' ? armTarget.index : null;

  const tasksAction = useActionError('InboxScreen.tasksActionError', 'InboxScreen: task action failed');
  const meetingsAction = useActionError('InboxScreen.meetingsActionError', 'InboxScreen: meeting action failed');
  // QuickAddWidget's own add/edit/delete error surface (docs/technical-
  // design-unified-quickadd.md §6/§10 step 2) - one shared widget now
  // covers both types, so its own failures get one shared error line
  // rather than tasksActionError/meetingsActionError (those stay as they
  // were, for the row-level actions - toggle done, create/open note, file -
  // that are still per-type).
  const widgetAction = useActionError('InboxScreen.widgetError', 'InboxScreen: widget action failed');
  // Set when a row tap was blocked because an edit is already open
  // elsewhere on screen - see startEditTarget's guard below and
  // QuickAddWidget's own `blockedMessage` prop doc comment.
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  const load = useCallback(async (forceRebuild: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const loadedSettings = await loadSettings();
      setHideDone(loadedSettings.hideDoneInboxTasks);
      setIcsUrl(loadedSettings.googleCalendarIcsUrl);
      setTagRules(loadedSettings.tagRules);
      let cache = getCachedData();
      if (!cache || forceRebuild) {
        cache = await rebuildCache(loadedSettings);
      }
      setInboxPath(cache.paths.inboxFolder);
      setPaths(cache.paths);
      setCachedInbox(await loadProjectFile('inbox', cache.paths.inboxFolder));
    } catch (e) {
      const message = errorMessage(e);
      logError('InboxScreen: load failed', message);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  /**
   * Re-fetch-index, apply, write, update local state - the same save-shape
   * every other Inbox mutation in this codebase uses (see the module doc
   * comment). `mutate` is handed the full, current `inbox.tasks` array and
   * returns the next one; every row action below is a thin wrapper around
   * this plus a specific `mutate`.
   */
  const saveInboxTasks = async (mutate: (tasks: Task[]) => Task[]): Promise<void> => {
    if (!inbox || !inboxPath) throw new Error('Inbox not loaded yet - Settings → Advanced → Reload all files.');
    const nextTasks = mutate(inbox.tasks.slice());
    const nextRaw = await saveTasks('inbox', inboxPath, inbox.rawContent, nextTasks, inbox.taskExtraLines);
    setCachedInbox({...inbox, rawContent: nextRaw, tasks: nextTasks});
  };

  /** Meeting counterpart of saveInboxTasks above. */
  const saveInboxMeetings = async (mutate: (meetings: Meeting[]) => Meeting[]): Promise<void> => {
    if (!inbox || !inboxPath) throw new Error('Inbox not loaded yet - Settings → Advanced → Reload all files.');
    const nextMeetings = mutate(inbox.meetings.slice());
    const nextRaw = await saveMeetings('inbox', inboxPath, inbox.rawContent, nextMeetings, inbox.meetingExtraLines);
    setCachedInbox({...inbox, rawContent: nextRaw, meetings: nextMeetings});
  };

  const toggleHideDone = () => {
    const next = !hideDone;
    setHideDone(next);
    loadSettings()
      .then(s => saveSettings({...s, hideDoneInboxTasks: next}))
      .catch(e => logError('InboxScreen: save hideDoneInboxTasks failed', errorMessage(e)));
  };

  // Still used by every other Tasks-row action below (toggle done, create/
  // open note, file, link) - add/edit/delete now go through runWidgetAction
  // instead, see that function's own doc comment.
  const runTaskAction = tasksAction.run;

  const handleToggleTaskDone = (taskIndex: number) => {
    runTaskAction(() =>
      saveInboxTasks(tasks => {
        tasks[taskIndex] = {...tasks[taskIndex], done: !tasks[taskIndex].done};
        return tasks;
      }),
    );
  };

  /** docs/dev/technical-design-unified-quickadd.md §6: one edit at a time - a row tap while an edit is already open is blocked and surfaces QuickAddWidget's blockedMessage instead of silently switching targets. */
  // Save-then-switch (docs/dev/technical-design-meeting-lists.md §10, 2026-09-29) -
  // replaces the old "Finish edit!" block.
  const {flushEditRef, afterSave} = useEditFlush();
  const startEditTarget = (type: 'task' | 'meeting', index: number) =>
    afterSave(() => {
      setBlockedMessage(null);
      setEditTarget({type, index});
      setArmTarget(null);
    });
  /** Also cancels any open arm (2026-09-09 bugfix) - see armLinkTarget/armFileTarget's own note below on why an arm no longer clears editTarget itself. Closing the edit that an arm was started from (Cancel or Delete/Save, both of which route through here or bypass it entirely on their own success path) leaves nothing sensible for that arm to still be pointed at, so it's cancelled too rather than left dangling with a now-closed edit behind it. */
  const cancelEditTarget = () => {
    setEditTarget(null);
    setArmTarget(null);
    setBlockedMessage(null);
  };
  /**
   * Arming a link/refile no longer clears editTarget (2026-09-09 bugfix -
   * Tilman reported the task text and flow-state chip vanishing the instant
   * Refile was tapped). Both are only ever reached from inside
   * QuickAddWidget's edit mode now (the row-level "File" action is gone,
   * and the clip icon is only shown/tappable via a row that's also
   * reachable while editing) - clearing editTarget here used to be a
   * leftover from when arming a row's own File/Link action was independent
   * of any open edit; now it just closes the very edit the Refile/link tap
   * came from, which is what wiped the widget's fields back to its (empty)
   * create-mode draft. Leaving editTarget set is safe: linkTarget's own
   * derivation below already checks armTarget before ever falling through
   * to editTarget's own (unrelated) "locate a linked file" branch.
   */
  const armLinkTarget = (type: 'task' | 'meeting', index: number) => {
    setArmTarget({type, index, intent: 'link'});
  };
  /** docs/dev/technical-design-filing-unification.md §3.2. See armLinkTarget's note just above - same 2026-09-09 fix applies here. */
  const armFileTarget = (type: 'task' | 'meeting', index: number) => {
    setArmTarget({type, index, intent: 'file'});
  };
  const cancelArming = () => setArmTarget(null);

  /**
   * QuickAddWidget's own add/edit/delete error surface (docs/technical-
   * design-unified-quickadd.md §6/§10 step 2) - mirrors runTaskAction/
   * runMeetingAction above exactly (catches and surfaces the error rather
   * than rethrowing), now shared by commitTaskEdit/commitMeetingEdit/
   * handleDeleteEditForWidget below since one widget serves both types.
   */
  /** Resolves true on success, false when it failed (error shown) - Quick Add's save-then-switch needs to know (ui/useEditFlush.ts). */
  const runWidgetSave = widgetAction.runSave;
  const runWidgetAction = widgetAction.run;

  /**
   * QuickAddWidget's `editingTask` mode onSaveEditTask - `nextText` is
   * already fully composed (tags etc.) by the widget's own submit(), so
   * this only needs to write through. `nextLinkedFile` is assigned straight
   * onto the field - it's never embedded in `nextText` (see
   * domain/markdown.ts's extractLinkedFile/appendLinkedFile doc comments).
   * Closes edit mode only on a successful save - runWidgetAction swallows
   * errors internally (so its own promise always resolves), so chaining
   * `.then(() => cancelEditTarget())` after it, the way this used to work,
   * would close edit mode even on a failed save; calling cancelEditTarget()
   * from inside the try instead (same fix screens/ProjectDataPanel.tsx's
   * MeetingsSection.commitEdit got in the same pass) avoids that.
   */
  const commitTaskEdit = (nextText: string, nextLinkedFile: string): Promise<boolean> => {
    if (editTarget?.type !== 'task') return Promise.resolve(false);
    const taskIndex = editTarget.index;
    const text = nextText.trim();
    if (!text) return Promise.resolve(false);
    return runWidgetSave(async () => {
      await saveInboxTasks(tasks => {
        tasks[taskIndex] = {...tasks[taskIndex], text, ...deriveTaskFields(text), linkedFile: nextLinkedFile};
        return tasks;
      });
      cancelEditTarget();
    });
  };

  /**
   * Shared Note Pages (docs/dev/technical-design-shared-note-pages.md §6/§9,
   * Slice 3, 2026-09-22): replaces the old separate handleCreateTaskNote/
   * handleOpenTaskNote pair with one call into `openOrCreateTodoNote`.
   * `options.forceOwnTarget: true` - Inbox items have no Project/Area to
   * anchor a shared file to (§9), so this always keeps today's own-note
   * behavior even if the matched Tag Rule is configured as a shared target
   * (that target simply never applies here).
   */
  const handleTaskNote = (taskIndex: number) => {
    Keyboard.dismiss();
    runTaskAction(async () => {
      if (!inbox || !inboxPath) throw new Error('Inbox not loaded yet - Settings → Advanced → Reload all files.');
      const settings = await loadSettings();
      const {task, changed} = await openOrCreateTodoNote(inbox.tasks[taskIndex], inboxPath, settings, {tasks: inbox.tasks}, {
        forceOwnTarget: true,
        confirmCreate: confirmNoteCreate,
      });
      if (changed) {
        await saveInboxTasks(tasks => {
          tasks[taskIndex] = task;
          return tasks;
        });
      }
    });
  };

  const handleFileTask = (taskIndex: number, target: InboxFilingTarget) => {
    runTaskAction(async () => {
      const task = inbox?.tasks[taskIndex];
      if (!task || !inboxPath) throw new Error('That inbox item changed on disk - Settings → Advanced → Reload all files.');
      await moveTask(inboxSource(inboxPath), taskIndex, task, itemTarget(target), moveUi);
    });
  };

  const handleAddTask = async (text: string, destination: Destination): Promise<void> => {
    const newTask: Task = buildTask(text);
    if (destination.type === 'inbox') {
      await saveInboxTasks(tasks => [...tasks, newTask]);
      log('InboxScreen: added task');
    } else {
      // Abbreviation quick-file recognized a #tag while composing on the
      // Inbox tab (feature_abbrev_quick_file, 2026-09-17) - create it
      // straight in the named Project/Area instead of Inbox.
      await addTaskToDestination(newTask, destination, {inbox: null, inboxPath: null});
      log('InboxScreen: added task directly to', destination.path);
    }
  };

  // Still used by every other Meetings-row action below (create/open note,
  // file, link) - add/edit/delete now go through runWidgetAction instead,
  // same split runTaskAction above notes.
  const runMeetingAction = meetingsAction.run;

  /**
   * QuickAddWidget's `editingMeeting` mode onSaveEditMeeting - `fields` has
   * already been validated/normalized by the widget's own submit(), so this
   * only needs to write through. See commitTaskEdit above for
   * `nextLinkedFile` and the "close only on success" note - identical
   * reasoning here.
   */
  const commitMeetingEdit = (fields: MeetingQuickAddFields, nextLinkedFile: string): Promise<boolean> => {
    if (editTarget?.type !== 'meeting') return Promise.resolve(false);
    const meetingIndex = editTarget.index;
    Keyboard.dismiss();
    return runWidgetSave(async () => {
      await saveInboxMeetings(meetings => {
        meetings[meetingIndex] = applyMeetingEdit(meetings[meetingIndex], fields, nextLinkedFile);
        return meetings;
      });
      cancelEditTarget();
    });
  };

  /** The soft-delete both row types' old ✕ used to trigger, now sourced from QuickAddWidget's single "Delete" button in edit mode instead - see the now-removed handleDeleteTaskEdit/handleDeleteMeetingEdit for the pre-unification, per-type version of this. */
  const handleDeleteEditForWidget = () => {
    if (!editTarget) return;
    Keyboard.dismiss();
    const target = editTarget;
    runWidgetAction(async () => {
      if (target.type === 'task') {
        await saveInboxTasks(tasks => {
          tasks[target.index] = {...tasks[target.index], cancelled: true};
          return tasks;
        });
      } else {
        await saveInboxMeetings(meetings => {
          meetings[target.index] = {...meetings[target.index], cancelled: true};
          return meetings;
        });
      }
      cancelEditTarget();
    });
  };

  /**
   * QuickAddWidget's onQuickFile in edit mode: "save, but file elsewhere".
   * `payload` is the widget's current edit-session text/fields with the
   * abbreviation tag stripped, so other edits made in this session move
   * along. Throws instead of using runWidgetAction, so the widget can show
   * the failure inline; closes edit mode only after the move succeeded.
   */
  const handleQuickFileEdit = async (target: AbbrevFileMatch, payload: QuickFilePayload): Promise<void> => {
    if (!editTarget) return;
    if (!inbox || !inboxPath) throw new Error('Inbox not loaded yet - Settings → Advanced → Reload all files.');
    const index = editTarget.index;
    if (editTarget.type === 'task' && payload.kind === 'task') {
      const stored = inbox.tasks[index];
      if (!stored) throw new Error('That inbox item changed on disk - Settings → Advanced → Reload all files.');
      const updated: Task = {...stored, text: payload.text, ...deriveTaskFields(payload.text), linkedFile: payload.linkedFile};
      const moved = await moveTask(inboxSource(inboxPath), index, updated, itemTarget(target), moveUi);
      if (!moved) return; // cancelled in the note confirm - stay in edit mode
    } else if (editTarget.type === 'meeting' && payload.kind === 'meeting') {
      const stored = inbox.meetings[index];
      if (!stored) throw new Error('That inbox item changed on disk - Settings → Advanced → Reload all files.');
      const updated: Meeting = applyMeetingEdit(stored, payload.fields, payload.linkedFile);
      const moved = await moveMeeting(inboxSource(inboxPath), index, updated, itemTarget(target), moveUi);
      if (!moved) return; // cancelled in the note confirm - stay in edit mode
    } else {
      return; // mismatched kinds shouldn't happen - editTarget.type gates which tab the widget shows
    }
    log('InboxScreen: quick-filed', editTarget.type, index, '->', target.path);
    cancelEditTarget();
  };

  /** Meeting counterpart of handleTaskNote above - see its doc comment, including `forceOwnTarget: true`. */
  const handleMeetingNote = (meetingIndex: number) => {
    Keyboard.dismiss();
    runMeetingAction(async () => {
      if (!inbox || !inboxPath) throw new Error('Inbox not loaded yet - Settings → Advanced → Reload all files.');
      const settings = await loadSettings();
      const {meeting, changed} = await openOrCreateMeetingNote(
        inbox.meetings[meetingIndex],
        inboxPath,
        settings,
        {tasks: inbox.tasks},
        {forceOwnTarget: true, confirmCreate: confirmNoteCreate},
      );
      if (changed) {
        await saveInboxMeetings(meetings => {
          meetings[meetingIndex] = meeting;
          return meetings;
        });
      }
    });
  };

  /** The row's prep/review checkpoint icon (docs/dev/technical-design-meeting-tracking.md) - flips the tag on the current copy via saveInboxMeetings, then an explicit e-ink flush for the direct tap. */
  const handleToggleMeetingTracking = (meetingIndex: number, kind: MeetingTrackingKind) => {
    runMeetingAction(async () => {
      await saveInboxMeetings(meetings => toggleMeetingTrackingAt(meetings, meetingIndex, kind));
      requestEinkRefresh();
    });
  };
  const trackingFor = (meetingIndex: number): MeetingTrackingConfig => ({
    rules: tagRules,
    onToggle: kind => handleToggleMeetingTracking(meetingIndex, kind),
  });

  const handleFileMeeting = (meetingIndex: number, target: InboxFilingTarget) => {
    runMeetingAction(async () => {
      const meeting = inbox?.meetings[meetingIndex];
      if (!meeting || !inboxPath) throw new Error('That inbox item changed on disk - Settings → Advanced → Reload all files.');
      await moveMeeting(inboxSource(inboxPath), meetingIndex, meeting, itemTarget(target), moveUi);
    });
  };

  const handleAddMeeting = async (fields: MeetingQuickAddFields, destination: Destination): Promise<void> => {
    const newMeeting: Meeting = buildMeeting(fields);
    if (destination.type === 'inbox') {
      await saveInboxMeetings(meetings => [...meetings, newMeeting]);
      log('InboxScreen: added meeting');
    } else {
      // Abbreviation quick-file recognized a #tag while composing on the
      // Inbox tab (feature_abbrev_quick_file, 2026-09-17) - create it
      // straight in the named Project/Area instead of Inbox.
      await addMeetingToDestination(newMeeting, destination, {inbox: null, inboxPath: null});
      log('InboxScreen: added meeting directly to', destination.path);
    }
  };

  // Grouped by flow-state, same convention (and same index-safety fix) as
  // ProjectDataPanel.tsx's own TodosSection - see the module doc comment.
  const tasks = inbox?.tasks ?? [];
  const groupsByFlowState = groupTasksByFlowState(tasks);
  const taskGroups = hideDone
    ? groupsByFlowState
        .map(group => ({...group, entries: group.entries.filter(({task}) => !task.done)}))
        .filter(group => group.entries.length > 0)
    : groupsByFlowState;
  const doneCount = tasks.filter(t => !t.cancelled && t.done).length;

  // Upcoming/Past, same split ProjectDataPanel.tsx's own MeetingsSection
  // uses - `index` captured during the initial map, before the cancelled
  // filter, so it stays a valid position into the full `meetings` array
  // (same index-safety reasoning as the tasks grouping above).
  const meetings = inbox?.meetings ?? [];
  const visibleMeetings = meetings
    .map((meeting, index) => ({meeting, index}))
    .filter(({meeting}) => !meeting.cancelled);
  const {upcoming, past} = splitAndSortMeetings(visibleMeetings);

  // technical-design-linked-files.md §8: the one item currently being
  // edited (task or meeting), derived from editTarget - see the module doc
  // comment's "Linked file / one edit target" note.
  const editingItem: Task | Meeting | null =
    editTarget?.type === 'task'
      ? tasks[editTarget.index] ?? null
      : editTarget?.type === 'meeting'
      ? meetings[editTarget.index] ?? null
      : null;

  // Whether the editing item's own linkedFile (if any) still resolves to a
  // real file - see ProjectDataPanel.tsx's identical linkedFileMissing note.
  const [linkedFileMissing, setLinkedFileMissing] = useState(false);
  useEffect(() => {
    if (!editingItem?.linkedFile || !paths) {
      setLinkedFileMissing(false);
      return;
    }
    let cancelled = false;
    linkedFileStatus(paths, editingItem.linkedFile).then(status => {
      if (!cancelled) setLinkedFileMissing(status === 'missing');
    });
    return () => {
      cancelled = true;
    };
  }, [editingItem?.linkedFile, paths]);

  /**
   * `arming` mode's onPick for intent 'link' - branches on which root was
   * tapped, same shape as ProjectDataPanel.tsx's own `rootPathFor`. 'browse'
   * (2026-09-09, replacing the old separate 'projects'/'areas' roots) is the
   * two-level Projects/Areas browser - however far it's drilled, relativePath
   * is relative to `paths.base` (the `sources` root's nominal rootPath -
   * ui/FileBrowserPane.tsx's `sources` doc comment), same as browsing any
   * other root.
   */
  const rootPathFor = (root: string): string | null =>
    root === 'resources' ? paths?.resources ?? null : root === 'browse' ? paths?.base ?? null : null;

  const handlePickLinkedFile = useCallback(
    (root: string, relativePath: string) => {
      const rootPath = rootPathFor(root);
      if (!paths || !armTarget || !rootPath) return;
      const absolutePath = `${rootPath.replace(/\/+$/, '')}/${relativePath}`;
      const linkedFile = toLinkedFile(paths, absolutePath);
      if (armTarget.type === 'task') {
        runTaskAction(() =>
          saveInboxTasks(tasksNext => {
            tasksNext[armTarget.index] = {...tasksNext[armTarget.index], linkedFile};
            return tasksNext;
          }),
        );
      } else {
        runMeetingAction(() =>
          saveInboxMeetings(meetingsNext => {
            meetingsNext[armTarget.index] = {...meetingsNext[armTarget.index], linkedFile};
            return meetingsNext;
          }),
        );
      }
      setArmTarget(null);
    },
    // inbox/inboxPath are read indirectly through saveInboxTasks/
    // saveInboxMeetings (plain, unmemoized closures recreated every render)
    // - listed explicitly here so this callback is rebuilt whenever they
    // change too, rather than relying on armTarget always changing first
    // (same defensive shape screens/ProjectDataPanel.tsx's own
    // handlePickLinkedFile takes by listing `state` in its own deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paths, armTarget, inbox, inboxPath],
  );

  /**
   * `arming` mode's onPick for intent 'file' (docs/dev/technical-design-filing-
   * unification.md §3.4) - resolveFilingPick only ever sees 'projects'/
   * 'areas', synthesized by ui/FileBrowserPane.tsx from a Browse pick one
   * level below its depth-0 "Projects"/"Areas" chooser (2026-09-09) since
   * Resources is disabled, not removed, while file-arming (see
   * `fileBrowserRoots` below).
   */
  const handlePickFile = useCallback(
    (root: string, relativePath: string) => {
      if (!paths || !armTarget || armTarget.intent !== 'file') return;
      const target = resolveFilingPick(paths, root, relativePath);
      if (!target) return;
      if (armTarget.type === 'task') handleFileTask(armTarget.index, target);
      else handleFileMeeting(armTarget.index, target);
      setArmTarget(null);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [paths, armTarget, inbox, inboxPath],
  );

  const onOpenLinkedFile = useCallback(
    (linkedFile: string) => {
      if (!paths) return;
      openLinkedFile(paths, linkedFile).catch(e =>
        logError('InboxScreen: open linked file failed', errorMessage(e)),
      );
    },
    [paths],
  );

  // See the module doc comment's "Linked file / filing / one arm target"
  // note on why `paths.resources` doubles as the "item root" argument here.
  // `root: 'browse'` (2026-09-09, was 'projects') - refile-arming now always
  // auto-switches to the merged Browse tab, not a standalone Projects root.
  const linkTarget: LinkTarget | null = armTarget
    ? armTarget.intent === 'file'
      ? {mode: 'arming', onPick: handlePickFile, onCancel: cancelArming, pickKind: 'folder', label: ARMING_TEXT.refile(armTarget.type), root: 'browse'}
      : {mode: 'arming', onPick: handlePickLinkedFile, onCancel: cancelArming, label: ARMING_TEXT.link(armTarget.type)}
    : editTarget && paths && editingItem?.linkedFile
    ? (() => {
        const location = locateLinkedFile(paths, paths.resources, editingItem.linkedFile);
        if (!location) return null;
        return {
          mode: 'locating' as const,
          root: 'resources',
          folderPath: location.folderPath,
          fileName: location.fileName,
          fileMissing: linkedFileMissing,
        };
      })()
    : null;

  // Active-only, same entryFilter area-assignment uses
  // (technical-design-project-area-assignment.md §4.2) - reused verbatim for
  // filing (docs/dev/technical-design-filing-unification.md §3.1) and now for
  // Browse's own per-category listings (always active-only, per Tilman's
  // "only the top-level Projects/Areas management tabs show everything"
  // call - Browse isn't one of those).
  const activeOnly = (entry: FolderEntry) => findCachedItem(entry.path)?.status === 'active';
  // Resources is never a valid refile destination - Browse (2026-09-09,
  // replacing separate Projects/Areas tabs) is the one root that's always
  // present but ONLY enabled for picking while refile-arming (see
  // ui/FileBrowserPane.tsx's `disabled` doc comment): the tab set itself
  // never changes shape, only which tabs you can switch to.
  const isFileArming = armTarget?.intent === 'file';
  const fileBrowserRoots: FileBrowserRoot[] = paths
    ? [
        {key: 'resources', label: 'Resources', rootPath: paths.resources, disabled: isFileArming},
        {
          key: 'browse',
          label: 'Browse',
          rootPath: paths.base,
          sources: [
            {kind: 'project', path: paths.projects, label: 'Projects'},
            {kind: 'area', path: paths.areas, label: 'Areas'},
          ],
          entryFilter: activeOnly,
          onNavigateToItem: (kind, name, path) => onOpenItem?.(kind, {name, path, isFolder: true}),
        },
      ]
    : [];

  // Flattened into one paginated sequence per section (docs/technical-
  // design-pagination-edit-reuse.md §2/§4) - group headers count as content
  // rows, same rule DailyView/ProjectDataPanel follow.
  type TaskFlatRow = {kind: 'header'; rowKey: string; label: string} | {kind: 'entry'; rowKey: string; task: Task; index: number};
  const taskFlatRows: TaskFlatRow[] = taskGroups.flatMap(group => [
    {kind: 'header', rowKey: `header-${group.key}`, label: group.label} as TaskFlatRow,
    ...group.entries.map(({task, index}): TaskFlatRow => ({kind: 'entry', rowKey: `task-${index}`, task, index})),
  ]);
  const editingTask = editingTaskIndex !== null ? tasks[editingTaskIndex] ?? null : null;

  // Upcoming/Past as MeetingList group headers (docs/dev/technical-design-
  // meeting-lists.md §4.4) - the headers only appear when both groups exist.
  type MeetingEntryRow = {rowKey: string; meeting: Meeting; index: number};
  const meetingRows: Array<MeetingEntryRow | MeetingListHeaderRow> = [
    ...(upcoming.length > 0 && past.length > 0
      ? [{kind: 'header', key: 'header-upcoming', label: 'Upcoming'} as MeetingListHeaderRow]
      : []),
    ...upcoming.map(({meeting, index}): MeetingEntryRow => ({rowKey: `meeting-${index}`, meeting, index})),
    ...(past.length > 0 ? [{kind: 'header', key: 'header-past', label: 'Past'} as MeetingListHeaderRow] : []),
    ...past.map(({meeting, index}): MeetingEntryRow => ({rowKey: `meeting-${index}`, meeting, index})),
  ];
  const editingMeeting = editingMeetingIndex !== null ? meetings[editingMeetingIndex] ?? null : null;

  return (
    <View style={common.container}>
      <View style={styles.headerRow}>
        <Text style={[styles.heading, {color: textColor}]}>Inbox</Text>
      </View>

      {loading && <ActivityIndicator style={common.spacer} />}

      {!loading && error && (
        <LoadErrorNotice error={error} onRetry={() => load(true)} textColor={textColor} />
      )}

      {!loading && !error && (
        <View style={styles.body}>
          <View style={[styles.leftPane, {borderColor}]}>
            <Text style={[styles.paneTitle, {color: textColor}]}>Files</Text>
            <FileBrowserPane
              roots={fileBrowserRoots}
              linkTarget={linkTarget}
              textColor={textColor}
              borderColor={borderColor}
            />
          </View>

          <View style={styles.rightPane}>
            {/* Lives above both stacked sections, not nested under either
                (docs/dev/technical-design-unified-quickadd.md §3/§8) - it isn't
                Tasks- or Meetings-exclusive, so it doesn't belong under
                either section's own heading. */}
            <QuickAddWidget
              fixedDestination={FIXED_INBOX_DESTINATION}
              onAddTask={handleAddTask}
              onAddMeeting={handleAddMeeting}
              editingTask={editingTask ? {...editingTask, text: displayTaskText(editingTask, 'grouped')} : undefined}
              editingMeeting={editingMeeting ?? undefined}
              onSaveEditTask={commitTaskEdit}
              onSaveEditMeeting={commitMeetingEdit}
              editTargetKey={editTarget ? `${editTarget.type}:${editTarget.index}` : null}
              flushEditRef={flushEditRef}
              onCancelEdit={cancelEditTarget}
              onDeleteEdit={handleDeleteEditForWidget}
              onRefile={editTarget ? () => armFileTarget(editTarget.type, editTarget.index) : undefined}
              onQuickFile={editTarget ? handleQuickFileEdit : undefined}
              linkedFileMissing={linkedFileMissing}
              blockedMessage={blockedMessage ?? undefined}
              textColor={textColor}
              borderColor={borderColor}
              placeholderColor={placeholderColor}
            />
            {/* Open marks of every project, area and the Inbox (lasso 0.8 §3.10). */}
            <MarksCard scope={ALL_MARKS} returnTo="inbox" textColor={textColor} borderColor={borderColor} />
            <View style={[common.divider, {backgroundColor: borderColor}]} />
            {/* Flex-weight stacking (2026-09-17, docs/dev/technical-design-
                flex-weight-stacking.md §3.4) - stackedColumn (flex:1)
                splits its real available height 8:6 between the Tasks/
                Meetings stackedSections below via plain sibling `flex`
                weights. */}
            <View style={styles.stackedColumn}>
            <View style={{flex: TASKS_WEIGHT}}>
            <View style={styles.stackedSection}>
              {doneCount > 0 && (
                <Pressable onPress={toggleHideDone} hitSlop={8} style={styles.hideDoneRow}>
                  <Text style={[styles.hideDoneText, {color: textColor}]}>
                    {hideDone ? `Show ${doneCount} done task${doneCount === 1 ? '' : 's'}` : 'Hide done tasks'}
                  </Text>
                </Pressable>
              )}

              {/* "Tasks" heading + PageControls merged into one PagedSection
                  (docs/dev/technical-design-pagination-fixed-height.md §3.4,
                  same mechanical swap as screens/ProjectDataPanel.tsx's
                  TodosSection) - the old separate `{taskGroups.length === 0
                  && <Text>Inbox is at zero. 🎉</Text>}` folds into
                  `emptyHint`. */}
              <PagedSection
                header="Tasks"
                rows={taskFlatRows}
                rowHeight={row => (row.kind === 'header' ? SUBHEADING_ROW_PX : taskRowHeight(row.task, COLUMN_WIDTH_PX, 'grouped'))}
                isCountableRow={row => row.kind === 'entry'}
                renderRow={row =>
                  row.kind === 'header' ? (
                    <Text key={row.rowKey} style={[styles.subheading, {color: textColor}]}>
                      {row.label}
                    </Text>
                  ) : (
                    <TaskRow
                      key={row.rowKey}
                      task={row.task}
                      isEditing={editingTaskIndex === row.index}
                      isArming={armingTaskIndex === row.index}
                      onStartEdit={() => startEditTarget('task', row.index)}
                      onToggleDone={() => handleToggleTaskDone(row.index)}
                      onCreateNote={() => handleTaskNote(row.index)}
                      onOpenNote={() => handleTaskNote(row.index)}
                      linkedFile={row.task.linkedFile}
                      onOpenLinkedFile={onOpenLinkedFile}
                      onArmLink={() => armLinkTarget('task', row.index)}
                      context="grouped"
                      height={taskRowHeight(row.task, COLUMN_WIDTH_PX, 'grouped')}
                      numberOfLines={taskRowLines(row.task, COLUMN_WIDTH_PX, 'grouped')}
                      textColor={textColor}
                      borderColor={borderColor}
                    />
                  )
                }
                emptyHint="Inbox is at zero. 🎉"
                textColor={textColor}
                borderColor={borderColor}
              />

            </View>
            </View>

            <View style={[common.divider, {backgroundColor: borderColor}]} />

            <View style={{flex: MEETINGS_WEIGHT}}>
            <View style={styles.stackedSection}>
              {/* Standalone "Meetings" label removed (2026-09-15, Tilman:
                  "please remove it here as well," confirming the same call
                  already made for screens/WeekView.tsx's Meetings column) -
                  PagedSection's own `header="Meetings"` below already says
                  it, on the list itself, same redundancy WeekView's had. */}
              <MiniTabs
                tabs={mainTabs.tabs}
                activeKey={mainTab}
                onChange={setMainTab}
                textColor={textColor}
                borderColor={borderColor}
              />
              {mainTab === 'meetings' ? (
                <>
                  {/* "Meetings" heading is PagedSection's own header text
                      now - the standalone label above (this pane's own
                      `paneTitle`) was confirmed redundant and removed
                      (2026-09-15, see this pane's own render above), same
                      call already made for screens/WeekView.tsx's Meetings
                      column and screens/ProjectDataPanel.tsx's identical
                      MeetingsSection. The old separate `{upcoming.length ===
                      0 && past.length === 0 && <Text>No meetings
                      yet.</Text>}` folds into `emptyHint`. */}
                  <MeetingList
                    listId="inbox"
                    defaultLayout="oneLine"
                    header="Meetings"
                    rows={meetingRows}
                    renderRow={(row, layout) => (
                      <MeetingRow
                        key={row.rowKey}
                        meeting={row.meeting}
                        layout={layout}
                        time="dateTime"
                        highlight="mark"
                        tracking={trackingFor(row.index)}
                        note={{onOpen: () => handleMeetingNote(row.index), onCreate: () => handleMeetingNote(row.index)}}
                        file={{linkedFile: row.meeting.linkedFile, onOpen: onOpenLinkedFile, onArm: () => armLinkTarget('meeting', row.index)}}
                        onPress={() => startEditTarget('meeting', row.index)}
                        state={
                          editingMeetingIndex === row.index ? 'editing' : armingMeetingIndex === row.index ? 'arming' : undefined
                        }
                        textColor={textColor}
                        borderColor={borderColor}
                      />
                    )}
                    emptyHint="No meetings yet."
                    textColor={textColor}
                    borderColor={borderColor}
                  />

                </>
              ) : (
                // GoogleCalendarPanel paginates its own event list internally.
                <GoogleCalendarPanel
                  maxDays={30}
                  defaultDestination={FIXED_INBOX_DESTINATION}
                  items={items}
                  icsUrl={icsUrl}
                  inboxPath={inboxPath ?? ''}
                  onOpenSettings={() => onOpenCalendarSettings?.()}
                  textColor={textColor}
                  borderColor={borderColor}
                  placeholderColor={placeholderColor}
                />
              )}
            </View>
            </View>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  heading: {
    fontSize: FONT.large,
    fontWeight: '700',
    flex: 1,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  leftPane: {
    flex: 1,
    borderRightWidth: 1,
    paddingRight: 16,
    marginRight: 16,
  },
  rightPane: {
    flex: 1,
  },
  // Bounded flex:1 column (docs/dev/technical-design-flex-weight-stacking.md
  // §3.4, 2026-09-17) - splits its real available height 8:6 between the
  // Tasks/Meetings stackedSections via the weighted `<View style={{flex:
  // TASKS_WEIGHT}}>`/`{flex: MEETINGS_WEIGHT}}` boxes wrapping them in this
  // screen's render, above. Supersedes the old "no flex-splitting, each
  // section sized by its own fixed row count" approach this file's
  // stackedSection style used to describe.
  stackedColumn: {
    flex: 1,
  },
  // Tasks-above-Meetings (technical-design-linked-files.md §1/§10.5) -
  // flex:1 (2026-09-17, same doc as stackedColumn above): each section is
  // now the sole occupant of its own weighted box, so its own PagedSection
  // (and, for the Meetings section, its Google mini-tab) can self-measure
  // into whatever real height that box resolves to instead of a fixed
  // pixel viewport.
  stackedSection: {
    flex: 1,
  },
  paneTitle: {
    fontSize: FONT.medium,
    fontWeight: '600',
    marginBottom: 10,
  },
  subheading: {
    fontSize: FONT.small,
    fontWeight: '600',
    opacity: 0.6,
    marginTop: 10,
    marginBottom: 4,
  },
  hideDoneRow: {
    marginBottom: 6,
  },
  hideDoneText: {
    fontSize: FONT.small,
    opacity: 0.6,
    textDecorationLine: 'underline',
  },
});
