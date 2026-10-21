/**
 * The info column's verdict on the last test tap: two big buttons,
 * Intended and Not intended, and Skip. After Not intended a hint asks for
 * the tap on what was meant; useTouchSession.ts stores it.
 */
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {TouchVerdict} from '../../../domain/touchDiag';
import PillButton from '../../../ui/PillButton';
import {FONT, SPACING} from '../../../ui/theme';

interface Props {
  enabled: boolean;
  verdict: TouchVerdict | null;
  awaitingIntended: boolean;
  onJudge: (verdict: TouchVerdict | null) => void;
  textColor: string;
  borderColor: string;
}

export default function VerdictButtons({enabled, verdict, awaitingIntended, onJudge, textColor, borderColor}: Props): React.JSX.Element {
  const pill = {textColor, borderColor, disabled: !enabled};
  return (
    <View style={styles.box}>
      <View style={styles.row}>
        <PillButton label="Intended" size="large" primary={verdict === 'intended'} onPress={() => onJudge('intended')} {...pill} />
        <PillButton label="Not intended" size="large" primary={verdict === 'notIntended'} onPress={() => onJudge('notIntended')} {...pill} />
        <PillButton label="Skip" onPress={() => onJudge(null)} {...pill} />
      </View>
      {awaitingIntended && <Text style={[styles.hint, {color: textColor}]}>Tap what you meant (use the pen)</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {marginTop: SPACING.md},
  row: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap'},
  hint: {fontSize: FONT.medium, fontWeight: '700'},
});
