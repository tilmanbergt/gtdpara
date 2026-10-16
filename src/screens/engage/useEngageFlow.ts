/**
 * The Engage panel's state (docs/dev/history/technical-design-engage.md §3.3,
 * §3.7): `useReducer` over domain/engageFlow.ts, the `open` event and the
 * `dataChanged` event from the cache. Opening resolves the owner in the
 * order of R2: "Engage ›" on an owner page > the note's todo (it becomes
 * current, R3) > the stored current todo's owner > the note's owner > none.
 */
import {useEffect, useMemo, useReducer, useState} from 'react';
import {EngageOwner, EngageSource, EngageTodoKey, resolveTodoKey, sameOwner, todoKeyOf} from '../../domain/engageOwner';
import {effectiveFocus, engageListsOf, optionsOf, ownersLeft} from '../../domain/engageOptions';
import {engageFlow, EngageRequest, EngageState, INITIAL_ENGAGE_STATE} from '../../domain/engageFlow';
import {GtdParaSettings, resolvePaths} from '../../domain/settings';
import {getCachedData, rebuildCache} from '../../storage/dataCache';
import {engageSourceOf} from '../../storage/engageAggregate';
import {getEngageCurrent, setEngageCurrent} from '../../storage/engageCurrent';
import {noteContextOf} from '../../storage/noteOwnerOf';
import {loadSettings} from '../../storage/settingsStorage';
import {getCurrentPageNum} from '../../supernote/currentPage';
import {getCurrentNotePath} from '../../supernote/fileSystem';
import {useCachedInbox} from '../../ui/useCachedInbox';
import {useCachedItems} from '../../ui/useCachedItems';
import {errorMessage} from '../../utils/errorMessage';
import {log, logError} from '../../utils/log';


interface Opening {
  owner: EngageOwner | null;
  current: EngageTodoKey | null;
}

async function resolveOpening(request: EngageRequest, source: EngageSource, settings: GtdParaSettings): Promise<Opening> {
  const stored = await getEngageCurrent();
  const storedRef = stored ? resolveTodoKey(stored.key, source) : null;
  if (stored && !storedRef) await setEngageCurrent(null, null);
  const storedOpening = stored && storedRef ? {owner: stored.owner, current: todoKeyOf(storedRef)} : null;

  if (request.via === 'ownerPage') {
    const keep = storedOpening && sameOwner(storedOpening.owner, request.owner);
    return {owner: request.owner, current: keep ? storedOpening.current : null};
  }
  const [path, page] = await Promise.all([getCurrentNotePath(), getCurrentPageNum()]);
  const context = await noteContextOf(path, page, source, resolvePaths(settings));
  if (context.owner && context.todo) {
    await setEngageCurrent(context.owner, context.todo);
    return {owner: context.owner, current: context.todo};
  }
  return storedOpening ?? {owner: context.owner, current: null};
}

export interface EngageFlow {
  state: EngageState;
  dispatch: React.Dispatch<Parameters<typeof engageFlow>[1]>;
  /** Null until the cache, the settings and the opening are known. */
  source: EngageSource | null;
}

export function useEngageFlow(request: EngageRequest): EngageFlow {
  const [state, dispatch] = useReducer(engageFlow, INITIAL_ENGAGE_STATE);
  const [settings, setSettings] = useState<GtdParaSettings | null>(null);
  const [opened, setOpened] = useState(false);
  const items = useCachedItems();
  const inbox = useCachedInbox();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const loaded = await loadSettings();
      // A cold start through the Engage button skips reorient()'s refresh: build the cache when there is none.
      const cache = getCachedData() ?? (await rebuildCache(loaded));
      const source = engageSourceOf(cache.items, cache.paths.inboxFolder, loaded.noteSetups);
      const opening = await resolveOpening(request, source, loaded);
      if (cancelled) return;
      setSettings(loaded);
      dispatch({type: 'open', owner: opening.owner, current: opening.current, ring: effectiveFocus(source)});
      setOpened(true);
      log('EngageOverlay: opened', 'owner=' + (opening.owner?.kind ?? 'none'), 'via=' + request.via, 'current=' + (opening.current ? 'yes' : 'no'));
    })().catch(e => {
      logError('EngageOverlay: opening failed', errorMessage(e));
      if (!cancelled) setOpened(true);
    });
    return () => {
      cancelled = true;
    };
    // Opened once per mount; App remounts the panel for every request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const source = useMemo(() => {
    const cache = getCachedData();
    if (!opened || !settings || !cache) return null;
    return engageSourceOf(items, cache.paths.inboxFolder, settings.noteSetups);
    // `inbox` is a dependency so a Quick Add to the Inbox refreshes too.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened, settings, items, inbox]);

  const {owner, current} = state;
  useEffect(() => {
    if (!source) return;
    const nowMs = Date.now();
    const currentRef = current ? resolveTodoKey(current, source) : null;
    const currentKey = currentRef ? todoKeyOf(currentRef) : null;
    if (current && !currentRef) setEngageCurrent(null, null).catch(e => logError('EngageOverlay: forgetting the current todo failed', errorMessage(e)));
    const options = owner ? optionsOf(owner, source, nowMs, currentKey) : null;
    dispatch({
      type: 'dataChanged',
      options,
      ring: effectiveFocus(source),
      dailyLeft: ownersLeft('daily', source, nowMs),
      current: currentKey,
      nextRows: options ? engageListsOf(options, currentRef).next.length : 0,
    });
  }, [source, owner, current]);

  return {state, dispatch, source};
}
