/**
 * "What gets inserted" preview for a note-creation definition's pieces
 * (docs/dev/technical-design-note-templates.md §6). Shows each piece's position
 * and rough relative size as a scaled label inside a page-shaped box; tapping
 * a piece selects it, same as tapping its row in the piece list below -
 * either one drives the single shared ui/NudgePad.tsx (Tilman's UI-draft
 * feedback: "selecting a piece either on the preview or in the list below
 * makes this the one that is displayed and can be adjusted").
 *
 * Renders the actual selected MyStyle background behind the piece labels
 * as of 2026-09-18 (Tilman: "please also show this image in the background
 * where the pieces of information are positioned, so the user can make it
 * fit into the background") - follow-up to screens/Settings.tsx's "Choose
 * background" page already doing the same `<Image source={{uri:
 * 'file://'+path}}}>` load (docs/dev/technical-design-note-templates.md §7
 * Phase 5 item #1). Each piece label gets its own translucent white
 * backing (`styles.pieceLabel`'s `backgroundColor`) so its text stays
 * legible over an arbitrary PNG rather than only over the plain box - the
 * z-ordering/legibility pass this file's own doc comment used to flag as a
 * separate follow-up. No chosen-background label of its own either
 * (2026-09-18: dropped the "Background: <name>" caption this used to
 * render above the box - Tilman, looking at the edit form's two columns
 * together: "no need to repeat name of template on top, as it shows to the
 * left" - the left column's own compact "Background: <name>  Change…" row
 * already says it once).
 *
 * Max-width cap made visible (2026-09-23, docs/dev/technical-design-textbox-
 * metrics.md - Tilman: "add a width parameter to the tag rules screen that
 * defines the maximum width for text pieces (should be visible in the
 * preview screen as well)"): each piece's label now gets a scaled `width`
 * equal to `min(pieceMaxWidthPx(piece), pieceWidthPx(piece.x))` instead of
 * auto-sizing to its (truncated) text, so the box shown here is literally the
 * boundary the real note-page textbox will be capped at (storage/
 * notePieceMetrics.ts's `measureNotePieceRect` never writes a box wider than
 * this) - it updates live as the plus/minus-25 control in ui/NudgePad.tsx is
 * used on the selected piece. Still `numberOfLines={1}` - this previews the
 * WIDTH boundary, not real on-device line-wrapping (that needs the native
 * measurement call, an async round trip this synchronous preview doesn't
 * make - see the concept doc's non-goals section).
 */
import React, {useState} from 'react';
import {Image, LayoutChangeEvent, Pressable, StyleSheet, Text, View} from 'react-native';
import {
  NOTE_PAGE_HEIGHT_PX,
  NOTE_PAGE_WIDTH_PX,
  NotePiece,
  pieceMaxWidthPx,
  pieceWidthPx,
  PieceType,
} from '../domain/tagRules';
import {MYSTYLE_FOLDER} from '../supernote/fileSystem';
import {COLORS, FONT} from './theme';

export const PIECE_TYPE_LABELS: Record<PieceType, string> = {
  title: 'Title',
  date: 'Date',
  time: 'Time',
  text: 'Static text',
  related: 'Related items (by tag)',
  link: 'Linked file',
};

/** What a piece's label reads INSIDE the page preview - same as pieceSummaryLabel, except a `link` piece shows a link-looking sample (drawn underlined, see linkLabelText) so it reads as the tappable link it becomes on the page. */
function previewLabel(piece: NotePiece): string {
  return piece.type === 'link' ? 'Link: file' : pieceSummaryLabel(piece);
}

export function pieceSummaryLabel(piece: NotePiece): string {
  if (piece.type === 'text') {
    const preview = (piece.text ?? '').trim();
    if (!preview) return 'Static text (empty)';
    return preview.length > 40 ? `“${preview.slice(0, 40)}…”` : `“${preview}”`;
  }
  return PIECE_TYPE_LABELS[piece.type];
}

interface Props {
  pieces: NotePiece[];
  selectedIndex: number | null;
  onSelectPiece: (index: number) => void;
  /** '' = blank/no template picked - same convention TagRule.template already uses; renders no <Image> at all, same as before this prop existed. */
  background: string;
  textColor: string;
  borderColor: string;
}

const MIN_PREVIEW_LABEL_PX = 9;

export default function NoteTemplatePreview({
  pieces,
  selectedIndex,
  onSelectPiece,
  background,
  textColor,
  borderColor,
}: Props): React.JSX.Element {
  const [measuredWidth, setMeasuredWidth] = useState(0);
  const scale = measuredWidth > 0 ? measuredWidth / NOTE_PAGE_WIDTH_PX : 0;
  const height = measuredWidth > 0 ? measuredWidth * (NOTE_PAGE_HEIGHT_PX / NOTE_PAGE_WIDTH_PX) : undefined;

  const onLayout = (e: LayoutChangeEvent) => setMeasuredWidth(e.nativeEvent.layout.width);

  // Tracks the filename an <Image> load last FAILED for, not a plain
  // boolean - same reasoning as screens/Settings.tsx's own
  // templatePreviewFailedFor: switching to a different background (or back
  // to a previously-good one) re-attempts a load rather than staying stuck
  // on a stale failure.
  const [previewFailedFor, setPreviewFailedFor] = useState<string | null>(null);

  return (
    <View>
      <View style={[styles.box, {borderColor, height}]} onLayout={onLayout}>
        {background !== '' && previewFailedFor !== background && (
          <Image
            key={background}
            source={{uri: `file://${MYSTYLE_FOLDER}/${background}`}}
            style={StyleSheet.absoluteFill}
            resizeMode="cover"
            onError={() => setPreviewFailedFor(background)}
          />
        )}
        {scale > 0 &&
          pieces.map((piece, index) => {
            const selected = index === selectedIndex;
            // Over a real background image, a label always reads in plain
            // black on a translucent white backing - not the app's own
            // light/dark `textColor` - since what this previews is how the
            // piece will actually look on the Supernote page itself (always
            // light "paper," independent of this Settings screen's own
            // theme), and a backing is what keeps that legible over
            // whatever the PNG looks like underneath. No background
            // selected: unchanged from before this prop existed - plain
            // `textColor`, no backing, matching the rest of this form.
            const overImage = background !== '' && previewFailedFor !== background;
            const boxWidthPx = Math.min(pieceMaxWidthPx(piece), pieceWidthPx(piece.x));
            return (
              <Pressable
                key={index}
                onPress={() => onSelectPiece(index)}
                style={[
                  styles.pieceLabel,
                  overImage && styles.pieceLabelBacked,
                  {left: piece.x * scale, top: piece.y * scale, width: boxWidthPx * scale},
                  selected && [styles.pieceLabelSelected, {borderColor: COLORS.accent}],
                ]}>
                <Text
                  style={[
                    styles.pieceLabelText,
                    {
                      color: overImage ? COLORS.textLight : textColor,
                      fontSize: Math.max(MIN_PREVIEW_LABEL_PX, piece.fontSize * scale),
                    },
                    (selected || piece.type === 'link') && styles.pieceLabelTextSelected,
                  ]}
                  numberOfLines={1}>
                  {previewLabel(piece)}
                </Text>
              </Pressable>
            );
          })}
        {pieces.length === 0 && (
          <Text style={[styles.emptyText, {color: textColor}]}>No pieces yet - add one below.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    width: '100%',
    minHeight: 120,
    borderWidth: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
  pieceLabel: {
    position: 'absolute',
    paddingHorizontal: 2,
    // Clips the (still single-line) label text to the max-width box above,
    // rather than letting it overflow past the boundary it's supposed to show.
    overflow: 'hidden',
  },
  // Legibility backing for a label sitting over the real background image
  // (see the render-time overImage note above) - translucent rather than
  // solid white so the image underneath still reads through enough to
  // judge fit, which is the whole point of showing it here.
  pieceLabelBacked: {
    backgroundColor: 'rgba(255,255,255,0.78)',
    borderRadius: 2,
  },
  pieceLabelSelected: {
    borderWidth: 1,
    borderRadius: 2,
  },
  pieceLabelText: {
    fontWeight: '600',
  },
  pieceLabelTextSelected: {
    textDecorationLine: 'underline',
  },
  emptyText: {
    fontSize: FONT.small,
    opacity: 0.5,
    padding: 10,
  },
});
