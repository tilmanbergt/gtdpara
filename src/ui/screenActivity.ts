/**
 * "Is my screen the visible tab?" for screens kept alive across tab
 * switches (docs/dev/history/technical-design-keep-tabs-alive.md §3.3).
 *
 * The context carries a small store rather than a boolean on purpose:
 * hiding or showing a tab must not re-render the whole screen (that would
 * cost the very time keep-alive saves). Hooks subscribe and react only where
 * needed - a cache subscription pausing, a status message withdrawn, a
 * quiet reload on show.
 *
 * Default = always active: every screen NOT inside a ui/KeptTab.tsx (Inbox,
 * Review, Settings, capture/focus mode, and every screen while "Keep tabs in
 * memory" is off) behaves exactly as before.
 */
import {createContext, useContext, useEffect, useRef} from 'react';

export interface ScreenActivity {
  isActive(): boolean;
  /** Called with the new value on every change. Returns an unsubscribe function. */
  subscribe(listener: (active: boolean) => void): () => void;
}

const ALWAYS_ACTIVE: ScreenActivity = {
  isActive: () => true,
  subscribe: () => () => {},
};

export const ScreenActivityContext = createContext<ScreenActivity>(ALWAYS_ACTIVE);

/** A settable activity store - one per ui/KeptTab.tsx. */
export function createScreenActivity(initial: boolean): ScreenActivity & {set(active: boolean): void} {
  let active = initial;
  const listeners = new Set<(active: boolean) => void>();
  return {
    isActive: () => active,
    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    set: next => {
      if (next === active) return;
      active = next;
      Array.from(listeners).forEach(l => l(next));
    },
  };
}

export function useScreenActivity(): ScreenActivity {
  return useContext(ScreenActivityContext);
}

function useOnTransition(to: boolean, fn: () => void): void {
  const activity = useScreenActivity();
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(
    () =>
      activity.subscribe(active => {
        if (active === to) fnRef.current();
      }),
    [activity, to],
  );
}

/** Runs `fn` when the screen goes from visible to hidden (never on mount/unmount). */
export function useOnScreenHide(fn: () => void): void {
  useOnTransition(false, fn);
}

/** Runs `fn` when the screen goes from hidden to visible (never on mount). */
export function useOnScreenShow(fn: () => void): void {
  useOnTransition(true, fn);
}
