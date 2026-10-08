/**
 * The selected row of Looking back in the overview's right column
 * (docs/dev/history/technical-design-tending-threads.md §3.5.2).
 *
 * - A past meeting: its title, date and counts with "Open note", then the
 *   todos agreed in it as one paged list - open ones first, then the done
 *   ones grouped by the day they were done.
 * - The "Since" row: the todos done since the latest past meeting, grouped
 *   by the day they were done; no note button.
 *
 * Rows are the normal TaskRow with its actions.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {formatDateTime, formatDayHeader} from '../../domain/dateFormat';
import {meetingDisplayTitle} from '../../domain/meetingTracking';
import {todayIso} from '../../domain/meetingTime';
import {doneGroupLabel, pastMeetingSummary} from '../../domain/threadText';
import {PastMeeting, ThreadTaskEntry} from '../../storage/threadAggregate';
import PagedSection from '../../ui/PagedSection';
import TaskRow, {taskRowHeight, taskRowLines} from '../../ui/TaskRow';
import {TASK_COLUMN_WIDTH_PX} from '../../ui/taskRowLayout';
import {FONT, SPACING} from '../../ui/theme';
import {SUB_HEAD_HEIGHT} from './AheadSection';
import {taskEntryKey, ThreadActions} from './useThreadActions';

type PanelRow = {kind: 'head'; key: string; label: string} | {kind: 'task'; key: string; entry: ThreadTaskEntry};

/** The selected Looking back row. */
export type PanelSelection = {kind: 'meeting'; past: PastMeeting} | {kind: 'since'; from: string; done: ThreadTaskEntry[]};

/** Done todos under one head per day they were done, latest first. */
function doneRows(done: readonly ThreadTaskEntry[], today: string): PanelRow[] {
  const rows: PanelRow[] = [];
  let lastLabel: string | null = null;
  [...done]
    .sort((a, b) => (b.task.fields.completion ?? '').localeCompare(a.task.fields.completion ?? ''))
    .forEach(entry => {
      const label = doneGroupLabel(entry.task.fields.completion, today);
      if (label !== lastLabel) rows.push({kind: 'head', key: `h-${label}`, label});
      lastLabel = label;
      rows.push({kind: 'task', key: taskEntryKey(entry), entry});
    });
  return rows;
}

function meetingRows(past: PastMeeting, today: string): PanelRow[] {
  const rows: PanelRow[] = [];
  const open = past.agreed.filter(a => !a.task.done);
  if (open.length > 0) {
    rows.push({kind: 'head', key: 'h-open', label: 'Open'});
    open.forEach(entry => rows.push({kind: 'task', key: taskEntryKey(entry), entry}));
  }
  return [...rows, ...doneRows(past.agreed.filter(a => a.task.done), today)];
}

interface Props {
  selection: PanelSelection | null;
  actions: ThreadActions;
  textColor: string;
  borderColor: string;
}

export default function PastMeetingPanel({selection, actions, textColor, borderColor}: Props): React.JSX.Element {
  const {edit} = actions;
  if (!selection) {
    return (
      <View style={styles.empty}>
        <Text style={[styles.hint, {color: textColor}]}>No past meeting to look at yet.</Text>
      </View>
    );
  }
  const today = todayIso();
  const past = selection.kind === 'meeting' ? selection.past : null;
  const {title, sub, rows} =
    selection.kind === 'meeting'
      ? {
          title: meetingDisplayTitle(selection.past.entry.meeting),
          sub: `${formatDateTime(selection.past.entry.meeting.date, selection.past.entry.meeting.time, today)} · ${pastMeetingSummary(selection.past.counts)}`,
          rows: meetingRows(selection.past, today),
        }
      : {
          title: `Since ${formatDayHeader(selection.from, today)}`,
          sub: `${selection.done.length} done since the latest meeting`,
          rows: doneRows(selection.done, today),
        };
  return (
    <View style={styles.flex}>
      <View style={styles.headerRow}>
        <View style={styles.flex}>
          <Text style={[styles.title, {color: textColor}]} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.sub, {color: textColor}]} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        {past && (
          <Pressable style={[styles.pill, {borderColor}]} onPress={() => actions.meetingNote(past.entry)} hitSlop={8}>
            <Text style={[styles.pillText, {color: textColor}]}>{past.entry.meeting.notePath ? 'Open note' : '+ Note'}</Text>
          </Pressable>
        )}
      </View>
      <PagedSection<PanelRow>
        header={past ? 'Agreed' : 'Done'}
        rows={rows}
        resetKey={past ? past.key : 'since'}
        isCountableRow={row => row.kind !== 'head'}
        rowHeight={row => (row.kind === 'head' ? SUB_HEAD_HEIGHT : taskRowHeight(row.entry.task, TASK_COLUMN_WIDTH_PX, 'flat'))}
        emptyHint={past ? 'Nothing agreed in this meeting yet - add it above.' : 'Nothing done since then.'}
        renderRow={row => {
          if (row.kind === 'head') {
            return (
              <View key={row.key} style={styles.head}>
                <Text style={[styles.headText, {color: textColor}]}>{row.label}</Text>
              </View>
            );
          }
          const entry = row.entry;
          return (
            <TaskRow
              key={row.key}
              task={entry.task}
              isEditing={edit.target?.type === 'task' && edit.target.key === taskEntryKey(entry)}
              onStartEdit={() => edit.start({type: 'task', key: taskEntryKey(entry)})}
              onToggleDone={() => actions.toggleDone(entry)}
              onCreateNote={() => actions.taskNote(entry)}
              onOpenNote={() => actions.taskNote(entry)}
              linkedFile={entry.task.linkedFile}
              onOpenLinkedFile={actions.openFile}
              ownerPath={entry.item.path}
              context="flat"
              height={taskRowHeight(entry.task, TASK_COLUMN_WIDTH_PX, 'flat')}
              numberOfLines={taskRowLines(entry.task, TASK_COLUMN_WIDTH_PX, 'flat')}
              textColor={textColor}
              borderColor={borderColor}
            />
          );
        }}
        textColor={textColor}
        borderColor={borderColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {flex: 1},
  empty: {flex: 1, paddingTop: SPACING.md},
  hint: {fontSize: FONT.medium, opacity: 0.6},
  headerRow: {flexDirection: 'row', alignItems: 'center', height: 56, marginTop: SPACING.sm},
  title: {fontSize: FONT.medium, fontWeight: '700'},
  sub: {fontSize: FONT.small, opacity: 0.6, marginTop: 2},
  pill: {borderWidth: 1, borderRadius: 14, paddingHorizontal: SPACING.md, paddingVertical: 6, marginLeft: SPACING.sm},
  pillText: {fontSize: FONT.small, fontWeight: '600'},
  head: {height: SUB_HEAD_HEIGHT, justifyContent: 'flex-end', paddingBottom: 2},
  headText: {fontSize: FONT.small, fontWeight: '700', opacity: 0.6},
});
