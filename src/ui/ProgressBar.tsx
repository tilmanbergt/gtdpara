/**
 * Fixed-height progress bar (docs/dev/history/technical-design-project-close-out.md
 * §8.1): a bordered box with a black fill. The caller decides how often to
 * repaint - on e-ink every refresh flashes, so callers throttle updates
 * (the close-out PDF step refreshes at most about once a second).
 */
import React from 'react';
import {StyleSheet, View} from 'react-native';
import {COLORS, RADII} from './theme';

interface Props {
  done: number;
  total: number;
  borderColor: string;
}

export default function ProgressBar({done, total, borderColor}: Props): React.JSX.Element {
  const fraction = total > 0 ? Math.max(0, Math.min(1, done / total)) : 0;
  return (
    <View style={[styles.box, {borderColor}]}>
      <View style={[styles.fill, {flex: fraction}]} />
      <View style={{flex: 1 - fraction}} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    height: 28,
    borderWidth: 2,
    borderRadius: RADII.md,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  fill: {
    backgroundColor: COLORS.accent,
  },
});
