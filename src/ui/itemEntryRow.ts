/**
 * itemEntryRow — shared "one row = one Project/Area" sizing/display helpers
 * (docs/dev/history/technical-design-review-master-detail.md §Component inventory), used
 * by screens/ItemsList.tsx and the Review screen's master-detail left lists
 * (Stalled projects, Neglected areas, Done awaiting review, On Hold
 * reconsideration) so both use the same sizing/display logic.
 *
 * `COLUMN_WIDTH_PX` (678) is the app's established equal-two-column figure
 * (docs/dev/design-device-rendering.md §5.1: 1372px usable width, 16px gutter,
 * (1372-16)/2 = 678 per column) - both ItemsList.tsx's own two columns and
 * Review's 50/50 master-detail split reuse this same constant.
 */
import {CachedItem} from '../storage/dataCache';
import {isFocused} from '../domain/destination';
import {activeLineEstimator} from './textLineEstimator';
import {FONT} from './theme';

export const COLUMN_WIDTH_PX = 678;
const MAX_LINES = 2;
// Same FONT.medium line-height estimate ui/TaskRow.tsx's
// TASK_ROW_LINE_HEIGHT_PX and ui/FileBrowserPane.tsx's
// FILE_ENTRY_LINE_HEIGHT_PX already use - one shared constant across the
// codebase for "one line of FONT.medium text," not re-derived per file.
const ITEM_ENTRY_LINE_HEIGHT_PX = 22;
/** Default vertical padding of an entry row (top and bottom each) - Review's lists. */
export const ITEM_ENTRY_PADDING_PX = 6;

/**
 * How a list shows its entries. The Projects/Areas tabs show the
 * abbreviation and use a bit more padding (docs/dev/technical-design-waiting-
 * for-0.7.md P1/P2); Review's lists keep the defaults.
 */
export interface ItemEntryOptions {
  /** Add `#ABBR` after the name when the item has an abbreviation. */
  showAbbrev?: boolean;
  /** Vertical padding (top and bottom each); defaults to ITEM_ENTRY_PADDING_PX. */
  paddingPx?: number;
}

/** Space between the name and its `#ABBR`, as rendered by screens/ItemsList.tsx. */
export const ABBREV_GAP = '  ';

/** The abbreviation label shown after the name, or null when not shown. */
export function itemEntryAbbrevLabel(item: CachedItem, opts: ItemEntryOptions = {}): string | null {
  return opts.showAbbrev && item.abbrev ? `#${item.abbrev}` : null;
}

export function itemEntryDisplayText(item: CachedItem, opts: ItemEntryOptions = {}): string {
  const abbrev = itemEntryAbbrevLabel(item, opts);
  return `${isFocused(item) ? '★ ' : ''}${item.name}${abbrev ? ABBREV_GAP + abbrev : ''} ›`;
}

export function itemEntryLines(item: CachedItem, columnWidthPx: number, opts: ItemEntryOptions = {}): number {
  const availableWidth = Math.max(1, columnWidthPx);
  return Math.min(MAX_LINES, activeLineEstimator.estimateLines(itemEntryDisplayText(item, opts), availableWidth, FONT.medium));
}

export function itemEntryHeight(item: CachedItem, columnWidthPx: number, opts: ItemEntryOptions = {}): number {
  const padding = opts.paddingPx ?? ITEM_ENTRY_PADDING_PX;
  // entryRow's own paddingVertical top + bottom - this row has no border.
  return padding * 2 + itemEntryLines(item, columnWidthPx, opts) * ITEM_ENTRY_LINE_HEIGHT_PX;
}
