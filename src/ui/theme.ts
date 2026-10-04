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
 *
 * Before this, the app used eight distinct sizes (13-22px) scattered across
 * Home/ItemDetail/ProjectDataPanel/Settings. This collapses them to three,
 * nudging most of them up by roughly a pixel for readability, while leaving
 * the single largest size (headings) unchanged.
 */
export const FONT = {
  large: 22,
  medium: 17,
  small: 15,
} as const;

/**
 * Colors used across two or more screens (2026-09-14 style cleanup pass -
 * docs/dev/technical-design-style-cleanup.md). `accent` collects what used to
 * be a handful of separately-declared `const ACCENT = '#2f6feb'`s
 * (DailyView.tsx, TaskRow.tsx, and others); the light/dark pairs collect
 * the `isDarkMode ? a : b` triad every screen using `useColorScheme()`
 * repeated inline - see `useThemeColors()` below for the actual pairing.
 *
 * `accent` is black (2026-09-14 grayscale pass -
 * docs/dev/technical-design-pagination-grayscale-proposal.md §2), not a
 * color - the device is grayscale/e-ink only. It is a FILL/BORDER color
 * ONLY (chip/pill/button backgrounds, active-tab underline, editing-row
 * left border) - never apply it as a plain text `color`, since on this
 * device it now reads identically to ordinary black body text. Where a
 * color-era screen would have reached for colored text, use
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
 * Spacing scale. Values are exactly what was already in use throughout the
 * app (margins/paddings/gaps of 4-24px) - this names them rather than
 * introducing new numbers.
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
 * differently-sized pills/buttons today, and forcing one value would be a
 * visual change, not a dedup.
 */
export const RADII = {
  sm: 4,
  md: 6,
  pillSm: 12,
  pillMd: 14,
  pillLg: 16,
} as const;

/**
 * Replaces the `isDarkMode`/`textColor`/`borderColor`/`placeholderColor`
 * 4-line block that DailyView.tsx and ReviewScreen.tsx both declared
 * identically at the top of their component. Screens destructure the same
 * names from this hook's return value, so call sites elsewhere in a screen
 * don't need to change.
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
