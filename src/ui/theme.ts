/**
 * Shared style constants every screen reads from, instead of each
 * StyleSheet hard-coding its own numbers. Adjust the values below to
 * retune the whole app at once.
 */
import {useColorScheme} from 'react-native';

/**
 * FONT.large  - screen/section headings only (e.g. "GtdPara", "Settings").
 * FONT.medium - the bulk of the UI: body text, list entries, buttons,
 *               section titles, inputs.
 * FONT.small  - secondary/caption text: hints, breadcrumbs, path
 *               previews, tag-like labels.
 */
export const FONT = {
  large: 22,
  medium: 17,
  small: 15,
} as const;

/**
 * Colors used across two or more screens
 * (docs/dev/technical-design-style-cleanup.md). The light/dark pairs are
 * resolved by `useThemeColors()` below.
 *
 * `accent` is black (docs/dev/technical-design-pagination-grayscale-proposal.md
 * §2), not a color - the device is grayscale/e-ink only. It is a FILL/BORDER color
 * ONLY (chip/pill/button backgrounds, active-tab underline, editing-row
 * left border) - never apply it as a plain text `color`, since on this
 * device it reads identically to ordinary black body text. Instead of
 * colored text, use
 * `fontWeight: '700'` and/or `textDecorationLine: 'underline'` instead
 * (see `ui/TaskLabels.tsx`'s doc comment for the same "grayscale-safe by
 * construction" principle applied to todo labels).
 */
export const COLORS = {
  background: '#ffffff',
  textLight: '#000000',
  textDark: '#ffffff',
  borderLight: '#dddddd',
  borderDark: '#333333',
  placeholderLight: '#999999',
  placeholderDark: '#888888',
  accent: '#000000',
  accentText: '#ffffff',
} as const;

/**
 * Spacing scale for margins, paddings and gaps (4-24px).
 */
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
} as const;

/**
 * Border radii. Three different pill radii (12/14/16) are kept as distinct
 * named constants rather than collapsed to one - they're used for
 * differently-sized pills/buttons, and one value would change how they look.
 */
export const RADII = {
  sm: 4,
  md: 6,
  pillSm: 12,
  pillMd: 14,
  pillLg: 16,
} as const;

/**
 * The current color scheme's `isDarkMode`/`textColor`/`borderColor`/
 * `placeholderColor`, for screens to destructure at the top of their component.
 */
export function useThemeColors() {
  const isDarkMode = useColorScheme() === 'dark';
  return {
    isDarkMode,
    textColor: isDarkMode ? COLORS.textDark : COLORS.textLight,
    borderColor: isDarkMode ? COLORS.borderDark : COLORS.borderLight,
    placeholderColor: isDarkMode ? COLORS.placeholderDark : COLORS.placeholderLight,
  };
}
