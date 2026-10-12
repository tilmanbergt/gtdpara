/**
 * The layout page's Pieces panel (docs/dev/history/technical-design-note-setups.md
 * §6.3): the page's pieces, paged (✕ removes one), then for the selected
 * piece the nudge pad (position, step, size, width) and the Heading switch.
 */
import React from 'react';
import {Pressable, Text, View} from 'react-native';
import {NotePiece, PageLayout, pieceIsHeading, pieceMaxWidthPx} from '../../../domain/pageLayout';
import {pieceSummaryLabel} from '../../../ui/NoteTemplatePreview';
import NudgePad from '../../../ui/NudgePad';
import PagedSection from '../../../ui/PagedSection';
import CheckToggle from '../CheckToggle';
import {PANEL_ROW_HEIGHT, setupStyles} from './noteSetupsStyles';
import {LayoutDraft} from './useLayoutDraft';

interface Row {
  piece: NotePiece;
  index: number;
}

export default function PiecesPanel(props: {layout: PageLayout | null; draft: LayoutDraft; textColor: string; borderColor: string}): React.JSX.Element {
  const {layout, draft, textColor, borderColor} = props;
  const pieces = layout?.pieces ?? [];
  const index = draft.selectedPieceIndex;
  const selected = index !== null ? pieces[index] ?? null : null;
  return (
    <View style={setupStyles.panelBody}>
      <View style={setupStyles.listBody}>
        <PagedSection<Row>
          header="Pieces"
          rows={pieces.map((piece, i) => ({piece, index: i}))}
          rowHeight={() => PANEL_ROW_HEIGHT}
          resetKey={pieces.length}
          emptyHint="No pieces yet - add them under Add."
          renderRow={row => (
            <Pressable
              key={row.index}
              onPress={() => draft.setSelectedPieceIndex(row.index)}
              style={[setupStyles.panelRow, {borderColor}, row.index === index && setupStyles.panelRowSelected]}>
              <Text style={[setupStyles.panelRowText, {color: textColor}, row.index === index && setupStyles.panelRowTextOn]} numberOfLines={1}>
                {`${pieceSummaryLabel(row.piece)}  (${row.piece.x}, ${row.piece.y})`}
              </Text>
              <Pressable onPress={() => draft.handleRemovePiece(row.index)} hitSlop={8}>
                <Text style={[setupStyles.panelRowAction, {color: textColor}]}>✕</Text>
              </Pressable>
            </Pressable>
          )}
          textColor={textColor}
          borderColor={borderColor}
        />
      </View>
      <NudgePad
        piece={selected ? {...selected, maxWidthPx: pieceMaxWidthPx(selected)} : null}
        onNudge={draft.handleNudge}
        onStepChange={draft.handleStepChange}
        onFontDelta={draft.handleFontDelta}
        onMaxWidthDelta={draft.handleMaxWidthDelta}
        textColor={textColor}
        borderColor={borderColor}
      />
      {selected && selected.type !== 'link' && (
        <CheckToggle
          label="Heading (in the note's table of contents)"
          checked={pieceIsHeading(selected)}
          onPress={draft.handleToggleHeading}
          textColor={textColor}
        />
      )}
    </View>
  );
}
