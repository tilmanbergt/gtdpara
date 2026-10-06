/**
 * Review step "Meetings to close out": past meetings whose Tag Rule asks for
 * a review afterwards and that aren't `#reviewed` yet (storage/
 * reviewAggregate.ts's meetingsToClose, last REVIEW_LOOKBACK_DAYS days).
 * Ticking "reviewed" keeps the meeting listed with a checkmark until the
 * step is left (useFrozenStepList).
 */
import React, {useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {Destination} from '../../../domain/destination';
import {isContextTag} from '../../../domain/flowState';
import {todayIso} from '../../../domain/meetingTime';
import {meetingDisplayTitle, REVIEW_LOOKBACK_DAYS, resolveMeetingTracking, toggleMeetingTracking} from '../../../domain/meetingTracking';
import {Meeting} from '../../../domain/types';
import {CachedItem, findCachedItem, updateItemMeetings} from '../../../storage/dataCache';
import {MeetingRelevantTodo, relatedItemsFor} from '../../../storage/meetingNoteAggregate';
import {refreshMeetingNoteBlock} from '../../../storage/meetingNoteContent';
import {resolveNotePath} from '../../../storage/noteLinks';
import {saveMeetings} from '../../../storage/projectFile';
import {ReviewItemRef, ReviewMeetingEntry} from '../../../storage/reviewAggregate';
import {loadSettings} from '../../../storage/settingsStorage';
import {openPath} from '../../../supernote/fileSystem';
import {log} from '../../../utils/log';
import {requestEinkRefresh} from '../../../utils/screenRefresh';
import MeetingRow, {MEETING_ROW_HEIGHT, MeetingRowLayout} from '../../../ui/MeetingRow';
import {LayoutSwitch} from '../../../ui/MeetingList';
import {useListLayout} from '../../../ui/listLayout';
import QuickAddWidget from '../../../ui/QuickAddWidget';
import ReviewMasterDetail from '../../../ui/ReviewMasterDetail';
import {common} from '../../../ui/commonStyles';
import {useErrorStatus} from '../../../ui/status/StatusProvider';
import {errorMessage} from '../../../utils/errorMessage';
import {formatDateTime} from '../../../domain/dateFormat';
import {styles} from '../reviewStyles';
import {noopAddMeeting, reviewCurrentItem, ReviewEmptyDetail, ReviewStepProps} from '../shared';
import {bump} from '../reviewVisit';
import {useFrozenStepList} from '../useFrozenStepList';



/**
 * A close-out list row (docs/dev/history/technical-design-meeting-lists.md §3): the
 * standard MeetingRow as a selector - date+time column, the item as source,
 * no actions (the master-detail shell owns the tap). Reads the meeting and the
 * item's abbreviation from the live cache so an edit in the detail shows.
 */
function CloseOutMeetingRow({
  entry,
  items,
  layout,
  state,
  textColor,
  borderColor,
}: {
  entry: ReviewMeetingEntry;
  items: CachedItem[];
  layout: MeetingRowLayout;
  state?: 'selected' | 'done';
  textColor: string;
  borderColor: string;
}): React.JSX.Element {
  const current = reviewCurrentItem(entry.item, items);
  return (
    <MeetingRow
      meeting={current.meetings[entry.meetingIndex] ?? entry.meeting}
      layout={layout}
      time="dateTime"
      source={{abbrev: current.abbrev ?? entry.item.name, name: entry.item.name}}
      state={state}
      textColor={textColor}
      borderColor={borderColor}
    />
  );
}

/** Stable identity of a meetings-to-close-out entry - item path + index into that item's full meetings array (same convention as every ReviewMeetingEntry consumer). */
function closeOutKey(entry: ReviewMeetingEntry): string {
  return `${entry.item.path}#${entry.meetingIndex}`;
}

// Cap on the related-todos list in the close-out detail panel - a detail
// column has no scroll on this device, so a long list would push the panel's
// own actions off screen. The remainder is summarised as "+N more".
const CLOSE_OUT_RELATED_LIMIT = 5;

/**
 * Meetings-to-close-out detail panel: what the meeting was, the one action
 * this step exists for (mark reviewed - toggles back if tapped again), the
 * note if there is one, a task-only quick-add fixed to the meeting's own
 * Project/Area for the follow-ups, and the open todos that share the
 * meeting's context tags (storage/meetingNoteAggregate.ts's relatedItemsFor -
 * the same match the meeting's note block lists), so results can be checked
 * against what's already captured.
 */
function MeetingCloseOutDetail({
  entry,
  meeting,
  reviewed,
  related,
  onOpenItem,
  onToggleReviewed,
  onOpenNote,
  onAddTask,
  textColor,
  borderColor,
  placeholderColor,
}: {
  entry: ReviewMeetingEntry;
  meeting: Meeting;
  reviewed: boolean;
  related: MeetingRelevantTodo[];
  onOpenItem: (item: ReviewItemRef) => void;
  onToggleReviewed: (entry: ReviewMeetingEntry) => Promise<void>;
  onOpenNote: (entry: ReviewMeetingEntry) => Promise<void>;
  onAddTask: (text: string, destination: Destination) => Promise<void>;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}): React.JSX.Element {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useErrorStatus('ReviewScreen.error', error, () => setError(null));

  const runAction = (fn: () => Promise<void>) => {
    setError(null);
    setPending(true);
    fn()
      .catch(e => setError(errorMessage(e)))
      .finally(() => setPending(false));
  };

  const destination: Destination = {type: 'item', kind: entry.item.kind, name: entry.item.name, path: entry.item.path};
  const shownRelated = related.slice(0, CLOSE_OUT_RELATED_LIMIT);

  return (
    <View>
      <Text style={[styles.cardTitle, {color: textColor}]}>{meetingDisplayTitle(meeting)}</Text>
      <Pressable onPress={() => onOpenItem(entry.item)} hitSlop={8}>
        <Text style={[common.rowSource, {color: textColor}]}>
          {formatDateTime(meeting.date, meeting.time, todayIso())} — {entry.item.name}
          {entry.item.kind === 'area' ? ' (Area)' : ''}
        </Text>
      </Pressable>
      <View style={styles.pillRow}>
        <Pressable
          style={[styles.pill, {borderColor}, reviewed && styles.pillActive]}
          disabled={pending}
          onPress={() => runAction(() => onToggleReviewed(entry))}
          hitSlop={8}>
          <Text style={[styles.pillText, {color: textColor}]}>{reviewed ? '✓ Reviewed (tap to undo)' : 'Mark reviewed'}</Text>
        </Pressable>
        {!!meeting.notePath && (
          <Pressable
            style={[styles.pill, {borderColor}]}
            disabled={pending}
            onPress={() => runAction(() => onOpenNote(entry))}
            hitSlop={8}>
            <Text style={[styles.pillText, {color: textColor}]}>Open note</Text>
          </Pressable>
        )}
      </View>
      <View style={[common.divider, {backgroundColor: borderColor}]} />
      <QuickAddWidget
        fixedDestination={destination}
        taskOnly
        onAddTask={onAddTask}
        onAddMeeting={noopAddMeeting}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
      <Text style={[styles.sectionLabel, {color: textColor}]}>Related open todos</Text>
      {shownRelated.length === 0 ? (
        <Text style={[common.hint, {color: textColor}]}>None share this meeting's tags.</Text>
      ) : (
        <View style={common.sectionSpacingSmall}>
          {shownRelated.map((r, i) => (
            <Text key={`${r.item.path}#${i}`} style={[styles.rowText, {color: textColor}]}>
              • {r.task.text} — {r.item.name}
            </Text>
          ))}
          {related.length > shownRelated.length && (
            <Text style={[common.hint, {color: textColor}]}>+{related.length - shownRelated.length} more</Text>
          )}
        </View>
      )}
    </View>
  );
}

export default function MeetingsCloseOutStep({
  data,
  stepEntryToken,
  onOpenItem,
  onAddTask,
  textColor,
  borderColor,
  placeholderColor,
}: ReviewStepProps): React.JSX.Element {
  const {items, settings, inbox, aggregate, refreshFromCache} = data;
  const frozen = useFrozenStepList(aggregate?.meetingsToClose, stepEntryToken);
  // 1-line/2-line switch like every meeting list (session-only, ui/listLayout.ts).
  const [closeOutLayout, setCloseOutLayout] = useListLayout('reviewCloseOut', 'twoLine');

  /**
   * Meetings-to-close-out step: ticks (or un-ticks) `#reviewed` on the
   * meeting's CURRENT copy in the cache (not the frozen entry's, which may be
   * a render behind) via domain/meetingTracking.ts's toggleMeetingTracking -
   * the same mutator the Daily row icon uses - then the usual saveMeetings +
   * updateItemMeetings write-through. Ticking marks the row acted-on
   * (checkmarked, stays listed, reopenable); un-ticking clears that again.
   */
  const handleToggleCloseOutReviewed = async (entry: ReviewMeetingEntry): Promise<void> => {
    const cachedItem = findCachedItem(entry.item.path);
    const current = cachedItem?.meetings[entry.meetingIndex];
    if (!cachedItem || !current) {
      throw new Error(`"${meetingDisplayTitle(entry.meeting)}" changed on disk - Settings → Advanced → Reload all files.`);
    }
    const wasReviewed = resolveMeetingTracking(current, settings?.tagRules ?? [])?.done ?? false;
    const nextMeetings = cachedItem.meetings.slice();
    nextMeetings[entry.meetingIndex] = toggleMeetingTracking(current, 'review');
    const nextRaw = await saveMeetings(entry.item.kind, entry.item.path, cachedItem.rawContent, nextMeetings, cachedItem.meetingExtraLines);
    updateItemMeetings(entry.item.path, nextRaw, nextMeetings, cachedItem.meetingExtraLines);
    log('ReviewScreen: meeting review toggled', entry.item.path, entry.meetingIndex, !wasReviewed);
    refreshFromCache();
    bump('meetingsClosedOut', wasReviewed ? -1 : 1);
    frozen.markActed(closeOutKey(entry), !wasReviewed);
    requestEinkRefresh();
  };

  /**
   * Meetings-to-close-out step: opens the meeting's note. Deliberately does
   * not use `openOrCreateMeetingNote` (docs/dev/technical-design-
   * shared-note-pages.md §6): this step never offers a "create" action (the
   * guard right below throws when there's no note yet), unlike every other
   * note-icon handler in this app, which pairs create with open. Going through
   * the open-or-create entry point would silently start CREATING notes from
   * here, so this calls `refreshMeetingNoteBlock`/`openPath` directly.
   */
  const handleOpenCloseOutNote = async (entry: ReviewMeetingEntry): Promise<void> => {
    const current = findCachedItem(entry.item.path)?.meetings[entry.meetingIndex];
    if (!current || !current.notePath) {
      throw new Error(`"${meetingDisplayTitle(entry.meeting)}" has no note - Settings → Advanced → Reload all files.`);
    }
    const currentSettings = settings ?? (await loadSettings());
    await refreshMeetingNoteBlock(current, entry.item.path, currentSettings, inbox ? {tasks: inbox.tasks} : null);
    await openPath(await resolveNotePath(entry.item.path, current.notePath));
  };

  const renderCloseOutDetail = (selectedKey: string | null): React.ReactNode => {
    if (!selectedKey) {
      return (
        <ReviewEmptyDetail
          title="No meeting selected"
          text={`These meetings are over, their Tag Rule asks for a review, and you haven't ticked it yet (last ${REVIEW_LOOKBACK_DAYS} days). Note down follow-ups as todos, then mark the meeting reviewed.`}
          hint="Tap a meeting on the left to get started."
          textColor={textColor}
        />
      );
    }
    const entry = frozen.list.find(e => closeOutKey(e) === selectedKey);
    if (!entry) return null;
    const live = reviewCurrentItem(entry.item, items).meetings[entry.meetingIndex] ?? entry.meeting;
    const reviewed = resolveMeetingTracking(live, settings?.tagRules ?? [])?.done ?? false;
    const related = relatedItemsFor(items, inbox ? {tasks: inbox.tasks} : null, live.tags.filter(isContextTag));
    return (
      <MeetingCloseOutDetail
        entry={entry}
        meeting={live}
        reviewed={reviewed}
        related={related}
        onOpenItem={onOpenItem}
        onToggleReviewed={handleToggleCloseOutReviewed}
        onOpenNote={handleOpenCloseOutNote}
        onAddTask={onAddTask}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
    );
  };

  return (
    <ReviewMasterDetail<ReviewMeetingEntry>
      header="Meetings to close out"
      headerAccessory={<LayoutSwitch layout={closeOutLayout} onChange={setCloseOutLayout} textColor={textColor} />}
      rows={frozen.list}
      rowHeight={() => MEETING_ROW_HEIGHT[closeOutLayout]}
      isSelectable={() => true}
      rowKey={closeOutKey}
      renderRow={(entry, selected, actedOn) => (
        // The standard row as a selector (docs/dev/history/technical-design-meeting-lists.md
        // §3): date+time column, source, no actions - the tap selects (the
        // master-detail shell owns it); acted-on rows are greyed with a ✓.
        <CloseOutMeetingRow
          entry={entry}
          items={items}
          layout={closeOutLayout}
          state={selected ? 'selected' : actedOn ? 'done' : undefined}
          textColor={textColor}
          borderColor={borderColor}
        />
      )}
      renderDetail={renderCloseOutDetail}
      actedOnKeys={frozen.actedOn}
      resetKey={stepEntryToken}
      emptyHint="No meetings waiting for a review - nice."
      textColor={textColor}
      borderColor={borderColor}
    />
  );
}
