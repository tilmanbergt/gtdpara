/**
 * Adds and removes `## Marks` lines (docs/dev/technical-design-lasso-0.8.md
 * §3.6). Every change:
 *
 * - runs on one serial queue, so two quick marks (or a save and a discard)
 *   never start from the same file text;
 * - reads the data file fresh from disk - the Mark button runs while the
 *   cache may be old or not exist at all;
 * - changes only the Marks span, then writes the file;
 * - re-parses the written text into the cache when one exists
 *   (applyItemRawContent / applyInboxRawContent), so the next Quick Add save
 *   into the same file, which builds on the cached text, keeps the line.
 */
import {Destination} from '../domain/destination';
import {ensureSkeleton, parseMarksSpan, writeMarksIntoContent} from '../domain/markdown';
import {markLinkPath, resolveMarkPath} from '../domain/marks';
import {ResolvedParaPaths} from '../domain/settings';
import {GtdParaKind, Mark} from '../domain/types';
import {readTextFile, writeTextFile} from '../supernote/fileSystem';
import {log, logError} from '../utils/log';
import {applyInboxRawContent, applyItemRawContent} from './dataCache';
import {dataFilePath} from './projectFile';
import {errorMessage} from '../utils/errorMessage';

/** The data file a mark line lives in. `folder` is the item folder, or the Inbox folder. */
export interface MarkFileRef {
  kind: GtdParaKind;
  folder: string;
}

export function markFileRef(owner: Destination, paths: Pick<ResolvedParaPaths, 'inboxFolder'>): MarkFileRef {
  return owner.type === 'inbox' ? {kind: 'inbox', folder: paths.inboxFolder} : {kind: owner.kind, folder: owner.path};
}

/** The note path as it is written into `ref`'s file: relative inside the item folder, else absolute. */
export function markNotePathFor(ref: MarkFileRef, absNotePath: string): string {
  return markLinkPath(ref.kind === 'inbox' ? null : ref.folder, absNotePath);
}

let queue: Promise<unknown> = Promise.resolve();

/** Runs `job` after every job queued before it, whether those failed or not. */
function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const run = queue.then(job, job);
  queue = run.catch(() => undefined);
  return run;
}

async function readFresh(ref: MarkFileRef): Promise<string> {
  return (await readTextFile(dataFilePath(ref.kind, ref.folder))) ?? '';
}

async function writeAndApply(ref: MarkFileRef, next: string): Promise<void> {
  await writeTextFile(dataFilePath(ref.kind, ref.folder), next);
  if (ref.kind === 'inbox') {applyInboxRawContent(next);}
  else {applyItemRawContent(ref.folder, next);}
}

/** Pure: `content` with `mark` added to its Marks span (unchanged if the id is already there). */
export function addMarkToContent(content: string, kind: GtdParaKind, mark: Mark): string {
  const base = ensureSkeleton(content, kind);
  const {marks, extraLines} = parseMarksSpan(base);
  if (marks.some(m => m.id === mark.id)) {return content;}
  return writeMarksIntoContent(base, [...marks, mark], extraLines);
}

/** Pure: `content` without mark `id` (null when the id isn't there). */
export function removeMarkFromContent(content: string, id: string): string | null {
  const {marks, extraLines} = parseMarksSpan(content);
  if (!marks.some(m => m.id === id)) {return null;}
  return writeMarksIntoContent(
    content,
    marks.filter(m => m.id !== id),
    extraLines,
  );
}

/** Adds the line. Throws when the file can't be written (the mark isn't saved then). */
export function addMarkLine(ref: MarkFileRef, mark: Mark): Promise<void> {
  return enqueue(async () => {
    try {
      const raw = await readFresh(ref);
      const next = addMarkToContent(raw, ref.kind, mark);
      if (next === raw) {return;}
      await writeAndApply(ref, next);
      log('markStore: mark added', ref.kind, mark.id);
    } catch (e) {
      logError('markStore: adding mark failed', ref.kind, mark.id, errorMessage(e));
      throw e;
    }
  });
}

/**
 * Removes the line. Resolves false when it wasn't there (already removed,
 * or deleted by hand - both mean the mark is gone). Throws when the file
 * can't be written.
 */
export function removeMarkLine(ref: MarkFileRef, id: string): Promise<boolean> {
  return enqueue(async () => {
    try {
      const raw = await readFresh(ref);
      const next = removeMarkFromContent(raw, id);
      if (next === null) {
        log('markStore: mark not found (already gone)', ref.kind, id);
        return false;
      }
      await writeAndApply(ref, next);
      log('markStore: mark removed', ref.kind, id);
      return true;
    } catch (e) {
      logError('markStore: removing mark failed', ref.kind, id, errorMessage(e));
      throw e;
    }
  });
}

/**
 * Pure: marks of an item whose folder moves from `fromFolder` to
 * `targetFolder` (archive), re-pointed to absolute paths at the new place -
 * so they still find their note from the Inbox.
 */
export function marksForMovedFolder(marks: Mark[], fromFolder: string, targetFolder: string): Mark[] {
  const from = fromFolder.replace(/\/+$/, '');
  const to = targetFolder.replace(/\/+$/, '');
  return marks.map(mark => {
    const abs = resolveMarkPath(from, mark.notePath);
    const moved = abs.startsWith(`${from}/`) ? `${to}${abs.slice(from.length)}` : abs;
    return {...mark, notePath: moved};
  });
}

/**
 * Archive (docs/dev/technical-design-lasso-0.8.md §3.10): moves the open
 * marks of the item in `itemFolder` into Inbox.txt - Inbox first, then the
 * item's `## Marks` lines are cleared - before its folder moves to
 * `targetFolder`. An archived item leaves the lists, so its marks would
 * never be seen again otherwise. Bookmarks and private data stay as they
 * are (keyed by id). Safe to run twice: ids already in the Inbox are not
 * added again. Resolves the item file's new text (null: no file).
 */
export function moveMarksToInbox(
  itemRef: MarkFileRef,
  targetFolder: string,
  inboxFolder: string,
): Promise<{moved: number; itemContent: string | null}> {
  return enqueue(async () => {
    const raw = await readTextFile(dataFilePath(itemRef.kind, itemRef.folder));
    if (raw === null) {return {moved: 0, itemContent: null};}
    const {marks, extraLines} = parseMarksSpan(raw);
    if (marks.length === 0) {return {moved: 0, itemContent: raw};}
    const inboxRef: MarkFileRef = {kind: 'inbox', folder: inboxFolder};
    let inbox = await readFresh(inboxRef);
    for (const mark of marksForMovedFolder(marks, itemRef.folder, targetFolder)) {
      inbox = addMarkToContent(inbox, 'inbox', mark);
    }
    await writeAndApply(inboxRef, inbox);
    const next = writeMarksIntoContent(raw, [], extraLines);
    await writeAndApply(itemRef, next);
    log('markStore: marks moved to the Inbox', itemRef.kind, marks.length);
    return {moved: marks.length, itemContent: next};
  });
}
