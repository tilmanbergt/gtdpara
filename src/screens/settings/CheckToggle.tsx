import React from 'react';
import {Pressable, Text} from 'react-native';
import {styles} from './settingsStyles';

/**
 * One ☑/☐ line - the Tag Rules edit form's Default / Enabled / Prepare /
 * Review toggles all render through this instead of each repeating the same
 * Pressable + glyph + label markup. `inline` lays it out as one of several
 * side-by-side options on a row rather than a full-width stacked line.
 */
export default function CheckToggle({
  label,
  checked,
  onPress,
  textColor,
  inline,
}: {
  label: string;
  checked: boolean;
  onPress: () => void;
  textColor: string;
  inline?: boolean;
}): React.JSX.Element {
  return (
    <Pressable onPress={onPress} hitSlop={8} style={[styles.toggleOption, inline && styles.toggleOptionInline]}>
      <Text style={[styles.toggleText, {color: textColor}]}>
        {checked ? '☑' : '☐'} {label}
      </Text>
    </Pressable>
  );
}
