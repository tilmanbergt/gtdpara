/**
 * One option (docs/dev/history/technical-design-engage.md §3.7): a solid
 * circle for a `#next` todo, a dashed one for a plan todo, the title with its
 * labels (ui/TaskLabels.tsx), and an optional small action (Someday). The
 * whole row picks it. Fixed height `ENGAGE_ROW_H`, two lines at most.
 */
import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {EngageTodoRef} from '../../domain/engageOwner';
import PillButton from '../../ui/PillButton';
import TaskLabels from '../../ui/TaskLabels';
import {taskRowLayout} from '../../ui/taskRowLayout';
import {ENGAGE_TEXT_WIDTH, engageStyles as styles} from './engageStyles';

interface Props {
  todo: EngageTodoRef;
  kind: 'next' | 'plan';
  onPick: () => void;
  action?: {label: string; onPress: () => void};
  textColor: string;
  borderColor: string;
}

export default function OptionRow({todo, kind, onPick, action, textColor, borderColor}: Props): React.JSX.Element {
  const layout = taskRowLayout(todo.task, ENGAGE_TEXT_WIDTH, 'flat');
  return (
    <Pressable onPress={onPick} style={[styles.row, {borderBottomColor: borderColor}]}>
      <Text style={[styles.rowMark, {color: textColor}]}>{kind === 'next' ? '●' : '◌'}</Text>
      <Text style={[styles.rowText, {color: textColor}]} numberOfLines={layout.lines}>
        {layout.title}
        <TaskLabels labels={layout.labels} />
      </Text>
      {action ? (
        <View>
          <PillButton label={action.label} onPress={action.onPress} textColor={textColor} borderColor={borderColor} />
        </View>
      ) : null}
    </Pressable>
  );
}
