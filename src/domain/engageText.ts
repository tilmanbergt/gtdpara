/**
 * Every user-visible string of the Engage panel
 * (docs/dev/history/technical-design-engage.md §3.12), so a wording change is
 * one file. Pure.
 */
import {formatDate, formatDayHeader} from './dateFormat';
import {OwnerLine} from './engageOptions';
import {titleCaseSlug} from './flowState';
import {Task} from './types';

export const ENGAGE_TEXT = {
  /** The owner pages' button (Project, Area, loop, thread). */
  ownerButton: 'Engage ›',
  heading: 'Engage next',
  workingOn: 'Working on',
  nextAction: 'Next action',
  pickBelow: 'Pick your next action below.',
  makeNext: '#next',
  noOtherNext: 'No other next action.',
  emptyPlan: 'Nothing in the plan.',
  done: 'Done',
  removeNext: 'Remove #next',
  someday: 'Someday',
  undo: 'Undo',
  nothingToPick: 'Nothing to pick right now.',
  closeLoop: 'Close loop…',
  addTodo: '+ Add todo',
  quickAdd: '+ Quick Add',
  selectNextFocus: 'Select next focus ›',
  selectNewFocus: 'Select new focus ›',
  todayFocus: "Today's focus",
  weekFocus: "This week's focus",
  noFocusLines: 'Nothing to pick in this focus.',
  beyondWeek: "Anything beyond this week's focus: Open gtdpara.",
  allDone: "All done in today's focus.",
  openGtdpara: 'Open gtdpara',
  close: 'Close',
  cancel: 'Cancel',
  openNote: 'Note ›',
  newNote: '+ Note',
  back: '‹ Back',
} as const;

/** S8's signal. */
export function nothingLeftText(ownerName: string): string {
  return `Nothing left in ${ownerName}.`;
}

/** The ack line's verb for each action (S5). */
export function ackLabel(kind: 'done' | 'someday' | 'unnext' | 'next'): string {
  switch (kind) {
    case 'done':
      return 'Done:';
    case 'someday':
      return 'Someday:';
    case 'unnext':
      return 'No longer #next:';
    case 'next':
      return 'Now #next:';
  }
}

/** The way back to the todo you worked on in another owner (Addendum "Engage follows the note"). */
export function backLineText(ownerName: string, todoTitle: string): string {
  return `↩ ${ownerName} · ${todoTitle}`;
}

/** The options screen's tab labels, with the rows each lists. */
export function tabLabel(tab: 'next' | 'plan', rows: number): string {
  return `${tab === 'next' ? 'Next' : 'Plan'} ${rows}`;
}

/** The marks line (S6/S8): marks belong to a Project or Area, so it names that item; empty for none. */
export function marksLineText(count: number, itemName: string): string {
  if (count === 0) return '';
  return `${count} mark${count === 1 ? '' : 's'} to process in ${itemName} ›`;
}

/** One owner line of S9/S11: "Kind · Name · 2 next ›" or "· pick next ›". */
export function ownerLineText(line: Pick<OwnerLine, 'kindLabel' | 'name' | 'nextCount' | 'pickNext'>): string {
  const what = line.pickNext ? 'pick next' : `${line.nextCount} next`;
  return `${line.kindLabel} · ${line.name} · ${what} ›`;
}

/** The status-slot errors and notices of the panel. */
export const ENGAGE_NOTICE = {
  undoStale: 'The todo changed meanwhile - nothing undone.',
  promptLater: 'Later',
} as const;

/** A todo as a button in the prompt (R5): its title, shortened to fit the 36 dp slot. */
export function promptTodoLabel(title: string, maxChars = 22): string {
  const t = title.trim();
  return t.length <= maxChars ? t : `${t.slice(0, maxChars - 1).trimEnd()}…`;
}

/** The candidate prompt after a Done elsewhere in gtdpara (R5). */
export function noNextPromptText(ownerName: string): string {
  return `${ownerName} has no next action. Pick one:`;
}

/**
 * The Now box's details line (D11 follow-up): what is set of the due date
 * (or a Waiting For's counterpart and follow-up date) and the meeting the
 * todo was agreed in; empty when none is set. Dates through dateFormat.
 */
export function nowDetailsText(task: Pick<Task, 'flowState' | 'waitingOn' | 'dueDate' | 'fields'>, today: string): string {
  const parts: string[] = [];
  if (task.flowState === 'waiting-for') {
    const who = task.waitingOn ? titleCaseSlug(task.waitingOn) : '';
    parts.push(`Waiting for${who ? ` ${who}` : ''}${task.dueDate ? ` · follow up ${formatDate(task.dueDate, today)}` : ''}`);
  } else if (task.dueDate) {
    parts.push(`Due ${formatDate(task.dueDate, today)}${task.dueDate < today ? ' - overdue' : ''}`);
  }
  const key = task.fields.meeting;
  if (key) {
    const m = /^(\d{4}-\d{2}-\d{2})\s+(.*)$/.exec(key.trim());
    parts.push(m ? `Agreed in ${m[2]} · ${formatDayHeader(m[1], today)}` : `Agreed in ${key.trim()}`);
  }
  return parts.join('   ');
}

/** The Now box's linked-file button: "File: <name> ›", page links without their `#page=N`. */
export function linkedFileButtonText(linkedFile: string): string {
  const name = linkedFile.replace(/#page=\d+$/, '').split('/').pop() ?? linkedFile;
  return `File: ${name} ›`;
}
