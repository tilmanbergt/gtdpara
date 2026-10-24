/**
 * "Also here: 1 someday   Overview ›"
 * (docs/dev/history/technical-design-engage-in-context.md E7): one short line
 * naming what the panel leaves out - Someday and Maybe; Waiting For has its
 * own tab (docs/dev/history/technical-design-meetings-0.21.md R11) - and
 * where to find it. Hidden at 0. "someday" opens Review's "Someday / Maybe"
 * filtered to the owner, "Overview ›" the owner's overview (or its
 * Project/Area page).
 */
import React from 'react';
import {Text} from 'react-native';
import {alsoHereParts, ENGAGE_TEXT} from '../../domain/engageText';
import {engageStyles as styles} from './engageStyles';

interface Props {
  someday: number;
  onSomeday: () => void;
  onOverview: () => void;
  textColor: string;
}

export default function AlsoHereLine({someday, onSomeday, onOverview, textColor}: Props): React.JSX.Element | null {
  const parts = alsoHereParts(someday);
  if (!parts.someday) return null;
  return (
    <Text style={[styles.alsoHere, {color: textColor}]} numberOfLines={1}>
      {`${ENGAGE_TEXT.alsoHere} `}
      <Text style={styles.alsoHereLink} onPress={onSomeday} suppressHighlighting>
        {parts.someday}
      </Text>
      {'   '}
      <Text style={styles.alsoHereLink} onPress={onOverview} suppressHighlighting>
        {ENGAGE_TEXT.overview}
      </Text>
    </Text>
  );
}
