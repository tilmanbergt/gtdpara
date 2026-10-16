/**
 * Opens the Engage panel from anywhere (docs/dev/history/technical-design-engage.md
 * §3.7): the sidebar button (App's listener) and "Engage ›" on the owner
 * pages. A tiny module store like ui/overviewStore.ts, so the owner pages
 * inside kept screens need no props for it. Every request bumps `nonce`; App
 * keys the panel on it, so each request opens a fresh panel.
 */
import {EngageRequest} from '../domain/engageFlow';
import {EngageOwner} from '../domain/engageOwner';

export interface EngageRequestState {
  request: EngageRequest;
  nonce: number;
}

let current: EngageRequestState = {request: {via: 'button'}, nonce: 0};
const listeners = new Set<() => void>();

export function requestEngage(request: EngageRequest): void {
  current = {request, nonce: current.nonce + 1};
  listeners.forEach(listener => listener());
}

/** "Engage ›" on a Project, Area, loop or thread page. */
export function engageOwner(owner: EngageOwner): void {
  requestEngage({via: 'ownerPage', owner});
}

export function getEngageRequest(): EngageRequestState {
  return current;
}

export function subscribeEngage(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
