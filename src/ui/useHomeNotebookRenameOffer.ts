/**
 * The rename offer on a Project/Area page
 * (docs/dev/history/technical-design-home-notebooks.md §3.7): when the page
 * opens and the item's folder was renamed outside gtdpara while this year's
 * home notebook kept the old name, the status slot asks "<old> is now <new>.
 * Rename <old file> to <new file>?" Rename · Not now. Not now is remembered
 * until gtdpara restarts (in memory); ✕ asks again next time. A conflict
 * (both files exist) is left to the Integrity Check; an outdated name with
 * nothing to move is brought up to date quietly.
 */
import {useEffect, useRef} from 'react';
import {renameDoneText, renameOfferText} from '../domain/homeNotebook';
import {findCachedItem} from '../storage/dataCache';
import {detectHomeNotebookRename, rememberItemName, renameHomeNotebook} from '../storage/homeNotebookRename';
import {loadSettings} from '../storage/settingsStorage';
import {errorMessage} from '../utils/errorMessage';
import {logWarn} from '../utils/log';
import {useActionError} from './useActionError';
import {useStatusChoice} from './useStatusChoice';
import {useStatusApi} from './status/StatusProvider';

/** Items whose offer got "Not now" in this run of gtdpara. */
const notNow = new Set<string>();

export function useHomeNotebookRenameOffer(name: string, itemPath: string, enabled: boolean): void {
  const choose = useStatusChoice(`${name}.homeNotebookRename`);
  const {run} = useActionError(`${name}.homeNotebookRenameError`, `${name}: home notebook rename failed`);
  const statusApi = useStatusApi();
  const doneId = useRef(`${name}.homeNotebookRenamed`).current;

  useEffect(() => {
    if (!enabled || notNow.has(itemPath)) return;
    let cancelled = false;
    (async () => {
      const settings = await loadSettings();
      const item = findCachedItem(itemPath);
      const offer = item ? await detectHomeNotebookRename(item, settings) : null;
      if (cancelled || !item || !offer) return;
      if (offer.found.kind === 'update-name') {
        await rememberItemName(itemPath, true);
        return;
      }
      if (offer.found.kind !== 'rename') return;
      const choice = await choose(renameOfferText({from: offer.move.from, to: offer.move.to, fromFile: offer.move.fromFile, toFile: offer.move.toFile}));
      if (choice === 1) notNow.add(itemPath);
      if (choice !== 0) return;
      await run(async () => {
        const result = await renameHomeNotebook(item, offer, settings);
        statusApi.show(doneId, {
          kind: result.failed > 0 ? 'warning' : 'success',
          text: renameDoneText(offer.move.toFile, result.linksUpdated, result.failed),
          onDismiss: () => statusApi.clear(doneId),
        });
      });
    })().catch(e => logWarn('useHomeNotebookRenameOffer: not checked', errorMessage(e)));
    return () => {
      cancelled = true;
    };
  }, [enabled, itemPath, choose, run, statusApi, doneId]);
}
