/**
 * Shared styles of the Engage panel (docs/dev/history/technical-design-engage.md
 * §3.7): only values from ui/theme.ts.
 *
 * Budget on the A5 X (docs/dev/design-device-rendering.md §5-6, dp): the
 * panel starts at 12 % of the height under the 36 dp status slot (~195 dp)
 * and is at most ~680 dp tall on its fullest screen: header ~40, Now box
 * ~110, ack line ~30, list header ~31 + 5 rows × 64, collapsed Quick Add ~40,
 * marks line ~30, footer ~44, padding 32. It ends near 875 dp of 1325, so
 * Quick Add's field (which replaces the list when open) stays in the upper
 * two thirds (DEVELOPMENT-POLICY §4).
 */
import {StyleSheet} from 'react-native';
import {FONT, RADII, SPACING} from '../../ui/theme';

/**
 * Whether the panel's root lets the note show around it. The plugin view is
 * always full screen; the A5 X draws the note behind a transparent root
 * (checked on the device, design §5 step S0).
 */
export const ENGAGE_BACKDROP_TRANSPARENT = true;

/** One option row: the two-line task row height (design-device-rendering §3), the same for every row. */
export const ENGAGE_ROW_H = 64;
/** At most five rows per page (D16). */
export const ENGAGE_ROWS_PER_PAGE = 5;
export const ENGAGE_LIST_VIEWPORT = ENGAGE_ROW_H * ENGAGE_ROWS_PER_PAGE;
/** The width the line estimator is tuned for (ui/taskRowLayout.ts); the panel is wider, so estimates err long. */
export {TASK_COLUMN_WIDTH_PX as ENGAGE_TEXT_WIDTH} from '../../ui/taskRowLayout';

export const engageStyles = StyleSheet.create({
  root: {
    flex: 1,
  },
  // 82 % of the width, top at about 12 % of the height.
  panel: {
    position: 'absolute',
    top: '12%',
    left: '9%',
    width: '82%',
    borderWidth: 2,
    borderRadius: RADII.md,
    padding: SPACING.base,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  kindPill: {
    borderWidth: 1,
    borderRadius: RADII.pillSm,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    marginRight: SPACING.sm,
  },
  kindPillText: {
    fontSize: FONT.small,
    fontWeight: '700',
  },
  ownerName: {
    flex: 1,
    fontSize: FONT.medium,
    fontWeight: '700',
  },
  ownerParent: {
    fontSize: FONT.small,
    fontWeight: '400',
  },
  headerButton: {
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
  },
  headerButtonText: {
    fontSize: FONT.medium,
    fontWeight: '700',
  },
  caption: {
    fontSize: FONT.small,
    fontWeight: '600',
    opacity: 0.6,
    marginBottom: SPACING.xs,
  },
  nowBox: {
    borderWidth: 2,
    borderRadius: RADII.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  nowTitle: {
    fontSize: FONT.medium,
    fontWeight: '700',
    marginBottom: SPACING.sm,
    includeFontPadding: false,
  },
  nowDetails: {
    fontSize: FONT.small,
    marginTop: -SPACING.xs,
    marginBottom: SPACING.sm,
    includeFontPadding: false,
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  ackRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  ackText: {
    flex: 1,
    fontSize: FONT.small,
  },
  struck: {
    textDecorationLine: 'line-through',
  },
  link: {
    fontSize: FONT.small,
    fontWeight: '700',
    textDecorationLine: 'underline',
    paddingHorizontal: SPACING.sm,
  },
  row: {
    height: ENGAGE_ROW_H,
    flexDirection: 'row',
    alignItems: 'flex-start',
    borderBottomWidth: 1,
    paddingVertical: 7,
    overflow: 'hidden',
  },
  rowMark: {
    width: 28,
    fontSize: FONT.medium,
    includeFontPadding: false,
  },
  rowText: {
    flex: 1,
    fontSize: FONT.medium,
    includeFontPadding: false,
  },
  signal: {
    fontSize: FONT.medium,
    fontWeight: '700',
    marginBottom: SPACING.md,
  },
  quiet: {
    fontSize: FONT.small,
    marginTop: SPACING.sm,
  },
  marksLine: {
    fontSize: FONT.small,
    fontWeight: '600',
    textDecorationLine: 'underline',
    marginTop: SPACING.sm,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SPACING.md,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
