/**
 * Quick Add's Todo rows: R2 (text + due date), R3 (flow chips + tag chips,
 * or the "Waiting on" field) and R4 (more tags, or what the widget puts
 * there). All stay mounted while another tab shows (`hidden`), so the
 * TextInputs are created once - see ui/quickAdd/styles.ts.
 */
import React from 'react';
import {Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import ClipboardStrip from '../ClipboardStrip';
import DateInput, {DateNudgeStrip} from '../DateInput';
import FlowStateChips from '../FlowStateChips';
import {ClipIcon, WarningIcon} from '../icons';
import MarkWrap from '../status/StatusMark';
import TagChips, {useTwoRowTagChips} from '../TagChips';
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
/** `ownStrip`: the field draws its date strip itself (the capture panel); in the box the row draws it over the tabs. */
export function TaskDueControl({task, ownStrip = false, textColor, borderColor, placeholderColor}: {task: TaskDraftState; ownStrip?: boolean} & Colors) {
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
        onFocusChange={ownStrip ? undefined : task.setDueFocused}
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
    <View style={[rowStyles.row2, !!capture && rowStyles.row2Free, core.displayType !== 'task' && rowStyles.hidden]}>
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
      {/* The date strip and Select All/Copy/Cut/Paste hover above the row -
          left-aligned in the box, over the tabs, so R1's main button stays
          reachable while typing (only one field has focus at a time). They
          stay mounted (display toggles on focus) so a tap on them isn't lost
          when the field blurs on touch-down. */}
      {capture ? null : (
        <DateNudgeStrip
          visible={task.dueFocused}
          value={task.fields.dueDate}
          onChangeText={task.setDueDate}
          placement="above-left"
          textColor={textColor}
          borderColor={borderColor}
        />
      )}
      <ClipboardStrip
        visible={task.inputFocused}
        actions={task.clipboard}
        placement={capture ? 'above-right' : 'above-left'}
        textColor={textColor}
        borderColor={borderColor}
      />
    </View>
  );
}

/** The edited item's linked-file mark with its ✕ (unlink). */
export function AttachmentCluster({
  linkedFile,
  missing,
  onClear,
  textColor,
}: {
  linkedFile: string | null;
  missing?: boolean;
  onClear: () => void;
  textColor: string;
}) {
  if (!linkedFile) return null;
  return (
    <View style={styles.attachCluster}>
      <ClipIcon color={textColor} />
      {missing && <WarningIcon color={textColor} />}
      <Pressable onPress={onClear} hitSlop={8}>
        <Text style={[styles.attachRemove, {color: textColor}]}>✕</Text>
      </Pressable>
    </View>
  );
}

interface MetaRowsProps extends Colors {
  core: QuickAddCore;
  task: TaskDraftState;
  /** Remembers the tag row's widths per screen slot (render-perf-ab §3 A2). */
  layoutKey?: string;
  /** The capture panel: R3 only, flow chips without tags (its tags are a chip grid below), free height. */
  capture?: boolean;
  /** What R4 holds instead of the second tag row (the provenance line, the edit commands); the tags then page in R3 alone. */
  row4?: React.ReactNode;
}

/**
 * R3 and R4. Two-row tags (docs/dev/history/technical-design-item-card.md
 * §5): page 0 puts the flow chips first in R3, then tags, and continues in
 * R4; past page 0 the flow chips drop out and the tags take R3's whole
 * width; with w/f, R3 holds the "Waiting on" field and R4 the tags.
 *
 * One-row tags while R4 holds something else (context-tags §8): past page 0
 * the tags take the whole R3 - "‹" is the way back to the flow chips; the
 * "Waiting on" field fills R3 on its own.
 */
export function TaskMetaRows({core, task, layoutKey, capture = false, row4, ...colors}: MetaRowsProps) {
  const {textColor, borderColor, placeholderColor} = colors;
  const budget = useTagRowBudget(layoutKey ? `${layoutKey}:task` : undefined);
  const hidden = core.displayType !== 'task' && rowStyles.hidden;
  const waiting = task.fields.flowState === 'waiting-for';
  const common = {
    text: task.fields.text,
    recentTags: core.recentTags,
    recognizedTags: core.recognizedAbbrevTags,
    page: task.tagPage,
    onPageChange: task.setTagPage,
    onInsertTag: task.insertTag,
    onRemoveTag: task.removeTag,
    textColor,
    borderColor,
  };
  const twoRows = useTwoRowTagChips({
    ...common,
    widths: {
      row3First: waiting ? 0 : budget.page0Width,
      row3Later: waiting ? 0 : budget.laterWidth,
      row4: budget.laterWidth,
    },
  });
  const oneRow = row4 != null;
  const row3Style = [rowStyles.row3, capture && rowStyles.row3Free, hidden];

  const waitingRow = (
    <View style={row3Style} onLayout={budget.onRowLayout}>
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
    </View>
  );
  const flowRow = (tags: React.ReactNode) => (
    <View style={row3Style} onLayout={budget.onRowLayout}>
      <View style={rowStyles.row3ChipsGroup}>
        <View style={rowStyles.row3Lead} onLayout={budget.onLeadLayout}>
          {task.loopMode.kind !== 'loop' && (
            <FlowStateChips value={task.fields.flowState} onChange={task.setFlowState} compact={!capture} textColor={textColor} borderColor={borderColor} />
          )}
        </View>
        {tags}
      </View>
    </View>
  );
  const tagsOnlyRow = (tags: React.ReactNode) => (
    <View style={row3Style} onLayout={budget.onRowLayout}>
      {tags}
    </View>
  );

  if (capture) return waiting ? waitingRow : flowRow(null);

  let row3: React.ReactNode;
  if (oneRow) {
    const tags = <TagChips {...common} page0Width={budget.page0Width} laterWidth={budget.laterWidth} />;
    row3 = task.tagPage > 0 ? tagsOnlyRow(tags) : waiting ? waitingRow : flowRow(tags);
  } else {
    row3 = waiting ? waitingRow : task.tagPage > 0 ? tagsOnlyRow(twoRows.row3) : flowRow(twoRows.row3);
  }
  return (
    <>
      {row3}
      <View style={[rowStyles.row4, hidden]}>{oneRow ? row4 : twoRows.row4}</View>
    </>
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
