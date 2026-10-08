/**
 * The one write path for counterpart status lines
 * (docs/dev/history/technical-design-tending-threads.md §3.9.1): every
 * "Tend", "Not" and "Set inactive" goes through `setCounterpartStatus`, which
 * writes the `## Threads` section of the scope's owner file (decision D16:
 * `area.txt` for an Area and its Projects, `project.txt` for a Project
 * without an Area) and then the cache (write-through). The Inbox has no
 * section (decision D18).
 */
import {scopeOwnerOf} from '../domain/counterparts';
import {CounterpartStatus, withCounterpartStatus} from '../domain/threadsSection';
import {log, logError} from '../utils/log';
import {errorMessage} from '../utils/errorMessage';
import {findCachedItem, getCachedData, updateItemThreads} from './dataCache';
import {saveThreads} from './projectFile';

/**
 * Sets `leaf` to `status` in the scope `itemPath` belongs to (any item of the
 * scope; the owner's file is written). Resolves to the owner's path. Throws
 * when `itemPath` is not a cached Project or Area.
 */
export async function setCounterpartStatus(itemPath: string, leaf: string, status: CounterpartStatus): Promise<string> {
  const items = getCachedData()?.items ?? [];
  const owner = scopeOwnerOf(itemPath, items);
  const item = owner ? findCachedItem(owner.path) : undefined;
  if (!item) throw new Error('That Project or Area is not loaded - Settings → Advanced → Reload all files.');
  if (item.loadError) throw new Error(item.loadError);
  const threads = withCounterpartStatus(item.threads, leaf, status);
  try {
    const next = await saveThreads(item.kind, item.path, item.rawContent, threads, item.threadsExtraLines);
    updateItemThreads(item.path, next, threads, item.threadsExtraLines);
  } catch (e) {
    logError('counterparts: status write failed', item.kind, status, errorMessage(e));
    throw e;
  }
  log('counterparts: status written', item.kind, status);
  return item.path;
}
