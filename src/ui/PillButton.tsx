/**
 * The app's rounded action button as a shared component (docs/technical-
 * design-project-close-out.md §8.1). Same look as the `pill` style several
 * screens declare locally (ReviewScreen's styles.pill: 1px border, radius
 * 14, small bold label) - new code uses this instead of copying it again.
 *
 * - `primary`: black fill, white label - the one main action on a screen.
 *   Grayscale by construction (ui/theme.ts: accent is a FILL colour, never a
 *   text colour).
 * - `size: 'large'`: a 44px-high target for a screen's main actions (wizard
 *   footers); the default stays the compact inline pill.
 */
import React from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';
import {COLORS, FONT, RADII} from './theme';

interface Props {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  size?: 'small' | 'large';
  textColor: string;
  borderColor: string;
}

const HIT_SLOP = {top: 8, bottom: 8, left: 8, right: 8};

export default function PillButton({label, onPress, primary, disabled, size = 'small', textColor, borderColor}: Props): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={HIT_SLOP}
      style={[
        styles.pill,
        size === 'large' && styles.large,
        {borderColor: primary ? COLORS.accent : borderColor},
        primary && styles.primary,
        disabled && styles.disabled,
      ]}>
      <Text style={[styles.text, size === 'large' && styles.textLarge, {color: primary ? COLORS.accentText : textColor}]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    borderWidth: 1,
    borderRadius: RADII.pillMd,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 8,
    marginBottom: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  large: {
    minHeight: 44,
    paddingHorizontal: 18,
    borderWidth: 2,
  },
  primary: {
    backgroundColor: COLORS.accent,
  },
  disabled: {
    opacity: 0.3,
  },
  text: {
    fontSize: FONT.small,
    fontWeight: '600',
  },
  textLarge: {
    fontSize: FONT.medium,
  },
});
