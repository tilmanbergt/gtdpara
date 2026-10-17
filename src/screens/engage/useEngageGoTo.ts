/**
 * Engage's "Go to <notebook> ›" (docs/dev/history/technical-design-home-notebooks.md
 * §3.6): when the owner is a Project or Area, its home notebook exists and
 * the open note is not that notebook (nor one of its earlier years), the way
 * there. Read once per owner: one listing of the notebook's folder and the
 * open note's path. Null otherwise, and while it is read.
 */
import {useEffect, useState} from 'react';
import {EngageOwner} from '../../domain/engageOwner';
import {homeNotebookGoTo} from '../../domain/homeNotebook';
import {findCachedItem} from '../../storage/dataCache';
import {homeNotebookOf, loadHomeNotebookYears} from '../../storage/homeNotebooks';
import {loadSettings} from '../../storage/settingsStorage';
import {getCurrentNotePath} from '../../supernote/fileSystem';
import {errorMessage} from '../../utils/errorMessage';
import {log, logWarn} from '../../utils/log';

export interface EngageGoTo {
  /** The notebook's name, no ".note". */
  fileName: string;
  path: string;
}

export function useEngageGoTo(owner: EngageOwner | null): EngageGoTo | null {
  const [goTo, setGoTo] = useState<EngageGoTo | null>(null);
  const itemPath = owner?.kind === 'item' ? owner.itemPath : null;

  useEffect(() => {
    setGoTo(null);
    if (!itemPath) return;
    let cancelled = false;
    (async () => {
      const item = findCachedItem(itemPath);
      const settings = await loadSettings();
      const nb = item ? homeNotebookOf(item, settings) : null;
      if (!nb) return;
      const [years, openNote] = await Promise.all([loadHomeNotebookYears(nb, settings), getCurrentNotePath()]);
      const path = homeNotebookGoTo(openNote, years);
      log('EngageGoTo:', path ? 'shown' : 'none');
      if (!cancelled && path) setGoTo({fileName: nb.fileName, path});
    })().catch(e => logWarn('EngageGoTo: not read', errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [itemPath]);

  return goTo;
}
