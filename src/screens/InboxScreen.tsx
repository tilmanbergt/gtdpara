/**
 * Inbox tab (docs/dev/technical-design-inbox-tab.md §2) - the fallback
 * destination for every task/meeting captured with no Project/Area.
 *
 * Layout (technical-design-linked-files.md §1/§8/§10.5;
 * docs/dev/technical-design-filing-unification.md §3): the same two-pane shape
 * as screens/ItemDetail.tsx. The left pane is ui/FileBrowserPane.tsx with two
 * roots, `resources` and `browse` (a two-level, always-Active-only
 * Projects/Areas browser; see ui/FileBrowserPane.tsx's `sources` doc comment).
 * The right pane stacks Tasks above Meetings, which leaves room for the Files
 * pane on the left.
 *
 * Reads Inbox.txt directly via storage/projectFile.ts's loadProjectFile, like
 * screens/DailyView.tsx and screens/ReviewScreen.tsx, since it is a single
 * flat file outside storage/dataCache.ts's per-item scan. `items` (the cache)
 * is loaded alongside it to keep the Browse root's Active-only `entryFilter`
 * fresh after a File action - this screen never reads/writes any cached
 * item's own tasks/meetings. `paths` (domain/settings.ts's ResolvedParaPaths)
 * feeds the Files pane's roots and every storage/linkedFiles.ts call below.
 *
 * Every row is the shared ui/TaskRow.tsx/ui/MeetingRow.tsx
 * (docs/dev/technical-design-inbox-tab.md §1), so this screen adds no row
 * markup of its own, just its handlers. Unlike Daily's Inbox-sourced rows,
 * every row here gets `onArmLink`. Filing (moving a row into a Project/Area)
 * has no row-level affordance: open the row for editing, then tap Refile in
 * QuickAddWidget's edit mode (storage/inboxFiling.ts's module doc comment).
 *
 * Scope is everything, unfiltered (docs/dev/technical-design-inbox-tab.md §2,
 * requirement 4): every open task regardless of flow-state or due date.
 * Tasks are grouped by flow-state (domain/flowState.ts's
 * groupTasksByFlowState) with a "Hide done tasks" toggle
 * (GtdParaSettings.hideDoneInboxTasks), the same convention as
 * ProjectDataPanel.tsx's TodosSection. hideDone is applied *after* grouping
 * (filtering each already-indexed group's entries): pre-filtering `tasks`
 * would renumber entries relative to a shorter array and break every row
 * action's `tasks.slice(); next[index] = ...` addressing. Meetings show every
 * not-cancelled meeting, split Upcoming/Past (domain/meetingTime.ts's
 * splitAndSortMeetings).
 *
 * Mutations: saveInboxTasks/saveInboxMeetings below are this screen's own
 * "re-fetch-index, apply, write, update local state" pair, the same
 * save-shape DailyView and ReviewScreen use against `inbox` state, without
 * their "which surface does this row belong to" branching. Filing and
 * quick-file go through storage/entryMove.ts's moveTask/moveMeeting.
 *
 * Linked file / filing / one arm target (technical-design-linked-files.md
 * §8; docs/dev/technical-design-filing-unification.md §3): one `armTarget`
 * with an `intent` ('link' | 'file') drives either action. This screen owns
 * both sections, so `editTarget`/`armTarget` (only one of each across the
 * whole screen) are plain state here instead of being reported up the way
 * ProjectDataPanel.tsx reports to screens/ItemDetail.tsx. The derived
 * `linkTarget` feeds this screen's FileBrowserPane. `handlePickLinkedFile`
 * (intent 'link') resolves against whichever root was tapped, `resources` or
 * `browse` (see §3.1's flagged linking side effect); `handlePickFile`
 * (intent 'file') resolves via storage/inboxFiling.ts's resolveFilingPick
 * and only ever sees 'projects'/'areas', which ui/FileBrowserPane.tsx
 * synthesizes from a Browse pick one level below its depth-0
 * "Projects"/"Areas" chooser. Resources is disabled (not removed, so the tab
 * set keeps its shape) while file-arming. Locating an existing link reuses
 * storage/linkedFiles.ts's locateLinkedFile with `paths.resources` as the
 * "item root" argument: Inbox has no item root, so the function's two checks
 * become identical - the link either resolves under Resources or not at all,
 * and the returned folderPath/fileName are relative to `paths.resources`.
 *
 * Google Calendar tab (docs/dev/technical-design-google-calendar.md §9):
 * inside the Meetings section as a <MiniTabs> (ui/MiniTabs.tsx), "Google"
 * being the shared ui/GoogleCalendarPanel.tsx at `maxDays={30}`,
 * self-measuring its height.
 *
 * Pagination + edit reuse (docs/dev/technical-design-pagination-edit-reuse.md
 * §2/§4/§5): both sections page (ui/PagedSection.tsx/ui/pagination.ts's
 * `usePagedByHeight`, docs/technical-design-pagination-fixed-height.md §3.4)
 * instead of scrolling, flattening their grouping (flow-state for Tasks,
 * Upcoming/Past for Meetings) into one paginated sequence with group headers
 * as in-sequence rows - same pattern as DailyView/ProjectDataPanel.
 *
 * Flex-weight stacking (docs/dev/technical-design-flex-weight-stacking.md
 * §3.4): `rightPane`'s Tasks/Meetings stack is an 8:6 `flex`-weighted split
 * of `styles.stackedColumn`, each section self-measuring into its weighted
 * box. Editing switches the shared ui/QuickAddWidget.tsx
 * (docs/dev/technical-design-unified-quickadd.md; one widget above both
 * sections) into its `editingTask`/`editingMeeting` mode instead of an
 * inline row form.
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
import {useEditTarget} from '../ui/useEditTarget';
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

// Flex weights (docs/dev/technical-design-flex-weight-stacking.md §3.4) - see
// screens/ProjectDataPanel.tsx's TODOS_WEIGHT/MEETINGS_WEIGHT comment for the
// reasoning. 8:6 is the requested ratio here, not the simplified 4:3.
const TASKS_WEIGHT = 8;
const MEETINGS_WEIGHT = 6;

// Group-header rows within each flattened sequence (this screen's own
// `styles.subheading`) - see screens/ProjectDataPanel.tsx's identical
// `SUBHEADING_ROW_PX` comment (docs/dev/design-device-rendering.md §5.5).
const SUBHEADING_ROW_PX = 30;

interface Props {
  /** Switches to Settings' Calendar sub-tab (docs/dev/technical-design-google-calendar.md §9) - used by the Google mini-tab's empty state when no ICS URL is configured yet. */
  onOpenCalendarSettings?: () => void;
  /** The Files pane's Browse tab - plain-browsing a top-level Project/Area entry there jumps the whole app to it (App.tsx's `openItem`), same as opening one from the Projects/Areas tabs or screens/ReviewScreen.tsx's cards. Optional so this screen still type-checks without it; Browse's navigate behavior is then a no-op, not a crash. */
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
  // same pattern as DailyView's calendarMainTab, inside the Meetings section.
  const [mainTabState, setMainTab] = useState<MeetingsMainTab>('meetings');
  // The Google tab only while the experimental Google Calendar integration
  // is on (docs/dev/technical-design-about-debug-experimental.md §3.2).
  const features = useFeatures();
  const mainTabs = visibleTabs(MEETINGS_MAIN_TABS, mainTabState, 'google', features.googleCalendar);
  const mainTab = mainTabs.activeKey;
  const [icsUrl, setIcsUrl] = useState('');
  // Tag Rules for the meeting rows' prep/review checkpoint icon (loaded with the rest of the settings in `load`).
  const [tagRules, setTagRules] = useState<TagRule[]>([]);

  const {
    target: editTarget,
    arm: armTarget,
    start: startEdit,
    cancel: cancelEditTarget,
    armFor,
    cancelArm: cancelArming,
    flushEditRef,
  } = useEditTarget<EditTarget, ArmTarget>();
  const editingTaskIndex = editTarget?.type === 'task' ? editTarget.index : null;
  const editingMeetingIndex = editTarget?.type === 'meeting' ? editTarget.index : null;
  const armingTaskIndex = armTarget?.type === 'task' ? armTarget.index : null;
  const armingMeetingIndex = armTarget?.type === 'meeting' ? armTarget.index : null;

  const tasksAction = useActionError('InboxScreen.tasksActionError', 'InboxScreen: task action failed');
  const meetingsAction = useActionError('InboxScreen.meetingsActionError', 'InboxScreen: meeting action failed');
  // QuickAddWidget's add/edit/delete error surface (docs/technical-
  // design-unified-quickadd.md §6/§10 step 2) - one widget covers both types,
  // so its failures get one shared error line. tasksActionError/
  // meetingsActionError cover the per-type row-level actions (toggle done,
  // create/open note, file).
  const widgetAction = useActionError('InboxScreen.widgetError', 'InboxScreen: widget action failed');

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

  // Used by every other Tasks-row action below (toggle done, create/open
  // note, file, link); add/edit/delete go through runWidgetAction instead.
  const runTaskAction = tasksAction.run;

  const handleToggleTaskDone = (taskIndex: number) => {
    runTaskAction(() =>
      saveInboxTasks(tasks => {
        tasks[taskIndex] = {...tasks[taskIndex], done: !tasks[taskIndex].done};
        return tasks;
      }),
    );
  };

  // One edit at a time (ui/useEditTarget.ts): starting another saves this one first.
  const startEditTarget = (type: 'task' | 'meeting', index: number) => startEdit({type, index});
  // Arming is reached from inside edit mode; the edit stays open meanwhile.
  const armLinkTarget = (type: 'task' | 'meeting', index: number) => armFor({type, index, intent: 'link'});
  const armFileTarget = (type: 'task' | 'meeting', index: number) => armFor({type, index, intent: 'file'});

  /**
   * QuickAddWidget's add/edit/delete error surface (docs/technical-
   * design-unified-quickadd.md §6/§10 step 2) - like runTaskAction/
   * runMeetingAction above, it catches and surfaces the error rather than
   * rethrowing. Shared by commitTaskEdit/commitMeetingEdit/
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
   * cancelEditTarget() is called inside the try so edit mode closes only on
   * a successful save: runWidgetAction swallows errors, so chaining
   * `.then(() => cancelEditTarget())` would close it even on failure.
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
   * Shared Note Pages (docs/dev/technical-design-shared-note-pages.md §6/§9):
   * creates or opens the task's note via `openOrCreateTodoNote`.
   * `options.forceOwnTarget: true` - Inbox items have no Project/Area to
   * anchor a shared file to (§9), so this always keeps the own-note
   * behavior even if the matched Tag Rule is configured as a shared target.
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
      // Inbox tab - create it straight in the named Project/Area instead of
      // Inbox.
      await addTaskToDestination(newTask, destination, {inbox: null, inboxPath: null});
      log('InboxScreen: added task directly to', destination.path);
    }
  };

  // Used by every other Meetings-row action below (create/open note, file,
  // link); add/edit/delete go through runWidgetAction instead.
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

  /** Soft-deletes the edited row; triggered by QuickAddWidget's "Delete" button in edit mode, for both row types. */
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
      // Inbox tab - create it straight in the named Project/Area instead of
      // Inbox.
      await addMeetingToDestination(newMeeting, destination, {inbox: null, inboxPath: null});
      log('InboxScreen: added meeting directly to', destination.path);
    }
  };

  // Grouped by flow-state, same convention (and same index-safety rule) as
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
   * is the two-level Projects/Areas browser - however far it's drilled,
   * relativePath is relative to `paths.base` (the `sources` root's nominal
   * rootPath - ui/FileBrowserPane.tsx's `sources` doc comment), same as
   * browsing any other root.
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
      cancelArming();
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
   * level below its depth-0 "Projects"/"Areas" chooser, since Resources is
   * disabled, not removed, while file-arming (see `fileBrowserRoots` below).
   */
  const handlePickFile = useCallback(
    (root: string, relativePath: string) => {
      if (!paths || !armTarget || armTarget.intent !== 'file') return;
      const target = resolveFilingPick(paths, root, relativePath);
      if (!target) return;
      if (armTarget.type === 'task') handleFileTask(armTarget.index, target);
      else handleFileMeeting(armTarget.index, target);
      cancelArming();
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
  // `root: 'browse'` - refile-arming always auto-switches to the Browse tab.
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
  // (technical-design-project-area-assignment.md §4.2) - also used for
  // filing (docs/dev/technical-design-filing-unification.md §3.1) and for
  // Browse's per-category listings. Only the top-level Projects/Areas
  // management tabs show everything.
  const activeOnly = (entry: FolderEntry) => findCachedItem(entry.path)?.status === 'active';
  // Resources is never a valid refile destination - Browse is the one root
  // that's always present but ONLY enabled for picking while refile-arming
  // (see ui/FileBrowserPane.tsx's `disabled` doc comment): the tab set itself
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
              textColor={textColor}
              borderColor={borderColor}
              placeholderColor={placeholderColor}
            />
            {/* Open marks of every project, area and the Inbox (lasso 0.8 §3.10). */}
            <MarksCard scope={ALL_MARKS} returnTo="inbox" textColor={textColor} borderColor={borderColor} />
            <View style={[common.divider, {backgroundColor: borderColor}]} />
            {/* Flex-weight stacking (docs/dev/technical-design-
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

              {/* "Tasks" heading and page controls live in one PagedSection
                  (docs/dev/technical-design-pagination-fixed-height.md §3.4,
                  same as screens/ProjectDataPanel.tsx's TodosSection); the
                  "Inbox is at zero" text is its `emptyHint`. */}
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
              {/* No standalone "Meetings" label - PagedSection's own
                  `header="Meetings"` below already says it, on the list
                  itself (same as screens/WeekView.tsx's Meetings column). */}
              <MiniTabs
                tabs={mainTabs.tabs}
                activeKey={mainTab}
                onChange={setMainTab}
                textColor={textColor}
                borderColor={borderColor}
              />
              {mainTab === 'meetings' ? (
                <>
                  {/* "Meetings" heading is PagedSection's own header text,
                      same as screens/WeekView.tsx's Meetings column and
                      screens/ProjectDataPanel.tsx's MeetingsSection. The
                      "No meetings yet" text is its `emptyHint`. */}
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
  // §3.4) - splits its real available height 8:6 between the Tasks/Meetings
  // stackedSections via the weighted `<View style={{flex: TASKS_WEIGHT}}>`/
  // `{flex: MEETINGS_WEIGHT}}` boxes wrapping them in this screen's render,
  // above.
  stackedColumn: {
    flex: 1,
  },
  // Tasks-above-Meetings (technical-design-linked-files.md §1/§10.5) -
  // flex:1 (same doc as stackedColumn above): each section is the sole
  // occupant of its own weighted box, so its own PagedSection (and, for the
  // Meetings section, its Google mini-tab) can self-measure into whatever
  // real height that box resolves to instead of a fixed pixel viewport.
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
