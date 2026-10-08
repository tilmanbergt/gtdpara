/**
 * Which thread overview is open, if any
 * (docs/dev/history/technical-design-tending-threads.md §3.5.1) - a tiny module
 * store, so a tag or label in any row can open the overview without props
 * threaded through every list. screens/useAppOverlays.tsx draws it over the tab
 * body and closes it on a tab tap, on Back, or when the help opens.
 */
import {useSyncExternalStore} from 'react';
import {ThreadLens} from '../domain/threads';

export interface ThreadOverviewRequest {
  /** The tapped tag (a nested tag, `type/counterpart[/…]`). */
  tag: string;
  /** The item of the row the tag was tapped in (the Inbox folder for Inbox rows); null when unknown. */
  ownerPath: string | null;
  lens: ThreadLens;
}

let current: ThreadOverviewRequest | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach(listener => listener());
}

export function openThreadOverview(request: {tag: string; ownerPath?: string | null; lens?: ThreadLens}): void {
  current = {tag: request.tag.toLowerCase(), ownerPath: request.ownerPath ?? null, lens: request.lens ?? 'thread'};
  emit();
}

export function closeThreadOverview(): void {
  if (current === null) return;
  current = null;
  emit();
}

export function getThreadOverview(): ThreadOverviewRequest | null {
  return current;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The open request, or null; re-renders on every open and close. */
export function useThreadOverview(): ThreadOverviewRequest | null {
  return useSyncExternalStore(subscribe, getThreadOverview);
}
