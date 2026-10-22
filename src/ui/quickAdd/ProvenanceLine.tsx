/**
 * Quick Add's one grey line naming what a screen adds to a new todo in the
 * background (docs/dev/history/technical-design-tending-threads.md §1.5,
 * §3.4; docs/dev/history/technical-design-engage-in-context.md §2.11): the
 * meeting it was agreed in (`↳ from Retro alpha · Tue 30.9.`) and, in the
 * thread overview, the thread tag (`#retro/alpha`). Each part has its own ✕,
 * which drops it for this one todo. The screen builds the labels and decides
 * what to write; this only shows them. It takes Quick Add's R4
 * (docs/dev/history/technical-design-item-card.md K6).
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {FONT} from '../theme';

/** One part of the line. */
export interface QuickAddPart {
  key: string;
  label: string;
  onClear: () => void;
}

/** What a screen adds, at most two parts (provenance, preset tag). */
export type QuickAddAdds = QuickAddPart[];

export default function ProvenanceLine({parts, textColor}: {parts: QuickAddAdds; textColor: string}): React.JSX.Element {
  return (
    <View style={styles.line}>
      {parts.map(part => (
        <View key={part.key} style={styles.part}>
          <Text style={[styles.label, {color: textColor}]} numberOfLines={1}>
            {part.label}
          </Text>
          <Pressable onPress={part.onClear} hitSlop={8} accessibilityRole="button" accessibilityLabel="Drop">
            <Text style={[styles.clear, {color: textColor}]}>✕</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  line: {flexDirection: 'row', alignItems: 'center', flexShrink: 1},
  part: {flexDirection: 'row', alignItems: 'center', flexShrink: 1},
  label: {flexShrink: 1, fontSize: FONT.small, opacity: 0.6},
  clear: {fontSize: FONT.small, fontWeight: '700', paddingHorizontal: 8, opacity: 0.6},
});
