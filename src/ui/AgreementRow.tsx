/**
 * The one agreement row (docs/dev/history/technical-design-meetings-0.21.md
 * R12, R24): "◇ <words> #tags" on line 1, "since 14.10. · till 31.12."
 * (or "– over", "ended …") on line 2, at the fixed height of a two-line
 * meeting row (57 dp), so lists page by one constant. An ended agreement is
 * struck through. A tap selects it (the screen decides what follows);
 * `extra` renders at the row's right end (Engage's Change / End).
 *
 * `state`: the selected or edited row gets the black 4 dp bar on the left,
 * like a meeting row.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {AgreementRef} from '../domain/agreementOwner';
import {agreementRowDetail} from '../domain/agreementText';
import {isActiveAgreement} from '../domain/agreements';
import {MEETING_ROW_HEIGHT} from './MeetingRow';
import {FONT} from './theme';

export const AGREEMENT_ROW_HEIGHT = MEETING_ROW_HEIGHT.twoLine;

interface Props {
  agreement: AgreementRef;
  today: string;
  onPress?: () => void;
  state?: 'selected' | 'editing';
  /** Shown left of the detail ("from 14.10." etc.). */
  detailPrefix?: string;
  extra?: React.ReactNode;
  textColor: string;
  borderColor: string;
}

export default function AgreementRow(props: Props): React.JSX.Element {
  const {agreement, today, onPress, state, detailPrefix, extra, textColor, borderColor} = props;
  const a = agreement.agreement;
  const detail = [detailPrefix, agreementRowDetail(a, today)].filter(Boolean).join(' · ');
  return (
    <View
      style={[styles.row, {borderBottomColor: borderColor, height: AGREEMENT_ROW_HEIGHT}, state && styles.marked, state === 'selected' && styles.selected]}
      testID="agreement-row">
      <Pressable style={styles.main} onPress={onPress} disabled={!onPress} hitSlop={2}>
        <Text style={[styles.title, {color: textColor}, !isActiveAgreement(a) && styles.struck]} numberOfLines={1}>
          {`◇ ${a.text}`}
        </Text>
        {detail ? (
          <Text style={[styles.sub, {color: textColor}]} numberOfLines={1}>
            {detail}
          </Text>
        ) : null}
      </Pressable>
      {extra}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'stretch', borderBottomWidth: 1},
  marked: {borderLeftWidth: 4, borderLeftColor: '#000000', paddingLeft: 4},
  selected: {backgroundColor: '#e8e8e8'},
  main: {flex: 1, paddingVertical: 7},
  title: {fontSize: FONT.medium, lineHeight: 22, includeFontPadding: false},
  struck: {textDecorationLine: 'line-through'},
  sub: {fontSize: FONT.small, lineHeight: 18, marginTop: 2, opacity: 0.6, includeFontPadding: false},
});
