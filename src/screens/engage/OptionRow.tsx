/**
 * One option (docs/dev/history/technical-design-engage.md §3.7, Addendum "Next
 * and Plan tabs"): a solid circle for a `#next` todo, a dashed one for a plan
 * todo, an open one with "· waiting" for a Waiting For on the Agreed tab
 * (docs/dev/history/technical-design-engage-in-context.md E6), the title with
 * its labels (ui/TaskLabels.tsx), and small actions on
 * the right. A Next row is tapped to work on it; a Plan row only through its
 * actions. Fixed height `ENGAGE_ROW_H`, two lines at most.
 */
import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {EngageTodoRef} from '../../domain/engageOwner';
import {ENGAGE_TEXT} from '../../domain/engageText';
import PillButton from '../../ui/PillButton';
import TaskLabels from '../../ui/TaskLabels';
import {taskRowLayout} from '../../ui/taskRowLayout';
import {ENGAGE_TEXT_WIDTH, engageStyles as styles} from './engageStyles';

interface Props {
  todo: EngageTodoRef;
  kind: 'next' | 'plan' | 'waiting';
  onPick?: () => void;
  actions: Array<{label: string; onPress: () => void}>;
  textColor: string;
  borderColor: string;
}

export default function OptionRow({todo, kind, onPick, actions, textColor, borderColor}: Props): React.JSX.Element {
  const layout = taskRowLayout(todo.task, ENGAGE_TEXT_WIDTH, 'flat');
  return (
    <Pressable onPress={onPick} disabled={!onPick} style={[styles.row, {borderBottomColor: borderColor}]}>
      <Text style={[styles.rowMark, {color: textColor}]}>{kind === 'next' ? '●' : kind === 'plan' ? '◌' : '○'}</Text>
      <Text style={[styles.rowText, {color: textColor}]} numberOfLines={layout.lines}>
        {layout.title}
        <TaskLabels labels={layout.labels} />
        {kind === 'waiting' ? ` ${ENGAGE_TEXT.waitingRow}` : null}
      </Text>
      <View style={styles.rowActions}>
        {actions.map(action => (
          <PillButton key={action.label} label={action.label} onPress={action.onPress} textColor={textColor} borderColor={borderColor} />
        ))}
      </View>
    </Pressable>
  );
}
