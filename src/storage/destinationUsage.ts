/**
 * Where capture saved to lately (docs/dev/technical-design-lasso-0.8.md
 * §3.9, checkpoint B): Project/Area paths, most recent first, for the short
 * "File to" list. Plugin-internal UI state per profile, like
 * storage/tagUsage.ts.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import {onActiveProfileChange, profileScopedKey} from './profileKeys';

const KEY = 'gtdpara:captureDestinations:v1';
const MAX = 12;

let lastKnown: string[] | null = null;

async function load(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(profileScopedKey(KEY));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((p): p is string => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

/** Moves `path` to the front (deduped, capped). Never throws. */
export async function recordDestinationUsed(path: string): Promise<void> {
  if (!path) return;
  try {
    const next = [path, ...(await load()).filter(p => p !== path)].slice(0, MAX);
    lastKnown = next;
    await AsyncStorage.setItem(profileScopedKey(KEY), JSON.stringify(next));
  } catch {
    // Only a convenience - the list just stays as it was.
  }
}

export async function getRecentDestinations(): Promise<string[]> {
  const all = await load();
  lastKnown = all;
  return all;
}

/** The last list read or written this session, or null. */
export function getRecentDestinationsSync(): string[] | null {
  return lastKnown;
}

onActiveProfileChange(() => {
  lastKnown = null;
});
