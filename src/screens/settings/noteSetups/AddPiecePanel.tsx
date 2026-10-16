/**
 * The layout page's Add panel (docs/dev/history/technical-design-note-setups.md
 * §6.3): the predefined pieces for this page kind (`PIECE_PAGES`) and the
 * page's own texts as rows - a tap places the piece (✓) or takes it off
 * again; each is on the page at most once. A text is edited, or a new one
 * written, in the composer on top of the panel, so the fields stay in the
 * upper part of the screen.
 */
import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {isPiecePlaced, layoutTexts, NoteTextItem, PageKind, PageLayout, PIECE_PAGES, PieceType} from '../../../domain/pageLayout';
import ClipboardTextInput from '../../../ui/ClipboardTextInput';
import {PIECE_TYPE_LABELS} from '../../../ui/NoteTemplatePreview';
import PagedSection from '../../../ui/PagedSection';
import {styles} from '../settingsStyles';
import {PANEL_ROW_HEIGHT, setupStyles} from './noteSetupsStyles';
import {LayoutDraft} from './useLayoutDraft';

/** The predefined pieces in list order; PIECE_PAGES decides which a page offers. */
const PREDEFINED: PieceType[] = ['title', 'dateTitle', 'date', 'time', 'related', 'link', 'sinceLast'];

type Row = {kind: 'type'; type: PieceType} | {kind: 'text'; item: NoteTextItem};

export default function AddPiecePanel(props: {
  pageKind: PageKind;
  layout: PageLayout | null;
  draft: LayoutDraft;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}): React.JSX.Element {
  const {pageKind, layout, draft, textColor, borderColor, placeholderColor} = props;
  const current = layout ?? {template: '', pieces: []};
  const rows: Row[] = [
    ...PREDEFINED.filter(t => PIECE_PAGES[t].includes(pageKind)).map(type => ({kind: 'type' as const, type})),
    ...layoutTexts(current).map(item => ({kind: 'text' as const, item})),
  ];
  const composer = draft.composer;
  return (
    <View style={setupStyles.panelBody}>
      {composer && (
        <View style={[setupStyles.composer, {borderColor}]}>
          <Text style={[styles.label, {color: textColor}]}>{composer.kind === 'new' ? 'New text' : 'Edit text'}</Text>
          <View style={styles.clipboardFieldRow}>
            <ClipboardTextInput
              value={draft.textDraftName}
              onChangeText={draft.setTextDraftName}
              placeholder="Name in the list, e.g. Attendees"
              placeholderColor={placeholderColor}
              textColor={textColor}
              borderColor={borderColor}
            />
          </View>
          <View style={[styles.clipboardFieldRow, styles.compactFieldSpacer]}>
            <ClipboardTextInput
              value={draft.textDraftBody}
              onChangeText={draft.setTextDraftBody}
              placeholder="The text on the page"
              placeholderColor={placeholderColor}
              textColor={textColor}
              borderColor={borderColor}
              multiline
            />
          </View>
          <View style={setupStyles.headerButtons}>
            <Pressable style={[styles.saveButton, setupStyles.headerSave]} onPress={draft.handleSaveText}>
              <Text style={styles.saveButtonText}>{composer.kind === 'new' ? 'Create' : 'Save'}</Text>
            </Pressable>
            {composer.kind === 'text' && (
              <Pressable onPress={draft.handleDeleteText} hitSlop={8}>
                <Text style={[setupStyles.panelRowAction, {color: textColor}]}>Delete</Text>
              </Pressable>
            )}
            <Pressable onPress={draft.handleCloseComposer} hitSlop={8}>
              <Text style={[setupStyles.panelRowAction, {color: textColor}]}>Close</Text>
            </Pressable>
          </View>
        </View>
      )}
      <View style={setupStyles.listBody}>
        <PagedSection<Row>
          header="Tap to place or remove"
          rows={rows}
          rowHeight={() => PANEL_ROW_HEIGHT}
          resetKey={rows.length}
          renderRow={row => {
            const type: PieceType = row.kind === 'type' ? row.type : 'text';
            const textId = row.kind === 'text' ? row.item.id : undefined;
            const placed = isPiecePlaced(current, type, textId);
            return (
              <Pressable
                key={row.kind === 'type' ? `type-${row.type}` : `text-${row.item.id}`}
                onPress={() => draft.handleTogglePlacement(type, textId)}
                style={[setupStyles.panelRow, {borderColor}, placed && setupStyles.panelRowSelected]}>
                <Text style={[setupStyles.panelRowText, {color: textColor}, placed && setupStyles.panelRowTextOn]} numberOfLines={1}>
                  {`${placed ? '✓ ' : ''}${row.kind === 'type' ? PIECE_TYPE_LABELS[row.type] : row.item.name}`}
                </Text>
                {row.kind === 'text' && (
                  <Pressable onPress={() => draft.handleEditText(row.item)} hitSlop={8}>
                    <Text style={[setupStyles.panelRowAction, {color: textColor}]}>Edit</Text>
                  </Pressable>
                )}
              </Pressable>
            );
          }}
          textColor={textColor}
          borderColor={borderColor}
        />
      </View>
      <Pressable onPress={draft.handleNewText} hitSlop={8} style={styles.addDefRow}>
        <Text style={[styles.addDefRowText, {color: textColor}]}>+ New text</Text>
      </Pressable>
    </View>
  );
}
