/**
 * The one write path for data files (project.txt, area.txt, Inbox.txt):
 * re-reads the file, lets domain/writeGuard.ts decide against the content
 * the save started from, and writes
 * (docs/dev/history/technical-design-quality-hardening.md §3.2).
 *
 * Writes to the same file run one after another, so two saves never read
 * the same old content and overwrite each other.
 *
 * Two hooks keep the cache honest without importing it (storage/dataCache.ts
 * imports this module):
 * - A merged write (an outside edit to other parts was kept) is remembered by
 *   its content; the cache's write-through parses such content in full
 *   instead of trusting the caller's parsed fields (takeMergedWrite).
 * - On a conflict the file as it is now goes to the reload listener, so every
 *   screen shows the outside version while the user is asked which version
 *   wins (storage/writeConflicts.ts). "Use mine" writes the save's parts into
 *   the file as it is then and resolves like any save; "Use the file" throws
 *   FileConflictError, and the save fails with nothing written.
 */
import {DataFileChange, decideWrite} from '../domain/writeGuard';
import {ensureSkeleton} from '../domain/markdown';
import {dataFileGoneText, writeConflictKeptFileText} from '../domain/fileChangeText';
import {GtdParaKind, INBOX_FILE_NAME} from '../domain/types';
import {readTextFile, writeTextFile} from '../supernote/fileSystem';
import {log, logWarn} from '../utils/log';
import {askWriteConflict} from './writeConflicts';

/** A save that wrote nothing because of an outside edit: the user kept the file's version, or the file is gone. */
export class FileConflictError extends Error {
  constructor(readonly filePath: string, message: string) {
    super(message);
    this.name = 'FileConflictError';
  }
}

type ReloadListener = (fileKind: GtdParaKind, itemPath: string, content: string) => void;

let reloadListener: ReloadListener | null = null;

/** Set once by storage/dataCache.ts: puts a file's current content into the cache after a conflict. */
export function setDataFileReloadListener(listener: ReloadListener | null): void {
  reloadListener = listener;
}

/** Contents of merged writes not yet taken by a cache write-through; a few at most. */
const mergedContents: string[] = [];
const MERGED_KEEP = 8;

/** True once for content a merged write produced - the caller's parsed fields then miss the outside edit. */
export function takeMergedWrite(content: string): boolean {
  const i = mergedContents.indexOf(content);
  if (i < 0) return false;
  mergedContents.splice(i, 1);
  return true;
}

const chains = new Map<string, Promise<unknown>>();

/** Runs `task` after every earlier write to `filePath` has settled. */
function serialized<T>(filePath: string, task: () => Promise<T>): Promise<T> {
  const result = (chains.get(filePath) ?? Promise.resolve()).then(task, task);
  const tail = result.catch(() => undefined); // silent: the caller gets the error from `result`; the tail only orders writes
  chains.set(filePath, tail);
  void tail.then(() => {
    if (chains.get(filePath) === tail) chains.delete(filePath);
  });
  return result;
}

function displayName(fileKind: GtdParaKind, itemPath: string): string {
  if (fileKind === 'inbox') return INBOX_FILE_NAME.replace(/\.txt$/, '');
  const trimmed = itemPath.replace(/\/+$/, '');
  return trimmed.slice(trimmed.lastIndexOf('/') + 1);
}

function rememberMerged(content: string): void {
  mergedContents.push(content);
  if (mergedContents.length > MERGED_KEEP) mergedContents.shift();
}

/**
 * Writes `change` into the data file at `filePath`. `base` is the content the
 * caller's change was made against (the cache's or screen's rawContent).
 * Resolves the content now in the file; rejects with FileConflictError when
 * nothing was written because of an outside edit.
 */
export function writeDataFile(
  fileKind: GtdParaKind,
  itemPath: string,
  filePath: string,
  base: string,
  change: DataFileChange,
): Promise<string> {
  return serialized(filePath, async () => {
    const name = displayName(fileKind, itemPath);
    const current = (await readTextFile(filePath)) ?? '';
    const decision = decideWrite(fileKind, base, current, change);
    if (decision.kind === 'gone') {
      logWarn('dataFileWrite: file gone, not written', filePath);
      throw new FileConflictError(filePath, dataFileGoneText(name));
    }
    if (decision.kind === 'conflict') {
      logWarn('dataFileWrite: changed outside gtdpara in the same part, asking', filePath, decision.parts.join(', '));
      reloadListener?.(fileKind, itemPath, current);
      const choice = await askWriteConflict(name, decision.parts);
      log('dataFileWrite: conflict answered', filePath, choice);
      if (choice === 'file') throw new FileConflictError(filePath, writeConflictKeptFileText(name));
      // The file may have changed again while the question was open.
      const now = (await readTextFile(filePath)) ?? '';
      if (now === '') throw new FileConflictError(filePath, dataFileGoneText(name));
      const content = change.apply(ensureSkeleton(now, fileKind));
      await writeTextFile(filePath, content);
      rememberMerged(content);
      return content;
    }
    await writeTextFile(filePath, decision.content);
    if (decision.merged) {
      log('dataFileWrite: changed outside gtdpara in other parts, both kept', filePath);
      rememberMerged(decision.content);
    }
    return decision.content;
  });
}
