/**
 * D / W / M focus-level badges (docs/dev/technical-design-monthly-view.md §5.3) -
 * Tilman, 2026-09-23: "there should be clear way to distinguish daily,
 * weekly, monthly focus". Shows one small letter box per level the item is
 * focused at; the level of the current view (`active`) is filled, the others
 * outlined. Grayscale-safe (letters, not colors) for the e-ink screen.
 */
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {FOCUS_SCOPES, FocusScope} from '../storage/focusSlots';

const ORDER: FocusScope[] = ['daily', 'weekly', 'monthly'];

interface Props {
  item: {dailyFocus: boolean; weeklyFocus: boolean; monthlyFocus: boolean};
  /** The current view's level - drawn filled. */
  active?: FocusScope;
  /** Show only these levels (default: all three). */
  scopes?: FocusScope[];
  textColor: string;
}

function inverse(color: string): string {
  const c = color.toLowerCase();
  return c === '#000' || c === '#000000' || c === 'black' ? '#ffffff' : '#000000';
}

export default function FocusBadges({item, active, scopes = ORDER, textColor}: Props): React.JSX.Element | null {
  const shown = ORDER.filter(s => scopes.includes(s) && item[FOCUS_SCOPES[s].field]);
  if (shown.length === 0) return null;
  return (
    <View style={styles.row}>
      {shown.map(s => (
        <FocusLetter key={s} scope={s} filled={s === active} textColor={textColor} />
      ))}
    </View>
  );
}

/** One D/W/M box - also used standalone next to the Project page's focus checkboxes. */
export function FocusLetter({scope, filled, textColor}: {scope: FocusScope; filled: boolean; textColor: string}): React.JSX.Element {
  return (
    <View style={[styles.box, {borderColor: textColor}, filled && {backgroundColor: textColor}]}>
      <Text style={[styles.letter, {color: filled ? inverse(textColor) : textColor}]}>{FOCUS_SCOPES[scope].letter}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 6,
  },
  box: {
    width: 22,
    height: 20,
    borderWidth: 1.5,
    borderRadius: 3,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 3,
  },
  letter: {
    fontSize: 12,
    fontWeight: '700',
  },
});
