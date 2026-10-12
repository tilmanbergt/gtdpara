/**
 * The loop kinds of the current Tag Rules, readable without waiting
 * (docs/dev/history/technical-design-loops.md §3.1): Quick Add decides its
 * button label on every keystroke, and the loop conversion after a task save
 * (storage/loops.ts) runs outside any screen. Loaded from the settings once,
 * replaced when the Tag Rules are saved (`setLoopRules`) and reloaded on a
 * profile switch (`reloadLoopKinds`).
 */
import {loopKindsOf} from '../domain/loops';
import {TagRule} from '../domain/tagRules';
import {loadSettings} from './settingsStorage';

export interface LoopKindsState {
  kinds: string[];
  /** Each kind's Loop rule (the first enabled one). */
  rules: Record<string, TagRule>;
}

const EMPTY: LoopKindsState = {kinds: [], rules: {}};

let current: LoopKindsState = EMPTY;
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

function stateOf(rules: readonly TagRule[]): LoopKindsState {
  const kinds = loopKindsOf(rules);
  const byKind: Record<string, TagRule> = {};
  for (const kind of kinds) {
    const rule = rules.find(r => r.enabled && r.context === 'loop' && r.tags.some(t => t.replace(/^#/, '').toLowerCase() === kind));
    if (rule) byKind[kind] = rule;
  }
  return {kinds, rules: byKind};
}

/** Sets the kinds from a Tag Rules list (after a save in Settings). */
export function setLoopRules(rules: readonly TagRule[]): void {
  const next = stateOf(rules);
  if (JSON.stringify(next) === JSON.stringify(current)) return;
  current = next;
  listeners.forEach(listener => listener());
}

/** Reads the Tag Rules from the settings again (start, profile switch). */
export function reloadLoopKinds(): Promise<void> {
  loaded = loadSettings().then(settings => setLoopRules(settings.tagRules));
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
