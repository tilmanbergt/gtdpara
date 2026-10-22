/**
 * Styles the Quick Add rows share (ui/quickAdd/*Rows.tsx, QuickAddFrame,
 * CaptureQuickAdd). Row heights live in QuickAddFrame's `QUICK_ADD_ROWS`.
 */
import {StyleSheet} from 'react-native';
import {COLORS, FONT} from '../theme';
import {QUICK_ADD_ROWS} from './QuickAddFrame';

export const rowStyles = StyleSheet.create({
  row2: {
    minHeight: QUICK_ADD_ROWS.input,
    marginBottom: QUICK_ADD_ROWS.gap,
    // Positioning context for the clipboard strip (common.floatingStrip) -
    // absolutely positioned against *this* row, so it hovers right above
    // the input whichever row 2 (task/meeting) is showing.
    position: 'relative',
  },
  row2Wrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  row3: {
    minHeight: QUICK_ADD_ROWS.meta,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: QUICK_ADD_ROWS.gap,
  },
  /**
   * Keeps an inactive tab's rows mounted instead of unmounting them - Yoga
   * skips display:none entirely, so it contributes no height. Swapping the
   * subtrees instead would make Android create each TextInput's native view
   * afresh on every tab switch, which measures at its intrinsic size for a
   * frame before the style applies: a "grows, then shrinks back" flicker.
   */
  hidden: {
    display: 'none',
  },
  input: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: FONT.medium,
  },
  inputFlex: {
    flex: 1,
    marginRight: 6,
  },
  tabTextDisabled: {
    opacity: 0.35,
  },
  /** Groups the lead control (flow chips / time field) with the tag chips on the row's left, leaving space-between to place the attachment cluster on the right. */
  row3ChipsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
    // Safety net: tags can never paint past this group into the attachment
    // cluster.
    overflow: 'hidden',
  },
  /** Wraps the flow chips / the meeting time field so its width can be measured for the tag budget; never shrinks. */
  row3Lead: {
    flexShrink: 0,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginRight: 6,
    borderColor: COLORS.accent,
  },
  chipSelected: {
    backgroundColor: COLORS.accent,
  },
  chipTextSelected: {
    fontSize: FONT.small,
    fontWeight: '600',
    color: COLORS.accentText,
  },
  clearX: {
    fontSize: FONT.small,
    opacity: 0.7,
    marginLeft: 3,
    paddingHorizontal: 4,
  },
});
