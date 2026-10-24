/**
 * The meeting line on a meeting's page (docs/dev/history/technical-design-meetings-0.21.md
 * R1-R3, §4.3): the meeting's title, day and time on the left; the switch
 * Before · During · After on the right - three small pills, the chosen one
 * filled black. Time preselects the moment; a tap chooses another one, kept
 * for this meeting while the plugin runs (ui/meetingMomentStore.ts). One row,
 * about 36 dp.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {MOMENT_LABELS, momentLineText} from '../../domain/engageText';
import {MEETING_MOMENTS, MeetingMoment} from '../../domain/meetingMoment';
import {todayIso} from '../../domain/meetingTime';
import {Meeting} from '../../domain/types';
import {COLORS, FONT, RADII, SPACING} from '../../ui/theme';

interface Props {
  meeting: Meeting;
  moment: MeetingMoment;
  onChoose: (moment: MeetingMoment) => void;
  textColor: string;
}

export const MOMENT_LINE_HEIGHT = 36;

export default function MomentLine({meeting, moment, onChoose, textColor}: Props): React.JSX.Element {
  return (
    <View style={styles.row} testID="moment-line">
      <Text style={[styles.text, {color: textColor}]} numberOfLines={1}>
        {momentLineText(meeting, todayIso())}
      </Text>
      <View style={styles.switch}>
        {MEETING_MOMENTS.map(m => {
          const on = m === moment;
          return (
            <Pressable
              key={m}
              onPress={() => onChoose(m)}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={MOMENT_LABELS[m]}
              accessibilityState={{selected: on}}
              style={[styles.pill, {borderColor: textColor}, on && styles.pillOn]}>
              <Text style={[styles.pillText, {color: on ? COLORS.accentText : textColor}]}>{MOMENT_LABELS[m]}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {height: MOMENT_LINE_HEIGHT, flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.xs},
  text: {flex: 1, fontSize: FONT.medium, fontWeight: '600', includeFontPadding: false},
  switch: {flexDirection: 'row', marginLeft: SPACING.sm},
  pill: {borderWidth: 1, borderRadius: RADII.pillSm, paddingHorizontal: SPACING.sm, paddingVertical: 3, marginLeft: SPACING.xs},
  pillOn: {backgroundColor: COLORS.accent, borderColor: COLORS.accent},
  pillText: {fontSize: FONT.small, fontWeight: '700'},
});
