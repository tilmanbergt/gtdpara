/** S10 (docs/dev/history/technical-design-engage.md §3.7): a check mark, "All done in today's focus." and the finished owners in one line. */
import React from 'react';
import {Text, View} from 'react-native';
import {ENGAGE_TEXT} from '../../domain/engageText';
import {engageStyles as styles} from './engageStyles';

interface Props {
  names: string[];
  textColor: string;
}

export default function Celebration({names, textColor}: Props): React.JSX.Element {
  return (
    <View>
      <Text style={[styles.signal, {color: textColor}]}>{`✓  ${ENGAGE_TEXT.allDone}`}</Text>
      {names.length > 0 ? (
        <Text style={[styles.quiet, {color: textColor}]} numberOfLines={1}>
          {names.join(' · ')}
        </Text>
      ) : null}
    </View>
  );
}
