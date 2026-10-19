/**
 * "Also here: 2 waiting · 1 someday   Overview ›"
 * (docs/dev/history/technical-design-engage-in-context.md E7): one short line
 * naming what the panel leaves out, and where to find it. Each count shows
 * only when it isn't zero; the line hides when both are. "someday" opens
 * Review's "Someday / Maybe" filtered to the owner, "Overview ›" the owner's
 * overview (or its Project/Area page).
 */
import React from 'react';
import {Text} from 'react-native';
import {alsoHereParts, ENGAGE_TEXT} from '../../domain/engageText';
import {engageStyles as styles} from './engageStyles';

interface Props {
  waiting: number;
  someday: number;
  onSomeday: () => void;
  onOverview: () => void;
  textColor: string;
}

export default function AlsoHereLine({waiting, someday, onSomeday, onOverview, textColor}: Props): React.JSX.Element | null {
  const parts = alsoHereParts(waiting, someday);
  if (!parts.waiting && !parts.someday) return null;
  return (
    <Text style={[styles.alsoHere, {color: textColor}]} numberOfLines={1}>
      {`${ENGAGE_TEXT.alsoHere} `}
      {parts.waiting ? <Text>{parts.waiting}</Text> : null}
      {parts.waiting && parts.someday ? ' · ' : null}
      {parts.someday ? (
        <Text style={styles.alsoHereLink} onPress={onSomeday} suppressHighlighting>
          {parts.someday}
        </Text>
      ) : null}
      {'   '}
      <Text style={styles.alsoHereLink} onPress={onOverview} suppressHighlighting>
        {ENGAGE_TEXT.overview}
      </Text>
    </Text>
  );
}
