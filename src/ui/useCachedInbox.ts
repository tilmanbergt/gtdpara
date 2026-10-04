/**
 * The shared Inbox state from storage/dataCache.ts (docs/dev/technical-design-files-0.6.md
 * §3.3) - Daily, Week/Month, Inbox and Review read the Inbox through this
 * hook and write it with dataCache's `setCachedInbox`, so a change made on one
 * screen is on every other one, and the reopen check (refreshCache) updates
 * them all. Same pattern as ui/useCachedItems.ts: a kept tab that is hidden
 * doesn't re-render on changes; it re-renders once when shown again, and only
 * if the Inbox changed meanwhile.
 */
import {useEffect, useRef, useState} from 'react';
import {getCachedInbox, getInboxVersion, subscribeInbox} from '../storage/dataCache';
import {ProjectFileState} from '../storage/projectFile';
import {useScreenActivity} from './screenActivity';

export function useCachedInbox(): ProjectFileState | null {
  const [, setTick] = useState(0);
  const version = getInboxVersion();
  const activity = useScreenActivity();
  const renderedVersionRef = useRef(version);
  renderedVersionRef.current = version;

  useEffect(() => {
    if (getInboxVersion() !== version) setTick(t => t + 1);
    const unsubscribeInbox = subscribeInbox(() => {
      if (activity.isActive()) setTick(t => t + 1);
    });
    const unsubscribeActivity = activity.subscribe(active => {
      if (active && getInboxVersion() !== renderedVersionRef.current) setTick(t => t + 1);
    });
    return () => {
      unsubscribeInbox();
      unsubscribeActivity();
    };
    // Subscribe once per mount; `version` is only read for the catch-up check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity]);

  return getCachedInbox();
}
