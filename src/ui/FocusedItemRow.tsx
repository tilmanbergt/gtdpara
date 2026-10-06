/**
 * FocusedItemRow — one "name (tap to open) + ✕ (tap to remove)" row, shared
 * by `ui/DailyFocusPanel.tsx`'s `FixedSlotSection` and Review's
 * Unfocused-next-items "Current focus" panel
 * (docs/dev/history/technical-design-review-master-detail.md §5.4/§6.4), so both show
 * the exact same remove-affordance.
 *
 * Deliberately NOT used by `ui/WeeklyFocusPanel.tsx`'s own
 * `FixedSlotSection` - that one wraps its name+✕ pair inside a taller,
 * un-bordered card that also shows Next/Someday/meeting counts and an
 * inline goal editor (`GoalRow`), so its header row isn't the same
 * self-contained bordered unit this component is. Forcing that different
 * shape through this component would mean threading extra layout props for
 * a component whose whole point is being a small, fixed shape - the kind of
 * trade-off `ui/ItemContextBlock.tsx`'s own module doc comment (§6.2)
 * argues against.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {FONT} from './theme';

interface Props {
  label: string;
  /** Omitted for a row with nothing to navigate to (shouldn't normally happen, but keeps this component usable without a navigation target). */
  onPress?: () => void;
  onRemove: () => void;
  disabled?: boolean;
  textColor: string;
  borderColor: string;
}

export default function FocusedItemRow({
  label,
  onPress,
  onRemove,
  disabled,
  textColor,
  borderColor,
}: Props): React.JSX.Element {
  return (
    <View style={[styles.row, {borderColor}]}>
      <Pressable style={styles.rowTextWrap} onPress={onPress} disabled={!onPress}>
        <Text style={[styles.rowText, {color: textColor}]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
      <Pressable onPress={onRemove} disabled={disabled} hitSlop={8}>
        <Text style={[styles.cancelText, {color: textColor}]}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingVertical: 7,
  },
  rowTextWrap: {
    flex: 1,
  },
  rowText: {
    fontSize: FONT.medium,
  },
  cancelText: {
    fontSize: FONT.medium,
    opacity: 0.6,
    marginLeft: 8,
    paddingHorizontal: 4,
  },
});
