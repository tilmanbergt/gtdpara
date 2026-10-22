/**
 * Row 4 of Quick Add (ui/QuickAddWidget.tsx): the action buttons of the
 * create and the edit form, and the button styles the capture variant's own
 * row shares. Row 4 carries no status text - messages go to the central
 * status slot (docs/dev/history/technical-design-status-slot.md §7.3); only a
 * ⚠/✓ mark stays on the primary button.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {TrashIcon} from '../icons';
import MarkWrap from '../status/StatusMark';
import {COLORS, FONT} from '../theme';
import {QUICK_ADD_ROWS} from './QuickAddFrame';

type Mark = 'warning' | 'success' | null;

interface CreateProps {
  label: string;
  onPress: () => void;
  /** True while a save runs, or when the current text can't be added (an existing loop). */
  disabled: boolean;
  mark: Mark;
  /** The meeting tab's "M" toggle, left of the button. */
  monthlyToggle?: React.ReactNode;
  textColor: string;
}

/** Create form: the primary button on the right. */
export function CreateActionRow({label, onPress, disabled, mark, monthlyToggle, textColor}: CreateProps): React.JSX.Element {
  return (
    <View style={quickAddButtons.row4}>
      <View style={quickAddButtons.actionsLeft} />
      <View style={quickAddButtons.centerSpacer} />
      <View style={quickAddButtons.actionsRight}>
        {monthlyToggle}
        <MarkWrap mark={mark} textColor={textColor}>
          <Pressable
            style={[quickAddButtons.primaryButton, disabled && quickAddButtons.primaryDisabled]}
            onPress={onPress}
            disabled={disabled}
            hitSlop={8}>
            <Text style={quickAddButtons.primaryButtonText} numberOfLines={1}>
              {label}
            </Text>
          </Pressable>
        </MarkWrap>
      </View>
    </View>
  );
}

interface EditProps {
  pending: boolean;
  /** Omitted: no delete button. */
  onDelete?: () => void;
  /** Meeting edits only: "New from this". */
  onNewFromThis?: () => void;
  /** Omitted: no Refile button. */
  onRefile?: () => void;
  /** "File: <name>" in Refile's place when a recognized abbreviation tag names another Project/Area. */
  quickFile?: {name: string; onPress: () => void} | null;
  onCancel?: () => void;
  saveLabel: string;
  onSave: () => void;
  saveDisabled?: boolean;
  /** An error that belongs to no field: the ⚠ goes on Save. */
  errorOnSave: boolean;
  monthlyToggle?: React.ReactNode;
  textColor: string;
  borderColor: string;
}

/** Edit form: delete, "New from this", Refile or "File: <name>" on the left; Cancel and Save on the right. */
export function EditActionRow({
  pending,
  onDelete,
  onNewFromThis,
  onRefile,
  quickFile,
  onCancel,
  saveLabel,
  onSave,
  saveDisabled = false,
  errorOnSave,
  monthlyToggle,
  textColor,
  borderColor,
}: EditProps): React.JSX.Element {
  return (
    <View style={quickAddButtons.row4}>
      <View style={quickAddButtons.actionsLeft}>
        {/* An icon rather than the word "Delete" - frees ~40px in this crowded
            row. Leftmost on purpose and hitSlop 4 (not the 8 the text buttons
            use): delete is one tap with no confirmation, so its touch area
            must not spill into "New from this" next to it. */}
        {onDelete && (
          <Pressable
            style={[quickAddButtons.ghostButton, quickAddButtons.trashButton, {borderColor}]}
            onPress={onDelete}
            disabled={pending}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel="Delete">
            <TrashIcon size={18} color={textColor} />
          </Pressable>
        )}
        {onNewFromThis && (
          <Pressable style={[quickAddButtons.ghostButton, {borderColor}]} onPress={onNewFromThis} disabled={pending} hitSlop={8}>
            <Text style={[quickAddButtons.ghostButtonText, {color: textColor}]} numberOfLines={1}>
              New from this
            </Text>
          </Pressable>
        )}
        {onRefile && !quickFile && (
          <Pressable style={[quickAddButtons.ghostButton, {borderColor}]} onPress={onRefile} disabled={pending} hitSlop={8}>
            <Text style={[quickAddButtons.ghostButtonText, {color: textColor}]}>Refile</Text>
          </Pressable>
        )}
        {quickFile && (
          <Pressable style={[quickAddButtons.ghostButton, {borderColor}]} onPress={quickFile.onPress} disabled={pending} hitSlop={8}>
            <Text style={[quickAddButtons.ghostButtonText, {color: textColor}]} numberOfLines={1}>
              File: {quickFile.name}
            </Text>
          </Pressable>
        )}
      </View>
      <View style={quickAddButtons.centerSpacer} />
      <View style={quickAddButtons.actionsRight}>
        <Pressable onPress={onCancel} hitSlop={8}>
          <Text style={[quickAddButtons.textButton, {color: textColor}]}>Cancel</Text>
        </Pressable>
        {monthlyToggle}
        <MarkWrap mark={errorOnSave ? 'warning' : null} textColor={textColor}>
          <Pressable
            style={[quickAddButtons.primaryButton, saveDisabled && quickAddButtons.primaryDisabled]}
            onPress={onSave}
            disabled={pending || saveDisabled}
            hitSlop={8}>
            <Text style={quickAddButtons.primaryButtonText} numberOfLines={1}>
              {saveLabel}
            </Text>
          </Pressable>
        </MarkWrap>
      </View>
    </View>
  );
}

export const quickAddButtons = StyleSheet.create({
  row4: {
    minHeight: QUICK_ADD_ROWS.actions,
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  /** Keeps actionsLeft/actionsRight at the row's two ends. */
  centerSpacer: {
    flex: 1,
  },
  primaryButton: {
    backgroundColor: COLORS.accent,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  /** A primary button that can't be pressed right now (grayscale: lighter, not a colour). */
  primaryDisabled: {
    opacity: 0.35,
  },
  primaryButtonText: {
    color: COLORS.accentText,
    fontSize: FONT.small,
    fontWeight: '600',
  },
  ghostButton: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginRight: 6,
  },
  ghostButtonText: {
    fontSize: FONT.small,
    fontWeight: '600',
    opacity: 0.8,
  },
  /** Icon-only variant of ghostButton (edit-mode delete): tighter horizontal padding, icon centred; height still matches its text-labelled neighbours (icon 18 + 2x6 padding ~ line height + 2x6). */
  trashButton: {
    paddingHorizontal: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textButton: {
    fontSize: FONT.small,
    opacity: 0.7,
    fontWeight: '600',
    marginRight: 12,
  },
});
