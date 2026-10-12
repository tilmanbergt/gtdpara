/**
 * The note-name field of the setup page: the name template with its
 * placeholder chips (tapping one inserts it at the cursor) and what the
 * template gives as a file name. Used for a Todo/Meeting rule's shared file
 * (docs/dev/history/technical-design-split-by-tag.md §3.6) and for a Loop
 * rule's loop note (docs/dev/history/technical-design-loops.md §3.1).
 */
import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {SHARED_FILE_NAME_PLACEHOLDERS} from '../../../domain/sharedNotePages';
import ClipboardTextInput, {ClipboardTextInputHandle} from '../../../ui/ClipboardTextInput';
import {styles} from '../settingsStyles';

interface Props {
  label: string;
  value: string;
  onChange: (text: string) => void;
  placeholder: string;
  inputRef: React.RefObject<ClipboardTextInputHandle | null>;
  /** Example file names, one line each (`e.g. …`). */
  examples: string[];
  /** One more line under the examples. */
  hint?: string;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}

export default function NoteNameField({
  label,
  value,
  onChange,
  placeholder,
  inputRef,
  examples,
  hint,
  textColor,
  borderColor,
  placeholderColor,
}: Props): React.JSX.Element {
  return (
    <>
      <Text style={[styles.label, styles.compactFieldSpacer, {color: textColor}]}>{label}</Text>
      <View style={styles.clipboardFieldRow}>
        <ClipboardTextInput
          value={value}
          onChangeText={onChange}
          placeholder={placeholder}
          placeholderColor={placeholderColor}
          textColor={textColor}
          borderColor={borderColor}
          handleRef={inputRef}
        />
      </View>
      <View style={styles.placeholderChipRow}>
        {SHARED_FILE_NAME_PLACEHOLDERS.map(item => (
          <Pressable
            key={item}
            style={[styles.placeholderChip, {borderColor}]}
            onPress={() => inputRef.current?.insertAtCursor(item)}
            hitSlop={4}>
            <Text style={[styles.placeholderChipText, {color: textColor}]}>{item}</Text>
          </Pressable>
        ))}
      </View>
      {examples.map(example => (
        <Text key={example} style={[styles.sharedFilePreview, {color: textColor}]} numberOfLines={1}>
          {`e.g. ${example}`}
        </Text>
      ))}
      {hint ? (
        <Text style={[styles.sharedFilePreview, {color: textColor}]} numberOfLines={2}>
          {hint}
        </Text>
      ) : null}
    </>
  );
}
