/**
 * Home notebooks in the file system
 * (docs/dev/history/technical-design-home-notebooks.md §3.1): where a
 * Project's or Area's home notebook lives, whether it exists, its years, and
 * opening and creating it. Names come from domain/homeNotebook.ts.
 *
 * Existence is kept in one in-memory state cache (`absolutePath -> exists`),
 * filled with one `statFiles` call for all notebooks a screen shows
 * (`refreshHomeNotebookStates`) and rebuilt from the file system at any time.
 * Screens read it through ui/useHomeNotebooks.ts and never poll: the hook
 * refreshes it on cache and folder changes, and gtdpara's own create refreshes
 * it too.
 */
import {HomeNotebookYear, homeNotebookName, homeNotebookYears} from '../domain/homeNotebook';
import {todayIso} from '../domain/meetingTime';
import {GtdParaSettings, resolvePaths} from '../domain/settings';
import {fileExists, listFolderEntries, openPath, statFiles} from '../supernote/fileSystem';
import {errorMessage} from '../utils/errorMessage';
import {log, logWarn} from '../utils/log';
import {CachedItem} from './dataCache';
import {backgroundOf} from './noteLinks';
import {ensureSharedNoteFile} from './sharedNotePages';

export interface HomeNotebookYearPath {
  year: number;
  absolutePath: string;
  exists: boolean;
}

export interface HomeNotebook {
  itemPath: string;
  /** The abbreviation the name was rendered with (`{abbr}`), '' without one. */
  itemAbbrev: string;
  /** The notebook's folder, absolute. */
  folder: string;
  /** Base name, no ".note". */
  fileName: string;
  /** The file relative to the item's folder, as a todo's note link names it. */
  relativeFile: string;
  absolutePath: string;
  /** From the state cache; false while unknown. */
  exists: boolean;
  /** Whether the state cache has an answer for this file yet. */
  known: boolean;
}

/**
 * The item's home notebook, or null when the Default has no notebook (then
 * this whole feature is hidden) or the item is the Inbox. `today` is
 * `YYYY-MM-DD` for the name's date placeholders.
 */
export function homeNotebookOf(item: Pick<CachedItem, 'path' | 'name' | 'abbrev'>, settings: GtdParaSettings, today: string = todayIso()): HomeNotebook | null {
  const notebook = settings.noteSetupDefaults.notebook;
  if (!notebook) return null;
  const itemPath = item.path.replace(/\/+$/, '');
  if (itemPath === resolvePaths(settings).inboxFolder.replace(/\/+$/, '')) return null;
  const itemAbbrev = item.abbrev ?? '';
  const fileName = homeNotebookName({template: notebook.name, itemName: itemNameOf(itemPath), itemAbbrev, date: today});
  const folder = notebook.folder ? `${itemPath}/${notebook.folder}` : itemPath;
  const absolutePath = `${folder}/${fileName}.note`;
  const known = states.has(absolutePath);
  return {
    itemPath,
    itemAbbrev,
    folder,
    fileName,
    relativeFile: notebook.folder ? `${notebook.folder}/${fileName}.note` : `${fileName}.note`,
    absolutePath,
    exists: states.get(absolutePath) === true,
    known,
  };
}

/** `{name}` is the folder name, as for every notebook (storage/noteOwner.ts). */
function itemNameOf(itemPath: string): string {
  return itemPath.slice(itemPath.lastIndexOf('/') + 1);
}

// ---- State cache ----

const states = new Map<string, boolean>();
const listeners = new Set<() => void>();

/** Called whenever a notebook's known state changes. Returns the unsubscribe function. */
export function subscribeHomeNotebookStates(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Re-reads whether each of `paths` exists - one `statFiles` call for all of
 * them (a native build without it falls back to one check per file) - and
 * tells the subscribers when anything changed. Never throws; a failed read
 * leaves the cache as it was.
 */
export async function refreshHomeNotebookStates(paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return;
  const start = Date.now();
  try {
    const stats = await statFiles([...paths]);
    const found = stats
      ? stats.map(s => [s.path, s.exists] as const)
      : await Promise.all(paths.map(async p => [p, await fileExists(p)] as const));
    let changed = false;
    for (const [path, exists] of found) {
      if (states.get(path) !== exists) changed = true;
      states.set(path, exists);
    }
    log('HomeNotebooks: states', `${paths.length} files`, `${found.filter(f => f[1]).length} exist`, `${Date.now() - start} ms`);
    if (changed) listeners.forEach(listener => listener());
  } catch (e) {
    logWarn('HomeNotebooks: state refresh failed', `${paths.length} files`, errorMessage(e));
  }
}

// ---- Years, open, create ----

/**
 * The notebook's years, current first (domain/homeNotebook.ts's
 * `homeNotebookYears`): one listing of its folder. A missing folder has no
 * years but the current one.
 */
export async function loadHomeNotebookYears(nb: HomeNotebook, settings: GtdParaSettings, today: string = todayIso()): Promise<HomeNotebookYearPath[]> {
  const notebook = settings.noteSetupDefaults.notebook;
  if (!notebook) return [];
  const entries = await listFolderEntries(nb.folder);
  const years: HomeNotebookYear[] = homeNotebookYears(
    {template: notebook.name, itemName: itemNameOf(nb.itemPath), itemAbbrev: nb.itemAbbrev, date: today},
    entries.filter(e => !e.isFolder).map(e => e.name),
    Number(today.slice(0, 4)),
  );
  return years.map(y => ({year: y.year, absolutePath: `${nb.folder}/${y.fileName}.note`, exists: y.exists}));
}

/** Opens a home notebook: on the page last viewed in Supernote, or on `page` (0-based). */
export async function openHomeNotebook(path: string, page?: number): Promise<void> {
  await openPath(path, page ?? -1);
}

/**
 * Creates the home notebook at `absolutePath` in `nb`'s folder and opens it
 * on its first page. The caller has confirmed. Creating notes only works when
 * the plugin was opened from a note; createNote's error says so.
 */
export async function createHomeNotebook(nb: HomeNotebook, absolutePath: string): Promise<void> {
  const fileName = absolutePath.slice(absolutePath.lastIndexOf('/') + 1).replace(/\.note$/, '');
  await ensureSharedNoteFile(nb.folder, fileName, backgroundOf(null));
  log('HomeNotebooks: created');
  await refreshHomeNotebookStates([absolutePath]);
  await openHomeNotebook(absolutePath, 0);
}
