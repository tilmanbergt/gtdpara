/**
 * Quick Add's one grey line when a new todo is linked to a meeting in the
 * background (docs/dev/history/technical-design-tending-threads.md §1.5, §3.4):
 * `↳ from Retro alpha · Tue 30.9.`, with ✕ to drop the link for this one
 * todo. The screen builds the
 * label (domain/provenance.ts's `provenanceLabel`) and decides what to write;
 * this only shows it. 34 dp high.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {FONT} from '../theme';

export interface QuickAddProvenance {
  label: string;
  onClear: () => void;
}

export const PROVENANCE_LINE_HEIGHT = 34;

export default function ProvenanceLine({provenance, textColor}: {provenance: QuickAddProvenance; textColor: string}): React.JSX.Element {
  return (
    <View style={styles.line}>
      <Text style={[styles.label, {color: textColor}]} numberOfLines={1}>
        {provenance.label}
      </Text>
      <Pressable onPress={provenance.onClear} hitSlop={8} accessibilityRole="button" accessibilityLabel="Drop">
        <Text style={[styles.clear, {color: textColor}]}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  line: {flexDirection: 'row', alignItems: 'center', height: PROVENANCE_LINE_HEIGHT},
  label: {flex: 1, fontSize: FONT.small, opacity: 0.6},
  clear: {fontSize: FONT.small, fontWeight: '700', paddingHorizontal: 8, opacity: 0.6},
});
