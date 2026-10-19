/**
 * One meeting line of the Engage panel
 * (docs/dev/history/technical-design-engage-in-context.md E8, E9):
 * - `next`: "Next here: Thu 23.10. 10:00 Sparring Mieke ›" under the header,
 *   the owner's next meeting; a tap opens its note and the panel goes.
 * - `today`: "Today next: 14:00 Retro demand · in 40 min" above the footer,
 *   quiet and not tappable - information for choosing what fits the time.
 * One line each; the text is built in domain/engageText.ts.
 */
import React from 'react';
import {Text} from 'react-native';
import {engageStyles as styles} from './engageStyles';

interface Props {
  variant: 'next' | 'today';
  text: string;
  onPress?: () => void;
  textColor: string;
}

export default function MeetingLine({variant, text, onPress, textColor}: Props): React.JSX.Element {
  if (variant === 'today') {
    return (
      <Text style={[styles.meetingToday, {color: textColor}]} numberOfLines={1}>
        {text}
      </Text>
    );
  }
  return (
    <Text style={[styles.meetingNext, {color: textColor}]} numberOfLines={1} onPress={onPress} suppressHighlighting>
      {text}
    </Text>
  );
}
