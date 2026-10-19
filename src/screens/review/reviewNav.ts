/**
 * Opening a Review step from outside the Review screen
 * (docs/dev/history/technical-design-engage-in-context.md §2.10): a tiny
 * module store like ui/overviewStore.ts, so an overview row or the Engage
 * panel can ask for a step without props threaded through the app.
 *
 * - `requestReviewStep` leaves one request; App switches to the Review tab
 *   (screens/useReviewStepNav.ts) and ReviewScreen takes it once
 *   (`takeReviewStepRequest`) and enters the step through its own
 *   `enterStep`, so the visit's tally starts as usual.
 * - A request can carry a filter: the entry keys (`<item path>#<task index>`)
 *   of the todos to list, taken at request time (the frozen-list posture; a
 *   todo edited elsewhere in between simply drops out). Taking the request
 *   makes it the step's filter until the step is left or "Show all" clears it.
 */
import {useSyncExternalStore} from 'react';
import {ReviewStepId} from '../../domain/reviewSteps';

export interface ReviewStepFilter {
  /** Shown as "Only <label>". */
  label: string;
  /** Entry keys `<item path>#<task index>`. */
  keys: readonly string[];
}

export interface ReviewStepRequest {
  id: ReviewStepId;
  filter: ReviewStepFilter | null;
}

interface NavState {
  /** The request waiting to be taken, with a nonce so the same request twice is still news. */
  pending: (ReviewStepRequest & {nonce: number}) | null;
  /** The filter of the step entered from the last request. */
  active: ReviewStepRequest | null;
}

let state: NavState = {pending: null, active: null};
let nonce = 0;
const listeners = new Set<() => void>();

function set(next: NavState): void {
  state = next;
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The entry key of a todo, the one a filter lists. */
export function reviewEntryKey(entry: {item: {path: string}; taskIndex: number}): string {
  return `${entry.item.path}#${entry.taskIndex}`;
}

/** A filter naming `label` and listing `entries`. */
export function somedayFilterOf(label: string, entries: ReadonlyArray<{item: {path: string}; taskIndex: number}>): ReviewStepFilter {
  return {label, keys: entries.map(reviewEntryKey)};
}

/** Asks for step `id`, optionally filtered. */
export function requestReviewStep(id: ReviewStepId, filter: ReviewStepFilter | null): void {
  nonce += 1;
  set({...state, pending: {id, filter, nonce}});
}

/** The request waiting to be taken, or null; consumed by `takeReviewStepRequest`. */
export function takeReviewStepRequest(): ReviewStepRequest | null {
  const pending = state.pending;
  if (!pending) return null;
  set({pending: null, active: {id: pending.id, filter: pending.filter}});
  return {id: pending.id, filter: pending.filter};
}

/** Clears the step filter (leaving the step, "Show all"). */
export function clearReviewStepFilter(): void {
  if (state.active) set({...state, active: null});
}

function pendingNonce(): number {
  return state.pending?.nonce ?? 0;
}

function activeRequest(): ReviewStepRequest | null {
  return state.active;
}

/** The nonce of the waiting request (0 for none); re-renders when a request comes or is taken. */
export function useReviewStepRequestNonce(): number {
  return useSyncExternalStore(subscribe, pendingNonce);
}

/** The filter of step `id`, or null. */
export function useReviewStepFilter(id: ReviewStepId): ReviewStepFilter | null {
  const active = useSyncExternalStore(subscribe, activeRequest);
  return active && active.id === id ? active.filter : null;
}
