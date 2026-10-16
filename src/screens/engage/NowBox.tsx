/**
 * The current todo (S4, docs/dev/history/technical-design-engage.md §3.7):
 * "Working on", its title, a details line (due date or Waiting For with its
 * follow-up, the meeting it was agreed in), Done and - with `#next` - Remove
 * #next, without it Someday (D11), then its note (Note › / + Note through
 * the one note flow) and its linked file ("File: <name> ›").
 */
import React from 'react';
import {Text, View} from 'react-native';
import {todayIso} from '../../domain/meetingTime';
import {EngageTodoRef} from '../../domain/engageOwner';
import {isNextTask} from '../../domain/engageOptions';
import {ENGAGE_TEXT, linkedFileButtonText, nowDetailsText} from '../../domain/engageText';
import PillButton from '../../ui/PillButton';
import TaskLabels from '../../ui/TaskLabels';
import {taskRowLayout} from '../../ui/taskRowLayout';
import {ENGAGE_TEXT_WIDTH, engageStyles as styles} from './engageStyles';

interface Props {
  todo: EngageTodoRef;
  onDone: () => void;
  onRemoveNext: () => void;
  onSomeday: () => void;
  onNote: () => void;
  onFile: (linkedFile: string) => void;
  textColor: string;
  borderColor: string;
}

export default function NowBox({todo, onDone, onRemoveNext, onSomeday, onNote, onFile, textColor, borderColor}: Props): React.JSX.Element {
  const today = todayIso();
  const layout = taskRowLayout(todo.task, ENGAGE_TEXT_WIDTH, 'flat', false, today);
  // Due and Waiting For are spelled out on the details line, so the title keeps only #next/#now.
  const labels = layout.labels.filter(l => l.kind === 'next' || l.kind === 'now');
  const details = nowDetailsText(todo.task, today);
  const next = isNextTask(todo.task);
  const file = todo.task.linkedFile;
  return (
    <View style={[styles.nowBox, {borderColor: textColor}]}>
      <Text style={[styles.caption, {color: textColor}]}>{ENGAGE_TEXT.workingOn}</Text>
      <Text style={[styles.nowTitle, {color: textColor}]} numberOfLines={2}>
        {layout.title}
        <TaskLabels labels={labels} />
      </Text>
      {details ? (
        <Text style={[styles.nowDetails, {color: textColor}]} numberOfLines={1}>
          {details}
        </Text>
      ) : null}
      <View style={styles.buttonRow}>
        <PillButton label={ENGAGE_TEXT.done} onPress={onDone} primary textColor={textColor} borderColor={borderColor} />
        {next ? (
          <PillButton label={ENGAGE_TEXT.removeNext} onPress={onRemoveNext} textColor={textColor} borderColor={borderColor} />
        ) : (
          <PillButton label={ENGAGE_TEXT.someday} onPress={onSomeday} textColor={textColor} borderColor={borderColor} />
        )}
        <PillButton
          label={todo.task.notePath ? ENGAGE_TEXT.openNote : ENGAGE_TEXT.newNote}
          onPress={onNote}
          textColor={textColor}
          borderColor={borderColor}
        />
        {file ? <PillButton label={linkedFileButtonText(file)} onPress={() => onFile(file)} textColor={textColor} borderColor={borderColor} /> : null}
      </View>
    </View>
  );
}
