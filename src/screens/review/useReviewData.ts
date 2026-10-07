/**
 * What every Review step reads: settings, the live item cache, the shared
 * Inbox, resolved paths, and the review aggregate.
 *
 * `items` is live (ui/useCachedItems.ts). The aggregate is a snapshot that
 * only `load` and `refreshFromCache` rebuild, so a step's lists don't change
 * under the user while they work through it.
 */
import {useCallback, useEffect, useState} from 'react';
import {GtdParaSettings, ResolvedParaPaths} from '../../domain/settings';
import {CachedItem, getCachedData, rebuildCache, setCachedInbox} from '../../storage/dataCache';
import {loadProjectFile, ProjectFileState} from '../../storage/projectFile';
import {buildReviewAggregate, ReviewAggregate} from '../../storage/reviewAggregate';
import {loadSettings} from '../../storage/settingsStorage';
import {useCachedInbox} from '../../ui/useCachedInbox';
import {useCachedItems} from '../../ui/useCachedItems';
import {errorMessage} from '../../utils/errorMessage';
import {logError} from '../../utils/log';
import {requestEinkRefresh, useEinkRefreshOnLoad} from '../../utils/screenRefresh';

export interface ReviewData {
  items: CachedItem[];
  settings: GtdParaSettings | null;
  setSettings: (settings: GtdParaSettings) => void;
  aggregate: ReviewAggregate | null;
  inbox: ProjectFileState | null;
  inboxPath: string | null;
  paths: ResolvedParaPaths | null;
  loading: boolean;
  error: string | null;
  /** Loads settings and the aggregate; `forceRebuild` re-reads every file first. */
  load: (forceRebuild: boolean) => Promise<void>;
  /** Rebuilds the aggregate from the warm cache after a change. */
  refreshFromCache: () => void;
}

export function useReviewData(): ReviewData {
  const items = useCachedItems();
  const inbox = useCachedInbox();
  const [settings, setSettings] = useState<GtdParaSettings | null>(null);
  const [aggregate, setAggregate] = useState<ReviewAggregate | null>(null);
  const [inboxPath, setInboxPath] = useState<string | null>(null);
  const [paths, setPaths] = useState<ResolvedParaPaths | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEinkRefreshOnLoad(loading);

  const load = useCallback(async (forceRebuild: boolean) => {
    setLoading(true);
    // The spinner needs its own refresh: rebuildCache is slow enough that the
    // e-ink panel would otherwise keep showing the previous screen.
    requestEinkRefresh();
    setError(null);
    try {
      const loadedSettings = await loadSettings();
      setSettings(loadedSettings);
      let cache = getCachedData();
      if (!cache || forceRebuild) cache = await rebuildCache(loadedSettings);
      setAggregate(buildReviewAggregate(cache.items, new Date(), loadedSettings.tagRules));
      setInboxPath(cache.paths.inboxFolder);
      setPaths(cache.paths);
      setCachedInbox(await loadProjectFile('inbox', cache.paths.inboxFolder));
    } catch (e) {
      const message = errorMessage(e);
      logError('ReviewScreen: load failed', message);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  const tagRules = settings?.tagRules;
  const refreshFromCache = useCallback(() => {
    const cache = getCachedData();
    if (cache) setAggregate(buildReviewAggregate(cache.items, new Date(), tagRules));
  }, [tagRules]);

  return {items, settings, setSettings, aggregate, inbox, inboxPath, paths, loading, error, load, refreshFromCache};
}
