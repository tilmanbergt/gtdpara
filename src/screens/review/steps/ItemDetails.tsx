/**
 * The detail column of the item steps (Stalled projects, Neglected areas,
 * Done awaiting review, On Hold reconsideration). Both read the item live
 * from the cache on every render, so a task added here shows at once while
 * the step's list itself stays frozen.
 */
import React, {useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {Destination} from '../../../domain/destination';
import {planStatusLabel} from '../../../domain/closeOut/plan';
import {CachedItem} from '../../../storage/dataCache';
import {isActionableOpenTask, ReviewItemRef, ReviewProjectEntry, ReviewShelvedTaskEntry, shelvedTasksFor} from '../../../storage/reviewAggregate';
import {SettableStatus} from '../../../storage/statusControl';
import ItemContextBlock from '../../../ui/ItemContextBlock';
import MeetingRow from '../../../ui/MeetingRow';
import QuickAddWidget from '../../../ui/QuickAddWidget';
import {ReadOnlyTaskRow} from '../../../ui/TaskRow';
import {common} from '../../../ui/commonStyles';
import {useErrorStatus} from '../../../ui/status/StatusProvider';
import {errorMessage} from '../../../utils/errorMessage';
import {styles} from '../reviewStyles';
import {noopAddMeeting, reviewCurrentItem, statusLabel} from '../shared';





/**
 * Stalled-project/neglected-area detail panel (Steps: Stalled projects,
 * Neglected areas) - `ui/ItemContextBlock.tsx` (Area/Scope/Last goal) up
 * top, then (docs/dev/history/technical-design-review-master-detail.md §5.2): a
 * quick-add task fixed to this item, its open tasks, up to 2 upcoming
 * meetings, shelved Someday/Maybe tasks with a one-tap "→ Next" promotion,
 * and status/archive pills. `statusOptions` is the 3-way Active/On
 * Hold/Done set for Projects or the 2-way Active/On Hold set for Areas
 * (Areas never reach 'done' - domain/types.ts's ItemStatus doc comment).
 *
 * `items` is the live cache - `reviewCurrentItem` looks the item back up on
 * every render (falling back to a safe default if it's vanished from the
 * cache) and this panel recomputes both its open-tasks list and its
 * shelvedTasks list from there (reviewAggregate.ts's exported
 * isActionableOpenTask/shelvedTasksFor - the same rules the aggregate
 * itself uses), rather than trusting the frozen `entry`'s own copies. That
 * keeps a just-added task, or a just-promoted shelved task, showing up
 * immediately even though the item's membership in the step stays frozen.
 */
export function ReviewItemDetail({
  entry,
  hint,
  statusOptions,
  items,
  currentWeekKey,
  onOpenItem,
  onAddTask,
  onStatusChange,
  onArchive,
  onPromoteToNext,
  onContextChanged,
  textColor,
  borderColor,
  placeholderColor,
}: {
  entry: ReviewProjectEntry;
  hint: string;
  statusOptions: SettableStatus[];
  items: CachedItem[];
  currentWeekKey: string;
  onOpenItem: (item: ReviewItemRef) => void;
  onAddTask: (text: string, destination: Destination) => Promise<void>;
  onStatusChange: (item: ReviewItemRef, status: SettableStatus) => Promise<void>;
  onArchive: (item: ReviewItemRef) => Promise<void>;
  onPromoteToNext: (entry: ReviewShelvedTaskEntry) => Promise<void>;
  onContextChanged: () => void;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}): React.JSX.Element {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useErrorStatus('ReviewScreen.error', error, () => setError(null));
  const [promotingIndex, setPromotingIndex] = useState<number | null>(null);

  const runAction = (fn: () => Promise<void>) => {
    setError(null);
    setPending(true);
    fn()
      .catch(e => setError(errorMessage(e)))
      .finally(() => setPending(false));
  };

  const handlePromote = (shelved: ReviewShelvedTaskEntry) => {
    setError(null);
    setPromotingIndex(shelved.taskIndex);
    onPromoteToNext(shelved)
      .catch(e => setError(errorMessage(e)))
      .finally(() => setPromotingIndex(null));
  };

  const destination: Destination = {type: 'item', kind: entry.item.kind, name: entry.item.name, path: entry.item.path};
  const current = reviewCurrentItem(entry.item, items);
  const openTasks = current.tasks.filter(isActionableOpenTask);
  const shelvedTasks = shelvedTasksFor(entry.item, current.tasks);

  return (
    <View>
      <Pressable onPress={() => onOpenItem(entry.item)}>
        <Text style={[styles.cardTitle, {color: textColor}]}>{entry.item.name}</Text>
      </Pressable>
      <ItemContextBlock
        item={current}
        currentWeekKey={currentWeekKey}
        onChanged={onContextChanged}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
      <QuickAddWidget
        fixedDestination={destination}
        taskOnly
        onAddTask={onAddTask}
        onAddMeeting={noopAddMeeting}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
      {openTasks.length === 0 ? (
        <Text style={[common.hint, {color: textColor}]}>{hint}</Text>
      ) : (
        <View style={common.sectionSpacingSmall}>
          {openTasks.map((t, i) => (
            <Text key={`${entry.item.path}#${i}`} style={[styles.rowText, {color: textColor}]}>
              • {t.text}
            </Text>
          ))}
        </View>
      )}
      {entry.upcomingMeetings.length > 0 && (
        <View style={styles.cardMeetings}>
          {/* Read-only standard rows (docs/dev/history/technical-design-meeting-lists.md
              §4.6): 1-line, date+time, no source - the card is the item. */}
          {entry.upcomingMeetings.map(m => (
            <MeetingRow
              key={`${m.item.path}#${m.meetingIndex}`}
              meeting={m.meeting}
              layout="oneLine"
              time="dateTime"
              textColor={textColor}
              borderColor={borderColor}
            />
          ))}
        </View>
      )}
      {shelvedTasks.length > 0 && (
        <View style={styles.cardShelved}>
          <Text style={[common.subheading, styles.cardShelvedHeading, {color: textColor}]}>
            Someday / Maybe (not counted as open work)
          </Text>
          {shelvedTasks.map(shelved => (
            <View key={shelved.taskIndex} style={styles.shelvedRow}>
              <Text style={[styles.rowText, styles.shelvedText, {color: textColor}]}>{shelved.task.text}</Text>
              <Pressable
                style={[styles.pill, {borderColor}]}
                disabled={promotingIndex !== null}
                onPress={() => handlePromote(shelved)}
                hitSlop={8}>
                <Text style={[styles.pillText, {color: textColor}]}>→ Next</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
      <View style={styles.pillRow}>
        {statusOptions.map(status => (
          <Pressable
            key={status}
            style={[styles.pill, {borderColor}, status === 'active' && styles.pillActive]}
            disabled={pending}
            onPress={() => runAction(() => onStatusChange(entry.item, status))}
            hitSlop={8}>
            <Text style={[styles.pillText, {color: textColor}]}>{statusLabel(status)}</Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.pill, {borderColor}]}
          disabled={pending}
          onPress={() => runAction(() => onArchive(entry.item))}
          hitSlop={8}>
          <Text style={[styles.pillText, {color: textColor}]}>Archive</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Done-project/On-Hold-item detail panel (Steps: Done awaiting review, On
 * Hold reconsideration) - `ItemContextBlock` + status action pills (Archive
 * here is a physical folder move, storage/archive.ts, rather than a plain
 * frontmatter status change, and "→ Done" only makes sense for Projects,
 * `showMarkDone`) + two sections, both using shared row primitives rather
 * than `ProjectDataPanel.tsx`'s own `TodosSection`/`MeetingsSection` (see
 * the technical design's §6.3 for why those two aren't reused wholesale):
 * - **All tasks** - `current.tasks` unfiltered (not just open ones, unlike
 *   `ReviewItemDetail` above) via `ui/TaskRow.tsx` directly, `context="flat"`
 *   read-only (no edit/link affordances - this view is look-then-decide,
 *   not an editor).
 * - **All meetings** - `current.meetings` unfiltered via `ui/MeetingRow.tsx`
 *   directly, same read-only treatment.
 *
 * `doneList`/`onHoldList` stay bare `ReviewItemRef[]` (§4.1); this panel
 * does the same live `reviewCurrentItem` lookup every other detail panel
 * here does and simply doesn't filter the result.
 */
export function DoneOnHoldDetail({
  itemRef,
  showMarkDone,
  items,
  currentWeekKey,
  onOpenItem,
  onReactivate,
  onMarkDone,
  onArchive,
  onContextChanged,
  closeOut,
  textColor,
  borderColor,
  placeholderColor,
}: {
  itemRef: ReviewItemRef;
  showMarkDone: boolean;
  /** Done step only (docs/dev/history/technical-design-project-close-out.md §6.1): replaces Archive with "Close out…" / "Quick archive…" and shows the close-out status. */
  closeOut?: {onFull: () => void; onQuick: () => void};
  items: CachedItem[];
  currentWeekKey: string;
  onOpenItem: (item: ReviewItemRef) => void;
  onReactivate: (item: ReviewItemRef) => Promise<void>;
  onMarkDone: (item: ReviewItemRef) => Promise<void>;
  onArchive: (item: ReviewItemRef) => Promise<void>;
  onContextChanged: () => void;
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

  const current = reviewCurrentItem(itemRef, items);

  return (
    <View>
      <Pressable onPress={() => onOpenItem(itemRef)}>
        <Text style={[styles.cardTitle, {color: textColor}]}>
          {itemRef.name}
          {itemRef.kind === 'area' ? ' (Area)' : ''}
        </Text>
      </Pressable>
      <ItemContextBlock
        item={current}
        currentWeekKey={currentWeekKey}
        onChanged={onContextChanged}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
      <View style={styles.pillRow}>
        <Pressable style={[styles.pill, {borderColor}]} disabled={pending} onPress={() => runAction(() => onReactivate(itemRef))} hitSlop={8}>
          <Text style={[styles.pillText, {color: textColor}]}>Reactivate</Text>
        </Pressable>
        {showMarkDone && (
          <Pressable style={[styles.pill, {borderColor}]} disabled={pending} onPress={() => runAction(() => onMarkDone(itemRef))} hitSlop={8}>
            <Text style={[styles.pillText, {color: textColor}]}>→ Done</Text>
          </Pressable>
        )}
        {closeOut ? (
          <>
            <Pressable style={[styles.pill, styles.pillActive, {borderColor}]} disabled={pending} onPress={closeOut.onFull} hitSlop={8}>
              <Text style={[styles.pillText, {color: textColor}]}>Close out…</Text>
            </Pressable>
            <Pressable style={[styles.pill, {borderColor}]} disabled={pending} onPress={closeOut.onQuick} hitSlop={8}>
              <Text style={[styles.pillText, {color: textColor}]}>Quick archive…</Text>
            </Pressable>
          </>
        ) : (
          <Pressable style={[styles.pill, {borderColor}]} disabled={pending} onPress={() => runAction(() => onArchive(itemRef))} hitSlop={8}>
            <Text style={[styles.pillText, {color: textColor}]}>Archive</Text>
          </Pressable>
        )}
      </View>
      {closeOut && <Text style={[common.hint, {color: textColor}]}>{planStatusLabel(current.rawContent)}</Text>}
      <View style={[common.divider, {backgroundColor: borderColor}]} />
      <Text style={[styles.sectionLabel, {color: textColor}]}>All tasks</Text>
      {current.tasks.length === 0 ? (
        <Text style={[common.hint, {color: textColor}]}>No tasks on this item.</Text>
      ) : (
        current.tasks.map((task, taskIndex) => (
          <ReadOnlyTaskRow key={`task-${taskIndex}`} task={task} context="flat" textColor={textColor} borderColor={borderColor} />
        ))
      )}
      <View style={[common.divider, {backgroundColor: borderColor}]} />
      <Text style={[styles.sectionLabel, {color: textColor}]}>All meetings</Text>
      {current.meetings.length === 0 ? (
        <Text style={[common.hint, {color: textColor}]}>No meetings on this item.</Text>
      ) : (
        current.meetings.map((meeting, meetingIndex) => (
          <MeetingRow
            key={`meeting-${meetingIndex}`}
            meeting={meeting}
            layout="oneLine"
            time="dateTime"
            textColor={textColor}
            borderColor={borderColor}
          />
        ))
      )}
    </View>
  );
}

