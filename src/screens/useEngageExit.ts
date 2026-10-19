/**
 * App's half of leaving the Engage panel to a place in gtdpara
 * (docs/dev/history/technical-design-engage-in-context.md §2.9). Always back
 * to the tab shell, then:
 * - a thread's or loop's overview: opened once the tab shell shows, because
 *   screens/useAppOverlays.tsx drops an overview requested outside it; a
 *   loop's owner is its item, so the usual loop/thread decision applies;
 * - an item owner: its Project/Area page (Current), like opening it anywhere;
 * - Someday: Review's "Someday / Maybe" with the panel's filter
 *   (screens/review/reviewNav.ts; screens/useReviewStepNav.ts shows the tab).
 */
import {useCallback, useEffect, useRef} from 'react';
import {EngageExit} from '../domain/engageFlow';
import {findCachedItem} from '../storage/dataCache';
import {FolderEntry} from '../supernote/fileSystem';
import {openOverview} from '../ui/overviewStore';
import {log} from '../utils/log';
import {requestReviewStep} from './review/reviewNav';

export function useEngageExit(
  inTabs: boolean,
  showTabs: () => void,
  openItem: (kind: 'project' | 'area', entry: FolderEntry) => void,
): (exit: EngageExit) => void {
  const pendingRef = useRef<{tag: string; ownerPath: string} | null>(null);
  useEffect(() => {
    if (!inTabs || !pendingRef.current) return;
    const pending = pendingRef.current;
    pendingRef.current = null;
    openOverview({tag: pending.tag, ownerPath: pending.ownerPath, lens: 'thread'});
  }, [inTabs]);

  return useCallback(
    (exit: EngageExit) => {
      log('App: leaving Engage', exit.kind, exit.owner.kind);
      if (exit.kind === 'someday') {
        requestReviewStep('somedayMaybe', {label: exit.label, keys: exit.keys});
        return;
      }
      const owner = exit.owner;
      if (owner.kind === 'item') {
        const item = findCachedItem(owner.itemPath);
        if (item) openItem(item.kind, {name: item.name, path: item.path, isFolder: true});
        else showTabs();
        return;
      }
      pendingRef.current = {tag: owner.tag, ownerPath: owner.kind === 'thread' ? owner.scopeOwnerPath : owner.itemPath};
      showTabs();
    },
    [showTabs, openItem],
  );
}
