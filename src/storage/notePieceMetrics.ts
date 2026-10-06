/**
 * Turns "how wide can this piece be" + "what text goes in it" into an actual
 * content-fit textbox rect (docs/dev/technical-design-textbox-metrics.md §3.2) -
 * the one new file this feature adds. Not domain/ (domain/meetingNoteBlock.ts
 * must stay RN/SDK-free, see its own module doc comment) - this calls
 * supernote/textboxMetrics.ts's native-backed measureTextHeight, so it lives
 * in storage/ like every other file that touches the native bridge.
 *
 * Per-piece max width (2026-09-23, Tilman: "each piece should have its own
 * length cap, separately stored for each definition" - i.e. per PIECE, not
 * per definition; domain/tagRules.ts's NotePiece.maxWidthPx /
 * pieceMaxWidthPx is the resolved value callers pass in here as
 * `maxWidthPx`). This function itself takes plain primitives, not a
 * NotePiece, so storage/meetingNoteContent.ts's populateMeetingNoteBlockFallback
 * (the older fixed single-block shape, with no NotePiece behind it) reuses it
 * too, passing its own FALLBACK_BLOCK_MAX_WIDTH as the cap - matching the
 * concept doc's §3.4 rollout note that both call sites "call the same new
 * measureNotePieceRect."
 *
 * Deviates from the concept doc's original step 1/4 split in one way: the doc
 * proposed measuring at the FULL `pieceWidthPx(x)` first and only clamping
 * the result afterward - that undercounts how a narrower cap would actually
 * wrap the text (a line that fits unwrapped at the page-edge width can still
 * need to wrap once trimmed down to, say, a 100px-wide cap). This measures at
 * the ALREADY-capped width from the start instead, so line wrapping is
 * correct for the box that actually gets written.
 *
 * The cap is also treated as a hard user setting on the fallback path, not
 * just a native-only refinement: `measureTextHeight` is called with the
 * capped width regardless of source, so a `source === 'fallback'` result
 * still respects it (unlike the concept doc's original fallback branch,
 * which fell back to the uncapped `pieceWidthPx(x)`) - the user set this
 * width on purpose, and native-measurement availability shouldn't silently
 * widen their boxes back out. `measurement.heightPx` already reflects
 * whichever width was actually requested either way, so no separate fallback
 * height calculation is needed here.
 */
import {pieceWidthPx} from '../domain/tagRules';
import {measureTextHeight, TEXT_MEASURE_WIDTH_ADJUSTMENT_PX} from '../supernote/textboxMetrics';

/**
 * Small margin added on top of the width calibration adjustment so a
 * content-fit box doesn't clip the widest line's very last pixel - to be
 * tuned against a real on-device screenshot per the concept doc's §3.3
 * calibration check.
 */
const CONTENT_FIT_PADDING_PX = 20;

export interface NotePieceRect {
  width: number;
  height: number;
  source: 'native' | 'fallback';
}

/**
 * `x`/`fontSizePx` come straight off a NotePiece (or the fallback block's own
 * fixed position/font); `maxWidthPx` is the resolved cap - domain/
 * tagRules.ts's `pieceMaxWidthPx(piece)` for a real piece, or
 * FALLBACK_BLOCK_MAX_WIDTH for the old fixed block. Never throws - delegates
 * to measureTextHeight, which never does.
 */
export async function measureNotePieceRect(
  text: string,
  x: number,
  fontSizePx: number,
  maxWidthPx: number,
): Promise<NotePieceRect> {
  const boundWidth = Math.min(pieceWidthPx(x), Math.max(0, maxWidthPx));
  const measurement = await measureTextHeight(text, boundWidth, fontSizePx);
  const width =
    measurement.source === 'native'
      ? Math.min(
          boundWidth,
          Math.ceil(measurement.maxLineWidthPx) + TEXT_MEASURE_WIDTH_ADJUSTMENT_PX + CONTENT_FIT_PADDING_PX,
        )
      : boundWidth;
  return {width, height: measurement.heightPx, source: measurement.source};
}

/**
 * Extra width a Supernote link element needs beyond its measured text, for
 * the link icon drawn in front of it - scales with the font, since the icon
 * does. First guess (2026-09-25, docs/dev/technical-design-linked-file-piece.md
 * §5), to be calibrated on the device like CONTENT_FIT_PADDING_PX.
 */
export const LINK_ICON_WIDTH_FACTOR = 1.2;
/** Extra height for the link's underline - same first-guess/calibrate-on-device status as LINK_ICON_WIDTH_FACTOR. */
export const LINK_EXTRA_HEIGHT_PX = 8;

export function linkExtraWidthPx(fontSizePx: number): number {
  return Math.ceil(fontSizePx * LINK_ICON_WIDTH_FACTOR);
}

/**
 * The rect for a `link` piece's link element (docs/dev/technical-design-linked-
 * file-piece.md §5): the text is measured exactly like a textbox piece, but
 * against the cap MINUS the icon allowance, so adding the allowance back
 * never pushes the box past the piece's own max width or the page edge;
 * the underline allowance is added to the measured height.
 */
export async function measureNoteLinkRect(
  text: string,
  x: number,
  fontSizePx: number,
  maxWidthPx: number,
): Promise<NotePieceRect> {
  const extraWidth = linkExtraWidthPx(fontSizePx);
  const cap = Math.min(pieceWidthPx(x), Math.max(0, maxWidthPx));
  const rect = await measureNotePieceRect(text, x, fontSizePx, Math.max(0, cap - extraWidth));
  return {
    width: Math.min(cap, rect.width + extraWidth),
    height: rect.height + LINK_EXTRA_HEIGHT_PX,
    source: rect.source,
  };
}
