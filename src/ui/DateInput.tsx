/**
 * The app's one date text field (YYYY-MM-DD): a plain TextInput plus a small
 * button strip - -1 / Today / +1 / +7 - that appears above it while it has
 * focus, so a date can be moved a day or a week without retyping it
 * (docs/dev/technical-design-meeting-date-nudge-and-new-from-this.md §A). The
 * arithmetic (what each button does to an empty, valid or half-typed value)
 * lives in domain/dateNudge.ts; this file is only the field and the strip.
 *
 * Used by ui/QuickAddWidget.tsx (Meeting date, Todo due date),
 * screens/CaptureScreen.tsx (meeting date) and screens/ReviewScreen.tsx
 * ("Set due date") - every date input in the app.
 *
 * The strip copies the mechanics of the Select All/Copy/Cut/Paste strip on
 * QuickAddWidget's/ClipboardTextInput's text fields (2026-09-11 bugfix, see
 * domain/clipboardText.ts for why a custom strip exists at all on this
 * hardware):
 * - absolutely positioned (`bottom: '100%'`, right-aligned) so it hovers flush
 *   above the field and costs no layout space - nothing below it moves, which
 *   matters on e-ink;
 * - ALWAYS mounted, toggled with `display: 'none'` (styles.hidden) instead of
 *   conditional JSX, so a tap on one of its buttons isn't lost to the
 *   native-view-torn-out-from-under-the-gesture race (blur fires on
 *   touch-down; the already-claimed touch responder keeps receiving the rest
 *   of the gesture only as long as the view instance itself survives).
 * The two strips' styles are deliberately duplicated rather than shared: the
 * clipboard code is fresh off a device-verified bugfix and stays untouched
 * (tracked in docs/dev/technical-design-meeting-date-nudge-and-new-from-this.md's
 * follow-ups).
 *
 * Layout: `containerStyle` (margins/flex) goes on the wrapper, which is the
 * strip's positioning context, so the strip's right edge lines up with the
 * field's own right edge rather than including its margin. `width` sizes the
 * input itself. Exposes `focus()` (via ref) so a caller that reveals the
 * field on demand - QuickAddWidget's 📅 icon - can focus it straight away
 * and show the strip without a second tap.
 */
import React, {forwardRef, useImperativeHandle, useRef, useState} from 'react';
import {Pressable, StyleProp, StyleSheet, Text, TextInput, TextStyle, View, ViewStyle} from 'react-native';
import {DATE_NUDGES, nudgeIsoDate} from '../domain/dateNudge';
import {FONT} from './theme';

export interface DateInputHandle {
  focus: () => void;
}

interface Props {
  value: string;
  /** Called for typing AND for every nudge button - hand it the same setter typing already uses, so anything that reacts to an edit (clearing a "just added" note, etc.) reacts to a nudge too. */
  onChangeText: (next: string) => void;
  onSubmitEditing?: () => void;
  placeholder?: string;
  placeholderColor: string;
  textColor: string;
  borderColor: string;
  /** Default true. */
  editable?: boolean;
  /** Input width in px. Default 140 (QuickAddWidget's due/meeting date field). */
  width?: number;
  /** Margins/flex for the wrapper around the input - not the input itself. */
  containerStyle?: StyleProp<ViewStyle>;
  /** Extra input styling (e.g. ReviewScreen's pill-shaped corners) applied over the defaults. */
  inputStyle?: StyleProp<TextStyle>;
}

const DateInput = forwardRef<DateInputHandle, Props>(function DateInput(
  {
    value,
    onChangeText,
    onSubmitEditing,
    placeholder = 'YYYY-MM-DD',
    placeholderColor,
    textColor,
    borderColor,
    editable = true,
    width = 140,
    containerStyle,
    inputStyle,
  },
  ref,
): React.JSX.Element {
  const inputRef = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);

  useImperativeHandle(ref, () => ({focus: () => inputRef.current?.focus()}), []);

  return (
    <View style={[styles.wrap, containerStyle]}>
      <TextInput
        ref={inputRef}
        style={[styles.input, {width, color: textColor, borderColor}, inputStyle]}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={placeholderColor}
        autoCapitalize="none"
        editable={editable}
      />
      <View style={[styles.strip, {borderColor}, !focused && styles.hidden]}>
        {DATE_NUDGES.map(({kind, label}) => (
          <Pressable
            key={kind}
            style={[styles.stripButton, {borderColor}]}
            onPress={() => onChangeText(nudgeIsoDate(value, kind))}
            hitSlop={6}>
            <Text style={[styles.stripButtonText, {color: textColor}]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
});

export default DateInput;

const styles = StyleSheet.create({
  /** Positioning context for the strip. */
  wrap: {
    position: 'relative',
  },
  input: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: FONT.small,
  },
  /** Same look as QuickAddWidget's clipboardOverlay: flush above the field, right-aligned, no layout cost. */
  strip: {
    position: 'absolute',
    right: 0,
    bottom: '100%',
    marginBottom: 3,
    flexDirection: 'row',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderRadius: 4,
    paddingVertical: 3,
    paddingHorizontal: 3,
    zIndex: 20,
    elevation: 4,
  },
  stripButton: {
    borderWidth: 1,
    borderRadius: 3,
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginLeft: 3,
  },
  stripButtonText: {
    fontSize: FONT.small,
  },
  /** Keeps the strip mounted (see the module doc comment) - Yoga skips display:none, so it costs no space. */
  hidden: {
    display: 'none',
  },
});
