/**
 * Small shared hook for reading a View's real, laid-out height via React
 * Native's own `onLayout` callback (docs/dev/technical-design-pagination-fixed-
 * height.md's history - [[feature_pagination_fixed_height]]'s "Runtime-
 * measured viewport height" plan, 2026-09-17). Wrap whichever box you want
 * the true remaining size of in a `{flex: 1}` View (so ordinary flexbox
 * shrinks it to "whatever's left" after its non-flexible siblings, the same
 * way flexbox always has), pass this hook's `onLayout` to that View, and
 * read `height` back.
 *
 * This is a pure read tap on layout RN already computes on every render -
 * it does not introduce a new layout model, and it does not require any
 * change to sibling components' own styles (a `TabBar`/`QuickAddWidget`/etc.
 * keeps sizing itself exactly as it always has; this hook just reports what
 * was left over for the flex:1 box next to it). `height` stays `null` until
 * RN's first layout pass completes - there is always one render before the
 * real number is known, same as any `onLayout`-based measurement.
 *
 * Stage 0 of the plan to replace hand-summed pixel "chrome budget" constants
 * (`GLOBAL_CHROME_PX`, `QUICK_ADD_WIDGET_PX`, `OPEN_TASKS_VIEWPORT_PX`, etc.
 * in screens/DailyView.tsx and their equivalents elsewhere) with a real
 * flexbox measurement instead of a formula built from estimated/measured-
 * from-a-screenshot sibling sizes, which this whole feature's round-by-round
 * history (see that file) shows drifts from reality in ways that are very
 * hard to catch by eye. Deliberately its own tiny hook, not baked into
 * `ui/PagedSection.tsx` itself - it's meant to wrap the box *around* a
 * `PagedSection` (or any other fixed-size box), not to change what
 * `PagedSection` does with the `viewportHeight` number it's given.
 */
import {useCallback, useState} from 'react';
import {LayoutChangeEvent} from 'react-native';
import {perfMark} from '../utils/perf';

export function useMeasuredHeight(): [(e: LayoutChangeEvent) => void, number | null] {
  const [height, setHeight] = useState<number | null>(null);
  // Guard against redundant state updates (onLayout can fire again with an
  // unchanged value, e.g. when an unrelated sibling re-renders) - avoids an
  // extra render/repagination pass for a size that didn't actually change.
  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const measured = e.nativeEvent.layout.height;
    // A hidden kept tab (display: 'none', docs/dev/technical-design-keep-tabs-
    // alive.md §5.4) reports 0 - keep the last real height so the screen
    // paginates correctly the moment it is shown again. 0 is never a
    // meaningful list viewport, so this changes nothing elsewhere.
    if (measured <= 0) return;
    perfMark('layout:measured', {height: measured});
    setHeight(prev => (prev === measured ? prev : measured));
  }, []);
  return [onLayout, height];
}
