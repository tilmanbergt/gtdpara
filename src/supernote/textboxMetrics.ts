/**
 * The plugin's single text-measurement API: real Android StaticLayout numbers
 * from the native `TextboxMetrics` module (TextboxMetricsModule.kt, registered
 * in GtdParaFilePackage) instead of the char-width guess in
 * ui/textLineEstimator.ts.
 *
 * Shared contract (docs/dev/history/technical-design-gmail-email-note.md 3.3/3.9, aligned
 * with docs/dev/history/technical-design-textbox-metrics.md):
 *  - `measureTextHeight` never throws.
 *  - The native call requests `widthPx - TEXT_MEASURE_WIDTH_ADJUSTMENT_PX`
 *    (the sister project NoteDraft/textboxHelper's on-device calibration:
 *    the NOTE app wraps a little earlier than a plain StaticLayout at the
 *    same width). Consequence: `maxLineWidthPx` is a width INSIDE that
 *    reduced box; a caller that wants a box that just fits the text uses
 *    `ceil(maxLineWidthPx) + TEXT_MEASURE_WIDTH_ADJUSTMENT_PX`.
 *  - On a missing module or a throwing call it returns `source: 'fallback'`
 *    with the RAW `estimatePieceTextHeight` value - no safety factor. Whether
 *    to over- or under-provision on fallback is the caller's decision (the
 *    email pagination over-provisions, the textbox-metrics feature keeps
 *    today's behaviour).
 *  - `heightPx` includes the sister project's second calibration: the NOTE app
 *    renders every explicit empty line taller than a plain StaticLayout does,
 *    so each blank (or whitespace-only) line adds `emptyLineExtraPx(fontSize)`
 *    on top of the layout height (NoteDraft `estimateTextboxHeight`,
 *    `addExplicitEmptyLineHeight`). The raw layout height stays available as
 *    `layoutHeightPx`. Email text is full of blank lines, so without this the
 *    pages would overflow; the textbox-metrics feature needs it for the same
 *    reason. Native path only - the fallback estimate already errs high.
 *  - A fallback is logged once per app session, not per call.
 */
import {NativeModules} from 'react-native';
import {estimatePieceTextHeight, noteLinkLineHeight} from '../domain/meetingNoteBlock';
import {logError} from '../utils/log';

/** Sister project's `widthAdjustment` calibration - see the module comment. */
export const TEXT_MEASURE_WIDTH_ADJUSTMENT_PX = 30;

export interface TextMeasurement {
  /** Calibrated height in px at the requested width: layout height plus the explicit-empty-line extra (see module comment). Use this for box heights and page fitting. */
  heightPx: number;
  /** Raw StaticLayout height, without the empty-line extra. Equals heightPx on fallback. */
  layoutHeightPx: number;
  lineCount: number;
  /** Widest line, measured at (widthPx - TEXT_MEASURE_WIDTH_ADJUSTMENT_PX). */
  maxLineWidthPx: number;
  source: 'native' | 'fallback';
}

/** Extra px the NOTE app adds per explicit empty line beyond the layout's own line height (sister project's `getExtraLineStep`). */
export function emptyLineExtraPx(fontSizePx: number): number {
  return Math.max(fontSizePx + 3, Math.round(fontSizePx * 1.1));
}

/** Lines that are empty or whitespace-only after CRLF normalisation. */
export function countExplicitEmptyLines(text: string): number {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .filter(line => line.trim().length === 0).length;
}

export interface MeasureTextOptions {
  /** Custom font file, passed through to the native module. Unused by current callers. */
  fontPath?: string;
}

interface NativeMeasureResult {
  layoutHeight: number;
  lineCount: number;
  maxLineWidth: number;
}

interface TextboxMetricsNativeModule {
  measureTextLayout(options: {
    text: string;
    width: number;
    fontSize: number;
    includePad?: boolean;
    fontPath?: string | null;
  }): Promise<NativeMeasureResult>;
}

const {TextboxMetrics} = NativeModules as {TextboxMetrics?: TextboxMetricsNativeModule};

let fallbackLogged = false;

function logFallbackOnce(reason: unknown): void {
  if (fallbackLogged) return;
  fallbackLogged = true;
  logError('textboxMetrics: native measurement unavailable, using estimate', reason);
}

function fallbackMeasurement(text: string, widthPx: number, fontSizePx: number): TextMeasurement {
  const heightPx = estimatePieceTextHeight(text, widthPx, fontSizePx);
  const lineHeight = Math.max(1, noteLinkLineHeight(fontSizePx));
  return {
    heightPx,
    layoutHeightPx: heightPx,
    lineCount: Math.max(1, Math.round(heightPx / lineHeight)),
    // Unknown without a layout engine: assume the widest line fills the (reduced) box.
    maxLineWidthPx: Math.max(0, widthPx - TEXT_MEASURE_WIDTH_ADJUSTMENT_PX),
    source: 'fallback',
  };
}

export async function measureTextHeight(
  text: string,
  widthPx: number,
  fontSizePx: number,
  opts?: MeasureTextOptions,
): Promise<TextMeasurement> {
  if (!TextboxMetrics || typeof TextboxMetrics.measureTextLayout !== 'function') {
    logFallbackOnce('native module TextboxMetrics is not linked');
    return fallbackMeasurement(text, widthPx, fontSizePx);
  }
  try {
    const result = await TextboxMetrics.measureTextLayout({
      text,
      width: Math.max(0, Math.round(widthPx - TEXT_MEASURE_WIDTH_ADJUSTMENT_PX)),
      fontSize: fontSizePx,
      includePad: true,
      fontPath: opts?.fontPath ?? null,
    });
    if (
      !result ||
      !Number.isFinite(result.layoutHeight) ||
      !Number.isFinite(result.lineCount) ||
      !Number.isFinite(result.maxLineWidth)
    ) {
      throw new Error('TextboxMetrics returned an unexpected result');
    }
    return {
      heightPx: result.layoutHeight + countExplicitEmptyLines(text) * emptyLineExtraPx(fontSizePx),
      layoutHeightPx: result.layoutHeight,
      lineCount: result.lineCount,
      maxLineWidthPx: result.maxLineWidth,
      source: 'native',
    };
  } catch (error) {
    logFallbackOnce(error);
    return fallbackMeasurement(text, widthPx, fontSizePx);
  }
}
