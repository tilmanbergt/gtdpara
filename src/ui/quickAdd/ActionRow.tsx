/**
 * Quick Add's buttons (ui/QuickAddWidget.tsx): the main button cluster at
 * the right of R1 (create: [M] + Add; edit: Cancel · Save), the edit form's
 * commands in R4, and the button styles the capture panel's own row shares.
 * No status text here - messages go to the central status slot
 * (docs/dev/history/technical-design-status-slot.md §7.3); only a ⚠/✓ mark
 * stays on the primary button.
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

/** R1, create: [M] + Add. */
export function CreateActions({label, onPress, disabled, mark, monthlyToggle, textColor}: CreateProps): React.JSX.Element {
  return (
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
  );
}

interface EditProps {
  pending: boolean;
  onCancel?: () => void;
  /** "Save", "Save loop", "Make loop" or "Save to <Name>". */
  saveLabel: string;
  onSave: () => void;
  /** An error that belongs to no field: the ⚠ goes on Save. */
  errorOnSave: boolean;
  textColor: string;
}

/** R1, edit: Cancel · Save. */
export function EditActions({pending, onCancel, saveLabel, onSave, errorOnSave, textColor}: EditProps): React.JSX.Element {
  return (
    <View style={quickAddButtons.actionsRight}>
      <Pressable onPress={onCancel} hitSlop={8}>
        <Text style={[quickAddButtons.textButton, {color: textColor}]}>Cancel</Text>
      </Pressable>
      <MarkWrap mark={errorOnSave ? 'warning' : null} textColor={textColor}>
        <Pressable style={quickAddButtons.primaryButton} onPress={onSave} disabled={pending} hitSlop={8}>
          <Text style={quickAddButtons.primaryButtonText} numberOfLines={1}>
            {saveLabel}
          </Text>
        </Pressable>
      </MarkWrap>
    </View>
  );
}

interface CommandProps {
  pending: boolean;
  /** Omitted: no delete button. */
  onDelete?: () => void;
  /** Meeting edits only: "New from this". */
  onNewFromThis?: () => void;
  /** Omitted: no Refile button. */
  onRefile?: () => void;
  /** The linked file's mark with its ✕ (unlink). */
  attachment?: React.ReactNode;
  monthlyToggle?: React.ReactNode;
  textColor: string;
  borderColor: string;
}

/**
 * R4 of the edit form: the commands that act at once - delete, "New from
 * this", Refile, unlink, M. The item card (technical-design-item-card.md K7,
 * K8, K9) is their place; this row holds them for the kinds the card does
 * not cover yet.
 */
export function EditCommands({
  pending,
  onDelete,
  onNewFromThis,
  onRefile,
  attachment,
  monthlyToggle,
  textColor,
  borderColor,
}: CommandProps): React.JSX.Element {
  return (
    <>
      <View style={quickAddButtons.actionsLeft}>
        {/* An icon rather than the word "Delete". Leftmost on purpose and
            hitSlop 4 (not 8): delete is one tap with no confirmation, so its
            touch area must not spill into "New from this" next to it. */}
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
        {onRefile && (
          <Pressable style={[quickAddButtons.ghostButton, {borderColor}]} onPress={onRefile} disabled={pending} hitSlop={8}>
            <Text style={[quickAddButtons.ghostButtonText, {color: textColor}]}>Refile</Text>
          </Pressable>
        )}
        {attachment}
      </View>
      <View style={quickAddButtons.centerSpacer} />
      {monthlyToggle}
    </>
  );
}

export const quickAddButtons = StyleSheet.create({
  row4: {
    minHeight: QUICK_ADD_ROWS.extra,
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
    paddingVertical: 5,
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
