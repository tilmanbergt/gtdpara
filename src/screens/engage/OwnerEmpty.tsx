/**
 * S8 (docs/dev/history/technical-design-engage.md §3.7): "Nothing left in X.",
 * Close loop… for a loop, + Add todo.
 */
import React from 'react';
import {Text, View} from 'react-native';
import {ENGAGE_TEXT, nothingLeftText} from '../../domain/engageText';
import PillButton from '../../ui/PillButton';
import {engageStyles as styles} from './engageStyles';

interface Props {
  ownerName: string;
  onCloseLoop?: () => void;
  onAddTodo: () => void;
  textColor: string;
  borderColor: string;
}

export default function OwnerEmpty({ownerName, onCloseLoop, onAddTodo, textColor, borderColor}: Props): React.JSX.Element {
  return (
    <View>
      <Text style={[styles.signal, {color: textColor}]}>{nothingLeftText(ownerName)}</Text>
      <View style={styles.buttonRow}>
        {onCloseLoop ? <PillButton label={ENGAGE_TEXT.closeLoop} onPress={onCloseLoop} textColor={textColor} borderColor={borderColor} /> : null}
        <PillButton label={ENGAGE_TEXT.addTodo} onPress={onAddTodo} textColor={textColor} borderColor={borderColor} />
      </View>
    </View>
  );
}
