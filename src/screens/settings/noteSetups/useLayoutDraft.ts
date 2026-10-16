/**
 * The page layout page's editing state (docs/dev/history/technical-design-note-setups.md
 * §6.3-§6.4): the selected piece, the Add panel's text composer, and every
 * piece, text and background action. Each one goes through
 * `updateActiveLayout`, which applies a generic domain/pageLayout.ts
 * operation to the page being edited - the setup's own layout or the
 * Default's page - in useNoteSetupDraft's draft.
 */
import {useState} from 'react';
import {
  addPiece,
  addTextItem,
  emptyPageLayout,
  findPlacedPieceIndex,
  isPiecePlaced,
  layoutTexts,
  NoteTextItem,
  nudgePieceAt,
  PageLayout,
  pieceIsHeading,
  pieceMaxWidthPx,
  PieceType,
  removePiece,
  removePlacedPiece,
  removeTextItem,
  setPieceFontSize,
  setPieceHeading,
  setPieceMaxWidth,
  setPieceStep,
  updateTextItem,
} from '../../../domain/pageLayout';
import {useStatusConfirm} from '../../../ui/useStatusConfirm';

/** The Add panel's composer: editing one of the page's texts, or writing a new one; null = closed. */
export type TextComposer = {kind: 'text'; id: string} | {kind: 'new'} | null;

export function useLayoutDraft(layout: PageLayout | null, updateActiveLayout: (fn: (l: PageLayout) => PageLayout) => void) {
  const [selectedPieceIndex, setSelectedPieceIndex] = useState<number | null>(null);
  const [composer, setComposer] = useState<TextComposer>(null);
  const [textDraftName, setTextDraftName] = useState('');
  const [textDraftBody, setTextDraftBody] = useState('');
  const confirmDeleteText = useStatusConfirm('Settings.deleteText');

  /** Clears the selection and the composer - when another page opens. */
  const resetLayoutState = () => {
    setSelectedPieceIndex(null);
    setComposer(null);
  };

  /** Shifts the selection after the piece at `index` is gone. */
  const afterRemoved = (index: number) =>
    setSelectedPieceIndex(prev => (prev === index ? null : prev !== null && prev > index ? prev - 1 : prev));

  // ---- Add panel: each piece and each text is on the page at most once ----

  /** Tap on a row: places the piece (and selects it) or takes it off the page; a text stays in the list. */
  const handleTogglePlacement = (type: PieceType, textId?: string) => {
    const current = layout ?? emptyPageLayout();
    if (isPiecePlaced(current, type, textId)) {
      afterRemoved(findPlacedPieceIndex(current, type, textId));
      updateActiveLayout(l => removePlacedPiece(l, type, textId));
      return;
    }
    const body = type === 'text' ? layoutTexts(current).find(t => t.id === textId)?.text ?? '' : undefined;
    updateActiveLayout(l => addPiece(l, type, body, type === 'text' ? textId : undefined));
    setSelectedPieceIndex(current.pieces.length);
  };

  const handleEditText = (item: NoteTextItem) => {
    setComposer({kind: 'text', id: item.id});
    setTextDraftName(item.name);
    setTextDraftBody(item.text);
  };

  const handleNewText = () => {
    setComposer({kind: 'new'});
    setTextDraftName('');
    setTextDraftBody('');
  };

  /** Create (new) or Save (existing): a placed text's piece is updated in place - position and size stay. */
  const handleSaveText = () => {
    if (!composer) return;
    const name = textDraftName.trim() || 'Text';
    if (composer.kind === 'new') {
      updateActiveLayout(l => addTextItem(l, name, textDraftBody).layout);
    } else {
      const id = composer.id;
      updateActiveLayout(l => updateTextItem(l, id, name, textDraftBody));
    }
    setComposer(null);
  };

  /** Deletes the edited text; a placed one takes its piece along, so that is confirmed first. */
  const handleDeleteText = async () => {
    if (composer?.kind !== 'text' || !layout) return;
    const id = composer.id;
    if (
      isPiecePlaced(layout, 'text', id) &&
      !(await confirmDeleteText({
        text: 'This text is on the page - deleting it removes it from the page too.',
        detail: 'Deletes the text from this page layout and takes its piece off the page.',
        actionLabel: 'Delete',
      }))
    ) {
      return;
    }
    updateActiveLayout(l => removeTextItem(l, id));
    setSelectedPieceIndex(null);
    setComposer(null);
  };

  // ---- Pieces panel ----

  const handleRemovePiece = (index: number) => {
    updateActiveLayout(l => removePiece(l, index));
    afterRemoved(index);
  };

  /** Runs `fn` on the selected piece, when there is one. */
  const onSelected = (fn: (l: PageLayout, index: number) => PageLayout) => {
    const index = selectedPieceIndex;
    if (index === null || !layout?.pieces[index]) return;
    updateActiveLayout(l => fn(l, index));
  };

  const handleNudge = (dx: number, dy: number) => onSelected((l, i) => nudgePieceAt(l, i, dx, dy));
  const handleFontDelta = (delta: number) => onSelected((l, i) => setPieceFontSize(l, i, l.pieces[i].fontSize + delta));
  const handleStepChange = (step: number) => onSelected((l, i) => setPieceStep(l, i, step));
  const handleMaxWidthDelta = (delta: number) => onSelected((l, i) => setPieceMaxWidth(l, i, pieceMaxWidthPx(l.pieces[i]) + delta));
  /** The Heading switch (docs/dev/history/technical-design-projects-findable-notes.md §2.8). */
  const handleToggleHeading = () => onSelected((l, i) => setPieceHeading(l, i, !pieceIsHeading(l.pieces[i])));

  // ---- Background panel ----

  /** Sets the page's MyStyle background ('' = blank); the preview shows it at once. */
  const handleChooseBackground = (fileName: string) => updateActiveLayout(l => ({...l, template: fileName}));

  return {
    selectedPieceIndex,
    setSelectedPieceIndex,
    composer,
    textDraftName,
    setTextDraftName,
    textDraftBody,
    setTextDraftBody,
    resetLayoutState,
    handleTogglePlacement,
    handleEditText,
    handleNewText,
    handleCloseComposer: () => setComposer(null),
    handleSaveText,
    handleDeleteText,
    handleRemovePiece,
    handleNudge,
    handleFontDelta,
    handleStepChange,
    handleMaxWidthDelta,
    handleToggleHeading,
    handleChooseBackground,
  };
}

export type LayoutDraft = ReturnType<typeof useLayoutDraft>;
