/**
 * Review step "Someday / Maybe" (docs/dev/history/technical-design-engage-in-context.md
 * §2.10, E12): the open Someday and Maybe todos of active and on-hold
 * Projects/Areas, grouped by item on the left, the selected todo on the
 * right with #next / To plan / Done / Cancel. Built like "Unfocused next
 * items": the list is frozen when the step is entered, rows read the todo
 * live, and a todo acted on stays with a checkmark.
 *
 * Opened from an overview's "n someday ›" or Engage's "Also here", the step
 * carries a filter (screens/review/reviewNav.ts): "Only <name> · Show all"
 * and only those todos. Leaving the step clears it.
 */
import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {formatDate} from '../../../domain/dateFormat';
import {engageFlowText} from '../../../domain/engageOptions';
import {todayIso} from '../../../domain/meetingTime';
import {withTaskCancelled, withTaskDone, withTaskText} from '../../../domain/taskEdit';
import {Task} from '../../../domain/types';
import {setCachedInbox} from '../../../storage/dataCache';
import {mutateEntryTasks} from '../../../storage/itemMutations';
import {ReviewNextTaskEntry, ReviewSomedayEntry} from '../../../storage/reviewAggregate';
import {COLUMN_WIDTH_PX} from '../../../ui/itemEntryRow';
import ReviewMasterDetail from '../../../ui/ReviewMasterDetail';
import {activeLineEstimator} from '../../../ui/textLineEstimator';
import {FONT} from '../../../ui/theme';
import {useActionError} from '../../../ui/useActionError';
import {log} from '../../../utils/log';
import {requestEinkRefresh} from '../../../utils/screenRefresh';
import {styles} from '../reviewStyles';
import {clearReviewStepFilter, reviewEntryKey, ReviewStepFilter, useReviewStepFilter} from '../reviewNav';
import {bump} from '../reviewVisit';
import {reviewCurrentItem, ReviewEmptyDetail, ReviewStepProps} from '../shared';
import {useFrozenStepList} from '../useFrozenStepList';

type SomedayRow =
  | {kind: 'header'; key: string; entry: ReviewSomedayEntry}
  | {kind: 'entry'; key: string; entry: ReviewSomedayEntry; taskEntry: ReviewNextTaskEntry};

type SomedayAction = 'next' | 'plan' | 'done' | 'cancel';

const ACTIONS: Array<{action: SomedayAction; label: string}> = [
  {action: 'next', label: '#next'},
  {action: 'plan', label: 'To plan'},
  {action: 'done', label: 'Done'},
  {action: 'cancel', label: 'Cancel'},
];

const HEADER_ROW_PX = 30;
const ENTRY_CHROME_PX = 12;
const ENTRY_LINE_HEIGHT_PX = 22;

function entryLines(text: string): number {
  return Math.min(2, activeLineEstimator.estimateLines(text, Math.max(1, COLUMN_WIDTH_PX - 12), FONT.medium));
}

function rowHeight(row: SomedayRow): number {
  return row.kind === 'header' ? HEADER_ROW_PX : ENTRY_CHROME_PX + entryLines(row.taskEntry.task.text) * ENTRY_LINE_HEIGHT_PX;
}

/** The frozen todos as rows, one header per item that has any; only the filter's keys when there is one. */
function rowsOf(list: ReviewSomedayEntry[], filter: ReviewStepFilter | null): SomedayRow[] {
  const rows: SomedayRow[] = [];
  for (const entry of list) {
    const tasks = filter ? entry.tasks.filter(t => filter.keys.includes(reviewEntryKey(t))) : entry.tasks;
    if (tasks.length === 0) continue;
    rows.push({kind: 'header', key: `${entry.item.path}#header`, entry});
    tasks.forEach(taskEntry => rows.push({kind: 'entry', key: reviewEntryKey(taskEntry), entry, taskEntry}));
  }
  return rows;
}

/** "Someday · created Thu 2.10." - the flow state and, when known, when it was written down. */
function detailCaption(task: Task, today: string): string {
  const flow = task.flowState === 'maybe' ? 'Maybe' : task.flowState === 'someday' ? 'Someday' : task.done ? 'Done' : task.cancelled ? 'Cancelled' : task.flowState === 'next' ? '#next' : 'Plan';
  return task.fields.created ? `${flow} · created ${formatDate(task.fields.created, today)}` : flow;
}

export default function SomedayStep({data, stepEntryToken, onOpenItem, textColor, borderColor}: ReviewStepProps): React.JSX.Element {
  const {items, aggregate, inbox, inboxPath, refreshFromCache} = data;
  const frozen = useFrozenStepList(aggregate?.somedayItems, stepEntryToken);
  const filter = useReviewStepFilter('somedayMaybe');
  const action = useActionError('ReviewScreen.somedayError', 'SomedayStep: action failed');
  const [pending, setPending] = useState(false);
  const rows = rowsOf(frozen.list, filter);

  /** The todo as it is now (by index), else as it was frozen. */
  const liveTask = (taskEntry: ReviewNextTaskEntry): Task => reviewCurrentItem(taskEntry.item, items).tasks[taskEntry.taskIndex] ?? taskEntry.task;

  const run = (taskEntry: ReviewNextTaskEntry, kind: SomedayAction) => {
    setPending(true);
    action
      .run(async () => {
        const today = todayIso();
        const change = (task: Task): Task => {
          if (kind === 'done') return withTaskDone(task, true, today);
          if (kind === 'cancel') return withTaskCancelled(task, true);
          return withTaskText(task, engageFlowText(task.text, kind === 'next' ? 'next' : null));
        };
        const {nextInbox} = await mutateEntryTasks(
          taskEntry,
          tasks => tasks.map((task, index) => (index === taskEntry.taskIndex ? change(task) : task)),
          {inbox, inboxPath},
        );
        if (nextInbox) setCachedInbox(nextInbox);
        if (kind === 'next') bump('somedayActivated');
        frozen.markActed(reviewEntryKey(taskEntry));
        log('SomedayStep: action', kind, 'index=' + taskEntry.taskIndex);
        refreshFromCache();
        requestEinkRefresh();
      })
      .finally(() => setPending(false));
  };

  const showAll = () => {
    log('SomedayStep: show all');
    clearReviewStepFilter();
    requestEinkRefresh();
  };

  const renderDetail = (selectedKey: string | null): React.ReactNode => {
    const row = rows.find(r => r.kind === 'entry' && r.key === selectedKey);
    if (!row || row.kind !== 'entry') {
      return (
        <ReviewEmptyDetail
          title="No todo selected"
          text="Someday and Maybe todos wait here for the weekly look. Make one #next to work on it, move it back to the plan, or let it go."
          hint="Tap a todo on the left to get started."
          textColor={textColor}
        />
      );
    }
    const task = liveTask(row.taskEntry);
    return (
      <View>
        <Pressable onPress={() => onOpenItem(row.entry.item)}>
          <Text style={[styles.cardTitle, {color: textColor}]}>{task.text}</Text>
        </Pressable>
        <Text style={[styles.detailCaption, {color: textColor}]}>
          {`${row.entry.item.name}${row.entry.item.kind === 'area' ? ' (Area)' : ''} · ${detailCaption(task, todayIso())}`}
        </Text>
        <View style={styles.pillRow}>
          {ACTIONS.map(({action: kind, label}) => (
            <Pressable key={kind} style={[styles.pill, {borderColor}]} disabled={pending} onPress={() => run(row.taskEntry, kind)} hitSlop={8}>
              <Text style={[styles.pillText, {color: textColor}]}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  };

  const filterLine = filter ? (
    <Text style={[styles.pillText, {color: textColor}]}>
      {`   Only ${filter.label} · `}
      <Text onPress={showAll} style={local.link}>
        Show all
      </Text>
    </Text>
  ) : undefined;

  return (
    <ReviewMasterDetail<SomedayRow>
      header="Someday / Maybe"
      headerAccessory={filterLine}
      rows={rows}
      rowHeight={rowHeight}
      isSelectable={row => row.kind === 'entry'}
      rowKey={row => row.key}
      isCountableRow={row => row.kind === 'entry'}
      renderRow={(row, selected, actedOn) =>
        row.kind === 'header' ? (
          <View key={row.key} style={styles.masterGroupLabel}>
            <Text style={[styles.masterGroupLabelText, {color: textColor}]} numberOfLines={1}>
              {row.entry.item.name}
              {row.entry.item.kind === 'area' ? ' (Area)' : ''}
            </Text>
          </View>
        ) : (
          <View
            style={[
              styles.masterRow,
              styles.masterRowIndented,
              {height: rowHeight(row), minHeight: rowHeight(row), borderColor},
              selected && styles.masterRowSelected,
            ]}>
            <Text style={[styles.masterRowText, {color: textColor}, actedOn && styles.masterRowActedOn]} numberOfLines={entryLines(row.taskEntry.task.text)}>
              {actedOn ? '✓ ' : ''}
              {row.taskEntry.task.text}
            </Text>
          </View>
        )
      }
      renderDetail={renderDetail}
      actedOnKeys={frozen.actedOn}
      resetKey={`${stepEntryToken}|${filter ? filter.label : ''}`}
      emptyHint="Nothing parked: no open Someday or Maybe todos."
      textColor={textColor}
      borderColor={borderColor}
    />
  );
}

const local = StyleSheet.create({
  link: {textDecorationLine: 'underline'},
});
