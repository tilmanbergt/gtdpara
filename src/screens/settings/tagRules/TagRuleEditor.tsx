/**
 * The Tag Rules edit form: left column name, context, tags, toggles,
 * note target and the paged piece list; right column the page preview with
 * the nudge pad, the background and Create/Save/Cancel.
 */
import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {todayIso} from '../../../domain/meetingTime';
import {effectiveNoteTarget, hasUntouchedDefaultPieces, NoteContext, TagRule, NotePiece, NoteTarget, PIECE_CONTEXTS, pieceIsHeading, pieceMaxWidthPx, resolvedSharedFileFolder, resolvedSharedFileName, SharedNoteFolder, withDefaultPieces} from '../../../domain/tagRules';
import {renderSharedFileName, SHARED_FILE_NAME_PLACEHOLDERS} from '../../../domain/sharedNotePages';
import {MEETINGS_SUBFOLDER, sanitizeFileNameComponent, TODOS_SUBFOLDER} from '../../../storage/noteLinks';
import {common} from '../../../ui/commonStyles';
import ClipboardTextInput from '../../../ui/ClipboardTextInput';
import MiniTabs, {MiniTabDef} from '../../../ui/MiniTabs';
import NoteTemplatePreview, {pieceSummaryLabel} from '../../../ui/NoteTemplatePreview';
import NudgePad from '../../../ui/NudgePad';
import PagedSection from '../../../ui/PagedSection';
import {styles} from '../settingsStyles';
import CheckToggle from '../CheckToggle';
import {TagRuleDraft} from './useTagRuleDraft';


/** The four note contexts a definition can target - same set domain/tagRules.ts's PIECE_CONTEXTS is keyed against. */
export const CONTEXT_TABS: MiniTabDef<NoteContext>[] = [
  {key: 'project', label: 'Project'},
  {key: 'area', label: 'Area'},
  {key: 'todo', label: 'Todo'},
  {key: 'meeting', label: 'Meeting'},
];

/** Todo/Meeting-only (docs/dev/history/technical-design-shared-note-pages.md §6): whether this rule's notes each get their own file ('own', the default) or land as pages inside one shared file per Project/Area ('shared'). */
const NOTE_TARGET_TABS: MiniTabDef<NoteTarget>[] = [
  {key: 'own', label: 'Own file'},
  {key: 'shared', label: 'Shared file'},
];

/** Only meaningful when the rule's note target is 'shared' - where the shared file itself lives, same two choices §6 gives every shared-target rule. */
const SHARED_FOLDER_TABS: MiniTabDef<SharedNoteFolder>[] = [
  {key: 'subfolder', label: 'Subfolder'},
  {key: 'root', label: 'Item root'},
];

interface PieceRow {
  piece: NotePiece;
  index: number;
}

// Piece-list row height - the list self-measures its viewport
// (styles.pieceListBody), so this is only the *row* height PagedSection
// still needs (see PagedSection's own doc comment on why self-measuring only
// removes the viewport height input, not this one).
const PIECE_ROW_HEIGHT = 40;

/**
 * The example line under "Shared file name": what the rule's template
 * produces for an item tagged `#<first rule tag>/client` today, in the chosen location
 * (docs/dev/history/technical-design-split-by-tag.md §3.6) - same rendering and
 * sanitizing as storage/meetingNoteContent.ts's real file name.
 */
function sharedFilePreview(definition: TagRule): string {
  const name = sanitizeFileNameComponent(
    renderSharedFileName({
      template: resolvedSharedFileName(definition),
      ruleName: definition.name.trim() || 'Untitled',
      tag: definition.tags[0]?.trim().toLowerCase() ?? '',
      subtag: 'client',
      date: todayIso(),
    }),
  );
  if (resolvedSharedFileFolder(definition) === 'root') return `${name}.note`;
  const subfolder = definition.context === 'meeting' ? MEETINGS_SUBFOLDER : TODOS_SUBFOLDER;
  return `${subfolder}/${name}.note`;
}

export default function TagRuleEditor({
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
  const {editingDefIndex, draftDef, sharedFileNameInputRef, draftTagsText, selectedPieceIndex, setSelectedPieceIndex, setDraftTagsTextStripped, handleCancelDefinitionEdit, handleOpenTemplatePicker, handleOpenAddPiece, handleSaveDefinitionDraft, updateDraftDef, handleRemovePiece, handleNudgeSelectedPiece, handleFontDeltaSelectedPiece, handleStepChangeSelectedPiece, handleMaxWidthDeltaSelectedPiece, handleToggleHeadingSelectedPiece} = draft;
  if (!draftDef) return null;
  const selectedPiece = selectedPieceIndex !== null ? draftDef.pieces[selectedPieceIndex] ?? null : null;
  // The Heading switch (docs/dev/history/technical-design-projects-findable-notes.md §2.8):
  // Meeting and Todo rules only, never on a Linked file (a link can't be a title).
  const showHeadingToggle =
    !!selectedPiece && selectedPiece.type !== 'link' && (draftDef.context === 'meeting' || draftDef.context === 'todo');
  return (
    <View style={styles.templatesEditRow}>
      <View style={[common.column, common.columnLeft, styles.formColumnCard, {borderColor}]}>
        {/* Top fields - deliberately NOT flex (module doc comment's
            "tightly spaced" note): a plain View so this section always
            sizes to exactly its own content, however much leftover
            height styles.templatesEditRow's stretch gives this column -
            only styles.pieceListBody below (flex: 1) claims that. */}
        <View>
          <Text style={[styles.label, {color: textColor}]}>Name</Text>
          <View style={styles.clipboardFieldRow}>
            <ClipboardTextInput
              value={draftDef.name}
              onChangeText={text => updateDraftDef({name: text})}
              placeholder="e.g. Coaching"
              placeholderColor={placeholderColor}
              textColor={textColor}
              borderColor={borderColor}
            />
          </View>

          <Text style={[styles.label, styles.compactFieldSpacer, {color: textColor}]}>Context</Text>
          <MiniTabs
            tabs={CONTEXT_TABS}
            activeKey={draftDef.context}
            onChange={context => {
              // Dropping pieces that don't apply to the new context
              // avoids silently carrying e.g. a Date/Time piece into a
              // Project definition, where it would never render (§4 -
              // renderPieceText has no meeting-only source for it there).
              // A NEW rule whose pieces are still the untouched default
              // stack is re-seeded with the new context's defaults
              // instead (docs/dev/history/technical-design-linked-file-piece.md
              // §4.1); once the user edited pieces, they're kept.
              const pieces =
                editingDefIndex === null && hasUntouchedDefaultPieces(draftDef)
                  ? withDefaultPieces({...draftDef, context, pieces: []}).pieces
                  : draftDef.pieces.filter(p => PIECE_CONTEXTS[p.type].includes(context));
              // Prep/review tracking is meeting-only (domain/meetingTracking.ts) -
              // dropped along with the pieces that don't apply.
              // Note target (docs/dev/history/technical-design-shared-note-pages.md §6)
              // only applies to Todo/Meeting rules - reset back to 'own'
              // (and its shared-file fields cleared) leaving Project/Area
              // so a hidden 'shared' choice can't resurface confusingly
              // if the rule is later switched back.
              const targetsNote = context === 'meeting' || context === 'todo';
              updateDraftDef({
                context,
                pieces,
                ...(context === 'meeting' ? {} : {trackPrep: false, trackReview: false}),
                ...(targetsNote ? {} : {noteTarget: 'own', sharedFileName: undefined, sharedFileFolder: undefined}),
              });
              setSelectedPieceIndex(null);
            }}
            textColor={textColor}
            borderColor={borderColor}
          />

          <Text style={[styles.label, styles.compactFieldSpacer, {color: textColor}]}>Tags (space-separated)</Text>
          <View style={styles.clipboardFieldRow}>
            <ClipboardTextInput
              value={draftTagsText}
              onChangeText={setDraftTagsTextStripped}
              placeholder="e.g. #coaching #daily"
              placeholderColor={placeholderColor}
              textColor={textColor}
              borderColor={borderColor}
            />
          </View>

          <View style={[styles.toggleRow, styles.compactFieldSpacer]}>
            <CheckToggle
              label="Default for this context"
              checked={draftDef.isDefault}
              onPress={() => updateDraftDef({isDefault: !draftDef.isDefault})}
              textColor={textColor}
            />
            <CheckToggle
              label="Enabled"
              checked={draftDef.enabled}
              onPress={() => updateDraftDef({enabled: !draftDef.enabled})}
              textColor={textColor}
            />
            {/* Meeting rules only (docs/dev/history/technical-design-meeting-tracking.md) -
                one side-by-side row to keep the left column's piece list as
                tall as possible. Both default off, so a rule tracks nothing
                until switched on here. */}
            {draftDef.context === 'meeting' && (
              <View style={styles.toggleRowInline}>
                <CheckToggle
                  inline
                  label="Prepare before"
                  checked={!!draftDef.trackPrep}
                  onPress={() => updateDraftDef({trackPrep: !draftDef.trackPrep})}
                  textColor={textColor}
                />
                <CheckToggle
                  inline
                  label="Review after"
                  checked={!!draftDef.trackReview}
                  onPress={() => updateDraftDef({trackReview: !draftDef.trackReview})}
                  textColor={textColor}
                />
              </View>
            )}
          </View>

          {/* Todo/Meeting-only (docs/dev/history/technical-design-shared-note-pages.md
              §6) - whether this rule's notes land in their own file
              (the default) or as pages inside one shared file per
              Project/Area. Absent for Project/Area rules, which have no
              shared-file concept of their own to point at. */}
          {(draftDef.context === 'meeting' || draftDef.context === 'todo') && (
            <>
              <Text style={[styles.label, styles.compactFieldSpacer, {color: textColor}]}>Note target</Text>
              <MiniTabs
                tabs={NOTE_TARGET_TABS}
                activeKey={effectiveNoteTarget(draftDef)}
                onChange={noteTarget => updateDraftDef({noteTarget})}
                textColor={textColor}
                borderColor={borderColor}
              />

              {effectiveNoteTarget(draftDef) === 'shared' && (
                <>
                  <Text style={[styles.label, styles.compactFieldSpacer, {color: textColor}]}>Shared file name</Text>
                  <View style={styles.clipboardFieldRow}>
                    <ClipboardTextInput
                      value={draftDef.sharedFileName ?? ''}
                      onChangeText={text => updateDraftDef({sharedFileName: text})}
                      placeholder={draftDef.name || 'e.g. Daily'}
                      placeholderColor={placeholderColor}
                      textColor={textColor}
                      borderColor={borderColor}
                      handleRef={sharedFileNameInputRef}
                    />
                  </View>
                  {/* Placeholder chips + example (docs/dev/history/technical-design-split-by-tag.md §3.6). */}
                  <View style={styles.placeholderChipRow}>
                    {SHARED_FILE_NAME_PLACEHOLDERS.map(placeholder => (
                      <Pressable
                        key={placeholder}
                        style={[styles.placeholderChip, {borderColor}]}
                        onPress={() => sharedFileNameInputRef.current?.insertAtCursor(placeholder)}
                        hitSlop={4}>
                        <Text style={[styles.placeholderChipText, {color: textColor}]}>{placeholder}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <Text style={[styles.sharedFilePreview, {color: textColor}]} numberOfLines={1}>
                    {`e.g. ${sharedFilePreview(draftDef)}`}
                  </Text>

                  <Text style={[styles.label, styles.compactFieldSpacer, {color: textColor}]}>Shared file location</Text>
                  <MiniTabs
                    tabs={SHARED_FOLDER_TABS}
                    activeKey={resolvedSharedFileFolder(draftDef)}
                    onChange={sharedFileFolder => updateDraftDef({sharedFileFolder})}
                    textColor={textColor}
                    borderColor={borderColor}
                  />
                </>
              )}
            </>
          )}
        </View>

        {/* Pieces - a self-measuring PagedSection, so a long piece list
            pages instead of overflowing. `styles.pieceListBody`
            (flex: 1) is what makes it self-measure correctly - see that
            style's own comment. */}
        <View style={styles.pieceListBody}>
          <PagedSection<PieceRow>
            header="Pieces"
            rows={draftDef.pieces.map((piece, index) => ({piece, index}))}
            rowHeight={() => PIECE_ROW_HEIGHT}
            resetKey={draftDef.pieces.length}
            emptyHint="No pieces yet - add one below."
            renderRow={({piece, index}) => (
              <Pressable
                key={index}
                onPress={() => setSelectedPieceIndex(index)}
                style={[styles.pieceRow, {borderColor}, index === selectedPieceIndex && styles.pieceRowSelected]}>
                <Text style={[styles.pieceRowText, {color: textColor}]} numberOfLines={1}>
                  {pieceSummaryLabel(piece)}
                  {'  ('}
                  {piece.x}, {piece.y}
                  {')'}
                </Text>
                <Pressable onPress={() => handleRemovePiece(index)} hitSlop={8}>
                  <Text style={styles.pieceRowRemove}>×</Text>
                </Pressable>
              </Pressable>
            )}
            textColor={textColor}
            borderColor={borderColor}
          />

          {/* Adding a piece is its own page ('edit-piece') - see the
              module doc comment. */}
          <Pressable onPress={handleOpenAddPiece} hitSlop={8} style={styles.addDefRow}>
            <Text style={[styles.addDefRowText, {color: textColor}]}>+ Add piece</Text>
          </Pressable>
        </View>
      </View>

      <View style={[common.column, styles.formColumnCard, {borderColor}]}>
        <NoteTemplatePreview
          pieces={draftDef.pieces}
          selectedIndex={selectedPieceIndex}
          onSelectPiece={setSelectedPieceIndex}
          background={draftDef.template}
          textColor={textColor}
          borderColor={borderColor}
        />

        <NudgePad
          piece={
            selectedPieceIndex !== null
              ? {
                  ...draftDef.pieces[selectedPieceIndex],
                  maxWidthPx: pieceMaxWidthPx(draftDef.pieces[selectedPieceIndex]),
                }
              : null
          }
          onNudge={handleNudgeSelectedPiece}
          onStepChange={handleStepChangeSelectedPiece}
          onFontDelta={handleFontDeltaSelectedPiece}
          onMaxWidthDelta={handleMaxWidthDeltaSelectedPiece}
          textColor={textColor}
          borderColor={borderColor}
        />

        {showHeadingToggle && selectedPiece && (
          <CheckToggle
            label="Heading (in the note's table of contents)"
            checked={pieceIsHeading(selectedPiece)}
            onPress={handleToggleHeadingSelectedPiece}
            textColor={textColor}
          />
        )}

        {/* Pushes Background + Save/Cancel to the bottom of this column
            (module doc comment: "at the bottom the background template
            name and options to change it") - this column is stretched
            to the row's full height by styles.templatesEditRow, same as
            the left column, so there's real leftover space here for
            this spacer to claim. */}
        <View style={styles.columnSpacer} />

        {/* Compact "current choice + Change…" row, not the picker
            itself - choosing a background is its own page
            ('edit-template'). */}
        <Text style={[styles.label, {color: textColor}]}>Background</Text>
        <Pressable onPress={handleOpenTemplatePicker} hitSlop={4} style={[styles.templateFieldRow, {borderColor}]}>
          <Text style={[styles.templateFieldRowText, {color: textColor}]} numberOfLines={1}>
            {draftDef.template === '' ? 'None (blank note)' : draftDef.template}
          </Text>
          <Text style={[styles.templateFieldChange, {color: textColor}]}>Change…</Text>
        </Pressable>

        {/* Save is slightly wider than Cancel (styles.saveButtonWide). */}
        <View style={styles.formButtonRow}>
          <Pressable style={[styles.saveButton, styles.saveButtonWide]} onPress={handleSaveDefinitionDraft}>
            <Text style={styles.saveButtonText}>{editingDefIndex === null ? 'Create' : 'Save'}</Text>
          </Pressable>
          <Pressable style={styles.cancelButton} onPress={handleCancelDefinitionEdit} hitSlop={8}>
            <Text style={[styles.cancelButtonText, {color: textColor}]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}
