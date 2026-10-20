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
 * Editing a loop (`updateLoop`, §4.6): a new tag renames the loop in its
 * owner - every todo and meeting with the tag gets the new one - and a new
 * loop note name moves the note, with the links into it. Each is asked in
 * the status slot first; declining one saves nothing.
 *
 * Closing (`setLoopStatus`, §4.9): Done or Dropped only while the loop has
 * no open todo and no meeting ahead; reopening sets it active again. The
 * note and the todos stay where they are.
 *
 * What happened goes out as a `LoopEvent` (ui/useLoopEvents.ts shows it in
 * the status slot). Logging names kinds and counts only, never a loop.
 */
import {ConfirmText} from '../domain/fileChangeText';
import {LoopEdit, renameNoteLinks, retagEntries} from '../domain/loopEdit';
import {findLoopLine, LOOPS_HEADING, LoopLine, LoopStatus, newLoopLine, withLoopLine, writeLoopsIntoContent} from '../domain/loopsSection';
import {closeBlockedText, closeBlockers, LoopRef, loopItselfOf, loopNoteBaseName, loopOf} from '../domain/loops';
import {DATA_FILE_HEADINGS, writeMeetingsIntoContent, writeTasksIntoContent} from '../domain/markdown';
import {Task} from '../domain/types';
import {fileExists, moveFile} from '../supernote/fileSystem';
import {errorMessage} from '../utils/errorMessage';
import {log, logError} from '../utils/log';
import {applyItemRawContent, CachedItem, findCachedItem, setTasksWrittenHook, updateItemLoops} from './dataCache';
import {writeDataFile} from './dataFileWrite';
import {getLoopKinds, LoopKindsState} from './loopKinds';
import {NoteSetup} from '../domain/noteSetups';
import {NoteOwnerNames} from '../domain/sharedNotePages';
import {classifyNotePath, sanitizeFileNameComponent} from './noteLinks';
import {noteOwnerNames} from './noteOwner';
import {dataFilePath, saveLoops} from './projectFile';

export type LoopEvent =
  | {kind: 'started'; tag: string; owner: string; noteMovedTo: string | null}
  | {kind: 'tracked'; tag: string; owner: string}
  | {kind: 'saved'; tag: string; renamedFrom: string | null; noteRenamedTo: string | null}
  | {kind: 'status'; tag: string; status: LoopStatus}
  | {kind: 'linked'; tag: string; file: string}
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

/** The loop note's base name for `loop` of the item at `ownerPath` under its kind's Loop setup. */
export function loopNoteName(kinds: LoopKindsState, loop: LoopRef, mainDate: string | null, ownerPath: string): string {
  return loopNoteFileName(kinds.setups[loop.kind] ?? null, loop, mainDate, noteOwnerNames(ownerPath));
}

/** The loop note's base name for `loop` under `setup` (its note name; the default name without one). */
export function loopNoteFileName(setup: Pick<NoteSetup, 'notebook'> | null, loop: LoopRef, mainDate: string | null, owner: NoteOwnerNames): string {
  return sanitizeFileNameComponent(loopNoteBaseName(setup?.notebook?.name, loop, mainDate, owner));
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
    const next = await writeDataFile(item.kind, item.path, dataFilePath(item.kind, item.path), item.rawContent, {
      parts: [DATA_FILE_HEADINGS.tasks, LOOPS_HEADING],
      apply: content => writeLoopsIntoContent(writeTasksIntoContent(content, tasks, item.taskExtraLines), lines, item.loopsExtraLines),
    });
    applyItemRawContent(item.path, next);
    for (const c of conversions) {
      let noteMovedTo: string | null = null;
      try {
        noteMovedTo = await carryNote(item, c.task, loopNoteName(kindsState, c.loop, c.task.dueDate, item.path));
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

/** The loop note's file name in its owner (`<name>.note`). */
export function loopNoteFile(kinds: LoopKindsState, loop: LoopRef, mainDate: string | null, ownerPath: string): string {
  return `${loopNoteName(kinds, loop, mainDate, ownerPath)}.note`;
}

function ownerFile(item: CachedItem, file: string): string {
  return `${item.path.replace(/\/+$/, '')}/${file}`;
}

/**
 * Saves the loop edit `next` (tag, main date) and `linkedFile` for the loop
 * `oldTag` of `ownerPath`. `ask` shows a confirm in the status slot; false
 * from it (or a refused rename) leaves everything as it was and resolves
 * false.
 */
export async function updateLoop(
  ownerPath: string,
  oldTag: string,
  next: LoopEdit,
  linkedFile: string,
  ask: (text: ConfirmText) => Promise<boolean>,
): Promise<boolean> {
  const before = findCachedItem(ownerPath);
  if (!before) throw new Error('This Area or Project is not loaded - reload all files.');
  const beforeLine = findLoopLine(before.loops, oldTag);
  if (!beforeLine) throw new Error(`Loop ${oldTag} has no line in ${before.name}.`);
  const kindsState = getLoopKinds();
  const oldLoop = loopOf(beforeLine.tag, kindsState.kinds) ?? next.loop;
  const newTag = next.loop.tag;
  const tagChanged = newTag !== beforeLine.tag;
  if (tagChanged && findLoopLine(before.loops, newTag)) throw new Error(`Loop ${newTag} exists already in ${before.name}.`);

  // The questions first; the confirms stay open while the file may change elsewhere.
  if (tagChanged) {
    const {changed} = retagEntries(before.tasks, before.meetings, beforeLine.tag, newTag);
    const ok = await ask({
      text: `Rename loop ${beforeLine.tag} to ${newTag}?`,
      detail: `${changed} todo${changed === 1 ? '' : 's'} and meetings in ${before.name} get the new tag.`,
      actionLabel: 'Rename',
    });
    if (!ok) return false;
  }
  const oldFile = loopNoteFile(kindsState, oldLoop, beforeLine.mainDate, before.path);
  const newFile = loopNoteFile(kindsState, next.loop, next.mainDate, before.path);
  const moveNote = oldFile !== newFile && (await fileExists(ownerFile(before, oldFile)));
  if (moveNote) {
    if (await fileExists(ownerFile(before, newFile))) throw new Error(`A note named ${newFile} exists already in ${before.name}.`);
    const ok = await ask({
      text: `Rename the loop note to ${newFile}?`,
      detail: `${oldFile} → ${newFile}, in ${before.name}. Links to it follow.`,
      actionLabel: 'Rename note',
    });
    if (!ok) return false;
  }

  // Then the edit, on the file as it is now.
  const item = findCachedItem(ownerPath);
  const line = item ? findLoopLine(item.loops, beforeLine.tag) : undefined;
  if (!item || !line) throw new Error(`Loop ${beforeLine.tag} changed in the meantime - open it again.`);
  let {tasks, meetings} = tagChanged ? retagEntries(item.tasks, item.meetings, line.tag, newTag) : item;
  if (moveNote) ({tasks, meetings} = renameNoteLinks(tasks, meetings, oldFile, newFile));
  const loops = withLoopLine(item.loops, line.tag, l => ({...l, tag: newTag, mainDate: next.mainDate, linkedFile: linkedFile || null}));
  const parts: string[] = [LOOPS_HEADING];
  if (tasks !== item.tasks) parts.push(DATA_FILE_HEADINGS.tasks);
  if (meetings !== item.meetings) parts.push(DATA_FILE_HEADINGS.meetings);
  const apply = (raw: string): string => {
    let content = raw;
    if (tasks !== item.tasks) content = writeTasksIntoContent(content, tasks, item.taskExtraLines);
    if (meetings !== item.meetings) content = writeMeetingsIntoContent(content, meetings, item.meetingExtraLines);
    return writeLoopsIntoContent(content, loops, item.loopsExtraLines);
  };

  // The note moves first; if the file then can't be written, it moves back, so links and note agree.
  if (moveNote) await moveFile(ownerFile(item, oldFile), ownerFile(item, newFile));
  let content: string;
  try {
    content = await writeDataFile(item.kind, item.path, dataFilePath(item.kind, item.path), item.rawContent, {parts, apply});
  } catch (e) {
    if (moveNote) {
      await moveFile(ownerFile(item, newFile), ownerFile(item, oldFile)).catch(back =>
        logError('Loops: moving the note back failed', errorMessage(back)),
      );
    }
    throw e;
  }
  applyItemRawContent(item.path, content);
  if (tagChanged) log('Loops: rename tag');
  if (moveNote) log('Loops: rename note');
  emit({kind: 'saved', tag: newTag, renamedFrom: tagChanged ? line.tag : null, noteRenamedTo: moveNote ? newFile : null});
  return true;
}

/** Closes (done, dropped) or reopens (active) the loop `tag` of `ownerPath`; closing throws while something is open. */
export async function setLoopStatus(ownerPath: string, tag: string, status: LoopStatus, now: Date = new Date()): Promise<void> {
  const item = findCachedItem(ownerPath);
  if (!item) throw new Error('This Area or Project is not loaded - reload all files.');
  const line = findLoopLine(item.loops, tag);
  if (!line) throw new Error(`Loop ${tag} has no line in ${item.name}.`);
  if (status !== 'active') {
    const blockers = closeBlockers(item, line.tag, now.getTime());
    if (blockers.openTodos.length + blockers.upcomingMeetings.length > 0) {
      log('Loops: close blocked', blockers.openTodos.length, blockers.upcomingMeetings.length);
      throw new Error(closeBlockedText(blockers.openTodos.length, blockers.upcomingMeetings.length));
    }
  }
  const loops = withLoopLine(item.loops, line.tag, l => ({...l, status}));
  const next = await saveLoops(item.kind, item.path, item.rawContent, loops, item.loopsExtraLines);
  updateItemLoops(item.path, next, loops, item.loopsExtraLines);
  log('Loops: status', status);
  emit({kind: 'status', tag: line.tag, status});
}

/** Links `linkedFile` (as storage/linkedFiles.ts stores it) to the loop `tag` of `ownerPath`: its line's file column. */
export async function setLoopLinkedFile(ownerPath: string, tag: string, linkedFile: string): Promise<void> {
  const item = findCachedItem(ownerPath);
  if (!item) throw new Error('This Area or Project is not loaded - reload all files.');
  const line = findLoopLine(item.loops, tag);
  if (!line) throw new Error(`Loop ${tag} has no line in ${item.name}.`);
  const loops = withLoopLine(item.loops, line.tag, l => ({...l, linkedFile}));
  const next = await saveLoops(item.kind, item.path, item.rawContent, loops, item.loopsExtraLines);
  updateItemLoops(item.path, next, loops, item.loopsExtraLines);
  log('Loops: link file');
  emit({kind: 'linked', tag: line.tag, file: linkedFile.slice(linkedFile.lastIndexOf('/') + 1)});
}
