/**
 * The Quick Add box: a bordered card with four row slots in a fixed order
 * (docs/dev/history/technical-design-unified-quickadd.md §3) -
 *   R1 tabs · R2 input · R3 metadata · R4 actions -
 * plus an optional line between R3 and R4 (the provenance line) and, for
 * the capture panel, a block below the box's rows. Each slot holds every
 * tab's version of its row at once; the inactive ones are hidden with
 * `display: none`, never unmounted (ui/quickAdd/styles.ts `hidden`).
 *
 * The row heights are the box's contract with the screens around it: the
 * lists below it must not move while the user switches tabs or edits.
 */
import React from 'react';
import {StyleSheet, View} from 'react-native';

/** Row heights and the gap below each row, in dp. */
export const QUICK_ADD_ROWS = {tabs: 22, input: 36, meta: 32, actions: 32, gap: 6} as const;

interface Props {
  row1: React.ReactNode;
  row2: React.ReactNode;
  row3: React.ReactNode;
  /** Between R3 and R4 (the provenance line). */
  beforeActions?: React.ReactNode;
  row4: React.ReactNode;
  /** The capture panel's tags, "File to" and extras. */
  below?: React.ReactNode;
  borderColor: string;
}

export default function QuickAddFrame({row1, row2, row3, beforeActions, row4, below, borderColor}: Props): React.JSX.Element {
  return (
    <View style={[styles.card, {borderColor}]}>
      <View style={styles.row1}>{row1}</View>
      {row2}
      {row3}
      {beforeActions}
      {row4}
      {below}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 10,
  },
  row1: {
    minHeight: QUICK_ADD_ROWS.tabs,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: QUICK_ADD_ROWS.gap,
  },
});
