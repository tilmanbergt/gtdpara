/**
 * Which overview is open, if any: a thread's
 * (docs/dev/history/technical-design-tending-threads.md §3.5.1) or a loop's
 * (docs/dev/history/technical-design-loops.md §4.5) - a tiny module store,
 * so a tag or label in any row can open it without props threaded through
 * every list. screens/useAppOverlays.tsx draws it over the tab body and
 * closes it on a tab tap, on Back, or when the help opens.
 *
 * Which of the two a request opens is decided where it is drawn
 * (screens/useAppOverlays.tsx): a loop tag in a Project or Area opens its
 * loop, everything else the thread overview. This store stays free of
 * storage, so every row can import it.
 */
import {useSyncExternalStore} from 'react';
import {isCounterpartType, threadOf, ThreadLens} from '../domain/threads';

export interface OverviewRequest {
  /** The tapped tag (a nested tag, `type/counterpart[/…]`). */
  tag: string;
  /** The item of the row the tag was tapped in (the Inbox folder for Inbox rows); null when unknown. */
  ownerPath: string | null;
  /** The thread overview's lens; a loop overview has none. */
  lens: ThreadLens;
}

let current: OverviewRequest | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach(listener => listener());
}

/**
 * Opens the overview of `tag`. `wf/<name>` and `owe/<name>` name a
 * counterpart, not a thread (decision D13), so they always open the
 * counterpart lens; other tags the requested lens, the thread lens by default.
 */
export function openOverview(request: {tag: string; ownerPath?: string | null; lens?: ThreadLens}): void {
  const tag = request.tag.toLowerCase();
  const thread = threadOf(tag);
  const lens = thread && isCounterpartType(thread.type) ? 'counterpart' : request.lens ?? 'thread';
  current = {tag, ownerPath: request.ownerPath ?? null, lens};
  emit();
}

export function closeOverview(): void {
  if (current === null) return;
  current = null;
  emit();
}

export function getOverview(): OverviewRequest | null {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The open request, or null; re-renders on every open and close. */
export function useOverview(): OverviewRequest | null {
  return useSyncExternalStore(subscribe, getOverview);
}
