/**
 * Everything the Week and Month planning screens share that isn't layout
 * (docs/dev/technical-design-monthly-view.md §5.10) - extracted verbatim from
 * screens/WeekView.tsx so screens/MonthView.tsx doesn't carry a second copy:
 * loading settings/cache/Inbox and every
 * meeting action a planning screen offers (add, edit, cancel, quick-file,
 * prep/review tick, note, linked file, Month highlight + short form) plus
 * the focus toggle and goal save for either period scope.
 *
 * Deliberately screen-agnostic about WHICH meetings are listed: actions take
 * the entry they act on (`WeeklyMeetingEntry` - source item + index +
 * meeting, the same shape both aggregates produce), and the screen resolves
 * its own `editingKey` against its own list via `meetingKey`.
 */
import {useCallback, useEffect, useState} from 'react';
import {AbbrevFileMatch} from '../domain/abbrev';
import {Destination, destinationLabel} from '../domain/destination';
import {MeetingTrackingKind, toggleMeetingTrackingAt} from '../domain/meetingTracking';
import {isHighlight, setHighlight} from '../domain/monthHighlight';
import {deriveMeetingFields} from '../domain/markdown';
import {PeriodScope} from '../domain/period';
import {GtdParaSettings, ResolvedParaPaths} from '../domain/settings';
import {Meeting} from '../domain/types';
import {CachedItem, getCachedData, getCachedInbox, rebuildCache, setCachedInbox} from '../storage/dataCache';
import {FocusScope, toggleItemFocus} from '../storage/focusSlots';
import {appendMeetingToTarget} from '../storage/inboxFiling';
import {moveEntryWithNote} from '../storage/entryMove';
import {useEntryMoveUi} from '../ui/useEntryMoveUi';
import {
  addMeetingToDestination,
  addTaskToDestination,
  applyMeetingEdit,
  buildMeeting,
  buildTask,
  mutateEntryMeetings,
} from '../storage/itemMutations';
import {linkedFileStatus, openLinkedFile} from '../storage/linkedFiles';
import {openOrCreateMeetingNote} from '../storage/meetingNoteContent';
import {useNoteCreateConfirm} from '../ui/useNoteCreateConfirm';
import {saveItemGoal} from '../storage/periodGoals';
import {loadProjectFile} from '../storage/projectFile';
import {loadSettings} from '../storage/settingsStorage';
import {WeeklyMeetingEntry} from '../storage/weeklyAggregate';
import {log, logError} from '../utils/log';
import {requestEinkRefresh, useEinkRefreshOnLoad} from '../utils/screenRefresh';
import {MeetingRowLayout, MeetingRowProps, MeetingTrackingConfig} from '../ui/MeetingRow';
import {entryDate} from '../domain/meetingSpan';
import {MeetingQuickAddFields, QuickFilePayload} from '../ui/QuickAddWidget';
import {useCachedItems} from '../ui/useCachedItems';
import {useEditFlush} from '../ui/useEditFlush';
import {perfEnd, perfStart} from '../utils/perf';
import {useStableCallback} from '../ui/useStableCallback';
import {useOnScreenShow} from '../ui/screenActivity';
import {todayIso} from '../domain/meetingTime';
import {useActionError} from '../ui/useActionError';
import {errorMessage} from '../utils/errorMessage';
import {useCachedInbox} from '../ui/useCachedInbox';

/** Stable identity of one listed meeting (source file + index) - what `editingKey` holds. */
export const meetingKey = (entry: WeeklyMeetingEntry) => `${entry.item.path}#${entry.meetingIndex}`;

interface Options {
  /** Log prefix, e.g. "WeekView". */
  logTag: string;
}

export function usePlanningScreen({logTag}: Options) {
  // Live view of storage/dataCache.ts - re-renders on every cache mutation,
  // so nothing here needs a manual "refresh after save" step.
  const items = useCachedItems();
  const confirmNoteCreate = useNoteCreateConfirm(`${logTag}.noteCreateConfirm`);
  // Moving a meeting with a note: confirm, the note moves along (technical-design-files-0.6.md §3.4).
  const moveUi = useEntryMoveUi(logTag);
  const [settings, setSettings] = useState<GtdParaSettings | null>(null);
  const [inboxPath, setInboxPath] = useState<string | null>(null);
  const [paths, setPaths] = useState<ResolvedParaPaths | null>(null);
  // The shared Inbox (storage/dataCache.ts, technical-design-files-0.6.md §3.3) - setCachedInbox writes it for every screen.
  const inbox = useCachedInbox();
  const [loading, setLoading] = useState(true);
  useEinkRefreshOnLoad(loading);
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  // Both go to the central status slot (docs/dev/technical-design-status-slot.md §7.4)
  // - the Week/Month screens no longer render them inline.
  const widgetAction = useActionError('planning.widgetError', `${logTag}: widget action failed`);
  const meetingsAction = useActionError('planning.meetingsActionError', `${logTag}: meeting action failed`);
  const widgetError = widgetAction.error;
  const meetingsActionError = meetingsAction.error;

  const load = useCallback(
    async (forceRebuild: boolean) => {
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
        logError(`${logTag}: load failed`, message);
        setError(message);
      } finally {
        perfEnd('screen:load', perfToken, {screen: logTag, forceRebuild});
        setLoading(false);
      }
    },
    [logTag],
  );

  useEffect(() => {
    load(false);
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
        logError(`${logTag}: quiet reload on show failed`, errorMessage(e));
      }
    })();
  });

  /** Resolves true on success, false when it failed (error shown) - Quick Add's save-then-switch needs to know (ui/useEditFlush.ts). */
  const runWidgetSave = widgetAction.runSave;
  const runWidgetAction = (fn: () => Promise<void>): Promise<void> => runWidgetSave(fn).then(() => undefined);

  const runMeetingAction = meetingsAction.run;

  /** Re-fetches `entry`'s own source item/Inbox fresh, applies `mutate`, and write-throughs (storage/itemMutations.ts). An Inbox write hands back the new Inbox state; a Project/Area write goes through the cache, which re-renders the screen itself. */
  const saveEntryMeetings = async (
    entry: WeeklyMeetingEntry,
    mutate: (meetings: Meeting[]) => Meeting[],
  ): Promise<void> => {
    const {nextInbox} = await mutateEntryMeetings(entry, mutate, {inbox, inboxPath});
    if (nextInbox) setCachedInbox(nextInbox);
  };

  const handleAddTask = async (text: string, destination: Destination): Promise<void> => {
    const {nextInbox} = await addTaskToDestination(buildTask(text), destination, {inbox, inboxPath});
    if (nextInbox) setCachedInbox(nextInbox);
    log(`${logTag}: added task`, destinationLabel(destination));
  };

  const handleAddMeeting = async (fields: MeetingQuickAddFields, destination: Destination): Promise<void> => {
    const {nextInbox} = await addMeetingToDestination(buildMeeting(fields), destination, {inbox, inboxPath});
    if (nextInbox) setCachedInbox(nextInbox);
    log(`${logTag}: added meeting`, destinationLabel(destination));
  };

  // Save-then-switch (docs/dev/technical-design-meeting-lists.md §10, 2026-09-29):
  // every change of the edit target first saves the current meeting's
  // pending changes in Quick Add (only if something changed); a failed save
  // keeps the edit where it is. The screen passes `flushEditRef` and
  // `editingKey` to its QuickAddWidget.
  const {flushEditRef, afterSave} = useEditFlush();
  const startMeetingEdit = (entry: WeeklyMeetingEntry) => afterSave(() => setEditingKey(meetingKey(entry)));
  const cancelEditTarget = () => setEditingKey(null);

  const commitMeetingEdit = (entry: WeeklyMeetingEntry, fields: MeetingQuickAddFields, nextLinkedFile: string): Promise<boolean> =>
    runWidgetSave(async () => {
      await saveEntryMeetings(entry, meetings => {
        meetings[entry.meetingIndex] = applyMeetingEdit(meetings[entry.meetingIndex], fields, nextLinkedFile);
        return meetings;
      });
      cancelEditTarget();
    });

  const handleCancelMeeting = (entry: WeeklyMeetingEntry) =>
    runWidgetAction(async () => {
      await saveEntryMeetings(entry, meetings => {
        meetings[entry.meetingIndex] = {...meetings[entry.meetingIndex], cancelled: true};
        return meetings;
      });
      cancelEditTarget();
    });

  /**
   * Quick Add's onQuickFile in meeting-edit mode - "Save, but file
   * elsewhere" (see WeekView's former handleQuickFileEdit doc comment, moved
   * here unchanged): builds the updated meeting from the widget's composed
   * payload, appends it to the target, then removes the original. Must
   * reject (not swallow) on failure so the widget shows the error inline.
   */
  const handleQuickFileEdit = async (
    entry: WeeklyMeetingEntry,
    target: AbbrevFileMatch,
    payload: QuickFilePayload,
  ): Promise<void> => {
    if (payload.kind !== 'meeting') return;
    const updated = applyMeetingEdit(entry.meeting, payload.fields, payload.linkedFile);
    const moved = await moveEntryWithNote({entry: updated, entryKind: 'meeting', sourceFolder: entry.item.path, target}, moveUi, async next => {
      await appendMeetingToTarget(target, next);
      await saveEntryMeetings(entry, meetings => meetings.filter((_, index) => index !== entry.meetingIndex));
    });
    if (moved) cancelEditTarget(); // cancelled in the note confirm: stay in edit mode
  };

  /** The row's prep/review checkpoint icon (docs/dev/technical-design-meeting-tracking.md). */
  const handleToggleMeetingTracking = (entry: WeeklyMeetingEntry, kind: MeetingTrackingKind) =>
    runMeetingAction(async () => {
      await saveEntryMeetings(entry, meetings => toggleMeetingTrackingAt(meetings, entry.meetingIndex, kind));
      requestEinkRefresh();
    });

  /** Create-or-open the meeting's note (storage/meetingNoteContent.ts) and persist a changed notePath. */
  const handleMeetingNote = (entry: WeeklyMeetingEntry) =>
    runMeetingAction(async () => {
      const currentSettings = settings ?? (await loadSettings());
      const {meeting, changed} = await openOrCreateMeetingNote(entry.meeting, entry.item.path, currentSettings, null, {
        confirmCreate: confirmNoteCreate,
      });
      if (changed) {
        await saveEntryMeetings(entry, meetings => {
          meetings[entry.meetingIndex] = meeting;
          return meetings;
        });
      }
    });

  const onOpenLinkedFile = (linkedFile: string) => {
    if (!paths) return;
    openLinkedFile(paths, linkedFile).catch(e =>
      logError(`${logTag}: open linked file failed`, errorMessage(e)),
    );
  };

  /** Flips a meeting's Month highlight (`#monthly`) in place - the Month day panel's "M" box (docs/dev/technical-design-monthly-view.md §5.9). */
  const toggleHighlight = (entry: WeeklyMeetingEntry) =>
    runMeetingAction(async () => {
      await saveEntryMeetings(entry, meetings => {
        const current = meetings[entry.meetingIndex];
        if (!current) return meetings;
        const title = setHighlight(current.title, !isHighlight(current));
        meetings[entry.meetingIndex] = {...current, title, ...deriveMeetingFields(title)};
        return meetings;
      });
      requestEinkRefresh();
    });

  /** Adds/removes `item` from `scope` focus - storage/focusSlots.ts's toggleItemFocus (limit check included). */
  const toggleFocus = useCallback(
    async (item: CachedItem, scope: FocusScope, value: boolean): Promise<void> => {
      const currentSettings = settings ?? (await loadSettings());
      await toggleItemFocus(items, item, scope, value, currentSettings);
      log(`${logTag}: ${scope} focus toggled`, item.path, value);
    },
    [items, settings, logTag],
  );

  /** Sets (or, for empty `text`, clears) `item`'s goal for period `key` - storage/periodGoals.ts's saveItemGoal. */
  const saveGoal = useCallback(
    async (item: CachedItem, scope: PeriodScope, key: string, text: string): Promise<void> => {
      await saveItemGoal(item, scope, key, text);
      log(`${logTag}: ${scope} goal saved`, item.path, key);
    },
    [logTag],
  );

  const trackingFor = (entry: WeeklyMeetingEntry): MeetingTrackingConfig => ({
    rules: settings?.noteCreationDefinitions ?? [],
    onToggle: kind => handleToggleMeetingTracking(entry, kind),
  });

  // --- Day panel (docs/dev/technical-design-meeting-lists.md §2.8) -------------
  // Shared by Week, Month and Review's week ahead: which day's panel is open
  // on the right (null = the focus panel), plus the three ways to get there.
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  /** Day header / day row tapped: toggles that day's panel; cancels any edit. */
  const selectDay = (date: string) =>
    afterSave(() => {
      setSelectedDate(prev => (prev === date ? null : date));
      setEditingKey(null);
    });
  /** Week chip tapped: opens that meeting's day and puts the meeting into Quick Add's edit mode. */
  const openMeetingFromGrid = (entry: WeeklyMeetingEntry) =>
    afterSave(() => {
      setSelectedDate(entryDate(entry));
      setEditingKey(meetingKey(entry));
    });
  /** Closes the day panel (Close, or changing week/month - `then` runs after the pending edit was saved). */
  const closeDayPanel = (then?: () => void) =>
    afterSave(() => {
      setSelectedDate(null);
      setEditingKey(null);
      then?.();
    });

  /**
   * The planning day panel's row (2-line by default): M toggle, tracking,
   * note, open linked file (no linking here - decided 2026-09-27), source.
   * Spread onto <MeetingRow key=... {...dayRowProps(...)} />.
   */
  const dayRowProps = (
    entry: WeeklyMeetingEntry,
    layout: MeetingRowLayout,
    opts: {onOpenSource: (item: WeeklyMeetingEntry['item']) => void; textColor: string; borderColor: string},
  ): MeetingRowProps => ({
    meeting: entry.meeting,
    span: entry.span,
    layout,
    time: 'time',
    source: {abbrev: entry.item.abbrev ?? entry.item.name, name: entry.item.name, onPress: () => opts.onOpenSource(entry.item)},
    highlight: 'toggle',
    onToggleHighlight: () => toggleHighlight(entry),
    tracking: trackingFor(entry),
    note: {onOpen: () => handleMeetingNote(entry), onCreate: () => handleMeetingNote(entry)},
    file: {linkedFile: entry.meeting.linkedFile, onOpen: onOpenLinkedFile},
    onPress: () => startMeetingEdit(entry),
    state: editingKey === meetingKey(entry) ? 'editing' : undefined,
    textColor: opts.textColor,
    borderColor: opts.borderColor,
  });

  const stableAddTask = useStableCallback(handleAddTask);
  const stableAddMeeting = useStableCallback(handleAddMeeting);
  const stableCancelEditTarget = useStableCallback(cancelEditTarget);
  const stableCommitMeetingEdit = useStableCallback(commitMeetingEdit);
  const stableCancelMeeting = useStableCallback(handleCancelMeeting);
  const stableQuickFileEdit = useStableCallback(handleQuickFileEdit);

  return {
    items,
    settings,
    inboxPath,
    paths,
    inbox,
    loading,
    error,
    load,
    editingKey,
    widgetError,
    meetingsActionError,
    // Stable identities (docs/dev/technical-design-render-perf-ab.md §3 B2) -
    // these reach the React.memo'd QuickAddWidget/PeriodFocusPanel and are
    // only ever called from event handlers; each call runs the latest version.
    handleAddTask: stableAddTask,
    handleAddMeeting: stableAddMeeting,
    startMeetingEdit,
    cancelEditTarget: stableCancelEditTarget,
    commitMeetingEdit: stableCommitMeetingEdit,
    handleCancelMeeting: stableCancelMeeting,
    handleQuickFileEdit: stableQuickFileEdit,
    handleMeetingNote,
    onOpenLinkedFile,
    toggleHighlight,
    toggleFocus,
    saveGoal,
    trackingFor,
    selectedDate,
    selectDay,
    openMeetingFromGrid,
    closeDayPanel,
    dayRowProps,
    flushEditRef,
  };
}

/** A list key for a (possibly multi-day) entry - unique per covered day. */
export const dayEntryKey = (entry: WeeklyMeetingEntry) => `${meetingKey(entry)}@${entry.span?.date ?? ''}`;

/** Whether the linked file of the meeting being edited is missing on disk - Quick Add's `linkedFileMissing` prop. */
export function useLinkedFileMissing(linkedFile: string | undefined, paths: ResolvedParaPaths | null): boolean {
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    if (!linkedFile || !paths) {
      setMissing(false);
      return;
    }
    let cancelled = false;
    linkedFileStatus(paths, linkedFile).then(status => {
      if (!cancelled) setMissing(status === 'missing');
    });
    return () => {
      cancelled = true;
    };
  }, [linkedFile, paths]);
  return missing;
}
