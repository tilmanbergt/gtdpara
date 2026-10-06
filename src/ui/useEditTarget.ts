/**
 * A screen's one edit target (the row open in Quick Add's edit mode) and,
 * where the screen has a Files pane, its one arm (a row waiting for a Browse
 * pick: link a file, file/refile to a Project/Area).
 *
 * - `start(t)` saves the open edit's pending changes first (ui/useEditFlush.ts,
 *   save-then-switch) and switches only when that save succeeded; it also
 *   ends an open arm.
 * - `cancel()` closes the edit and any arm started from it.
 * - `armFor(a)` / `cancelArm()` leave the edit open: arming is reached from
 *   inside edit mode, and the widget keeps showing the edited row.
 *
 * Pass `flushEditRef` to <QuickAddWidget>; wrap any other handler that ends
 * or moves the edit (closing a panel, changing the day) in `afterSave`, and
 * use `set` inside it (no second save).
 */
import {useCallback, useState} from 'react';
import {useEditFlush} from './useEditFlush';

export function useEditTarget<T, A = never>() {
  const [target, setTarget] = useState<T | null>(null);
  const [arm, setArm] = useState<A | null>(null);
  const {flushEditRef, afterSave} = useEditFlush();
  const start = useCallback(
    (next: T) =>
      afterSave(() => {
        setTarget(next);
        setArm(null);
      }),
    [afterSave],
  );
  const cancel = useCallback(() => {
    setTarget(null);
    setArm(null);
  }, []);
  const armFor = useCallback((next: A) => setArm(next), []);
  const cancelArm = useCallback(() => setArm(null), []);
  return {target, arm, start, cancel, armFor, cancelArm, flushEditRef, afterSave, set: setTarget};
}
