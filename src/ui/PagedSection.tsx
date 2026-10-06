/**
 * Merged header+pagination chrome for every fixed-height paginated list in
 * the app (docs/dev/technical-design-pagination-fixed-height.md). One line:
 * header left, `‹`/`›` arrows right (no "page N of M") - above a box of
 * fixed `viewportHeight` that fits as many rows as `usePagedByHeight`'s
 * greedy fill allows.
 *
 * Arrows are only rendered when that direction is actually available - not
 * shown disabled. Most lists fit on one page, so most `PagedSection`
 * instances show no arrow at all. `styles.headerRow`'s height is fixed by
 * its own padding/line-height, never by whether arrows are present, so the
 * header line never changes height page to page.
 *
 * A `+N` hidden-count label sits just left of the arrows:
 * `N = rows.length - pageItems.length`, i.e. how many entries exist that
 * are not visible right now - not a countdown to the end of the list (an
 * 8-meeting day showing 3 per page reads "+5" on pages 1 and 2, "+6" on a
 * final page of 2). Part of this shared component so every `PagedSection`
 * gets it. `N` is nonzero exactly when `canPrev || canNext`, so it shares
 * the arrows' visibility condition; a single-page list shows neither.
 *
 * `N` only counts "real" rows, per `isCountableRow` below. Several callers
 * (screens/ProjectDataPanel.tsx's Todos/Meetings, screens/InboxScreen.tsx's
 * Tasks/Meetings, screens/DailyView.tsx's Open-tasks) flatten a grouped list
 * into one paginated `rows` sequence with `{kind: 'header'}` rows standing
 * in for each group's own label (docs/dev/technical-design-pagination-edit-reuse.md
 * §2/§4) - those rows consume height (so `rowHeight`/pagination still
 * account for them), but they aren't entries a person is looking for, so
 * they don't count. Callers with no such split (ui/FileBrowserPane.tsx,
 * ui/WeeklyMeetingsColumn.tsx, screens/ItemsList.tsx) omit the prop and
 * count every row.
 *
 * The fixed-height guarantee is the whole point of this component: the
 * total height (header row + optional `subHeader` + the item viewport) is
 * the same regardless of how many rows exist - zero, one, or a full page's
 * worth all render inside the same `viewportHeight` box, and `emptyHint`
 * fills that same box rather than shrinking it. So a `PagedSection` can be
 * dropped into any layout without reflowing its surroundings.
 *
 * `viewportHeight` is optional ([[feature_pagination_fixed_height]]'s
 * "runtime-measured viewport height"). Hand-derived heights tend to drift
 * from the real layout in ways that are hard to catch by eye. Omitting
 * `viewportHeight` switches this component into self-measuring mode: its
 * root becomes `flex: 1` and the item box becomes `flex: 1` + `onLayout`
 * rather than a fixed `height`, so flexbox - not a formula - determines how
 * much room is left after this component's header/subHeader and whatever
 * sits above it in the caller's layout. This only works when the caller
 * sits inside a bounded flex column (the same precondition every
 * fixed-height screen in this app needs); an explicit `viewportHeight`
 * behaves as a fixed height.
 */
import React, {useEffect} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {JumpTo, usePagedByHeight} from './pagination';
import {useMeasuredHeight} from './useMeasuredHeight';
import {common} from './commonStyles';
import {FONT} from './theme';
import {log, logError} from '../utils/log';
import {perfCount, perfMark} from '../utils/perf';

// Sanity heuristic for the logging below, not a hard rule - a
// self-measured viewport this small almost always means a sibling above
// it (in the caller's own layout) is unexpectedly flex-greedy, eating
// space that should have gone to this box. Tune/remove freely; it exists
// purely to make that failure mode loud instead of a silent near-empty box.
const SUSPICIOUSLY_SMALL_VIEWPORT_PX = 50;

interface Props<T> {
  /** A plain string in most callers; a ReactNode (e.g. a styled nested
   * <Text>) for a caller that needs more than one style within the header
   * line itself (e.g. Week view's "Mon 09/16 · Today" underline). Rendered
   * inside this component's own <Text numberOfLines={1}> below, so it must
   * stay Text-compatible content (plain strings, nested <Text> - including
   * a nested pressable <Text onPress> for an inline "‹ Up"-style action,
   * same pattern ui/TaskRow.tsx's tappable tag spans already use) - a View
   * or Pressable nested inside won't lay out correctly. A non-text element
   * that needs to sit in this row (an icon button, say) is `headerAccessory`
   * below instead. */
  header: React.ReactNode;
  /** Optional non-text element rendered in the header row after the header
   * text (before the +N/arrows), for a caller whose header needs something
   * `header` itself can't hold - e.g. ui/FileBrowserPane.tsx's pin icon,
   * an actual `<Pressable><PinIcon/></Pressable>` that can't nest inside
   * `header`'s own <Text>. */
  headerAccessory?: React.ReactNode;
  /** Optional second line between the header/arrows row and the fixed-
   * height item box (e.g. a Refresh/Show-existing row). Its rendered height
   * is the caller's own responsibility to fold into `viewportHeight` -
   * PagedSection doesn't measure it. */
  subHeader?: React.ReactNode;
  rows: T[];
  rowHeight: (row: T) => number;
  /** Fixed pixel height for the item viewport. Omit to self-measure via RN's
   * own layout instead - see this module's own doc comment above for what
   * that mode does and what it requires of the caller's own layout. */
  viewportHeight?: number;
  resetKey?: string | number;
  /** Jumps to whichever page contains a specific row, once, on a `key`
   * change - see ui/pagination.ts's `JumpTo`/`usePagedByHeight` doc
   * comments (e.g. ui/FileBrowserPane.tsx's `locating` mode). Without it,
   * paging starts wherever resetKey/normal paging left it. */
  jumpTo?: JumpTo | null;
  renderRow: (row: T) => React.ReactNode;
  /** Which rows count toward the `+N` hidden-count label (see the module
   * doc comment above). Omitted: every row counts. Passed by a caller that
   * flattens a grouped list into `rows` with its own in-sequence
   * `{kind: 'header'}`-style rows, returning false for those so only actual
   * entries are counted. Doesn't affect pagination itself
   * (`rowHeight`/`usePagedByHeight` still see every row, header rows
   * included) - only this one label. */
  isCountableRow?: (row: T) => boolean;
  /** Shown inside the fixed-height item box when rows.length === 0 - the
   * box itself still renders at full viewportHeight either way. */
  emptyHint?: string;
  /** Replaces the item box's own rows/emptyHint rendering entirely, still
   * inside the same fixed-height viewport - for a caller whose box needs
   * something neither a row list nor a plain-string `emptyHint` can show,
   * e.g. ui/FileBrowserPane.tsx's own loading spinner/error text while a
   * folder listing is in flight - so the header/arrows stay mounted and
   * stable (breadcrumb, pin) across a load instead of the whole section
   * disappearing and reappearing. */
  viewportContent?: React.ReactNode;
  /** Called with the index of the current page's first row whenever it changes (ui/pagination.ts's PagedByHeight.startIndex) - ui/MeetingList.tsx uses it to keep that row in view across a layout switch. */
  onFirstRowChange?: (index: number) => void;
  textColor: string;
  borderColor: string;
}

export default function PagedSection<T>({
  header,
  headerAccessory,
  subHeader,
  rows,
  rowHeight,
  viewportHeight,
  resetKey,
  jumpTo,
  renderRow,
  isCountableRow,
  emptyHint,
  viewportContent,
  onFirstRowChange,
  textColor,
  borderColor,
}: Props<T>): React.JSX.Element {
  perfCount('render:PagedSection');
  const selfMeasuring = viewportHeight == null;
  const [measuredOnLayout, measuredHeight] = useMeasuredHeight();
  // 0 only ever applies for the one render before the first onLayout fires
  // (self-measuring mode, nothing measured yet) - usePagedByHeight always
  // admits at least one row regardless (see its own doc comment), so that
  // render shows a single row in an already-correctly-sized box rather than
  // nothing; the very next render (same JS tick in practice, before the
  // debounced eink refresh flushes - see requestEinkRefresh) corrects to
  // the real page contents once measuredHeight is known.
  const effectiveViewportHeight = viewportHeight ?? measuredHeight ?? 0;

  // Logged rather than asserted - this is diagnostic only, see this
  // module's own doc comment. `header` is usually a plain string (a
  // ReactNode header falls back to a placeholder label below) - it's the
  // only caller-identifying label available here, useful for telling
  // several self-measuring instances apart in one `adb logcat` capture.
  useEffect(() => {
    if (!selfMeasuring || measuredHeight == null) return;
    const label = typeof header === 'string' ? header : '(non-text header)';
    log('PagedSection: self-measured viewport', {header: label, measuredHeight});
    perfMark('layout:PagedSection', {header: label, measuredHeight, rows: rows.length});
    if (measuredHeight < SUSPICIOUSLY_SMALL_VIEWPORT_PX) {
      logError(
        'PagedSection: suspiciously small self-measured viewport - check for a flex-greedy sibling above this box',
        {header: label, measuredHeight},
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selfMeasuring, measuredHeight]);

  const paged = usePagedByHeight(rows, rowHeight, effectiveViewportHeight, resetKey, jumpTo);
  useEffect(() => {
    onFirstRowChange?.(paged.startIndex);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paged.startIndex]);
  // Defaults to counting every row - see isCountableRow's own doc comment
  // above.
  const countableTotal = isCountableRow ? rows.filter(isCountableRow).length : rows.length;
  const countableVisible = isCountableRow
    ? paged.pageItems.filter(isCountableRow).length
    : paged.pageItems.length;
  return (
    <View style={selfMeasuring ? styles.selfMeasuringRoot : undefined}>
      <View style={[styles.headerRow, {borderColor}]}>
        <Text style={[styles.header, {color: textColor}]} numberOfLines={1}>
          {header}
        </Text>
        {headerAccessory}
        {(paged.canPrev || paged.canNext) && (
          <View style={styles.arrows}>
            <Text style={[styles.hiddenCount, {color: textColor}]}>
              +{countableTotal - countableVisible}
            </Text>
            {paged.canPrev && (
              <Pressable onPress={paged.goPrev} hitSlop={8} style={styles.arrowButton}>
                <Text style={[styles.arrow, {color: textColor}]}>‹</Text>
              </Pressable>
            )}
            {paged.canNext && (
              <Pressable onPress={paged.goNext} hitSlop={8} style={styles.arrowButton}>
                <Text style={[styles.arrow, {color: textColor}]}>›</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
      {subHeader}
      <View
        style={[styles.viewport, selfMeasuring ? styles.viewportFlex : {height: viewportHeight}]}
        onLayout={selfMeasuring ? measuredOnLayout : undefined}>
        {viewportContent !== undefined ? (
          viewportContent
        ) : rows.length === 0 && emptyHint ? (
          <Text style={[common.hint, {color: textColor}]}>{emptyHint}</Text>
        ) : (
          paged.pageItems.map(renderRow)
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // Fixed by padding, not by content - see the module doc comment on why
    // this line's height must never depend on whether arrows are showing.
    paddingVertical: 4,
    marginBottom: 4,
    // A light divider between the header/arrows line and the item box
    // below it.
    borderBottomWidth: 1,
  },
  header: {
    flex: 1,
    fontSize: FONT.small,
    fontWeight: '700',
  },
  arrows: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // Muted/small - an FYI, not a control, so it shouldn't compete
  // visually with the arrows next to it.
  hiddenCount: {
    fontSize: FONT.small,
    opacity: 0.6,
    marginRight: 4,
  },
  arrowButton: {
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  arrow: {
    fontSize: FONT.medium,
    fontWeight: '700',
  },
  viewport: {
    overflow: 'hidden',
  },
  // Self-measuring mode only (viewportHeight omitted) - see this module's
  // own doc comment for why both the root and the viewport box need their
  // own flex:1 for the measurement to resolve to a real bounded number.
  selfMeasuringRoot: {
    flex: 1,
  },
  viewportFlex: {
    flex: 1,
  },
});
