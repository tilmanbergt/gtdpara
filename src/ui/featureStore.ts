/**
 * The experimental switches as app-wide state
 * (docs/dev/history/technical-design-about-debug-experimental.md §3.2). Set by
 * App.tsx after loading settings and by Settings → Advanced when a switch is
 * tapped; screens read it with useFeatures(), so kept-alive tabs pick up a
 * change immediately without reloading their own settings copy. Same
 * pattern as ui/keepAliveStore.ts.
 */
import {useEffect, useState} from 'react';
import {Features, NO_EXPERIMENTAL_FEATURES} from '../domain/features';

let current: Features = NO_EXPERIMENTAL_FEATURES;
const listeners = new Set<() => void>();

export function setFeatures(next: Features): void {
  if (current.googleCalendar === next.googleCalendar && current.gmail === next.gmail) {return;}
  current = {...next};
  Array.from(listeners).forEach(l => l());
}

export function useFeatures(): Features {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick(t => t + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return current;
}

/**
 * Drops the tab `hiddenKey` from a MiniTabs list when `visible` is false,
 * and maps an active key that points at it to the first remaining tab - so a
 * screen whose remembered tab was just hidden simply shows its first tab.
 */
export function visibleTabs<K extends string, T extends {key: K}>(
  tabs: T[],
  activeKey: K,
  hiddenKey: K,
  visible: boolean,
): {tabs: T[]; activeKey: K} {
  if (visible) {return {tabs, activeKey};}
  const remaining = tabs.filter(t => t.key !== hiddenKey);
  return {tabs: remaining, activeKey: activeKey === hiddenKey && remaining.length > 0 ? remaining[0].key : activeKey};
}
