/**
 * ReviewMasterDetail — the shared left-list/right-detail shell used by all
 * five converted screens/ReviewScreen.tsx steps (Stalled projects, Done
 * awaiting review, On Hold reconsideration, Neglected areas, Unfocused next
 * items). New component, 2026-09-16 (docs/dev/technical-design-review-master-
 * detail.md §3) - this is the piece that actually finishes the pagination-
 * unification goal (docs/dev/technical-design-pagination-fixed-height.md's
 * Batch 7 was blocked on Review's old cards holding multiple unbounded
 * lists at once; master-detail sidesteps that rather than solving it head
 * on): the left list is a single `PagedSection`, so once every step uses
 * this shell, `ui/PageControls.tsx`/`usePagination`/`Paged<T>` have zero
 * remaining callers anywhere in the app.
 *
 * Owns exactly two pieces of UI-only state, neither of which is review data:
 * - `selectedKey` - which left-list row's detail is showing on the right.
 *   Starts `null` on every step entry (no pre-selection - decided in the
 *   requirements chat) and resets whenever `resetKey` changes, the same
 *   reset convention `ui/PagedSection.tsx`'s own `resetKey` already uses.
 *   ReviewScreen passes its own per-step snapshot identity as `resetKey`,
 *   so entering/re-entering a step (goToStep) or a manual 🔄 reload (which
 *   re-freezes the snapshot) both clear the selection, but re-rendering for
 *   an unrelated reason (a sibling step's action, a live cache update)
 *   doesn't.
 * - Row selection wiring - which row is tappable (`isSelectable`) and what
 *   tapping it does (`setSelectedKey`). Everything else about how a row or
 *   the detail panel *looks* is the caller's own `renderRow`/`renderDetail`
 *   callback, not this shell's concern - this is deliberately a thin
 *   layout+selection shell, not a second place review-specific rendering
 *   logic lives.
 *
 * `actedOnKeys` is a controlled prop, not local state (unlike the design
 * doc's very first sketch) - ReviewScreen already owns one frozen-snapshot
 * Set per step (the direct generalization of today's stalledSnapshot/
 * neglectedSnapshot arrays - see that file's module doc comment), so the
 * "acted-on but still visible, checkmarked, reopenable" bookkeeping lives
 * there, right next to the action handlers that populate it, rather than
 * being duplicated inside this shell.
 *
 * Bugfix (2026-09-16, Tilman: couldn't get Stalled projects' one-and-only
 * listed project to open its detail panel by tapping it, though tapping
 * "worked fine" on other steps): `wrappedRenderRow`'s `onPress` was a plain,
 * fully synchronous `setSelectedKey(key)` with no `requestEinkRefresh()`
 * call - exactly the class of bug `bugfix_eink_refresh.md`'s Follow-ups 3/4
 * already diagnosed for `ReviewScreen.tsx`'s own `goToStep` (a direct-tap
 * state change isn't guaranteed to flush on this device without an explicit
 * refresh call; `useEinkRefreshOnLoad`'s `loading` flag doesn't cover a
 * purely-local, non-async UI state like this one at all). This shell is new
 * code from this same session, added after that fix landed, so it simply
 * never got the call. The actual selection always worked (state updates,
 * `stalledList.find` always resolves) - the native e-ink panel just didn't
 * necessarily repaint to show it, a race whose odds get worse the more the
 * detail panel has to draw (Follow-up 4's finding), which is consistent
 * with Stalled/Neglected's richer detail panel (quick-add + context block +
 * task/meeting/shelved lists) being a less favorable case than a step with
 * less to paint - not something actually specific to a one-row list, just
 * where Tilman happened to notice it first.
 *
 * Self-measuring, tabbed-pane follow-on (2026-09-17, [[feature_pagination_
 * fixed_height]]): `viewportHeight` is now optional - see that prop's own
 * doc comment below. Every one of ReviewScreen's 5 steps that uses this
 * shell shares one bounded flex:1 box (`stepScroll`), one step mounted at a
 * time, so all 5 became eligible to self-measure at once via this single
 * change.
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
   * Optional (2026-09-17, [[feature_pagination_fixed_height]]'s tabbed-pane
   * follow-on) - every caller today (ReviewScreen's 5 steps) sits inside
   * the same bounded `stepScroll` (flex:1), one step mounted at a time, and
   * `styles.col` below already gives `PagedSection` an unconditional
   * flex:1 parent - so omitting this just forwards `undefined` straight
   * into `PagedSection`, which self-measures on its own. No wrapper-style
   * change needed here at all, unlike ui/GoogleCalendarPanel.tsx's own root
   * (which had no style before and needed a conditional flex:1). */
  viewportHeight?: number;
  /** Clears `selectedKey` on change - pass the step's frozen-snapshot identity (or the step index) so re-entering the step resets the selection. */
  resetKey?: string | number;
  emptyHint?: string;
  /**
   * Optional CONTROLLED selection (2026-09-28, docs/dev/technical-design-review-
   * monthly-focus.md §4.2) - when `selectedKey` is passed (anything but
   * `undefined`), the caller owns the selection: a row tap only calls
   * `onSelectedKeyChange`, and the caller also resets it on step entry
   * itself. Used by the Gmail step, which moves the selection to the next
   * email after an archive. Every other step leaves both unset (internal
   * state, unchanged behavior).
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

  // No pre-selection on step entry (requirements chat: "Leer mit
  // Hinweistext") - resets whenever the caller's resetKey changes, same
  // convention PagedSection's own resetKey already uses.
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
  // Equal 50/50 split (requirements chat: "ich denke 50% sind gut ...
  // sollte also eigentlich überall eher die wiederverwendung erleichtern,
  // bei 50% zu bleiben") - two equal-flex columns rather than a fixed-pixel
  // split, so this shell doesn't need to know the screen's exact usable
  // width; every current call site's own outer container is already the
  // same full-content-width flex row every other two-column screen uses.
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
