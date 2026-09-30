/**
 * Predicts how many lines a piece of text will wrap to at a given width -
 * used by row-height helpers (ui/TaskRow.tsx's `taskRowHeight`, and a
 * future ui/FileBrowserPane.tsx equivalent) so a fixed-height paginated
 * section (ui/PagedSection.tsx) can reserve a row's real rendered height
 * up front, without a measure-then-reflow render pass (docs/technical-
 * design-pagination-fixed-height.md §2 - this replaces the `minHeight`-
 * based row-height story from docs/dev/technical-design-pagination-edit-
 * reuse.md §3, which reserved space for a fixed *maximum* line count
 * regardless of content, rather than predicting the real one).
 *
 * Failure modes are self-contained by design, not a defect to eliminate:
 * over-predicting leaves a harmless blank gap at the bottom of that one
 * row; under-predicting lets the caller's own `numberOfLines` cap truncate
 * with an ellipsis at exactly the height that was reserved, rather than
 * spilling into the row below it (Tilman: "accept an empty line or a cut
 * of text in rare cases"). Real text also wraps at word boundaries, which
 * this width-ratio estimate doesn't model - the practical effect is a
 * slight bias toward over-predicting (a raw width/available-width ratio
 * usually underestimates how early a real line breaks), which is the
 * safer of the two failure modes here, not something to correct away.
 *
 * Deliberately pluggable at the whole-algorithm level, not just tunable
 * constants within one algorithm (Tilman: "design so this whole
 * calibration can be easily exchanged later - not only on character, but
 * on whole text level"). The interface below takes only plain primitives
 * and returns an integer, so a future implementation (a lookup table
 * calibrated against real on-device screenshots, a canvas-measurement
 * build step, or anything else) can replace `CharClassLineEstimator`
 * without any caller changing - swap it by reassigning
 * `activeLineEstimator` below, the single point every caller reads from.
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

/** Also used by ui/tagChipLayout.ts to budget QuickAddWidget's Row 3 tag chips by width (2026-09-29). */
export function estimateTextWidthPx(text: string, fontSizePx: number): number {
  let widthEm = 0;
  for (const ch of text) {
    if (NARROW_CHARS.test(ch)) widthEm += NARROW_WIDTH_EM;
    else if (WIDE_CHARS.test(ch)) widthEm += WIDE_WIDTH_EM;
    else widthEm += AVERAGE_WIDTH_EM;
  }
  return widthEm * fontSizePx;
}

// Batch 2 recalibration (2026-09-15): Tilman's first real-device smoke test
// of ui/TaskRow.tsx's/ui/MeetingRow.tsx's new multi-line rows found titles
// that this module predicted as fitting on one line actually needing two on
// the real Supernote font - i.e. the character-width buckets above, "hand-
// tuned starting point" per this file's own doc comment, ran narrower than
// the real glyphs. Rather than re-guess those three constants a second time
// with no more real measurement to go on than the first guess had, this
// applies a single blanket margin to the available width before the ratio
// is taken - it makes every prediction lean further toward "needs one more
// line," which this file's own doc comment already names as the safe
// direction to err in. One knob, easy to retune from the next smoke test:
// lower it further if long titles still don't wrap, raise it back toward
// 1.0 if short titles start wrapping when they shouldn't.
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
