/**
 * Writing loops (docs/dev/history/technical-design-loops.md §4.2, §4.3).
 *
 * **The loop itself becomes its line, wherever it was saved.** After every
 * write of an Area's or Project's todos (storage/dataCache.ts's tasks-written
 * hook, installed once by `installLoopConversion`), the open todos that are
 * a loop itself (domain/loops.ts's `loopItselfOf`: only a loop tag, not
 * someday/maybe) are taken out and get a `## Loops` line instead - one write
 * of the file. So "+ Add loop" and "Make loop" in Quick Add, taking someday
 * off a loop idea (Quick Add, the chips, the Weekly Review) and filing an
 * Inbox entry into an Area all end here, and no screen knows about it. The
 * Inbox has no hook: a loop tag on its own stays a todo there until filed.
 *
 * Carried over from the todo: its due date (the main date), its linked file,
 * and its own note - moved to the loop note's name in the owner's folder,
 * unless a file of that name exists. A note page in a shared file stays
 * where it is. A todo whose loop has a line already stays a todo: nothing
 * is ever dropped.
 *
 * What happened goes out as a `LoopEvent` (ui/useLoopEvents.ts shows it in
 * the status slot). Logging names kinds and counts only, never a loop.
 */
import {findLoopLine, LoopLine, newLoopLine, writeLoopsIntoContent} from '../domain/loopsSection';
import {LoopRef, loopItselfOf, loopNoteBaseName} from '../domain/loops';
import {ensureSkeleton, writeTasksIntoContent} from '../domain/markdown';
import {Task} from '../domain/types';
import {fileExists, moveFile, writeTextFile} from '../supernote/fileSystem';
import {errorMessage} from '../utils/errorMessage';
import {log, logError} from '../utils/log';
import {applyItemRawContent, CachedItem, findCachedItem, setTasksWrittenHook, updateItemLoops} from './dataCache';
import {getLoopKinds, LoopKindsState} from './loopKinds';
import {classifyNotePath, sanitizeFileNameComponent} from './noteLinks';
import {dataFilePath, saveLoops} from './projectFile';

export type LoopEvent =
  | {kind: 'started'; tag: string; owner: string; noteMovedTo: string | null}
  | {kind: 'tracked'; tag: string; owner: string}
  | {kind: 'failed'; text: string};

const listeners = new Set<(event: LoopEvent) => void>();

export function subscribeLoopEvents(listener: (event: LoopEvent) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(event: LoopEvent): void {
  listeners.forEach(listener => listener(event));
}

/** One conversion per file at a time; a write while one runs queues one more pass. */
const running = new Map<string, Promise<void>>();

/** Installs the conversion after task writes; returns the uninstall. */
export function installLoopConversion(): () => void {
  setTasksWrittenHook(path => {
    const before = running.get(path) ?? Promise.resolve();
    const next = before.then(() => convertLoopTodos(path));
    running.set(path, next);
    next.finally(() => {
      if (running.get(path) === next) running.delete(path);
    });
  });
  return () => setTasksWrittenHook(null);
}

interface Conversion {
  task: Task;
  loop: LoopRef;
}

/** The open todos of `item` that are a loop itself and whose loop has no line yet (one per loop). */
export function conversionsOf(item: Pick<CachedItem, 'tasks' | 'loops'>, kinds: readonly string[]): Conversion[] {
  const out: Conversion[] = [];
  for (const task of item.tasks) {
    const loop = loopItselfOf(task, kinds);
    if (!loop || findLoopLine(item.loops, loop.tag) || out.some(c => c.loop.tag === loop.tag)) continue;
    out.push({task, loop});
  }
  return out;
}

/** The loop note's base name for `loop` under its kind's Loop rule. */
export function loopNoteName(kinds: LoopKindsState, loop: LoopRef, mainDate: string | null): string {
  return sanitizeFileNameComponent(loopNoteBaseName(kinds.rules[loop.kind]?.sharedFileName, loop, mainDate));
}

async function carryNote(item: CachedItem, task: Task, name: string): Promise<string | null> {
  if (!task.notePath) return null;
  const note = await classifyNotePath(item.path, task.notePath);
  if (note.kind !== 'own' || !note.exists || note.isAbsoluteLink) {
    log('Loops: note not carried', note.kind);
    return null;
  }
  const target = `${item.path.replace(/\/+$/, '')}/${name}.note`;
  if (await fileExists(target)) {
    log('Loops: note not carried, name taken');
    return null;
  }
  await moveFile(note.absolutePath, target);
  return `${name}.note`;
}

async function convertLoopTodos(path: string): Promise<void> {
  const kindsState = getLoopKinds();
  if (kindsState.kinds.length === 0) return;
  const item = findCachedItem(path);
  if (!item) return;
  const conversions = conversionsOf(item, kindsState.kinds);
  if (conversions.length === 0) return;
  log('Loops: convert', conversions.length);
  try {
    const converted = new Set(conversions.map(c => c.task));
    const tasks = item.tasks.filter(t => !converted.has(t));
    const lines: LoopLine[] = [
      ...item.loops,
      ...conversions.map(c => newLoopLine(c.loop.tag, c.task.dueDate, c.task.linkedFile || null)),
    ];
    const next = writeLoopsIntoContent(
      writeTasksIntoContent(ensureSkeleton(item.rawContent, item.kind), tasks, item.taskExtraLines),
      lines,
      item.loopsExtraLines,
    );
    await writeTextFile(dataFilePath(item.kind, item.path), next);
    applyItemRawContent(item.path, next);
    for (const c of conversions) {
      let noteMovedTo: string | null = null;
      try {
        noteMovedTo = await carryNote(item, c.task, loopNoteName(kindsState, c.loop, c.task.dueDate));
      } catch (e) {
        logError('Loops: moving the note failed', errorMessage(e));
      }
      emit({kind: 'started', tag: c.loop.tag, owner: item.name, noteMovedTo});
    }
  } catch (e) {
    const message = errorMessage(e);
    logError('Loops: convert failed', message);
    emit({kind: 'failed', text: `Starting the loop failed: ${message}`});
  }
}

/** "Track" on a loop under Projects › New: writes its line. */
export async function trackLoop(ownerPath: string, tag: string): Promise<void> {
  const item = findCachedItem(ownerPath);
  if (!item) throw new Error('This Area or Project is not loaded - reload all files.');
  if (findLoopLine(item.loops, tag)) return;
  const loops = [...item.loops, newLoopLine(tag)];
  const next = await saveLoops(item.kind, item.path, item.rawContent, loops, item.loopsExtraLines);
  updateItemLoops(item.path, next, loops, item.loopsExtraLines);
  log('Loops: track');
  emit({kind: 'tracked', tag: tag.toLowerCase(), owner: item.name});
}
