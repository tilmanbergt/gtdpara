/**
 * The optional "Files" group of ui/FileBrowserPane.tsx
 * (docs/dev/history/technical-design-note-setups-finish.md §2): every root
 * shares one top tab, and a second, smaller row inside it picks the place.
 * Pure tab arithmetic, so it can be tested without rendering the pane.
 */

/** The key of the group's top tab (never a root's key). */
export const FILES_GROUP_KEY = '\u0000files';

interface Place {
  key: string;
  disabled?: boolean;
}

/**
 * The active top tab: the extra tab shown, else the group when the slot is
 * one of its places, else the slot itself (an extra tab's arming root).
 */
export function activeTopTab(activeExtraKey: string | null, slotKey: string, places: readonly Place[]): string {
  if (activeExtraKey) return activeExtraKey;
  return places.some(p => p.key === slotKey) ? FILES_GROUP_KEY : slotKey;
}

/** The group's top tab: greyed out only when every place in it is. */
export function groupTopTab(label: string, places: readonly Place[]): {key: string; label: string; disabled: boolean} {
  return {key: FILES_GROUP_KEY, label, disabled: places.length > 0 && places.every(p => p.disabled)};
}

/**
 * The place a tap on the group's top tab shows: the current one when it is
 * a place of the group, else the first one that can be picked (the page's
 * own files).
 */
export function groupEntryKey(currentKey: string | undefined, places: readonly Place[]): string | undefined {
  if (places.some(p => p.key === currentKey)) return currentKey;
  return (places.find(p => !p.disabled) ?? places[0])?.key;
}
