/**
 * A screen's one selected item and, where the screen has a Files pane, its
 * one arm (a row waiting for a Browse pick: link a file, file/refile to a
 * Project/Area).
 *
 * The selected item shows in one of two modes (docs/dev/history/technical-design-item-card.md §3):
 * - `card`: the item card in Quick Add's place - the first tap on a row;
 * - `edit`: Quick Add's edit form - the card's Edit, or a second tap on the
 *   selected row (two quick taps on a row therefore go straight to edit).
 *
 * - `select(t)` saves an open edit's pending changes first (ui/useEditFlush.ts,
 *   save-then-switch), then shows `t` as card; on the target already shown as
 *   card it switches to edit. It ends an arm started for another target.
 * - `start(t)` is select + edit, for callers that edit directly.
 * - `edit()` turns the card into the edit form; `saved()` turns a saved edit
 *   back into the card.
 * - `cancel()` closes the card or edit, and any arm.
 * - `armFor(a)` / `cancelArm()` leave the target as it is: arming is reached
 *   from the card or the edit form, which keep showing the item.
 *
 * Pass `flushEditRef` to <QuickAddWidget>; wrap any other handler that ends
 * or moves the selection (closing a panel, changing the day) in `afterSave`,
 * and use `set` inside it (no second save).
 */
import {useCallback, useRef, useState} from 'react';
import {useEditFlush} from './useEditFlush';

export type EditMode = 'card' | 'edit';

const sameTarget = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function useEditTarget<T, A = never>() {
  const [selection, setSelection] = useState<{target: T | null; mode: EditMode}>({target: null, mode: 'edit'});
  const [arm, setArm] = useState<A | null>(null);
  const {flushEditRef, afterSave} = useEditFlush();
  // The selection as last rendered, for `select` deciding card vs edit at tap time.
  const selectionRef = useRef(selection);
  selectionRef.current = selection;

  const select = useCallback(
    (next: T) => {
      const current = selectionRef.current;
      if (current.target !== null && sameTarget(current.target, next)) {
        // The selected row again: the card opens its edit form; a tap on the
        // row being edited changes nothing (and saves nothing).
        if (current.mode === 'card') setSelection({target: current.target, mode: 'edit'});
        return;
      }
      afterSave(() => {
        setSelection({target: next, mode: 'card'});
        setArm(null);
      });
    },
    [afterSave],
  );
  const start = useCallback(
    (next: T) =>
      afterSave(() => {
        setSelection({target: next, mode: 'edit'});
        setArm(null);
      }),
    [afterSave],
  );
  const edit = useCallback(() => setSelection(s => (s.target === null ? s : {target: s.target, mode: 'edit'})), []);
  const saved = useCallback(() => setSelection(s => (s.target === null ? s : {target: s.target, mode: 'card'})), []);
  const cancel = useCallback(() => {
    setSelection({target: null, mode: 'edit'});
    setArm(null);
  }, []);
  /** Sets the target without saving (inside `afterSave`); the mode stays unless given. */
  const set = useCallback((next: T | null, mode?: EditMode) => setSelection(s => ({target: next, mode: mode ?? s.mode})), []);
  const armFor = useCallback((next: A) => setArm(next), []);
  const cancelArm = useCallback(() => setArm(null), []);
  return {
    target: selection.target,
    mode: selection.mode,
    arm,
    select,
    start,
    edit,
    saved,
    cancel,
    armFor,
    cancelArm,
    flushEditRef,
    afterSave,
    set,
  };
}
