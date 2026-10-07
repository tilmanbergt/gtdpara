/**
 * The Gmail inbox review step's email-text pane
 * (docs/dev/history/technical-design-gmail-body-select.md): a fixed action bar - All /
 * Copy / -> Todo / -> Meeting - over the email text, which fills all the
 * remaining height of the detail panel and scrolls inside it. This is the ONE
 * deliberate exception to the app-wide no-scroll policy: an email has no
 * useful page size, and the rest of the panel needs to stay put while
 * reading it.
 *
 * Why the text is a read-only multiline `TextInput` and not a `<Text
 * selectable>`: Android's native selection toolbar (Copy/Cut/Select-all) never
 * appears inside Supernote's plugin-host window (domain/clipboardText.ts's
 * module doc comment) - a selectable Text would let the user select and then
 * offer nothing to do with the selection. A TextInput gives the
 * same word-select/handle behavior AND reports the selection range through
 * `onSelectionChange`, which is what the bar's buttons act on. It is kept
 * read-only by being fully controlled (`value` never changes, `onChangeText`
 * is a no-op) plus `showSoftInputOnFocus={false}` (no soft keyboard on e-ink)
 * and `caretHidden`. `editable` stays true on purpose: on Android a
 * non-editable EditText can't be text-selected at all.
 *
 * The selection lives in a ref (`selectionRef`), never state - see
 * domain/clipboardText.ts's `Selection` doc comment (a setState on every
 * onSelectionChange breaks native selection). The one piece of
 * selection-derived state is the boolean `hasSelection`, which drives
 * the bar's enabled/greyed look: React bails out of a setState with an
 * unchanged primitive, so it re-renders only when the selection flips between
 * empty and non-empty - not on every handle drag - and only THIS small
 * component re-renders (the bar and the TextInput), never the whole detail
 * panel/QuickAddWidget around it. "All" is the guaranteed path when native
 * drag-select is being flaky (it sets the selection programmatically via the
 * controlled `selection` prop, released again on the field's next
 * onSelectionChange, same mechanism ui/ClipboardTextInput.tsx uses).
 *
 * Without a selection Copy / -> Todo / -> Meeting are greyed out and do
 * nothing - there is deliberately no "whole email" fallback for them; that
 * is what "All" is for.
 */
import React, {useEffect, useRef, useState} from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {Selection, selectedText} from '../domain/clipboardText';
import {requestEinkRefresh} from '../utils/screenRefresh';
import {FONT} from './theme';

interface Props {
  text: string;
  /** Called with the current selection's text; the caller decides what -> Todo means (QuickAddWidget prefill). */
  onToTodo: (selected: string) => void;
  onToMeeting: (selected: string) => void;
  textColor: string;
  borderColor: string;
}

/** Cursor at the very start - see selectionOverride's doc comment. */
const TOP_SELECTION = {start: 0, end: 0};

/** How long the Copy button says "Copied" - long enough to be noticed on e-ink, short enough not to linger. */
const COPIED_MS = 1500;

export default function GmailBodyPane({text, onToTodo, onToMeeting, textColor, borderColor}: Props): React.JSX.Element {
  const selectionRef = useRef<Selection>(null);
  const [hasSelection, setHasSelection] = useState(false);
  // Starts (and, per message, restarts) with the cursor at position 0 via the controlled `selection` prop: a controlled multiline TextInput otherwise puts the cursor at the END of a freshly set value, and Android scrolls the field down to it - the email text must open at its top. Released again by the field's first onSelectionChange, like every other override here.
  const [selectionOverride, setSelectionOverride] = useState<Selection>(TOP_SELECTION);
  const [copied, setCopied] = useState(false);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A different email (or its body arriving) means the old range is
  // meaningless - same pane instance is reused across messages. Reset in the
  // render phase (React's "derive state from props" pattern: setState during
  // render re-renders immediately, BEFORE anything is committed), so the new
  // text and the cursor-at-top selection reach the native field in ONE update
  // - resetting in an effect would first commit the new text (cursor and
  // scroll jump to its end) and only then move back to the top.
  const [shownText, setShownText] = useState(text);
  if (shownText !== text) {
    setShownText(text);
    setHasSelection(false);
    setSelectionOverride({...TOP_SELECTION});
    setCopied(false);
  }
  useEffect(() => {
    selectionRef.current = null;
  }, [text]);

  useEffect(
    () => () => {
      if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    },
    [],
  );

  // No setState except the bail-out-able `hasSelection` flip - see the module doc comment.
  const onSelectionChange = (selection: Selection) => {
    selectionRef.current = selection;
    setHasSelection(!!selection && selection.start !== selection.end);
    if (selectionOverride) setSelectionOverride(null);
  };

  const handleSelectAll = () => {
    const selection = {start: 0, end: text.length};
    selectionRef.current = selection;
    setHasSelection(text.length > 0);
    setSelectionOverride(selection);
    requestEinkRefresh();
  };

  const handleCopy = () => {
    const selected = selectedText(text, selectionRef.current);
    if (!selected) return;
    Clipboard.setString(selected);
    setCopied(true);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => {
      setCopied(false);
      requestEinkRefresh();
    }, COPIED_MS);
    requestEinkRefresh();
  };

  const handleTo = (send: (selected: string) => void) => {
    const selected = selectedText(text, selectionRef.current);
    if (selected) send(selected);
    requestEinkRefresh();
  };

  const actionStyle = [styles.button, {borderColor}, !hasSelection && styles.buttonDisabled];

  return (
    <View style={styles.pane}>
      <View style={styles.bar}>
        <Pressable style={[styles.button, {borderColor}]} onPress={handleSelectAll} hitSlop={6}>
          <Text style={[styles.buttonText, {color: textColor}]}>All</Text>
        </Pressable>
        <Pressable style={actionStyle} disabled={!hasSelection} onPress={handleCopy} hitSlop={6}>
          <Text style={[styles.buttonText, {color: textColor}]}>{copied ? 'Copied ✓' : 'Copy'}</Text>
        </Pressable>
        <Pressable style={actionStyle} disabled={!hasSelection} onPress={() => handleTo(onToTodo)} hitSlop={6}>
          <Text style={[styles.buttonText, {color: textColor}]}>→ Todo</Text>
        </Pressable>
        <Pressable style={actionStyle} disabled={!hasSelection} onPress={() => handleTo(onToMeeting)} hitSlop={6}>
          <Text style={[styles.buttonText, {color: textColor}]}>→ Meeting</Text>
        </Pressable>
      </View>
      <TextInput
        style={[styles.body, {color: textColor, borderColor}]}
        value={text}
        onChangeText={() => {}}
        multiline
        editable
        caretHidden
        showSoftInputOnFocus={false}
        autoCorrect={false}
        autoCapitalize="none"
        textAlignVertical="top"
        onSelectionChange={e => onSelectionChange(e.nativeEvent.selection)}
        selection={selectionOverride ?? undefined}
        // Scrolling/selecting by touch changes pixels with no React-side commit the e-ink layer would flush on its own (utils/screenRefresh.ts) - refresh once the finger lifts (debounced app-wide).
        onTouchEnd={requestEinkRefresh}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // Fills whatever height the caller's own flex:1 wrapper gives it.
  pane: {
    flex: 1,
  },
  bar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: 4,
  },
  button: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginRight: 8,
    marginBottom: 2,
  },
  buttonDisabled: {
    opacity: 0.35,
  },
  buttonText: {
    fontSize: FONT.small,
    fontWeight: '600',
  },
  // flex:1 makes the multiline field exactly as tall as the space left; its
  // own native scrolling handles text longer than that.
  body: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: FONT.medium,
  },
});
