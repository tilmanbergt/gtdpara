/**
 * The "File to" chips of the capture panel (docs/dev/history/technical-design-lasso-0.8.md
 * §3.9): the short list (Inbox, own place, current choice, focused, recent)
 * with More…, or every Active Project/Area alphabetically, `pageSize` per
 * page, behind ‹ Short list. A pick from the full list goes back to the
 * short list, which always shows the current choice.
 */
import {fileToEligible, fileToLabel, fileToShortList} from '../../domain/captureFileTo';
import {Destination} from '../../domain/destination';
import {CachedItem} from '../../storage/dataCache';
import {GridChip} from '../TagChipGrid';

interface Input {
  items: CachedItem[];
  own: Destination | null;
  current: Destination;
  recent: string[];
  showAll: boolean;
  page: number;
  pageSize: number;
  onPick: (destination: Destination) => void;
  setShowAll: (showAll: boolean) => void;
  setPage: (page: number) => void;
}

export function buildFileToChips({items, own, current, recent, showAll, page, pageSize, onPick, setShowAll, setPage}: Input): GridChip[] {
  const chipOf = (item: {kind: 'project' | 'area'; name: string; path: string; abbrev: string | null}): GridChip => ({
    key: item.path,
    label: fileToLabel(item),
    on: current.type === 'item' && current.path === item.path,
    onPress: () => onPick({type: 'item', kind: item.kind, name: item.name, path: item.path}),
  });
  if (!showAll) {
    const short = fileToShortList(items, own, current, recent);
    const chips: GridChip[] = [
      {key: 'inbox', label: 'Inbox', on: current.type === 'inbox', onPress: () => onPick({type: 'inbox'})},
      ...short.map(chipOf),
    ];
    if (fileToEligible(items).length > short.length) {
      chips.push({key: 'more', label: 'More…', on: false, onPress: () => setShowAll(true)});
    }
    return chips;
  }
  const all = fileToEligible(items);
  const pages = Math.max(1, Math.ceil(all.length / pageSize));
  const shown = Math.min(page, pages - 1);
  const chips: GridChip[] = [
    {key: 'less', label: '‹ Short list', on: false, onPress: () => setShowAll(false)},
    ...all.slice(shown * pageSize, (shown + 1) * pageSize).map(item => {
      const chip = chipOf(item);
      return {
        ...chip,
        onPress: () => {
          chip.onPress();
          setShowAll(false);
        },
      };
    }),
  ];
  if (pages > 1) {
    chips.push({key: 'page', label: `${shown + 1}/${pages} ›`, on: false, onPress: () => setPage((shown + 1) % pages)});
  }
  return chips;
}
