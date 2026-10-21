/**
 * Settings → Advanced → Touch test (docs/dev/history/technical-design-touch-test.md):
 * a diagnostic that finds out where and why finger taps get lost. It
 * changes nothing; it records.
 *
 * Two columns of the normal two-column width, so rows wrap exactly as on
 * Daily and Current: the test column (TestColumn.tsx) with sample rows down
 * to the bottom edge, and the info column with the controls and what the
 * last tap hit. The session logic is useTouchSession.ts.
 */
import React from 'react';
import {PixelRatio, StyleSheet, Text, View} from 'react-native';
import {describeTouch, touchFacts} from '../../../domain/touchDiag';
import PillButton from '../../../ui/PillButton';
import {COLORS, FONT, SPACING, useThemeColors} from '../../../ui/theme';
import {setAppWideTouchLog, useAppWideTouchLog, useTouchEntries} from '../../../utils/touchDiagStore';
import TestColumn from './TestColumn';
import {useTouchSession} from './useTouchSession';

export default function TouchTestScreen({onClose}: {onClose: () => void}): React.JSX.Element {
  const {textColor, borderColor} = useThemeColors();
  const session = useTouchSession();
  const entries = useTouchEntries();
  const appWide = useAppWideTouchLog();
  const pill = {textColor, borderColor};
  const last = session.last;
  return (
    <View style={styles.screen}>
      <View style={[styles.column, styles.columnLeft]}>
        <TestColumn onTouch={session.handleTouch} last={session.lastHit} textColor={textColor} borderColor={borderColor} />
      </View>
      <View style={styles.column}>
        <View style={styles.controls}>
          <PillButton label="Finger" primary={session.mode === 'finger'} onPress={() => session.setMode('finger')} {...pill} />
          <PillButton label="Pen" primary={session.mode === 'pen'} onPress={() => session.setMode('pen')} {...pill} />
          <PillButton label={`Log touches everywhere: ${appWide ? 'ON' : 'OFF'}`} primary={appWide} onPress={() => setAppWideTouchLog(!appWide)} {...pill} />
          <PillButton label="Clear" onPress={session.clear} {...pill} />
          <PillButton label="Save log" onPress={session.save} disabled={entries.length === 0} {...pill} />
          <PillButton label="Close" onPress={onClose} {...pill} />
        </View>
        <Text style={[styles.text, {color: textColor}]}>{last ? describeTouch(last, PixelRatio.get()) : 'No touch received yet.'}</Text>
        {last && <Text style={[styles.text, styles.hint, {color: textColor}]}>{touchFacts(last, PixelRatio.get())}</Text>}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {flex: 1, flexDirection: 'row', paddingHorizontal: SPACING.base, backgroundColor: COLORS.background},
  column: {flex: 1},
  columnLeft: {marginRight: SPACING.base},
  controls: {flexDirection: 'row', flexWrap: 'wrap', paddingTop: SPACING.sm},
  text: {fontSize: FONT.medium},
  hint: {fontSize: FONT.small, opacity: 0.6},
});
