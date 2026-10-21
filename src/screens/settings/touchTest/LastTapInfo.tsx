/**
 * The info column's "Last tap": what the last test tap hit, in words
 * (domain/touchDiag.ts's describeTouch), its position, band, movement and
 * duration, and what Tilman said he meant. The count of taps received is the
 * check for H1: a tap that doesn't raise it never reached gtdpara.
 */
import React from 'react';
import {PixelRatio, StyleSheet, Text, View} from 'react-native';
import {describeTouch, NO_TARGET, targetWords, touchFacts, TouchEntry} from '../../../domain/touchDiag';
import {FONT, SPACING} from '../../../ui/theme';

interface Props {
  last: TouchEntry | null;
  received: number;
  textColor: string;
}

export default function LastTapInfo({last, received, textColor}: Props): React.JSX.Element {
  const pxPerDp = PixelRatio.get();
  const meant = last?.intendedTarget ? (last.intendedTarget === NO_TARGET ? 'nothing tappable' : targetWords(last.intendedTarget)) : null;
  return (
    <View style={styles.box}>
      <Text style={[styles.heading, {color: textColor}]}>Last tap</Text>
      <Text style={[styles.main, {color: textColor}]}>{last ? describeTouch(last, pxPerDp) : 'No touch received yet.'}</Text>
      {last && <Text style={[styles.small, {color: textColor}]}>{touchFacts(last, pxPerDp)}</Text>}
      {meant && <Text style={[styles.small, {color: textColor}]}>You meant: {meant}</Text>}
      <Text style={[styles.small, styles.hint, {color: textColor}]}>
        Taps received: {received}. No new frame and no change here after a tap: no touch was received.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {marginTop: SPACING.md},
  heading: {fontSize: FONT.small, fontWeight: '700', opacity: 0.6},
  main: {fontSize: FONT.medium, fontWeight: '700', marginTop: SPACING.xs},
  small: {fontSize: FONT.small, marginTop: SPACING.xs},
  hint: {opacity: 0.6},
});
