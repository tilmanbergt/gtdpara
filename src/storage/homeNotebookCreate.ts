/**
 * Creating a home notebook from its icon
 * (docs/dev/history/technical-design-home-notebooks.md §3.1, §3.2): the file
 * with its `home` keyword (storage/homeNotebooks.ts), the Home page filled
 * from the Default's layout, the item's name stored (`name:`, §3.7), then
 * the notebook opens on page 1. Its own module
 * because the Home page is written by storage/meetingNoteContent.ts, which
 * storage/homeNotebooks.ts must not import (meetingNoteContent ->
 * itemNotePlan -> homeNotebooks).
 */
import {GtdParaSettings} from '../domain/settings';
import {findCachedItem} from './dataCache';
import {rememberItemName} from './homeNotebookRename';
import {ensureHomeNotebookFile, HomeNotebook, openHomeNotebook} from './homeNotebooks';
import {populateHomePage} from './meetingNoteContent';

/** Creates the home notebook file at `absolutePath` (this year's or the chosen year's) in `nb`'s folder; the caller has confirmed. */
export async function createHomeNotebook(nb: HomeNotebook, absolutePath: string, settings: GtdParaSettings): Promise<void> {
  const fileName = absolutePath.slice(absolutePath.lastIndexOf('/') + 1).replace(/\.note$/, '');
  const path = await ensureHomeNotebookFile(nb.folder, fileName, settings.noteSetupDefaults);
  const item = findCachedItem(nb.itemPath);
  if (item) await populateHomePage(path, item, settings);
  await rememberItemName(nb.itemPath);
  await openHomeNotebook(path, 0);
}
