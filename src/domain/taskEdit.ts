/**
 * The one way to produce a new or changed Task
 * (docs/dev/history/technical-design-tending-threads.md §3.1.2). Every
 * helper keeps the derived fields (`tags`, `dueDate`, `flowState`,
 * `waitingOn`, `now`) consistent with `text` and `fields`, so no caller
 * spreads `deriveTaskFields` itself and no field is lost on an edit. Pure.
 */
import {deriveTaskFields, setDueInLine} from './markdown';
import {emptyTaskFields, splitTrailingFields} from './taskLine';
import {Task, TaskFields} from './types';

/** A task with `text` and `fields` set and everything derived from them. */
function withTextAndFields(task: Task, text: string, fields: TaskFields): Task {
  return {...task, text, fields, ...deriveTaskFields(text, fields.due)};
}

/**
 * A new open task. `fields` defaults to none; storage/itemMutations.ts's
 * `buildTask` is the caller that adds `created`.
 */
export function newTask(input: {text: string; fields?: TaskFields; notePath?: string; linkedFile?: string}): Task {
  const fields = input.fields ?? emptyTaskFields();
  return {
    text: input.text,
    done: false,
    cancelled: false,
    ...deriveTaskFields(input.text, fields.due),
    notePath: input.notePath ?? '',
    linkedFile: input.linkedFile ?? '',
    fields,
  };
}

/** New text (tags typed or changed); fields are kept. */
export function withTaskText(task: Task, text: string): Task {
  return withTextAndFields(task, text, task.fields);
}

/** Sets or clears the due date (`[due:: …]`) and strips a legacy `#due:` tag from the text. */
export function withTaskDue(task: Task, due: string | null): Task {
  return withTextAndFields(task, setDueInLine(task.text, null), {...task.fields, due});
}

/**
 * Checks or unchecks a todo: done writes `[completion:: today]` (an already
 * recorded completion date is kept), undone clears it.
 */
export function withTaskDone(task: Task, done: boolean, today: string): Task {
  const completion = done ? (task.done && task.fields.completion ? task.fields.completion : today) : null;
  return {...task, done, fields: {...task.fields, completion}};
}

/** Cancels (soft delete) or restores a todo. */
export function withTaskCancelled(task: Task, cancelled: boolean): Task {
  return {...task, cancelled};
}

/**
 * Splits a composed line (text plus trailing fields, as
 * domain/quickAddCompose.ts's `composeTaskText` returns it) into its text
 * and fields.
 */
export function parseTaskInput(lineText: string): {text: string; fields: TaskFields} {
  const {text, fields} = splitTrailingFields(lineText.trim());
  return {text: text.trim(), fields};
}

/**
 * `task` with a Quick Add edit applied: the text and the due date come from
 * the composed line (Quick Add always composes the due date, so a missing
 * `[due:: …]` clears it); any other field present in the line replaces the
 * stored one, everything else (`created`, `meeting`, `completion`, unknown
 * fields) is kept.
 */
export function applyTaskInput(task: Task, composedText: string): Task {
  const {text, fields} = parseTaskInput(composedText);
  const stored = task.fields;
  return withTextAndFields(task, text, {
    meeting: fields.meeting ?? stored.meeting,
    created: fields.created ?? stored.created,
    due: fields.due,
    completion: fields.completion ?? stored.completion,
    extra: fields.extra.length > 0 ? fields.extra : stored.extra,
  });
}
