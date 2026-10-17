/**
 * A tap on a home notebook's icon
 * (docs/dev/history/technical-design-home-notebooks.md §3.1, §3.3), as
 * domain/homeNotebook.ts's `planHomeNotebookTap` decides it:
 *
 * - it exists: open it on the page last viewed in Supernote;
 * - it doesn't: confirm in the status slot (the note confirm's "new file"),
 *   then create it and open it on page 1;
 * - this year's is missing and an earlier year's is there: Create <year> ·
 *   Open <earlier year> · ✕.
 *
 * Existence is checked again on the tap, so a notebook deleted or made
 * outside gtdpara is not opened or created twice. Errors show in the status
 * slot; the created file is named there afterwards.
 *
 * `useHomeNotebookActions` also gives the Notebook tab its direct actions
 * (§3.4): `create` (the "+ <year>" chip and Create notebook, after the same
 * confirm) and `open` (a year's file, or a Contents row's page).
 */
import {useCallback, useMemo, useRef} from 'react';
import {homeNotebookCreatedText, homeNotebookYearChoiceText} from '../domain/fileChangeText';
import {planHomeNotebookTap} from '../domain/homeNotebook';
import {createHomeNotebook} from '../storage/homeNotebookCreate';
import {
  HomeNotebook,
  homeNotebookOf,
  loadHomeNotebookYears,
  openHomeNotebook,
  refreshHomeNotebookStates,
} from '../storage/homeNotebooks';
import {findCachedItem} from '../storage/dataCache';
import {loadSettings} from '../storage/settingsStorage';
import {displayPath, fileExists} from '../supernote/fileSystem';
import {errorMessage} from '../utils/errorMessage';
import {log, logError} from '../utils/log';
import {rememberItemName} from '../storage/homeNotebookRename';
import {useActionError} from './useActionError';
import {useNoteCreateConfirm} from './useNoteCreateConfirm';
import {useStatusChoice} from './useStatusChoice';
import {useStatusApi} from './status/StatusProvider';

let nextInstance = 0;

/** Opening a home notebook from gtdpara stores the item's name when it is missing (§3.7); a failure only logs. */
async function remember(itemPath: string): Promise<void> {
  try {
    await rememberItemName(itemPath);
  } catch (e) {
    logError('HomeNotebookTap: name not stored', errorMessage(e));
  }
}

export interface HomeNotebookActions {
  tap: (nb: HomeNotebook) => void;
  /** Creates this year's notebook after the confirm, and opens it on page 1. */
  create: (nb: HomeNotebook) => void;
  /** Opens one of `nb`'s files on its last viewed page, or on `page` (0-based). */
  open: (nb: HomeNotebook, path: string, page?: number) => void;
}

export function useHomeNotebookTap(name: string): (nb: HomeNotebook) => void {
  return useHomeNotebookActions(name).tap;
}

export function useHomeNotebookActions(name: string): HomeNotebookActions {
  const confirmCreate = useNoteCreateConfirm(`${name}.homeNotebookCreate`);
  const chooseYear = useStatusChoice(`${name}.homeNotebookYear`);
  const {run} = useActionError(`${name}.homeNotebookError`, `${name}: home notebook failed`);
  const statusApi = useStatusApi();
  // Per instance: the Projects and Areas tabs are the same screen, both kept.
  const doneId = useRef(`${name}.homeNotebookDone.${++nextInstance}`).current;

  const created = useCallback(
    async (nb: HomeNotebook, path: string) => {
      await createHomeNotebook(nb, path, await loadSettings());
      statusApi.show(doneId, {
        kind: 'success',
        text: homeNotebookCreatedText(nb.fileName, displayPath(nb.folder)),
        onDismiss: () => statusApi.clear(doneId),
      });
    },
    [statusApi, doneId],
  );
  const confirmNew = useCallback(
    async (nb: HomeNotebook) =>
      (await confirmCreate({kind: 'new-shared-file', file: `${nb.fileName}.note`, absolutePath: nb.absolutePath, setupName: null})) !== null,
    [confirmCreate],
  );

  const tap = useCallback(
    (tapped: HomeNotebook) => {
      run(async () => {
        const settings = await loadSettings();
        await refreshHomeNotebookStates([tapped.absolutePath]);
        const nb = homeNotebookOf(findCachedItem(tapped.itemPath) ?? {path: tapped.itemPath, name: '', abbrev: tapped.itemAbbrev}, settings) ?? tapped;
        const years = nb.exists ? [] : await loadHomeNotebookYears(nb, settings);
        const plan = planHomeNotebookTap({absolutePath: nb.absolutePath, exists: nb.exists, years});
        log('HomeNotebookTap:', plan.kind);
        if (plan.kind === 'open') {
          await openHomeNotebook(plan.path);
          await remember(nb.itemPath);
        } else if (plan.kind === 'create') {
          if (await confirmNew(nb)) await created(nb, plan.path);
        } else {
          const openName = plan.openPath.slice(plan.openPath.lastIndexOf('/') + 1).replace(/\.note$/, '');
          const choice = await chooseYear(
            homeNotebookYearChoiceText({
              createName: nb.fileName,
              createDisplay: displayPath(plan.createPath),
              createYear: plan.createYear,
              openYear: plan.openYear,
              openName,
            }),
          );
          if (choice === 0) await created(nb, plan.createPath);
          if (choice === 1) await openHomeNotebook(plan.openPath);
        }
      });
    },
    [run, confirmNew, created, chooseYear],
  );

  const create = useCallback(
    (nb: HomeNotebook) => {
      run(async () => {
        await refreshHomeNotebookStates([nb.absolutePath]);
        if (await fileExists(nb.absolutePath)) return openHomeNotebook(nb.absolutePath);
        if (await confirmNew(nb)) await created(nb, nb.absolutePath);
      });
    },
    [run, confirmNew, created],
  );

  const open = useCallback(
    (nb: HomeNotebook, path: string, page?: number) => {
      run(async () => {
        await openHomeNotebook(path, page);
        await remember(nb.itemPath);
      });
    },
    [run],
  );

  return useMemo(() => ({tap, create, open}), [tap, create, open]);
}
