/**
 * Width-based paging for Quick Add's tag chips: one row (R3) or two (R3 and R4).
 *
 * - Pages are filled by *width*, not by chip count: the caller measures R3's
 *   real width (onLayout), subtracts whatever shares the row (flow chips /
 *   meeting time field on page 0), and
 *   every chip's width is estimated from its label via domain/textLineEstimator.ts's
 *   char-class estimator. Pinned tags (already in the text) consume width like
 *   any other chip and may spill onto page 1+.
 * - Labels longer than 8 characters are shortened to 8 + "…".
 * - Safety net in the styles (TagChips, ui/quickAdd/styles.ts): the chip area
 *   clips (overflow hidden), so an estimate that runs short can at worst cut a
 *   chip at the edge.
 */
import {useRef, useState} from 'react';
import {LayoutChangeEvent} from 'react-native';
import {log} from '../utils/log';
import {requestEinkRefresh} from '../utils/screenRefresh';
import {estimateTextWidthPx} from '../domain/textLineEstimator';
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

/** One page of tags spread over Quick Add's R3 and R4. */
export interface TwoRowPage<T> {
  row3: T[];
  row4: T[];
}

/** The widths `paginateTwoRows` packs into. */
export interface TwoRowWidths {
  /** R3 on page 0: what the flow chips or the time field leave. */
  row3First: number;
  /** R3 on later pages (Todo: the flow chips drop out; Meeting: the time field stays). */
  row3Later: number;
  /** R4, the whole row; "‹" and "›" sit at its end. */
  row4: number;
}

/**
 * Greedy width packing over two rows (docs/dev/history/technical-design-item-card.md
 * §5): each page fills R3, then R4. The arrows live at the end of R4 only -
 * "‹" on every page after the first, "›" on every page but the last - so R4
 * reserves their room. Page 0 may be empty (just "›"); every later page takes
 * at least one chip so paging always makes progress.
 */
export function paginateTwoRows<T>(items: T[], widthOf: (item: T) => number, widths: TwoRowWidths): TwoRowPage<T>[] {
  const pages: TwoRowPage<T>[] = [];
  let i = 0;
  while (i < items.length) {
    const first = pages.length === 0;
    const row3Avail = first ? widths.row3First : widths.row3Later;
    const row4Avail = widths.row4 - (first ? 0 : TAG_ARROW_WIDTH);
    const start3 = i;
    let used3 = 0;
    while (i < items.length && used3 + widthOf(items[i]) <= row3Avail) {
      used3 += widthOf(items[i]);
      i++;
    }
    const start4 = i;
    const minRow4 = !first && i === start3 ? 1 : 0;
    let used4 = 0;
    while (i < items.length && (i - start4 < minRow4 || used4 + widthOf(items[i]) <= row4Avail)) {
      used4 += widthOf(items[i]);
      i++;
    }
    if (i < items.length) {
      // More pages follow - make room for "›".
      while (i - start4 > minRow4 && used4 + TAG_ARROW_WIDTH > row4Avail) {
        i--;
        used4 -= widthOf(items[i]);
      }
    }
    pages.push({row3: items.slice(start3, start4), row4: items.slice(start4, i)});
  }
  return pages;
}

/**
 * Measures one tag row's budget: the whole row (R3 and R4 share the box's
 * width) and the element sharing page 0 with the tags (FlowStateChips /
 * meeting time field). Every real width change triggers requestEinkRefresh()
 * - the re-pack is a layout-driven (not tap-driven) state change, which
 * does not flush to the e-ink screen on its own.
 */
type RowWidths = {row: number | null; lead: number};

/**
 * Last measured widths per `cacheKey` (e.g. "daily:task"), kept for the
 * whole JS session (docs/dev/history/technical-design-render-perf-ab.md §3 A2). A widget
 * mounted again on the same screen starts from these, so the measurements
 * that follow match and cause no re-render and no extra e-ink refresh.
 */
const widthCache = new Map<string, RowWidths>();

export function useTagRowBudget(
  /** Optional: remember widths across mounts under this key. */
  cacheKey?: string,
): {
  onRowLayout: (e: LayoutChangeEvent) => void;
  onLeadLayout: (e: LayoutChangeEvent) => void;
  /** R3 on page 0: the row minus the lead element. */
  page0Width: number;
  /** The whole row: R3 past page 0, and R4. */
  laterWidth: number;
} {
  const [widths, setWidths] = useState<RowWidths>(() => (cacheKey ? widthCache.get(cacheKey) : undefined) ?? {row: null, lead: 0});
  const widthsRef = useRef(widths);

  const measure = (key: 'row' | 'lead') => (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    // display:none rows report 0 - keep the last real measurement.
    if (w <= 0 || widthsRef.current[key] === w) return;
    const next = {...widthsRef.current, [key]: w};
    // In the debug log, so a tag row that looks wrong on the device can be
    // checked against what it measured.
    log('tag row', cacheKey ?? '-', key, w);
    widthsRef.current = next;
    if (cacheKey) widthCache.set(cacheKey, next);
    setWidths(next);
    requestEinkRefresh();
  };

  const row = widths.row ?? FALLBACK_ROW_WIDTH;
  return {
    onRowLayout: measure('row'),
    onLeadLayout: measure('lead'),
    page0Width: Math.max(0, row - widths.lead),
    laterWidth: row,
  };
}
