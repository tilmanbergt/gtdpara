/**
 * Quick Add's Agreement rows (docs/dev/history/technical-design-meetings-0.21.md
 * §5, R21): R2 the words (ClipboardTextInput) and the valid-till field, whose
 * strip hovers over the tabs; R3 and R4 the tag chips, or R3 the tags and R4
 * a grey line when one is given (what the screen adds, or "↳ replaces …"
 * while changing an agreement). Mounted with the other tabs' rows and hidden
 * while another tab shows.
 */
import React from 'react';
import {View} from 'react-native';
import ClipboardTextInput from '../ClipboardTextInput';
import TagChips, {useTwoRowTagChips} from '../TagChips';
import {useTagRowBudget} from '../tagChipLayout';
import ValidTillInput, {ValidTillStrip} from '../ValidTillInput';
import MarkWrap from '../status/StatusMark';
import {rowStyles} from './styles';
import {AgreementDraftState} from './useAgreementDraft';
import {QuickAddCore} from './useQuickAddCore';

interface Colors {
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}

interface Props extends Colors {
  core: QuickAddCore;
  agreement: AgreementDraftState;
  today: string;
}

export function AgreementInputRow({core, agreement, today, textColor, borderColor, placeholderColor}: Props) {
  const {fields} = agreement;
  return (
    <View style={[rowStyles.row2, core.displayType !== 'agreement' && rowStyles.hidden]}>
      <View style={rowStyles.row2Wrap}>
        <View style={rowStyles.inputFlex}>
          <MarkWrap mark={core.fieldMark('text')} textColor={textColor} flex>
            <ClipboardTextInput
              value={fields.text}
              onChangeText={agreement.setText}
              onSubmitEditing={agreement.editing ? agreement.submitEdit : agreement.submitCreate}
              placeholder="New agreement"
              placeholderColor={placeholderColor}
              textColor={textColor}
              borderColor={borderColor}
              editable={!core.pending}
              stripPlacement="above-left"
            />
          </MarkWrap>
        </View>
        <ValidTillInput
          valid={fields.valid}
          onChange={agreement.setValid}
          today={today}
          open={agreement.validOpen}
          onOpenChange={agreement.setValidOpen}
          typing={agreement.validTyping}
          onTypingChange={agreement.setValidTyping}
          textColor={textColor}
          borderColor={borderColor}
          placeholderColor={placeholderColor}
        />
      </View>
      <ValidTillStrip
        visible={agreement.validOpen && core.displayType === 'agreement'}
        today={today}
        onPick={valid => {
          agreement.setValid(valid);
          agreement.setValidOpen(false);
        }}
        onType={() => {
          agreement.setValidOpen(false);
          agreement.setValidTyping(true);
        }}
        onClose={() => agreement.setValidOpen(false)}
        textColor={textColor}
        borderColor={borderColor}
      />
    </View>
  );
}

/** R3 and R4: tags over both rows, or tags in R3 and `row4` in R4. */
export function AgreementTagRows({core, agreement, layoutKey, row4, textColor, borderColor}: Omit<Props, 'today' | 'placeholderColor'> & {layoutKey?: string; row4?: React.ReactNode}) {
  const budget = useTagRowBudget(layoutKey ? `${layoutKey}:agreement` : undefined);
  const hidden = core.displayType !== 'agreement' && rowStyles.hidden;
  const common = {
    text: agreement.fields.text,
    recentTags: core.recentTags,
    recognizedTags: core.recognizedAbbrevTags,
    page: agreement.tagPage,
    onPageChange: agreement.setTagPage,
    onInsertTag: agreement.insertTag,
    onRemoveTag: agreement.removeTag,
    textColor,
    borderColor,
  };
  const two = useTwoRowTagChips({...common, widths: {row3First: budget.laterWidth, row3Later: budget.laterWidth, row4: budget.laterWidth}});
  const oneRow = row4 != null;
  return (
    <>
      <View style={[rowStyles.row3, hidden]} onLayout={budget.onRowLayout}>
        {oneRow ? <TagChips {...common} page0Width={budget.laterWidth} laterWidth={budget.laterWidth} /> : two.row3}
      </View>
      <View style={[rowStyles.row4, hidden]}>{oneRow ? row4 : two.row4}</View>
    </>
  );
}
