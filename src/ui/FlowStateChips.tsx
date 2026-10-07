/**
 * The Next / Waiting For / Someday / Maybe chip row (technical-design-
 * tags.md §5.1) - shared by ui/TaskQuickAdd.tsx and ui/TaskEditCard.tsx, so
 * create and edit use the exact same control. Visually identical to
 * screens/ProjectDataPanel.tsx's existing StatusSection pill row
 * (statusOption/statusOptionSelected/statusOptionText: border #dddddd ->
 * #2f6feb + white text when selected, FONT.small, radius 6, padding 8/14) -
 * reused rather than reinvented, same visual language as the Project/Area
 * status picker this app already has.
 *
 * One real behavioral difference from StatusSection: a flow-state chip can
 * be *un*selected (tap the already-selected chip again to clear it back to
 * null) - StatusSection always has exactly one value selected, flow-state
 * doesn't require one.
 *
 * StatusSection could be rebuilt on this same chip primitive; that refactor
 * is deliberately left out to avoid putting the Status feature at risk.
 *
 * Compact row: "Waiting For" is abbreviated to "w/f" (rather than switched
 * to icons, since Next/Someday/Maybe are already short enough) so this row
 * plus ui/TaskQuickAdd.tsx's due-date field alongside it fits one line at
 * column (half) width. `row` doesn't wrap - with all four labels short,
 * wrapping would only hide a fit problem instead of solving it, and
 * TaskQuickAdd needs this to stay one line to sit beside the due field.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {FlowState} from '../domain/types';
import {COLORS, FONT} from './theme';

interface Props {
  value: FlowState;
  onChange: (next: FlowState) => void;
  textColor: string;
  borderColor: string;
  disabled?: boolean;
}

const OPTIONS: Array<{value: Exclude<FlowState, null>; label: string}> = [
  {value: 'waiting-for', label: 'w/f'},
  {value: 'maybe', label: 'Maybe'},
  {value: 'someday', label: 'Someday'},
  {value: 'next', label: 'Next'},
];

export default function FlowStateChips({value, onChange, textColor, borderColor, disabled}: Props): React.JSX.Element {
  return (
    <View style={styles.row}>
      {OPTIONS.map(option => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            style={[styles.chip, {borderColor: selected ? COLORS.accent : borderColor}, selected && styles.chipSelected]}
            disabled={disabled}
            onPress={() => onChange(selected ? null : option.value)}
            hitSlop={8}>
            <Text style={[styles.chipText, {color: selected ? COLORS.accentText : textColor}]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
  },
  chip: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginRight: 4,
  },
  chipSelected: {
    backgroundColor: COLORS.accent,
  },
  chipText: {
    fontSize: FONT.small,
    fontWeight: '600',
  },
});
