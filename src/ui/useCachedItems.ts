/**
 * Subscribes a screen to storage/dataCache.ts and returns the cached
 * Projects/Areas (docs/dev/technical-design-cache-subscription-and-shared-add-
 * path.md §A).
 *
 * Why this exists: every write-through helper in dataCache.ts (`updateItem
 * Meetings`, `ensureItemCached`'s push, ...) mutates the cache IN PLACE, so
 * `setItems(cache.items)` would hand React the very same array it already
 * holds - a no-op state update, no re-render (e.g. Week view would not show
 * a meeting filed to a Project/Area). The cache announces every change
 * (`subscribeCache`) and this hook (a) re-renders the calling component and
 * (b) returns a NEW array identity per change, so `useEffect`/`useCallback`
 * dependency arrays keyed on `items` stay honest even though the item
 * objects themselves are still mutated in place.
 *
 * Plain useState tick + useEffect rather than `useSyncExternalStore`, so it
 * does not depend on which React version the plugin host ships.
 *
 * Returns `[]` (a stable empty array) while no cache exists yet - screens
 * run their own `load()` for the first build.
 */
import {useEffect, useMemo, useRef, useState} from 'react';
import {CachedItem, getCacheVersion, getCachedData, subscribeCache} from '../storage/dataCache';
import {useScreenActivity} from './screenActivity';

const NO_ITEMS: CachedItem[] = [];

export function useCachedItems(): CachedItem[] {
  const [, setTick] = useState(0);
  const version = getCacheVersion();
  const cache = getCachedData();
  // Kept tabs (docs/dev/technical-design-keep-tabs-alive.md §5.1): while this
  // component's tab is hidden, cache changes don't re-render it; when it is
  // shown again it re-renders once, and only if the cache changed meanwhile.
  const activity = useScreenActivity();
  const renderedVersionRef = useRef(version);
  renderedVersionRef.current = version;

  useEffect(() => {
    // A mutation may have landed between this render and the subscription
    // below going live (effects run after paint) - catch up once.
    if (getCacheVersion() !== version) setTick(t => t + 1);
    const unsubscribeCache = subscribeCache(() => {
      if (activity.isActive()) setTick(t => t + 1);
    });
    const unsubscribeActivity = activity.subscribe(active => {
      if (active && getCacheVersion() !== renderedVersionRef.current) setTick(t => t + 1);
    });
    return () => {
      unsubscribeCache();
      unsubscribeActivity();
    };
    // Subscribe once per mount; `version` is only read for the catch-up check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- version: the cache object is updated in place
  return useMemo(() => (cache ? cache.items.slice() : NO_ITEMS), [cache, version]);
}
