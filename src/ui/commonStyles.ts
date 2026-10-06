/**
 * Style objects shared by two or more screens
 * (docs/dev/technical-design-style-cleanup.md), e.g. DailyView.tsx and
 * ReviewScreen.tsx. Keeping them here means retuning one of them retunes
 * every screen that uses it, and a screen's own StyleSheet only holds what's
 * actually specific to that screen.
 *
 * Import as `import {common} from '../ui/commonStyles'` and reference
 * e.g. `common.container` in place of a screen's own `styles.container`.
 */
import {StyleSheet} from 'react-native';
import {COLORS, FONT, SPACING} from './theme';

export const common = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    paddingTop: SPACING.base,
    paddingHorizontal: SPACING.base,
  },
  content: {
    flex: 1,
  },
  spacer: {
    marginTop: SPACING.lg,
  },
  column: {
    flex: 1,
  },
  columnLeft: {
    marginRight: SPACING.base,
  },
  divider: {
    height: 1,
    marginVertical: SPACING.md,
  },
  subheading: {
    fontSize: FONT.small,
    fontWeight: '600',
    opacity: 0.6,
    marginTop: SPACING.sm,
    marginBottom: SPACING.xs,
  },
  sectionSpacingSmall: {
    marginTop: SPACING.md,
  },
  hint: {
    fontSize: FONT.medium,
    opacity: 0.6,
    marginBottom: SPACING.sm,
  },
  error: {
    fontSize: FONT.small,
    marginTop: 6,
  },
  retryText: {
    fontSize: FONT.medium,
    fontWeight: '600',
    marginTop: SPACING.sm,
  },
  rowSource: {
    fontSize: FONT.small,
    opacity: 0.6,
    marginTop: 2,
  },
  /**
   * The small button strip that hovers flush above a focused text field,
   * right-aligned (All/Copy/Cut/Paste in ui/ClipboardTextInput.tsx and
   * QuickAddWidget, -1/Today/+1/+7 in ui/DateInput.tsx). Absolutely
   * positioned, so it costs no layout space; the field's wrapper must be
   * `position: 'relative'`. Pair with a `display: 'none'` style while the
   * field isn't focused (kept mounted so taps aren't lost).
   */
  floatingStrip: {
    position: 'absolute',
    right: 0,
    bottom: '100%',
    marginBottom: 3,
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 3,
    zIndex: 20,
    elevation: 4,
  },
  floatingStripButton: {
    borderWidth: 1,
    borderRadius: 3,
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginLeft: 3,
  },
  floatingStripButtonText: {
    fontSize: FONT.small,
  },
});
