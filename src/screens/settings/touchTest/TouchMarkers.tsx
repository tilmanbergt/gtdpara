/**
 * One small glyph per classified touch at its start point, drawn over the
 * touch test's target area and never in the way of a touch
 * (`pointerEvents="none"`). Black and grey only: ● handled, ○ cancelled,
 * × no target, ◐ swallowed by `#next`. The newest MAX_MARKERS stay.
 */
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {TOUCH_GLYPH, TouchEntry} from '../../../domain/touchDiag';
import {FONT} from '../../../ui/theme';

const MAX_MARKERS = 200;
// Half the glyph box, so the glyph's centre sits on the touch point.
const HALF_W = 5;
const HALF_H = 10;

interface Props {
  entries: readonly TouchEntry[];
  /** Page position of the area's top-left corner (entries are in page coordinates). */
  originX: number;
  originY: number;
}

export default function TouchMarkers({entries, originX, originY}: Props): React.JSX.Element {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {entries.slice(-MAX_MARKERS).map(e => (
        <Text key={e.id} style={[styles.marker, {left: e.x - originX - HALF_W, top: e.y - originY - HALF_H}]}>
          {TOUCH_GLYPH[e.cls]}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  marker: {
    position: 'absolute',
    fontSize: FONT.small,
    lineHeight: 2 * HALF_H,
    color: '#000000',
    includeFontPadding: false,
  },
});
