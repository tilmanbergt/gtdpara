/**
 * The load-error + Retry block every screen rendered identically right
 * after its `loading && <ActivityIndicator .../>` line (2026-09-14 style
 * cleanup pass - docs/dev/technical-design-style-cleanup.md). Extracted from
 * DailyView.tsx/ReviewScreen.tsx, which both had this exact ~9-line block.
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
