/**
 * The Notebook tab's Contents list
 * (docs/dev/history/technical-design-home-notebooks.md §3.4, §3.5): one
 * fixed-height row per heading, "p.<n>  <text>", paged; a tap opens the
 * notebook at that page. A handwritten heading reads "Handwritten heading" in
 * italics; a meeting's date and a todo's "todo" follow its text, dimmed.
 */
import React from 'react';
import {Pressable, StyleSheet, Text} from 'react-native';
import {contentsPageLabel, NOTEBOOK_TAB_TEXT} from '../../domain/homeNotebook';
import {ContentsEntry} from '../../domain/notebookContents';
import PagedSection from '../../ui/PagedSection';
import {FONT, SPACING} from '../../ui/theme';

/** paddingVertical 7 × 2 + one medium line 22 + border 1. */
const CONTENTS_ROW_HEIGHT = 37;

interface Props {
  entries: ContentsEntry[];
  onOpenPage: (page: number) => void;
  resetKey: string;
  viewportHeight?: number;
  textColor: string;
  borderColor: string;
}

export default function ContentsSection({entries, onOpenPage, resetKey, viewportHeight, textColor, borderColor}: Props): React.JSX.Element {
  return (
    <PagedSection
      header={NOTEBOOK_TAB_TEXT.contents}
      rows={entries}
      rowHeight={() => CONTENTS_ROW_HEIGHT}
      viewportHeight={viewportHeight}
      resetKey={resetKey}
      emptyHint={NOTEBOOK_TAB_TEXT.noContents}
      renderRow={entry => (
        <Pressable
          key={`${entry.page}-${entry.y}-${entry.text}`}
          onPress={() => onOpenPage(entry.page)}
          style={[styles.row, {height: CONTENTS_ROW_HEIGHT, minHeight: CONTENTS_ROW_HEIGHT, borderColor}]}>
          <Text style={[styles.page, {color: textColor}]}>{contentsPageLabel(entry.page)}</Text>
          <Text style={[styles.text, {color: textColor}, entry.source === 'handwritten' && styles.handwritten]} numberOfLines={1}>
            {entry.text}
            {entry.detail ? <Text style={styles.detail}>{` · ${entry.detail}`}</Text> : null}
          </Text>
        </Pressable>
      )}
      textColor={textColor}
      borderColor={borderColor}
    />
  );
}

const styles = StyleSheet.create({
  row: {flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 7, borderBottomWidth: 1},
  page: {width: 44, fontSize: FONT.medium, opacity: 0.6, includeFontPadding: false},
  text: {flex: 1, fontSize: FONT.medium, includeFontPadding: false, marginLeft: SPACING.xs},
  handwritten: {fontStyle: 'italic', opacity: 0.7},
  detail: {fontSize: FONT.small, opacity: 0.6},
});
