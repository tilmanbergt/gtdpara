/**
 * The rename safety net of home notebooks
 * (docs/dev/history/technical-design-home-notebooks.md §3.7). A Project's or
 * Area's name is kept in its file (`name:`); when its folder was renamed
 * outside gtdpara, this year's home notebook still has the old name.
 *
 * - `rememberItemName`: writes `name:` when it is missing (a home notebook
 *   was created or opened from gtdpara), or brings it up to date.
 * - `detectHomeNotebookRename`: what the Project/Area page offers - two
 *   `fileExists` calls, decided by domain/homeNotebook.ts's `renameCase`.
 * - `renameHomeNotebook`: moves this year's file (earlier years keep their
 *   names), re-points every link into it - this item's relative links, any
 *   item's or the Inbox's absolute links, open marks - through the usual
 *   write-through, and stores the new name. Confirmed before, reported after.
 *   A link rewrite that fails after the move is named in the result; the
 *   Integrity Check's missing-note checks report what was left. No undo.
 */
import {
  NotebookMove,
  readStoredName,
  relinkNotePath,
  renameCase,
  RenameCase,
  renamedNotebookMove,
  withStoredName,
} from '../domain/homeNotebook';
import {todayIso} from '../domain/meetingTime';
import {GtdParaSettings, resolvePaths} from '../domain/settings';
import {GtdParaKind} from '../domain/types';
import {fileExists, moveFile} from '../supernote/fileSystem';
import {errorMessage} from '../utils/errorMessage';
import {log, logError} from '../utils/log';
import {CachedItem, findCachedItem, frontMatterOf, getCachedData, getCachedInbox, updateItemFrontMatter} from './dataCache';
import {ItemRewrite, rewriteItem} from './fileNameFix';
import {refreshHomeNotebookStates} from './homeNotebooks';
import {repointMarkLines} from './markStore';
import {saveFrontMatter} from './projectFile';

/** Writes `name:` = the folder name when it is missing, or always with `update`. No write when it already reads so. */
export async function rememberItemName(itemPath: string, update = false): Promise<void> {
  const item = findCachedItem(itemPath);
  if (!item) return;
  const stored = readStoredName(item.frontMatterExtraLines);
  if (stored === item.name || (stored !== null && !update)) return;
  const fm = {...frontMatterOf(item), extraLines: withStoredName(item.frontMatterExtraLines, item.name)};
  const raw = await saveFrontMatter(item.kind, item.path, item.rawContent, fm);
  updateItemFrontMatter(item.path, raw, fm);
  log('HomeNotebookRename: name stored', stored === null ? 'new' : 'updated');
}

export interface RenameOffer {
  found: NonNullable<RenameCase>;
  move: NotebookMove & {fromFile: string; toFile: string; from: string; to: string};
}

/** Whether `item`'s home notebook needs the rename (null: nothing to offer or to report). */
export async function detectHomeNotebookRename(item: CachedItem, settings: GtdParaSettings): Promise<RenameOffer | null> {
  const notebook = settings.noteSetupDefaults.notebook;
  if (!notebook) return null;
  const move = renamedNotebookMove({
    itemPath: item.path,
    stored: readStoredName(item.frontMatterExtraLines),
    abbrev: item.abbrev ?? '',
    spec: {template: notebook.name, folder: notebook.folder, today: todayIso()},
  });
  if (!move) return null;
  const sameFile = move.fromFile === move.toFile;
  const found = renameCase({
    stored: move.from,
    folderName: move.to,
    fromFile: move.fromFile,
    toFile: move.toFile,
    fromExists: !sameFile && (await fileExists(move.oldAbsolute)),
    toExists: !sameFile && (await fileExists(move.newAbsolute)),
  });
  log('HomeNotebookRename: detected', found?.kind ?? 'none');
  return found ? {found, move} : null;
}

export interface RenameResult {
  linksUpdated: number;
  /** Data files whose links could not be rewritten (their links still point at the old name). */
  failed: number;
}

/** The links of one data file into the moved notebook, as old notePath -> new notePath. */
/** What a data file holds that can link into the notebook. */
interface Entries {
  tasks: Array<{notePath: string}>;
  meetings: Array<{notePath: string}>;
  marks?: Array<{notePath: string}>;
}

function rewriteOf(kind: GtdParaKind, path: string, ownItem: boolean, entries: Entries, move: NotebookMove): ItemRewrite | null {
  const map = (list: Array<{notePath: string}>) => {
    const out = new Map<string, string>();
    for (const {notePath} of list) {
      const next = notePath ? relinkNotePath(notePath, ownItem, move) : null;
      if (next !== null) out.set(notePath, next);
    }
    return out;
  };
  const rewrite = {kind, path, tasks: map(entries.tasks), meetings: map(entries.meetings)};
  return rewrite.tasks.size + rewrite.meetings.size > 0 ? rewrite : null;
}

/** Renames this year's home notebook of `item` as `offer` found it; the caller has confirmed. */
export async function renameHomeNotebook(item: CachedItem, offer: RenameOffer, settings: GtdParaSettings): Promise<RenameResult> {
  const {move} = offer;
  await moveFile(move.oldAbsolute, move.newAbsolute);
  log('HomeNotebookRename: moved');
  const result: RenameResult = {linksUpdated: 0, failed: 0};
  const paths = resolvePaths(settings);
  const inbox = getCachedInbox();
  const files: Array<{kind: GtdParaKind; path: string; own: boolean; entries: Entries}> = [
    ...(getCachedData()?.items ?? []).map(i => ({kind: i.kind as GtdParaKind, path: i.path, own: i.path === item.path, entries: i})),
    ...(inbox ? [{kind: 'inbox' as GtdParaKind, path: paths.inboxFolder, own: false, entries: inbox}] : []),
  ];
  for (const file of files) {
    const rewrite = rewriteOf(file.kind, file.path, file.own, file.entries, move);
    try {
      if (rewrite) result.linksUpdated += await rewriteItem(rewrite);
      const relinkMark = (notePath: string) => relinkNotePath(notePath, file.own, move);
      if ((file.entries.marks ?? []).some(mark => relinkMark(mark.notePath) !== null)) {
        result.linksUpdated += await repointMarkLines({kind: file.kind, folder: file.path}, relinkMark);
      }
    } catch (e) {
      result.failed += 1;
      logError('HomeNotebookRename: links not updated', file.kind, errorMessage(e));
    }
  }
  await rememberItemName(item.path, true);
  await refreshHomeNotebookStates([move.oldAbsolute, move.newAbsolute]);
  log('HomeNotebookRename: done', `${result.linksUpdated} links`, `${result.failed} failed`);
  return result;
}
