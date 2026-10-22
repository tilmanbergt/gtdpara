/**
 * The Quick Add box (docs/dev/history/technical-design-item-card.md §4): a
 * bordered card of four rows at fixed heights -
 *   R1 tabs and the main button · R2 input · R3 metadata · R4 more tags,
 *   the provenance line, or the edit form's commands -
 * the same 174 dp whatever it shows, so the lists below it never move when
 * the user switches tabs, starts an edit or pages the tags. Every row sets
 * its own height (ui/quickAdd/styles.ts); each slot holds every tab's
 * version of its rows at once, the inactive ones hidden with
 * `display: none`, never unmounted.
 *
 * `free`: the lasso capture panel's taller layout (multi-line text, Split
 * lines, chips below) - rows grow with their content, no fixed height.
 */
import React from 'react';
import {StyleSheet, View} from 'react-native';

/**
 * Row heights and the gap below each row (none below R4), in dp. R3 and R4
 * hold chips: on the device a chip label is about 20 dp high, so a chip with
 * QUICK_ADD_CHIP_PADDING above and below and its border is about 30 dp.
 */
export const QUICK_ADD_ROWS = {tabs: 30, input: 36, meta: 34, extra: 34, gap: 6} as const;

/** Vertical padding of the chips in the box (flow chips, tag chips). */
export const QUICK_ADD_CHIP_PADDING = 4;

const PADDING = 10;
const BORDER = 1;

/** The box's height in every state. */
export const QUICK_ADD_HEIGHT =
  2 * (BORDER + PADDING) + QUICK_ADD_ROWS.tabs + QUICK_ADD_ROWS.input + QUICK_ADD_ROWS.meta + QUICK_ADD_ROWS.extra + 3 * QUICK_ADD_ROWS.gap;

/** R1 in the capture panel's free layout (tabs only). */
const FREE_TABS_HEIGHT = 22;

interface Props {
  /** R1: tabs, and the main button on the right. */
  row1: React.ReactNode;
  /** R2: every tab's input row. */
  row2: React.ReactNode;
  /** R3 and R4: every tab's metadata row and fourth row. */
  rows34: React.ReactNode;
  /** The capture panel's tags, "File to" and extras. */
  below?: React.ReactNode;
  free?: boolean;
  borderColor: string;
}

export default function QuickAddFrame({row1, row2, rows34, below, free = false, borderColor}: Props): React.JSX.Element {
  return (
    <View style={[styles.card, !free && styles.fixed, {borderColor}]} testID="quick-add-frame">
      <View style={[styles.row1, free ? styles.row1Free : styles.row1Fixed]}>{row1}</View>
      {row2}
      {rows34}
      {below}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderWidth: BORDER,
    borderRadius: 6,
    padding: PADDING,
  },
  fixed: {
    height: QUICK_ADD_HEIGHT,
  },
  row1: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: QUICK_ADD_ROWS.gap,
  },
  row1Fixed: {
    height: QUICK_ADD_ROWS.tabs,
  },
  row1Free: {
    minHeight: FREE_TABS_HEIGHT,
  },
});
