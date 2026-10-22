/**
 * Quick Add's Todo rows: R2 (text + due date) and R3 (flow chips + tag
 * chips, or the "Waiting on" field). Both stay mounted while another tab
 * shows (`hidden`), so the TextInputs are created once - see
 * ui/quickAdd/styles.ts.
 */
import React from 'react';
import {LayoutChangeEvent, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import ClipboardStrip from '../ClipboardStrip';
import DateInput from '../DateInput';
import FlowStateChips from '../FlowStateChips';
import {ClipIcon, WarningIcon} from '../icons';
import MarkWrap from '../status/StatusMark';
import TagChips from '../TagChips';
import {useTagRowBudget} from '../tagChipLayout';
import {FONT} from '../theme';
import {rowStyles} from './styles';
import {QuickAddCore} from './useQuickAddCore';
import {TaskDraftState} from './useTaskDraft';

interface Colors {
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}

/** The due date: a 📅 button that unfolds into an inline date field (never folds back). */
export function TaskDueControl({task, textColor, borderColor, placeholderColor}: {task: TaskDraftState} & Colors) {
  const {fields, loopMode} = task;
  if (!fields.dueDateOpen) {
    return (
      <Pressable style={[styles.iconButton, {borderColor}]} onPress={task.openDueDate} hitSlop={8}>
        <Text style={[styles.iconButtonText, {color: textColor}]}>📅</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.dateInline}>
      <DateInput
        ref={task.dueInputRef}
        value={fields.dueDate}
        onChangeText={task.setDueDate}
        placeholder={loopMode.kind === 'none' || loopMode.kind === 'exists' ? 'Due YYYY-MM-DD' : 'Main date YYYY-MM-DD'}
        placeholderColor={placeholderColor}
        textColor={textColor}
        borderColor={borderColor}
      />
      {fields.dueDate.length > 0 && (
        <Pressable onPress={() => task.setDueDate('')} hitSlop={8}>
          <Text style={[rowStyles.clearX, {color: textColor}]}>✕</Text>
        </Pressable>
      )}
    </View>
  );
}

interface InputRowProps extends Colors {
  core: QuickAddCore;
  task: TaskDraftState;
  placeholder: string;
  /**
   * The capture panel: a multi-line field, no due control in this row (it
   * sits in the options row below), and `splitBlock` - the Split lines rows -
   * in place of the field while set.
   */
  capture?: {splitBlock: React.ReactNode | null};
}

export function TaskInputRow({core, task, placeholder, capture, ...colors}: InputRowProps) {
  const {textColor, borderColor, placeholderColor} = colors;
  return (
    <View style={[rowStyles.row2, core.displayType !== 'task' && rowStyles.hidden]}>
      {capture?.splitBlock ?? null}
      <View style={[rowStyles.row2Wrap, !!capture?.splitBlock && rowStyles.hidden]}>
        <MarkWrap mark={core.fieldMark('text')} textColor={textColor} flex>
          <TextInput
            ref={task.inputRef}
            style={[rowStyles.input, rowStyles.inputFlex, !!capture && styles.inputMultiline, {color: textColor, borderColor}]}
            multiline={!!capture}
            textAlignVertical={capture ? 'top' : undefined}
            value={task.fields.text}
            onChangeText={task.setText}
            onSubmitEditing={task.editing ? task.submitEdit : task.submitCreate}
            onSelectionChange={e => task.onSelectionChange(e.nativeEvent.selection)}
            selection={task.selectionOverride ?? undefined}
            onFocus={() => task.setInputFocused(true)}
            onBlur={() => task.setInputFocused(false)}
            placeholder={placeholder}
            placeholderTextColor={placeholderColor}
            autoCapitalize="none"
          />
        </MarkWrap>
        {capture ? null : <TaskDueControl task={task} {...colors} />}
      </View>
      {/* Select All/Copy/Cut/Paste, hovering above the field and right-aligned
          so it clears row 1's tabs. Stays mounted (display toggles on focus)
          so a tap on it isn't lost when the field blurs on touch-down. */}
      <ClipboardStrip visible={task.inputFocused} actions={task.clipboard} textColor={textColor} borderColor={borderColor} />
    </View>
  );
}

/** The edited item's linked-file mark with its ✕ (unlink). `onLayout` feeds the row's tag budget. */
export function AttachmentCluster({
  linkedFile,
  missing,
  onClear,
  onLayout,
  textColor,
}: {
  linkedFile: string | null;
  missing?: boolean;
  onClear: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
  textColor: string;
}) {
  if (!linkedFile) return null;
  return (
    <View style={styles.attachCluster} onLayout={onLayout}>
      <ClipIcon color={textColor} />
      {missing && <WarningIcon color={textColor} />}
      <Pressable onPress={onClear} hitSlop={8}>
        <Text style={[styles.attachRemove, {color: textColor}]}>✕</Text>
      </Pressable>
    </View>
  );
}

interface MetaRowProps extends Colors {
  core: QuickAddCore;
  task: TaskDraftState;
  /** Remembers the tag row's widths per screen slot (render-perf-ab §3 A2). */
  layoutKey?: string;
  /** False in the capture panel: its tags are a chip grid below the box. */
  showTags: boolean;
  linkedFileMissing?: boolean;
}

/**
 * R3, page 0 vs page 1+ (technical-design-context-tags.md §8): past page 0
 * the tag chips take the whole row at their wide capacity and the flow
 * chips (or the "Waiting on" layout, also flow-state UI) drop out - "‹" on
 * the chip row is the way back. Page 0 has narrow tag chips next to the
 * flow chips; the "Waiting on" field fills the row on its own. The tag
 * budget is measured (ui/tagChipLayout.ts), not a fixed chip count.
 */
export function TaskMetaRow({core, task, layoutKey, showTags, linkedFileMissing, ...colors}: MetaRowProps) {
  const {textColor, borderColor, placeholderColor} = colors;
  const budget = useTagRowBudget(!!task.linkedFile, layoutKey ? `${layoutKey}:task` : undefined);
  const hidden = core.displayType !== 'task' && rowStyles.hidden;
  const tagChips = (
    <TagChips
      text={task.fields.text}
      recentTags={core.recentTags}
      recognizedTags={core.recognizedAbbrevTags}
      page={task.tagPage}
      onPageChange={task.setTagPage}
      page0Width={budget.page0Width}
      laterWidth={budget.laterWidth}
      onInsertTag={task.insertTag}
      onRemoveTag={task.removeTag}
      textColor={textColor}
      borderColor={borderColor}
    />
  );
  const attachment = (
    <AttachmentCluster
      linkedFile={task.linkedFile}
      missing={linkedFileMissing}
      onClear={task.clearLinkedFile}
      onLayout={budget.onAttachLayout}
      textColor={textColor}
    />
  );
  if (task.tagPage > 0) {
    return (
      <View style={[rowStyles.row3, hidden]} onLayout={budget.onRowLayout}>
        {tagChips}
        {attachment}
      </View>
    );
  }
  if (task.fields.flowState === 'waiting-for') {
    return (
      <View style={[rowStyles.row3, hidden]}>
        <Pressable style={[rowStyles.chip, rowStyles.chipSelected]} onPress={() => task.setFlowState(null)} hitSlop={8}>
          <Text style={rowStyles.chipTextSelected}>w/f</Text>
        </Pressable>
        <TextInput
          style={[rowStyles.input, styles.waitingInput, {color: textColor, borderColor}]}
          value={task.fields.waitingOnText}
          onChangeText={task.setWaitingOn}
          placeholder="Waiting on (who/what)"
          placeholderTextColor={placeholderColor}
          autoCapitalize="none"
        />
        {attachment}
      </View>
    );
  }
  return (
    <View style={[rowStyles.row3, hidden]} onLayout={budget.onRowLayout}>
      <View style={rowStyles.row3ChipsGroup}>
        <View style={rowStyles.row3Lead} onLayout={budget.onLeadLayout}>
          {task.loopMode.kind !== 'loop' && (
            <FlowStateChips value={task.fields.flowState} onChange={task.setFlowState} textColor={textColor} borderColor={borderColor} />
          )}
        </View>
        {showTags && tagChips}
      </View>
      {attachment}
    </View>
  );
}

const styles = StyleSheet.create({
  /** Capture: recognized text can be several lines (3 visible, up to ~6). */
  inputMultiline: {
    minHeight: 96,
    maxHeight: 170,
  },
  waitingInput: {
    flex: 1,
    marginRight: 6,
  },
  dateInline: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconButton: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconButtonText: {
    fontSize: FONT.medium,
  },
  attachCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    // Never squeezed by the tags; the padding keeps a visible gap to the
    // last chip and is included in the measured width.
    flexShrink: 0,
    paddingLeft: 8,
  },
  attachRemove: {
    fontSize: FONT.small,
    opacity: 0.7,
    marginLeft: 3,
    paddingHorizontal: 4,
  },
});
