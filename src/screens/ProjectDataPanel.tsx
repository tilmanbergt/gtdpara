/**
 * The right pane of ItemDetail: a Project/Area's own Todos and Meetings.
 * Shows the item as storage/dataCache.ts's cache holds it (ui/
 * useCachedItems.ts) - ensureItemCached loads it once if it isn't cached
 * yet. Every save writes the file and the cache entry together
 * (updateItemTasks/updateItemMeetings, or storage/entryMove.ts for a move),
 * and the cache's change notice re-renders this panel like every other
 * screen.
 * "delete" is a soft cancel (Task.cancelled/Meeting.cancelled) that hides an
 * item from this view without removing its line from the file - a "show
 * cancelled" toggle is a later feature, not built here.
 *
 * Todos and Meetings share one file, so this component owns a single
 * rawContent/tasks/meetings load rather than each section fetching
 * independently - two independent loads would each capture their own
 * stale snapshot of the file, and whichever section saved second would
 * silently overwrite the other's just-saved change.
 *
 * Each row can also carry a linked .note file (storage/noteLinks.ts) -
 * "+📓" creates one in this item's Meetings/Todos subfolder and links it
 * inline on the line; once linked, the same spot becomes "📓 open note"
 * (supernote/fileSystem.ts's openPath, same call ItemDetail's file browser
 * uses).
 *
 * Status, Archive and Focus live in ui/ItemStatusPanel.tsx
 * (docs/dev/history/technical-design-inbox-tab.md §4), which ItemDetail.tsx renders
 * in the *left* pane below Files - secondary controls stay docked out of the
 * way of the widget, so QuickAddWidget is the very first thing in this pane
 * and this component doesn't load `status`/`dailyFocus`/`weeklyFocus`.
 *
 * Add/edit for both Todos and Meetings is one shared ui/QuickAddWidget.tsx
 * (docs/dev/history/technical-design-unified-quickadd.md), rendered once above both
 * sections rather than inside either one - it isn't Todos- or Meetings-exclusive, so it doesn't
 * belong under either section's own heading (see the render below). Its
 * `fixedDestination` is fixed to this item's own path (no picker shown -
 * there's only ever one place a Todo/Meeting created from this screen can
 * go), same as Daily view's own quick-add uses with a picker shown instead,
 * so create/validate logic can never drift between the two surfaces. The
 * add/edit/delete handlers themselves (handleAddTask/handleAddMeeting/
 * commitTaskEdit/commitMeetingEdit/handleDeleteEditForWidget below) live at
 * this component's top level rather than inside TodosSection/
 * MeetingsSection (screens/projectData/), since one widget serves both - each section keeps only
 * its own list/pagination/row-level actions (toggle done, create/open note).
 *
 * Google Calendar tab (docs/dev/history/technical-design-google-calendar.md §9):
 * MeetingsSection's content sits behind a shared <MiniTabs>
 * (ui/MiniTabs.tsx) - "Meetings" is this item's own meetings, "Google" is the shared ui/GoogleCalendarPanel.tsx at `maxDays={30}` (the
 * full fetch window - unlike Daily's today/tomorrow cap, there's no shorter
 * display window to apply here) with copies defaulting to *this* item
 * rather than Inbox. It paginates its own event list internally (docs/
 * technical-design-pagination-edit-reuse.md §4), so no wrapper is needed
 * here for it.
 *
 * Pagination + edit reuse (docs/dev/history/technical-design-pagination-edit-reuse.md
 * §2/§4/§5): no ScrollView - Todos and Meetings are two independently-paginated
 * boxes (ui/PagedSection.tsx/ui/pagination.ts's `usePagedByHeight`, docs/dev/
 * technical-design-pagination-fixed-height.md §3.4), each flattening its own grouping (flow-state for Todos, Upcoming/Past for
 * Meetings) into one paginated sequence with group headers as in-sequence
 * rows. Editing a
 * task/meeting swaps the shared ui/QuickAddWidget.tsx (sitting in its own
 * fixed slot above both lists) into its `editingTask`/`editingMeeting` mode
 * instead of ui/TaskRow.tsx/ui/MeetingRow.tsx rendering an inline form -
 * same pattern DailyView.tsx uses.
 */
import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {Meeting, Task} from '../domain/types';
import {AbbrevFileMatch} from '../domain/abbrev';
import {Destination} from '../domain/destination';
import {withTaskCancelled} from '../domain/taskEdit';
import {ResolvedParaPaths, resolvePaths} from '../domain/settings';
import {CachedItem, ensureItemCached, findCachedItem, updateItemMeetings, updateItemTasks} from '../storage/dataCache';
import {resolveFilingPick} from '../storage/inboxFiling';
import {itemTarget, moveMeeting, moveTask} from '../storage/entryMove';
import {useEntryMoveUi} from '../ui/useEntryMoveUi';
import {addMeetingToDestination, addTaskToDestination, applyMeetingEdit, applyTaskEdit, buildMeeting, buildTask} from '../storage/itemMutations';
import {linkedFileStatus, locateLinkedFile, openLinkedFile, toLinkedFile} from '../storage/linkedFiles';
import {saveMeetings, saveTasks} from '../storage/projectFile';
import {loadSettings} from '../storage/settingsStorage';
import {createStandaloneNote} from '../storage/standaloneNotes';
import {log, logError} from '../utils/log';
import {useEinkRefreshOnLoad} from '../utils/screenRefresh';
import {ARMING_TEXT, LinkTarget} from '../ui/FileBrowserPane';
import {useEditTarget} from '../ui/useEditTarget';
import QuickAddWidget, {MeetingQuickAddFields, QuickFilePayload} from '../ui/QuickAddWidget';
import MarksCard from '../ui/MarksCard';
import {MarkScope} from '../domain/marks';
import {displayTaskText} from '../domain/taskLabels';
import {common} from '../ui/commonStyles';
import {useThemeColors} from '../ui/theme';
import {usePerfRender} from '../utils/perf';
import {useStableCallback} from '../ui/useStableCallback';
import {useCachedItems} from '../ui/useCachedItems';
import {useActionError} from '../ui/useActionError';
import {errorMessage} from '../utils/errorMessage';
import TodosSection from './projectData/TodosSection';
import MeetingsSection from './projectData/MeetingsSection';

// Flex weights (docs/dev/history/technical-design-flex-weight-stacking.md §3.3) -
// TodosSection and MeetingsSection are each the sole occupant of their own
// weighted `<View style={{flex: weight}}>` box inside `styles.stackedColumn`
// below, and self-measure into it (no `viewportHeight` props). 4:3 is the
// ratio of `PAGE_SIZE.projectTodos`/`projectMeetings` (8:6).
const TODOS_WEIGHT = 4;
const MEETINGS_WEIGHT = 3;

/** Which row (task or meeting, by index into ProjectDataPanel's own `state.tasks`/`state.meetings`) is being edited or armed - technical-design-linked-files.md §8's cross-cutting "one edit target" lift. Owned here rather than independently by TodosSection/MeetingsSection, so starting an edit/arm on either row type always cancels whichever of the other three states (the other type's edit, either type's arm) was active - there is exactly one edit *or* arm going on at a time, screen-wide. */
type EditTarget = {type: 'task' | 'meeting'; index: number};

/** The one arm target for this whole screen - extends EditTarget with which action armed it, mirroring screens/InboxScreen.tsx's own ArmTarget (docs/dev/history/technical-design-filing-unification.md §3.2). 'link' picks an existing file to attach; 'refile' (storage/inboxFiling.ts's module doc comment) picks a different Project/Area to move the item into - the Current tab's own entry point for filing. */
type ArmTarget = {type: 'task' | 'meeting'; index: number; intent: 'link' | 'refile'};

interface Props {
  kind: 'project' | 'area';
  name: string;
  path: string;
  /** Switches to Settings' Calendar sub-tab (docs/dev/history/technical-design-google-calendar.md §9) - used by MeetingsSection's Google mini-tab empty state when no ICS URL is configured yet. */
  onOpenCalendarSettings?: () => void;
  /** Reports this panel's current LinkTarget (technical-design-linked-files.md §8) up to ItemDetail.tsx, which passes it straight into ui/FileBrowserPane.tsx's `linkTarget` prop - null whenever nothing is being edited/armed, `{mode: 'locating', ...}` while editing a row with a linkedFile set, `{mode: 'arming', onPick}` while a row's clip has been tapped to start a new link, or `{mode: 'arming', onPick, pickKind: 'folder', ...}` while QuickAddWidget's "Refile" button has armed a Project/Area destination pick - see the ArmTarget doc comment below. ItemDetail.tsx tells the two arming shapes apart by `pickKind` to decide which Files-pane roots to offer (its own fileBrowserRoots doc comment). The `onPick` closure (when present) is fully owned/constructed here - see the module doc comment on EditTarget. */
  onLinkTargetChange?: (target: LinkTarget | null) => void;
  /**
   * Where a new standalone Note would be created right now - bubbled down
   * from screens/ItemDetail.tsx's FileBrowserPane via its own
   * onActiveLocationChange.
   * `null` disables QuickAddWidget's Note tab entirely; when set, it's
   * threaded straight through as `noteFolderPath` and re-read fresh at
   * "+Add" time, not captured here.
   */
  noteFolderPath?: string | null;
}

/** Just the fields this screen actually reads/writes - CachedItem carries several more (kind/name/path/loadError/status/dailyFocus/weeklyFocus/frontMatterExtraLines/defaultResourceFolder) it doesn't need here - Status/Archive/Focus live in ui/ItemStatusPanel.tsx. */
interface PanelState {
  rawContent: string;
  tasks: Task[];
  meetings: Meeting[];
  taskExtraLines: string[];
  meetingExtraLines: string[];
  /** The Area this Project supports, by bare folder name, or null - always null for Areas (technical-design-project-area-assignment.md §2). Used below to resolve the Resources root's Area folder path for linked-file arming - see state.area's own usage sites. */
  area: string | null;
}

export default function ProjectDataPanel({
  kind,
  name,
  path,
  onOpenCalendarSettings,
  onLinkTargetChange,
  noteFolderPath,
}: Props): React.JSX.Element {
  usePerfRender('ProjectDataPanel');
  const marksScope: MarkScope = useMemo(() => ({type: 'item', path}), [path]);
  const {textColor, borderColor, placeholderColor} = useThemeColors();

  // The item as last loaded - used only while it isn't in the cache (no
  // cache built yet); otherwise the cached entry is shown and kept current.
  const [loadedItem, setLoadedItem] = useState<CachedItem | null>(null);
  const cachedItem = useCachedItems().find(i => i.path === path);
  const item = cachedItem ?? loadedItem;
  const rawContent = item?.rawContent;
  const area = item?.area ?? null;
  const state: PanelState | null = useMemo(
    () =>
      item && !item.loadError
        ? {
            rawContent: item.rawContent,
            tasks: item.tasks,
            meetings: item.meetings,
            taskExtraLines: item.taskExtraLines,
            meetingExtraLines: item.meetingExtraLines,
            area,
          }
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cached items are updated in place; rawContent changes with every write
    [item, rawContent, area],
  );
  const [loading, setLoading] = useState(true);
  // Explicit e-ink refresh once this panel's own load actually lands - see
  // src/utils/screenRefresh.ts.
  useEinkRefreshOnLoad(loading);
  const [error, setError] = useState<string | null>(null);

  // technical-design-linked-files.md §8's lifted "one edit target" - see
  // the EditTarget doc comment above.
  const {
    target: editTarget,
    arm: armTarget,
    start: startEdit,
    cancel: cancelEditTarget,
    armFor,
    cancelArm: cancelArming,
    flushEditRef,
  } = useEditTarget<EditTarget, ArmTarget>();
  // QuickAddWidget's own add/edit/delete error surface (
  // docs/dev/history/technical-design-unified-quickadd.md §6/§10 step 2) - mirrors the
  // per-section `actionError`/`runAction` pattern TodosSection/
  // MeetingsSection keep for their own row-level actions (toggle done,
  // create/open note), lifted here since the widget itself is lifted too.
  const widgetAction = useActionError('ProjectDataPanel.widgetError', 'ProjectDataPanel: widget action failed');
  // Loaded once on mount, same self-contained "load your own settings"
  // pattern hideDone/icsUrl below already use - needed to resolve linkedFile
  // (base-root-relative) to/from an absolute path and to know where the
  // Resources root actually is.
  const [paths, setPaths] = useState<ResolvedParaPaths | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadSettings().then(s => {
      if (!cancelled) setPaths(resolvePaths(s));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const loaded = await ensureItemCached(kind, name, path);
      if (loaded.loadError) throw new Error(loaded.loadError);
      setLoadedItem(loaded);
    } catch (e) {
      const message = errorMessage(e);
      logError('ProjectDataPanel: load failed', kind, path, message);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [kind, name, path]);

  useEffect(() => {
    load();
  }, [load]);

  const withTasks = useCallback(
    async (nextTasks: Task[]) => {
      if (!state) return;
      const next = await saveTasks(kind, path, state.rawContent, nextTasks, state.taskExtraLines);
      updateItemTasks(path, next, nextTasks, state.taskExtraLines);
      if (!findCachedItem(path)) setLoadedItem(prev => prev && {...prev, rawContent: next, tasks: nextTasks});
    },
    [state, kind, path],
  );

  const withMeetings = useCallback(
    async (nextMeetings: Meeting[]) => {
      if (!state) return;
      const next = await saveMeetings(kind, path, state.rawContent, nextMeetings, state.meetingExtraLines);
      updateItemMeetings(path, next, nextMeetings, state.meetingExtraLines);
      if (!findCachedItem(path)) setLoadedItem(prev => prev && {...prev, rawContent: next, meetings: nextMeetings});
    },
    [state, kind, path],
  );

  // technical-design-linked-files.md §8: the one item currently being
  // edited (task or meeting), derived from the lifted editTarget above -
  // feeds linkedFileMissing below and (reshaped) QuickAddWidget's own
  // editingTask/editingMeeting props.
  const editingItem: Task | Meeting | null =
    editTarget?.type === 'task'
      ? state?.tasks[editTarget.index] ?? null
      : editTarget?.type === 'meeting'
      ? state?.meetings[editTarget.index] ?? null
      : null;

  // Same derivation, shaped for QuickAddWidget's own editingTask/
  // editingMeeting props (design doc §5/§8) - `text` goes through
  // displayTaskText, so an edit starts from the badge-stripped display text,
  // not the raw stored line.
  // Memoized so the React.memo'd QuickAddWidget isn't handed a new object
  // on every render (docs/dev/history/technical-design-render-perf-ab.md §3 B2).
  const editingTaskSource = editTarget?.type === 'task' ? state?.tasks[editTarget.index] : undefined;
  const editingTaskForWidget: Task | undefined = useMemo(
    () => (editingTaskSource ? {...editingTaskSource, text: displayTaskText(editingTaskSource, 'grouped')} : undefined),
    [editingTaskSource],
  );
  const editingMeetingForWidget: Meeting | undefined =
    editTarget?.type === 'meeting' ? state?.meetings[editTarget.index] : undefined;

  // Whether the editing item's own linkedFile (if any) still resolves to a
  // real file - storage/linkedFiles.ts's linkedFileStatus does I/O
  // (listFolderEntries), so this is resolved async into its own bit of
  // state rather than computed inline; QuickAddWidget stays free of I/O
  // itself (its own `linkedFileMissing` prop doc comment).
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
   * rootPath for a ui/FileBrowserPane.tsx FileBrowserRoot key, given only
   * what ProjectDataPanel itself already has (`path`, `paths`, `state.area`)
   * - see the module doc comment on why this needs no help from
   * ItemDetail.tsx. Covers every root key screens/ItemDetail.tsx builds
   * (technical-design-project-area-assignment.md §4.4): 'resources', 'area'
   * (a Project's own assigned Area, once one is set), 'projectFiles' (an
   * Area's assigned Projects), 'browse' (the Browse tab's own
   * nominal rootPath, `paths.base`, for once a link-pick has drilled below
   * its own depth-0 chooser - see ui/FileBrowserPane.tsx's `sources` doc
   * comment), and the default 'project' key (this item's own folder -
   * `path` itself). No 'areas' case - area-assignment goes through Browse
   * (ui/ItemStatusPanel.tsx's handleArmAreaAssignment).
   */
  const rootPathFor = useCallback(
    (rootKey: string): string => {
      if (rootKey === 'resources') return paths?.resources ?? '';
      if (rootKey === 'area') return paths && state?.area ? `${paths.areas}/${state.area}` : '';
      if (rootKey === 'projectFiles') return paths?.projects ?? '';
      if (rootKey === 'browse') return paths?.base ?? '';
      return path;
    },
    [paths, path, state?.area],
  );

  /** `arming` mode's onPick - see the module doc comment on EditTarget/onLinkTargetChange for why this closure, not ItemDetail.tsx, owns the actual task/meeting mutation. */
  const handlePickLinkedFile = useCallback(
    (rootKey: string, relativePath: string) => {
      if (!paths || !armTarget || armTarget.intent !== 'link') return;
      const absolutePath = `${rootPathFor(rootKey).replace(/\/+$/, '')}/${relativePath}`;
      const linkedFile = toLinkedFile(paths, absolutePath);
      if (armTarget.type === 'task' && state) {
        const next = state.tasks.slice();
        if (next[armTarget.index]) {
          next[armTarget.index] = {...next[armTarget.index], linkedFile};
          withTasks(next);
        }
      } else if (armTarget.type === 'meeting' && state) {
        const next = state.meetings.slice();
        if (next[armTarget.index]) {
          next[armTarget.index] = {...next[armTarget.index], linkedFile};
          withMeetings(next);
        }
      }
      cancelArming();
    },
    [paths, armTarget, state, rootPathFor, withTasks, withMeetings, cancelArming],
  );

  /**
   * `arming` mode's onPick for intent 'refile': the Browse pick (only
   * Projects/Areas are enabled while refile-arming, see ItemDetail's
   * fileBrowserRoots) becomes the move target. Picking this item itself is
   * a no-op that just ends arming.
   */
  // Moving a todo/meeting with a note: confirm, the note moves along (technical-design-files-0.6.md §3.4).
  const moveUi = useEntryMoveUi('ProjectDataPanel');
  const handleRefilePick = useCallback(
    (rootKey: string, relativePath: string) => {
      if (!paths || !armTarget || armTarget.intent !== 'refile' || !state) return;
      const target = resolveFilingPick(paths, rootKey, relativePath);
      cancelArming();
      if (!target || target.path === path) return; // no-op: same item, or an unexpected root
      runWidgetAction(async () => {
        if (armTarget.type === 'task') {
          const task = state.tasks[armTarget.index];
          if (!task) throw new Error('That task changed on disk - Settings → Advanced → Reload all files.');
          const moved = await moveTask({kind, path}, armTarget.index, task, itemTarget(target), moveUi);
          if (!moved) return; // cancelled in the note confirm
        } else {
          const meeting = state.meetings[armTarget.index];
          if (!meeting) throw new Error('That meeting changed on disk - Settings → Advanced → Reload all files.');
          const moved = await moveMeeting({kind, path}, armTarget.index, meeting, itemTarget(target), moveUi);
          if (!moved) return; // cancelled in the note confirm
        }
        log('ProjectDataPanel: refiled', armTarget.type, armTarget.index, '->', target.path);
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runWidgetAction is declared further down
    [paths, armTarget, state, kind, path, moveUi],
  );

  /**
   * QuickAddWidget's onQuickFile in edit mode: "save, but file elsewhere"
   * (see InboxScreen's handleQuickFileEdit). Throws instead of using
   * runWidgetAction, so the widget can show the failure inline; closes edit
   * mode only after the move succeeded. A tag naming this item itself never
   * resolves to a target (resolveAbbrevFileTarget's excludePath); the path
   * guard below is the same no-op handleRefilePick applies.
   */
  const handleQuickFileEdit = async (target: AbbrevFileMatch, payload: QuickFilePayload): Promise<void> => {
    if (!editTarget || !state || target.path === path) return;
    const index = editTarget.index;
    if (editTarget.type === 'task' && payload.kind === 'task') {
      const stored = state.tasks[index];
      if (!stored) throw new Error('That task changed on disk - Settings → Advanced → Reload all files.');
      const updated: Task = applyTaskEdit(stored, payload.text, payload.linkedFile);
      const moved = await moveTask({kind, path}, index, updated, itemTarget(target), moveUi);
      if (!moved) return; // cancelled in the note confirm - stay in edit mode
    } else if (editTarget.type === 'meeting' && payload.kind === 'meeting') {
      const stored = state.meetings[index];
      if (!stored) throw new Error('That meeting changed on disk - Settings → Advanced → Reload all files.');
      const updated: Meeting = applyMeetingEdit(stored, payload.fields, payload.linkedFile);
      const moved = await moveMeeting({kind, path}, index, updated, itemTarget(target), moveUi);
      if (!moved) return; // cancelled in the note confirm - stay in edit mode
    } else {
      return; // mismatched kinds shouldn't happen - editTarget.type gates which tab the widget shows
    }
    log('ProjectDataPanel: quick-filed', editTarget.type, index, '->', target.path);
    cancelEditTarget();
  };

  const onOpenLinkedFile = useCallback(
    (linkedFile: string) => {
      if (!paths) return;
      openLinkedFile(paths, linkedFile).catch(e =>
        logError('ProjectDataPanel: open linked file failed', errorMessage(e)),
      );
    },
    [paths],
  );

  // One edit at a time (ui/useEditTarget.ts): starting another saves this one first.
  const startEditTarget = useCallback((type: 'task' | 'meeting', index: number) => startEdit({type, index}), [startEdit]);
  // Arming (Link, Refile) is reached from inside edit mode; the edit stays open meanwhile.
  const armLinkTarget = useCallback((type: 'task' | 'meeting', index: number) => armFor({type, index, intent: 'link'}), [armFor]);
  const armRefileTarget = useCallback((type: 'task' | 'meeting', index: number) => armFor({type, index, intent: 'refile'}), [armFor]);

  /**
   * QuickAddWidget's own add/edit/delete handlers (docs/dev/technical-design-
   * unified-quickadd.md §10 step 2) - here rather than in TodosSection/
   * MeetingsSection since one widget serves both sections, operating on `state.tasks`/
   * `state.meetings` and `withTasks`/`withMeetings` directly rather than
   * through a section's own `tasks`/`onSave` props. `runWidgetAction`
   * mirrors TodosSection's/MeetingsSection's own `runAction` exactly
   * (catches and surfaces the error rather than rethrowing, so a save
   * failure is reported via `widgetError` below rather than through
   * QuickAddWidget's own local error line - same split those sections'
   * `actionError` uses for edit-save failures).
   */
  /** Resolves true on success, false when it failed (error shown) - Quick Add's save-then-switch needs to know (ui/useEditFlush.ts). */
  const runWidgetSave = widgetAction.runSave;
  const runWidgetAction = widgetAction.run;

  const handleAddTask = (text: string, destination: Destination): Promise<void> =>
    runWidgetAction(async () => {
      const newTask: Task = buildTask(text);
      if (destination.type === 'item' && destination.path !== path) {
        // Abbreviation quick-file recognized a different Project/Area's
        // #tag while composing here - create it straight there.
        await addTaskToDestination(newTask, destination, {inbox: null, inboxPath: null});
        return;
      }
      if (!state) return;
      await withTasks([...state.tasks, newTask]);
    });

  const handleAddMeeting = (fields: MeetingQuickAddFields, destination: Destination): Promise<void> =>
    runWidgetAction(async () => {
      const newMeeting: Meeting = buildMeeting(fields);
      if (destination.type === 'item' && destination.path !== path) {
        await addMeetingToDestination(newMeeting, destination, {inbox: null, inboxPath: null});
        return;
      }
      if (!state) return;
      await withMeetings([...state.meetings, newMeeting]);
    });

  /**
   * QuickAddWidget's "Note" tab. Deliberately NOT run through runWidgetAction above - a
   * name collision is an ordinary, expected outcome here (there is no
   * auto-numbering; the user fixes the title and tries again), so the rejection needs to reach QuickAddWidget's own
   * inline error line and leave the draft intact, not get swallowed into
   * `widgetError` while the widget clears the title as if it had
   * succeeded.
   */
  const handleAddNote = (title: string, tags: string[], folderPath: string): Promise<void> =>
    loadSettings().then(settings => createStandaloneNote(folderPath, title, tags, settings));

  const commitTaskEdit = (nextText: string, nextLinkedFile: string): Promise<boolean> => {
    if (editTarget?.type !== 'task') return Promise.resolve(false);
    const index = editTarget.index;
    return runWidgetSave(async () => {
      if (!state) return;
      const next = state.tasks.slice();
      next[index] = applyTaskEdit(next[index], nextText, nextLinkedFile);
      await withTasks(next);
      cancelEditTarget();
    });
  };

  const commitMeetingEdit = (fields: MeetingQuickAddFields, nextLinkedFile: string): Promise<boolean> => {
    if (editTarget?.type !== 'meeting') return Promise.resolve(false);
    const index = editTarget.index;
    return runWidgetSave(async () => {
      if (!state) return;
      const next = state.meetings.slice();
      next[index] = applyMeetingEdit(next[index], fields, nextLinkedFile);
      await withMeetings(next);
      cancelEditTarget();
    });
  };

  /** Soft-delete for both row types, triggered by QuickAddWidget's single "Delete" button in edit mode. */
  const handleDeleteEditForWidget = () => {
    if (!editTarget) return;
    Keyboard.dismiss();
    const target = editTarget;
    runWidgetAction(async () => {
      if (!state) return;
      if (target.type === 'task') {
        const next = state.tasks.slice();
        next[target.index] = withTaskCancelled(next[target.index], true);
        await withTasks(next);
      } else {
        const next = state.meetings.slice();
        next[target.index] = {...next[target.index], cancelled: true};
        await withMeetings(next);
      }
      cancelEditTarget();
    });
  };

  // `root: 'browse'` - see screens/InboxScreen.tsx's own linkTarget for the
  // full note. Both this and area-assignment's own pickKind:'folder' arm
  // (ui/ItemStatusPanel.tsx) set `root: 'browse'` (area-assignment adds `startAt: 'area'` to
  // land inside Areas directly) - ItemDetail.tsx's `isRefileArming`
  // discriminates the two by which state reported them (dataPanelLinkTarget,
  // populated only from here, vs. area-assignment's own separate
  // areaLinkTarget), not by root key.
  const linkTarget: LinkTarget | null = armTarget
    ? armTarget.intent === 'refile'
      ? {mode: 'arming', onPick: handleRefilePick, onCancel: cancelArming, pickKind: 'folder', label: ARMING_TEXT.refile(armTarget.type), root: 'browse'}
      : {mode: 'arming', onPick: handlePickLinkedFile, onCancel: cancelArming, label: ARMING_TEXT.link(armTarget.type)}
    : editTarget && paths && editingItem?.linkedFile
    ? (() => {
        // A Project's own assigned Area's folder - the third locate root
        // (technical-design-project-area-assignment.md §6). Always null for
        // an Area itself (state.area is always null there), so this is a
        // no-op on that side.
        const areaFolderPath = state?.area ? `${paths.areas}/${state.area}` : null;
        const location = locateLinkedFile(paths, path, editingItem.linkedFile, areaFolderPath);
        if (!location) return null;
        return {
          mode: 'locating' as const,
          root: location.root === 'item' ? 'project' : location.root === 'area' ? 'area' : 'resources',
          folderPath: location.folderPath,
          fileName: location.fileName,
          fileMissing: linkedFileMissing,
        };
      })()
    : null;

  useEffect(() => {
    onLinkTargetChange?.(linkTarget);
    // linkTarget is a freshly-built object every render (it carries a
    // closure when non-null) - reporting on every render is intentional
    // here rather than trying to memoize an object that can't usefully be
    // compared by reference; the dependencies below are what actually
    // determine its shape.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armTarget, editTarget, paths, linkedFileMissing, editingItem?.linkedFile, state?.area]);

  // Stable props for the React.memo'd QuickAddWidget (render-perf-ab §3 B2)
  // - all only called from its event handlers; presence conditions
  // (onRefile/onQuickFile) stay at the call site below.
  const widgetDestination: Destination = useMemo(() => ({type: 'item', kind, name, path}), [kind, name, path]);
  const stableAddTask = useStableCallback(handleAddTask);
  const stableAddMeeting = useStableCallback(handleAddMeeting);
  const stableAddNote = useStableCallback(handleAddNote);
  const stableCommitTaskEdit = useStableCallback(commitTaskEdit);
  const stableCommitMeetingEdit = useStableCallback(commitMeetingEdit);
  const stableCancelEdit = useStableCallback(cancelEditTarget);
  const stableDeleteEdit = useStableCallback(handleDeleteEditForWidget);
  const stableQuickFileEdit = useStableCallback(handleQuickFileEdit);
  const stableRefile = useStableCallback(() => {
    if (editTarget) armRefileTarget(editTarget.type, editTarget.index);
  });

  if (loading) {
    return (
      <View style={styles.root}>
        <Text style={[common.hint, {color: textColor}]}>Loading…</Text>
      </View>
    );
  }

  if (error || !state) {
    return (
      <View style={styles.root}>
        <Text style={[common.error, {color: textColor}]}>⚠ {error || 'Could not load this item.'}</Text>
        <Pressable onPress={load} hitSlop={8}>
          <Text style={[common.retryText, {color: textColor}]}>↻ Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    // Plain View, not ScrollView (docs/dev/technical-design-pagination-edit-
    // reuse.md §2/§4) - Todos/Meetings below are each their own paginated,
    // fixed-height box rather than this whole panel scrolling as one unit.
    <View style={styles.root}>
      {/* Lives above both sections, not nested under either (
          docs/dev/history/technical-design-unified-quickadd.md §3/§8) - it isn't Todos- or Meetings-
          exclusive, so it doesn't belong under either section's own
          heading. First thing in this pane - see the module doc
          comment's placement note. */}
      <QuickAddWidget
        layoutKey="current"
        fixedDestination={widgetDestination}
        onAddTask={stableAddTask}
        onAddMeeting={stableAddMeeting}
        editingTask={editingTaskForWidget}
        editingMeeting={editingMeetingForWidget}
        onSaveEditTask={stableCommitTaskEdit}
        onSaveEditMeeting={stableCommitMeetingEdit}
        editTargetKey={editTarget ? `${editTarget.type}:${editTarget.index}` : null}
        flushEditRef={flushEditRef}
        onCancelEdit={stableCancelEdit}
        onDeleteEdit={stableDeleteEdit}
        onRefile={editTarget ? stableRefile : undefined}
        onQuickFile={editTarget ? stableQuickFileEdit : undefined}
        linkedFileMissing={linkedFileMissing}
        onAddNote={stableAddNote}
        noteFolderPath={noteFolderPath}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
      {/* This item's open marks (lasso 0.8 §3.10). */}
      <MarksCard scope={marksScope} returnTo="current" textColor={textColor} borderColor={borderColor} />
      <View style={[styles.divider, {backgroundColor: borderColor}]} />
      {/* Flex-weight stacking (docs/dev/technical-design-flex-
          weight-stacking.md §3.3) - stackedColumn (flex:1) splits its real
          available height 4:3 between Todos/Meetings via plain sibling
          `flex` weights. Each section is the sole
          occupant of its own weighted box and self-measures into it - see
          TodosSection's/MeetingsSection's own PagedSection calls. */}
      <View style={styles.stackedColumn}>
        <View style={{flex: TODOS_WEIGHT}}>
          <TodosSection
            itemPath={path}
            tasks={state.tasks}
            onSave={withTasks}
            editingIndex={editTarget?.type === 'task' ? editTarget.index : null}
            armingIndex={armTarget?.type === 'task' ? armTarget.index : null}
            onStartEdit={index => startEditTarget('task', index)}
            onArmLink={index => armLinkTarget('task', index)}
            onOpenLinkedFile={onOpenLinkedFile}
            textColor={textColor}
            borderColor={borderColor}
          />
        </View>
        <View style={[styles.divider, {backgroundColor: borderColor}]} />
        <View style={{flex: MEETINGS_WEIGHT}}>
          <MeetingsSection
            kind={kind}
            name={name}
            itemPath={path}
            meetings={state.meetings}
            onSave={withMeetings}
            onOpenCalendarSettings={onOpenCalendarSettings}
            editingIndex={editTarget?.type === 'meeting' ? editTarget.index : null}
            armingIndex={armTarget?.type === 'meeting' ? armTarget.index : null}
            onStartEdit={index => startEditTarget('meeting', index)}
            onArmLink={index => armLinkTarget('meeting', index)}
            onOpenLinkedFile={onOpenLinkedFile}
            textColor={textColor}
            borderColor={borderColor}
            placeholderColor={placeholderColor}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  // Bounded flex:1 column (docs/dev/history/technical-design-flex-weight-stacking.md
  // §3.3) - splits its real available height between TodosSection/
  // MeetingsSection via the weighted `<View style={{flex: TODOS_WEIGHT}}>`/
  // `{flex: MEETINGS_WEIGHT}}` boxes wrapping them in this component's
  // render, above.
  stackedColumn: {
    flex: 1,
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
});
