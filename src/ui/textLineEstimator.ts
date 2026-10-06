/**
 * Predicts how many lines a piece of text will wrap to at a given width -
 * used by row-height helpers (ui/TaskRow.tsx's `taskRowHeight`) so a
 * fixed-height paginated section (ui/PagedSection.tsx) can reserve a row's
 * real rendered height up front, without a measure-then-reflow render pass
 * (docs/technical-design-pagination-fixed-height.md §2).
 *
 * Failure modes are self-contained by design: over-predicting leaves a
 * harmless blank gap at the bottom of that one row; under-predicting lets
 * the caller's own `numberOfLines` cap truncate with an ellipsis at exactly
 * the reserved height, rather than spilling into the row below. Both are
 * acceptable in rare cases. Real text wraps at word boundaries, which this
 * width-ratio estimate doesn't model; the effect is a slight bias toward
 * over-predicting, which is the safer of the two failure modes.
 *
 * Pluggable at the whole-algorithm level, not just by tuning constants.
 * The interface below takes only plain primitives and returns an integer, so
 * another implementation (a lookup table calibrated against on-device
 * screenshots, a canvas-measurement build step, ...) can replace
 * `CharClassLineEstimator` without any caller changing - swap it by
 * reassigning `activeLineEstimator` below, the single point every caller
 * reads from.
 */

export interface TextLineEstimator {
  /** Predicts the number of lines `text` will wrap to inside `availableWidthPx` at `fontSizePx`. Never returns less than 1 for non-empty text. */
  estimateLines(text: string, availableWidthPx: number, fontSizePx: number): number;
}

// Per-character width classes, as a multiple of `fontSizePx` - a flat
// char-count would under-count capital-/punctuation-heavy strings and
// over-count strings full of narrow characters, so this buckets characters
// into three rough width classes instead of measuring real glyph metrics
// (no canvas/text-measurement API exists in this RN/e-ink environment
// without a render pass). Calibrated by eye, not derived from a font
// metrics table - retune these three numbers once checked against real
// on-device screenshots, same "hand-tuned starting point" convention every
// `PAGE_SIZE` constant in ui/pagination.ts already follows.
const NARROW_CHARS = /[iIlj.,:;'!|\s]/;
const WIDE_CHARS = /[A-Z0-9@%&#WMwm]/;
const NARROW_WIDTH_EM = 0.32;
const AVERAGE_WIDTH_EM = 0.55;
const WIDE_WIDTH_EM = 0.78;

/** Also used by ui/tagChipLayout.ts to budget QuickAddWidget's Row 3 tag chips by width. */
export function estimateTextWidthPx(text: string, fontSizePx: number): number {
  let widthEm = 0;
  for (const ch of text) {
    if (NARROW_CHARS.test(ch)) widthEm += NARROW_WIDTH_EM;
    else if (WIDE_CHARS.test(ch)) widthEm += WIDE_WIDTH_EM;
    else widthEm += AVERAGE_WIDTH_EM;
  }
  return widthEm * fontSizePx;
}

// The character-width buckets above run narrower than the real Supernote
// glyphs, so titles predicted to fit on one line can need two. Rather than
// re-guess those three constants without real measurements, this applies one
// blanket margin to the available width, so every prediction leans toward
// "needs one more line" - the safe direction to err in. Lower it if long
// titles still don't wrap; raise it toward 1.0 if short titles wrap when they
// shouldn't.
const AVAILABLE_WIDTH_SAFETY_MARGIN = 0.8;

export class CharClassLineEstimator implements TextLineEstimator {
  estimateLines(text: string, availableWidthPx: number, fontSizePx: number): number {
    if (!text) return 1;
    if (availableWidthPx <= 0) return 1;
    const widthPx = estimateTextWidthPx(text, fontSizePx);
    const effectiveAvailableWidthPx = availableWidthPx * AVAILABLE_WIDTH_SAFETY_MARGIN;
    return Math.max(1, Math.ceil(widthPx / effectiveAvailableWidthPx));
  }
}

/** The single swap point (module doc comment above) - every caller reads
 * this rather than constructing `CharClassLineEstimator` itself, so
 * replacing the active implementation is a one-line change here. */
export const activeLineEstimator: TextLineEstimator = new CharClassLineEstimator();
