/**
 * The lasso capture / marks screen's add panel
 * (docs/dev/history/technical-design-lasso-0.8.md §3.9): Quick Add's Todo
 * and Meeting drafts in the same box, with a multi-line text or one row per
 * item (Split lines), the flow chips without the paged tag row, Save & next
 * / view / close under the input, then tag and "File to" chips in wrapped
 * rows and the screen's own extras. `fixedDestination` is the destination
 * picked there; a typed #ABBR still wins, as in Quick Add. Never edits.
 */
import React, {useRef} from 'react';
import {Keyboard, Pressable, StyleSheet, Text, TextInput, View} from 'react-native';
import {FILE_TO_SHORT} from '../../domain/captureFileTo';
import {Destination, destinationLabel} from '../../domain/destination';
import HighlightMark from '../HighlightMark';
import {useOnScreenHide} from '../screenActivity';
import MarkWrap from '../status/StatusMark';
import TagChipGrid from '../TagChipGrid';
import {COLORS, FONT} from '../theme';
import {quickAddButtons} from './ActionRow';
import {MeetingInputRow, MeetingMetaRows} from './MeetingRows';
import ProvenanceLine, {QuickAddAdds} from './ProvenanceLine';
import QuickAddFrame from './QuickAddFrame';
import {rowStyles} from './styles';
import TabsRow from './TabsRow';
import {TaskDueControl, TaskInputRow, TaskMetaRows} from './TaskRows';
import {CaptureSaveMode, CaptureSeed, MeetingQuickAddFields, truncateItemName} from './types';
import {CaptureState, FILE_TO_PAGE, SPLIT_ROWS_PER_PAGE, useCapture} from './useCapture';
import {useMeetingDraft} from './useMeetingDraft';
import {useQuickAddCore} from './useQuickAddCore';
import {useQuickAddStatus} from './useQuickAddStatus';
import {useTaskDraft} from './useTaskDraft';

interface Props {
  captureSeed?: CaptureSeed | null;
  /** After a successful save (all split items saved). */
  onCaptureSaved?: (mode: CaptureSaveMode) => void;
  /** "File to" chip pressed. */
  onCaptureDestinationChange?: (destination: Destination) => void;
  /** The mark's or lasso's own Project/Area - always in the short "File to" list. */
  captureOwnDestination?: Destination | null;
  /** Rendered below the chips (link checkbox, Mark for later / Cancel, ...). */
  captureExtras?: React.ReactNode;
  /** The destination picked on the screen. */
  fixedDestination: Destination;
  /** Meeting default date (the mark's day). */
  initialDate?: string;
  onAddTask: (text: string, destination: Destination) => Promise<void>;
  onAddMeeting: (fields: MeetingQuickAddFields, destination: Destination) => Promise<void>;
  /** Todo tab: one grey line saying what the screen adds to the new todo (ui/quickAdd/ProvenanceLine.tsx). */
  provenance?: QuickAddAdds | null;
  placeholder?: string;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}

function CaptureQuickAdd(props: Props): React.JSX.Element {
  const {fixedDestination, placeholder = 'New task', textColor, borderColor, placeholderColor, provenance} = props;
  const colors = {textColor, borderColor, placeholderColor};
  const core = useQuickAddCore({fixedDestination});
  const touchedRef = useRef(false);
  const onUserEdit = () => {
    touchedRef.current = true;
  };
  const task = useTaskDraft(core, {fixedDestination, editingLoop: false, loopsEnabled: false, onAddTask: props.onAddTask, onUserEdit});
  const meeting = useMeetingDraft(core, {
    fixedDestination,
    initialDate: props.initialDate,
    onAddMeeting: props.onAddMeeting,
    onUserEdit,
  });
  const capture = useCapture(core, task, meeting, {
    captureSeed: props.captureSeed,
    fixedDestination,
    initialDate: props.initialDate,
    captureOwnDestination: props.captureOwnDestination ?? null,
    onAddTask: props.onAddTask,
    onAddMeeting: props.onAddMeeting,
    onCaptureSaved: props.onCaptureSaved,
    onCaptureDestinationChange: props.onCaptureDestinationChange,
    touchedRef,
  });
  useQuickAddStatus(core, task, meeting, null);
  useOnScreenHide(() => Keyboard.dismiss());

  const optionsRow =
    core.displayType === 'task' ? (
      <View style={styles.captureOptions}>
        <Pressable onPress={capture.toggleSplit} hitSlop={8} accessibilityRole="checkbox">
          <Text style={[styles.splitToggleText, {color: textColor}]}>{capture.splitRows ? '☑' : '☐'} Split lines</Text>
        </Pressable>
        <Pressable style={[quickAddButtons.ghostButton, {borderColor}]} onPress={capture.splitAtCursor} hitSlop={6}>
          <Text style={[quickAddButtons.ghostButtonText, {color: textColor}]}>✂ Split at cursor</Text>
        </Pressable>
        <View style={quickAddButtons.centerSpacer} />
        <TaskDueControl task={task} ownStrip {...colors} />
      </View>
    ) : null;

  const countLabel = capture.count > 1 ? ` ${capture.count}` : '';
  const saveButton = (mode: CaptureSaveMode, tail: string) => (
    <Pressable style={[quickAddButtons.ghostButton, {borderColor}]} onPress={() => capture.submit(mode)} disabled={core.pending} hitSlop={6}>
      <Text style={[quickAddButtons.ghostButtonText, {color: textColor}]}>
        Save{countLabel}
        {tail}
      </Text>
    </Pressable>
  );
  const row4 = (
    <View style={quickAddButtons.row4}>
      <Text style={[styles.captureDest, {color: textColor}]} numberOfLines={1}>
        → {truncateItemName(destinationLabel(capture.destination), 24)}
      </Text>
      {saveButton('next', ' & next')}
      {saveButton('view', ' & view')}
      <MarkWrap mark={core.errorState && core.errorState.field === null ? 'warning' : null} textColor={textColor}>
        <Pressable style={quickAddButtons.primaryButton} onPress={() => capture.submit('close')} disabled={core.pending} hitSlop={6}>
          <Text style={quickAddButtons.primaryButtonText}>Save{countLabel} & close</Text>
        </Pressable>
      </MarkWrap>
      {core.displayType === 'meeting' ? (
        <HighlightMark on={meeting.fields.monthly} variant="toggle" onPress={meeting.toggleMonthly} disabled={core.pending} textColor={textColor} />
      ) : null}
    </View>
  );

  const below = (
    <View style={styles.captureBelow}>
      {capture.tagChips.length > 0 ? (
        <>
          <Text style={[styles.captureLabel, {color: textColor}]}>Tags</Text>
          <TagChipGrid chips={capture.tagChips} maxChips={18} textColor={textColor} borderColor={borderColor} />
        </>
      ) : null}
      <Text style={[styles.captureLabel, {color: textColor}]}>File to</Text>
      <TagChipGrid
        chips={capture.fileToChips}
        maxChips={capture.fileToAll ? FILE_TO_PAGE + 2 : FILE_TO_SHORT + 1}
        maxLabelChars={22}
        textColor={textColor}
        borderColor={borderColor}
      />
      {props.captureExtras}
    </View>
  );

  return (
    <QuickAddFrame
      free
      row1={<TabsRow core={core} taskOnly={false} hasNoteTab={false} noteFolderPath={null} textColor={textColor} />}
      row2={
        <>
          <TaskInputRow core={core} task={task} placeholder={placeholder} capture={{splitBlock: capture.splitRows ? <SplitRows capture={capture} {...colors} /> : null}} {...colors} />
          {optionsRow}
          <MeetingInputRow core={core} meeting={meeting} capture {...colors} />
        </>
      }
      rows34={
        <>
          <TaskMetaRows core={core} task={task} capture {...colors} />
          <MeetingMetaRows core={core} meeting={meeting} capture {...colors} />
          {provenance && provenance.length > 0 && core.displayType === 'task' ? (
            <View style={styles.provenance}>
              <ProvenanceLine parts={provenance} textColor={textColor} />
            </View>
          ) : null}
          {row4}
        </>
      }
      below={below}
      borderColor={borderColor}
    />
  );
}

/** Split lines: one editable, removable row per item, paged with ‹ ›; null while off. */
function SplitRows({capture, textColor, borderColor, placeholderColor}: {capture: CaptureState; textColor: string; borderColor: string; placeholderColor: string}) {
  const {splitRows, splitPage, splitPageCount, splitCursorRef} = capture;
  if (!splitRows) return null;
  const pager = (delta: -1 | 1, label: string, disabled: boolean) => (
    <Pressable onPress={() => capture.setSplitPage(Math.min(splitPageCount - 1, Math.max(0, splitPage + delta)))} disabled={disabled} hitSlop={8}>
      <Text style={[styles.splitPagerText, {color: textColor}, disabled && rowStyles.tabTextDisabled]}>{label}</Text>
    </Pressable>
  );
  return (
    <View>
      <View style={styles.splitHeader}>
        <Text style={[styles.splitHeaderText, {color: textColor}]}>{splitRows.filter(r => r.trim()).length} items</Text>
        {splitPageCount > 1 ? (
          <View style={styles.splitPager}>
            {pager(-1, '‹', splitPage === 0)}
            <Text style={[styles.splitHeaderText, {color: textColor}]}>
              {splitPage + 1}/{splitPageCount}
            </Text>
            {pager(1, '›', splitPage >= splitPageCount - 1)}
          </View>
        ) : null}
      </View>
      {splitRows.slice(splitPage * SPLIT_ROWS_PER_PAGE, (splitPage + 1) * SPLIT_ROWS_PER_PAGE).map((row, i) => {
        const index = splitPage * SPLIT_ROWS_PER_PAGE + i;
        return (
          <View key={index} style={styles.splitRow}>
            <Text style={[styles.splitIndex, {color: textColor}]}>{index + 1}</Text>
            <TextInput
              style={[rowStyles.input, rowStyles.inputFlex, {color: textColor, borderColor}]}
              value={row}
              onChangeText={t => capture.updateSplitRow(index, t)}
              onFocus={() => {
                if (splitCursorRef.current?.index !== index) splitCursorRef.current = {index, selection: null};
              }}
              onSelectionChange={e => {
                splitCursorRef.current = {index, selection: e.nativeEvent.selection};
              }}
              placeholder="Todo"
              placeholderTextColor={placeholderColor}
              autoCapitalize="none"
            />
            <Pressable onPress={() => capture.removeSplitRow(index)} hitSlop={8} accessibilityLabel={`Remove item ${index + 1}`}>
              <Text style={[styles.splitRemove, {color: textColor}]}>✕</Text>
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  captureOptions: {flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6, minHeight: 36},
  splitToggleText: {fontSize: FONT.small, fontWeight: '600'},
  splitHeader: {flexDirection: 'row', alignItems: 'center', marginBottom: 6, minHeight: 32},
  splitHeaderText: {fontSize: FONT.small, fontWeight: '600', marginRight: 10},
  splitPager: {flexDirection: 'row', alignItems: 'center'},
  splitPagerText: {fontSize: FONT.large, fontWeight: '600', paddingHorizontal: 8},
  splitRow: {flexDirection: 'row', alignItems: 'center', marginBottom: 6},
  splitIndex: {width: 24, fontSize: FONT.small, fontWeight: '600'},
  splitRemove: {fontSize: FONT.medium, paddingHorizontal: 8},
  captureDest: {flex: 1, fontSize: FONT.small, fontWeight: '600', marginRight: 8},
  captureBelow: {borderTopWidth: 1, borderTopColor: COLORS.borderLight, marginTop: 10, paddingTop: 8},
  captureLabel: {fontSize: FONT.small, fontWeight: '700', marginBottom: 6, marginTop: 4},
  provenance: {height: 34, flexDirection: 'row', alignItems: 'center'},
});

export default React.memo(CaptureQuickAdd);
