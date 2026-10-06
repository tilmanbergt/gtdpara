/**
 * "Mark for later" - the flow behind the lasso toolbar's Mark button
 * (docs/dev/technical-design-lasso-0.8.md §3.6). It runs from index.js
 * without any gtdpara screen (`showType: 0`), so it never relies on the
 * data cache being there.
 *
 * Order (the line in project.txt / area.txt / Inbox.txt is the commit point):
 *   1. read the lasso once (strokes, text boxes, page, rect)
 *   2. picture of the lasso into the mark's private folder
 *   3. remove the lasso
 *   4. bookmark icon into the note, save the note
 *   5. mark.json (strokes etc.)
 *   6. the `## Marks` line - if that fails, the icon and data are removed again
 *
 * The outcome is silent when everything worked. Otherwise it is kept in
 * `markOutcome` for App's small result screen (opened via showPluginView).
 */
import {findEnclosingItem} from '../domain/settings';
import {isEmptyLasso, readLasso, saveLassoPreview} from '../supernote/lassoRead';
import {setLassoBoxState} from '../supernote/lasso';
import {changeMarkIcon, insertBookmark} from '../supernote/markIcons';
import {ensureFolderExists, readTextFile} from '../supernote/fileSystem';
import {collectOpenMarks, MARK_DATA_VERSION, markCreatedAt, markOwner, MarkScope, newMarkId, OpenMark, PxRect} from '../domain/marks';
import {RecognitionResult, recognizeStrokes} from '../supernote/strokeRecognition';
import {Mark} from '../domain/types';
import {log, logError, logWarn} from '../utils/log';
import {findCachedItem, getCachedData, getCachedInbox, resolveLivePaths} from './dataCache';
import {
  addPendingIconChange,
  cleanOrphanedMarkData,
  deleteMarkData,
  markDataFolder,
  markPicturePath,
  PendingIconChange,
  readMarkData,
  readPendingIconChanges,
  writeMarkData,
  writePendingIconChanges,
} from './markData';
import {addMarkLine, markFileRef, markNotePathFor, removeMarkLine} from './markStore';
import {dataFilePath} from './projectFile';
import {loadSettings} from './settingsStorage';

export type MarkOutcome =
  | {kind: 'saved'; id: string}
  /** Saved, but the bookmark isn't in the note. */
  | {kind: 'iconMissing'; id: string; page: number; rect: PxRect | null; detail: string}
  | {kind: 'empty'}
  | {kind: 'failed'; detail: string};

// ---- the outcome App shows (module state: index.js runs without App) ----

let outcome: MarkOutcome | null = null;
const listeners = new Set<() => void>();

/** The last outcome that needs a screen, or null. */
export function getMarkOutcome(): MarkOutcome | null {
  return outcome;
}

export function setMarkOutcome(next: MarkOutcome | null): void {
  outcome = next;
  Array.from(listeners).forEach(l => l());
}

export function subscribeMarkOutcome(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Whether an outcome needs the small screen (success is silent). */
export function outcomeNeedsScreen(o: MarkOutcome): boolean {
  return o.kind !== 'saved';
}

// ---- the flow ----

let running = false;

async function ownerFor(absNotePath: string) {
  const settings = await loadSettings();
  const paths = await resolveLivePaths(settings);
  const enclosing = findEnclosingItem(paths, absNotePath);
  let exists = false;
  if (enclosing) {
    exists = getCachedData()
      ? !!findCachedItem(enclosing.path)
      : (await readTextFile(dataFilePath(enclosing.kind, enclosing.path))) !== null;
  }
  const owner = markOwner(paths, absNotePath, p => exists && p === enclosing?.path);
  return markFileRef(owner, paths);
}

/** The Mark button. Never throws. */
export async function createMarkFromLasso(now = new Date()): Promise<MarkOutcome> {
  if (running) {
    logWarn('marks: Mark already running - press ignored');
    return {kind: 'failed', detail: 'A mark is still being saved.'};
  }
  running = true;
  const t0 = Date.now();
  const id = newMarkId(now);
  let iconPlaced = false;
  let path: string | null = null;
  let page: number | null = null;
  try {
    const snap = await readLasso();
    path = snap.path;
    page = snap.page;
    if (isEmptyLasso(snap)) {
      log('marks: empty lasso', id);
      return {kind: 'empty'};
    }
    if (!path || page == null) {
      return {kind: 'failed', detail: 'Could not tell which note and page the lasso is on.'};
    }

    await ensureFolderExists(await markDataFolder(id));
    const picture = await saveLassoPreview(await markPicturePath(id));

    try {
      await setLassoBoxState(2);
    } catch (e) {
      logWarn('marks: removing the lasso failed', e instanceof Error ? e.message : String(e));
    }

    const icon = snap.rect ? await insertBookmark(page, snap.rect, id) : null;
    iconPlaced = !!icon?.placed;

    await writeMarkData({
      version: MARK_DATA_VERSION,
      id,
      path,
      page,
      rect: snap.rect,
      displaySize: snap.displaySize,
      pageSize: snap.pageSize,
      textBoxText: snap.textBoxText,
      strokes: snap.strokes,
      icon: icon ? {box: icon.box, placed: icon.placed} : null,
    });

    const ref = await ownerFor(path);
    const mark: Mark = {
      id,
      createdAt: markCreatedAt(now),
      notePath: markNotePathFor(ref, path),
      page,
      // Only text-box marks have text before recognition.
      text: snap.strokes.length === 0 && snap.textBoxText ? snap.textBoxText : null,
    };
    await addMarkLine(ref, mark);

    log(
      'marks: saved',
      id,
      ref.kind,
      `strokes=${snap.strokes.length}`,
      `textBoxChars=${snap.textBoxText.length}`,
      `picture=${picture !== null}`,
      `icon=${iconPlaced}`,
      `totalMs=${Date.now() - t0}`,
    );
    if (!iconPlaced) {
      return {kind: 'iconMissing', id, page, rect: snap.rect, detail: icon?.error ?? 'no lasso rect'};
    }
    return {kind: 'saved', id};
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    logError('marks: saving failed', id, detail);
    // Not saved: take back what is already there.
    if (iconPlaced && path && page != null) {await changeMarkIcon({id, path, page}, 'remove', path);}
    await deleteMarkData(id);
    return {kind: 'failed', detail};
  } finally {
    running = false;
  }
}

/** "Try icon again" on the result screen: the mark is saved, only the bookmark is missing. */
export async function retryBookmark(id: string): Promise<boolean> {
  const data = await readMarkData(id);
  if (!data?.rect) {return false;}
  const icon = await insertBookmark(data.page, data.rect, id);
  if (icon.placed) {
    try {
      await writeMarkData({...data, icon: {box: icon.box, placed: true}});
    } catch {
      // the icon is in the note; the flag is informational
    }
  }
  return icon.placed;
}

// ---- processing marks (docs/dev/technical-design-lasso-0.8.md §3.7, §3.8, §3.10) ----

/** Open marks in `scope`, from the cache (empty while there is none). */
export function listOpenMarks(scope: MarkScope): OpenMark[] {
  const cache = getCachedData();
  if (!cache) return [];
  return collectOpenMarks(cache.items, getCachedInbox(), cache.paths.inboxFolder, scope);
}

/**
 * Recognizes a mark from its saved strokes (shifted copies, §3.4) - once:
 * the result is kept in its mark.json and returned from there next time. A
 * mark that only holds text-box text needs no recognition. `missing` = the
 * private data is gone (e.g. after reinstalling) - the line still works,
 * the text has to be typed.
 */
export async function recognizeMark(open: OpenMark): Promise<RecognitionResult & {missing: boolean}> {
  const data = await readMarkData(open.mark.id);
  if (!data) {
    return {text: open.mark.text ?? '', error: open.mark.text ? null : 'mark data missing', ms: 0, missing: true};
  }
  if (data.recognizedText) {
    return {text: data.recognizedText, error: null, ms: 0, missing: false};
  }
  const result = await recognizeStrokes(data.strokes, data.textBoxText, data.displaySize ?? data.pageSize, data.page);
  if (result.text.trim()) {
    try {
      await writeMarkData({...data, recognizedText: result.text});
    } catch (e) {
      logWarn('marks: keeping recognized text failed', open.mark.id, e instanceof Error ? e.message : String(e));
    }
  }
  return {...result, missing: false};
}

export interface FinishResult {
  /** The line was still there (false: already removed, e.g. by hand). */
  removed: boolean;
  iconOk: boolean;
  iconDetail: string;
}

/**
 * After Save ('done': bookmark becomes the check icon) or Discard ('remove':
 * icon removed): removes the `## Marks` line first (the mark is processed
 * once that is written), then changes the icon - a failure there is queued
 * for later, never an error - and deletes the private data.
 * Throws only when the line can't be written.
 */
export async function finishMark(open: OpenMark, change: 'done' | 'remove', currentPath: string | null): Promise<FinishResult> {
  const cache = getCachedData();
  const inboxFolder = cache?.paths.inboxFolder ?? (await resolveLivePaths(await loadSettings())).inboxFolder;
  const removed = await removeMarkLine(markFileRef(open.owner, {inboxFolder}), open.mark.id);
  const icon = await changeMarkIcon({id: open.mark.id, path: open.absPath, page: open.mark.page}, change, currentPath);
  if (!icon.ok && icon.retry) {
    await addPendingIconChange({id: open.mark.id, path: open.absPath, page: open.mark.page, change});
  }
  await deleteMarkData(open.mark.id);
  log('marks: finished', open.mark.id, change, `removed=${removed}`, `icon=${icon.ok}`, icon.detail);
  return {removed, iconOk: icon.ok, iconDetail: icon.detail};
}

/** Retries queued icon changes for the note open right now (only that note can be changed safely). Never throws. */
export async function runPendingIconChanges(currentPath: string | null): Promise<void> {
  if (!currentPath) return;
  try {
    const pending = await readPendingIconChanges();
    if (pending.length === 0) return;
    const left: PendingIconChange[] = [];
    for (const p of pending) {
      if (p.path !== currentPath) {
        left.push(p);
        continue;
      }
      const r = await changeMarkIcon({id: p.id, path: p.path, page: p.page}, p.change, currentPath);
      if (!r.ok && r.retry) left.push(p);
    }
    if (left.length !== pending.length) await writePendingIconChanges(left);
  } catch (e) {
    logWarn('marks: pending icon changes failed', e instanceof Error ? e.message : String(e));
  }
}

/** Deletes private data of marks that have no line any more (older than a day). Never throws. */
export async function cleanMarkDataOrphans(): Promise<void> {
  try {
    if (!getCachedData()) return;
    const open = new Set(listOpenMarks({type: 'all'}).map(m => m.mark.id));
    await cleanOrphanedMarkData(open);
  } catch (e) {
    logWarn('marks: orphan cleanup failed', e instanceof Error ? e.message : String(e));
  }
}

/** Recognized text kept from an earlier open (null when there is none yet). Cheap: one small file read. */
export async function storedMarkText(open: OpenMark): Promise<string | null> {
  if (open.mark.text) {return open.mark.text;}
  const data = await readMarkData(open.mark.id);
  return data?.recognizedText || null;
}
