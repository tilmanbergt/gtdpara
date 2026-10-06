/**
 * The small "M" box that marks a meeting as a Month highlight (`#monthly`,
 * docs/dev/technical-design-monthly-view.md §5.1/§5.2). ONE component so the
 * three places it appears always look alike (Tilman, 2026-09-23: "use same
 * small M as on the meeting widget"):
 * - `variant="row"`: a small filled, non-tappable mark in front of a meeting
 *   row's time in every meeting list (ui/MeetingRow.tsx).
 * - `variant="toggle"`: the tappable box left of Quick Add's `+ Add`/`Save`
 *   and in the Month view's day panel - filled when on, outlined when off.
 * Renders nothing for `variant="row"` when `on` is false.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {FONT} from './theme';

interface Props {
  on: boolean;
  variant: 'row' | 'toggle';
  /** Toggle variant only. */
  onPress?: () => void;
  disabled?: boolean;
  /** Toggle variant only: 'normal' (Quick Add, ~30px) or 'large' (day panel, 44px touch target). */
  size?: 'normal' | 'large';
  textColor: string;
}

function inverse(color: string): string {
  const c = color.toLowerCase();
  return c === '#000' || c === '#000000' || c === 'black' ? '#ffffff' : '#000000';
}

export default function HighlightMark({on, variant, onPress, disabled, size = 'normal', textColor}: Props): React.JSX.Element | null {
  if (variant === 'row') {
    if (!on) return null;
    return (
      <View style={[styles.rowMark, {backgroundColor: textColor}]} accessibilityLabel="Month highlight">
        <Text style={[styles.rowMarkText, {color: inverse(textColor)}]}>M</Text>
      </View>
    );
  }
  const box = size === 'large' ? styles.toggleLarge : styles.toggle;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="switch"
      accessibilityState={{checked: on}}
      accessibilityLabel="Month highlight"
      style={[box, {borderColor: textColor}, on && {backgroundColor: textColor}]}>
      <Text style={[size === 'large' ? styles.toggleTextLarge : styles.toggleText, {color: on ? inverse(textColor) : textColor}]}>
        M
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  rowMark: {
    width: 18,
    height: 18,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  rowMarkText: {
    fontSize: 12,
    fontWeight: '700',
  },
  toggle: {
    width: 30,
    height: 30,
    borderWidth: 1.5,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  toggleLarge: {
    width: 44,
    height: 44,
    borderWidth: 1.5,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: {
    fontSize: FONT.small,
    fontWeight: '700',
  },
  toggleTextLarge: {
    fontSize: FONT.medium,
    fontWeight: '700',
  },
});
