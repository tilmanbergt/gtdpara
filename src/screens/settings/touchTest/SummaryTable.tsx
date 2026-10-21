/**
 * The info column's counts (domain/touchDiag.ts's countTouches): one row
 * per mode and side, one column per screen band, each cell the classes on
 * one line and the verdicts on the next.
 */
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {cellLines, countTouches, TOUCH_BANDS, TOUCH_GLYPH, TOUCH_MODES, TOUCH_SIDES, TouchEntry} from '../../../domain/touchDiag';
import {FONT, SPACING} from '../../../ui/theme';

const LEGEND =
  `${TOUCH_GLYPH.handled} handled  ${TOUCH_GLYPH.swallowed} swallowed  ${TOUCH_GLYPH.cancelled} cancelled  ` +
  `${TOUCH_GLYPH.noTarget} nothing hit  ${TOUCH_GLYPH.intended} intended  ${TOUCH_GLYPH.notIntended} not intended`;

interface Props {
  entries: readonly TouchEntry[];
  textColor: string;
  borderColor: string;
}

export default function SummaryTable({entries, textColor, borderColor}: Props): React.JSX.Element {
  const counts = countTouches(entries);
  const text = [styles.text, {color: textColor}];
  return (
    <View style={styles.box}>
      <View style={[styles.row, {borderBottomColor: borderColor}]}>
        <Text style={[text, styles.label]} />
        {TOUCH_BANDS.map(band => (
          <Text key={band} style={[text, styles.cell, styles.bold]}>
            {band}
          </Text>
        ))}
      </View>
      {TOUCH_MODES.flatMap(mode =>
        TOUCH_SIDES.map(side => (
          <View key={`${mode}-${side}`} style={[styles.row, {borderBottomColor: borderColor}]}>
            <Text style={[text, styles.label, styles.bold]}>
              {mode === 'finger' ? 'Finger' : 'Pen'} · {side}
            </Text>
            {TOUCH_BANDS.map(band => (
              <Text key={band} style={[text, styles.cell]}>
                {cellLines(counts[mode][side][band]).join('\n')}
              </Text>
            ))}
          </View>
        )),
      )}
      <Text style={[text, styles.legend]}>{LEGEND}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {marginTop: SPACING.lg},
  row: {flexDirection: 'row', borderBottomWidth: 1, paddingVertical: SPACING.xs},
  text: {fontSize: FONT.small},
  label: {width: 96},
  cell: {flex: 1},
  bold: {fontWeight: '700'},
  legend: {opacity: 0.6, marginTop: SPACING.xs},
});
