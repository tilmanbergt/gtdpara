/**
 * Width-based paging for QuickAddWidget's Row 3 tag chips.
 *
 * - Pages are filled by *width*, not by chip count: the caller measures Row 3's
 *   real width (onLayout), subtracts whatever shares the row (flow chips /
 *   meeting time field on page 0, the attachment cluster in edit mode), and
 *   every chip's width is estimated from its label via ui/textLineEstimator.ts's
 *   char-class estimator. Pinned tags (already in the text) consume width like
 *   any other chip and may spill onto page 1+.
 * - Labels longer than 8 characters are shortened to 8 + "…".
 * - Safety net in the styles (TagChips/QuickAddWidget): the chip area clips
 *   (overflow hidden) and the attachment cluster never shrinks, so an estimate
 *   that runs short can at worst cut a chip at the edge, never cover the ✕.
 */
import {useRef, useState} from 'react';
import {LayoutChangeEvent} from 'react-native';
import {requestEinkRefresh} from '../utils/screenRefresh';
import {estimateTextWidthPx} from './textLineEstimator';
import {FONT} from './theme';

/** Tag names longer than this are shown shortened with "…" (display only). */
export const TAG_LABEL_MAX_CHARS = 8;

// Geometry mirrored from TagChips' own styles - keep in sync:
// chip = paddingHorizontal 8*2 + borderWidth 1*2 + marginRight 4.
const CHIP_CHROME_PX = 8 * 2 + 1 * 2 + 4;
// arrow = paddingHorizontal 4*2 + marginRight 4 + the "‹"/"›" glyph.
const ARROW_PX = 4 * 2 + 4 + FONT.medium * 0.6;
// Real Supernote glyphs (and fontWeight 600) run wider than the estimator's
// buckets - same finding as textLineEstimator.ts's own 0.8 safety margin,
// applied here as the inverse on the text width. Lean toward "fits one
// chip fewer": a spare gap is harmless, a clipped chip is not.
const TEXT_WIDTH_SAFETY = 1.25;

/** Row width to assume before the first onLayout arrives (one frame). Deliberately conservative. */
const FALLBACK_ROW_WIDTH = 360;

export function tagChipLabel(tag: string, recognized: boolean): string {
  const shown = recognized ? tag.toUpperCase() : tag;
  return '#' + (shown.length > TAG_LABEL_MAX_CHARS ? shown.slice(0, TAG_LABEL_MAX_CHARS) + '…' : shown);
}

export function estimateChipWidth(label: string): number {
  return Math.ceil(estimateTextWidthPx(label, FONT.small) * TEXT_WIDTH_SAFETY) + CHIP_CHROME_PX;
}

export const TAG_ARROW_WIDTH = Math.ceil(ARROW_PX);

/**
 * Greedy width packing. Page 0 gets `page0Width`, every later page
 * `laterWidth` minus the "‹" arrow; any page that isn't the last also
 * reserves room for "›". Page 0 may be empty (just "›") if not even one
 * chip fits beside the flow chips; every later page takes at least one
 * chip so paging always makes progress (a single over-wide chip is then
 * clipped by the styles' safety net).
 */
export function paginateByWidth<T>(items: T[], widthOf: (item: T) => number, page0Width: number, laterWidth: number): T[][] {
  const pages: T[][] = [];
  let i = 0;
  while (i < items.length) {
    const p = pages.length;
    const avail = p === 0 ? page0Width : laterWidth - TAG_ARROW_WIDTH;
    const minItems = p === 0 ? 0 : 1;
    const start = i;
    let used = 0;
    while (i < items.length && (i - start < minItems || used + widthOf(items[i]) <= avail)) {
      used += widthOf(items[i]);
      i++;
    }
    if (i < items.length) {
      // More pages follow - make room for "›".
      while (i - start > minItems && used + TAG_ARROW_WIDTH > avail) {
        i--;
        used -= widthOf(items[i]);
      }
    }
    pages.push(items.slice(start, i));
  }
  return pages;
}

/**
 * Measures one Row 3 variant's budget: the whole row, the element sharing
 * page 0 with the tags (FlowStateChips / meeting time field), and the
 * attachment cluster. Every real width change triggers requestEinkRefresh()
 * - the re-pack is a layout-driven (not tap-driven) state change, which
 * does not flush to the e-ink screen on its own.
 */
type RowWidths = {row: number | null; lead: number; attach: number};

/**
 * Last measured widths per `cacheKey` (e.g. "daily:task"), kept for the
 * whole JS session (docs/dev/technical-design-render-perf-ab.md §3 A2). A widget
 * mounted again on the same screen starts from these, so the measurements
 * that follow match and cause no re-render and no extra e-ink refresh.
 */
const widthCache = new Map<string, RowWidths>();

export function useTagRowBudget(
  hasAttachment: boolean,
  /** Optional: remember widths across mounts under this key. */
  cacheKey?: string,
): {
  onRowLayout: (e: LayoutChangeEvent) => void;
  onLeadLayout: (e: LayoutChangeEvent) => void;
  onAttachLayout: (e: LayoutChangeEvent) => void;
  page0Width: number;
  laterWidth: number;
} {
  const [widths, setWidths] = useState<RowWidths>(
    () => (cacheKey ? widthCache.get(cacheKey) : undefined) ?? {row: null, lead: 0, attach: 0},
  );
  const widthsRef = useRef(widths);

  const measure = (key: 'row' | 'lead' | 'attach') => (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    // display:none rows report 0 - keep the last real measurement.
    if (w <= 0 || widthsRef.current[key] === w) return;
    const next = {...widthsRef.current, [key]: w};
    widthsRef.current = next;
    if (cacheKey) widthCache.set(cacheKey, next);
    setWidths(next);
    requestEinkRefresh();
  };

  const row = widths.row ?? FALLBACK_ROW_WIDTH;
  const attach = hasAttachment ? widths.attach : 0;
  return {
    onRowLayout: measure('row'),
    onLeadLayout: measure('lead'),
    onAttachLayout: measure('attach'),
    page0Width: Math.max(0, row - widths.lead - attach),
    laterWidth: Math.max(0, row - attach),
  };
}
