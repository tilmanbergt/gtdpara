/**
 * ReviewMasterDetail — the shared left-list/right-detail shell used by the
 * screens/ReviewScreen.tsx steps (Stalled projects, Done awaiting review, On
 * Hold reconsideration, Neglected areas, Unfocused next items;
 * docs/dev/history/technical-design-review-master-detail.md §3). The left list is a
 * single `PagedSection`, so a step never holds several unbounded lists at
 * once (docs/dev/history/technical-design-pagination-fixed-height.md).
 *
 * Owns exactly two pieces of UI-only state, neither of which is review data:
 * - `selectedKey` - which left-list row's detail is showing on the right.
 *   Starts `null` on every step entry (no pre-selection) and resets whenever
 *   `resetKey` changes, the same convention as `ui/PagedSection.tsx`'s
 *   `resetKey`. ReviewScreen passes its per-step snapshot identity as
 *   `resetKey`, so entering/re-entering a step (goToStep) or a manual 🔄
 *   reload (which re-freezes the snapshot) both clear the selection, but
 *   re-rendering for an unrelated reason (a sibling step's action, a live
 *   cache update) doesn't.
 * - Row selection wiring - which row is tappable (`isSelectable`) and what
 *   tapping it does (`setSelectedKey`). Everything else about how a row or
 *   the detail panel *looks* is the caller's own `renderRow`/`renderDetail`
 *   callback - this is deliberately a thin layout+selection shell, not a
 *   second place review-specific rendering logic lives.
 *
 * `actedOnKeys` is a controlled prop, not local state - ReviewScreen owns
 * one frozen-snapshot Set per step (see that file's module doc comment), so
 * the "acted-on but still visible, checkmarked, reopenable" bookkeeping
 * lives right next to the action handlers that populate it.
 *
 * A row tap calls `requestEinkRefresh()` after `setSelectedKey`: a direct-tap
 * state change isn't guaranteed to repaint on this device without an
 * explicit refresh, and `useEinkRefreshOnLoad`'s `loading` flag doesn't
 * cover purely local UI state. Without it the selection works but the
 * e-ink panel may not show it, more likely the more the detail panel draws.
 *
 * `viewportHeight` is optional - see that prop's doc comment below.
 */
import React, {useEffect, useState} from 'react';
import {StyleSheet, Pressable, View} from 'react-native';
import PagedSection from './PagedSection';
import {requestEinkRefresh} from '../utils/screenRefresh';

interface Props<T> {
  /** Already flattened (header+entry rows) where a step needs grouping - see ui/ProjectDataPanel.tsx's TodosSection/MeetingsSection convention, reused (not shared code, same pattern) by Unfocused next items. */
  rows: T[];
  rowHeight: (row: T) => number;
  /** Content only - this shell wraps the result in the row's own tap target when `isSelectable(row)` is true. A non-selectable row (e.g. a flattened group's own header row) must supply its own `key` since it's returned as-is into the list. */
  renderRow: (row: T, selected: boolean, actedOn: boolean) => React.ReactNode;
  /** False for a row that can't be the detail selection (a header row in a flattened group). */
  isSelectable: (row: T) => boolean;
  rowKey: (row: T) => string;
  isCountableRow?: (row: T) => boolean;
  /** Left-column caption, e.g. "Stalled projects" - passed straight through to PagedSection's own header. */
  header: string;
  /** Optional element in the list header after the caption - e.g. ui/MeetingList.tsx's LayoutSwitch (Meetings to close out). */
  headerAccessory?: React.ReactNode;
  /** `null` when nothing is selected yet - the caller supplies its own empty-state guide copy for that branch (see the requirements doc's per-step copy). */
  renderDetail: (selectedKey: string | null) => React.ReactNode;
  /** Which rows show the checkmark - see the module doc comment on why this is controlled, not local. */
  actedOnKeys: Set<string>;
  /** The left list's own fixed viewport, same "fresh screen budget" convention as every other PagedSection call site (docs/dev/design-device-rendering.md §6) - computed by the caller (ReviewScreen), not guessed here.
     *
     * Optional - ReviewScreen's steps sit inside the same bounded `stepScroll`
     * (flex:1), one step mounted at a time, and `styles.col` below gives
     * `PagedSection` an unconditional flex:1 parent - so omitting this
     * forwards `undefined` into `PagedSection`, which self-measures. */
  viewportHeight?: number;
  /** Clears `selectedKey` on change - pass the step's frozen-snapshot identity (or the step index) so re-entering the step resets the selection. */
  resetKey?: string | number;
  emptyHint?: string;
  /**
   * Optional CONTROLLED selection (docs/dev/technical-design-review-
   * monthly-focus.md §4.2) - when `selectedKey` is passed (anything but
   * `undefined`), the caller owns the selection: a row tap only calls
   * `onSelectedKeyChange`, and the caller also resets it on step entry
   * itself. Used by the Gmail step, which moves the selection to the next
   * email after an archive. Other steps leave both unset (internal state).
   */
  selectedKey?: string | null;
  onSelectedKeyChange?: (key: string | null) => void;
  textColor: string;
  borderColor: string;
}

export default function ReviewMasterDetail<T>({
  rows,
  rowHeight,
  renderRow,
  isSelectable,
  rowKey,
  isCountableRow,
  header,
  headerAccessory,
  renderDetail,
  actedOnKeys,
  viewportHeight,
  resetKey,
  emptyHint,
  selectedKey: controlledSelectedKey,
  onSelectedKeyChange,
  textColor,
  borderColor,
}: Props<T>): React.JSX.Element {
  const [internalSelectedKey, setInternalSelectedKey] = useState<string | null>(null);
  const isControlled = controlledSelectedKey !== undefined;
  const selectedKey = isControlled ? controlledSelectedKey : internalSelectedKey;
  const setSelectedKey = (key: string | null) => {
    if (isControlled) onSelectedKeyChange?.(key);
    else setInternalSelectedKey(key);
  };

  // No pre-selection on step entry (an empty detail panel with a hint) -
  // resets whenever the caller's resetKey changes, same convention as
  // PagedSection's own resetKey.
  useEffect(() => {
    setInternalSelectedKey(null);
    // Deliberately keyed only on resetKey, not on `rows`/`actedOnKeys` -
    // those change on every action inside this same step visit and must
    // NOT clear the current selection (an acted-on row stays selected,
    // checkmarked, reopenable - see the module doc comment).
  }, [resetKey]);

  const wrappedRenderRow = (row: T): React.ReactNode => {
    const key = rowKey(row);
    const content = renderRow(row, selectedKey === key, actedOnKeys.has(key));
    if (!isSelectable(row)) return content;
    return (
      <Pressable
        key={key}
        onPress={() => {
          setSelectedKey(key);
          requestEinkRefresh();
        }}>
        {content}
      </Pressable>
    );
  };

  return (
    <View style={styles.columns}>
      <View style={styles.col}>
        <PagedSection
          header={header}
          headerAccessory={headerAccessory}
          rows={rows}
          rowHeight={rowHeight}
          viewportHeight={viewportHeight}
          resetKey={resetKey}
          renderRow={wrappedRenderRow}
          isCountableRow={isCountableRow}
          emptyHint={emptyHint}
          textColor={textColor}
          borderColor={borderColor}
        />
      </View>
      <View style={styles.colGap} />
      <View style={[styles.col, styles.detailPanel, {borderColor}]}>{renderDetail(selectedKey)}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Equal 50/50 split, which keeps the shell easy to reuse - two equal-flex
  // columns rather than a fixed-pixel split, so this shell doesn't need to
  // know the screen's exact usable width; every call site's own outer
  // container is the same full-content-width flex row every other
  // two-column screen uses.
  columns: {
    flexDirection: 'row',
    flex: 1,
  },
  col: {
    flex: 1,
  },
  colGap: {
    width: 16,
  },
  detailPanel: {
    borderWidth: 1,
    borderRadius: 6,
    padding: 16,
  },
});
