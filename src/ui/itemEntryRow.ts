/**
 * itemEntryRow — shared "one row = one Project/Area" sizing/display helpers,
 * extracted from screens/ItemsList.tsx (2026-09-16, docs/
 * technical-design-review-master-detail.md §Component inventory) so the
 * Review screen's new master-detail left lists (Stalled projects, Neglected
 * areas, Done awaiting review, On Hold reconsideration) can render their own
 * item rows with byte-for-byte the same sizing/display logic ItemsList.tsx
 * uses, rather than a second hand-maintained copy drifting out of sync.
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
// entryRow's own paddingVertical (6x2) - this row has no border, unlike
// ui/FileBrowserPane.tsx's entry row (which reserves padding on both the
// row wrapper and the text, hence its chrome being 20 not 12).
const ITEM_ENTRY_CHROME_PX = 6 * 2;
// Same FONT.medium line-height estimate ui/TaskRow.tsx's
// TASK_ROW_LINE_HEIGHT_PX and ui/FileBrowserPane.tsx's
// FILE_ENTRY_LINE_HEIGHT_PX already use - one shared constant across the
// codebase for "one line of FONT.medium text," not re-derived per file.
const ITEM_ENTRY_LINE_HEIGHT_PX = 22;

export function itemEntryDisplayText(item: CachedItem): string {
  return `${isFocused(item) ? '★ ' : ''}${item.name} ›`;
}

export function itemEntryLines(item: CachedItem, columnWidthPx: number): number {
  const availableWidth = Math.max(1, columnWidthPx);
  return Math.min(MAX_LINES, activeLineEstimator.estimateLines(itemEntryDisplayText(item), availableWidth, FONT.medium));
}

export function itemEntryHeight(item: CachedItem, columnWidthPx: number): number {
  return ITEM_ENTRY_CHROME_PX + itemEntryLines(item, columnWidthPx) * ITEM_ENTRY_LINE_HEIGHT_PX;
}
