/**
 * "Link file" from the loop overview (docs/dev/history/technical-design-loops.md
 * §4.7): the overview closes, App opens the loop's Area or Project, and its
 * page arms the Files pane for the loop - the same pick as the clip on the
 * loop's row there. A tiny module store carries the request across, like
 * ui/overviewStore.ts.
 */
import {useSyncExternalStore} from 'react';

export interface LoopLinkRequest {
  ownerPath: string;
  tag: string;
}

let current: LoopLinkRequest | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach(listener => listener());
}

export function requestLoopLink(request: LoopLinkRequest): void {
  current = request;
  emit();
}

/** Takes the request (the page that arms for it). */
export function takeLoopLink(): LoopLinkRequest | null {
  const request = current;
  if (request) {
    current = null;
    emit();
  }
  return request;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLoopLinkRequest(): LoopLinkRequest | null {
  return useSyncExternalStore(subscribe, () => current);
}
