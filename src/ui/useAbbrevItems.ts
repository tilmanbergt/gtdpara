/**
 * The cached Projects/Areas, for code that only cares about their
 * abbreviation-relevant fields (kind, name, path, abbrev, status) -
 * ui/QuickAddWidget.tsx's abbreviation quick-file matching and tag
 * uppercasing.
 *
 * Unlike ui/useCachedItems.ts, the calling component re-renders only when
 * one of those fields changes somewhere, not on every cache change (task
 * edits, meeting saves, the background rebuild on every reopen)
 * (docs/dev/history/technical-design-render-perf-ab.md §7): through useCachedItems
 * the memoized QuickAddWidget would re-render twice per reopen, ~130 ms
 * each, for changes it never displays.
 *
 * Always returns the CURRENT cache items (read at render time), so a render
 * triggered by anything else still sees fresh data.
 */
import {useEffect, useRef, useState} from 'react';
import {CachedItem, getCachedData, subscribeCache} from '../storage/dataCache';
import {useScreenActivity} from './screenActivity';

const NO_ITEMS: CachedItem[] = [];

function signatureOf(items: CachedItem[] | undefined): string {
  if (!items) return '';
  return items.map(i => `${i.kind}|${i.path}|${i.name}|${i.abbrev ?? ''}|${i.status}`).join('\n');
}

export function useAbbrevItems(): CachedItem[] {
  const [, setTick] = useState(0);
  // Paused while a kept tab is hidden; checked once on show
  // (docs/dev/history/technical-design-keep-tabs-alive.md §5.1).
  const activity = useScreenActivity();
  const signatureRef = useRef<string | null>(null);
  const items = getCachedData()?.items;
  if (signatureRef.current === null) signatureRef.current = signatureOf(items);

  useEffect(() => {
    const check = () => {
      if (!activity.isActive()) return;
      const next = signatureOf(getCachedData()?.items);
      if (next !== signatureRef.current) {
        signatureRef.current = next;
        setTick(t => t + 1);
      }
    };
    // A change may have landed between render and subscription (effects run after paint).
    check();
    const unsubscribeCache = subscribeCache(check);
    const unsubscribeActivity = activity.subscribe(active => {
      if (active) check();
    });
    return () => {
      unsubscribeCache();
      unsubscribeActivity();
    };
  }, [activity]);

  return items ?? NO_ITEMS;
}
