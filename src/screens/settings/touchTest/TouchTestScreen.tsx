/**
 * Settings → Advanced → Touch test (docs/dev/history/technical-design-touch-test.md):
 * a diagnostic that finds out where and why finger taps get lost. It
 * changes nothing; it records.
 *
 * Two columns of the normal two-column width, so rows wrap exactly as on
 * Daily and Current: the test column (TestColumn.tsx) with sample rows down
 * to the bottom edge, and the info column (InfoColumn.tsx). "⇄ Swap sides"
 * puts the test column on the other side; the side is part of every record.
 * The session logic is useTouchSession.ts.
 */
import React from 'react';
import {StyleSheet, View} from 'react-native';
import {COLORS, SPACING, useThemeColors} from '../../../ui/theme';
import InfoColumn from './InfoColumn';
import TestColumn from './TestColumn';
import {useTouchSession} from './useTouchSession';

export default function TouchTestScreen({onClose}: {onClose: () => void}): React.JSX.Element {
  const {textColor, borderColor} = useThemeColors();
  const session = useTouchSession();
  const test = (
    <View key="test" style={styles.column}>
      <TestColumn onTouch={session.handleTouch} last={session.lastHit} textColor={textColor} borderColor={borderColor} />
    </View>
  );
  const info = (
    <View key="info" style={[styles.column, styles.info]}>
      <InfoColumn session={session} onClose={onClose} textColor={textColor} borderColor={borderColor} />
    </View>
  );
  const gutter = <View key="gutter" style={styles.gutter} />;
  return <View style={styles.screen}>{session.side === 'left' ? [test, gutter, info] : [info, gutter, test]}</View>;
}

const styles = StyleSheet.create({
  screen: {flex: 1, flexDirection: 'row', paddingHorizontal: SPACING.base, backgroundColor: COLORS.background},
  column: {flex: 1},
  info: {paddingTop: SPACING.sm},
  gutter: {width: SPACING.base},
});
