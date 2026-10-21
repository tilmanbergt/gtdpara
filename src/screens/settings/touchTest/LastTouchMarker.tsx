/**
 * Where the last touch was, drawn over the test column and never in the way
 * of a touch (`pointerEvents="none"`): a small black dot at the raw start
 * point, so "where my finger was" shows next to the framed part that got
 * hit; a × instead when nothing was hit. Only the last touch is shown.
 */
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {COLORS, FONT} from '../../../ui/theme';

const DOT = 8;
const CROSS_BOX = 20;

interface Props {
  /** The touch's start point, relative to the column. */
  x: number;
  y: number;
  noTarget: boolean;
}

export default function LastTouchMarker({x, y, noTarget}: Props): React.JSX.Element {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {noTarget ? (
        <Text style={[styles.cross, {left: x - CROSS_BOX / 2, top: y - CROSS_BOX / 2}]}>×</Text>
      ) : (
        <View style={[styles.dot, {left: x - DOT / 2, top: y - DOT / 2}]} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dot: {position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: COLORS.accent},
  cross: {
    position: 'absolute',
    width: CROSS_BOX,
    height: CROSS_BOX,
    lineHeight: CROSS_BOX,
    textAlign: 'center',
    fontSize: FONT.large,
    fontWeight: '700',
    color: COLORS.accent,
    includeFontPadding: false,
  },
});
