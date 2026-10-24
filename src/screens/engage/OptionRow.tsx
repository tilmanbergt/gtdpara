/**
 * One option (docs/dev/history/technical-design-engage.md §3.7, Addendum "Next
 * and Plan tabs"): a solid circle for a `#next` todo, a dashed one for a plan
 * todo, an open one with "· waiting" for a Waiting For, a ✓ for a done todo
 * on the From tab - struck through, no action
 * (docs/dev/history/technical-design-meetings-0.21.md R10, R13) - the title
 * with its labels (ui/TaskLabels.tsx), an optional detail ("from 14.10."),
 * and small actions on the right. A Next row is tapped to work on it; the
 * others only through their actions. Fixed height `ENGAGE_ROW_H`, two lines
 * at most.
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
  kind: 'next' | 'plan' | 'waiting' | 'done';
  /** Shown after the title, e.g. where a waiting todo was agreed. */
  detail?: string | null;
  onPick?: () => void;
  actions: Array<{label: string; onPress: () => void}>;
  textColor: string;
  borderColor: string;
}

const MARK = {next: '●', plan: '◌', waiting: '○', done: '✓'} as const;

export default function OptionRow({todo, kind, detail, onPick, actions, textColor, borderColor}: Props): React.JSX.Element {
  const layout = taskRowLayout(todo.task, ENGAGE_TEXT_WIDTH, 'flat');
  return (
    <Pressable onPress={onPick} disabled={!onPick} style={[styles.row, {borderBottomColor: borderColor}]}>
      <Text style={[styles.rowMark, {color: textColor}]}>{MARK[kind]}</Text>
      <Text style={[styles.rowText, {color: textColor}, kind === 'done' && styles.rowDone]} numberOfLines={layout.lines}>
        {layout.title}
        <TaskLabels labels={layout.labels} />
        {kind === 'waiting' ? ` ${ENGAGE_TEXT.waitingRow}` : null}
        {detail ? ` · ${detail}` : null}
      </Text>
      <View style={styles.rowActions}>
        {actions.map(action => (
          <PillButton key={action.label} label={action.label} onPress={action.onPress} textColor={textColor} borderColor={borderColor} />
        ))}
      </View>
    </Pressable>
  );
}
