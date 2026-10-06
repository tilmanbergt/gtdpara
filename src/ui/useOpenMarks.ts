/**
 * Open marks in `scope`, live from the cache (the Inbox's and every
 * project's/area's `## Marks` lines) - for the "marks to process" cards.
 */
import {useMemo} from 'react';
import {collectOpenMarks, MarkScope, OpenMark} from '../domain/marks';
import {getCachedData} from '../storage/dataCache';
import {useCachedInbox} from './useCachedInbox';
import {useCachedItems} from './useCachedItems';

export function useOpenMarks(scope: MarkScope): OpenMark[] {
  const items = useCachedItems();
  const inbox = useCachedInbox();
  const scopeKey = scope.type === 'all' ? 'all' : scope.path;
  return useMemo(() => {
    const cache = getCachedData();
    if (!cache) {return [];}
    return collectOpenMarks(items, inbox, cache.paths.inboxFolder, scope);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, inbox, scopeKey]);
}
