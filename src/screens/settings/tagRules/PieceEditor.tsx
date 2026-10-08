/**
 * "Add piece": left, the predefined pieces for the rule's context and the
 * rule's own texts (each "+ Add" / "Remove", placed at most once) plus a
 * pinned "+ New text"; right, an explanation with an example for a
 * predefined piece, or the editor for a text. The page stays open after
 * adding, so several pieces can be placed in one visit.
 */
import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {formatDayHeader} from '../../../domain/dateFormat';
import {dateTitleText, ruleTexts, isPiecePlaced, linkPieceText, NoteContext, TagRule, NoteTextItem, PIECE_CONTEXTS, PieceType} from '../../../domain/tagRules';
import {common} from '../../../ui/commonStyles';
import ClipboardTextInput from '../../../ui/ClipboardTextInput';
import {PIECE_TYPE_LABELS} from '../../../ui/NoteTemplatePreview';
import PagedSection from '../../../ui/PagedSection';
import {styles} from '../settingsStyles';
import {TagRuleDraft} from './useTagRuleDraft';


/** Row height for the Add-piece page's left list: a bordered row (44) + its top margin (6) - same "budget the margin into the fixed row height" convention PIECE_ROW_HEIGHT above uses. Big enough for a name + one preview line, and a comfortable e-ink tap target. */
const ADD_PIECE_ROW_HEIGHT = 50;

/** One row of the Add-piece page's left list: a predefined piece type, or one of THIS rule's own texts. ("+ New text" is not a row - it's pinned under the paged list so it can never land on a later page.) */
type AddPieceRow = {kind: 'type'; type: PieceType} | {kind: 'text'; item: NoteTextItem};

/** The predefined (non-text) piece types, in list order. Which ones show is still filtered per context by PIECE_CONTEXTS. */
const PREDEFINED_PIECE_TYPES: PieceType[] = ['title', 'dateTitle', 'date', 'time', 'related', 'link', 'sinceLast'];

/**
 * Explanation + example for a predefined piece's right-hand panel. The
 * examples mirror what domain/tagRules.ts's `renderPieceText` really
 * produces (the date example even runs the real `formatDayHeader`), so this
 * can't drift into promising a format the note won't have. Options (e.g. a
 * date format) would slot in below the example later - they would belong to
 * the one placement of the piece, since each piece is placed once.
 */
function predefinedPieceInfo(type: PieceType, context: NoteContext): {description: string; example: string} {
  switch (type) {
    case 'title':
      return {
        description: 'Inserts the note’s own title.',
        example:
          context === 'meeting'
            ? 'Weekly sync'
            : context === 'todo'
            ? 'Call supplier about invoice'
            : context === 'project'
            ? 'Website relaunch'
            : 'Health',
      };
    case 'dateTitle':
      return {
        description:
          'Inserts the meeting’s date with the year and its title, tags written as words without #. A heading by default: it shows in the note’s table of contents.',
        example: dateTitleText('2026-09-21', 'Weekly sync team/alpha'),
      };
    case 'date':
      return {description: 'Inserts the meeting’s date.', example: formatDayHeader('2026-09-21')};
    case 'time':
      return {
        description: 'Inserts the meeting’s time. Left out for a meeting without a time.',
        example: '14:00',
      };
    case 'related':
      return {
        description:
          'Lists the open tasks that share a tag with the note (always the note’s own tags). Left out when none match.',
        example: 'Relevant Todos:\n- Prepare slides #jf\n- Send minutes #jf',
      };
    case 'link':
      return {
        description:
          'Tappable link to the file attached to this ' +
          (context === 'meeting' ? 'meeting' : 'todo') +
          ' (paperclip). Left out when nothing is attached or the file no longer exists.',
        example: linkPieceText('Kickoff deck.pdf'),
      };
    case 'sinceLast':
      return {
        description:
          'What happened in this meeting’s thread since its previous meeting: what was agreed then, what you owe, wait for or should raise, and what got done. Each todo once, at most 6 lines per block. Left out without a previous meeting.',
        example: 'Since last time · Wed 30.9.\nAgreed last time:\n- Send minutes\n✓ Book room\nWaiting for:\n- Signed offer',
      };
    default:
      return {description: '', example: ''};
  }
}

/** The Add-piece page's left list: the predefined pieces that apply to the rule's context, then the rule's own texts. */
function buildAddPieceRows(def: TagRule): AddPieceRow[] {
  const types: AddPieceRow[] = PREDEFINED_PIECE_TYPES.filter(t => PIECE_CONTEXTS[t].includes(def.context)).map(
    type => ({kind: 'type', type}),
  );
  const texts: AddPieceRow[] = ruleTexts(def).map(item => ({kind: 'text', item}));
  return [...types, ...texts];
}

export default function PieceEditor({
  draft,
  textColor,
  borderColor,
  placeholderColor,
}: {
  draft: TagRuleDraft;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}): React.JSX.Element | null {
  const {draftDef, addSelection, textDraftName, setTextDraftName, textDraftBody, setTextDraftBody, confirmDeleteTextId, handleBackToEditForm, handleSelectPieceType, handleSelectText, handleSelectNewText, handleTogglePlacement, handleSaveText, handleDeleteText} = draft;
  if (!draftDef) return null;
  return (
    <View style={styles.templateBrowsePage}>
      <View style={styles.headerTopRow}>
        <Pressable onPress={handleBackToEditForm} hitSlop={8}>
          <Text style={[styles.backText, {color: textColor}]}>‹ Back to rule</Text>
        </Pressable>
        <Text style={[styles.sectionHeading, {color: textColor}]}>Add piece</Text>
      </View>

      <View style={styles.templateBrowseColumns}>
        <View style={[common.column, common.columnLeft, styles.formColumnCard, {borderColor}]}>
          <View style={styles.addPieceListBody}>
            <PagedSection<AddPieceRow>
              header="Pieces"
              rows={buildAddPieceRows(draftDef)}
              rowHeight={() => ADD_PIECE_ROW_HEIGHT}
              resetKey={buildAddPieceRows(draftDef).length}
              renderRow={row => {
                const type: PieceType = row.kind === 'type' ? row.type : 'text';
                const textId = row.kind === 'text' ? row.item.id : undefined;
                const placed = isPiecePlaced(draftDef, type, textId);
                const selected =
                  addSelection?.kind === 'type'
                    ? row.kind === 'type' && row.type === addSelection.type
                    : addSelection?.kind === 'text'
                    ? row.kind === 'text' && row.item.id === addSelection.id
                    : false;
                return (
                  <View
                    key={row.kind === 'type' ? `type-${row.type}` : `text-${row.item.id}`}
                    style={[styles.addRow, {borderColor}, selected && styles.addRowSelected]}>
                    <Pressable
                      onPress={() => (row.kind === 'type' ? handleSelectPieceType(row.type) : handleSelectText(row.item))}
                      hitSlop={4}
                      style={styles.addRowMain}>
                      <Text style={[styles.addRowName, {color: textColor}]} numberOfLines={1}>
                        {placed ? '✓ ' : ''}
                        {row.kind === 'type' ? PIECE_TYPE_LABELS[row.type] : row.item.name}
                      </Text>
                      {row.kind === 'text' && (
                        <Text style={[styles.addRowPreview, {color: textColor}]} numberOfLines={1}>
                          {row.item.text.split('\n')[0]}
                        </Text>
                      )}
                    </Pressable>
                    <Pressable
                      onPress={() => handleTogglePlacement(type, textId)}
                      hitSlop={6}
                      style={[styles.addRowButton, {borderColor}, placed && styles.addRowButtonPlaced]}>
                      <Text style={[styles.addRowButtonText, placed && styles.addRowButtonTextPlaced]}>
                        {placed ? 'Remove' : '+ Add'}
                      </Text>
                    </Pressable>
                  </View>
                );
              }}
              textColor={textColor}
              borderColor={borderColor}
            />
            {/* Pinned under the paged list (not a row in it) so it can
                never end up on a later page. */}
            <Pressable onPress={handleSelectNewText} hitSlop={8} style={styles.addDefRow}>
              <Text
                style={[
                  styles.addDefRowText,
                  {color: textColor},
                  addSelection?.kind === 'new' && styles.addDefRowTextActive,
                ]}>
                + New text
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={[common.column, styles.formColumnCard, {borderColor}]}>
          {addSelection?.kind === 'type' && (
            <>
              <Text style={[styles.addPanelTitle, {color: textColor}]}>{PIECE_TYPE_LABELS[addSelection.type]}</Text>
              <Text style={[styles.addPanelStatus, {color: textColor}]}>
                {isPiecePlaced(draftDef, addSelection.type) ? 'Placed in this rule' : 'Not placed'}
              </Text>
              <Text style={[styles.addPanelText, {color: textColor}]}>
                {predefinedPieceInfo(addSelection.type, draftDef.context).description}
              </Text>
              <Text style={[styles.label, styles.compactFieldSpacer, {color: textColor}]}>Example</Text>
              <View style={[styles.addPanelExample, {borderColor}]}>
                <Text style={[styles.addPanelText, {color: textColor}]}>
                  {predefinedPieceInfo(addSelection.type, draftDef.context).example}
                </Text>
              </View>
            </>
          )}

          {(addSelection?.kind === 'text' || addSelection?.kind === 'new') && (
            <>
              <Text style={[styles.addPanelTitle, {color: textColor}]}>
                {addSelection.kind === 'new' ? 'New text' : 'Edit text'}
              </Text>
              {addSelection.kind === 'text' && (
                <Text style={[styles.addPanelStatus, {color: textColor}]}>
                  {isPiecePlaced(draftDef, 'text', addSelection.id) ? 'Placed in this rule' : 'Not placed'}
                </Text>
              )}
              <Text style={[styles.label, styles.compactFieldSpacer, {color: textColor}]}>Name (shown in the list)</Text>
              <View style={styles.clipboardFieldRow}>
                <ClipboardTextInput
                  value={textDraftName}
                  onChangeText={setTextDraftName}
                  placeholder="e.g. Attendees"
                  placeholderColor={placeholderColor}
                  textColor={textColor}
                  borderColor={borderColor}
                />
              </View>
              <Text style={[styles.label, styles.compactFieldSpacer, {color: textColor}]}>Text</Text>
              <View style={styles.clipboardFieldRow}>
                <ClipboardTextInput
                  value={textDraftBody}
                  onChangeText={setTextDraftBody}
                  placeholder="e.g. Attendees checklist…"
                  placeholderColor={placeholderColor}
                  textColor={textColor}
                  borderColor={borderColor}
                  multiline
                />
              </View>
              <View style={styles.formButtonRow}>
                <Pressable style={[styles.saveButton, styles.saveButtonWide]} onPress={handleSaveText}>
                  <Text style={styles.saveButtonText}>{addSelection.kind === 'new' ? 'Create' : 'Save'}</Text>
                </Pressable>
                {addSelection.kind === 'text' && (
                  <Pressable style={styles.cancelButton} onPress={handleDeleteText} hitSlop={8}>
                    <Text style={[styles.cancelButtonText, {color: textColor}]}>
                      {confirmDeleteTextId === addSelection.id ? 'Confirm delete' : 'Delete'}
                    </Text>
                  </Pressable>
                )}
              </View>
              {addSelection.kind === 'text' && (
                <Text style={[styles.addPanelHint, {color: textColor}]}>
                  Saving updates the placed piece; its position and size stay. “Remove” in the list only takes it
                  off the page.
                </Text>
              )}
            </>
          )}
        </View>
      </View>

    </View>
  );
}
