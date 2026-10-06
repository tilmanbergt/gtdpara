/**
 * Tag chips in wrapped rows, no paging (docs/dev/technical-design-lasso-0.8.md
 * §3.9) - the capture panel has the room Quick Add's single paged row
 * (ui/TagChips.tsx) doesn't. A tap toggles the tag; "on" chips are filled.
 * Also used for the "File to" abbreviation chips. Labels longer than
 * `maxLabelChars` are shortened with "…".
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {COLORS, FONT} from './theme';

export interface GridChip {
  key: string;
  label: string;
  on: boolean;
  onPress: () => void;
}

interface Props {
  chips: GridChip[];
  textColor: string;
  borderColor: string;
  /** Chips beyond this count are left out (keeps the block within its rows). */
  maxChips?: number;
  maxLabelChars?: number;
}

const HIT_SLOP = {top: 4, bottom: 4, left: 4, right: 4};

export function shortLabel(label: string, max: number): string {
  return label.length > max ? `${label.slice(0, max)}…` : label;
}

export default function TagChipGrid({chips, textColor, borderColor, maxChips = 24, maxLabelChars = 16}: Props): React.JSX.Element {
  return (
    <View style={styles.grid}>
      {chips.slice(0, maxChips).map(chip => (
        <Pressable
          key={chip.key}
          onPress={chip.onPress}
          hitSlop={HIT_SLOP}
          style={[styles.chip, {borderColor: chip.on ? COLORS.accent : borderColor}, chip.on && styles.chipOn]}>
          <Text style={[styles.text, {color: chip.on ? COLORS.accentText : textColor}]} numberOfLines={1}>
            {shortLabel(chip.label, maxLabelChars)}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center'},
  chip: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
    marginBottom: 8,
  },
  chipOn: {backgroundColor: COLORS.accent},
  text: {fontSize: FONT.small, fontWeight: '600'},
});
