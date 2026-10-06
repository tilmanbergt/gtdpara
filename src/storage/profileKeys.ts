/**
 * The active profile id for storage that switches with a profile
 * (docs/dev/technical-design-profiles-demo-space.md §3.3): the recently-used
 * tags and the Google Calendar cache keep one AsyncStorage entry per profile.
 * The default profile keeps the original key, so nothing is migrated.
 * Set by App.tsx after settings load; stores listen to reset their
 * in-memory copies.
 */
import {DEFAULT_PROFILE_ID} from '../domain/profiles';

let activeId = DEFAULT_PROFILE_ID;
const listeners = new Set<() => void>();

export function setActiveProfileId(id: string): void {
  const next = id || DEFAULT_PROFILE_ID;
  if (next === activeId) {
    return;
  }
  activeId = next;
  Array.from(listeners).forEach(l => l());
}

/** `base` for the default profile, `base:<id>` for every other one. */
export function profileScopedKey(base: string): string {
  return activeId === DEFAULT_PROFILE_ID ? base : `${base}:${activeId}`;
}

export function onActiveProfileChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
