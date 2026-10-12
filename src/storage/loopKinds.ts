/**
 * The loop kinds of the current Note setups, readable without waiting
 * (docs/dev/history/technical-design-loops.md §3.1): Quick Add decides its
 * button label on every keystroke, and the loop conversion after a task save
 * (storage/loops.ts) runs outside any screen. Loaded from the settings once,
 * replaced when the Note setups are saved (`setLoopSetups`) and reloaded on a
 * profile switch (`reloadLoopKinds`).
 */
import {loopKindsOf} from '../domain/loops';
import {NoteSetup} from '../domain/noteSetups';
import {loadSettings} from './settingsStorage';

export interface LoopKindsState {
  kinds: string[];
  /** Each kind's Loop setup (one tag belongs to one setup; the first enabled one if stored data says otherwise). */
  setups: Record<string, NoteSetup>;
}

const EMPTY: LoopKindsState = {kinds: [], setups: {}};

let current: LoopKindsState = EMPTY;
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

function stateOf(setups: readonly NoteSetup[]): LoopKindsState {
  const kinds = loopKindsOf(setups);
  const byKind: Record<string, NoteSetup> = {};
  for (const kind of kinds) {
    const setup = setups.find(s => s.enabled && s.kind === 'loop' && s.tags.some(t => t.replace(/^#/, '').toLowerCase() === kind));
    if (setup) byKind[kind] = setup;
  }
  return {kinds, setups: byKind};
}

/** Sets the kinds from the Note setups (after a save in Settings). */
export function setLoopSetups(setups: readonly NoteSetup[]): void {
  const next = stateOf(setups);
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  current = next;
  listeners.forEach(listener => listener());
}

/** Reads the Note setups from the settings again (start, profile switch). */
export function reloadLoopKinds(): Promise<void> {
  loaded = loadSettings().then(settings => setLoopSetups(settings.noteSetups));
  return loaded;
}

/** The kinds as known now; starts loading them on first use. */
export function getLoopKinds(): LoopKindsState {
  if (!loaded) reloadLoopKinds().catch(() => undefined);
  return current;
}

/** Resolves once the kinds were read at least once. */
export async function loopKindsReady(): Promise<LoopKindsState> {
  if (!loaded) reloadLoopKinds().catch(() => undefined);
  await loaded?.catch(() => undefined);
  return current;
}

export function subscribeLoopKinds(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
