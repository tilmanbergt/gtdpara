/**
 * The Engage panel's state (docs/dev/history/technical-design-engage.md §3.3,
 * §3.7): `useReducer` over domain/engageFlow.ts, the `open` event and the
 * `dataChanged` event from the cache. Opening follows the note
 * (`decideOpening`, Addendum "Engage follows the note"): "Engage ›" > the
 * note page's todo (it becomes current, R3) > the note's owner > the stored
 * current todo's owner > none, with the way back to the stored todo.
 */
import {useEffect, useMemo, useReducer, useState} from 'react';
import {decideOpening, EngageOpening, EngageSource, resolveTodoKey, todoKeyOf} from '../../domain/engageOwner';
import {effectiveFocus, engageListsOf, optionsOf, ownersLeft} from '../../domain/engageOptions';
import {engageFlow, EngageRequest, EngageState, INITIAL_ENGAGE_STATE} from '../../domain/engageFlow';
import {GtdParaSettings, resolvePaths} from '../../domain/settings';
import {getCachedData, getCachedInbox, rebuildCache} from '../../storage/dataCache';
import {engageInboxOf, engageSourceOf} from '../../storage/engageAggregate';
import {getEngageCurrent, setEngageCurrent} from '../../storage/engageCurrent';
import {noteContextOf} from '../../storage/noteOwnerOf';
import {loadSettings} from '../../storage/settingsStorage';
import {getCurrentPageNum} from '../../supernote/currentPage';
import {getCurrentNotePath} from '../../supernote/fileSystem';
import {useCachedInbox} from '../../ui/useCachedInbox';
import {useCachedItems} from '../../ui/useCachedItems';
import {errorMessage} from '../../utils/errorMessage';
import {log, logError} from '../../utils/log';


async function resolveOpening(request: EngageRequest, source: EngageSource, settings: GtdParaSettings): Promise<EngageOpening> {
  const stored = await getEngageCurrent();
  const storedRef = stored ? resolveTodoKey(stored.key, source) : null;
  if (stored && !storedRef) await setEngageCurrent(null, null);
  const found = stored && storedRef ? {owner: stored.owner, key: todoKeyOf(storedRef)} : null;

  if (request.via === 'ownerPage') return decideOpening({pageOwner: request.owner, noteOwner: null, noteTodo: null, stored: found});
  const [path, page] = await Promise.all([getCurrentNotePath(), getCurrentPageNum()]);
  const context = await noteContextOf(path, page, source, resolvePaths(settings));
  // The todo the panel shows for the note's owner without a current one: its only #next.
  const shown = context.owner ? engageListsOf(optionsOf(context.owner, source, Date.now(), null), null).nowTodo : null;
  const opening = decideOpening({
    pageOwner: null,
    noteOwner: context.owner,
    noteTodo: context.todo,
    noteOwnerNext: shown ? todoKeyOf(shown) : null,
    stored: found,
  });
  if (opening.store) await setEngageCurrent(opening.store.owner, opening.store.key);
  return opening;
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
      const source = engageSourceOf(cache.items, engageInboxOf(cache.paths.inboxFolder, getCachedInbox()), loaded.noteSetups);
      const opening = await resolveOpening(request, source, loaded);
      if (cancelled) return;
      setSettings(loaded);
      dispatch({type: 'open', owner: opening.owner, current: opening.current, ring: effectiveFocus(source), back: opening.back});
      setOpened(true);
      log('EngageOverlay: opened', 'owner=' + (opening.owner?.kind ?? 'none'), 'via=' + request.via, 'current=' + (opening.current ? 'yes' : 'no'), 'back=' + (opening.back ? 'yes' : 'no'));
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
    return engageSourceOf(items, engageInboxOf(cache.paths.inboxFolder, inbox), settings.noteSetups);
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
