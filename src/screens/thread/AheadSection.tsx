/**
 * The overview's "Ahead" (docs/dev/history/technical-design-tending-threads.md
 * §3.5.2): one paged list with sub-head rows - next meetings, then what I
 * owe, what I'm waiting for and what is relevant (each todo in one of them,
 * §1.2.1) - so it never clips; when everything fits, no pager shows. An
 * empty sub-list shows no head. Someday/Maybe is only counted, in a quiet
 * last row "n someday ›" (docs/dev/history/technical-design-engage-in-context.md
 * E10). The header offers "+ Next <type>" for each type with a
 * meeting to copy (one in the thread lens, one per type in the counterpart
 * lens).
 */
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {somedayLinkText} from '../../domain/threadText';
import {ThreadMeetingEntry, ThreadOverview, ThreadTaskEntry} from '../../storage/threadAggregate';
import MeetingRow, {MEETING_ROW_HEIGHT} from '../../ui/MeetingRow';
import PagedSection from '../../ui/PagedSection';
import TaskRow, {taskRowHeight, taskRowLines} from '../../ui/TaskRow';
import {TASK_COLUMN_WIDTH_PX} from '../../ui/taskRowLayout';
import {FONT} from '../../ui/theme';
import {EntryActions, meetingEntryKey, taskEntryKey} from '../../ui/useEntryActions';

export const SUB_HEAD_HEIGHT = 30;

type AheadRow =
  | {kind: 'head'; key: string; label: string}
  | {kind: 'meeting'; key: string; entry: ThreadMeetingEntry}
  | {kind: 'task'; key: string; entry: ThreadTaskEntry}
  | {kind: 'someday'; key: string; entries: ThreadTaskEntry[]};

export interface NextOffer {
  type: string;
  onPress: () => void;
}

interface Props {
  overview: ThreadOverview;
  actions: EntryActions;
  nextOffers: NextOffer[];
  viewportHeight: number;
  /** The quiet "n someday ›" row: Review's Someday / Maybe step for these todos. */
  onOpenSomeday?: (entries: ThreadTaskEntry[]) => void;
  /** Other sub-head labels (the loop overview's); the thread's by default. */
  sectionLabels?: Partial<Record<TaskSectionKey, string>>;
  textColor: string;
  borderColor: string;
}

type TaskSectionKey = 'waiting' | 'owe' | 'relevant';

const TASK_SECTIONS: Array<{key: TaskSectionKey; label: string}> = [
  {key: 'owe', label: 'I owe'},
  {key: 'waiting', label: 'Waiting for'},
  {key: 'relevant', label: 'Relevant'},
];

function rowsOf(overview: ThreadOverview, labels: Partial<Record<TaskSectionKey, string>>): AheadRow[] {
  const rows: AheadRow[] = [];
  const {meetings} = overview.ahead;
  if (meetings.length > 0) {
    rows.push({kind: 'head', key: 'h-meetings', label: 'Next meetings'});
    meetings.forEach(entry => rows.push({kind: 'meeting', key: `m-${meetingEntryKey(entry)}`, entry}));
  }
  for (const section of TASK_SECTIONS) {
    const entries = overview.ahead[section.key];
    if (entries.length === 0) continue;
    rows.push({kind: 'head', key: `h-${section.key}`, label: labels[section.key] ?? section.label});
    entries.forEach(entry => rows.push({kind: 'task', key: `t-${taskEntryKey(entry)}`, entry}));
  }
  // Someday/Maybe is counted, not listed (E10): one quiet row after the last section.
  if (overview.ahead.someday.length > 0) rows.push({kind: 'someday', key: 'someday', entries: overview.ahead.someday});
  return rows;
}

export default function AheadSection(props: Props): React.JSX.Element {
  const {overview, actions, nextOffers, viewportHeight, onOpenSomeday, sectionLabels = {}, textColor, borderColor} = props;
  const {edit} = actions;
  const rows = rowsOf(overview, sectionLabels);
  const header = (
    <>
      Ahead
      {nextOffers.map(offer => (
        <Text key={offer.type} onPress={offer.onPress} style={styles.next}>
          {`   + Next ${offer.type}`}
        </Text>
      ))}
    </>
  );
  return (
    <PagedSection<AheadRow>
      header={header}
      rows={rows}
      viewportHeight={viewportHeight}
      resetKey={`${overview.thread.tag}|${overview.lens}`}
      isCountableRow={row => row.kind !== 'head'}
      rowHeight={row => {
        if (row.kind === 'head' || row.kind === 'someday') return SUB_HEAD_HEIGHT;
        if (row.kind === 'meeting') return MEETING_ROW_HEIGHT.oneLine;
        return taskRowHeight(row.entry.task, TASK_COLUMN_WIDTH_PX, 'flat');
      }}
      emptyHint="Nothing ahead: no meeting planned, nothing open."
      renderRow={row => {
        if (row.kind === 'head') {
          return (
            <View key={row.key} style={styles.head}>
              <Text style={[styles.headText, {color: textColor}]}>{row.label}</Text>
            </View>
          );
        }
        if (row.kind === 'someday') {
          const entries = row.entries;
          return (
            <View key={row.key} style={styles.head}>
              <Text
                onPress={onOpenSomeday ? () => onOpenSomeday(entries) : undefined}
                style={[styles.headText, onOpenSomeday ? styles.link : null, {color: textColor}]}
              >
                {somedayLinkText(entries.length)}
              </Text>
            </View>
          );
        }
        if (row.kind === 'meeting') {
          const entry = row.entry;
          return (
            <MeetingRow
              key={row.key}
              meeting={entry.meeting}
              layout="oneLine"
              time="dateTime"
              source={overview.scope.length > 1 ? {abbrev: entry.item.abbrev ?? entry.item.name, name: entry.item.name} : undefined}
              tracking={actions.tracking()}
              note={{onOpen: () => actions.meetingNote(entry), onCreate: () => actions.meetingNote(entry)}}
              file={{linkedFile: entry.meeting.linkedFile, onOpen: actions.openFile}}
              onPress={() => edit.select({type: 'meeting', key: meetingEntryKey(entry)})}
              state={
                edit.target?.type === 'meeting' && edit.target.key === meetingEntryKey(entry)
                  ? edit.mode === 'card'
                    ? 'selected'
                    : 'editing'
                  : undefined
              }
              ownerPath={entry.item.path}
              textColor={textColor}
              borderColor={borderColor}
            />
          );
        }
        const entry = row.entry;
        return (
          <TaskRow
            key={row.key}
            task={entry.task}
            isEditing={edit.target?.type === 'task' && edit.target.key === taskEntryKey(entry)}
            onStartEdit={() => edit.select({type: 'task', key: taskEntryKey(entry)})}
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
  );
}

const styles = StyleSheet.create({
  next: {fontSize: FONT.small, fontWeight: '700', textDecorationLine: 'underline'},
  head: {height: SUB_HEAD_HEIGHT, justifyContent: 'flex-end', paddingBottom: 2},
  headText: {fontSize: FONT.small, fontWeight: '700', opacity: 0.6},
  link: {textDecorationLine: 'underline'},
});
