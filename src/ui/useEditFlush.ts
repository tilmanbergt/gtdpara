/**
 * Save-then-switch for a screen's Quick Add edit mode (docs/dev/technical-design-
 * meeting-lists.md §10): before the screen
 * moves the edit to another row (or ends it by closing a panel, changing the
 * day/week/month, arming a file link), the widget first saves the current
 * row's pending changes - only if something changed. If that save fails
 * (invalid time, file changed on disk) the error shows and the switch does
 * not happen, so nothing is lost.
 *
 * Usage: `const {flushEditRef, afterSave} = useEditFlush();` - pass
 * `flushEditRef` to <QuickAddWidget>, and wrap every handler that changes
 * the edit target: `onStartEdit={() => afterSave(() => startEdit(row))}`.
 * Leaving the tab (the widget unmounts) saves too - that part lives in the
 * widget itself.
 */
import {useCallback, useRef} from 'react';

export function useEditFlush() {
  const flushEditRef = useRef<(() => Promise<boolean>) | null>(null);
  /** Runs `apply` once the current edit's pending changes are saved (right away when there is nothing to save). */
  const afterSave = useCallback((apply: () => void) => {
    const flush = flushEditRef.current;
    if (!flush) {
      apply();
      return;
    }
    flush()
      .then(ok => {
        if (ok) apply();
      })
      .catch(() => undefined);
  }, []);
  return {flushEditRef, afterSave};
}
