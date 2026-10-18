/**
 * The Contents of the Notebook tab's selected file
 * (docs/dev/history/technical-design-home-notebooks.md §3.5): read through
 * storage/notebookContents.ts (cached per file and modification time), again
 * when the tab is shown, when the plugin is opened again (the notebook may
 * have been edited) and when the item's todos or meetings change. Null while
 * off or not read yet. A failure is logged and said in the status slot; the
 * rest of the tab keeps working.
 */
import {useCallback, useEffect, useState} from 'react';
import {NOTEBOOK_TAB_TEXT} from '../../domain/homeNotebook';
import {ContentsEntry} from '../../domain/notebookContents';
import {subscribeFilesChecked} from '../../storage/dataCache';
import {loadContents} from '../../storage/notebookContents';
import {useOnScreenShow} from '../../ui/screenActivity';
import {useErrorStatus} from '../../ui/status/StatusProvider';
import {useCachedItems} from '../../ui/useCachedItems';
import {errorMessage} from '../../utils/errorMessage';
import {logError} from '../../utils/log';
import {requestEinkRefresh} from '../../utils/screenRefresh';

export function useNotebookContents(path: string | null, itemPath: string, enabled: boolean): ContentsEntry[] | null {
  const items = useCachedItems();
  const item = items.find(i => i.path === itemPath) ?? null;
  const [entries, setEntries] = useState<ContentsEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  useErrorStatus('NotebookTab.contents', failed ? NOTEBOOK_TAB_TEXT.contentsError : null, () => setFailed(false));

  const reread = useCallback(() => setTick(t => t + 1), []);
  useOnScreenShow(reread);
  useEffect(() => subscribeFilesChecked(reread), [reread]);

  useEffect(() => {
    if (!enabled || !path || !item) {
      setEntries(null);
      return;
    }
    let cancelled = false;
    loadContents(path, item)
      .then(found => {
        if (cancelled) return;
        setFailed(false);
        setEntries(found);
        // The list appears without a tap.
        requestEinkRefresh();
      })
      .catch(e => {
        logError('NotebookTab: contents not read', errorMessage(e));
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, path, item, tick]);

  return entries;
}
