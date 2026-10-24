/**
 * An agreement in Engage's lists (docs/dev/history/technical-design-meetings-0.21.md
 * R12, R13): "◇ <words> #tags" and "since 14.10. · till 31.12." (with
 * "– over" once past). A tap shows Change and End in the row, a second tap
 * hides them. Fixed height `ENGAGE_ROW_H`, like every option row.
 */
import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {AgreementRef} from '../../domain/agreementOwner';
import {agreementRowDetail} from '../../domain/agreementText';
import {ENGAGE_TEXT} from '../../domain/engageText';
import {todayIso} from '../../domain/meetingTime';
import PillButton from '../../ui/PillButton';
import {engageStyles as styles} from './engageStyles';

interface Props {
  agreement: AgreementRef;
  open: boolean;
  onToggle: () => void;
  onChange: () => void;
  onEnd: () => void;
  textColor: string;
  borderColor: string;
}

export default function AgreementOptionRow({agreement, open, onToggle, onChange, onEnd, textColor, borderColor}: Props): React.JSX.Element {
  const a = agreement.agreement;
  return (
    <Pressable onPress={onToggle} style={[styles.row, {borderBottomColor: borderColor}]} testID="agreement-option">
      <Text style={[styles.rowMark, {color: textColor}]}>◇</Text>
      <View style={styles.rowBody}>
        <Text style={[styles.rowText, {color: textColor}]} numberOfLines={1}>
          {a.text}
        </Text>
        <Text style={[styles.rowSub, {color: textColor}]} numberOfLines={1}>
          {agreementRowDetail(a, todayIso())}
        </Text>
      </View>
      {open ? (
        <View style={styles.rowActions}>
          <PillButton label={ENGAGE_TEXT.change} onPress={onChange} textColor={textColor} borderColor={borderColor} />
          <PillButton label={ENGAGE_TEXT.end} onPress={onEnd} textColor={textColor} borderColor={borderColor} />
        </View>
      ) : null}
    </Pressable>
  );
}
