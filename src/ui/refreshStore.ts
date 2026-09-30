/**
 * The active screen's refresh action + "is refreshing" flag, for TabBar's
 * shared 🔄 icon (see ui/TabBar.tsx's module doc comment, "Shared refresh").
 *
 * Kept OUT of AppShell's React state on purpose (docs/dev/technical-design-
 * render-perf-ab.md §3 B1): every screen registers its handle and reports
 * its loading flag from mount effects, and when that was AppShell state,
 * each tab switch re-rendered the whole app shell - TabBar, the new screen
 * and all its panels - twice more (~300 ms per pass on the device). Now only
 * TabBar (via useRefreshState) re-renders when either changes.
 *
 * `registerRefresh`/`setRefreshing` are plain, stable module functions, so
 * App.tsx passes them straight through as the screens' existing
 * onRegisterRefresh/onRefreshingChange props - no screen needed changing.
 *
 * Per tab (2026-09-30, docs/dev/technical-design-keep-tabs-alive.md §3.4): with
 * tabs kept alive, several screens are mounted and registered at once, so
 * handles and flags are stored per tab and TabBar shows the ACTIVE tab's.
 * App.tsx hands each screen the stable functions from refreshHandlersFor().
 */
import {useEffect, useState} from 'react';
import type {RefreshHandle} from './TabBar';

const handles = new Map<string, RefreshHandle>();
const refreshingByTab = new Map<string, boolean>();
let activeTab = '';
const listeners = new Set<() => void>();

function notify(): void {
  Array.from(listeners).forEach(listener => listener());
}

export interface RefreshHandlers {
  register: (handle: RefreshHandle | null) => void;
  setRefreshing: (refreshing: boolean) => void;
}

const handlersCache = new Map<string, RefreshHandlers>();

/** Stable register/setRefreshing functions for one tab's screen (created once per tab). */
export function refreshHandlersFor(tab: string): RefreshHandlers {
  let h = handlersCache.get(tab);
  if (!h) {
    h = {
      register: handle => {
        if (handle) handles.set(tab, handle);
        else handles.delete(tab);
        if (tab === activeTab) notify();
      },
      setRefreshing: value => {
        if ((refreshingByTab.get(tab) ?? false) === value) return;
        refreshingByTab.set(tab, value);
        if (tab === activeTab) notify();
      },
    };
    handlersCache.set(tab, h);
  }
  return h;
}

/** Which tab's handle/flag TabBar shows - App.tsx sets it whenever the active tab changes. */
export function setActiveRefreshTab(tab: string): void {
  if (activeTab === tab) return;
  activeTab = tab;
  notify();
}

/** Runs the active tab's refresh action, if one is registered. */
export function runRefresh(): void {
  handles.get(activeTab)?.run();
}

export function useRefreshState(): {hasRefresh: boolean; refreshing: boolean} {
  const [, setTick] = useState(0);
  useEffect(() => {
    const listener = () => setTick(t => t + 1);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return {hasRefresh: handles.has(activeTab), refreshing: refreshingByTab.get(activeTab) ?? false};
}
