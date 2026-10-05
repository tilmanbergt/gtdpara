/**
 * The "File to" choices of the capture panel (checkpoint B of
 * docs/dev/technical-design-lasso-0.8.md §3.9): a short list instead of
 * every Project and Area - Inbox, the mark's or lasso's own place, the
 * one chosen right now, the focused items (daily, weekly, monthly) and the
 * places capture saved to lately - and the full alphabetical list behind
 * "More…". Only Active items are offered (technical-design-status-archive.md §6).
 */
import {Destination, isFocused} from './destination';
import {ItemStatus} from './types';

export interface FileToItem {
  kind: 'project' | 'area';
  name: string;
  path: string;
  abbrev: string | null;
  status: ItemStatus;
  dailyFocus: boolean;
  weeklyFocus: boolean;
  monthlyFocus: boolean;
}

/** Chips in the short list, Inbox included (about two rows). */
export const FILE_TO_SHORT = 9;

export function fileToEligible<T extends FileToItem>(items: T[]): T[] {
  return items.filter(item => item.status === 'active').sort((a, b) => a.name.localeCompare(b.name));
}

function focusRank(item: FileToItem): number {
  if (item.dailyFocus) return 0;
  if (item.weeklyFocus) return 1;
  return item.monthlyFocus ? 2 : 3;
}

/**
 * The short list (without Inbox, which always comes first): own place,
 * current choice, focused items, recent places - no duplicates, at most
 * `limit` items. `recentPaths` most recent first.
 */
export function fileToShortList<T extends FileToItem>(
  items: T[],
  own: Destination | null,
  current: Destination,
  recentPaths: string[],
  limit = FILE_TO_SHORT - 1,
): T[] {
  const eligible = fileToEligible(items);
  const byPath = new Map(eligible.map(item => [item.path, item]));
  const out: T[] = [];
  const add = (path: string | undefined) => {
    const item = path ? byPath.get(path) : undefined;
    if (item && !out.includes(item)) out.push(item);
  };
  add(own?.type === 'item' ? own.path : undefined);
  add(current.type === 'item' ? current.path : undefined);
  eligible
    .filter(isFocused)
    .sort((a, b) => focusRank(a) - focusRank(b))
    .forEach(item => add(item.path));
  recentPaths.forEach(add);
  // The own place and the current choice always stay, even past the limit.
  const keep = out.filter(
    item => (own?.type === 'item' && own.path === item.path) || (current.type === 'item' && current.path === item.path),
  );
  const rest = out.filter(item => !keep.includes(item));
  return [...keep, ...rest.slice(0, Math.max(0, limit - keep.length))];
}

/** "#ABBR Name", or the name alone without an abbreviation. */
export function fileToLabel(item: Pick<FileToItem, 'abbrev' | 'name'>): string {
  return item.abbrev ? `#${item.abbrev.toUpperCase()} ${item.name}` : item.name;
}
