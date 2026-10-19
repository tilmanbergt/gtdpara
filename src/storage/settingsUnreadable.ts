/**
 * Whether the stored settings could be read at the last load
 * (docs/dev/history/technical-design-quality-hardening.md §3.3). Set by
 * storage/settingsStorage.ts; while set, the app runs on DEFAULT_SETTINGS and
 * saveSettings refuses, so defaults never replace the stored settings unasked.
 */
let unreadable: string | null = null;
const listeners = new Set<() => void>();

/** Why the stored settings could not be read, or null when they could. */
export function getSettingsUnreadable(): string | null {
  return unreadable;
}

export function setSettingsUnreadable(reason: string | null): void {
  if (reason === unreadable) return;
  unreadable = reason;
  Array.from(listeners).forEach(listener => listener());
}

export function subscribeSettingsUnreadable(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
