/**
 * Whether visited tabs are kept alive (hidden, not unmounted) - the
 * "Keep tabs in memory" switch (docs/dev/technical-design-keep-tabs-alive.md
 * §3.1). Default ON (decided 2026-09-30); the switch exists as a safety net
 * during the test phase. Set by App.tsx after loading settings and by the
 * Settings button; App subscribes, so a change applies immediately.
 */
import {useEffect, useState} from 'react';
import {DEFAULT_SETTINGS} from '../domain/settings';

let enabled = DEFAULT_SETTINGS.keepTabsAlive;
const listeners = new Set<() => void>();

export function setKeepTabsAlive(next: boolean): void {
  if (enabled === next) return;
  enabled = next;
  Array.from(listeners).forEach(l => l());
}

export function useKeepTabsAlive(): boolean {
  const [, setTick] = useState(0);
  useEffect(() => {
    const l = () => setTick(t => t + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return enabled;
}
