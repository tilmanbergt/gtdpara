/**
 * The text labels a todo row shows after its title - `#next`, `#now`,
 * `#w/f Meier`, `#someday`, `#due 5.10.` (docs/dev/technical-design-waiting-
 * for-0.7.md §3.2). Pure, no React Native - one definition every todo row
 * (ui/TaskRow.tsx) reads, so what a label says never drifts between Daily,
 * Inbox, Current and Review.
 *
 * `context` says whether the list is grouped by flow state:
 * - 'flat' (Daily, Review's Inbox step): nothing else on screen says a todo is
 *   Next or Waiting For, so the label does.
 * - 'grouped' (Current's and the Inbox tab's Todos): the section heading
 *   already names the flow state, so the label leaves it out. A waiting
 *   name still shows - the heading doesn't say who.
 *
 * `displayTaskText` removes exactly the tags a label (or the heading) already
 * shows from the title, so nothing appears twice. `task.text` itself is never
 * changed - this is display only.
 */
import {formatDate} from './dateFormat';
import {setFlowStateTag, setNowTag, titleCaseSlug} from './flowState';
import {setDueInLine} from './markdown';
import {Task} from './types';

export type TaskLabelContext = 'flat' | 'grouped';

export type TaskLabelKind = 'next' | 'now' | 'waiting' | 'someday' | 'due' | 'overdue';

export interface TaskLabel {
  kind: TaskLabelKind;
  text: string;
}

/** Longest waiting name shown in a label before it is shortened with "…". */
export const WAITING_NAME_MAX_CHARS = 20;

function waitingLabel(task: Task): string {
  if (!task.waitingOn) return '#w/f';
  const name = titleCaseSlug(task.waitingOn);
  const short = name.length > WAITING_NAME_MAX_CHARS ? `${name.slice(0, WAITING_NAME_MAX_CHARS - 1).trimEnd()}…` : name;
  return short ? `#w/f ${short}` : '#w/f';
}

/**
 * The labels for `task`, flow state first, then due date. `contextActive` is
 * true only when Daily's tag filter produced the list - the one way a
 * Someday todo reaches a flat list.
 */
export function taskLabels(task: Task, context: TaskLabelContext, today: string, contextActive = false): TaskLabel[] {
  const labels: TaskLabel[] = [];
  if (context === 'flat') {
    if (task.flowState === 'next') labels.push(task.now ? {kind: 'now', text: '#now'} : {kind: 'next', text: '#next'});
    if (task.flowState === 'waiting-for') labels.push({kind: 'waiting', text: waitingLabel(task)});
    if (task.flowState === 'someday' && contextActive) labels.push({kind: 'someday', text: '#someday'});
  } else if (task.flowState === 'waiting-for' && task.waitingOn) {
    labels.push({kind: 'waiting', text: waitingLabel(task)});
  }
  if (task.dueDate) {
    const overdue = task.dueDate < today;
    labels.push(
      overdue
        ? {kind: 'overdue', text: `#due ${formatDate(task.dueDate, today)} !`}
        : {kind: 'due', text: `#due ${formatDate(task.dueDate, today)}`},
    );
  }
  return labels;
}

/**
 * Whether `task`'s flow state is already shown by a label or by its section
 * heading - then its tag is left out of the title. Mirrors `taskLabels`: in
 * a grouped list the heading always shows it; in a flat list Next and
 * Waiting For always get a label, Someday only under an active tag filter,
 * Maybe never (it doesn't reach a flat list).
 */
export function isFlowStateConveyed(task: Task, context: TaskLabelContext, contextActive = false): boolean {
  if (!task.flowState) return false;
  if (context === 'grouped') return true;
  if (task.flowState === 'next' || task.flowState === 'waiting-for') return true;
  if (task.flowState === 'someday' && contextActive) return true;
  return false;
}

/**
 * `task.text` without the tags its labels (or heading) already show: the due
 * tag always (its label always shows), the flow-state tag when conveyed, and
 * `#now` when the `#next`/`#now` label shows (flat context, Next).
 */
export function displayTaskText(task: Task, context: TaskLabelContext, contextActive = false): string {
  const withoutDue = task.dueDate ? setDueInLine(task.text, null) : task.text;
  const withoutFlowState = isFlowStateConveyed(task, context, contextActive)
    ? setFlowStateTag(withoutDue, null)
    : withoutDue;
  const nowConveyed = context === 'flat' && task.flowState === 'next';
  return nowConveyed ? setNowTag(withoutFlowState, false) : withoutFlowState;
}
