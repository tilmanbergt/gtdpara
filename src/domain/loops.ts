/**
 * Loops (docs/dev/history/technical-design-loops.md): a loop is a todo that
 * needed more than one step - a small project inside an Area or a Project,
 * named by the tag `#<kind>/<name>`. The kinds are the tags of the enabled
 * Tag Rules with context `loop`. Its status line lives in the owner's
 * `## Loops` section (domain/loopsSection.ts). Pure.
 *
 * - Only the full tag counts (no plain-leaf matching, unlike counterparts).
 * - A todo whose text is only a loop tag (plus `#next`/`#now`, a due date, a
 *   linked file) and that isn't someday/maybe is the loop itself, not a todo
 *   of it (§1.3): it becomes the loop's line (storage/loops.ts). With
 *   someday/maybe it is a "loop idea" and stays a todo.
 */
import {stripAllTags} from './markdown';
import {meetingEndMs} from './meetingTime';
import {renderSharedFileName} from './sharedNotePages';
import {LOOP_NOTE_NAME_DEFAULT} from './tagRules';
import {newTask, parseTaskInput} from './taskEdit';
import {threadOf} from './threads';
import {LoopLine} from './loopsSection';
import {Meeting, Task} from './types';

/** One loop: `tag` is always `kind/name`, lowercased. */
export interface LoopRef {
  kind: string;
  name: string;
  tag: string;
}

/** What a rule needs for `loopKindsOf` (a TagRule fits). */
export interface LoopKindRule {
  enabled: boolean;
  /** Absent counts as not a Loop rule. */
  context?: string;
  tags: readonly string[];
}

/** The loop kinds: the tags of every enabled Loop rule, lowercased, without `#`, once each. */
export function loopKindsOf(rules: readonly LoopKindRule[]): string[] {
  const kinds: string[] = [];
  for (const rule of rules) {
    if (!rule.enabled || rule.context !== 'loop') continue;
    for (const raw of rule.tags) {
      const kind = raw.replace(/^#/, '').trim().toLowerCase();
      if (kind && !kind.includes('/') && !kinds.includes(kind)) kinds.push(kind);
    }
  }
  return kinds;
}

/** The loop a tag names (deeper segments are dropped), or null when its first segment is not a kind. */
export function loopOf(tag: string, kinds: readonly string[]): LoopRef | null {
  const thread = threadOf(tag);
  if (!thread || !kinds.includes(thread.type)) return null;
  return {kind: thread.type, name: thread.counterpart, tag: thread.tag};
}

/** The loops among `tags`, once each, in order. */
export function loopsOfTags(tags: readonly string[], kinds: readonly string[]): LoopRef[] {
  const out: LoopRef[] = [];
  for (const tag of tags) {
    const loop = loopOf(tag, kinds);
    if (loop && !out.some(l => l.tag === loop.tag)) out.push(loop);
  }
  return out;
}

/** Tags a todo may carry besides its loop tag and still be the loop itself. */
const LOOP_ITSELF_TAGS = ['next', 'now'];

/**
 * The loop `task` is, when it is the loop itself rather than a todo of it:
 * open, no words besides tags, exactly one loop tag, no other tags than
 * `#next`/`#now`, and not someday/maybe. Null otherwise.
 */
export function loopItselfOf(task: Task, kinds: readonly string[]): LoopRef | null {
  if (task.done || task.cancelled) return null;
  if (task.flowState === 'someday' || task.flowState === 'maybe') return null;
  if (stripAllTags(task.text) !== '') return null;
  const tags = task.tags.map(t => t.toLowerCase());
  const loops = loopsOfTags(tags, kinds);
  if (loops.length !== 1) return null;
  const others = tags.filter(t => loopOf(t, kinds)?.tag !== loops[0].tag);
  return others.every(t => LOOP_ITSELF_TAGS.includes(t)) ? loops[0] : null;
}

/** `loopItselfOf` for a composed Quick Add line (text plus trailing fields). */
export function loopItselfOfLine(line: string, kinds: readonly string[]): LoopRef | null {
  if (kinds.length === 0 || !line.trim()) return null;
  const {text, fields} = parseTaskInput(line);
  return loopItselfOf(newTask({text, fields}), kinds);
}

/** A loop idea: a todo that would be the loop itself, but is someday/maybe. */
export function isLoopIdea(task: Task, kinds: readonly string[]): LoopRef | null {
  if (task.flowState !== 'someday' && task.flowState !== 'maybe') return null;
  return loopItselfOf({...task, flowState: null, tags: task.tags.filter(t => t !== 'someday' && t !== 'maybe')}, kinds);
}

/** Whether `tags` belong to the loop: its tag itself or one nested below it. */
export function belongsToLoop(tags: readonly string[], loopTag: string): boolean {
  const key = loopTag.toLowerCase();
  return tags.some(raw => {
    const tag = raw.toLowerCase();
    return tag === key || tag.startsWith(`${key}/`);
  });
}

/** The todos and meetings of `item` that belong to the loop `loopTag` (cancelled meetings left out). */
export function loopMembers(
  item: {tasks: readonly Task[]; meetings: readonly Meeting[]},
  loopTag: string,
): {tasks: Task[]; meetings: Meeting[]} {
  return {
    tasks: item.tasks.filter(t => belongsToLoop(t.tags, loopTag)),
    meetings: item.meetings.filter(m => !m.cancelled && belongsToLoop(m.tags, loopTag)),
  };
}

/** What keeps a loop from being closed (§4.9): its open todos and its meetings that are not over yet. */
export function closeBlockers(
  item: {tasks: readonly Task[]; meetings: readonly Meeting[]},
  loopTag: string,
  nowMs: number,
): {openTodos: Task[]; upcomingMeetings: Meeting[]} {
  const members = loopMembers(item, loopTag);
  return {
    openTodos: members.tasks.filter(t => !t.done && !t.cancelled),
    upcomingMeetings: members.meetings.filter(m => meetingEndMs(m) > nowMs),
  };
}

/** What the status slot says when a loop cannot close yet (§4.9). */
export function closeBlockedText(openTodos: number, upcomingMeetings: number): string {
  const parts = [
    ...(openTodos > 0 ? [`${openTodos} open todo${openTodos === 1 ? '' : 's'}`] : []),
    ...(upcomingMeetings > 0 ? [`${upcomingMeetings} upcoming meeting${upcomingMeetings === 1 ? '' : 's'}`] : []),
  ];
  return `${parts.join(', ')} - move, retag or finish them first`;
}

/** Whether a todo is active enough to offer its loop under "New": `#next`, `#now` or a due date, open. */
function isActiveTodo(task: Task): boolean {
  return !task.done && !task.cancelled && (task.flowState === 'next' || task.now || task.dueDate !== null);
}

/**
 * The loops in use in `item` without a line of their own (§1.3, "New"): a
 * loop tag on an active todo, or on a meeting that is not cancelled. Plain
 * filed todos and someday/maybe never count. In first-seen order.
 */
export function loopsInUse(
  item: {tasks: readonly Task[]; meetings: readonly Meeting[]; loops: readonly LoopLine[]},
  kinds: readonly string[],
): LoopRef[] {
  const known = new Set(item.loops.map(l => l.tag));
  const out: LoopRef[] = [];
  const add = (tags: readonly string[]) => {
    for (const loop of loopsOfTags(tags.map(t => t.toLowerCase()), kinds)) {
      if (!known.has(loop.tag) && !out.some(l => l.tag === loop.tag)) out.push(loop);
    }
  };
  item.tasks.filter(isActiveTodo).forEach(t => add(t.tags));
  item.meetings.filter(m => !m.cancelled).forEach(m => add(m.tags));
  return out;
}

/** The loop ideas of `item` (bare loop tag + someday/maybe) whose loop has no line yet. */
export function loopIdeas(
  item: {tasks: readonly Task[]; loops: readonly LoopLine[]},
  kinds: readonly string[],
): LoopRef[] {
  const known = new Set(item.loops.map(l => l.tag));
  const out: LoopRef[] = [];
  for (const task of item.tasks) {
    const idea = isLoopIdea(task, kinds);
    if (idea && !known.has(idea.tag) && !out.some(l => l.tag === idea.tag)) out.push(idea);
  }
  return out;
}

/**
 * The loop note's base name (no folder, no ".note"): the Loop rule's note
 * name with `{tag}` = kind, `{subtag}` = name and the date placeholders from
 * the main date (left out without one). Sanitizing is the caller's job, as
 * for every file name.
 */
export function loopNoteBaseName(template: string | undefined, loop: LoopRef, mainDate: string | null): string {
  return renderSharedFileName({
    template: template?.trim() ? template : LOOP_NOTE_NAME_DEFAULT,
    ruleName: `${loop.kind} ${loop.name}`,
    tag: loop.kind,
    subtag: loop.name,
    date: mainDate ?? '',
  });
}

/** A run of todos under one heading: a loop (by its line, main date first) or the rest. */
export interface TodoGroup<T> {
  loop: LoopLine | null;
  todos: T[];
}

/**
 * Groups `todos` by the active loops of their file (§4.7): one group per
 * loop that has todos, ordered by main date (loops without one last, then
 * by tag), then the todos of no active loop. Order inside a group is kept.
 */
export function groupTodosByLoop<T extends {tags: readonly string[]}>(todos: readonly T[], loops: readonly LoopLine[]): TodoGroup<T>[] {
  const active = loops
    .filter(l => l.status === 'active')
    .slice()
    .sort((a, b) => (a.mainDate ?? '9999').localeCompare(b.mainDate ?? '9999') || a.tag.localeCompare(b.tag));
  const groups: TodoGroup<T>[] = active.map(loop => ({loop, todos: []}));
  const rest: T[] = [];
  for (const todo of todos) {
    const group = groups.find(g => g.loop && belongsToLoop(todo.tags, g.loop.tag));
    if (group) group.todos.push(todo);
    else rest.push(todo);
  }
  const out = groups.filter(g => g.todos.length > 0);
  if (rest.length > 0) out.push({loop: null, todos: rest});
  return out;
}
