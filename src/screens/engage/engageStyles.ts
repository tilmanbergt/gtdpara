/**
 * Shared styles of the Engage panel (docs/dev/history/technical-design-engage.md
 * §3.7): only values from ui/theme.ts.
 *
 * Budget on the A5 X (docs/dev/design-device-rendering.md §5-6, dp): the
 * panel starts at 12 % of the height under the 36 dp status slot (~195 dp)
 * and is at most ~760 dp tall on its fullest screen, a meeting's page: header
 * ~40, meeting line 36 + strip ~44 (docs/dev/history/technical-design-meetings-0.21.md
 * §4.3; "Next here" ~30 is hidden there), Now box ~130, ack line ~30, tabs
 * ~45 + list header ~31 + 5 rows × 64 (a From caption is 28 inside the same
 * box), collapsed Quick Add ~40, footer ~44, padding 32. It ends near 955 dp
 * of 1325; Quick Add's field (which replaces the list when open) still sits
 * near the top of the panel, in the upper two thirds (DEVELOPMENT-POLICY §4).
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
/** A From group's caption row ("Tue 14.10. · Sparring Mieke"); captions take room inside the same viewport. */
export const ENGAGE_CAPTION_H = 28;
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
  /** "Continue with …" and "Go to … ›" near the bottom: quiet links, regular weight. */
  backLine: {
    fontSize: FONT.medium,
    textDecorationLine: 'underline',
    marginTop: SPACING.xs,
    marginBottom: SPACING.sm,
  },
  /** "Next here: … ›" under the header: a link, one line. */
  meetingNext: {
    fontSize: FONT.small,
    fontWeight: '600',
    textDecorationLine: 'underline',
    marginBottom: SPACING.sm,
  },
  /** "Today next: …" above the footer: quiet, not a link. */
  meetingToday: {
    fontSize: FONT.small,
    opacity: 0.6,
    marginTop: SPACING.sm,
  },
  /** "Also here: …" under the tabs. */
  alsoHere: {
    fontSize: FONT.small,
    marginTop: SPACING.sm,
  },
  alsoHereLink: {
    fontWeight: '700',
    textDecorationLine: 'underline',
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
  nowRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  nowMain: {
    flex: 1,
  },
  // The Now box's Done: one large check box on the right (FONT.large in a 56 dp square).
  doneBox: {
    width: 56,
    height: 56,
    marginLeft: SPACING.md,
    borderWidth: 2,
    borderRadius: RADII.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneMark: {
    fontSize: FONT.large,
    fontWeight: '700',
    includeFontPadding: false,
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
  /** The Now box's meeting link. */
  nowLink: {
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  /** The moment strip under the meeting line (~44 dp with its gap). */
  stripRow: {
    marginBottom: SPACING.sm,
  },
  /** A From group's caption row in the option list. */
  groupCaption: {
    height: ENGAGE_CAPTION_H,
    justifyContent: 'flex-end',
    paddingBottom: 2,
  },
  /** A row whose todo is done: struck, quiet. */
  rowDone: {
    textDecorationLine: 'line-through',
    opacity: 0.6,
  },
  /** A line's quiet part (the loop line's counts). */
  quietText: {
    fontSize: FONT.small,
    opacity: 0.7,
  },
  /** A link inside a line: no bottom margin of its own. */
  inline: {
    marginBottom: 0,
    flexShrink: 1,
  },
  /** The loop owner's line under the header (R16). */
  loopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
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
  rowActions: {
    flexDirection: 'row',
    marginLeft: SPACING.sm,
  },
  rowText: {
    flex: 1,
    fontSize: FONT.medium,
    includeFontPadding: false,
  },
  /** An agreement row's two lines. */
  rowBody: {
    flex: 1,
  },
  rowSub: {
    fontSize: FONT.small,
    opacity: 0.6,
    marginTop: 2,
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
