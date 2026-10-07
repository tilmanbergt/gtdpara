/**
 * The left column of the capture screen (docs/dev/history/technical-design-lasso-0.8.md
 * §3.7, screen design A/C): "This lasso" first when the screen came from
 * the lasso, then the open marks grouped by note (this note first). A mark
 * always shows its picture (checkpoint B); the line below it gives page,
 * date and time and the recognition status. Paged, never scrolled.
 */
import React from 'react';
import {Image, Pressable, StyleSheet, Text, View} from 'react-native';
import {groupMarks, OpenMark} from '../../domain/marks';
import PagedSection from '../PagedSection';
import {COLORS, FONT} from '../theme';
import {MarkRecognition} from './useRecognitionQueue';
import {formatStamp} from '../../domain/dateFormat';
import {todayIso} from '../../domain/meetingTime';

export const LASSO_KEY = 'lasso';

type ColumnRow =
  | {kind: 'group'; key: string; label: string; count: number}
  | {kind: 'lasso'; key: string}
  | {kind: 'mark'; key: string; open: OpenMark};

const GROUP_H = 34;
const LASSO_H = 76;
const MARK_H = 132;
const PICTURE_IMAGE_H = 86;

/** The recognition status shown under a mark. */
export function markStatus(r: MarkRecognition | undefined): string {
  if (r?.missing) {return 'picture missing';}
  switch (r?.state) {
    case 'recognizing':
      return 'recognizing…';
    case 'done':
      return 'recognized';
    case 'empty':
    case 'failed':
      return 'no text';
    default:
      return 'not recognized';
  }
}

/** 'p3 · 5.10. 10:42 · recognized' - the date always shown, also for today. */
export function markMeta(open: OpenMark, r: MarkRecognition | undefined, today: string = todayIso()): string {
  return `p${open.mark.page + 1} · ${formatStamp(open.mark.createdAt, today)} · ${markStatus(r)}`;
}

interface Props {
  marks: OpenMark[];
  /** The note open in the host - its group comes first. */
  currentPath: string | null;
  /** Show the "This lasso" row (screen opened from the lasso). */
  withLasso: boolean;
  lassoText: string;
  lassoSaved: number;
  selectedKey: string;
  onSelect: (key: string) => void;
  recognition: Map<string, MarkRecognition>;
  pictureUri: (id: string) => string | null;
  textColor: string;
  borderColor: string;
}

export default function MarksColumn(props: Props): React.JSX.Element {
  const {marks, currentPath, withLasso, selectedKey, onSelect, recognition, textColor, borderColor} = props;
  const rows: ColumnRow[] = [];
  if (withLasso) {
    rows.push({kind: 'group', key: 'g-lasso', label: 'This lasso', count: 0});
    rows.push({kind: 'lasso', key: LASSO_KEY});
  }
  for (const group of groupMarks(marks, currentPath)) {
    rows.push({kind: 'group', key: `g-${group.absPath}`, label: group.fileName.replace(/\.note$/, ''), count: group.marks.length});
    for (const open of group.marks) {rows.push({kind: 'mark', key: open.mark.id, open});}
  }

  const rowHeight = (row: ColumnRow) =>
    row.kind === 'group' ? GROUP_H : row.kind === 'lasso' ? LASSO_H : MARK_H;

  const renderRow = (row: ColumnRow) => {
    if (row.kind === 'group') {
      return (
        <View key={row.key} style={[styles.group, {height: GROUP_H, borderColor}]}>
          <Text style={[styles.groupText, {color: textColor}]} numberOfLines={1}>
            {row.label}
          </Text>
          {row.count > 0 ? <Text style={[styles.groupText, {color: textColor}]}>{row.count}</Text> : null}
        </View>
      );
    }
    const selected = row.key === selectedKey;
    const fg = selected ? COLORS.accentText : textColor;
    if (row.kind === 'lasso') {
      return (
        <Pressable key={row.key} onPress={() => onSelect(LASSO_KEY)} style={[styles.row, {height: LASSO_H, borderColor}, selected && styles.selected]}>
          <Text style={[styles.text, {color: fg}]} numberOfLines={2}>
            {props.lassoText.trim() || 'Reading…'}
          </Text>
          <Text style={[styles.meta, {color: fg}]}>{props.lassoSaved > 0 ? `now · ${props.lassoSaved} saved` : 'now'}</Text>
        </Pressable>
      );
    }
    const r = recognition.get(row.key);
    const uri = props.pictureUri(row.key);
    const boxText = row.open.mark.text?.trim() ?? '';
    return (
      <Pressable
        key={row.key}
        onPress={() => onSelect(row.key)}
        style={[styles.row, {height: MARK_H, borderColor}, selected && styles.selected]}>
        {uri && !r?.missing ? (
          <View style={styles.pictureBox}>
            <Image source={{uri}} style={styles.picture} resizeMode="contain" />
          </View>
        ) : (
          <Text style={[styles.text, !boxText && styles.italic, {color: fg}]} numberOfLines={3}>
            {boxText || 'no picture - type it'}
          </Text>
        )}
        <Text style={[styles.meta, {color: fg}]} numberOfLines={1}>
          {markMeta(row.open, r)}
        </Text>
      </Pressable>
    );
  };

  return (
    <PagedSection<ColumnRow>
      header={withLasso ? 'Lasso & marks' : `Open marks · ${marks.length}`}
      rows={rows}
      rowHeight={rowHeight}
      renderRow={renderRow}
      isCountableRow={row => row.kind !== 'group'}
      emptyHint="No open marks"
      textColor={textColor}
      borderColor={borderColor}
    />
  );
}

const styles = StyleSheet.create({
  group: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingHorizontal: 6,
  },
  groupText: {fontSize: FONT.small, fontWeight: '700'},
  row: {borderBottomWidth: 1, paddingHorizontal: 8, paddingVertical: 8, justifyContent: 'space-between', overflow: 'hidden'},
  selected: {backgroundColor: COLORS.accent},
  text: {fontSize: FONT.medium},
  italic: {fontStyle: 'italic'},
  meta: {fontSize: FONT.small, opacity: 0.8},
  pictureBox: {height: PICTURE_IMAGE_H, backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#000000'},
  picture: {width: '100%', height: '100%'},
});
