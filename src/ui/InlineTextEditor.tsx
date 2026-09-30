/**
 * InlineTextEditor — the one shared "edit mode" of every tap-to-edit text
 * row: a ClipboardTextInput with Save/Cancel beside it, plus an error line
 * below. Extracted 2026-09-29 from three near-identical copies
 * (ui/PeriodFocusPanel.tsx's GoalRow, ui/ItemContextRows.tsx's ItemGoalRow
 * and ItemScopeRow).
 *
 * Why it exists (bugfix 2026-09-29, "Save button overlaid by Scope text"):
 * ItemScopeRow was the only copy that stacked the input ABOVE its
 * Save/Cancel row, inside a plain column View. ClipboardTextInput's root is
 * `flex: 1` (right for its intended use as the growing child of a ROW), but
 * in a column with auto height `flex: 1` means flexBasis 0 on the vertical
 * axis, so the wrapper collapsed to ~0 height and the (auto-growing)
 * multiline TextInput overflowed it - drawing its text over the Save/Cancel
 * row laid out right below the collapsed wrapper. The goal rows never hit
 * this because they always put the input in a row (`flex: 1` = fill width).
 *
 * So this component always uses the goal rows' proven row layout: input
 * grows horizontally, Save/Cancel sit to its right. With `multiline` the
 * row is top-aligned so the buttons stay at the first line of the taller
 * box instead of centering against it.
 *
 * State: owns `draft`/`saving`/`error`. `draft` seeds from `initialText` on
 * mount only - the caller mounts this component when entering edit mode and
 * unmounts it (via `onClose`) on Cancel or a successful save, so every edit
 * starts fresh from the current value with no reconciling of prop changes.
 */
import React, {useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {logError} from '../utils/log';
import ClipboardTextInput from './ClipboardTextInput';
import {FONT} from './theme';
import {useErrorStatus} from './status/StatusProvider';

export default function InlineTextEditor({
  initialText,
  onSave,
  onClose,
  placeholder,
  multiline = false,
  logLabel,
  textColor,
  borderColor,
  placeholderColor,
}: {
  initialText: string;
  /** Persists the text; a rejection is shown as the error line and keeps the editor open. */
  onSave: (text: string) => Promise<void>;
  /** Called on Cancel and after a successful save - the caller leaves edit mode. */
  onClose: () => void;
  placeholder?: string;
  /** Taller wrapping input (e.g. Scope's 1-3 sentences). Single-line fields also save on Enter; multiline ones don't (Enter = newline). */
  multiline?: boolean;
  /** Prefix for the log line on a failed save, e.g. 'ItemScopeRow: save scope failed'. */
  logLabel: string;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}): React.JSX.Element {
  const [draft, setDraft] = useState(initialText);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useErrorStatus('InlineTextEditor.error', error, () => setError(null));

  const save = () => {
    setError(null);
    setSaving(true);
    onSave(draft)
      .then(() => {
        setSaving(false);
        onClose();
      })
      .catch(e => {
        const msg = e instanceof Error ? e.message : String(e);
        logError(logLabel, msg);
        setError(msg);
        setSaving(false);
      });
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.row, multiline && styles.rowTop]}>
        <ClipboardTextInput
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={multiline ? undefined : save}
          placeholder={placeholder}
          placeholderColor={placeholderColor}
          textColor={textColor}
          borderColor={borderColor}
          editable={!saving}
          multiline={multiline}
        />
        <Pressable onPress={save} disabled={saving} hitSlop={8} style={[styles.saveButton, {borderColor}]}>
          <Text style={[styles.saveText, {color: textColor}]}>Save</Text>
        </Pressable>
        <Pressable onPress={onClose} disabled={saving} hitSlop={8}>
          <Text style={[styles.cancelText, {color: textColor}]}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rowTop: {
    alignItems: 'flex-start',
  },
  saveButton: {
    borderWidth: 1,
    borderRadius: 3,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginLeft: 6,
  },
  saveText: {
    fontSize: FONT.small,
  },
  cancelText: {
    fontSize: FONT.small,
    opacity: 0.6,
    marginLeft: 8,
    paddingHorizontal: 4,
  },
});
