/**
 * Quick Add's Meeting rows: R2 (title + date, the date inline from the
 * start - meetings almost always have one) and R3 (time + tag chips). Both
 * stay mounted while another tab shows - see ui/quickAdd/styles.ts.
 */
import React from 'react';
import {StyleSheet, TextInput, View} from 'react-native';
import ClipboardStrip from '../ClipboardStrip';
import DateInput from '../DateInput';
import MarkWrap from '../status/StatusMark';
import TagChips from '../TagChips';
import {useTagRowBudget} from '../tagChipLayout';
import {FONT} from '../theme';
import {rowStyles} from './styles';
import {AttachmentCluster} from './TaskRows';
import {MeetingDraftState} from './useMeetingDraft';
import {QuickAddCore} from './useQuickAddCore';

interface Props {
  core: QuickAddCore;
  meeting: MeetingDraftState;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}

export function MeetingInputRow({core, meeting, textColor, borderColor, placeholderColor}: Props) {
  return (
    <View style={[rowStyles.row2, core.displayType !== 'meeting' && rowStyles.hidden]}>
      <View style={rowStyles.row2Wrap}>
        <MarkWrap mark={core.fieldMark('title')} textColor={textColor} flex>
          <TextInput
            ref={meeting.inputRef}
            style={[rowStyles.input, rowStyles.inputFlex, {color: textColor, borderColor}]}
            value={meeting.fields.title}
            onChangeText={meeting.setTitle}
            onSelectionChange={e => meeting.onSelectionChange(e.nativeEvent.selection)}
            selection={meeting.selectionOverride ?? undefined}
            onFocus={() => meeting.setInputFocused(true)}
            onBlur={() => meeting.setInputFocused(false)}
            placeholder="New meeting title"
            placeholderTextColor={placeholderColor}
            autoCapitalize="none"
          />
        </MarkWrap>
        <MarkWrap mark={core.fieldMark('date')} textColor={textColor}>
          <DateInput
            value={meeting.fields.date}
            onChangeText={meeting.setDate}
            placeholder="YYYY-MM-DD"
            placeholderColor={placeholderColor}
            textColor={textColor}
            borderColor={borderColor}
          />
        </MarkWrap>
      </View>
      {/* The same hovering Select All/Copy/Cut/Paste strip as the Todo row's. */}
      <ClipboardStrip visible={meeting.inputFocused} actions={meeting.clipboard} textColor={textColor} borderColor={borderColor} />
    </View>
  );
}

interface MetaRowProps extends Props {
  layoutKey?: string;
  /** False in the capture panel: its tags are a chip grid below the box. */
  showTags: boolean;
  linkedFileMissing?: boolean;
}

/**
 * No flow chips compete for this row, so the tag chips run wide from page 0
 * on (technical-design-context-tags.md §8); the time field stays visible,
 * just compact.
 */
export function MeetingMetaRow({core, meeting, layoutKey, showTags, linkedFileMissing, ...colors}: MetaRowProps) {
  const {textColor, borderColor, placeholderColor} = colors;
  const budget = useTagRowBudget(!!meeting.linkedFile, layoutKey ? `${layoutKey}:meeting` : undefined);
  return (
    <View style={[rowStyles.row3, core.displayType !== 'meeting' && rowStyles.hidden]} onLayout={budget.onRowLayout}>
      <View style={rowStyles.row3ChipsGroup}>
        <View style={rowStyles.row3Lead} onLayout={budget.onLeadLayout}>
          <MarkWrap mark={core.fieldMark('time')} textColor={textColor}>
            <TextInput
              style={[rowStyles.input, styles.timeInputCompact, {color: textColor, borderColor}]}
              value={meeting.fields.time}
              onChangeText={meeting.setTime}
              placeholder="15 · 15-16.30 · 2d"
              placeholderTextColor={placeholderColor}
              autoCapitalize="none"
            />
          </MarkWrap>
        </View>
        {showTags && (
          <TagChips
            text={meeting.fields.title}
            recentTags={core.recentTags}
            recognizedTags={core.recognizedAbbrevTags}
            page={meeting.tagPage}
            onPageChange={meeting.setTagPage}
            page0Width={budget.page0Width}
            laterWidth={budget.laterWidth}
            onInsertTag={meeting.insertTag}
            onRemoveTag={meeting.removeTag}
            textColor={textColor}
            borderColor={borderColor}
          />
        )}
      </View>
      <AttachmentCluster
        linkedFile={meeting.linkedFile}
        missing={linkedFileMissing}
        onClear={meeting.clearLinkedFile}
        onLayout={budget.onAttachLayout}
        textColor={textColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  timeInputCompact: {
    fontSize: FONT.small,
    // 110 wide (docs/dev/history/technical-design-monthly-view.md §5.1): the
    // field also takes a range/length - "15:00-16:30" must fit.
    width: 110,
    marginRight: 6,
  },
});
