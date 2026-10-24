/**
 * A loop owner's line under the header (docs/dev/history/technical-design-meetings-0.21.md
 * R16): "Loop since 2.10. · 3 open", then "next: Thu 23.10. Workshop ›" -
 * its next meeting, whose note a tap opens - or "+ Next workshop" when no
 * meeting is ahead (Quick Add's Meeting tab with the next one copied from
 * the last). Since is the earliest of its meetings and todos
 * (domain/loops.ts's `loopSince`).
 */
import React from 'react';
import {Text, View} from 'react-native';
import {loopLineText, loopNextText, nextMeetingButtonText} from '../../domain/engageText';
import {todayIso} from '../../domain/meetingTime';
import {Meeting} from '../../domain/types';
import {engageStyles as styles} from './engageStyles';

interface Props {
  since: string | null;
  open: number;
  nextMeeting: Pick<Meeting, 'title' | 'date'> | null;
  onOpenNext: () => void;
  /** The loop's kind for "+ Next <kind>"; null: nothing to copy, no button. */
  nextKind: string | null;
  onAddNext: () => void;
  textColor: string;
}

export default function LoopLine({since, open, nextMeeting, onOpenNext, nextKind, onAddNext, textColor}: Props): React.JSX.Element {
  const today = todayIso();
  return (
    <View style={styles.loopLine} testID="loop-line">
      <Text style={[styles.quietText, {color: textColor}]} numberOfLines={1}>
        {`${loopLineText(since, open, today)}   `}
      </Text>
      {nextMeeting ? (
        <Text style={[styles.meetingNext, styles.inline, {color: textColor}]} numberOfLines={1} onPress={onOpenNext} suppressHighlighting>
          {loopNextText(nextMeeting, today)}
        </Text>
      ) : nextKind ? (
        <Text style={[styles.meetingNext, styles.inline, {color: textColor}]} numberOfLines={1} onPress={onAddNext} suppressHighlighting>
          {nextMeetingButtonText(nextKind)}
        </Text>
      ) : null}
    </View>
  );
}
