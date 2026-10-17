/**
 * The home notebook icons of a focus panel
 * (docs/dev/history/technical-design-home-notebooks.md §3.3): Daily's focus
 * rows and Week's focus cards. One `useHomeNotebooks` for every focused item
 * of the panel (one `statFiles` call), one tap hook, and the icon for an
 * item. Off (`enabled` false) it reads nothing and renders nothing - Month
 * and Review show the same panel without icons.
 */
import React, {useCallback} from 'react';
import {CachedItem} from '../storage/dataCache';
import HomeNotebookButton from './HomeNotebookButton';
import {useHomeNotebooks} from './useHomeNotebooks';
import {useHomeNotebookTap} from './useHomeNotebookTap';

const NONE: CachedItem[] = [];

/** `iconFor(item)`: the compact icon for a focused item, or null. */
export function useFocusHomeNotebooks(
  name: string,
  focusedItems: CachedItem[],
  enabled: boolean,
  textColor: string,
  borderColor: string,
): (item: CachedItem) => React.ReactNode {
  const homes = useHomeNotebooks(enabled ? focusedItems : NONE);
  const tap = useHomeNotebookTap(name);
  const {of} = homes;
  return useCallback(
    (item: CachedItem) =>
      enabled ? <HomeNotebookButton nb={of(item)} onPress={tap} variant="icon" compact textColor={textColor} borderColor={borderColor} /> : null,
    [enabled, of, tap, textColor, borderColor],
  );
}
