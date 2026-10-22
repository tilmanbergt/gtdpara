/**
 * Styles the Quick Add rows share (ui/quickAdd/*Rows.tsx, CaptureQuickAdd).
 * Row heights live in QuickAddFrame's `QUICK_ADD_ROWS`; every row sets its
 * own height, so no content can make the box grow.
 */
import {StyleSheet} from 'react-native';
import {COLORS, FONT} from '../theme';
import {QUICK_ADD_CHIP_PADDING, QUICK_ADD_ROWS} from './QuickAddFrame';

export const rowStyles = StyleSheet.create({
  row2: {
    height: QUICK_ADD_ROWS.input,
    justifyContent: 'center',
    marginBottom: QUICK_ADD_ROWS.gap,
    // Positioning context for the floating strips (common.floatingStrip) -
    // absolutely positioned against *this* row, so they hover over the tabs
    // whichever row 2 (task/meeting) is showing. No zIndex anywhere in the
    // box: on Android a zIndex sibling can stop other rows being drawn.
    position: 'relative',
  },
  /** The capture panel's R2: grows with its multi-line field and the Split lines rows. */
  row2Free: {
    height: undefined,
    minHeight: QUICK_ADD_ROWS.input,
  },
  row2Wrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  row3: {
    height: QUICK_ADD_ROWS.meta,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: QUICK_ADD_ROWS.gap,
  },
  /** R4, the last row: no gap below. */
  row4: {
    height: QUICK_ADD_ROWS.extra,
    flexDirection: 'row',
    alignItems: 'center',
  },
  /** The capture panel's R3. */
  row3Free: {
    height: undefined,
    minHeight: QUICK_ADD_ROWS.meta,
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
  /** Groups the lead control (flow chips / time field) with the tag chips on the row's left. Never clips: only the tag chips' own row does (ui/TagChips.tsx). */
  row3ChipsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  /** Wraps the flow chips / the meeting time field so its width can be measured for the tag budget; never shrinks. */
  row3Lead: {
    flexShrink: 0,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: QUICK_ADD_CHIP_PADDING,
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
