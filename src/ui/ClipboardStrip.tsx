/**
 * The custom Select All / Copy / Cut / Paste strip over a text field, and
 * the four actions behind it (see domain/clipboardText.ts for why a custom
 * strip exists on this hardware, and for the pure splicing helpers). Used by
 * ui/ClipboardTextInput.tsx and Quick Add's todo and meeting fields.
 *
 * The strip stays mounted and only hides (`display: 'none'`) while the field
 * is not focused: blur fires on touch-down, and a strip torn out of the tree
 * then would lose the tap on its button.
 *
 * Both hovering strips (this one and ui/DateInput.tsx's date strip) end in a
 * small ✕: it hides the strip until a field gains focus again, so a strip
 * that covers something (Quick Add's tabs) can be put away while typing.
 */
import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import Clipboard from '@react-native-clipboard/clipboard';
import {copyCutRange, Selection, spliceAtSelection} from '../domain/clipboardText';
import {common} from './commonStyles';

export interface ClipboardActions {
  selectAll: () => void;
  copy: () => void;
  cut: () => void;
  paste: () => Promise<void>;
}

/**
 * The four actions on `text`. The field's selection lives in `selectionRef`
 * (never React state); `setOverride` moves the field's selection after an
 * action.
 */
export function clipboardActions(
  text: string,
  selectionRef: React.MutableRefObject<Selection>,
  setText: (text: string) => void,
  setOverride: (selection: Selection) => void,
): ClipboardActions {
  const select = (selection: Selection) => {
    selectionRef.current = selection;
    setOverride(selection);
  };
  const replace = (range: Selection, insert: string) => {
    const next = spliceAtSelection(text, range, insert);
    setText(next.text);
    select({start: next.cursor, end: next.cursor});
  };
  return {
    selectAll: () => select({start: 0, end: text.length}),
    copy: () => {
      const {start, end} = copyCutRange(text, selectionRef.current);
      Clipboard.setString(text.slice(start, end));
    },
    cut: () => {
      const range = copyCutRange(text, selectionRef.current);
      Clipboard.setString(text.slice(range.start, range.end));
      replace(range, '');
    },
    paste: async () => {
      const clip = await Clipboard.getString();
      if (clip) replace(selectionRef.current, clip);
    },
  };
}

/** Where the strip hovers: above the field at its right (default) or left end. */
export type StripPlacement = 'above-right' | 'above-left';

interface Props {
  visible: boolean;
  actions: ClipboardActions;
  placement?: StripPlacement;
  textColor: string;
  borderColor: string;
}

const BUTTONS: Array<{label: string; action: keyof ClipboardActions}> = [
  {label: 'All', action: 'selectAll'},
  {label: 'Copy', action: 'copy'},
  {label: 'Cut', action: 'cut'},
  {label: 'Paste', action: 'paste'},
];

/**
 * A hovering strip's ✕: `shown` is `visible` unless the ✕ was tapped since
 * the field last gained focus - a new focus (visible going false, then true)
 * shows the strip again.
 */
export function useStripHide(visible: boolean): {shown: boolean; hide: () => void} {
  const [hidden, setHidden] = useState(false);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setHidden(false);
  }
  return {shown: visible && !hidden, hide: () => setHidden(true)};
}

/** The ✕ at a hovering strip's end. */
export function StripHideButton({onPress, textColor}: {onPress: () => void; textColor: string}): React.JSX.Element {
  return (
    <Pressable style={styles.hideButton} onPress={onPress} hitSlop={6} accessibilityLabel="Hide">
      <Text style={[common.floatingStripButtonText, {color: textColor}]}>✕</Text>
    </Pressable>
  );
}

export default function ClipboardStrip({visible, actions, placement = 'above-right', textColor, borderColor}: Props): React.JSX.Element {
  const {shown, hide} = useStripHide(visible);
  return (
    <View style={[common.floatingStrip, placement === 'above-left' && common.floatingStripLeft, {borderColor}, !shown && styles.hidden]}>
      {BUTTONS.map(({label, action}) => (
        <Pressable key={label} style={[common.floatingStripButton, {borderColor}]} onPress={() => actions[action]()} hitSlop={6}>
          <Text style={[common.floatingStripButtonText, {color: textColor}]}>{label}</Text>
        </Pressable>
      ))}
      <StripHideButton onPress={hide} textColor={textColor} />
    </View>
  );
}

const styles = StyleSheet.create({
  hidden: {display: 'none'},
  // No border: it reads as closing the strip, not as one of its actions.
  hideButton: {
    justifyContent: 'center',
    paddingVertical: 3,
    paddingHorizontal: 6,
    marginLeft: 3,
  },
});
