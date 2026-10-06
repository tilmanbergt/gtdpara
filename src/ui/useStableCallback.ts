/**
 * A function with a stable identity that always calls the LATEST `fn`
 * passed in (the "latest ref" pattern) - lets a parent pass callbacks to a
 * React.memo'd child without breaking the memo on every render, and without
 * the stale-closure risk of useCallback with incomplete deps
 * (docs/dev/technical-design-render-perf-ab.md §3 B2).
 *
 * Only for callbacks the child calls from event handlers or effects - never
 * for a function the child calls while rendering (the child would not
 * re-render when the function's behavior changes). Where a callback's
 * PRESENCE matters (`cond ? fn : undefined`), keep that condition at the
 * call site and stabilize only the function itself.
 */
import {useCallback, useRef} from 'react';

export function useStableCallback<F extends (...args: any[]) => any>(fn: F): F {
  const ref = useRef(fn);
  // Assigned during render (not in a layout effect) on purpose: a child's
  // own effects run BEFORE the parent's layout effects in the same commit,
  // so an effect-time assignment could hand a child effect the previous
  // render's function. No concurrent rendering is used in this app.
  ref.current = fn;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(((...args: Parameters<F>) => ref.current(...args)) as F, []);
}
