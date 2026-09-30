/**
 * One meeting in the Week overview grid (docs/dev/technical-design-meeting-
 * lists.md §2.7): time + short form (else the title), 34 dp, FONT.small -
 * no date, source, tracking, note or file (those live in the day panel).
 * A month highlight is bold; the meeting being edited is inverted.
 */
import React from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';
import {meetingChipLabel, meetingTimeCell} from '../domain/meetingDisplay';
import {isHighlight} from '../domain/monthHighlight';
import {MeetingSpanDay} from '../domain/meetingSpan';
import {Meeting} from '../domain/types';
import {FONT} from './theme';
import {perfCount} from '../utils/perf';

export const MEETING_CHIP_HEIGHT = 34;

function inverse(color: string): string {
  const c = color.toLowerCase();
  return c === '#000' || c === '#000000' || c === 'black' ? '#ffffff' : '#000000';
}

interface Props {
  meeting: Meeting;
  span?: MeetingSpanDay;
  editing?: boolean;
  onPress: () => void;
  textColor: string;
  borderColor: string;
}

export default function MeetingChip({meeting, span, editing, onPress, textColor, borderColor}: Props): React.JSX.Element {
  perfCount('row:meetingChip');
  const fg = editing ? inverse(textColor) : textColor;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, {borderBottomColor: borderColor}, editing && {backgroundColor: textColor}]}>
      <Text style={[styles.time, {color: fg}]} numberOfLines={1}>
        {meetingTimeCell(meeting, span, 'time').oneLine}
      </Text>
      <Text style={[styles.label, {color: fg}, isHighlight(meeting) && styles.labelHighlight]} numberOfLines={1}>
        {meetingChipLabel(meeting, span)}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: MEETING_CHIP_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingHorizontal: 4,
  },
  time: {
    width: 52,
    fontSize: FONT.small,
    fontWeight: '700',
    includeFontPadding: false,
  },
  label: {
    flex: 1,
    fontSize: FONT.small,
    includeFontPadding: false,
  },
  labelHighlight: {fontWeight: '700'},
});
