/**
 * A two-line list row: a bold name (with an optional quiet label and
 * something on the right), then a dim second line with a left and a right
 * part. The Projects and Loops rows of an item page use it
 * (screens/area/ProjectsTab.tsx).
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {FONT, SPACING} from './theme';

/** The row's height (dp) - for PagedSection's rowHeight. */
export const TWO_LINE_ROW_HEIGHT = 57;

interface Props {
  title: string;
  /** Quiet text after the title (`on hold`, a loop's kind). */
  label?: string;
  /** Right end of line 1 (buttons, `›`). */
  right?: React.ReactNode;
  line2Left: string;
  line2Right: string;
  onPress?: () => void;
  textColor: string;
  borderColor: string;
}

export default function TwoLineRow({title, label, right, line2Left, line2Right, onPress, textColor, borderColor}: Props): React.JSX.Element {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[styles.row, {borderColor}]}>
      <View style={styles.line}>
        <Text style={[styles.name, {color: textColor}]} numberOfLines={1}>
          {title}
        </Text>
        {label ? <Text style={[styles.small, styles.label, {color: textColor}]}>{label}</Text> : null}
        <View style={styles.spacer} />
        {right}
      </View>
      <View style={[styles.line, styles.second]}>
        <Text style={[styles.small, styles.dim, styles.shrink, {color: textColor}]} numberOfLines={1}>
          {line2Left}
        </Text>
        <View style={styles.spacer} />
        <Text style={[styles.small, styles.dim, {color: textColor}]} numberOfLines={1}>
          {line2Right}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {height: TWO_LINE_ROW_HEIGHT, borderBottomWidth: StyleSheet.hairlineWidth, justifyContent: 'center'},
  line: {flexDirection: 'row', alignItems: 'center'},
  name: {fontSize: FONT.medium, fontWeight: '600', flexShrink: 1},
  label: {opacity: 0.6, marginLeft: SPACING.sm},
  small: {fontSize: FONT.small},
  dim: {opacity: 0.7},
  shrink: {flexShrink: 1},
  second: {marginTop: 2},
  spacer: {flex: 1, minWidth: SPACING.sm},
});
