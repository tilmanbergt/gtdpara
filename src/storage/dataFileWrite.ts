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
 *   screen shows the outside version, then FileConflictError is thrown.
 */
import {DataFileChange, decideWrite} from '../domain/writeGuard';
import {fileChangedOutsideText} from '../domain/fileChangeText';
import {GtdParaKind, INBOX_FILE_NAME} from '../domain/types';
import {readTextFile, writeTextFile} from '../supernote/fileSystem';
import {log, logWarn} from '../utils/log';

export class FileConflictError extends Error {
  constructor(readonly filePath: string, readonly parts: string[], message: string) {
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
  const tail = result.catch(() => undefined);
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

/**
 * Writes `change` into the data file at `filePath`. `base` is the content the
 * caller's change was made against (the cache's or screen's rawContent).
 * Resolves the content now in the file; rejects with FileConflictError when
 * an outside edit touched the same part.
 */
export function writeDataFile(
  fileKind: GtdParaKind,
  itemPath: string,
  filePath: string,
  base: string,
  change: DataFileChange,
): Promise<string> {
  return serialized(filePath, async () => {
    const current = (await readTextFile(filePath)) ?? '';
    const decision = decideWrite(fileKind, base, current, change);
    if (decision.kind === 'conflict') {
      logWarn('dataFileWrite: changed outside gtdpara in the same part, not written', filePath, decision.parts.join(', '));
      reloadListener?.(fileKind, itemPath, current);
      throw new FileConflictError(filePath, decision.parts, fileChangedOutsideText(displayName(fileKind, itemPath), decision.parts));
    }
    await writeTextFile(filePath, decision.content);
    if (decision.merged) {
      log('dataFileWrite: changed outside gtdpara in other parts, both kept', filePath);
      mergedContents.push(decision.content);
      if (mergedContents.length > MERGED_KEEP) mergedContents.shift();
    }
    return decision.content;
  });
}
