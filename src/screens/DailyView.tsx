/**
 * Daily view (design-overview.md §5.2/§5.3): a two-column row - Calendar
 * (meetings dated today/tomorrow, grouped under "Today"/"Tomorrow" headers
 * rather than a repeated date) on the left, Open tasks (the daily focus
 * filter rule, storage/dailyAggregate.ts: #next, due today-or-earlier, or
 * belonging to a daily-focus Project/Area) on the right - then a two-column
 * Focus row (Projects | Areas, storage/focusSlots.ts) at the bottom. Inbox
 * no longer has its own section here (2026-09-03, docs/dev/technical-design-
 * inbox-tab.md - moved to its own tab); its qualifying tasks/meetings now
 * flow into these same two columns instead - see the "Inbox" note further
 * down. The middle row's two columns page rather than scroll - originally a
 * fixed row-count per page (docs/dev/technical-design-pagination-edit-reuse.md
 * §2/§4, ui/pagination.ts's usePagination + ui/PageControls.tsx), now a
 * fixed-height box instead (docs/dev/technical-design-pagination-fixed-
 * height.md, ui/PagedSection.tsx - Open tasks in Batch 5, Calendar's own
 * Today/Tomorrow/Google tabs in Batch 6, both 2026-09-15). The Focus row
 * stays unpaginated on the assumption it stays short by nature (the
 * configured slot counts) - worth revisiting if that assumption ever stops
 * holding.
 *
 * Reads straight from storage/dataCache.ts's in-memory cache rather than
 * scanning the filesystem itself - instant regardless of how many
 * Projects/Areas exist. If no cache has been built yet this falls back to
 * building one (rebuildCache), same as tapping 🔄 does explicitly.
 *
 * Meetings and Open-tasks rows now carry the same inline edit, cancel, and
 * note create/open actions as ProjectDataPanel's own Todos/Meetings
 * sections (tap the row text to edit, ✕ to soft-cancel, 📓/+📓 to open or
 * create a linked note) - tapping the row's item-name subtext is now the
 * "jump to that Project/Area" action instead, since tapping the main text
 * starts an edit. The one wrinkle versus ProjectDataPanel: a row here can
 * belong to a *different* Project/Area than the one next to it, so every
 * save (saveEntryTasks/saveEntryMeetings below) re-fetches that entry's own
 * source item from the cache by path before mutating it, rather than
 * assuming "the" item this screen was opened for. Meeting rows also carry
 * the prep/review checkpoint icon when the meeting's Tag Rule tracks it
 * (docs/dev/technical-design-meeting-tracking.md - `trackingFor` /
 * `handleToggleMeetingTracking` below; row sizing goes through
 * `meetingHeightFor` so the icon's width is always accounted for).
 * Presentation (the row
 * markup, the styles) is deliberately not shared with ProjectDataPanel,
 * matching this codebase's per-screen convention (design-overview.md §3) -
 * only logic that has to stay identical (Destination, validateMeetingFields)
 * is pulled into a shared domain/ module.
 *
 * Both columns' add/edit needs are now served by one shared ui/
 * QuickAddWidget.tsx instance (2026-09-09, docs/dev/technical-design-unified-
 * quickadd.md - replaces the old separate ui/TaskQuickAdd.tsx/ui/
 * MeetingQuickAdd.tsx pair), always `fixedDestination: {type: 'inbox'}`
 * (docs/dev/technical-design-filing-unification.md §6, 2026-09-07 filing
 * unification - previously an unrestricted Inbox/Project/Area picker).
 * "File it properly" now happens exclusively on the Inbox tab or Weekly
 * Review's Inbox-to-zero step - this screen only ever captures straight to
 * Inbox. A meeting added for a date other than today/tomorrow saves fine,
 * it just won't appear here until then, same as any other meeting.
 *
 * One widget for two columns (2026-09-09): the widget sits above the
 * Open-tasks column, on the right side of the screen, and handles both
 * this screen's task-editing AND meeting-editing - the Calendar column
 * lost its own add-slot entirely. This screen docks the widget to the
 * right rather than following the unified-quickadd design's original "top
 * of the shared parent" placement rule (§3) literally, which here would
 * have put it inside the Calendar column, gated behind the Meetings/Google
 * MiniTabs (2026-09-09 layout revision, per direct feedback - "the widget
 * should sit above the tasks, docked right" is now the preferred default
 * for input/edit widgets generally; ProjectDataPanel.tsx/InboxScreen.tsx/
 * ReviewScreen.tsx still use the original top-of-shared-parent placement
 * from step 2 and haven't been revisited). Docking the widget outside the
 * Calendar column altogether also resolves the "editing a Todo silently
 * closes because a Meeting row was tapped" scenario the whole feature was
 * motivated by (see the design doc's §1(c)): the widget is no longer
 * gated behind the Meetings/Google MiniTabs, so it stays visible - and
 * reachable for a task edit triggered from the Open-tasks column - no
 * matter which Calendar sub-tab is showing, without needing the
 * tab-auto-switch this screen used before this revision.
 *
 * Inbox (2026-09-03, docs/dev/technical-design-inbox-tab.md §3 - supersedes the
 * older "Inbox embedded here, always shown in full" design): Inbox.txt no
 * longer has its own always-shown section on this screen. Its own tasks/
 * meetings are folded straight into the same aggregate/filter rule
 * everything else here uses (storage/dailyAggregate.ts's buildDailyAggregate
 * now takes the loaded Inbox tasks/meetings alongside `items`) - a task
 * shows if #next or due today-or-earlier, a meeting shows if dated today/
 * tomorrow, via a synthetic "Inbox" DailyItemRef that flows through the
 * exact same grouping/source-subtext code Project/Area entries already use.
 * Inbox rows get full row parity (edit/note-link/cancel) the same as any
 * other row here - see saveEntryTasks/saveEntryMeetings below, which branch
 * on `entry.item.kind === 'inbox'` to mutate Inbox.txt (via `inbox` state)
 * instead of a cached item. Filing an Inbox item elsewhere is NOT offered
 * here (this was never a filing surface) - that stays specific to the
 * dedicated Inbox tab (screens/InboxScreen.tsx) and Weekly Review's
 * Inbox-to-zero step. Tapping an Inbox-sourced row's group header/source
 * subtext switches to the Inbox tab (`onOpenInbox`) rather than calling
 * `onOpenItem`, since there's no Project/Area to open.
 *
 * 2026-09-03 Daily-cleanup pass (technical-design-daily-compact-ui.md
 * §1/§3/§4, Phases 1-4): this screen's own heading + 🔄 button are gone
 * (reloading: Settings → Advanced → Reload all files). The Open-tasks column is now
 * grouped by source Project/Area/Inbox (storage/dailyAggregate.ts's
 * groupDailyTasksByItem) rather than one flat list, with the group header
 * itself the "jump to that item" affordance. The Calendar column's
 * always-both-visible Today/Tomorrow sections became a `calendarDay` toggle
 * (§4) - only one day's meetings render at a time, and the quick-add's date
 * defaults to whichever day is selected. Both quick-add forms sit above the
 * content they add to (avoids the on-screen keyboard covering them on a
 * list of any real length - same fix as ProjectDataPanel's
 * TodosSection/MeetingsSection). Row markup itself (checkbox/edit/badges/
 * note-link/cancel for tasks, inline-edit/note-link/cancel for meetings) is
 * now the shared ui/TaskRow.tsx/ui/MeetingRow.tsx (docs/dev/technical-design-
 * inbox-tab.md §1) rather than a per-screen copy - the same components
 * ProjectDataPanel, ReviewScreen, and the new Inbox tab use.
 *
 * Google Calendar tab (docs/dev/technical-design-google-calendar.md §9,
 * restructured into a flat 3-tab strip in Batch 6, docs/dev/technical-design-
 * pagination-fixed-height.md §3.2): the Calendar column opens with a shared
 * <MiniTabs> (ui/MiniTabs.tsx) - "Today"/"Tomorrow" (each its own height-
 * paginated ui/PagedSection.tsx over that day's meetings, replacing the old
 * nested Meetings-tab Today/Tomorrow toggle) and "Google", the shared
 * ui/GoogleCalendarPanel.tsx capped to `maxDays={2}` (the same today/
 * tomorrow window the other two tabs show) with a default copy destination
 * of Inbox. All three tabs measure the same box (PagedSection's self-measured
 * viewport), so switching tabs never reflows `DailyFocusPanel` underneath. `onOpenCalendarSettings`
 * is threaded down from App.tsx for the panel's empty-state "Open Calendar
 * Settings" link when no ICS URL is set yet.
 *
 * `#now` and focus mode (2026-09-11, docs/dev/technical-design-now-focus-mode.md,
 * companion docs/dev/design-philosophy.md §4/§8): the `focusMode` prop switches
 * this same component into a one-column, no-TabBar layout - no separate
 * screen, no separate data load, same `load`/handleAddTask/handleAddMeeting/
 * saveEntryTasks this file already has. App.tsx renders this instance fresh
 * every time focus mode is (re-)entered (a different top-level element tree
 * than the normal 'tabs'-mode Daily instance), which is what lets three
 * pieces of local state below stay plain, unpersisted `useState` rather than
 * anything durable: `pickerMode` (has "Start focus session" been pressed
 * yet - see handleStartFocusSession), `focusEntryNowMs` (the 4-hour meeting
 * look-ahead window's "now", captured once at mount, never refreshed while
 * the screen stays open - §4/§6 of the design doc), and `justCompletedTasks`
 * (the just-finished `#now` cohort, kept around only so the "Congratulations"
 * screen still has something to show once buildNowEntries would otherwise
 * come back empty). The only durable state focus mode itself needs -
 * `GtdParaSettings.focusModeActive` - lives in App.tsx, not here; this
 * component doesn't read or write it at all. See saveEntryTasks's own doc
 * comment for the one correctness fix this feature needed (chained
 * Inbox-sourced writes within one bulk-clear).
 */
import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {
  ActivityIndicator,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {AbbrevFileMatch} from '../domain/abbrev';
import {Destination, destinationLabel} from '../domain/destination';
import {setNowTag} from '../domain/flowState';
import {deriveTaskFields} from '../domain/markdown';
import {isoDateOffset, meetingTimestampMs, todayIso} from '../domain/meetingTime';
import {MeetingTrackingKind, toggleMeetingTrackingAt} from '../domain/meetingTracking';
import {GtdParaSettings, ResolvedParaPaths} from '../domain/settings';
import {Meeting, Task} from '../domain/types';
import {
  buildDailyAggregate,
  buildFocusCandidateEntries,
  buildNowEntries,
  dailyEntryDate,
  DailyAggregate,
  DailyItemRef,
  DailyMeetingEntry,
  DailyTaskEntry,
  DailyTaskGroup,
  groupDailyTasksByItem,
} from '../storage/dailyAggregate';
import {CachedItem, getCachedData, getCachedInbox, rebuildCache, setCachedInbox} from '../storage/dataCache';
import {focusBlockedReason, setItemFocus} from '../storage/focusSlots';
import {appendMeetingToTarget, appendTaskToTarget} from '../storage/inboxFiling';
import {moveEntryWithNote} from '../storage/entryMove';
import {useEntryMoveUi} from '../ui/useEntryMoveUi';
import {addMeetingToDestination, addTaskToDestination, applyMeetingEdit, buildMeeting, buildTask, mutateEntryMeetings, mutateEntryTasks} from '../storage/itemMutations';
import {linkedFileStatus, openLinkedFile} from '../storage/linkedFiles';
import {openOrCreateMeetingNote, openOrCreateTodoNote} from '../storage/meetingNoteContent';
import {useNoteCreateConfirm} from '../ui/useNoteCreateConfirm';
import {loadProjectFile, ProjectFileState} from '../storage/projectFile';
import {loadSettings} from '../storage/settingsStorage';
import {FolderEntry} from '../supernote/fileSystem';
import {log, logError} from '../utils/log';
import {requestEinkRefresh, useEinkRefreshOnLoad} from '../utils/screenRefresh';
import DailyFocusPanel from '../ui/DailyFocusPanel';
import GoogleCalendarPanel from '../ui/GoogleCalendarPanel';
import {useFeatures} from '../ui/featureStore';
import MeetingRow, {MeetingRowLayout, MeetingTrackingConfig} from '../ui/MeetingRow';
import DayMeetingsPanel from '../ui/DayMeetingsPanel';
import {useEditFlush} from '../ui/useEditFlush';
import {MiniTabDef} from '../ui/MiniTabs';
import PagedSection from '../ui/PagedSection';
import QuickAddWidget, {MeetingQuickAddFields, QuickFilePayload} from '../ui/QuickAddWidget';
import {displayTaskText} from '../domain/taskLabels';
import TaskRow, {taskRowHeight, taskRowLines} from '../ui/TaskRow';
import {useCachedItems} from '../ui/useCachedItems';
import {common} from '../ui/commonStyles';
import LoadErrorNotice from '../ui/LoadErrorNotice';
import {COLORS, FONT, useThemeColors} from '../ui/theme';
import {ExitFocusModeIcon} from '../ui/icons';
import {useErrorStatus} from '../ui/status/StatusProvider';
import {perfEnd, perfStart, usePerfRender} from '../utils/perf';
import {useStableCallback} from '../ui/useStableCallback';
import {useOnScreenShow} from '../ui/screenActivity';
import {useActionError} from '../ui/useActionError';
import {errorMessage} from '../utils/errorMessage';
import {useCachedInbox} from '../ui/useCachedInbox';

interface Props {
  onOpenItem: (kind: 'project' | 'area', entry: FolderEntry) => void;
  /** Switches to the Inbox tab - used when an Inbox-sourced row's group header/source subtext is tapped (docs/dev/technical-design-inbox-tab.md §3), since there's no Project/Area to open for those. */
  onOpenInbox?: () => void;
  /** Switches to Settings' Calendar sub-tab (docs/dev/technical-design-google-calendar.md §9) - used by the Google mini-tab's empty state when no ICS URL is configured yet. */
  onOpenCalendarSettings?: () => void;
  /** Docs/technical-design-now-focus-mode.md §4: when true, this screen renders as focus mode's one-column, no-TabBar view instead of normal two-column Daily. App.tsx's `Mode: 'focus'` branch renders this same component with this prop on - see this file's own module doc comment. Absent/false is normal Daily, unchanged. */
  focusMode?: boolean;
  /** Focus mode's own exit mark (bottom-right corner, §4.2) calls this - App.tsx's onExitFocusMode. Only meaningful when `focusMode` is true; ignored otherwise. */
  onExitFocusMode?: () => void;
  /** Normal Daily's own "Focus mode" entry button calls this - App.tsx's onEnterFocusMode (§4.1). Only meaningful when `focusMode` is false/absent - normal Daily is the only surface that ever offers a way *into* focus mode. */
  onEnterFocusMode?: () => void;
}

const taskKey = (entry: DailyTaskEntry) => `${entry.item.path}#${entry.taskIndex}`;
const meetingKey = (entry: DailyMeetingEntry) => `${entry.item.path}#${entry.meetingIndex}`;

// Both of this screen's own quick-adds (Open tasks, Calendar) always go to
// Inbox now (docs/dev/technical-design-filing-unification.md §6) - "file it
// properly" happens on the Inbox tab / Weekly Review's Inbox-to-zero step
// instead. Same local-constant convention screens/InboxScreen.tsx's own
// FIXED_INBOX_DESTINATION uses.
const FIXED_INBOX_DESTINATION: Destination = {type: 'inbox'};

// Same equal-two-column convention this screen's own Calendar/Open-tasks
// split already uses (common.column/common.columnLeft, 16px gutter) -
// docs/dev/design-device-rendering.md §5.1: (1372-16)/2 = 678 per column. Used
// by ui/TaskRow.tsx's taskRowHeight()/taskRowLines() below (Batch 5,
// 2026-09-15) now that the Open-tasks column is height-paginated instead
// of row-count-paginated.
const COLUMN_WIDTH_PX = 678;
// Round 6 (2026-09-17) - reverted Round 5's local `TASK_ROW_SLOT_PX`
// experiment entirely, back to plain `taskRowHeight()` (ui/TaskRow.tsx's
// own shared, unmodified 20/22 constants - 42px/64px). Tilman noticed
// screens/ProjectDataPanel.tsx's Todos section - the exact same TaskRow
// component, same `taskRowHeight()`, `context='grouped'` instead of
// `'flat'` - "looks just fine" using those original, untouched numbers.
// That's real evidence the height lock and the 42/64 sizing both work
// correctly when used the way ui/TaskRow.tsx's own design intends; Round
// 5's bigger local slot was solving a problem that may never have been a
// per-row-size problem to begin with. Matching this screen to the
// known-working reference exactly, rather than maintaining a second,
// screen-local sizing scheme - see ui/TaskRow.tsx's own Round-4-revert
// comment for why the earlier chrome/line re-fit was abandoned, and
// [[feature_pagination_fixed_height]] for the full round-by-round history.
const GROUP_HEADER_ROW_PX = 57;

/** Flattens grouped task entries into one paginated sequence (docs/technical-
 * design-pagination-edit-reuse.md §2/§4) - a group's header row is counted
 * as content within that sequence, same as any other row. */
type FlatTaskRow = {kind: 'header'; item: DailyItemRef} | {kind: 'entry'; entry: DailyTaskEntry};

function flattenTaskGroups(groups: DailyTaskGroup[]): FlatTaskRow[] {
  const rows: FlatTaskRow[] = [];
  for (const group of groups) {
    rows.push({kind: 'header', item: group.item});
    for (const entry of group.entries) rows.push({kind: 'entry', entry});
  }
  return rows;
}

// Unified 3-tab Calendar strip (Batch 6, docs/dev/technical-design-pagination-
// fixed-height.md §3.2) - replaces the old two-level Meetings/Google
// MiniTabs + Today/Tomorrow toggle nested inside "Meetings" with one flat
// row of tabs, since a fixed-height PagedSection needs one single
// `resetKey`-bearing tab value to page against, not a toggle nested inside
// a tab.
type CalendarTab = 'today' | 'tomorrow' | 'google';
const CALENDAR_TABS: MiniTabDef<CalendarTab>[] = [
  {key: 'today', label: 'Today'},
  {key: 'tomorrow', label: 'Tomorrow'},
  {key: 'google', label: 'Google'},
];

/** Stable empty fallback for displayAggregate (render-perf-ab §3 B4). */
const EMPTY_DAILY_AGGREGATE: DailyAggregate = {tasks: [], meetings: [], failedItems: []};

export default function DailyView({
  onOpenItem,
  onOpenInbox,
  onOpenCalendarSettings,
  focusMode,
  onExitFocusMode,
  onEnterFocusMode,
}: Props): React.JSX.Element {
  usePerfRender('DailyView');
  const {textColor, borderColor, placeholderColor} = useThemeColors();

  // Live view of storage/dataCache.ts - re-renders (with a fresh array) on
  // every cache mutation (docs/dev/technical-design-cache-subscription-and-
  // shared-add-path.md §A). `aggregate` is no longer state: it is derived
  // from `items`/`inbox` on every render (see the const further below), so
  // there is no manual "refresh after save" step left to forget.
  const items = useCachedItems();
  const confirmNoteCreate = useNoteCreateConfirm('DailyView.noteCreateConfirm');
  // Moving a todo/meeting with a note: confirm, the note moves along (technical-design-files-0.6.md §3.4).
  const moveUi = useEntryMoveUi('DailyView');
  const [settings, setSettings] = useState<GtdParaSettings | null>(null);
  const [inboxPath, setInboxPath] = useState<string | null>(null);
  // storage/linkedFiles.ts's resolveLinkedFilePath (the read-only
  // onOpenLinkedFile below, technical-design-linked-files.md §6) needs the
  // full resolved path set, not just `inboxPath` - same "keep both" shape
  // screens/InboxScreen.tsx's own `inboxPath`/`paths` pair uses.
  const [paths, setPaths] = useState<ResolvedParaPaths | null>(null);
  // The shared Inbox (storage/dataCache.ts, technical-design-files-0.6.md §3.3) - setCachedInbox writes it for every screen.
  const inbox = useCachedInbox();
  const [loading, setLoading] = useState(true);
  // Explicit e-ink refresh once the initial load or a manual refresh
  // actually lands - see src/utils/screenRefresh.ts.
  useEinkRefreshOnLoad(loading);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  useErrorStatus('DailyView.actionError', actionError, () => setActionError(null));
  // Calendar column's 3-tab state (Batch 6, docs/dev/technical-design-
  // pagination-fixed-height.md §3.2) - collapses the old two-level
  // calendarMainTab ('meetings'|'google') + calendarDay ('today'|'tomorrow')
  // pair into one flat value, since PagedSection needs a single `resetKey`
  // to page against per tab rather than a toggle nested inside a tab.
  const [calendarTab, setCalendarTab] = useState<CalendarTab>('today');
  // The Google tab only while the experimental Google Calendar integration
  // is on (docs/dev/technical-design-about-debug-experimental.md §3.2);
  // DayMeetingsPanel drops the tab when googlePanel is null.
  const features = useFeatures();

  // Context-tag filter (technical-design-context-tags.md §6) - session-only,
  // not persisted (resets to off on every reopen, same posture docs/
  // technical-design-now-focus-mode.md §5 already uses for focus mode's own
  // state), Daily-only for v1 (deliberately never threaded into
  // focusMode's own rendering below - see that scope note in the design
  // doc's §2/§10). Set by tapping a tag in a row's text (ui/TaskRow.tsx/
  // ui/MeetingRow.tsx's onToggleContext) or the indicator's own ✕; there's
  // no other way to set it (no picker) by design.
  const [dailyContext, setDailyContext] = useState<string | null>(null);
  const toggleContext = (tag: string) => setDailyContext(current => (current === tag ? null : tag));

  // Which row (if any) is mid-edit, across BOTH columns (2026-09-09,
  // docs/dev/technical-design-unified-quickadd.md §6/§8) - one shared
  // QuickAddWidget instance now serves both the Open-tasks and Calendar
  // columns, so there's one lifted edit-target state for the whole screen
  // rather than a separate one per column, mirroring the
  // `EditTarget`-shaped state ProjectDataPanel.tsx/InboxScreen.tsx already
  // use. Row keys stay string-based (not the `{type, index}` shape those
  // two screens use) since a row here can belong to a *different*
  // Project/Area/Inbox than its neighbor - see taskKey/meetingKey above.
  type DailyEditTarget = {type: 'task'; key: string} | {type: 'meeting'; key: string};
  const [editTarget, setEditTarget] = useState<DailyEditTarget | null>(null);
  // Shown as a warning in the central status slot (via QuickAddWidget) when a row tap is blocked
  // because an edit is already open elsewhere on screen (design doc §6).
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const tasksAction = useActionError('DailyView.tasksActionError', 'DailyView: task action failed');
  const meetingsAction = useActionError('DailyView.meetingsActionError', 'DailyView: meeting action failed');

  // Focus-mode-only local state (docs/dev/technical-design-now-focus-mode.md §5/
  // §6) - see this file's module doc comment for why plain unpersisted
  // useState is enough here ("sessions held lightly").

  // The Picker's own "has 'Start focus session' been pressed yet" flag
  // (state C vs A). Deliberately NOT derived from whether any task currently
  // carries #now: double-tapping a Picker candidate writes #now immediately
  // (so more than one can be selected before committing - the corrected
  // interaction model, see handleToggleNow/handleStartFocusSession below),
  // and that live write must not itself flip the view over to the working
  // state before the button is pressed. Initialized once per mount, after
  // the initial load lands, to `true` (fresh Picker) only when no task is
  // #now yet - resuming a session already in progress skips straight past
  // the Picker instead (§5's "reopening always returns to the running
  // session"). `pickerModeInitRef` guards this happening only once; nothing
  // else ever flips it back to `true` (handleCreateNewSession doesn't need
  // to - see focusState's own derivation below, which falls back to the
  // Picker whenever nothing is #now regardless of this flag).
  const pickerModeInitRef = useRef(false);
  const [pickerMode, setPickerMode] = useState(true);
  // The 4-hour meeting look-ahead window's "now" (§4/§6's correction: this
  // is computed once, when focus mode is entered, never refreshed while the
  // screen stays open) - a lazy initializer captures it at this instance's
  // first render, which is safe specifically because App.tsx remounts this
  // component fresh every time focus mode is (re-)entered (module doc
  // comment) - there's no later moment this value would need invalidating.
  const [focusEntryNowMs] = useState(() => Date.now());
  // Snapshot of whichever tasks were #now at the instant the whole cohort
  // just cleared (§6 state B) - buildNowEntries would otherwise come back
  // empty the moment #now clears, leaving the "Congratulations" screen
  // nothing to show. `null` outside that moment; handleCreateNewSession
  // resets it back to `null`, which is what falls the view through to the
  // Picker on the very next render (see focusState below).
  const [justCompletedTasks, setJustCompletedTasks] = useState<DailyTaskEntry[] | null>(null);

  const load = useCallback(async (forceRebuild: boolean) => {
    const perfToken = perfStart();
    setLoading(true);
    setError(null);
    // Settings are applied together with Inbox/paths below (one render
    // round instead of two - docs/dev/technical-design-render-perf-ab.md §3 B3);
    // still applied on a later failure, as before.
    let loadedSettings: GtdParaSettings | null = null;
    try {
      loadedSettings = await loadSettings();
      let cache = getCachedData();
      if (!cache || forceRebuild) {
        cache = await rebuildCache(loadedSettings);
      }
      // The rebuild above already read Inbox.txt into the shared cache.
      const loadedInbox = (!forceRebuild && getCachedInbox()) || (await loadProjectFile('inbox', cache.paths.inboxFolder));
      setSettings(loadedSettings);
      setCachedInbox(loadedInbox);
      setInboxPath(cache.paths.inboxFolder);
      setPaths(cache.paths);
    } catch (e) {
      if (loadedSettings) setSettings(loadedSettings);
      const message = errorMessage(e);
      logError('DailyView: load failed', message);
      setError(message);
    } finally {
      perfEnd('screen:load', perfToken, {screen: 'DailyView', forceRebuild});
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
    // Only ever auto-loads once, on mount (using whatever's cached, or
    // building it if nothing is) - Settings → Advanced → Reload all files is the explicit rebuild.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Kept tab shown again (docs/dev/technical-design-keep-tabs-alive.md §5.2):
  // settings are this screen's own copy, so re-read them quietly - no
  // spinner, and state only changes (= re-render) if they actually differ.
  // The Inbox is the shared cache copy (refreshed when gtdpara is reopened).
  // Also re-render once if the date changed while hidden (a tab kept
  // overnight must show the new day) - same-value setState is a no-op.
  const [, setShownDay] = useState(() => todayIso());
  useOnScreenShow(() => {
    setShownDay(todayIso());
    (async () => {
      try {
        if (!getCachedData()) return;
        const loadedSettings = await loadSettings();
        setSettings(prev => (prev && JSON.stringify(prev) === JSON.stringify(loadedSettings) ? prev : loadedSettings));
      } catch (e) {
        logError('DailyView: quiet reload on show failed', errorMessage(e));
      }
    })();
  });

  // pickerMode's one-time initializer (see its own declaration above) - runs
  // once the initial load lands (guarded by pickerModeInitRef, not by an
  // empty dep array, since `loading` starts true and this has to wait for it
  // to flip false first).
  useEffect(() => {
    if (!focusMode || pickerModeInitRef.current || loading) return;
    pickerModeInitRef.current = true;
    const cohort = buildNowEntries(
      items,
      inbox ? {tasks: inbox.tasks, meetings: inbox.meetings} : null,
      inboxPath ?? '',
    );
    setPickerMode(cohort.length === 0);
  }, [focusMode, loading, items, inbox, inboxPath]);

  /** Jumps to that Project/Area's Current tab, or (2026-09-03, docs/dev/technical-design-inbox-tab.md §3) to the Inbox tab when `item` is the synthetic Inbox entry - there's no Project/Area to open for that one. */
  const openItem = (item: DailyItemRef) => {
    if (item.kind === 'inbox') {
      onOpenInbox?.();
      return;
    }
    onOpenItem(item.kind, {name: item.name, path: item.path, isFolder: true});
  };

  /**
   * Re-fetches `entry`'s own source item fresh from the cache, applies
   * `mutate` to its full tasks array, and runs the same
   * save-file-then-write-cache pair every mutation in this codebase uses
   * (design-overview.md §3, "write-through is not optional") - the shared
   * implementation is storage/itemMutations.ts's `mutateEntryTasks` (Inbox
   * branch, stale-index check and error wording included); this wrapper only
   * owns the screen-local Inbox state. Throws a user-facing message if the
   * item or task index no longer matches what's cached.
   *
   * `inboxOverride`/return value (2026-09-11, docs/dev/technical-design-now-
   * focus-mode.md §5/§6's bulk `#now` clear): `setCachedInbox` is async, so
   * chaining several `await saveEntryTasks(...)` calls back-to-back for
   * Inbox-sourced entries within one function (as clearing a whole `#now`
   * cohort at once needs to) would otherwise have every call after the first
   * read the SAME stale pre-mutation `inbox` React state via closure,
   * silently clobbering each other's writes. `inboxOverride`, when passed,
   * is used instead of `inbox` for the Inbox branch; the return value (the
   * freshly-mutated inbox state for an Inbox write, `null` for a non-Inbox
   * write) lets a caller doing a multi-step sequence thread that value
   * forward into the next call. Cached Project/Area writes need neither: the
   * cache is module-level and announces its own changes. Every single-call
   * caller simply ignores the return value and passes no override.
   */
  const saveEntryTasks = async (
    entry: DailyTaskEntry,
    mutate: (tasks: Task[]) => Task[],
    inboxOverride?: ProjectFileState,
  ): Promise<ProjectFileState | null> => {
    const {nextInbox} = await mutateEntryTasks(entry, mutate, {inbox: inboxOverride ?? inbox, inboxPath});
    if (nextInbox) setCachedInbox(nextInbox);
    return nextInbox;
  };

  /** Meeting counterpart of saveEntryTasks above - see its doc comment, including the Inbox branch. */
  const saveEntryMeetings = async (
    entry: DailyMeetingEntry,
    mutate: (meetings: Meeting[]) => Meeting[],
  ): Promise<void> => {
    const {nextInbox} = await mutateEntryMeetings(entry, mutate, {inbox, inboxPath});
    if (nextInbox) setCachedInbox(nextInbox);
  };

  // One-edit-at-a-time guard (design doc §6) - lives here, not in the
  // widget, since the widget only ever sees whichever row it's handed and
  // has no way to know about the other column. `blockedMessage` is cleared
  // wherever an edit actually completes (cancelEditTarget wraps every
  // Cancel/Save/Delete path below), and by a fresh startEditTarget call
  // succeeding.
  // Save-then-switch (docs/dev/technical-design-meeting-lists.md §10, 2026-09-29):
  // tapping another row while editing first saves the current row's changes
  // (if any), then switches - it used to be blocked with "Finish edit!".
  const {flushEditRef, afterSave} = useEditFlush();
  const startEditTarget = (target: DailyEditTarget) =>
    afterSave(() => {
      setEditTarget(target);
      setBlockedMessage(null);
    });
  const cancelEditTarget = () => {
    setEditTarget(null);
    setBlockedMessage(null);
  };

  // Errors from the shared widget's own add/edit/delete actions - kept
  // separate from tasksActionError/meetingsActionError below, which stay
  // scoped to each column's row-level actions (note create/open) as
  // before. Needed here (unlike Review's Inbox-to-zero step, which reuses
  // its own single existing error slot) because tasksActionError/
  // meetingsActionError are displayed in two different columns, while the
  // widget itself lives in only one - the same reasoning ProjectDataPanel.tsx/
  // InboxScreen.tsx already applied in step 2.
  const widgetAction = useActionError('DailyView.widgetError', 'DailyView: widget action failed');
  /** Resolves true on success, false when it failed (error shown) - Quick Add's save-then-switch needs to know (ui/useEditFlush.ts). */
  const runWidgetSave = widgetAction.runSave;
  const runWidgetAction = (fn: () => Promise<void>): Promise<void> => runWidgetSave(fn).then(() => undefined);

  const handleToggleDone = (entry: DailyTaskEntry) => {
    setActionError(null);
    (async () => {
      try {
        await saveEntryTasks(entry, tasks => {
          tasks[entry.taskIndex] = {...tasks[entry.taskIndex], done: !tasks[entry.taskIndex].done};
          return tasks;
        });
        log('DailyView: toggled', entry.item.path, entry.taskIndex);
      } catch (e) {
        const message = errorMessage(e);
        logError('DailyView: toggle failed', message);
        setActionError(message);
      }
    })();
  };

  /**
   * The `#next`/`#now` label's double-tap (ui/TaskLabels.tsx's onToggleNow,
   * threaded through ui/TaskRow.tsx) - flips `#now` on `entry.task` via the
   * same setNowTag-then-deriveTaskFields round-trip every other tag mutator
   * on this screen uses (see commitTaskEdit above). Wired both from normal
   * Daily's Open-tasks rows (renderTaskEntry below - marking #now doesn't
   * require being in focus mode, docs/dev/technical-design-now-focus-mode.md §3)
   * and from focus mode's own Picker (§6 state C, renderFocusTaskEntry
   * below) - the Picker's double-tap-to-select IS this same call, nothing
   * Picker-specific about it. A task turning done while carrying #now is
   * handled separately by handleFocusToggleDone below - this one only ever
   * flips the tag.
   */
  const handleToggleNow = (entry: DailyTaskEntry) => {
    setActionError(null);
    (async () => {
      try {
        await saveEntryTasks(entry, tasks => {
          const task = tasks[entry.taskIndex];
          const nextText = setNowTag(task.text, !task.now);
          tasks[entry.taskIndex] = {...task, text: nextText, ...deriveTaskFields(nextText)};
          return tasks;
        });
        log('DailyView: toggled #now', entry.item.path, entry.taskIndex);
      } catch (e) {
        const message = errorMessage(e);
        logError('DailyView: toggle #now failed', message);
        setActionError(message);
      }
    })();
  };

  /**
   * Focus mode's own checkbox handler (§5/§6 state A→B) - writes the Done
   * toggle exactly like handleToggleDone above, then adds the bulk-clear
   * rule: #now never clears per-task on Done, only when the LAST currently-
   * #now task becomes done does the whole cohort's #now tags clear together,
   * in one pass, after first snapshotting the just-finished set into
   * justCompletedTasks so the Congratulations screen still has something to
   * show once buildNowEntries would otherwise come back empty. Un-checking a
   * task (wasDone true) never triggers this - only a fresh completion does.
   *
   * Threads the toggle-write's own return value (see saveEntryTasks's doc
   * comment) into the cohort lookup and then into each clearing write in
   * turn - without it, a cohort with more than one Inbox-sourced task would
   * have every write past the first clobber the one before it, since
   * `inbox` React state doesn't update synchronously.
   */
  const handleFocusToggleDone = (entry: DailyTaskEntry) => {
    setActionError(null);
    (async () => {
      try {
        const wasDone = entry.task.done;
        const doneResult = await saveEntryTasks(entry, tasks => {
          tasks[entry.taskIndex] = {...tasks[entry.taskIndex], done: !wasDone};
          return tasks;
        });
        if (wasDone) return;

        // Non-Inbox items are already synchronously fresh in the cache
        // after the write above (storage/dataCache.ts's module-level
        // cache); Inbox needs the just-mutated value threaded through
        // explicitly rather than reading the (still-stale, setCachedInbox is
        // async) `inbox` React state.
        const inboxForCohort = entry.item.kind === 'inbox' ? doneResult ?? undefined : inbox ?? undefined;
        const cache = getCachedData();
        const cohort = buildNowEntries(
          cache?.items ?? items,
          inboxForCohort ? {tasks: inboxForCohort.tasks, meetings: inboxForCohort.meetings} : null,
          inboxPath ?? '',
        );
        const stillOpen = cohort.filter(e => !e.task.done);
        if (stillOpen.length > 0) return; // more #now tasks still open - no clear yet

        // Every #now task is now done - snapshot first (so the
        // Congratulations screen has something to render), then clear the
        // whole cohort's #now tags together, sequentially, threading each
        // write's result into the next (see this function's own doc
        // comment).
        setJustCompletedTasks(cohort);
        let inboxState = inboxForCohort;
        for (const doneEntry of cohort) {
          const nextInbox = await saveEntryTasks(
            doneEntry,
            tasks => {
              const task = tasks[doneEntry.taskIndex];
              const nextText = setNowTag(task.text, false);
              tasks[doneEntry.taskIndex] = {...task, text: nextText, ...deriveTaskFields(nextText)};
              return tasks;
            },
            inboxState,
          );
          if (nextInbox) inboxState = nextInbox;
        }
        log('DailyView: focus cohort cleared', cohort.length);
      } catch (e) {
        const message = errorMessage(e);
        logError('DailyView: focus toggle done failed', message);
        setActionError(message);
      }
    })();
  };

  /** Picker's "Start focus session" button (§6 state C→A) - commits whatever's currently selected (already written live by handleToggleNow above) and switches the view. Nothing selected is simply left alone: focusState's own derivation below already falls back to rendering the Picker whenever nothing is #now, regardless of this flag, so there's nothing to specially guard against here (§6: "not specially prevented"). */
  const handleStartFocusSession = () => setPickerMode(false);

  /** Congratulations screen's "Create new session" button (§6 state B→C) - clears the snapshot; focusState's derivation (nowCohort is already empty at this point, the clear having just happened) falls straight through to the Picker on the very next render, no further state change needed. */
  const handleCreateNewSession = () => setJustCompletedTasks(null);

  // Now only backs this column's own row-level actions (note create/open) -
  // edit/cancel moved to runWidgetAction above, since those are driven by
  // the shared widget instead. async (returns the underlying promise) so
  // callers with their own promise chains have a real promise to attach to
  // - same shape as ProjectDataPanel's runAction.
  const runTaskAction = tasksAction.run;

  const startTaskEdit = (entry: DailyTaskEntry) => {
    startEditTarget({type: 'task', key: taskKey(entry)});
  };

  /**
   * ui/QuickAddWidget.tsx's `editingTask` mode onSaveEditTask - `nextText`
   * already has flow-state/due/waiting-on tags composed in (same
   * setFlowStateTag/setDueTag calls its add mode uses), so this only needs
   * to re-derive tags/dueDate/flowState/waitingOn and write through, same
   * as ProjectDataPanel's TodosSection commitEdit. `nextLinkedFile` is
   * assigned straight onto the field, same as every other commitEdit in
   * this pass. Closes edit mode only on a successful save - runWidgetAction
   * swallows errors internally, so chaining `.then(() => ...)` after it (as
   * this used to) would close edit mode even on a failed save; same fix
   * every other commitEdit in this pass got.
   */
  const commitTaskEdit = (entry: DailyTaskEntry, nextText: string, nextLinkedFile: string): Promise<boolean> => {
    const text = nextText.trim();
    if (!text) return Promise.resolve(false);
    return runWidgetSave(async () => {
      await saveEntryTasks(entry, tasks => {
        tasks[entry.taskIndex] = {...tasks[entry.taskIndex], text, ...deriveTaskFields(text), linkedFile: nextLinkedFile};
        return tasks;
      });
      cancelEditTarget();
    });
  };

  /** The soft-delete ui/TaskRow.tsx's old ✕ used to trigger, now sourced from ui/QuickAddWidget.tsx's "Delete" button in edit mode instead (technical-design-linked-files.md §1/§7) - only ever called on the entry currently being edited (handleDeleteEditForWidget below), so closing edit mode on success here is safe. */
  const handleCancelTask = (entry: DailyTaskEntry) => {
    Keyboard.dismiss();
    runWidgetAction(async () => {
      await saveEntryTasks(entry, tasks => {
        tasks[entry.taskIndex] = {...tasks[entry.taskIndex], cancelled: true};
        return tasks;
      });
      cancelEditTarget();
    });
  };

  /**
   * Shared Note Pages (docs/dev/technical-design-shared-note-pages.md §6, Slice
   * 3, 2026-09-22): replaces the old separate handleCreateTaskNote/
   * handleOpenTaskNote pair with one call into `storage/
   * meetingNoteContent.ts`'s `openOrCreateTodoNote`, which decides
   * create-vs-open (and own-vs-shared-target) internally and already ends by
   * opening the resolved page itself - this handler's only remaining job is
   * persisting `notePath` when it changed. `null` for the related-items
   * context, matching both old handlers here exactly (unlike this screen's
   * meeting handler below, the Todo ones never passed `inbox` through).
   */
  const handleTaskNote = (entry: DailyTaskEntry) => {
    Keyboard.dismiss();
    runTaskAction(async () => {
      const currentSettings = settings ?? (await loadSettings());
      const {task, changed} = await openOrCreateTodoNote(entry.task, entry.item.path, currentSettings, null, {
        confirmCreate: confirmNoteCreate,
      });
      if (changed) {
        await saveEntryTasks(entry, tasks => {
          tasks[entry.taskIndex] = task;
          return tasks;
        });
      }
    });
  };

  // Now only backs this column's own row-level actions (note create/open) -
  // edit/cancel moved to runWidgetAction above. Same shape as runTaskAction.
  const runMeetingAction = meetingsAction.run;

  const startMeetingEdit = (entry: DailyMeetingEntry) => {
    startEditTarget({type: 'meeting', key: meetingKey(entry)});
  };

  /**
   * ui/QuickAddWidget.tsx's `editingMeeting` mode onSaveEditMeeting -
   * `fields` has already been validated/normalized by the widget's own
   * submit() (validateMeetingFields), so this only needs to write through.
   * See commitTaskEdit above for `nextLinkedFile` and the "close only on
   * success" note - identical reasoning here.
   */
  const commitMeetingEdit = (entry: DailyMeetingEntry, fields: MeetingQuickAddFields, nextLinkedFile: string): Promise<boolean> => {
    Keyboard.dismiss();
    return runWidgetSave(async () => {
      await saveEntryMeetings(entry, meetings => {
        meetings[entry.meetingIndex] = applyMeetingEdit(meetings[entry.meetingIndex], fields, nextLinkedFile);
        return meetings;
      });
      cancelEditTarget();
    });
  };

  /** See handleCancelTask above - only ever called on the entry currently being edited (handleDeleteEditForWidget below). */
  const handleCancelMeeting = (entry: DailyMeetingEntry) => {
    Keyboard.dismiss();
    runWidgetAction(async () => {
      await saveEntryMeetings(entry, meetings => {
        meetings[entry.meetingIndex] = {...meetings[entry.meetingIndex], cancelled: true};
        return meetings;
      });
      cancelEditTarget();
    });
  };

  /** ui/QuickAddWidget.tsx's onDeleteEdit - single entry point since only one of editingTaskEntry/editingMeetingEntry can be set at a time (the screen's own §6 guard). */
  const handleDeleteEditForWidget = () => {
    if (editTarget?.type === 'task' && editingTaskEntry) handleCancelTask(editingTaskEntry);
    else if (editTarget?.type === 'meeting' && editingMeetingEntry) handleCancelMeeting(editingMeetingEntry);
  };

  /**
   * ui/QuickAddWidget.tsx's onQuickFile in edit mode (feature_abbrev_quick_
   * file, 2026-09-17, 2026-09-18 bugfix, docs/dev/technical-design-abbrev-quick-
   * file.md §5.2) - genuinely new plumbing, unlike Inbox/Current tab/
   * Review's straight pass-through to an existing refile commit path: Daily
   * has no "move to a different file" capability at all before this
   * feature. `payload` is the widget's fully-composed, tag-stripped current
   * edit-session text/fields (mirroring commitTaskEdit/commitMeetingEdit's
   * own nextText/fields above) - this is "Save, but file elsewhere", not a
   * plain move of the last-saved copy, so any other edit made during this
   * session (including the abbreviation tag itself) rides along instead of
   * being silently discarded (2026-09-18: the original version only took
   * `target` and moved entry.task/entry.meeting as-is, which is also why the
   * tag never actually disappeared). Builds the updated object the same way
   * commitTaskEdit/commitMeetingEdit do (spread the stored item first so
   * done/cancelled/notePath survive, then overlay the
   * edited fields), then appends to the resolved target
   * (appendTaskToTarget/appendMeetingToTarget - reused as-is from
   * storage/inboxFiling.ts, source-agnostic), then removes the entry from
   * wherever it actually lives via saveEntryTasks/saveEntryMeetings (already
   * source-agnostic themselves - Inbox or any Project/Area, same branch
   * their own Inbox/non-Inbox handling uses everywhere else in this file) -
   * same append-then-remove order fileInboxTask/fileInboxMeeting use.
   * Deliberately does NOT go through runWidgetAction (which swallows errors
   * internally, same as runTaskAction/runMeetingAction) - onQuickFile's
   * contract needs a real rejecting Promise so the widget's own
   * handleQuickFile can show the failure inline. Closes edit mode
   * (cancelEditTarget) only once both steps succeed, same "close only on
   * success" rule every other commitEdit in this file follows.
   */
  const handleQuickFileEdit = async (target: AbbrevFileMatch, payload: QuickFilePayload): Promise<void> => {
    if (editTarget?.type === 'task' && editingTaskEntry && payload.kind === 'task') {
      const entry = editingTaskEntry;
      const updated: Task = {
        ...entry.task,
        text: payload.text,
        ...deriveTaskFields(payload.text),
        linkedFile: payload.linkedFile,
      };
      const moved = await moveEntryWithNote({entry: updated, entryKind: 'task', sourceFolder: entry.item.path, target}, moveUi, async next => {
        await appendTaskToTarget(target, next);
        await saveEntryTasks(entry, tasks => tasks.filter((_, index) => index !== entry.taskIndex));
      });
      if (moved) cancelEditTarget(); // cancelled in the note confirm: stay in edit mode
    } else if (editTarget?.type === 'meeting' && editingMeetingEntry && payload.kind === 'meeting') {
      const entry = editingMeetingEntry;
      const updated: Meeting = applyMeetingEdit(entry.meeting, payload.fields, payload.linkedFile);
      const moved = await moveEntryWithNote({entry: updated, entryKind: 'meeting', sourceFolder: entry.item.path, target}, moveUi, async next => {
        await appendMeetingToTarget(target, next);
        await saveEntryMeetings(entry, meetings => meetings.filter((_, index) => index !== entry.meetingIndex));
      });
      if (moved) cancelEditTarget(); // cancelled in the note confirm: stay in edit mode
    }
  };

  /** Meeting counterpart of handleTaskNote above - see its doc comment. Passes `inbox ? {tasks: inbox.tasks} : null`, matching both old handlers here exactly. */
  const handleMeetingNote = (entry: DailyMeetingEntry) => {
    Keyboard.dismiss();
    runMeetingAction(async () => {
      const currentSettings = settings ?? (await loadSettings());
      const {meeting, changed} = await openOrCreateMeetingNote(
        entry.meeting,
        entry.item.path,
        currentSettings,
        inbox ? {tasks: inbox.tasks} : null,
        {confirmCreate: confirmNoteCreate},
      );
      if (changed) {
        await saveEntryMeetings(entry, meetings => {
          meetings[entry.meetingIndex] = meeting;
          return meetings;
        });
      }
    });
  };

  /**
   * The meeting row's prep/review checkpoint icon (ui/MeetingRow.tsx's
   * `tracking`, docs/dev/technical-design-meeting-tracking.md) - flips
   * `#prepped`/`#reviewed` on the meeting's CURRENT copy inside the usual
   * saveEntryMeetings mutator (not on the render-time `entry.meeting`, which
   * may be a render behind), same write path as every other meeting edit
   * here. Explicit e-ink flush afterwards: this is a direct tap changing a
   * small icon, exactly the kind of repaint that doesn't reliably reach the
   * panel on its own (see utils/screenRefresh.ts).
   */
  const handleToggleMeetingTracking = (entry: DailyMeetingEntry, kind: MeetingTrackingKind) => {
    runMeetingAction(async () => {
      await saveEntryMeetings(entry, meetings => {
        return toggleMeetingTrackingAt(meetings, entry.meetingIndex, kind);
      });
      requestEinkRefresh();
    });
  };

  /**
   * ui/QuickAddWidget.tsx's onAddTask contract: the widget owns the input
   * text and pending/error UI state itself, this just does the actual
   * save-file-then-write-cache mutation and throws on failure (which the
   * widget surfaces as its own inline error) - same split as
   * saveEntryTasks/saveEntryMeetings above.
   */
  const handleAddTask = async (text: string, destination: Destination): Promise<void> => {
    const {nextInbox} = await addTaskToDestination(buildTask(text), destination, {inbox, inboxPath});
    if (nextInbox) setCachedInbox(nextInbox);
    log('DailyView: added task', destinationLabel(destination));
  };

  /**
   * ui/QuickAddWidget.tsx's onAddMeeting contract - mirrors handleAddTask
   * above exactly (the widget owns the fields/pending/error UI state and
   * validateMeetingFields call itself; storage/itemMutations.ts does the
   * actual save-file-then-write-cache mutation and throws on failure).
   */
  const handleAddMeeting = async (fields: MeetingQuickAddFields, destination: Destination): Promise<void> => {
    const {nextInbox} = await addMeetingToDestination(buildMeeting(fields), destination, {inbox, inboxPath});
    if (nextInbox) setCachedInbox(nextInbox);
    log('DailyView: added meeting', destinationLabel(destination));
  };

  /**
   * Adds/removes `item` from *daily* focus (weekly isn't editable from this
   * screen - see the module doc comment). Turning focus on is blocked with
   * a message when that kind's daily slots are already full - same check
   * ProjectDataPanel's checkboxes use (storage/focusSlots.ts), so the two
   * surfaces never disagree about what's allowed.
   *
   * `area` bugfix (2026-09-09, found incidentally while adding this file to
   * a real tsc pass for the first time - unrelated to the quick-add work):
   * this was omitting `item.area` from the object passed to setItemFocus,
   * the same silent-wipe-a-Project's-Area-assignment bug technical-design-
   * project-area-assignment.md already found and fixed in
   * ProjectDataPanel.tsx (2026-09-07) - this screen's own copy of the same
   * call just never got that fix.
   */
  const handleToggleItemFocus = useCallback(
    async (item: CachedItem, value: boolean): Promise<void> => {
      if (value) {
        const currentSettings = settings ?? (await loadSettings());
        const reason = focusBlockedReason(items, item.kind, 'daily', currentSettings);
        if (reason) throw new Error(reason);
      }
      await setItemFocus(
        item,
        'daily',
        value,
      );
      log('DailyView: daily focus toggled', item.path, value);
    },
    [items, settings],
  );

  // Today/Tomorrow grouping: aggregate.meetings is already sorted soonest
  // first (storage/dailyAggregate.ts), and every "Today" timestamp sorts
  // before every "Tomorrow" one (domain/meetingTime.ts's meetingTimestampMs -
  // even a date-only today meeting's 23:59:59 stays earlier than any
  // tomorrow instant), so this is just a filter-by-date split, not a
  // re-sort.
  const todayDate = todayIso();
  const tomorrowDate = isoDateOffset(1);

  // The unfiltered aggregate, derived on every render (2026-09-20, docs/
  // technical-design-cache-subscription-and-shared-add-path.md §A) - it used
  // to be state that load()/refreshFromCache() had to remember to rebuild.
  // buildDailyAggregate is a pure, synchronous transform over `items`/`inbox`
  // (storage/dailyAggregate.ts's own module doc comment), so recomputing is
  // cheap, and it can never be stale relative to the cache. `null` until
  // load() has produced a inboxPath, same as the old state's null.
  // Memoized on its real inputs (docs/dev/technical-design-render-perf-ab.md
  // §3 B4) - `todayDate` is in the deps so a screen left open over midnight
  // still recomputes.
  const aggregate: DailyAggregate | null = useMemo(
    () =>
      inboxPath !== null
        ? buildDailyAggregate(items, inbox ? {tasks: inbox.tasks, meetings: inbox.meetings} : null, inboxPath)
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- todayDate: recompute after midnight
    [items, inbox, inboxPath, todayDate],
  );

  // Context-tag filter (technical-design-context-tags.md §6) - the same
  // derivation with one extra argument, since `dailyContext` toggles from a
  // plain tag tap with no I/O to wait on. Deliberately never reaches
  // focusMode's own rendering (nowCohort/pickerCandidates/focusMeetings
  // below don't use this) - Daily-only for v1, see the dailyContext state's
  // own doc comment.
  const displayAggregate: DailyAggregate = useMemo(
    () =>
      dailyContext
        ? buildDailyAggregate(
            items,
            inbox ? {tasks: inbox.tasks, meetings: inbox.meetings} : null,
            inboxPath ?? '',
            new Date(),
            dailyContext,
          )
        : aggregate ?? EMPTY_DAILY_AGGREGATE,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- todayDate: recompute after midnight
    [dailyContext, items, inbox, inboxPath, aggregate, todayDate],
  );

  // dailyEntryDate: a multi-day meeting is listed on each day it covers.
  const meetingsToday = displayAggregate.meetings.filter(entry => dailyEntryDate(entry) === todayDate);
  const meetingsTomorrow = displayAggregate.meetings.filter(entry => dailyEntryDate(entry) === tomorrowDate);

  // Row markup itself is the shared ui/TaskRow.tsx (docs/dev/technical-design-
  // inbox-tab.md §1) - this screen just wires its own handlers into it,
  // same as ProjectDataPanel/ReviewScreen/InboxScreen do. No `onFile` here -
  // Daily was never a filing surface (see the module doc comment).
  //
  // `heightPx` (Batch 5, 2026-09-15, docs/dev/technical-design-pagination-
  // fixed-height.md §3.1): passed by renderFlatTaskRow below, computed via
  // taskRowHeight() (Round 6, 2026-09-17 - back to this screen matching
  // ProjectDataPanel's own, proven-working call exactly, see COLUMN_WIDTH_PX's
  // own comment) the same way it's summed for PagedSection's
  // own viewportHeight math, so the rendered row matches exactly what
  // pagination assumed - same height/numberOfLines pairing ui/TaskRow.tsx's
  // own doc comment documents. Left undefined for focus mode's
  // renderFocusTaskEntry below (unpaginated, out of scope for this pass -
  // see this file's module doc comment on focus mode's own ScrollView).
  const renderTaskEntry = (entry: DailyTaskEntry, heightPx?: number) => {
    const key = taskKey(entry);
    return (
      <TaskRow
        key={key}
        task={entry.task}
        isEditing={editTarget?.type === 'task' && editTarget.key === key}
        onStartEdit={() => startTaskEdit(entry)}
        onToggleDone={() => handleToggleDone(entry)}
        onCreateNote={() => handleTaskNote(entry)}
        onOpenNote={() => handleTaskNote(entry)}
        linkedFile={entry.task.linkedFile}
        onOpenLinkedFile={onOpenLinkedFile}
        onToggleNow={() => handleToggleNow(entry)}
        contextTag={dailyContext}
        onToggleContext={toggleContext}
        context="flat"
        height={heightPx}
        numberOfLines={heightPx != null ? taskRowLines(entry.task, COLUMN_WIDTH_PX, 'flat', dailyContext != null) : undefined}
        textColor={textColor}
        borderColor={borderColor}
      />
    );
  };

  /**
   * Focus-mode counterpart of renderTaskEntry above (docs/dev/technical-design-
   * now-focus-mode.md §6) - every task row across the Picker/working/
   * Congratulations states uses this instead. `onStartEdit` is a deliberate
   * no-op: focus mode's task rows aren't editable (out of scope, §8 - edit a
   * #now task from normal Daily instead, where the shared QuickAddWidget
   * instance is already wired for it); `onToggleNow` is only passed in the
   * Picker (allowToggleNow) - state A/B tasks are already #now (or just
   * were), and adding to the set while either of those is showing is
   * explicitly out of scope (§8, "only reachable via the Picker").
   */
  const renderFocusTaskEntry = (
    entry: DailyTaskEntry,
    options: {onToggleDone: () => void; allowToggleNow: boolean},
  ) => {
    const key = taskKey(entry);
    return (
      <TaskRow
        key={key}
        task={entry.task}
        isEditing={false}
        onStartEdit={() => {}}
        onToggleDone={options.onToggleDone}
        onCreateNote={() => handleTaskNote(entry)}
        onOpenNote={() => handleTaskNote(entry)}
        linkedFile={entry.task.linkedFile}
        onOpenLinkedFile={onOpenLinkedFile}
        onToggleNow={options.allowToggleNow ? () => handleToggleNow(entry) : undefined}
        context="flat"
        textColor={textColor}
        borderColor={borderColor}
      />
    );
  };

  /**
   * One flattened Open-tasks row - either a group header (the source
   * Project/Area's name, the one and only "jump to that item" affordance)
   * or a task row, per flattenTaskGroups above (docs/dev/technical-design-
   * pagination-edit-reuse.md §2/§4 - grouped lists flatten into one
   * paginated sequence rather than paging per-group).
   */
  const renderFlatTaskRow = (row: FlatTaskRow) => {
    if (row.kind === 'header') {
      // Rendered at its natural height (no fixed-height box): clipping it to
      // GROUP_HEADER_ROW_PX cut the header text; PagedSection measures the
      // real viewport instead.
      return (
        <Pressable key={`header-${row.item.path}`} onPress={() => openItem(row.item)} hitSlop={8}>
          <Text style={[common.subheading, styles.groupHeading, {color: textColor}]} numberOfLines={1}>
            {row.item.name}
          </Text>
        </Pressable>
      );
    }
    return renderTaskEntry(row.entry, taskRowHeight(row.entry.task, COLUMN_WIDTH_PX, 'flat', dailyContext != null));
  };

  // Row markup itself is the shared ui/MeetingRow.tsx - see renderTaskEntry's
  // comment above. `showSource` is Daily-specific (a row here can belong to
  // a different Project/Area - or Inbox - than its neighbor, unlike
  // ProjectDataPanel/InboxScreen where every row belongs to the same one) -
  // this is also how an Inbox-sourced meeting picks up its "Inbox" source
  // tag and jump-to-Inbox-tab tap target, for free (docs/dev/technical-design-
  // inbox-tab.md §3 - `openItem` already branches on item.kind === 'inbox').
  // Shared by both normal Daily's Calendar column and focus mode's "Coming
  // up" list (§module doc comment) - contextTag/onToggleContext are gated
  // to `!focusMode` here rather than by having two render functions, since
  // the context filter is explicitly Daily-only/never composes with focus
  // mode (technical-design-context-tags.md §2/§10); `dailyContext` itself
  // can in practice never be non-null during a focus-mode mount anyway (see
  // that state's own doc comment), but this keeps the scope explicit rather
  // than relying on that being true.
  // `heightPx` (Batch 6, docs/dev/technical-design-pagination-fixed-height.md
  // §3.2): passed by the Calendar column's Today/Tomorrow PagedSection
  // below, computed via meetingEntryHeight() the same way it's summed for
  // that PagedSection's own rowHeight - same "pass both together" contract
  // renderTaskEntry's own heightPx already follows. Left undefined for focus
  // mode's "Coming up" list further down (unpaginated, stays single-line-
  // via-MeetingRow's-own-default like before this batch).
  // The row and the sizing helpers take this same object (ui/MeetingRow.tsx's
  // MeetingTrackingConfig), so height/lines always agree with the icon the
  // row renders.
  const trackingFor = (entry: DailyMeetingEntry): MeetingTrackingConfig => ({
    rules: settings?.noteCreationDefinitions ?? [],
    onToggle: kind => handleToggleMeetingTracking(entry, kind),
  });

  const renderMeetingEntry = (entry: DailyMeetingEntry, layout: MeetingRowLayout) => {
    const key = meetingKey(entry);
    // The standard row (docs/dev/technical-design-meeting-lists.md §3): source,
    // read-only M (2-line only), tracking, note, open linked file (no
    // linking on Daily - decided 2026-09-27), Daily's context-tag filter.
    return (
      <MeetingRow
        key={`${key}@${entry.span?.date ?? ''}`}
        meeting={entry.meeting}
        span={entry.span}
        layout={layout}
        time="time"
        source={{abbrev: entry.item.abbrev ?? entry.item.name, name: entry.item.name, onPress: () => openItem(entry.item)}}
        highlight="mark"
        tracking={trackingFor(entry)}
        note={{onOpen: () => handleMeetingNote(entry), onCreate: () => handleMeetingNote(entry)}}
        file={{linkedFile: entry.meeting.linkedFile, onOpen: onOpenLinkedFile}}
        onPress={() => startMeetingEdit(entry)}
        state={editTarget?.type === 'meeting' && editTarget.key === key ? 'editing' : undefined}
        contextTag={focusMode ? undefined : dailyContext}
        onToggleContext={focusMode ? undefined : toggleContext}
        textColor={textColor}
        borderColor={borderColor}
      />
    );
  };

  const meetingsShown = calendarTab === 'tomorrow' ? meetingsTomorrow : meetingsToday;
  const taskGroups = groupDailyTasksByItem(displayAggregate.tasks);
  const taskRows = flattenTaskGroups(taskGroups);
  // A genuinely different list each time dailyContext changes (on vs off,
  // or one tag vs another) - not the same list mutating in place, so this
  // resets to page 0 rather than preserving whatever page happened to be
  // showing before (ui/pagination.ts's own resetKey convention).
  const contextResetKey = dailyContext ?? '__off__';

  // Both columns are height-paginated now (ui/PagedSection.tsx, computed
  // inline in the render below) rather than via usePagination - no separate
  // `meetingsPaged`/`tasksPaged` hook needed here any more (Open tasks:
  // Batch 5, 2026-09-15; Calendar's Today/Tomorrow tabs: Batch 6).

  // The task/meeting currently mid-edit, looked up fresh from the aggregate
  // each render (docs/dev/technical-design-pagination-edit-reuse.md §5) - passed
  // into the shared QuickAddWidget's `editingTask`/`editingMeeting` props,
  // which render in its fixed slot instead of inline in the row.
  const editingTaskEntry =
    editTarget?.type === 'task' ? (aggregate?.tasks ?? []).find(e => taskKey(e) === editTarget.key) ?? null : null;
  const editingMeetingEntry =
    editTarget?.type === 'meeting'
      ? (aggregate?.meetings ?? []).find(e => meetingKey(e) === editTarget.key) ?? null
      : null;

  // ui/QuickAddWidget.tsx's `editingItemPath` (feature_abbrev_quick_file,
  // 2026-09-17) - the entry being edited's REAL current location, `null` for
  // the synthetic Inbox item (Inbox never carries an abbreviation, so it can
  // never self-match anyway). Needed because this screen's own
  // `fixedDestination` below is always {type: 'inbox'} regardless of which
  // Project/Area the entry actually lives in - see that prop's own doc
  // comment for why the fallback every other screen relies on is wrong here.
  const editingEntryItem = editingTaskEntry?.item ?? editingMeetingEntry?.item ?? null;
  const editingItemPath = editingEntryItem && editingEntryItem.kind !== 'inbox' ? editingEntryItem.path : null;

  // Read-only linked-file treatment (technical-design-linked-files.md §1/§6
  // - Daily is read-only: a filled clip if a link exists, tap to open, no
  // way to start one from here, so no onArmLink below). linkedFileMissing
  // mirrors screens/ProjectDataPanel.tsx's identical effect.
  const editingLinkedFileItem: Task | Meeting | null = editingTaskEntry?.task ?? editingMeetingEntry?.meeting ?? null;
  const [linkedFileMissing, setLinkedFileMissing] = useState(false);
  useEffect(() => {
    if (!editingLinkedFileItem?.linkedFile || !paths) {
      setLinkedFileMissing(false);
      return;
    }
    let cancelled = false;
    linkedFileStatus(paths, editingLinkedFileItem.linkedFile).then(status => {
      if (!cancelled) setLinkedFileMissing(status === 'missing');
    });
    return () => {
      cancelled = true;
    };
  }, [editingLinkedFileItem?.linkedFile, paths]);

  const onOpenLinkedFile = (linkedFile: string) => {
    if (!paths) return;
    openLinkedFile(paths, linkedFile).catch(e =>
      logError('DailyView: open linked file failed', errorMessage(e)),
    );
  };

  // Focus-mode-only derived values (docs/dev/technical-design-now-focus-mode.md
  // §6) - all pure reads over data this screen already loaded, no new
  // storage query (see storage/dailyAggregate.ts's own doc comments on
  // buildNowEntries/buildFocusCandidateEntries). Left empty when `focusMode`
  // is off so normal Daily never pays for this.
  const nowCohort = focusMode
    ? buildNowEntries(items, inbox ? {tasks: inbox.tasks, meetings: inbox.meetings} : null, inboxPath ?? '')
    : [];
  const pickerCandidates = focusMode ? buildFocusCandidateEntries(items) : [];
  // 4-hour look-ahead (§4/§6's correction), judged against focusEntryNowMs -
  // the instant focus mode was entered, not the live clock (see that
  // state's own declaration above). aggregate.meetings is already scoped to
  // today/tomorrow and cancelled-excluded (buildDailyAggregate) - this just
  // narrows that same list further.
  const focusMeetings = focusMode
    ? (aggregate?.meetings ?? []).filter(entry => {
        const ts = meetingTimestampMs(entry.meeting, new Date(focusEntryNowMs));
        return ts >= focusEntryNowMs && ts - focusEntryNowMs <= 4 * 60 * 60 * 1000;
      })
    : [];
  // Which of the Picker/working/Congratulations states to show (§6) - B wins
  // whenever there's a just-finished cohort to display; otherwise the Picker
  // shows either while still actively picking (pickerMode true - see that
  // state's own declaration above for why this can't just be "nowCohort is
  // empty") or, as a fallback, whenever nowCohort genuinely is empty (covers
  // "Start focus session" pressed with nothing selected, §6: "a no-op
  // session-with-nothing-in-it... falls straight back to this same Picker").
  const focusState: 'picker' | 'working' | 'complete' =
    justCompletedTasks && justCompletedTasks.length > 0
      ? 'complete'
      : pickerMode || nowCohort.length === 0
      ? 'picker'
      : 'working';

  // Stable props for the React.memo'd QuickAddWidget (docs/dev/technical-design-
  // render-perf-ab.md §3 B2). Every callback here is only ever called from
  // the widget's own event handlers, never while it renders, so a stable
  // wrapper that always calls the latest version is safe. Where a callback's
  // presence matters (onSaveEdit*/onQuickFile), the condition stays at the
  // call site below.
  const stableAddTask = useStableCallback(handleAddTask);
  const stableAddMeeting = useStableCallback(handleAddMeeting);
  const stableIsMeetingDateVisible = useStableCallback((date: string) =>
    calendarTab === 'today' ? date === todayDate : calendarTab === 'tomorrow' ? date === tomorrowDate : false,
  );
  const stableSaveEditTask = useStableCallback((nextText: string, nextLinkedFile: string) =>
    editingTaskEntry ? commitTaskEdit(editingTaskEntry, nextText, nextLinkedFile) : Promise.resolve(false),
  );
  const stableSaveEditMeeting = useStableCallback((fields: MeetingQuickAddFields, nextLinkedFile: string) =>
    editingMeetingEntry ? commitMeetingEdit(editingMeetingEntry, fields, nextLinkedFile) : Promise.resolve(false),
  );
  const stableCancelEdit = useStableCallback(cancelEditTarget);
  const stableDeleteEdit = useStableCallback(handleDeleteEditForWidget);
  const stableQuickFileEdit = useStableCallback(handleQuickFileEdit);
  const editingTaskForWidget = useMemo(
    () =>
      editingTaskEntry
        ? {...editingTaskEntry.task, text: displayTaskText(editingTaskEntry.task, 'flat')}
        : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingTaskEntry?.task, editingTaskEntry?.task.text],
  );

  return (
    <View style={common.container}>
      {loading && <ActivityIndicator style={common.spacer} />}

      {!loading && error && (
        <LoadErrorNotice error={error} onRetry={() => load(true)} textColor={textColor} />
      )}

      {!loading && !error && aggregate && focusMode && (
        <View style={styles.focusContent}>
          <ScrollView style={styles.focusColumn} contentContainerStyle={styles.focusColumnContent}>
            {/* Same QuickAddWidget instance normal Daily uses, in pure
                add-only mode - focus mode's task rows never start an edit
                (renderFocusTaskEntry's onStartEdit is a no-op), so
                editingTask/editingMeeting are simply never set on this
                instance (docs/dev/technical-design-now-focus-mode.md §7). Kept
                first, same as normal Daily - design-philosophy.md §8's "the
                one thing you might reach for at any point". */}
            <QuickAddWidget
              fixedDestination={FIXED_INBOX_DESTINATION}
              onAddTask={stableAddTask}
              onAddMeeting={stableAddMeeting}
              initialDate={todayDate}
              textColor={textColor}
              borderColor={borderColor}
              placeholderColor={placeholderColor}
            />
            <View style={[common.divider, {backgroundColor: borderColor}]} />

            {focusState === 'complete' && (
              <>
                <Text style={[styles.sectionTitle, {color: textColor}]}>Congratulations: All tasks done!</Text>
                {groupDailyTasksByItem(justCompletedTasks ?? []).map(group => (
                  <View key={group.item.path}>
                    <Text style={[common.subheading, styles.groupHeading, {color: textColor}]} numberOfLines={1}>
                      {group.item.name}
                    </Text>
                    {group.entries.map(entry =>
                      renderFocusTaskEntry(entry, {onToggleDone: () => handleToggleDone(entry), allowToggleNow: false}),
                    )}
                  </View>
                ))}
                <Pressable onPress={handleCreateNewSession} hitSlop={8} style={[styles.focusPrimaryButton, {borderColor}]}>
                  <Text style={[styles.focusPrimaryButtonText, {color: textColor}]}>Create new session</Text>
                </Pressable>
              </>
            )}

            {focusState === 'working' && (
              <>
                {groupDailyTasksByItem(nowCohort).map(group => (
                  <View key={group.item.path}>
                    <Text style={[common.subheading, styles.groupHeading, {color: textColor}]} numberOfLines={1}>
                      {group.item.name}
                    </Text>
                    {group.entries.map(entry =>
                      renderFocusTaskEntry(entry, {onToggleDone: () => handleFocusToggleDone(entry), allowToggleNow: false}),
                    )}
                  </View>
                ))}
              </>
            )}

            {focusState === 'picker' && (
              <>
                <View style={styles.focusPickerHeader}>
                  <Text style={[common.hint, styles.focusPickerHint, {color: textColor}]}>
                    Double-tap a task to select it, then
                  </Text>
                  <Pressable onPress={handleStartFocusSession} hitSlop={8} style={[styles.focusPrimaryButton, {borderColor}]}>
                    <Text style={[styles.focusPrimaryButtonText, {color: textColor}]}>Start focus session</Text>
                  </Pressable>
                </View>
                {pickerCandidates.length === 0 && (
                  <Text style={[common.hint, {color: textColor}]}>
                    No Next tasks in focused Projects/Areas to pick from.
                  </Text>
                )}
                {groupDailyTasksByItem(pickerCandidates).map(group => (
                  <View key={group.item.path}>
                    <Text style={[common.subheading, styles.groupHeading, {color: textColor}]} numberOfLines={1}>
                      {group.item.name}
                    </Text>
                    {group.entries.map(entry =>
                      renderFocusTaskEntry(entry, {onToggleDone: () => handleToggleDone(entry), allowToggleNow: true}),
                    )}
                  </View>
                ))}
              </>
            )}

            <View style={styles.focusSpacer} />

            {/* Meetings anchored at the bottom (design-philosophy.md §8) -
                same renderMeetingEntry every Calendar-column row already
                uses, just narrowed to focusMeetings' 4-hour window. */}
            {focusMeetings.length > 0 && (
              <View>
                <Text style={[common.subheading, {color: textColor}]}>Coming up</Text>
                {focusMeetings.map(entry => renderMeetingEntry(entry, 'oneLine'))}
              </View>
            )}
          </ScrollView>

          {/* Small, low-key exit mark, bottom-right corner (design-
              philosophy.md §8) - solid-stroke rather than faded, since a
              genuinely low-contrast mark doesn't read reliably on this
              screen's e-ink; quietness here comes from size/placement
              instead. Always ends the session outright (§4.2) - never
              clears #now itself. */}
          <Pressable onPress={onExitFocusMode} hitSlop={12} style={styles.focusExit}>
            <ExitFocusModeIcon color={textColor} />
          </Pressable>
        </View>
      )}

      {!loading && !error && aggregate && !focusMode && (
        <View style={common.content}>
          {/* Display-mode row (docs/dev/technical-design-pagination-fixed-
              height.md §3.1, Batch 5, 2026-09-15) - Daily's own content
              area, top-right, above the two-column body (deliberately not
              the shared ui/TabBar.tsx, which renders on all seven tabs).
              Merges two things that are both "a certain display mode of
              daily page": the context-filter pill (technical-design-
              context-tags.md §6 - inactive: a quiet outline "#", not
              tappable, the only way to set a context is tapping a tag, see
              dailyContext's own doc comment; active: a filled pill naming
              the tag, with its own "✕" to clear) on the left, and the
              "Focus mode" entry button (docs/dev/technical-design-now-focus-
              mode.md §4.1) on the right - confirmed left-to-right order.
              The button used to sit in the Open-tasks column's own
              sectionTitleRow, next to an "Open tasks" label that's now
              ui/PagedSection.tsx's own header instead (see that column's
              render below) - removing that row entirely is what freed the
              button to relocate here. */}
          <View style={styles.contextIndicatorRow}>
            {dailyContext ? (
              <Pressable
                onPress={() => toggleContext(dailyContext)}
                hitSlop={8}
                style={styles.contextPillActive}>
                <Text style={styles.contextPillActiveText}>#{dailyContext}</Text>
                <Text style={styles.contextPillActiveClear}>✕</Text>
              </Pressable>
            ) : (
              <View style={[styles.contextPillInactive, {borderColor}]}>
                <Text style={[styles.contextPillInactiveText, {color: textColor}]}>#</Text>
              </View>
            )}
            {onEnterFocusMode && (
              <Pressable onPress={onEnterFocusMode} hitSlop={8} style={[styles.focusEnterButton, {borderColor}]}>
                <Text style={[styles.focusEnterButtonText, {color: textColor}]}>Focus mode</Text>
              </Pressable>
            )}
          </View>
          <View style={styles.middleRow}>
            <View style={[common.column, common.columnLeft]}>
              {/* Standalone "Calendar" label removed (Batch 6, same call
                  already made for Open tasks/Meetings/WeekView's Meetings
                  column - PagedSection's/GoogleCalendarPanel's own header
                  text says it instead, on the Today/Tomorrow tab's list
                  itself). Flat 3-tab strip (docs/dev/technical-design-
                  pagination-fixed-height.md §3.2) replaces the old nested
                  Meetings/Google MiniTabs + Today/Tomorrow toggle - one
                  `calendarTab` value both tabs' PagedSection/
                  GoogleCalendarPanel can key their own paging off of. */}
              {/* The shared day panel (docs/dev/technical-design-meeting-lists.md
                  §4.1) - same component as the Week/Month day panels, with
                  Daily's Today | Tomorrow | Google tabs and no Close. It
                  self-measures inside `columnScroll`, like the old list. */}
              <View style={styles.columnScroll}>
                <DayMeetingsPanel
                  date={calendarTab === 'tomorrow' ? tomorrowDate : todayDate}
                  entries={meetingsShown}
                  tabs={CALENDAR_TABS}
                  activeTab={calendarTab}
                  onTabChange={setCalendarTab}
                  renderRow={renderMeetingEntry}
                  listResetKey={contextResetKey}
                  emptyHint={`Nothing ${calendarTab === 'tomorrow' ? 'tomorrow' : 'today'}.`}
                  googlePanel={
                    features.googleCalendar ? (
                    <GoogleCalendarPanel
                      maxDays={2}
                      defaultDestination={FIXED_INBOX_DESTINATION}
                      items={items}
                      icsUrl={settings?.googleCalendarIcsUrl ?? ''}
                      inboxPath={inboxPath ?? ''}
                      onOpenSettings={() => onOpenCalendarSettings?.()}
                      textColor={textColor}
                      borderColor={borderColor}
                      placeholderColor={placeholderColor}
                    />
                    ) : null
                  }
                  textColor={textColor}
                  borderColor={borderColor}
                />

              </View>

              {/* Focus/Projects/Areas panel (technical-design-daily-focus-
                  panel.md) - sits directly below Calendar in this same
                  column rather than in its own full-width row below both
                  columns, freeing Open tasks (right column) to use that
                  freed row height instead. No separate section title here -
                  the panel's own MiniTabs row ("Focus" being one of its
                  three tabs) would read as a redundant duplicate heading.
                  `common.spacer` (Batch 6 bugfix) replaces the old
                  `styles.sectionSpacing` reference here - that style was
                  never actually defined (a pre-existing no-op, flagged in
                  Batch 5), so this spacer had silently never applied. */}
              <View style={common.spacer}>
                {paths && (
                  <DailyFocusPanel
                    items={items}
                    projectsPath={paths.projects}
                    areasPath={paths.areas}
                    dailyFocusProjectCount={settings?.dailyFocusProjectCount ?? 0}
                    dailyFocusAreaCount={settings?.dailyFocusAreaCount ?? 0}
                    onOpenItem={onOpenItem}
                    onToggle={handleToggleItemFocus}
                    textColor={textColor}
                    borderColor={borderColor}
                  />
                )}
              </View>
            </View>

            <View style={common.column}>
              <View style={styles.columnScroll}>
                {/* Shared widget sits above this column's own list, on the
                    right side of the screen (2026-09-09, docs/technical-
                    design-unified-quickadd.md - relocated from inside the
                    Calendar column's Meetings sub-tab, per the module doc
                    comment's "One widget for two columns" note). It still
                    handles both this column's task edits and the Calendar
                    column's meeting edits (MeetingRow only renders inside
                    the Meetings sub-tab, but the widget itself is no longer
                    gated behind that sub-tab, so it stays visible and no
                    tab-switch is needed either way). Date defaults to
                    whichever day is currently selected in the Calendar
                    column. Swaps into "editing" mode for
                    editingTaskEntry/editingMeetingEntry (docs/technical-
                    design-pagination-edit-reuse.md §5) instead of ui/
                    TaskRow.tsx/ui/MeetingRow.tsx rendering their own inline
                    form. */}
                <QuickAddWidget
                  layoutKey="daily"
                  fixedDestination={FIXED_INBOX_DESTINATION}
                  onAddTask={stableAddTask}
                  onAddMeeting={stableAddMeeting}
                  initialDate={calendarTab === 'tomorrow' ? tomorrowDate : todayDate}
                  // Only the shown tab's own day is in the list; the Google tab
                  // shows none of this plugin's meetings. Anything else gets
                  // the widget's "where did it go" note (tomorrow / next week /
                  // 09/28). Not passed to the focus-mode widget above: its
                  // list is a 4-hour look-ahead a date cannot express.
                  isMeetingDateVisible={stableIsMeetingDateVisible}
                  editingTask={editingTaskForWidget}
                  editingMeeting={editingMeetingEntry?.meeting}
                  onSaveEditTask={editingTaskEntry ? stableSaveEditTask : undefined}
                  onSaveEditMeeting={editingMeetingEntry ? stableSaveEditMeeting : undefined}
                  editTargetKey={editTarget ? `${editTarget.type}:${editTarget.key}` : null}
                  flushEditRef={flushEditRef}
                  onCancelEdit={stableCancelEdit}
                  onDeleteEdit={stableDeleteEdit}
                  onQuickFile={editTarget ? stableQuickFileEdit : undefined}
                  editingItemPath={editingItemPath}
                  linkedFileMissing={linkedFileMissing}
                  blockedMessage={blockedMessage ?? undefined}
                  textColor={textColor}
                  borderColor={borderColor}
                  placeholderColor={placeholderColor}
                />
                <View style={[common.divider, {backgroundColor: borderColor}]} />

                {/* "Next todos" heading (renamed 2026-09-16, was "Open
                    tasks") + arrows merge into one line here
                    (docs/dev/technical-design-pagination-fixed-height.md §3.1,
                    Batch 5) - replaces the removed sectionTitleRow's
                    standalone label + the old row-count PageControls below
                    the list. Group-header rows (FlatTaskRow's `{kind:
                    'header'}`) stay counted as content for pagination/
                    rowHeight purposes, same as before this batch - but
                    isCountableRow below excludes them from the "+N"
                    hidden-count label itself (2026-09-15 bugfix, see
                    ui/PagedSection.tsx's own module doc comment). */}
                {/* No `viewportHeight`: PagedSection measures itself (flex:1 + onLayout);
                    its parent `columnScroll` is flex:1, which that needs. The measured
                    height is logged as "PagedSection: self-measured viewport". */}
                <PagedSection
                  header="Next todos"
                  rows={taskRows}
                  rowHeight={row => (row.kind === 'header' ? GROUP_HEADER_ROW_PX : taskRowHeight(row.entry.task, COLUMN_WIDTH_PX, 'flat', dailyContext != null))}
                  resetKey={contextResetKey}
                  isCountableRow={row => row.kind === 'entry'}
                  renderRow={renderFlatTaskRow}
                  emptyHint={dailyContext ? `Nothing tagged #${dailyContext}.` : 'Nothing open - inbox zero!'}
                  textColor={textColor}
                  borderColor={borderColor}
                />

                {displayAggregate.failedItems.length > 0 && (
                  <Text style={[common.error, common.sectionSpacingSmall, {color: textColor}]}>
                    ⚠ Couldn't read {displayAggregate.failedItems.length} item(s):{' '}
                    {displayAggregate.failedItems.map(f => f.item.name).join(', ')}
                  </Text>
                )}
              </View>
            </View>
          </View>
        </View>
      )}

    </View>
  );
}

const styles = StyleSheet.create({
  backText: {
    fontSize: FONT.medium,
    marginRight: 16,
  },
  closeButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    marginLeft: 4,
  },
  closeText: {
    fontSize: FONT.medium,
    fontWeight: '600',
  },
  middleRow: {
    flexDirection: 'row',
    flex: 1,
    marginTop: 4,
  },
  columnScroll: {
    flex: 1,
  },
  sectionTitle: {
    fontSize: FONT.medium,
    fontWeight: '600',
    marginBottom: 8,
  },
  // Focus mode (docs/dev/technical-design-now-focus-mode.md §6, design-
  // philosophy.md §8) - one centered column, no TabBar, an exit mark
  // anchored to the whole screen's bottom-right corner. No marginTop here:
  // focusContent sits directly under `container` (paddingTop 16,
  // paddingHorizontal 16) with nothing above it in focus mode - unlike
  // normal Daily's `middleRow`, which follows a header row and so needs its
  // own marginTop:4. Adding one here made the top margin 20px vs 16px on
  // the sides (Tilman, 2026-09-11).
  focusContent: {
    flex: 1,
    position: 'relative',
  },
  focusColumn: {
    flex: 1,
  },
  focusColumnContent: {
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
    paddingBottom: 24,
  },
  // Pushes the meeting card(s) down toward the bottom of the column when
  // there's little else above it, without forcing them there rigidly on a
  // long task list - same flexible-spacer-inside-a-ScrollView's
  // contentContainer approach, harmless as a no-op once content already
  // fills the screen.
  focusSpacer: {
    minHeight: 16,
  },
  focusPickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  focusPickerHint: {
    flex: 1,
    marginBottom: 0,
    marginRight: 12,
  },
  focusPrimaryButton: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  focusPrimaryButtonText: {
    fontSize: FONT.medium,
    fontWeight: '600',
  },
  focusEnterButton: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  focusEnterButtonText: {
    fontSize: FONT.small,
    fontWeight: '600',
  },
  focusExit: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    padding: 8,
  },
  groupHeading: {
    marginTop: 12,
  },
  // Display-mode row (Batch 5) - context pill left, Focus mode button
  // right (confirmed order, docs/dev/technical-design-pagination-fixed-
  // height.md §3.1) - was `justifyContent: 'flex-end'` back when this row
  // held only the pill.
  contextIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  contextPillInactive: {
    width: 24,
    height: 24,
    borderWidth: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contextPillInactiveText: {
    fontSize: FONT.small,
    opacity: 0.5,
  },
  contextPillActive: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  contextPillActiveText: {
    fontSize: FONT.small,
    fontWeight: '600',
    color: '#ffffff',
  },
  contextPillActiveClear: {
    fontSize: FONT.small,
    color: '#ffffff',
    opacity: 0.7,
    marginLeft: 6,
  },
});
