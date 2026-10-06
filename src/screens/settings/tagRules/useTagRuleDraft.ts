/**
 * The Tag Rules tab's editing state: which page is shown (list, the rule
 * form, the background picker, the Add-piece page), the rule being edited
 * as a draft (`draftDef`, discarded on Cancel), and every action on it.
 * Creating, saving and deleting a rule persist at once (persistTagRules),
 * independent of the other tabs' Save button. Held by the Settings shell so
 * an unsaved rule survives switching sub-tabs.
 */
import {Dispatch, SetStateAction, useRef, useState} from 'react';
import {stripSpaceAfterHash} from '../../../domain/markdown';
import {GtdParaSettings} from '../../../domain/settings';
import {
  addPieceToRule,
  addTextItem,
  createEmptyTagRule,
  findPlacedPieceIndex,
  isPiecePlaced,
  migrateLegacyTextPieces,
  NoteTextItem,
  nudgePieceAt,
  pieceMaxWidthPx,
  PieceType,
  removePieceFromRule,
  removePlacedPiece,
  removeTextItem,
  ruleTexts,
  setPieceFontSize,
  setPieceMaxWidth,
  setPieceStep,
  TagRule,
  updateTextItem,
  withDefaultPieces,
} from '../../../domain/tagRules';
import {loadSettings, saveSettings} from '../../../storage/settingsStorage';
import {ClipboardTextInputHandle} from '../../../ui/ClipboardTextInput';
import {PIECE_TYPE_LABELS} from '../../../ui/NoteTemplatePreview';
import {useErrorStatus, useStatus} from '../../../ui/status/StatusProvider';
import {errorMessage} from '../../../utils/errorMessage';

/** What the Add-piece page's right panel is showing/editing; null = nothing selected. */
export type AddPieceSelection = {kind: 'type'; type: PieceType} | {kind: 'text'; id: string} | {kind: 'new'} | null;

export function useTagRuleDraft(values: GtdParaSettings, setValues: Dispatch<SetStateAction<GtdParaSettings>>) {
  // "Templates" tab - four pages, not two (see the module doc comment's
  // "Edit form is three pages" note): 'list', the two-column 'edit' form,
  // and the two full-page pickers it delegates to, 'edit-template' and
  // 'edit-piece'. The definition being edited is held as its own draft
  // (`draftDef`), separate from `values.tagRules`, so
  // Cancel can discard in-progress edits without touching the
  // saved-in-`values` list; `editingDefIndex` is null while creating a new
  // definition (not yet in the list) and the index being edited otherwise.
  // `draftTagsText` is edited as free text (same "don't fight the input"
  // reasoning as the number fields above) and parsed to
  // `TagRule.tags` only on save.
  const [templatesView, setTemplatesView] = useState<'list' | 'edit' | 'edit-template' | 'edit-piece'>('list');
  const [editingDefIndex, setEditingDefIndex] = useState<number | null>(null);
  const [draftDef, setDraftDef] = useState<TagRule | null>(null);
  /** The "Shared file name" field - its placeholder chips insert at its cursor (docs/dev/technical-design-split-by-tag.md §3.6). */
  const sharedFileNameInputRef = useRef<ClipboardTextInputHandle>(null);
  const [draftTagsText, setDraftTagsText] = useState('');
  const [selectedPieceIndex, setSelectedPieceIndex] = useState<number | null>(null);
  // "Add piece" page (§6.1): what the right panel shows, the name/text draft
  // of the text being edited or created there, a one-line notice under the
  // columns ("Added ...", "Saved ..."), and the id of a placed text whose
  // Delete is awaiting a confirming second tap. All reset on entering the page.
  const [addSelection, setAddSelection] = useState<AddPieceSelection>(null);
  const [textDraftName, setTextDraftName] = useState('');
  const [textDraftBody, setTextDraftBody] = useState('');
  const [addNotice, setAddNotice] = useState<string | null>(null);
  useStatus('Settings.addNotice', addNotice ? {kind: 'success', text: addNotice, onDismiss: () => setAddNotice(null)} : null);
  const [confirmDeleteTextId, setConfirmDeleteTextId] = useState<string | null>(null);
  // "Choose background" page's real-image preview (2026-09-18, docs/
  // technical-design-note-templates.md §7 Phase 5 item #1 - first-ever
  // <Image> use anywhere in this codebase, see that doc's investigation
  // note). Tracks the filename an <Image> load last FAILED for, not a
  // plain boolean - comparing it against draftDef.template on render means
  // switching to a different background (or back to a previously-good one)
  // re-attempts a load rather than staying stuck on a stale failure, with
  // no separate reset effect needed.
  const [templatePreviewFailedFor, setTemplatePreviewFailedFor] = useState<string | null>(null);
  // Surfaces a failed persistTagRules() write (create/save/delete on this
  // tab now persist immediately - see persistTagRules's own doc comment)
  // inline within the Templates tab itself, since the global saveError text
  // it would otherwise have shared sits in the global footer, which this
  // tab no longer renders (see the footer's own `activeTab !== 'templates'`
  // guard below).
  const [templatesSaveError, setTemplatesSaveError] = useState<string | null>(null);
  // Integrity Check result (was a native dialog) -> central status slot (D10).
  useErrorStatus('Settings.templatesSaveError', templatesSaveError, () => setTemplatesSaveError(null));


  const handleAddDefinition = () => {
    // New rules start with the context's default pieces, stacked (docs/
    // technical-design-linked-file-piece.md §4.1).
    setDraftDef(withDefaultPieces(createEmptyTagRule(String(values.nextTagRuleId), 'meeting')));
    setEditingDefIndex(null);
    setDraftTagsText('');
    setSelectedPieceIndex(null);
    setTemplatesView('edit');
  };

  const handleEditDefinition = (index: number) => {
    // Rules saved before rule-owned texts existed: each of their inline text
    // pieces becomes a named text of this rule (no-op otherwise - see
    // migrateLegacyTextPieces). Only lands in `values` if the rule is saved.
    const def = migrateLegacyTextPieces(values.tagRules[index]);
    setDraftDef(def);
    setEditingDefIndex(index);
    // '#'-prefixed, space-separated - matches both the list view's own
    // `#tag` rendering and what handleSaveDefinitionDraft's parse expects
    // back (see the module doc comment - the old `.join(', ')` here was a
    // latent bug, not just a style mismatch).
    setDraftTagsText(def.tags.map(t => `#${t}`).join(' '));
    setSelectedPieceIndex(null);
    setTemplatesView('edit');
  };

  /** Wraps `setDraftTagsText` the same way `ui/QuickAddWidget.tsx`'s own tag-bearing field setters wrap theirs (Tilman, 2026-09-18: "remove spaces after # as is done in the quickadd widget"), so typing "# " never leaves a stray space between the hash and the tag text. */
  const setDraftTagsTextStripped = (text: string) => {
    setDraftTagsText(stripSpaceAfterHash(text));
  };

  const handleCancelDefinitionEdit = () => {
    setDraftDef(null);
    setEditingDefIndex(null);
    setSelectedPieceIndex(null);
    setTemplatesView('list');
  };

  /** Returns from either full-page picker ('edit-template'/'edit-piece') back to the two-column 'edit' form - both pickers commit their change immediately on selection (see the module doc comment), so "back" here is never a discard. */
  const handleBackToEditForm = () => {
    setTemplatesView('edit');
  };

  const handleOpenTemplatePicker = () => {
    setTemplatesView('edit-template');
  };

  /** Sets the draft's background - stays on the 'edit-template' page (2026-09-18 revision: Tilman wanted a browse-then-"Apply" flow, not the earlier tap-and-return-immediately behavior - "tapping on a file shows the preview on the right side, and the big apply button uses that for the definition"). `handleBackToEditForm` doubles as the Apply action - there's nothing left to commit once a row's been tapped, so "Apply" is really just "done browsing." */
  const handleChooseTemplate = (fileName: string) => {
    updateDraftDef({template: fileName});
  };

  const handleOpenAddPiece = () => {
    setAddSelection(null);
    setTextDraftName('');
    setTextDraftBody('');
    setAddNotice(null);
    setConfirmDeleteTextId(null);
    setTemplatesView('edit-piece');
  };

  /**
   * Writes a new `tagRules` list straight to disk - used by
   * both handleSaveDefinitionDraft and handleDeleteDefinition below now that
   * the Templates tab's own Save/Cancel/Delete persist immediately rather
   * than waiting for this screen's global Save button (2026-09-18, Tilman:
   * "we have our own save/cancel buttons and use should not need to tap
   * two. So restrict these to the other settings pages" - see the global
   * footer's own `activeTab !== 'templates'` guard below for the other half
   * of this change). Deliberately re-`loadSettings()`s from disk and merges
   * just the definitions/id fields into THAT, rather than persisting the
   * in-memory `values` object this screen already has - `values` is shared
   * across every tab's draft edits, so a Folders/Focus/Calendar/Meeting Note
   * field the user has mid-typed-but-not-yet-tapped-global-Save-for could
   * otherwise get silently written to disk as a side effect of an unrelated
   * Templates definition save. This keeps the two persistence paths fully
   * isolated: Templates definitions save themselves immediately, everything
   * else still only saves on this screen's own global Save tap.
   */
  const persistTagRules = async (
    tagRules: TagRule[],
    nextTagRuleId?: number,
  ): Promise<void> => {
    const onDisk = await loadSettings();
    await saveSettings({
      ...onDisk,
      tagRules,
      ...(nextTagRuleId !== undefined ? {nextTagRuleId} : {}),
    });
  };

  /** Parses the free-text tags field (space-separated, not comma - Tilman, 2026-09-18) back into `TagRule.tags` and writes the draft into `values`, then persists immediately (see persistTagRules above) - Templates definitions no longer wait for this screen's global Save button. These tags are OR'd by domain/tagRules.ts's resolveNoteTemplate - a note matches this definition if it carries ANY one of them, not all at once. Lowercased here (2026-09-18, Tilman: "tags should be normalized to small in the config") so the config's own stored tags are always lowercase regardless of how the user typed them - resolveNoteTemplate additionally matches case-insensitively on top of this, so a note's own mixed-case tags still match either way. */
  const handleSaveDefinitionDraft = async () => {
    if (!draftDef) return;
    const tags = draftTagsText
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .map(t => t.replace(/^#/, ''))
      .filter(Boolean);
    const finalDef: TagRule = {...draftDef, name: draftDef.name.trim() || 'Untitled', tags};
    const list = [...values.tagRules];
    let nextTagRuleId = values.nextTagRuleId;
    if (editingDefIndex === null) {
      list.push(finalDef);
      nextTagRuleId = values.nextTagRuleId + 1;
      setValues(prev => ({...prev, tagRules: list, nextTagRuleId}));
    } else {
      list[editingDefIndex] = finalDef;
      setValues(prev => ({...prev, tagRules: list}));
    }
    setDraftDef(null);
    setEditingDefIndex(null);
    setSelectedPieceIndex(null);
    setTemplatesView('list');
    setTemplatesSaveError(null);
    try {
      await persistTagRules(list, editingDefIndex === null ? nextTagRuleId : undefined);
    } catch (e) {
      setTemplatesSaveError(errorMessage(e));
    }
  };

  /** Immediate, no arm/confirm second tap - matches `ui/QuickAddWidget.tsx`'s own Delete button (see the module doc comment); nothing else in the Templates tab uses a confirm step either. Persists immediately too, same as handleSaveDefinitionDraft above - there's no separate Save step for a delete from the list view to wait for. */
  const handleDeleteDefinition = async (index: number) => {
    const list = values.tagRules.filter((_, i) => i !== index);
    setValues(prev => ({
      ...prev,
      tagRules: list,
    }));
    setTemplatesSaveError(null);
    try {
      await persistTagRules(list);
    } catch (e) {
      setTemplatesSaveError(errorMessage(e));
    }
  };

  const updateDraftDef = (patch: Partial<TagRule>) => {
    setDraftDef(prev => (prev ? {...prev, ...patch} : prev));
  };

  // ---- "Add piece" page handlers (§6.1) -----------------------------------
  // Everything here edits `draftDef` only - texts are part of the rule, so
  // they are saved (or discarded) with the rule's own Create/Save/Cancel, not
  // persisted on their own. The page STAYS OPEN after "+ Add"/"Remove" so
  // several pieces can be placed in one visit (Tilman, 2026-09-20).

  const handleSelectPieceType = (type: PieceType) => {
    setAddSelection({kind: 'type', type});
    setAddNotice(null);
    setConfirmDeleteTextId(null);
  };

  const handleSelectText = (item: NoteTextItem) => {
    setAddSelection({kind: 'text', id: item.id});
    setTextDraftName(item.name);
    setTextDraftBody(item.text);
    setAddNotice(null);
    setConfirmDeleteTextId(null);
  };

  const handleSelectNewText = () => {
    setAddSelection({kind: 'new'});
    setTextDraftName('');
    setTextDraftBody('');
    setAddNotice(null);
    setConfirmDeleteTextId(null);
  };

  /** "+ Add" / "Remove" on a row: each piece (a predefined type, or one text) is placed at most once per rule. Adding seeds it below the last piece and selects it, so the NudgePad on the 'edit' form is already pointing at it on return; removing a text piece leaves the text itself in the list. */
  const handleTogglePlacement = (type: PieceType, textId?: string) => {
    if (!draftDef) return;
    const label = type === 'text' ? textLabel(textId) : PIECE_TYPE_LABELS[type];
    setConfirmDeleteTextId(null);
    if (isPiecePlaced(draftDef, type, textId)) {
      const idx = findPlacedPieceIndex(draftDef, type, textId);
      setDraftDef(removePlacedPiece(draftDef, type, textId));
      setSelectedPieceIndex(prev => (prev === idx ? null : prev !== null && prev > idx ? prev - 1 : prev));
      setAddNotice(
        type === 'text' ? `Removed “${label}” from the rule - the text stays in the list.` : `Removed ${label} from the rule.`,
      );
    } else {
      const body = type === 'text' ? ruleTexts(draftDef).find(t => t.id === textId)?.text ?? '' : undefined;
      const updated = addPieceToRule(draftDef, type, body, type === 'text' ? textId : undefined);
      setDraftDef(updated);
      setSelectedPieceIndex(updated.pieces.length - 1);
      setAddNotice(`Added ${type === 'text' ? `“${label}”` : label} to the rule.`);
    }
  };

  /** Row label for a text id in the current draft ('Text' if it can't be found - shouldn't happen). */
  const textLabel = (textId?: string): string =>
    (draftDef && ruleTexts(draftDef).find(t => t.id === textId)?.name) || 'Text';

  /** Create (new) or Save (existing). Saving an existing text also updates its placed piece in place - position and font stay (updateTextItem). */
  const handleSaveText = () => {
    if (!draftDef || !addSelection) return;
    const name = textDraftName.trim() || 'Untitled';
    setConfirmDeleteTextId(null);
    if (addSelection.kind === 'new') {
      const {definition, id} = addTextItem(draftDef, name, textDraftBody);
      setDraftDef(definition);
      setTextDraftName(name);
      setAddSelection({kind: 'text', id});
      setAddNotice('Text created - use + Add to place it.');
    } else if (addSelection.kind === 'text') {
      const placed = isPiecePlaced(draftDef, 'text', addSelection.id);
      setDraftDef(updateTextItem(draftDef, addSelection.id, name, textDraftBody));
      setTextDraftName(name);
      setAddNotice(placed ? 'Saved - the placed piece is updated, its position is kept.' : 'Saved.');
    }
  };

  /** Deletes the selected text from the rule. A text that is placed takes its piece with it, so that needs confirming (nothing else on this tab confirms - this is the one delete that also removes something from the page): a confirm in the central status slot, or a second tap on Delete (docs/dev/technical-design-status-slot.md D10). */
  const handleDeleteText = () => {
    if (!draftDef || addSelection?.kind !== 'text') return;
    const id = addSelection.id;
    if (isPiecePlaced(draftDef, 'text', id) && confirmDeleteTextId !== id) {
      setConfirmDeleteTextId(id);
      setAddNotice(null);
      return;
    }
    deleteTextNow(id);
  };

  const deleteTextNow = (id: string) => {
    if (!draftDef) return;
    setDraftDef(removeTextItem(draftDef, id));
    setSelectedPieceIndex(null);
    setAddSelection(null);
    setConfirmDeleteTextId(null);
    setAddNotice('Text deleted.');
  };
  useStatus(
    'Settings.deleteTextConfirm',
    confirmDeleteTextId
      ? {
          kind: 'confirm',
          text: 'This text is placed in the rule - deleting it removes it from the rule too.',
          actions: [{label: 'Delete', primary: true, onPress: () => deleteTextNow(confirmDeleteTextId)}],
          onCancel: () => setConfirmDeleteTextId(null),
        }
      : null,
  );

  const handleRemovePiece = (index: number) => {
    if (!draftDef) return;
    setDraftDef(removePieceFromRule(draftDef, index));
    setSelectedPieceIndex(prev => (prev === index ? null : prev !== null && prev > index ? prev - 1 : prev));
  };

  const handleNudgeSelectedPiece = (dx: number, dy: number) => {
    if (!draftDef || selectedPieceIndex === null) return;
    setDraftDef(nudgePieceAt(draftDef, selectedPieceIndex, dx, dy));
  };

  const handleFontDeltaSelectedPiece = (delta: number) => {
    if (!draftDef || selectedPieceIndex === null) return;
    const current = draftDef.pieces[selectedPieceIndex].fontSize;
    setDraftDef(setPieceFontSize(draftDef, selectedPieceIndex, current + delta));
  };

  const handleStepChangeSelectedPiece = (step: number) => {
    if (!draftDef || selectedPieceIndex === null) return;
    setDraftDef(setPieceStep(draftDef, selectedPieceIndex, step));
  };

  const handleMaxWidthDeltaSelectedPiece = (delta: number) => {
    if (!draftDef || selectedPieceIndex === null) return;
    const current = pieceMaxWidthPx(draftDef.pieces[selectedPieceIndex]);
    setDraftDef(setPieceMaxWidth(draftDef, selectedPieceIndex, current + delta));
  };

  return {
    templatesView,
    setTemplatesView,
    editingDefIndex,
    setEditingDefIndex,
    draftDef,
    setDraftDef,
    sharedFileNameInputRef,
    draftTagsText,
    setDraftTagsText,
    selectedPieceIndex,
    setSelectedPieceIndex,
    addSelection,
    setAddSelection,
    textDraftName,
    setTextDraftName,
    textDraftBody,
    setTextDraftBody,
    addNotice,
    setAddNotice,
    confirmDeleteTextId,
    setConfirmDeleteTextId,
    templatePreviewFailedFor,
    setTemplatePreviewFailedFor,
    templatesSaveError,
    setTemplatesSaveError,
    handleAddDefinition,
    handleEditDefinition,
    setDraftTagsTextStripped,
    handleCancelDefinitionEdit,
    handleBackToEditForm,
    handleOpenTemplatePicker,
    handleChooseTemplate,
    handleOpenAddPiece,
    persistTagRules,
    handleSaveDefinitionDraft,
    handleDeleteDefinition,
    updateDraftDef,
    handleSelectPieceType,
    handleSelectText,
    handleSelectNewText,
    handleTogglePlacement,
    textLabel,
    handleSaveText,
    handleDeleteText,
    deleteTextNow,
    handleRemovePiece,
    handleNudgeSelectedPiece,
    handleFontDeltaSelectedPiece,
    handleStepChangeSelectedPiece,
    handleMaxWidthDeltaSelectedPiece,
  };
}

export type TagRuleDraft = ReturnType<typeof useTagRuleDraft>;
