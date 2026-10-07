/**
 * Moving a todo or meeting to another Project, Area or the Inbox, together
 * with its note (docs/dev/history/technical-design-files-0.6.md §3.4). Every move in
 * the app (Inbox filing, quick-file on edit, Current's Refile, Daily/Week
 * refile, close-out's checklist) calls `moveTask`/`moveMeeting`, which run
 * the write inside `moveEntryWithNote`. That first takes care of the note:
 *
 * 1. Plan (domain/noteRelocation.ts): none / missing / own / shared.
 * 2. Confirm in the status slot, only when a note file is affected (own note
 *    exists, or a shared page exists). ✕ cancels the whole move: nothing is
 *    written, `false` is returned.
 * 3. Move an own note file first (collision-free name in the target's
 *    Todos/Meetings folder). A failed note move stops before any data file
 *    is written.
 * 4. `write(entry)` with the new notePath - the caller's own append to the
 *    target, then removal from the source (a failure there leaves a
 *    duplicate, never a loss; the note is then already in the target folder,
 *    which the entry written to the target points to).
 * 5. Report in the status slot when the note moved.
 *
 * Linked files (`+[[…]]`, relative to the base root) and absolute links are
 * unaffected by a move and stay as they are.
 */
import {ConfirmText, noteMoveConfirmText, noteMoveDoneText} from '../domain/fileChangeText';
import {planNoteRelocation, relocatedNotePath} from '../domain/noteRelocation';
import {meetingDisplayTitle} from '../domain/meetingTracking';
import {Destination} from '../domain/destination';
import {GtdParaKind, Meeting, Task} from '../domain/types';
import {displayPath, ensureFolderExists, moveFile} from '../supernote/fileSystem';
import {log, logError} from '../utils/log';
import {getCachedData, getCachedInbox, setCachedInbox} from './dataCache';
import {collisionFreeName} from './fileNaming';
import {
  addMeetingToDestination,
  addTaskToDestination,
  InboxContext,
  MutationResult,
  mutateEntryMeetings,
  mutateEntryTasks,
} from './itemMutations';
import {classifyNotePath} from './noteLinks';
import {loadProjectFile} from './projectFile';
import {errorMessage} from '../utils/errorMessage';

/** The screen side of a move: a status-slot confirm and a success message (ui/useEntryMoveUi.ts). */
export interface EntryMoveUi {
  confirm: (text: ConfirmText) => Promise<boolean>;
  done: (text: string) => void;
}

export interface EntryMove<T extends Task | Meeting> {
  entry: T;
  entryKind: 'task' | 'meeting';
  /** The folder the entry's notePath is relative to now (its Project/Area folder, or the Inbox folder). */
  sourceFolder: string;
  /** Where it goes: the target's folder and the name shown to the user. */
  target: {path: string; name: string};
}

function titleOf(entry: Task | Meeting, entryKind: 'task' | 'meeting'): string {
  const raw = entryKind === 'meeting' ? meetingDisplayTitle(entry as Meeting) : (entry as Task).text;
  const text = raw.replace(/\s+/g, ' ').trim();
  return text.length > 40 ? `${text.slice(0, 39)}…` : text;
}

function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}

function folderOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}

/**
 * Runs `write` with the entry as it should be stored in the target (notePath
 * updated), after confirming and moving its note where needed. Returns false
 * when the user cancelled (nothing written), true after `write` ran.
 */
export async function moveEntryWithNote<T extends Task | Meeting>(
  move: EntryMove<T>,
  ui: EntryMoveUi,
  write: (entry: T) => Promise<void>,
): Promise<boolean> {
  const {entry, entryKind, sourceFolder, target} = move;
  const sameFolder = sourceFolder.replace(/\/+$/, '') === target.path.replace(/\/+$/, '');
  if (!entry.notePath || sameFolder) {
    await write(entry);
    return true;
  }
  const plan = planNoteRelocation(entry.notePath, await classifyNotePath(sourceFolder, entry.notePath), target.path);
  const what = entryKind === 'meeting' ? 'meeting' : 'todo';
  const title = titleOf(entry, entryKind);

  if (plan.kind === 'none' || plan.kind === 'missing') {
    await write(entry);
    return true;
  }

  if (plan.kind === 'shared') {
    if (plan.exists) {
      const ok = await ui.confirm(
        noteMoveConfirmText({kind: 'shared', what, title, targetName: target.name, noteFile: baseName(plan.file), fromDisplay: displayPath(plan.file)}),
      );
      if (!ok) return false;
    }
    await write({...entry, notePath: plan.newNotePath});
    log('moveEntryWithNote: shared page link kept', plan.newNotePath, '->', target.path);
    return true;
  }

  const fileName = `${plan.stem}${plan.ext}`;
  const ok = await ui.confirm(
    noteMoveConfirmText({
      kind: 'own',
      what,
      title,
      targetName: target.name,
      noteFile: fileName,
      fromDisplay: displayPath(folderOf(plan.from)),
      toDisplay: displayPath(plan.toFolder),
    }),
  );
  if (!ok) return false;

  await ensureFolderExists(plan.toFolder);
  const newName = await collisionFreeName(plan.toFolder, plan.stem, plan.ext);
  const to = `${plan.toFolder}/${newName}`;
  await moveFile(plan.from, to);
  log('moveEntryWithNote: note moved', plan.from, '->', to);
  try {
    await write({...entry, notePath: relocatedNotePath(plan, newName)});
  } catch (e) {
    logError('moveEntryWithNote: data write failed after the note moved', to, errorMessage(e));
    throw e;
  }
  ui.done(noteMoveDoneText(title, target.name));
  return true;
}

/** Where a moved entry lives now: a Project/Area folder, or the Inbox folder (kind `inbox`). */
export interface EntrySource {
  kind: GtdParaKind;
  path: string;
}

/** Where it goes: the Inbox, or a Project/Area. */
export type MoveTarget = Destination;

/** A Project/Area pick (filing picker, abbreviation quick-file) as a MoveTarget. */
export function itemTarget(t: {kind: 'project' | 'area'; name: string; path: string}): MoveTarget {
  return {type: 'item', kind: t.kind, name: t.name, path: t.path};
}

const NOT_LOADED = 'Files not loaded yet - Settings → Advanced → Reload all files.';

function inboxFolder(): string {
  const folder = getCachedData()?.paths.inboxFolder;
  if (!folder) throw new Error(NOT_LOADED);
  return folder;
}

/** The shared Inbox for a write, loaded first when no screen has read it yet. */
async function inboxContext(): Promise<InboxContext> {
  const inboxPath = inboxFolder();
  let inbox = getCachedInbox();
  if (!inbox) {
    inbox = await loadProjectFile('inbox', inboxPath);
    setCachedInbox(inbox);
  }
  return {inbox, inboxPath};
}

function applyInbox(result: MutationResult): void {
  if (result.nextInbox) setCachedInbox(result.nextInbox);
}

function targetFolder(target: MoveTarget): {path: string; name: string} {
  return target.type === 'inbox' ? {path: inboxFolder(), name: 'Inbox'} : {path: target.path, name: target.name};
}

/**
 * Moves the task at `index` in `source` to `target`, stored as `updated`
 * (the row's task, or its edited version for "save, but file elsewhere").
 * Appends to the target first, then removes from the source: a failure in
 * between leaves a duplicate, never a loss. Files, the shared cache and the
 * shared Inbox are all updated, so screens just re-render. Returns the task
 * as written to the target, or null when the user cancelled the note confirm.
 */
export async function moveTask(source: EntrySource, index: number, updated: Task, target: MoveTarget, ui: EntryMoveUi): Promise<Task | null> {
  let written: Task | null = null;
  await moveEntryWithNote({entry: updated, entryKind: 'task', sourceFolder: source.path, target: targetFolder(target)}, ui, async moved => {
    applyInbox(await addTaskToDestination(moved, target, await inboxContext()));
    applyInbox(
      await mutateEntryTasks({item: source, taskIndex: index, task: updated}, tasks => tasks.filter((_, i) => i !== index), await inboxContext()),
    );
    written = moved;
  });
  if (written) log('moveTask:', source.path, index, '->', targetFolder(target).name);
  return written;
}

/** Meeting counterpart of moveTask. */
export async function moveMeeting(
  source: EntrySource,
  index: number,
  updated: Meeting,
  target: MoveTarget,
  ui: EntryMoveUi,
): Promise<Meeting | null> {
  let written: Meeting | null = null;
  await moveEntryWithNote({entry: updated, entryKind: 'meeting', sourceFolder: source.path, target: targetFolder(target)}, ui, async moved => {
    applyInbox(await addMeetingToDestination(moved, target, await inboxContext()));
    applyInbox(
      await mutateEntryMeetings(
        {item: source, meetingIndex: index, meeting: updated},
        meetings => meetings.filter((_, i) => i !== index),
        await inboxContext(),
      ),
    );
    written = moved;
  });
  if (written) log('moveMeeting:', source.path, index, '->', targetFolder(target).name);
  return written;
}
