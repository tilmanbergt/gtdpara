/**
 * Weekly Review (docs/dev/history/technical-design-review-hub.md): a hub listing
 * every step with how much is waiting in it and when it was last reviewed
 * (ui/ReviewHub.tsx), and the steps themselves (steps/, one component each,
 * listed in domain/reviewSteps.ts). Each step walks through one place where
 * things quietly go stale, with the cleanup actions right there.
 *
 * Inside a step, "Skip ›" and "Reviewed ›" go to the next step (after the
 * last one: an end page with the recap); only Reviewed stamps the step's
 * review date. "‹ Back" and "Overview" leave with Skip semantics. What is
 * persisted is one record per step (settings.reviewSteps): its last-reviewed
 * date and the recap counts of its last visit (reviewVisit.ts tallies them).
 *
 * This shell owns navigation, the visit record and the hub's numbers. Steps
 * get their data and the shared add-a-task action as props (shared.tsx's
 * ReviewStepProps); a step's own list is frozen while the user is in it
 * (useFrozenStepList.ts).
 *
 * Which page is shown survives a tab switch and reopening the plugin from a
 * note opened in a step (reviewVisit.ts); an app relaunch starts on the hub.
 */
import React, {useEffect, useMemo, useState} from 'react';
import {ActivityIndicator, Pressable, Text, View} from 'react-native';
import {Destination, destinationLabel} from '../../domain/destination';
import {countMeetingsInRange} from '../../domain/meetingSpan';
import {MarkScope} from '../../domain/marks';
import {
  activeReviewSteps,
  applyEmptyStamps,
  applyStepVisit,
  nextReviewStepId,
  prevReviewStepId,
  reviewStepDef,
  ReviewStepId,
  ReviewSummaryCounts,
} from '../../domain/reviewSteps';
import {weekAheadRangeIso} from '../../domain/weekDate';
import {getCachedData, setCachedInbox} from '../../storage/dataCache';
import {getCachedGmailInbox} from '../../storage/gmailInboxCache';
import {addTaskToDestination, buildTask} from '../../storage/itemMutations';
import {loadProjectFile} from '../../storage/projectFile';
import {buildReviewStepCounts, isActionableOpenTask, ReviewItemRef, ReviewProjectEntry} from '../../storage/reviewAggregate';
import {loadSettings, updateReviewSteps} from '../../storage/settingsStorage';
import {FolderEntry} from '../../supernote/fileSystem';
import {common} from '../../ui/commonStyles';
import {useFeatures} from '../../ui/featureStore';
import LoadErrorNotice from '../../ui/LoadErrorNotice';
import {ReviewEnd, ReviewHub} from '../../ui/ReviewHub';
import {useErrorStatus} from '../../ui/status/StatusProvider';
import {useThemeColors} from '../../ui/theme';
import {useOpenMarks} from '../../ui/useOpenMarks';
import {errorMessage} from '../../utils/errorMessage';
import {log, logError} from '../../utils/log';
import {requestEinkRefresh} from '../../utils/screenRefresh';
import {styles} from './reviewStyles';
import {bump, endVisit, getSavedView, rememberView, ReviewView, startVisit} from './reviewVisit';
import {ReviewStepProps} from './shared';
import FocusResetStep from './steps/FocusResetStep';
import GmailStep from './steps/GmailStep';
import InboxStep, {inboxStepEntries} from './steps/InboxStep';
import ItemListStep from './steps/ItemListStep';
import MeetingsCloseOutStep from './steps/MeetingsCloseOutStep';
import UnfocusedNextStep from './steps/UnfocusedNextStep';
import WeekAheadStep from './steps/WeekAheadStep';
import {useReviewData} from './useReviewData';

const ALL_MARKS: MarkScope = {type: 'all'};

interface Props {
  onOpenItem: (kind: 'project' | 'area', entry: FolderEntry) => void;
  /** Called after a step visit (or the hub's empty-step stamps) was written to settings.reviewSteps - App.tsx refreshes the tab badge. */
  onReviewRecorded?: () => void;
  /** Switches to Settings' Calendar sub-tab (Week ahead's Google mini-tab without an ICS URL). */
  onOpenCalendarSettings?: () => void;
  /**
   * Opens the project close-out wizard (docs/dev/technical-design-project-close-
   * out.md §6.1): 'full' from the Done step's "Close out…", 'quick' wherever a
   * Project is archived. When omitted, Projects archive directly.
   */
  onStartCloseOut?: (projectPath: string, mode: 'full' | 'quick') => void;
}

export default function ReviewScreen({onOpenItem, onReviewRecorded, onOpenCalendarSettings, onStartCloseOut}: Props): React.JSX.Element {
  const {textColor, borderColor, placeholderColor} = useThemeColors();
  const data = useReviewData();
  const {items, settings, setSettings, aggregate, inbox, inboxPath, loading, error, load, refreshFromCache} = data;
  // The Gmail step only while the experimental Gmail integration is on.
  const features = useFeatures();
  const activeSteps = useMemo(() => activeReviewSteps(features), [features]);
  // Open marks count toward Inbox to zero.
  const openMarkCount = useOpenMarks(ALL_MARKS).length;

  const [view, setView] = useState<ReviewView>(getSavedView);
  /** Set when recording a step visit / empty stamp failed - shown in the status slot. */
  const [saveError, setSaveError] = useState<string | null>(null);
  useErrorStatus('ReviewScreen.saveError', saveError && `Couldn't save review progress: ${saveError}`, () => setSaveError(null));
  /** Changes on every page change: a step's list selection starts empty again. */
  const [stepEntryToken, setStepEntryToken] = useState(0);

  /**
   * Switches the page and remembers it. Every page change gets an explicit
   * e-ink refresh: without it the panel can keep showing the old page, so a
   * tap reads as "nothing happened" and the next one as "skipped a page".
   */
  const showView = (next: ReviewView) => {
    rememberView(next);
    setView(next);
    setStepEntryToken(t => t + 1);
    requestEinkRefresh();
  };

  // The open step was just hidden (Gmail switched off in Settings → Advanced
  // while this kept-alive screen stood on it): back to the overview.
  const viewHidden = view.kind === 'step' && !activeSteps.some(def => def.id === view.id);
  useEffect(() => {
    if (viewHidden) showView({kind: 'hub'});
  }, [viewHidden]);

  /** Enters a step: a fresh recap tally; the step freezes its list when it mounts. */
  const enterStep = (id: ReviewStepId) => {
    startVisit(id);
    showView({kind: 'step', id});
  };

  /** A frozen Stalled/Neglected entry that picked up an actionable task during the visit (the rule that listed it, so a shelved task doesn't count). */
  const hasActionableOpenTask = (entry: ReviewProjectEntry) => {
    const current = items.find(i => i.path === entry.item.path);
    return !!current && current.tasks.some(isActionableOpenTask);
  };

  /**
   * Leaving the current step ("Reviewed ›", "Skip ›", "‹ Back", "Overview").
   * Turns the visit's tally into the step's record (domain/reviewSteps.ts's
   * applyStepVisit: Reviewed stores date + counts, anything else counts only,
   * and only when non-zero), navigates at once and writes in the background.
   * updateReviewSteps serializes and re-reads the stored settings, so quick
   * taps can't overwrite each other; a failure shows instead of blocking.
   */
  const leaveStep = (reviewed: boolean, target: 'next' | 'previous' | 'hub') => {
    if (view.kind !== 'step') return;
    const id = view.id;
    // A double tap finds the visit already closed by the first tap: ignore it.
    const ended = endVisit(id);
    if (!ended) return;
    const counts: ReviewSummaryCounts = {...ended.counts};
    if (id === 'stalled' || id === 'neglected') {
      const activated = ended.activationCandidates.filter(hasActionableOpenTask).length;
      if (id === 'stalled') counts.projectsActivated = activated;
      else counts.areasActivated = activated;
    }

    const now = new Date();
    if (settings) {
      const optimistic = applyStepVisit(settings.reviewSteps, id, reviewed, counts, now);
      if (optimistic !== settings.reviewSteps) {
        setSettings({...settings, reviewSteps: optimistic});
        updateReviewSteps(steps => applyStepVisit(steps, id, reviewed, counts, now))
          .then(saved => {
            setSaveError(null);
            setSettings(saved);
            onReviewRecorded?.();
          })
          .catch(e => {
            const message = errorMessage(e);
            logError('ReviewScreen: recording step visit failed', id, message);
            setSaveError(message);
            // Show what is really stored rather than the optimistic copy.
            loadSettings().then(setSettings);
          });
      }
    }
    log('ReviewScreen: left step', id, reviewed ? 'reviewed' : 'not reviewed', target);

    const targetId = target === 'next' ? nextReviewStepId(id, activeSteps) : target === 'previous' ? prevReviewStepId(id, activeSteps) : null;
    if (targetId) enterStep(targetId);
    else showView(target === 'next' ? {kind: 'end'} : {kind: 'hub'});
  };

  const openReviewItem = (item: ReviewItemRef) => onOpenItem(item.kind, {name: item.name, path: item.path, isFolder: true});

  /** Every Quick Add on a step (Inbox, an item's detail, a meeting's follow-ups) adds through here. */
  const handleAddTask = async (text: string, destination: Destination): Promise<void> => {
    const {nextInbox} = await addTaskToDestination(buildTask(text), destination, {inbox, inboxPath});
    if (nextInbox) setCachedInbox(nextInbox);
    else refreshFromCache();
    bump('tasksAdded');
    log('ReviewScreen: added task', destinationLabel(destination));
    requestEinkRefresh();
  };

  /** Week ahead edits through its own planning hook; on leaving it, re-read what it may have changed. */
  const reloadAfterWeekAhead = () => {
    refreshFromCache();
    const cache = getCachedData();
    if (!cache) return;
    loadProjectFile('inbox', cache.paths.inboxFolder)
      .then(setCachedInbox)
      .catch(e => logError('ReviewScreen: inbox reload after week ahead failed', errorMessage(e)));
  };

  // The hub's per-step numbers, from the same aggregate the steps read.
  const inboxEntries = inboxStepEntries(inbox);
  const week = weekAheadRangeIso();
  const stepCounts =
    aggregate && settings
      ? buildReviewStepCounts(
          aggregate,
          inboxEntries.openTasks.length + inboxEntries.openMeetings.length + openMarkCount,
          items,
          settings,
          getCachedGmailInbox()?.length ?? 0,
          countMeetingsInRange(inbox?.meetings ?? [], week.start, week.end),
        )
      : null;
  // Backlog steps with nothing in them, as a string so the effect below only runs when that set changes.
  const emptyBacklogKey = stepCounts
    ? activeSteps
        .filter(def => def.kind === 'backlog' && stepCounts[def.id].n === 0)
        .map(def => def.id)
        .join(',')
    : null;

  /**
   * Keeps settings.reviewSteps' `emptyAt` stamps in line with the hub (the
   * tab badge in App.tsx has no aggregate to ask). Runs only on the hub and
   * writes only when applyEmptyStamps changes something (at most once a day
   * per empty step), so it settles after one pass.
   */
  useEffect(() => {
    if (view.kind !== 'hub' || loading || emptyBacklogKey === null || !settings) return;
    const emptyIds = emptyBacklogKey === '' ? [] : (emptyBacklogKey.split(',') as ReviewStepId[]);
    const now = new Date();
    if (applyEmptyStamps(settings.reviewSteps, emptyIds, now, activeSteps) === settings.reviewSteps) return;
    updateReviewSteps(steps => applyEmptyStamps(steps, emptyIds, now, activeSteps))
      .then(saved => {
        setSettings(saved);
        onReviewRecorded?.();
      })
      .catch(e => logError('ReviewScreen: empty-step stamp failed', errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the hub's empty set or the stored steps change
  }, [view, loading, emptyBacklogKey, settings?.reviewSteps]);

  const stepProps: ReviewStepProps = {
    data,
    stepEntryToken,
    onOpenItem: openReviewItem,
    onAddTask: handleAddTask,
    textColor,
    borderColor,
    placeholderColor,
  };

  // A switch over every step id: the compiler insists a new step in
  // domain/reviewSteps.ts gets a renderer here.
  const renderStep = (id: ReviewStepId): React.ReactNode => {
    switch (id) {
      case 'weekAhead':
        return (
          <View style={styles.weekAheadRoot}>
            <WeekAheadStep
              onOpenItem={onOpenItem}
              onOpenCalendarSettings={onOpenCalendarSettings}
              onLeave={reloadAfterWeekAhead}
              textColor={textColor}
              borderColor={borderColor}
              placeholderColor={placeholderColor}
            />
          </View>
        );
      case 'meetingsCloseOut':
        return <MeetingsCloseOutStep {...stepProps} />;
      case 'gmailInbox':
        return <GmailStep {...stepProps} />;
      case 'inbox':
        return <InboxStep {...stepProps} />;
      case 'stalled':
      case 'done':
      case 'onHold':
      case 'neglected':
        return <ItemListStep key={id} step={id} onStartCloseOut={onStartCloseOut} {...stepProps} />;
      case 'unfocusedNext':
        return <UnfocusedNextStep {...stepProps} />;
      case 'weeklyFocus':
        return <FocusResetStep {...stepProps} />;
    }
  };

  const renderStepNav = (id: ReviewStepId): React.JSX.Element => {
    const position = activeSteps.findIndex(def => def.id === id) + 1;
    return (
      <View style={[styles.stepNavRow, {borderColor}]}>
        <View style={styles.stepNavGroup}>
          <Pressable onPress={() => leaveStep(false, 'previous')} hitSlop={8}>
            <Text style={[styles.stepNavText, {color: textColor}]}>‹ Back</Text>
          </Pressable>
          <Pressable style={styles.stepNavGap} onPress={() => leaveStep(false, 'hub')} hitSlop={8}>
            <Text style={[styles.stepNavText, {color: textColor}]}>Overview</Text>
          </Pressable>
        </View>
        <Text style={[styles.stepTitle, {color: textColor}]}>
          Step {position} of {activeSteps.length} — {reviewStepDef(id).title}
        </Text>
        <View style={styles.stepNavGroup}>
          <Pressable onPress={() => leaveStep(false, 'next')} hitSlop={8}>
            <Text style={[styles.stepNavText, {color: textColor}]}>Skip ›</Text>
          </Pressable>
          <Pressable style={[styles.stepNavGap, styles.stepNavPrimary, {borderColor: textColor}]} onPress={() => leaveStep(true, 'next')} hitSlop={8}>
            <Text style={[styles.stepNavText, styles.stepNavPrimaryText, {color: textColor}]}>Reviewed ›</Text>
          </Pressable>
        </View>
      </View>
    );
  };

  return (
    <View style={common.container}>
      {loading && <ActivityIndicator style={common.spacer} />}

      {!loading && error && <LoadErrorNotice error={error} onRetry={() => load(true)} textColor={textColor} />}

      {!loading && !error && aggregate && settings && stepCounts && (
        <View style={common.content}>
          {view.kind === 'step' && renderStepNav(view.id)}
          <View style={styles.stepScroll}>
            {view.kind === 'step' && renderStep(view.id)}
            {view.kind === 'hub' && (
              <ReviewHub
                steps={settings.reviewSteps}
                counts={stepCounts}
                now={new Date()}
                onOpenStep={enterStep}
                stepDefs={activeSteps}
                textColor={textColor}
                borderColor={borderColor}
              />
            )}
            {view.kind === 'end' && (
              <ReviewEnd
                steps={settings.reviewSteps}
                counts={stepCounts}
                now={new Date()}
                onOverview={() => showView({kind: 'hub'})}
                stepDefs={activeSteps}
                textColor={textColor}
                borderColor={borderColor}
              />
            )}
          </View>
        </View>
      )}
    </View>
  );
}
