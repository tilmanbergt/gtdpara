/**
 * "↩ <owner> · <todo>" under the header (Addendum "Engage follows the note" of
 * docs/dev/history/technical-design-engage.md): the way back to the todo you
 * worked on in another owner. One quiet line; a tap switches back.
 */
import React from 'react';
import {Text} from 'react-native';
import {EngageTodoRef} from '../../domain/engageOwner';
import {backLineText} from '../../domain/engageText';
import {taskRowLayout} from '../../ui/taskRowLayout';
import {ENGAGE_TEXT_WIDTH, engageStyles as styles} from './engageStyles';

interface Props {
  ownerName: string;
  todo: EngageTodoRef;
  onPress: () => void;
  textColor: string;
}

export default function BackLine({ownerName, todo, onPress, textColor}: Props): React.JSX.Element {
  const title = taskRowLayout(todo.task, ENGAGE_TEXT_WIDTH, 'flat').title;
  return (
    <Text style={[styles.backLine, {color: textColor}]} numberOfLines={1} onPress={onPress} suppressHighlighting>
      {backLineText(ownerName, title)}
    </Text>
  );
}
