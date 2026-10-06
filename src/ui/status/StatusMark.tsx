/**
 * The in-place half of "mark in place, text in the slot"
 * (docs/dev/history/technical-design-status-slot.md §6, D3/D9).
 *
 * `<MarkWrap mark=...>` wraps one control (a field, a button) and, when
 * `mark` is set, draws a small ⚠ or ✓ badge on its top-right corner. The
 * badge is absolutely positioned, so showing or hiding it never changes
 * the control's size or the row's layout (D1's "nothing shifts" rule
 * applies here too). The full message is in the status slot.
 *
 * `flex` makes the wrapper take the control's flex:1 share of a row (for
 * inputs that stretch); the wrapper is a row itself, so a wrapped
 * `flex: 1` input keeps growing horizontally, not vertically.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {WarningIcon} from '../icons';
import {FONT} from '../theme';

export type MarkKind = 'warning' | 'success';

interface Props {
  mark: MarkKind | null;
  children: React.ReactNode;
  textColor: string;
  flex?: boolean;
  /** Optional: tap on the badge (e.g. re-show a dismissed message). */
  onPress?: () => void;
}

export default function MarkWrap({mark, children, textColor, flex, onPress}: Props): React.JSX.Element {
  return (
    <View style={[styles.wrap, flex && styles.flex]}>
      {children}
      {mark && (
        <Pressable
          onPress={onPress}
          disabled={!onPress}
          hitSlop={6}
          style={[styles.badge, {borderColor: textColor}]}
          accessibilityLabel={mark === 'warning' ? 'Problem - see the message at the top' : 'Done'}>
          {mark === 'warning' ? (
            <WarningIcon size={12} color={textColor} />
          ) : (
            <Text style={[styles.check, {color: textColor}]}>✓</Text>
          )}
        </Pressable>
      )}
    </View>
  );
}

const BADGE = 18;

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  flex: {
    flex: 1,
  },
  badge: {
    position: 'absolute',
    top: -BADGE / 2 + 2,
    right: -BADGE / 2 + 2,
    width: BADGE,
    height: BADGE,
    borderRadius: BADGE / 2,
    borderWidth: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    fontSize: FONT.small,
    fontWeight: '700',
  },
});
