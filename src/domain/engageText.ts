/**
 * Every user-visible string of the Engage panel
 * (docs/dev/history/technical-design-engage.md §3.12), so a wording change is
 * one file. Pure.
 */
import {formatDate, formatDayHeader, formatTime} from './dateFormat';
import {OwnerLine} from './engageOptions';
import {titleCaseSlug} from './flowState';
import {stripAllTags} from './markdown';
import {meetingDisplayTitle} from './meetingTracking';
import {Meeting, Task} from './types';

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
  beyondWeek: "Anything beyond this week's focus: Open Kept GTD.",
  allDone: "All done in today's focus.",
  openGtdpara: 'Open Kept GTD',
  close: 'Close',
  cancel: 'Cancel',
  openNote: 'Note ›',
  newNote: '+ Note',
  back: '‹ Back',
  alsoHere: 'Also here:',
  overview: 'Overview ›',
  waitingRow: '· waiting',
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

/** The way back to the todo you worked on in another owner (Addendum "Engage follows the note"); the line cuts it to fit. */
/** The way to the owner's home notebook (docs/dev/history/technical-design-home-notebooks.md §3.6); `fileName` without ".note". */
export function goToNotebookText(fileName: string): string {
  return `Go to ${fileName} ›`;
}

export function backLineText(todoTitle: string): string {
  return `Continue with ${todoTitle}`;
}

/** The From tab's name by owner (docs/dev/history/technical-design-meetings-0.21.md R9). */
export function fromTabName(ownerKind: 'item' | 'loop' | 'thread'): string {
  return ownerKind === 'thread' ? 'From Thread' : ownerKind === 'loop' ? 'From Loop' : 'From meetings';
}

const TAB_NAMES = {next: 'Next', plan: 'Plan', waiting: 'Waiting', agreements: 'Agreements'} as const;

/** The options screen's tab labels, with the rows each lists ("From Thread 3", "Next 2"). */
export function tabLabel(tab: 'from' | 'next' | 'plan' | 'waiting' | 'agreements', rows: number, ownerKind: 'item' | 'loop' | 'thread' = 'item'): string {
  return `${tab === 'from' ? fromTabName(ownerKind) : TAB_NAMES[tab]} ${rows}`;
}

/** A meeting's title without tags ("Sparring Mieke"). */
function plainMeetingTitle(meeting: Pick<Meeting, 'title'>): string {
  const display = meetingDisplayTitle(meeting);
  return stripAllTags(display) || display;
}

/** A From group's caption (R10): "Tue 14.10. · Sparring Mieke", "today · Sparring Mieke". */
export function fromCaption(meeting: Pick<Meeting, 'title' | 'date'>, today: string): string {
  return `${meeting.date === today ? 'today' : formatDayHeader(meeting.date, today)} · ${plainMeetingTitle(meeting)}`;
}

/** A Waiting row's origin (R11): "from 14.10." for one agreed in a meeting. */
export function fromMeetingText(meeting: Pick<Meeting, 'date'>, today: string): string {
  return `from ${formatDate(meeting.date, today)}`;
}

/** The "Also here" count (E7): Someday and Maybe; null hides the line. */
export function alsoHereParts(someday: number): {someday: string | null} {
  return {someday: someday > 0 ? `${someday} someday` : null};
}

/** "Next here: Thu 23.10. 10:00 Sparring Mieke ›" (E8), with "· next today" when it is also today's next meeting. */
export function nextHereText(meeting: Pick<Meeting, 'title' | 'date' | 'time'>, today: string, alsoToday: boolean): string {
  const when = `${formatDayHeader(meeting.date, today)}${meeting.time ? ` ${formatTime(meeting.time)}` : ''}`;
  return `Next here: ${when} ${plainMeetingTitle(meeting)}${alsoToday ? ' · next today' : ''} ›`;
}

/** At most this far ahead, Today next says how long until it starts (E9). */
export const TODAY_NEXT_RELATIVE_MS = 3 * 60 * 60 * 1000;

/** "in 40 min", "in 2 h 5 min", "now" for one that has begun. */
function startsIn(ms: number): string {
  if (ms <= 0) return 'now';
  const minutes = Math.ceil(ms / 60000);
  if (minutes < 60) return `in ${minutes} min`;
  const rest = minutes % 60;
  return `in ${Math.floor(minutes / 60)} h${rest > 0 ? ` ${rest} min` : ''}`;
}

/** "Today next: 14:00 Retro demand · in 40 min" (E9): the relative part only under 3 hours away. */
export function todayNextText(meeting: Pick<Meeting, 'title' | 'time'>, startMs: number, nowMs: number): string {
  const until = startMs - nowMs;
  return `Today next: ${formatTime(meeting.time)} ${plainMeetingTitle(meeting)}${until < TODAY_NEXT_RELATIVE_MS ? ` · ${startsIn(until)}` : ''}`;
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
