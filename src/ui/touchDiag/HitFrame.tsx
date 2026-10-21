/**
 * The touch test's black frame around the part a touch hit
 * (ui/touchDiag/touchProbe.ts). Placed absolutely inside the hit
 * `Pressable`, so drawing it moves nothing and takes no touch.
 */
import React from 'react';
import {StyleSheet, View} from 'react-native';
import {COLORS} from '../theme';

export default function HitFrame({on}: {on: boolean}): React.JSX.Element | null {
  if (!on) return null;
  return <View pointerEvents="none" style={styles.frame} />;
}

const styles = StyleSheet.create({
  frame: {...StyleSheet.absoluteFillObject, borderWidth: 2, borderColor: COLORS.accent},
});
