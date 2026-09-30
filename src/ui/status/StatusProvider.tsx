/**
 * Central status slot - state + publishing hooks
 * (docs/dev/technical-design-status-slot.md §3/§4).
 *
 * Two contexts: `ApiContext` is stable (publishers never re-render because
 * of other messages), `ListContext` carries the sorted message list and is
 * read only by `StatusFrame`/`StatusSlot`.
 *
 * Publishing is declarative: `useStatus(id, msg | null)` - screens keep
 * their existing `error`/`armTarget` state and only stop rendering it
 * themselves. A message is re-published only when its visible content
 * changes; its callbacks always call the publisher's latest closures (via
 * a ref), so passing fresh inline functions every render is fine.
 */
import React, {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState} from 'react';
import {STATUS_PRIORITY, StatusMessage} from './types';
import {useScreenActivity} from '../screenActivity';

export interface StatusEntry {
  id: string;
  msg: StatusMessage;
  /** Publish order - newest wins within the same priority. */
  seq: number;
}

interface StatusApi {
  show: (id: string, msg: StatusMessage) => void;
  clear: (id: string) => void;
}

const ApiContext = createContext<StatusApi | null>(null);
const ListContext = createContext<StatusEntry[]>([]);

export function StatusProvider({children}: {children: React.ReactNode}): React.JSX.Element {
  const [entries, setEntries] = useState<Map<string, StatusEntry>>(() => new Map());
  const seqRef = useRef(0);

  const show = useCallback((id: string, msg: StatusMessage) => {
    seqRef.current += 1;
    const seq = seqRef.current;
    setEntries(prev => {
      const next = new Map(prev);
      next.set(id, {id, msg, seq});
      return next;
    });
  }, []);

  const clear = useCallback((id: string) => {
    setEntries(prev => {
      if (!prev.has(id)) return prev;
      const next = new Map(prev);
      next.delete(id);
      return next;
    });
  }, []);

  const api = useMemo(() => ({show, clear}), [show, clear]);

  const list = useMemo(
    () =>
      [...entries.values()].sort(
        (a, b) => STATUS_PRIORITY[a.msg.kind] - STATUS_PRIORITY[b.msg.kind] || b.seq - a.seq,
      ),
    [entries],
  );

  return (
    <ApiContext.Provider value={api}>
      <ListContext.Provider value={list}>{children}</ListContext.Provider>
    </ApiContext.Provider>
  );
}

/** The sorted message list (most important first). For the slot only. */
export function useStatusList(): StatusEntry[] {
  return useContext(ListContext);
}

/** Imperative escape hatch for one-shot or global messages (e.g. background failures, D13). No-op outside a provider. */
export function useStatusApi(): StatusApi {
  const api = useContext(ApiContext);
  return useMemo(() => api ?? {show: () => {}, clear: () => {}}, [api]);
}

/**
 * Publishes `msg` under `id` while it's non-null; clears it when it turns
 * null, and on unmount (unless `scope: 'global'`). `id` must be unique per
 * publisher instance - use `'<screen>.<purpose>'`, plus an instance suffix
 * for components that can be mounted more than once.
 *
 * Kept tabs (docs/dev/technical-design-keep-tabs-alive.md §4.2): while the
 * publisher's screen is hidden, its screen-scoped message is withdrawn and
 * held back (shown again if still set when the screen is shown). At the
 * moment the screen is hidden, the message's `onCancel` is called (every
 * armed pick publishes one - so picks end on leaving the tab, as they did
 * when the screen unmounted), otherwise its `onDismiss` (errors clear, as
 * before). Outside a kept tab the screen always counts as active.
 */
export function useStatus(id: string, msg: StatusMessage | null): void {
  const api = useContext(ApiContext);
  const activity = useScreenActivity();
  const msgRef = useRef(msg);
  msgRef.current = msg;

  const contentKey = msg
    ? JSON.stringify([
        msg.kind,
        msg.text,
        msg.detail ?? null,
        msg.scope ?? 'screen',
        (msg.actions ?? []).map(a => [a.label, !!a.primary]),
        !!msg.onDismiss,
        !!msg.onCancel,
      ])
    : null;

  // Publishes the current message (or clears it) - callbacks go through the
  // ref so they always run the latest closures. A screen-scoped message of a
  // hidden kept tab is held back.
  const publishRef = useRef<() => void>(() => {});
  publishRef.current = () => {
    if (!api) return;
    const current = msgRef.current;
    if (!current || (!activity.isActive() && current.scope !== 'global')) {
      api.clear(id);
      return;
    }
    api.show(id, {
      ...current,
      actions: current.actions?.map((a, i) => ({
        ...a,
        onPress: () => msgRef.current?.actions?.[i]?.onPress(),
      })),
      onDismiss: current.onDismiss ? () => msgRef.current?.onDismiss?.() : undefined,
      onCancel: current.onCancel ? () => msgRef.current?.onCancel?.() : undefined,
    });
  };

  useEffect(() => {
    publishRef.current();
  }, [api, id, contentKey]);

  // Kept tab hidden: withdraw, and end picks (onCancel) / dismiss errors
  // (onDismiss) as unmount did. Shown: re-publish whatever is still set.
  // Imperative on purpose - hiding a tab must not re-render its publishers.
  useEffect(
    () =>
      activity.subscribe(active => {
        const current = msgRef.current;
        if (!active && current && current.scope !== 'global') {
          if (current.onCancel) current.onCancel();
          else current.onDismiss?.();
        }
        publishRef.current();
      }),
    [activity],
  );

  // Unmount (or id change): drop screen-scoped messages.
  useEffect(
    () => () => {
      if (api && msgRef.current?.scope !== 'global') api.clear(id);
    },
    [api, id],
  );
}

let nextStatusInstance = 0;

/**
 * Shorthand for the most common case: an existing `error` string state
 * that used to render as an inline "⚠ …" line (docs/dev/technical-design-
 * status-slot.md §7.4). Publishes it as an 'error' with ✕ (= `onDismiss`,
 * normally `() => setError(null)`). `name` is made unique per component
 * instance, so the same component can be mounted more than once.
 */
export function useErrorStatus(name: string, error: string | null | undefined, onDismiss?: () => void): void {
  const id = useRef(`${name}.${++nextStatusInstance}`).current;
  useStatus(id, error ? {kind: 'error', text: error, onDismiss} : null);
}
