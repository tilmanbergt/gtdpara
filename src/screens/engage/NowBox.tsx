/**
 * The current todo (S4, docs/dev/history/technical-design-engage.md §3.7):
 * "Working on", its title, Done and - with `#next` - Remove #next, without
 * it Someday (D11). Tapping the title opens its note.
 */
import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {EngageTodoRef} from '../../domain/engageOwner';
import {isNextTask} from '../../domain/engageOptions';
import {ENGAGE_TEXT} from '../../domain/engageText';
import PillButton from '../../ui/PillButton';
import TaskLabels from '../../ui/TaskLabels';
import {taskRowLayout} from '../../ui/taskRowLayout';
import {ENGAGE_TEXT_WIDTH, engageStyles as styles} from './engageStyles';

interface Props {
  todo: EngageTodoRef;
  onDone: () => void;
  onRemoveNext: () => void;
  onSomeday: () => void;
  onOpen: () => void;
  textColor: string;
  borderColor: string;
}

export default function NowBox({todo, onDone, onRemoveNext, onSomeday, onOpen, textColor, borderColor}: Props): React.JSX.Element {
  const layout = taskRowLayout(todo.task, ENGAGE_TEXT_WIDTH, 'flat');
  const next = isNextTask(todo.task);
  return (
    <View style={[styles.nowBox, {borderColor: textColor}]}>
      <Text style={[styles.caption, {color: textColor}]}>{ENGAGE_TEXT.workingOn}</Text>
      <Pressable onPress={onOpen}>
        <Text style={[styles.nowTitle, {color: textColor}]} numberOfLines={2}>
          {layout.title}
          <TaskLabels labels={layout.labels} />
        </Text>
      </Pressable>
      <View style={styles.buttonRow}>
        <PillButton label={ENGAGE_TEXT.done} onPress={onDone} primary textColor={textColor} borderColor={borderColor} />
        {next ? (
          <PillButton label={ENGAGE_TEXT.removeNext} onPress={onRemoveNext} textColor={textColor} borderColor={borderColor} />
        ) : (
          <PillButton label={ENGAGE_TEXT.someday} onPress={onSomeday} textColor={textColor} borderColor={borderColor} />
        )}
      </View>
    </View>
  );
}
