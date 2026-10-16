/**
 * Shared styles of the Engage panel (docs/dev/history/technical-design-engage.md
 * §3.7): only values from ui/theme.ts.
 */
import {StyleSheet} from 'react-native';
import {COLORS, FONT, RADII, SPACING} from '../../ui/theme';

/**
 * Whether the panel's root lets the note show around it. The plugin view is
 * always full screen; whether the host draws the note behind a transparent
 * root is decided on the device (design §3.7, step S0).
 */
export const ENGAGE_BACKDROP_TRANSPARENT = true;

export const engageStyles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: ENGAGE_BACKDROP_TRANSPARENT ? 'transparent' : COLORS.background,
  },
  // 82 % of the width, top at about 12 % of the height, so the panel's
  // inputs stay in the upper two thirds (DEVELOPMENT-POLICY §4).
  panel: {
    position: 'absolute',
    top: '12%',
    left: '9%',
    width: '82%',
    backgroundColor: COLORS.background,
    borderWidth: 2,
    borderColor: COLORS.accent,
    borderRadius: RADII.md,
    padding: SPACING.base,
  },
  heading: {
    fontSize: FONT.medium,
    fontWeight: '700',
    marginBottom: SPACING.sm,
  },
  line: {
    fontSize: FONT.small,
    marginBottom: SPACING.xs,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: SPACING.md,
  },
});
