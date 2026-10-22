/**
 * Quick Add's Note rows: R2 a plain title field (ClipboardTextInput brings
 * its own Select All/Copy/Cut/Paste) and R3 the tag chips that pin `#tag`
 * tokens in the title. No due date, no edit mode.
 */
import React from 'react';
import {View} from 'react-native';
import ClipboardTextInput from '../ClipboardTextInput';
import TagChips from '../TagChips';
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
      />
    </View>
  );
}

export function NoteTagRow({core, note, layoutKey, textColor, borderColor}: Props & {layoutKey?: string}) {
  const budget = useTagRowBudget(false, layoutKey ? `${layoutKey}:note` : undefined);
  return (
    <View style={[rowStyles.row3, core.displayType !== 'note' && rowStyles.hidden]} onLayout={budget.onRowLayout}>
      <TagChips
        text={note.draft.titleRaw}
        recentTags={core.recentTags}
        recognizedTags={core.recognizedAbbrevTags}
        page={note.tagPage}
        onPageChange={note.setTagPage}
        page0Width={budget.page0Width}
        laterWidth={budget.laterWidth}
        onInsertTag={note.insertTag}
        onRemoveTag={note.removeTag}
        textColor={textColor}
        borderColor={borderColor}
      />
    </View>
  );
}
