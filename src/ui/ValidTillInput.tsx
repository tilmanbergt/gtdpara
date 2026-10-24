/**
 * The valid-till field of an agreement (docs/dev/history/technical-design-meetings-0.21.md
 * R21, §5): a read-only field like the date field - "till 31.12." or the
 * placeholder "valid till". A tap opens `ValidTillStrip`, which hovers over
 * Quick Add's tabs like the date strip (ui/DateInput.tsx's DateNudgeStrip):
 * none · +1 m · +3 m · end of year · … · ✕. A preset sets the date and
 * closes the strip; `…` turns the field into the normal date field for any
 * other day; ✕ puts the strip away.
 *
 * The strip stays mounted (hidden with `display: none`) for the same reason
 * as the other hovering strips: a tap on it must not lose its view.
 */
import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {validTillOf} from '../domain/agreements';
import {VALID_PRESETS, validTillFieldText} from '../domain/agreementText';
import {StripHideButton} from './ClipboardStrip';
import {common} from './commonStyles';
import DateInput from './DateInput';
import {FONT} from './theme';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface FieldProps {
  valid: string | null;
  onChange: (valid: string | null) => void;
  today: string;
  /** Whether the strip is open; the row that draws the strip owns it. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Typing a day (after `…`). */
  typing: boolean;
  onTypingChange: (typing: boolean) => void;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}

/** The field: the date as text, or the typed date field after `…`. */
export default function ValidTillInput(props: FieldProps): React.JSX.Element {
  const {valid, onChange, today, open, onOpenChange, typing, onTypingChange, textColor, borderColor, placeholderColor} = props;
  const [typed, setTyped] = useState(valid ?? '');
  if (typing) {
    const commit = () => {
      const value = typed.trim();
      if (value === '') onChange(null);
      else if (ISO_DATE.test(value)) onChange(value);
      onTypingChange(false);
    };
    return (
      <DateInput
        value={typed}
        onChangeText={setTyped}
        onSubmitEditing={commit}
        onFocusChange={focused => {
          if (!focused) commit();
        }}
        placeholder="YYYY-MM-DD"
        placeholderColor={placeholderColor}
        textColor={textColor}
        borderColor={borderColor}
        width={130}
      />
    );
  }
  return (
    <Pressable
      style={[styles.field, {borderColor}]}
      onPress={() => {
        setTyped(valid ?? '');
        onOpenChange(!open);
      }}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel="Valid till">
      <Text style={[styles.fieldText, {color: textColor}, !valid && styles.placeholder]} numberOfLines={1}>
        {validTillFieldText(valid, today)}
      </Text>
    </Pressable>
  );
}

interface StripProps {
  visible: boolean;
  today: string;
  onPick: (valid: string | null) => void;
  /** `…`: type another day. */
  onType: () => void;
  onClose: () => void;
  textColor: string;
  borderColor: string;
}

/** none · +1 m · +3 m · end of year · … · ✕, left-aligned over the tabs. */
export function ValidTillStrip({visible, today, onPick, onType, onClose, textColor, borderColor}: StripProps): React.JSX.Element {
  return (
    <View style={[common.floatingStrip, common.floatingStripLeft, {borderColor}, !visible && styles.hidden]}>
      {VALID_PRESETS.map(({preset, label}) => (
        <Pressable key={preset} style={[common.floatingStripButton, {borderColor}]} onPress={() => onPick(validTillOf(preset, today))} hitSlop={6}>
          <Text style={[common.floatingStripButtonText, {color: textColor}]}>{label}</Text>
        </Pressable>
      ))}
      <Pressable style={[common.floatingStripButton, {borderColor}]} onPress={onType} hitSlop={6} accessibilityLabel="Other day">
        <Text style={[common.floatingStripButtonText, {color: textColor}]}>…</Text>
      </Pressable>
      <StripHideButton onPress={onClose} textColor={textColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    width: 130,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  fieldText: {fontSize: FONT.small},
  placeholder: {opacity: 0.5},
  hidden: {display: 'none'},
});
