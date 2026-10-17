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
 */
import {useCallback, useRef} from 'react';
import {homeNotebookCreatedText, homeNotebookYearChoiceText} from '../domain/fileChangeText';
import {planHomeNotebookTap} from '../domain/homeNotebook';
import {
  createHomeNotebook,
  HomeNotebook,
  homeNotebookOf,
  loadHomeNotebookYears,
  openHomeNotebook,
  refreshHomeNotebookStates,
} from '../storage/homeNotebooks';
import {findCachedItem} from '../storage/dataCache';
import {loadSettings} from '../storage/settingsStorage';
import {displayPath} from '../supernote/fileSystem';
import {log} from '../utils/log';
import {useActionError} from './useActionError';
import {useNoteCreateConfirm} from './useNoteCreateConfirm';
import {useStatusChoice} from './useStatusChoice';
import {useStatusApi} from './status/StatusProvider';

let nextInstance = 0;

export function useHomeNotebookTap(name: string): (nb: HomeNotebook) => void {
  const confirmCreate = useNoteCreateConfirm(`${name}.homeNotebookCreate`);
  const chooseYear = useStatusChoice(`${name}.homeNotebookYear`);
  const {run} = useActionError(`${name}.homeNotebookError`, `${name}: home notebook failed`);
  const statusApi = useStatusApi();
  // Per instance: the Projects and Areas tabs are the same screen, both kept.
  const doneId = useRef(`${name}.homeNotebookDone.${++nextInstance}`).current;

  return useCallback(
    (tapped: HomeNotebook) => {
      run(async () => {
        const settings = await loadSettings();
        await refreshHomeNotebookStates([tapped.absolutePath]);
        const nb = homeNotebookOf(findCachedItem(tapped.itemPath) ?? {path: tapped.itemPath, name: '', abbrev: tapped.itemAbbrev}, settings) ?? tapped;
        const years = nb.exists ? [] : await loadHomeNotebookYears(nb, settings);
        const plan = planHomeNotebookTap({absolutePath: nb.absolutePath, exists: nb.exists, years});
        log('HomeNotebookTap:', plan.kind);
        let createPath: string | null = null;
        if (plan.kind === 'open') {
          await openHomeNotebook(plan.path);
        } else if (plan.kind === 'create') {
          const fileName = `${nb.fileName}.note`;
          const choice = await confirmCreate({kind: 'new-shared-file', file: fileName, absolutePath: plan.path, setupName: null});
          if (choice !== null) createPath = plan.path;
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
          if (choice === 0) createPath = plan.createPath;
          if (choice === 1) await openHomeNotebook(plan.openPath);
        }
        if (createPath) {
          await createHomeNotebook(nb, createPath);
          statusApi.show(doneId, {
            kind: 'success',
            text: homeNotebookCreatedText(nb.fileName, displayPath(nb.folder)),
            onDismiss: () => statusApi.clear(doneId),
          });
        }
      });
    },
    [run, confirmCreate, chooseYear, statusApi, doneId],
  );
}
