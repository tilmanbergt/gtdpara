/**
 * Every user-visible string of the Engage panel
 * (docs/dev/history/technical-design-engage.md §3.12), so a wording change is
 * one file. Pure.
 */
import {OwnerLine} from './engageOptions';

export const ENGAGE_TEXT = {
  /** The owner pages' button (Project, Area, loop, thread). */
  ownerButton: 'Engage ›',
  heading: 'Engage next',
  workingOn: 'Working on',
  done: 'Done',
  removeNext: 'Remove #next',
  someday: 'Someday',
  undo: 'Undo',
  planIntro: 'No next action left. Pick one from the plan:',
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
  back: '‹ Back',
} as const;

/** S8's signal. */
export function nothingLeftText(ownerName: string): string {
  return `Nothing left in ${ownerName}.`;
}

/** The ack line's verb for each action (S5). */
export function ackLabel(kind: 'done' | 'someday' | 'unnext'): string {
  return kind === 'done' ? 'Done:' : kind === 'someday' ? 'Someday:' : 'No longer #next:';
}

/** The marks line (S6/S8); empty for none. */
export function marksLineText(count: number, ownerKind: 'item' | 'loop' | 'thread'): string {
  if (count === 0) return '';
  const where = ownerKind === 'loop' ? 'in this loop' : ownerKind === 'thread' ? 'in this scope' : 'here';
  return `${count} mark${count === 1 ? '' : 's'} to process ${where} ›`;
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

/** The candidate prompt after a Done elsewhere in gtdpara (R5). */
export function noNextPromptText(ownerName: string): string {
  return `${ownerName} has no next action. Pick one:`;
}
