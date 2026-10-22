/**
 * Quick Add's Meeting rows: R2 (title + date, the date inline from the
 * start - meetings almost always have one), R3 (time + tag chips) and R4
 * (more tags, or what the widget puts there). All stay mounted while
 * another tab shows - see ui/quickAdd/styles.ts.
 */
import React from 'react';
import {StyleSheet, TextInput, View} from 'react-native';
import ClipboardStrip from '../ClipboardStrip';
import DateInput, {DateNudgeStrip} from '../DateInput';
import MarkWrap from '../status/StatusMark';
import TagChips, {useTwoRowTagChips} from '../TagChips';
import {useTagRowBudget} from '../tagChipLayout';
import {FONT} from '../theme';
import {rowStyles} from './styles';
import {MeetingDraftState} from './useMeetingDraft';
import {QuickAddCore} from './useQuickAddCore';

interface Props {
  core: QuickAddCore;
  meeting: MeetingDraftState;
  /** The capture panel: free height, strips where they always were, no tags or R4 (its own rows follow). */
  capture?: boolean;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}

export function MeetingInputRow({core, meeting, capture = false, textColor, borderColor, placeholderColor}: Props) {
  return (
    <View style={[rowStyles.row2, capture && rowStyles.row2Free, core.displayType !== 'meeting' && rowStyles.hidden]}>
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
            onFocusChange={capture ? undefined : meeting.setDateFocused}
            value={meeting.fields.date}
            onChangeText={meeting.setDate}
            placeholder="YYYY-MM-DD"
            placeholderColor={placeholderColor}
            textColor={textColor}
            borderColor={borderColor}
          />
        </MarkWrap>
      </View>
      {/* The same hovering strips as the Todo row's, over the tabs. */}
      {capture ? null : (
        <DateNudgeStrip
          visible={meeting.dateFocused}
          value={meeting.fields.date}
          onChangeText={meeting.setDate}
          placement="above-left"
          textColor={textColor}
          borderColor={borderColor}
        />
      )}
      <ClipboardStrip
        visible={meeting.inputFocused}
        actions={meeting.clipboard}
        placement={capture ? 'above-right' : 'above-left'}
        textColor={textColor}
        borderColor={borderColor}
      />
    </View>
  );
}

interface MetaRowsProps extends Props {
  layoutKey?: string;
  /** What R4 holds instead of the second tag row (the edit commands); the tags then page in R3 alone. */
  row4?: React.ReactNode;
}

/**
 * R3 (time, then tags) and R4 (more tags, or what the widget puts there).
 * No flow chips compete for R3, so the time field stays on every page; the
 * tags get what it leaves (technical-design-context-tags.md §8,
 * technical-design-item-card.md §5).
 */
export function MeetingMetaRows({core, meeting, layoutKey, capture = false, row4, ...colors}: MetaRowsProps) {
  const {textColor, borderColor, placeholderColor} = colors;
  const budget = useTagRowBudget(layoutKey ? `${layoutKey}:meeting` : undefined);
  const hidden = core.displayType !== 'meeting' && rowStyles.hidden;
  const common = {
    text: meeting.fields.title,
    recentTags: core.recentTags,
    recognizedTags: core.recognizedAbbrevTags,
    page: meeting.tagPage,
    onPageChange: meeting.setTagPage,
    onInsertTag: meeting.insertTag,
    onRemoveTag: meeting.removeTag,
    textColor,
    borderColor,
  };
  const twoRows = useTwoRowTagChips({
    ...common,
    widths: {row3First: budget.page0Width, row3Later: budget.page0Width, row4: budget.laterWidth},
  });
  const oneRow = row4 != null;
  const tags = capture ? null : oneRow ? (
    <TagChips {...common} page0Width={budget.page0Width} laterWidth={budget.page0Width} />
  ) : (
    twoRows.row3
  );
  const row3 = (
    <View style={[rowStyles.row3, capture && rowStyles.row3Free, hidden]} onLayout={budget.onRowLayout}>
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
        {tags}
      </View>
    </View>
  );
  if (capture) return row3;
  return (
    <>
      {row3}
      <View style={[rowStyles.row4, hidden]}>{oneRow ? row4 : twoRows.row4}</View>
    </>
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
