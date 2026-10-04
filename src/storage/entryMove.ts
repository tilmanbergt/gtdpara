/**
 * Moving a todo or meeting together with its note (docs/dev/technical-design-
 * files-0.6.md §3.4). Every place that moves an entry to another Project,
 * Area or the Inbox (Inbox filing, quick-file on edit, Current's Refile,
 * close-out's checklist) runs its own append-then-remove write inside
 * `moveEntryWithNote`, which first takes care of the note:
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
import {Meeting, Task} from '../domain/types';
import {displayPath, ensureFolderExists, moveFile} from '../supernote/fileSystem';
import {log, logError} from '../utils/log';
import {collisionFreeName} from './fileNaming';
import {classifyNotePath} from './noteLinks';

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
    logError('moveEntryWithNote: data write failed after the note moved', to, e instanceof Error ? e.message : String(e));
    throw e;
  }
  ui.done(noteMoveDoneText(title, target.name));
  return true;
}
