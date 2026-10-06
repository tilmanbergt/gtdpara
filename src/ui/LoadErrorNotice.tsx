/**
 * The load-error + Retry block shown by screens right after their
 * `loading && <ActivityIndicator .../>` line, shared so each screen renders
 * it identically (docs/dev/technical-design-style-cleanup.md).
 */
import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {common} from './commonStyles';

interface Props {
  error: string;
  onRetry: () => void;
  textColor: string;
}

export default function LoadErrorNotice({error, onRetry, textColor}: Props) {
  return (
    <View>
      <Text style={[common.error, {color: textColor}]}>⚠ {error}</Text>
      <Pressable onPress={onRetry} hitSlop={8}>
        <Text style={[common.retryText, {color: textColor}]}>↻ Retry</Text>
      </Pressable>
    </View>
  );
}
