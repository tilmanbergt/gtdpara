/**
 * What the Threads tab (ThreadsTab.tsx) and Review's "Tending threads" step
 * share (docs/dev/history/technical-design-tending-threads.md §3.9.4, §3.10):
 * the cache, the shared Inbox in the aggregates' shape, the rule types that
 * make counterparts (decision D2), and the "Tend" / "Not" actions.
 *
 * "Not" on a new counterpart writes `inactive`; on one that is back in use
 * (decision D20) it is inactive already, so it only hides that offer for the
 * rest of the session (`dismissBackInUse`, memory only): without a date in
 * the status line nothing in the file can tell this meeting from a later
 * one.
 */
import {useCallback, useEffect, useMemo, useState} from 'react';
import {ruleTypesOf} from '../../domain/counterparts';
import {CounterpartStatus} from '../../domain/threadsSection';
import {setCounterpartStatus} from '../../storage/counterparts';
import {CachedItem, getCachedData} from '../../storage/dataCache';
import {loadSettings} from '../../storage/settingsStorage';
import {RosterEntry} from '../../storage/tendingRoster';
import {ThreadInboxInput} from '../../storage/threadAggregate';
import {useActionError} from '../../ui/useActionError';
import {useCachedInbox} from '../../ui/useCachedInbox';
import {useCachedItems} from '../../ui/useCachedItems';
import {requestEinkRefresh} from '../../utils/screenRefresh';

const dismissed = new Set<string>();
const dismissKey = (ownerPath: string, leaf: string) => `${ownerPath}|${leaf}`;

/** Hides the "back in use" offer of `leaf` in the scope of `ownerPath` for this session. */
export function dismissBackInUse(ownerPath: string, leaf: string): void {
  dismissed.add(dismissKey(ownerPath, leaf));
}

/** Whether a roster entry still asks to be confirmed: new, or back in use and not dismissed this session. */
export function needsConfirm(entry: RosterEntry): boolean {
  if (entry.counterpart.status === 'new') return true;
  return entry.counterpart.backInUse && !dismissed.has(dismissKey(entry.owner.path, entry.counterpart.leaf));
}

export interface TendingData {
  items: CachedItem[];
  inbox: ThreadInboxInput | null;
  ruleTypes: string[];
  /** Whether the Tag Rules have loaded (the rule types are only `wf`/`owe` until then). */
  ready: boolean;
}

export function useTendingData(): TendingData {
  const items = useCachedItems();
  const inboxState = useCachedInbox();
  const inboxPath = getCachedData()?.paths.inboxFolder ?? null;
  const inbox = useMemo(
    () => (inboxState && inboxPath ? {path: inboxPath, tasks: inboxState.tasks, meetings: inboxState.meetings} : null),
    [inboxState, inboxPath],
  );
  const [ruleTypes, setRuleTypes] = useState<string[]>(() => ruleTypesOf([]));
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    loadSettings().then(s => {
      if (cancelled) return;
      setRuleTypes(ruleTypesOf(s.tagRules));
      setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return {items, inbox, ruleTypes, ready};
}

export interface TendActions {
  /** Writes `active` (Tend) or, for a new counterpart, `inactive` (Not). */
  confirm: (entry: RosterEntry, tend: boolean) => Promise<void>;
  /** Writes a status directly (Tend on an inactive row, after a close-out). */
  setStatus: (entry: RosterEntry, status: CounterpartStatus) => Promise<void>;
}

/** Tend / Not, with failures in the status slot under `statusName`. `onChanged` runs after a confirm (recap counts). */
export function useTendActions(statusName: string, onChanged?: (entry: RosterEntry, status: CounterpartStatus | 'dismissed') => void): TendActions {
  const action = useActionError(statusName, 'Tending: status write failed');
  const [, setTick] = useState(0);
  const setStatus = useCallback(
    (entry: RosterEntry, status: CounterpartStatus) =>
      action.run(async () => {
        await setCounterpartStatus(entry.owner.path, entry.counterpart.leaf, status);
        onChanged?.(entry, status);
        requestEinkRefresh();
      }),
    [action, onChanged],
  );
  const confirm = useCallback(
    async (entry: RosterEntry, tend: boolean) => {
      if (tend) return setStatus(entry, 'active');
      if (entry.counterpart.status === 'inactive') {
        dismissBackInUse(entry.owner.path, entry.counterpart.leaf);
        onChanged?.(entry, 'dismissed');
        setTick(t => t + 1);
        requestEinkRefresh();
        return;
      }
      return setStatus(entry, 'inactive');
    },
    [setStatus, onChanged],
  );
  return useMemo(() => ({confirm, setStatus}), [confirm, setStatus]);
}
