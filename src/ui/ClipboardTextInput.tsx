/**
 * A plain single-line text field with the same custom Select All/Copy/Cut/
 * Paste overlay as ui/QuickAddWidget.tsx's task-text/meeting-title fields
 * (see domain/clipboardText.ts for why a custom overlay exists at all on
 * this hardware, and for the pure selection-splicing helpers this component
 * is built on). Used by plain text fields that need the copy/paste
 * affordance, e.g. ItemsList.tsx's Create Project/Area name field.
 * QuickAddWidget's own task/meeting fields are not built on this component.
 *
 * Same mechanics as QuickAddWidget's fields: the field's own selection is
 * tracked in a ref (`lastSelectionRef`), never React state - see
 * domain/clipboardText.ts's `Selection` doc comment for why. The overlay
 * itself stays mounted at all times, toggling visibility via
 * `styles.hidden` (`display:'none'`) on blur/focus rather than being
 * conditionally rendered, so a tap on one of its buttons isn't lost to the
 * native-view-torn-out-from-under-the-gesture race a conditionally-
 * rendered overlay would hit (blur fires on touch-down, but the already-
 * claimed touch responder keeps receiving the rest of that gesture as long
 * as the view instance itself survives).
 *
 * The overlay pops up *above* the field (`bottom: '100%'`, right-aligned) -
 * matching QuickAddWidget's own fields, which sit at the very top of their
 * screen, like ItemsList's Create row above the Projects/Areas list.
 *
 * `multiline` (docs/dev/technical-design-item-scope.md): an optional taller,
 * top-aligned, wrapping mode for a field like Scope's 1-3 sentence text,
 * which reads and edits poorly as one long horizontally-scrolling line.
 * The overlay's positioning (`bottom: '100%'`) works either way, since it's
 * anchored to the field's top regardless of height.
 *
 * `handleRef` (docs/dev/technical-design-split-by-tag.md §3.6): an optional
 * handle with `insertAtCursor(word)`, so buttons outside the field (the Tag
 * Rules placeholder chips) can insert at the last cursor position - through
 * the same tracked selection Paste uses.
 */
import React, {useImperativeHandle, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {copyCutRange, Selection, spliceAtSelection, spliceWordAtSelection} from '../domain/clipboardText';
import {FONT} from './theme';
import {common} from './commonStyles';

interface Props {
  value: string;
  onChangeText: (text: string) => void;
  onSubmitEditing?: () => void;
  placeholder?: string;
  placeholderColor: string;
  textColor: string;
  borderColor: string;
  /** Default true. Set false while an async action using this field's value is in flight, same convention as the rest of the app disabling its primary action button. */
  editable?: boolean;
  /** Default false (single line). true renders a taller, top-aligned, wrapping box - e.g. for Scope's 1-3 sentence text - while keeping the same Select All/Copy/Cut/Paste overlay. */
  multiline?: boolean;
  /** Optional handle for inserting text from outside the field - see the module doc comment. */
  handleRef?: React.Ref<ClipboardTextInputHandle>;
}

export interface ClipboardTextInputHandle {
  /** Inserts `word` at the field's last cursor position (end of the text if it was never focused), with spaces as needed; the cursor ends up right after it. */
  insertAtCursor: (word: string) => void;
}

export default function ClipboardTextInput({
  value,
  onChangeText,
  onSubmitEditing,
  placeholder,
  placeholderColor,
  textColor,
  borderColor,
  editable = true,
  multiline = false,
  handleRef,
}: Props): React.JSX.Element {
  const inputRef = useRef<TextInput>(null);
  const lastSelectionRef = useRef<Selection>(null);
  const [selectionOverride, setSelectionOverride] = useState<Selection>(null);
  const [focused, setFocused] = useState(false);

  // No setState here on purpose - see domain/clipboardText.ts's `Selection`
  // doc comment (onSelectionChange fires on nearly every cursor/selection
  // movement, and a setState-driven re-render on every one of those breaks
  // native text selection on Android).
  const onSelectionChange = (selection: Selection) => {
    lastSelectionRef.current = selection;
    if (selectionOverride) setSelectionOverride(null);
  };

  const handleSelectAll = () => {
    const selection = {start: 0, end: value.length};
    lastSelectionRef.current = selection;
    setSelectionOverride(selection);
  };
  const handleCopy = () => {
    const {start, end} = copyCutRange(value, lastSelectionRef.current);
    Clipboard.setString(value.slice(start, end));
  };
  const handleCut = () => {
    const range = copyCutRange(value, lastSelectionRef.current);
    Clipboard.setString(value.slice(range.start, range.end));
    const {text, cursor} = spliceAtSelection(value, range, '');
    onChangeText(text);
    const selection = {start: cursor, end: cursor};
    lastSelectionRef.current = selection;
    setSelectionOverride(selection);
  };
  useImperativeHandle(handleRef, () => ({
    insertAtCursor: (word: string) => {
      const {text, cursor} = spliceWordAtSelection(value, lastSelectionRef.current, word);
      onChangeText(text);
      const selection = {start: cursor, end: cursor};
      lastSelectionRef.current = selection;
      setSelectionOverride(selection);
    },
  }));

  const handlePaste = async () => {
    const clip = await Clipboard.getString();
    if (!clip) return;
    const {text, cursor} = spliceAtSelection(value, lastSelectionRef.current, clip);
    onChangeText(text);
    const selection = {start: cursor, end: cursor};
    lastSelectionRef.current = selection;
    setSelectionOverride(selection);
  };

  return (
    <View style={styles.wrap}>
      <TextInput
        ref={inputRef}
        style={[styles.input, multiline && styles.inputMultiline, {color: textColor, borderColor}]}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmitEditing}
        onSelectionChange={e => onSelectionChange(e.nativeEvent.selection)}
        selection={selectionOverride ?? undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder={placeholder}
        placeholderTextColor={placeholderColor}
        editable={editable}
        autoCapitalize="none"
        multiline={multiline}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
      <View style={[common.floatingStrip, {borderColor}, !focused && styles.hidden]}>
        <Pressable style={[common.floatingStripButton, {borderColor}]} onPress={handleSelectAll} hitSlop={6}>
          <Text style={[common.floatingStripButtonText, {color: textColor}]}>All</Text>
        </Pressable>
        <Pressable style={[common.floatingStripButton, {borderColor}]} onPress={handleCopy} hitSlop={6}>
          <Text style={[common.floatingStripButtonText, {color: textColor}]}>Copy</Text>
        </Pressable>
        <Pressable style={[common.floatingStripButton, {borderColor}]} onPress={handleCut} hitSlop={6}>
          <Text style={[common.floatingStripButtonText, {color: textColor}]}>Cut</Text>
        </Pressable>
        <Pressable style={[common.floatingStripButton, {borderColor}]} onPress={handlePaste} hitSlop={6}>
          <Text style={[common.floatingStripButtonText, {color: textColor}]}>Paste</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    position: 'relative',
  },
  input: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 5,
    fontSize: FONT.medium,
  },
  inputMultiline: {
    minHeight: 76,
    paddingTop: 6,
  },
  hidden: {
    display: 'none',
  },
});
