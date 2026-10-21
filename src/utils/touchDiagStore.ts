/**
 * The touch test's state (Settings → Advanced → Touch test) - a tiny module
 * store like ui/overviewStore.ts, so the probed rows can report press events
 * without props threaded through them, and the app-wide switch reaches
 * App.tsx's root observer. In utils/ so the debug bundle can read it too.
 *
 * Nothing here is persisted: the session's touches stay until Clear or the
 * plugin closes, and "Log touches everywhere" is off after every restart.
 */
import {useSyncExternalStore} from 'react';
import {OutcomeKind, RawTouch, TouchEntry, TouchOutcome} from '../domain/touchDiag';

// Long enough for every outcome a pending touch still needs; older ones are dropped.
const OUTCOME_KEEP_MS = 5000;
const RAW_KEEP = 20;

let outcomes: TouchOutcome[] = [];
let recentTouches: RawTouch[] = [];
let entries: TouchEntry[] = [];
let nextId = 1;
let appWide = false;
let testViewOpen = false;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach(listener => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A test row's press event (ui/touchDiag/touchProbe.ts). */
export function reportOutcome(kind: OutcomeKind, target: string, inert = false): void {
  const at = Date.now();
  outcomes = [...outcomes.filter(o => o.at > at - OUTCOME_KEEP_MS), {kind, target, inert, at}];
}

export function getOutcomes(): readonly TouchOutcome[] {
  return outcomes;
}

/** Touch ids count up over the whole session, so a Clear never reuses one. */
export function nextTouchId(): number {
  return nextId++;
}

/** A finished raw touch, kept briefly so overlapping quick taps can share out their outcomes. */
export function rememberTouch(touch: RawTouch): void {
  recentTouches = [...recentTouches, touch].slice(-RAW_KEEP);
}

export function getRecentTouches(): readonly RawTouch[] {
  return recentTouches;
}

export function addTouchEntry(entry: TouchEntry): void {
  entries = [...entries, entry];
  emit();
}

export function clearTouchEntries(): void {
  entries = [];
  outcomes = [];
  recentTouches = [];
  emit();
}

export function getTouchEntries(): readonly TouchEntry[] {
  return entries;
}

export function useTouchEntries(): readonly TouchEntry[] {
  return useSyncExternalStore(subscribe, getTouchEntries);
}

export function setAppWideTouchLog(on: boolean): void {
  if (on === appWide) return;
  appWide = on;
  emit();
}

export function isAppWideTouchLog(): boolean {
  return appWide;
}

export function useAppWideTouchLog(): boolean {
  return useSyncExternalStore(subscribe, () => appWide);
}

/** While the test view is open it logs its own touches; the app-wide observer stays quiet. */
export function setTouchTestOpen(open: boolean): void {
  if (open === testViewOpen) return;
  testViewOpen = open;
  emit();
}

export function useTouchTestOpen(): boolean {
  return useSyncExternalStore(subscribe, () => testViewOpen);
}
