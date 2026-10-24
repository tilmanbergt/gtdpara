/**
 * The current todo (S4, docs/dev/history/technical-design-engage.md §3.7):
 * "Working on" - or "Next action" for the owner's only `#next` shown without
 * being chosen (Addendum "Next and Plan tabs") - its title, a details line
 * (due date or Waiting For with its follow-up) and the meeting it was agreed
 * in as a link to that meeting's note ("From Sparring Mieke · 14.10. ›"), a
 * large check box on the right that marks it done, and the buttons
 * (docs/dev/history/technical-design-meetings-0.21.md R15): w/f <Counterpart>
 * (Waiting For on the owner thread's counterpart, "w/f" without one), Do
 * someday, Remove #next (with `#next`), its note (Note › / + Note through
 * the one note flow) and its linked file ("File: <name> ›").
 */
import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {todayIso} from '../../domain/meetingTime';
import {EngageTodoRef} from '../../domain/engageOwner';
import {isNextTask} from '../../domain/engageOptions';
import {
  ENGAGE_TEXT,
  linkedFileButtonText,
  nowDetailsText,
  nowMeetingText,
  waitingForButtonText,
} from '../../domain/engageText';
import PillButton from '../../ui/PillButton';
import TaskLabels from '../../ui/TaskLabels';
import {taskRowLayout} from '../../ui/taskRowLayout';
import {ENGAGE_TEXT_WIDTH, engageStyles as styles} from './engageStyles';

interface Props {
  todo: EngageTodoRef;
  caption: string;
  onDone: () => void;
  onRemoveNext: () => void;
  onSomeday: () => void;
  /** The owner thread's counterpart for w/f; null: a bare w/f. */
  counterpart: string | null;
  onWaiting: () => void;
  /** Opens the note of the meeting the todo was agreed in; absent: the meeting is not shown as a link. */
  onOpenMeeting?: () => void;
  onNote: () => void;
  onFile: (linkedFile: string) => void;
  textColor: string;
  borderColor: string;
}

export default function NowBox({
  todo,
  caption,
  onDone,
  onRemoveNext,
  onSomeday,
  counterpart,
  onWaiting,
  onOpenMeeting,
  onNote,
  onFile,
  textColor,
  borderColor,
}: Props): React.JSX.Element {
  const today = todayIso();
  const layout = taskRowLayout(
    todo.task,
    ENGAGE_TEXT_WIDTH,
    'flat',
    false,
    today,
  );
  // Due and Waiting For are spelled out on the details line, so the title keeps only #next/#now.
  const labels = layout.labels.filter(
    l => l.kind === 'next' || l.kind === 'now',
  );
  const details = nowDetailsText(todo.task, today);
  const meetingKey = todo.task.fields.meeting;
  const next = isNextTask(todo.task);
  const waiting = todo.task.flowState === 'waiting-for';
  const file = todo.task.linkedFile;
  return (
    <View style={[styles.nowBox, {borderColor: textColor}]}>
      <View style={styles.nowRow}>
        <View style={styles.nowMain}>
          <Text style={[styles.caption, {color: textColor}]}>{caption}</Text>
          <Text style={[styles.nowTitle, {color: textColor}]} numberOfLines={2}>
            {layout.title}
            <TaskLabels labels={labels} />
          </Text>
          {details ? (
            <Text
              style={[styles.nowDetails, {color: textColor}]}
              numberOfLines={1}>
              {details}
            </Text>
          ) : null}
          {meetingKey ? (
            <Text
              style={[styles.nowDetails, {color: textColor}, onOpenMeeting ? styles.nowLink : null]}
              numberOfLines={1}
              onPress={onOpenMeeting}
              suppressHighlighting>
              {nowMeetingText(meetingKey, today)}
            </Text>
          ) : null}
        </View>
        <Pressable
          onPress={onDone}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={ENGAGE_TEXT.done}
          style={[styles.doneBox, {borderColor: textColor}]}>
          <Text style={[styles.doneMark, {color: textColor}]}>✓</Text>
        </Pressable>
      </View>
      <View style={styles.buttonRow}>
        {waiting ? null : (
          <PillButton
            label={waitingForButtonText(counterpart)}
            onPress={onWaiting}
            textColor={textColor}
            borderColor={borderColor}
          />
        )}
        <PillButton
          label={ENGAGE_TEXT.doSomeday}
          onPress={onSomeday}
          textColor={textColor}
          borderColor={borderColor}
        />
        {next ? (
          <PillButton
            label={ENGAGE_TEXT.removeNext}
            onPress={onRemoveNext}
            textColor={textColor}
            borderColor={borderColor}
          />
        ) : null}
        <PillButton
          label={
            todo.task.notePath ? ENGAGE_TEXT.openNote : ENGAGE_TEXT.newNote
          }
          onPress={onNote}
          textColor={textColor}
          borderColor={borderColor}
        />
        {file ? (
          <PillButton
            label={linkedFileButtonText(file)}
            onPress={() => onFile(file)}
            textColor={textColor}
            borderColor={borderColor}
          />
        ) : null}
      </View>
    </View>
  );
}
