/**
 * Quick Add's Note rows: R2 a plain title field (ClipboardTextInput brings
 * its own Select All/Copy/Cut/Paste) and R3/R4 the tag chips that pin
 * `#tag` tokens in the title. No due date, no edit mode.
 */
import React from 'react';
import {View} from 'react-native';
import ClipboardTextInput from '../ClipboardTextInput';
import {useTwoRowTagChips} from '../TagChips';
import {useTagRowBudget} from '../tagChipLayout';
import {rowStyles} from './styles';
import {NoteDraftState} from './useNoteDraft';
import {QuickAddCore} from './useQuickAddCore';

interface Props {
  core: QuickAddCore;
  note: NoteDraftState;
  textColor: string;
  borderColor: string;
}

export function NoteInputRow({core, note, textColor, borderColor, placeholderColor}: Props & {placeholderColor: string}) {
  return (
    <View style={[rowStyles.row2, core.displayType !== 'note' && rowStyles.hidden]}>
      <ClipboardTextInput
        value={note.draft.titleRaw}
        onChangeText={note.setTitleRaw}
        onSubmitEditing={note.submitCreate}
        placeholder="New note"
        placeholderColor={placeholderColor}
        textColor={textColor}
        borderColor={borderColor}
        editable={!core.pending}
        stripPlacement="above-left"
      />
    </View>
  );
}

/** R3 and R4: the tag chips over both rows (technical-design-item-card.md §5). */
export function NoteTagRows({core, note, layoutKey, textColor, borderColor}: Props & {layoutKey?: string}) {
  const budget = useTagRowBudget(layoutKey ? `${layoutKey}:note` : undefined);
  const hidden = core.displayType !== 'note' && rowStyles.hidden;
  const tags = useTwoRowTagChips({
    text: note.draft.titleRaw,
    recentTags: core.recentTags,
    recognizedTags: core.recognizedAbbrevTags,
    page: note.tagPage,
    onPageChange: note.setTagPage,
    onInsertTag: note.insertTag,
    onRemoveTag: note.removeTag,
    textColor,
    borderColor,
    widths: {row3First: budget.laterWidth, row3Later: budget.laterWidth, row4: budget.laterWidth},
  });
  return (
    <>
      <View style={[rowStyles.row3, hidden]} onLayout={budget.onRowLayout}>
        {tags.row3}
      </View>
      <View style={[rowStyles.row4, hidden]}>{tags.row4}</View>
    </>
  );
}
