/**
 * Editing a loop (docs/dev/history/technical-design-loops.md §1.3, §4.6):
 * what Quick Add's loop edit saves, and the pure rewrites a rename needs.
 * Pure.
 *
 * - The edit is a todo line that is only the loop's tag, with the main date
 *   as its due date (`parseLoopEdit`); the loop overview hands Quick Add the
 *   loop as such a todo (`loopAsTodo`).
 * - A new tag renames the loop in its owner: every todo and meeting tagged
 *   with it, or below it, gets the new tag (`retagEntries`).
 * - A new loop note name moves the note; every link into it - own note,
 *   page link or shared-page anchor - follows (`renameNoteFile`).
 */
import {deriveMeetingFields} from './markdown';
import {LoopLine} from './loopsSection';
import {belongsToLoop, LoopRef, loopItselfOf} from './loops';
import {newTask, parseTaskInput, withTaskText} from './taskEdit';
import {emptyTaskFields} from './taskLine';
import {Meeting, Task} from './types';

export interface LoopEdit {
  loop: LoopRef;
  mainDate: string | null;
}

/** The loop a Quick Add line names when it is only a loop tag (plus a date); null otherwise. */
export function parseLoopEdit(line: string, kinds: readonly string[]): LoopEdit | null {
  if (kinds.length === 0 || !line.trim()) return null;
  const task = newTask(parseTaskInput(line));
  const loop = loopItselfOf(task, kinds);
  return loop ? {loop, mainDate: task.dueDate} : null;
}

/** The loop's line as the todo Quick Add edits: its tag, the main date as due date, its file. */
export function loopAsTodo(line: LoopLine): Task {
  return newTask({text: `#${line.tag}`, fields: {...emptyTaskFields(), due: line.mainDate}, linkedFile: line.linkedFile ?? ''});
}

/** A Quick Add line with the loop's tag added before its trailing fields, unless it carries it already. */
export function withLoopTag(line: string, tag: string): string {
  const trimmed = line.trim();
  const {text, fields} = parseTaskInput(trimmed);
  if (belongsToLoop(newTask({text, fields}).tags, tag)) return trimmed;
  return `${text} #${tag}${trimmed.slice(text.length)}`;
}

/** A meeting title with the loop's tag added, unless it carries it already. */
export function titleWithLoopTag(title: string, tag: string): string {
  const trimmed = title.trim();
  return belongsToLoop(deriveMeetingFields(trimmed).tags, tag) ? trimmed : `${trimmed} #${tag}`;
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** `text` with `#oldTag` and `#oldTag/…` written as `#newTag` / `#newTag/…`; other tags untouched. */
export function retagText(text: string, oldTag: string, newTag: string): string {
  const re = new RegExp(`#${escapeRegExp(oldTag)}(?=$|/|[^\\w/-])`, 'gi');
  return text.replace(re, `#${newTag}`);
}

/** The todos and meetings with the loop's tag renamed, and how many changed. */
export function retagEntries(
  tasks: readonly Task[],
  meetings: readonly Meeting[],
  oldTag: string,
  newTag: string,
): {tasks: Task[]; meetings: Meeting[]; changed: number} {
  let changed = 0;
  const nextTasks = tasks.map(task => {
    const text = retagText(task.text, oldTag, newTag);
    if (text === task.text) return task;
    changed++;
    return withTaskText(task, text);
  });
  const nextMeetings = meetings.map(meeting => {
    const title = retagText(meeting.title, oldTag, newTag);
    if (title === meeting.title) return meeting;
    changed++;
    return {...meeting, title, ...deriveMeetingFields(title)};
  });
  return {tasks: nextTasks, meetings: nextMeetings, changed};
}

/**
 * `notePath` pointing at `newFile` when it pointed at `oldFile` (both
 * relative to the owner, e.g. `2026-11 workshop offsite.note`): the plain
 * note, a `#page=<n>` link or a `#<keyword>` anchor. Unchanged otherwise.
 */
export function renameNoteFile(notePath: string, oldFile: string, newFile: string): string {
  if (notePath === oldFile) return newFile;
  return notePath.startsWith(`${oldFile}#`) ? `${newFile}${notePath.slice(oldFile.length)}` : notePath;
}

/** Every todo's and meeting's note link moved from `oldFile` to `newFile`; how many changed. */
export function renameNoteLinks(
  tasks: readonly Task[],
  meetings: readonly Meeting[],
  oldFile: string,
  newFile: string,
): {tasks: Task[]; meetings: Meeting[]; changed: number} {
  let changed = 0;
  const move = <T extends {notePath: string}>(entry: T): T => {
    const notePath = renameNoteFile(entry.notePath, oldFile, newFile);
    if (notePath === entry.notePath) return entry;
    changed++;
    return {...entry, notePath};
  };
  return {tasks: tasks.map(move), meetings: meetings.map(move), changed};
}
