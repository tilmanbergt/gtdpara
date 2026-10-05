/**
 * The private part of a mark (docs/dev/technical-design-lasso-0.8.md §3.3):
 * `<private>/data/marks/<id>/picture.png` and `mark.json` (strokes, page,
 * rect, sizes, text-box text). Not user content and not visible in the file
 * manager; the user-visible part is the `## Marks` line
 * (storage/markStore.ts). Deleted after Save/Discard; orphans (a line deleted
 * by hand) are cleaned up by cleanOrphanedMarkData.
 *
 * Also keeps the short list of icon changes that couldn't be done yet
 * (pending-icons.json): a busy note or error 105 must never block a save.
 */
import {isMarkId, MarkDataFile, parseMarkDataFile} from '../domain/marks';
import {
  deletePrivateDataTree,
  getPrivateDataDir,
  listFolderEntries,
  readTextFile,
  writeTextFile,
} from '../supernote/fileSystem';
import {log, logError, logWarn} from '../utils/log';

async function marksRoot(): Promise<string> {
  return `${await getPrivateDataDir()}/marks`;
}

export async function markDataFolder(id: string): Promise<string> {
  return `${await marksRoot()}/${id}`;
}

export async function markPicturePath(id: string): Promise<string> {
  return `${await markDataFolder(id)}/picture.png`;
}

async function markJsonPath(id: string): Promise<string> {
  return `${await markDataFolder(id)}/mark.json`;
}

/** Writes mark.json (the folder is created by the native write). Throws on failure. */
export async function writeMarkData(data: MarkDataFile): Promise<void> {
  const json = JSON.stringify(data);
  await writeTextFile(await markJsonPath(data.id), json);
  log('markData: written', data.id, `strokes=${data.strokes.length}`, `bytes=${json.length}`);
}

/** null when missing or unreadable. */
export async function readMarkData(id: string): Promise<MarkDataFile | null> {
  try {
    return parseMarkDataFile(await readTextFile(await markJsonPath(id)));
  } catch (e) {
    logWarn('markData: read failed', id, e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Deletes the mark's folder. Never throws. */
export async function deleteMarkData(id: string): Promise<void> {
  if (!isMarkId(id)) {return;}
  try {
    const ok = await deletePrivateDataTree(await markDataFolder(id));
    log('markData: deleted', id, `ok=${ok}`);
  } catch (e) {
    logWarn('markData: delete failed', id, e instanceof Error ? e.message : String(e));
  }
}

/** Ids that have a data folder. */
export async function listMarkDataIds(): Promise<string[]> {
  try {
    const entries = await listFolderEntries(await marksRoot());
    return entries.filter(e => e.isFolder && isMarkId(e.name)).map(e => e.name);
  } catch {
    return []; // folder not there yet
  }
}

/** Age in ms of a mark id ('m-YYYYMMDD-HHmmss-NNN', local time); null when unreadable. */
export function markIdAgeMs(id: string, now: Date): number | null {
  const m = /^m-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})-\d{3}$/.exec(id);
  if (!m) {return null;}
  const t = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
  return now.getTime() - t;
}

const ORPHAN_MIN_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * Deletes data folders whose mark has no line anymore (deleted by hand) and
 * that are older than a day - younger ones may belong to a Mark still being
 * written. Returns the ids deleted.
 */
export async function cleanOrphanedMarkData(openIds: Set<string>, now = new Date()): Promise<string[]> {
  const deleted: string[] = [];
  for (const id of await listMarkDataIds()) {
    if (openIds.has(id)) {continue;}
    const age = markIdAgeMs(id, now);
    if (age === null || age < ORPHAN_MIN_AGE_MS) {continue;}
    await deleteMarkData(id);
    deleted.push(id);
  }
  if (deleted.length) {log('markData: orphans deleted', deleted.length);}
  return deleted;
}

// ---- icon changes still to do ----

export interface PendingIconChange {
  id: string;
  path: string;
  page: number;
  change: 'done' | 'remove';
}

async function pendingPath(): Promise<string> {
  return `${await getPrivateDataDir()}/pending-icons.json`;
}

export async function readPendingIconChanges(): Promise<PendingIconChange[]> {
  try {
    const raw = await readTextFile(await pendingPath());
    const parsed = raw ? (JSON.parse(raw) as PendingIconChange[]) : [];
    return Array.isArray(parsed) ? parsed.filter(p => p && typeof p.id === 'string') : [];
  } catch {
    return [];
  }
}

export async function writePendingIconChanges(list: PendingIconChange[]): Promise<void> {
  try {
    await writeTextFile(await pendingPath(), JSON.stringify(list));
  } catch (e) {
    logError('markData: writing pending icons failed', e instanceof Error ? e.message : String(e));
  }
}

/** Adds (or replaces) the pending change for `item.id`. */
export async function addPendingIconChange(item: PendingIconChange): Promise<void> {
  const list = (await readPendingIconChanges()).filter(p => p.id !== item.id);
  list.push(item);
  await writePendingIconChanges(list);
}
