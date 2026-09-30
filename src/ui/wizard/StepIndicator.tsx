/**
 * Numbered step bar for multi-step flows (docs/dev/technical-design-project-
 * close-out.md §8.1): equal-width cells, each with a bottom bar - thick black
 * for the current step, mid-grey with a "✓" for done steps, light for
 * upcoming ones. Grayscale by weight and glyph only (ui/theme.ts). Tapping
 * a step calls `onPress` (omit it for a read-only bar).
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {COLORS, FONT, SPACING} from '../theme';

export interface StepDef<K extends string> {
  key: K;
  label: string;
}

interface Props<K extends string> {
  steps: StepDef<K>[];
  current: K;
  done: K[];
  onPress?: (key: K) => void;
  textColor: string;
  borderColor: string;
}

export default function StepIndicator<K extends string>({steps, current, done, onPress, textColor, borderColor}: Props<K>): React.JSX.Element {
  return (
    <View style={styles.row}>
      {steps.map((step, i) => {
        const isCurrent = step.key === current;
        const isDone = !isCurrent && done.includes(step.key);
        return (
          <Pressable
            key={step.key}
            style={[
              styles.cell,
              {borderBottomColor: isCurrent ? COLORS.accent : isDone ? '#777777' : borderColor},
              isCurrent && styles.cellCurrent,
            ]}
            disabled={!onPress}
            onPress={() => onPress?.(step.key)}>
            <Text style={[styles.text, {color: textColor}, isCurrent && styles.textCurrent, !isCurrent && !isDone && styles.textUpcoming]} numberOfLines={1}>
              {isDone ? '✓ ' : ''}
              {i + 1} {step.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    marginBottom: SPACING.md,
  },
  cell: {
    flex: 1,
    paddingBottom: 6,
    marginRight: SPACING.sm,
    borderBottomWidth: 3,
  },
  cellCurrent: {
    borderBottomWidth: 5,
  },
  text: {
    fontSize: FONT.medium,
  },
  textCurrent: {
    fontWeight: '700',
  },
  textUpcoming: {
    opacity: 0.55,
  },
});
