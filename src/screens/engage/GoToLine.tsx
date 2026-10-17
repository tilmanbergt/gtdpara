/**
 * "Go to <notebook> ›" above the collapsed Quick Add
 * (docs/dev/history/technical-design-home-notebooks.md §3.6): one line, a tap
 * opens the owner's home notebook on its last viewed page.
 */
import React from 'react';
import {Text} from 'react-native';
import {goToNotebookText} from '../../domain/engageText';
import {engageStyles as styles} from './engageStyles';

interface Props {
  fileName: string;
  onPress: () => void;
  textColor: string;
}

export default function GoToLine({fileName, onPress, textColor}: Props): React.JSX.Element {
  return (
    <Text style={[styles.backLine, {color: textColor}]} numberOfLines={1} onPress={onPress} suppressHighlighting>
      {goToNotebookText(fileName)}
    </Text>
  );
}
