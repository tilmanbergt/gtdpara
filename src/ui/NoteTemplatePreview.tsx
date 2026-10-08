/**
 * "What gets inserted" preview for a note-creation definition's pieces
 * (docs/dev/history/technical-design-note-templates.md §6). Shows each piece's position
 * and rough relative size as a scaled label inside a page-shaped box; tapping
 * a piece selects it, same as tapping its row in the piece list below -
 * either one drives the single shared ui/NudgePad.tsx, so the selected
 * piece is the one shown and adjusted.
 *
 * Renders the selected MyStyle background behind the piece labels so the
 * user can fit the pieces to it - the same `<Image source={{uri:
 * 'file://'+path}}}>` load as screens/Settings.tsx's "Choose background"
 * page (docs/dev/history/technical-design-note-templates.md §7 Phase 5 item #1).
 * Each piece label gets its own translucent white backing
 * (`styles.pieceLabel`'s `backgroundColor`) so its text stays legible over
 * an arbitrary PNG. There is no background-name caption: the edit form's
 * left column already shows "Background: <name>  Change…".
 *
 * Max-width cap made visible (docs/dev/history/technical-design-textbox-metrics.md):
 * each piece's label gets a scaled `width`
 * equal to `min(pieceMaxWidthPx(piece), pieceWidthPx(piece.x))` instead of
 * auto-sizing to its (truncated) text, so the box shown here is literally the
 * boundary the real note-page textbox will be capped at (storage/
 * notePieceMetrics.ts's `measureNotePieceRect` never writes a box wider than
 * this) - it updates live as the plus/minus-25 control in ui/NudgePad.tsx is
 * used on the selected piece. Labels stay `numberOfLines={1}` - this previews the
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
  pieceIsHeading,
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
  sinceLast: 'Since last time',
  dateTitle: 'Date & title',
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
  /** '' = blank/no template picked - same convention TagRule.template uses; renders no <Image> at all. */
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
  // to an earlier good one) re-attempts a load rather than staying stuck
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
            // selected: plain `textColor`, no backing, matching the rest of
            // this form.
            const overImage = background !== '' && previewFailedFor !== background;
            // A heading piece (docs/dev/history/technical-design-projects-findable-notes.md
            // §2.8) gets a light grey backing, like the title it becomes on the page.
            const heading = pieceIsHeading(piece);
            const boxWidthPx = Math.min(pieceMaxWidthPx(piece), pieceWidthPx(piece.x));
            return (
              <Pressable
                key={index}
                onPress={() => onSelectPiece(index)}
                style={[
                  styles.pieceLabel,
                  overImage && styles.pieceLabelBacked,
                  heading && styles.pieceLabelHeading,
                  {left: piece.x * scale, top: piece.y * scale, width: boxWidthPx * scale},
                  selected && [styles.pieceLabelSelected, {borderColor: COLORS.accent}],
                ]}>
                <Text
                  style={[
                    styles.pieceLabelText,
                    {
                      color: overImage || heading ? COLORS.textLight : textColor,
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
  pieceLabelHeading: {
    backgroundColor: '#d0d0d0',
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
