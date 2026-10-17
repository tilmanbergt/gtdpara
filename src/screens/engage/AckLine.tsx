/** "Done: ~~todo~~ · Undo" (S5, docs/dev/history/technical-design-engage.md §3.7). */
import React from 'react';
import {Text, View} from 'react-native';
import {EngageAck} from '../../domain/engageFlow';
import {ackLabel, ENGAGE_TEXT} from '../../domain/engageText';
import {engageStyles as styles} from './engageStyles';

interface Props {
  ack: EngageAck;
  onUndo: () => void;
  textColor: string;
}

export default function AckLine({ack, onUndo, textColor}: Props): React.JSX.Element {
  return (
    <View style={styles.ackRow}>
      <Text style={[styles.ackText, {color: textColor}]} numberOfLines={1}>
        {`${ackLabel(ack.kind)} `}
        <Text style={styles.struck}>{ack.text}</Text>
      </Text>
      <Text style={[styles.link, {color: textColor}]} onPress={onUndo} suppressHighlighting>
        {ENGAGE_TEXT.undo}
      </Text>
    </View>
  );
}
