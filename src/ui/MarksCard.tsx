/**
 * "n marks to process" (docs/dev/history/technical-design-lasso-0.8.md §3.10): one
 * fixed-height row under Quick Add on the Inbox, Current and Review's Inbox
 * to zero, shown only while there are open marks. "Process ›" opens the
 * marks screen for the same scope; Close there comes back here.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {marksSummaryLine, MarkScope, summarizeMarks} from '../domain/marks';
import {todayIso} from '../domain/meetingTime';
import {openMarks, MarksReturnTo} from './marksNav';
import {FONT} from './theme';
import {useOpenMarks} from './useOpenMarks';

export const MARKS_CARD_H = 56;

interface Props {
  scope: MarkScope;
  returnTo: MarksReturnTo;
  textColor: string;
  borderColor: string;
}

export default function MarksCard({scope, returnTo, textColor, borderColor}: Props): React.JSX.Element | null {
  const marks = useOpenMarks(scope);
  if (marks.length === 0) {return null;}
  const summary = summarizeMarks(marks, todayIso());
  return (
    <Pressable
      onPress={() => openMarks(scope, returnTo)}
      hitSlop={4}
      accessibilityRole="button"
      style={[styles.card, {borderColor}]}>
      <View style={styles.texts}>
        <Text style={[styles.title, {color: textColor}]} numberOfLines={1}>
          {summary.count} mark{summary.count === 1 ? '' : 's'} to process
        </Text>
        <Text style={[styles.sub, {color: textColor}]} numberOfLines={1}>
          {marksSummaryLine(summary)}
        </Text>
      </View>
      <Text style={[styles.action, {color: textColor}]}>Process ›</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    height: MARKS_CARD_H,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 6,
    paddingHorizontal: 12,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  texts: {flex: 1},
  title: {fontSize: FONT.medium, fontWeight: '700'},
  sub: {fontSize: FONT.small, opacity: 0.8},
  action: {fontSize: FONT.medium, fontWeight: '700', marginLeft: 12},
});
