/**
 * Style objects shared by two or more screens (2026-09-14 style cleanup
 * pass - docs/dev/technical-design-style-cleanup.md). These were found
 * byte-identical across DailyView.tsx and ReviewScreen.tsx's own local
 * `StyleSheet.create` blocks; pulling them out here means retuning one of
 * them retunes every screen that uses it, and a screen's own StyleSheet
 * now only holds what's actually specific to that screen.
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
});
