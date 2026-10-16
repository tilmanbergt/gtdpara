/**
 * Which todos the Engage panel offers for an owner, and which owners the
 * focus screens list (docs/dev/history/technical-design-engage.md §3.2). Pure.
 *
 * - `#next` first; the plan (open todos without a flow state, file order)
 *   only matters once no `#next` is left (D16). `#now` counts as `#next`.
 * - Waiting For, Someday and Maybe are never offered: not choosable now.
 * - The current todo is in the Now box, never in a list.
 * - An owner is empty with no open todo (any flow state) and no meeting ahead,
 *   the rule `closeBlockers` uses for loops.
 */
import {scopeOwnerOf} from './counterparts';
import {
  EngageItem,
  EngageOwner,
  EngageSource,
  EngageTodoKey,
  EngageTodoRef,
  ownerHomePath,
  ownerKey,
  ownerMeetings,
  ownerOfTodo,
  ownerTitle,
  ownerTodos,
  OwnerTitle,
  sameTodo,
  threadOfTags,
  todoKeyOf,
} from './engageOwner';
import {belongsToLoop, groupTodosByLoop} from './loops';
import {setFlowStateTag, setNowTag} from './flowState';
import {meetingEndMs} from './meetingTime';
import {scopeOf, threadOf} from './threads';
import {Task} from './types';

/** The flow a todo is set to from the panel: picked (`#next`), Someday, or neither (Remove #next). */
export type EngageFlowChoice = 'next' | 'someday' | null;

/**
 * A todo's text with its flow set to `flow`, through `setFlowStateTag`.
 * Leaving `#next` also drops `#now`, which is only ever layered on top of it.
 */
export function engageFlowText(text: string, flow: EngageFlowChoice): string {
  const withFlow = setFlowStateTag(text, flow);
  return flow === 'next' ? withFlow : setNowTag(withFlow, false);
}

export interface EngageOptions {
  /** Open `#next` (or `#now`) todos, file order. */
  next: EngageTodoRef[];
  /** Open todos without a flow state, file order. */
  plan: EngageTodoRef[];
  /** No open todo and no meeting ahead. */
  ownerEmpty: boolean;
}

export function isNextTask(task: Task): boolean {
  return task.flowState === 'next' || task.now;
}

function isPlanTask(task: Task): boolean {
  return task.flowState === null && !task.now;
}

export function optionsOf(owner: EngageOwner, source: EngageSource, nowMs: number, current: EngageTodoKey | null = null): EngageOptions {
  const todos = ownerTodos(owner, source);
  const listed = todos.filter(ref => !sameTodo(todoKeyOf(ref), current));
  const meetingAhead = ownerMeetings(owner, source).some(m => meetingEndMs(m) > nowMs);
  return {
    next: listed.filter(ref => isNextTask(ref.task)),
    plan: listed.filter(ref => isPlanTask(ref.task)),
    ownerEmpty: todos.length === 0 && !meetingAhead,
  };
}

/** The ring a focus screen lists: today's focus, or this week's. */
export type FocusRing = 'daily' | 'weekly';

/** Today's focus when any Active item is in it, else this week's. */
export function effectiveFocus(source: EngageSource): FocusRing {
  return source.items.some(item => item.status === 'active' && item.dailyFocus) ? 'daily' : 'weekly';
}

/** The Active items in a ring, in the focus panel's order: Projects, then Areas. */
export function focusItems(ring: FocusRing, source: EngageSource): EngageItem[] {
  const inRing = source.items.filter(item => item.status === 'active' && (ring === 'daily' ? item.dailyFocus : item.weeklyFocus));
  return [...inRing.filter(i => i.kind === 'project'), ...inRing.filter(i => i.kind === 'area')];
}

/** One line of the focus screens (S9, S11). */
export interface OwnerLine extends OwnerTitle {
  owner: EngageOwner;
  nextCount: number;
  /** No `#next` left, but a plan to pick from. */
  pickNext: boolean;
}

/** The owners inside one focused item: its active loops, its tended threads, then the item itself. */
function ownersOf(item: EngageItem, source: EngageSource): EngageOwner[] {
  const open = item.tasks.filter(t => !t.done && !t.cancelled);
  const loops = groupTodosByLoop(open, item.loops)
    .filter(g => g.loop !== null)
    .map((g): EngageOwner => ({kind: 'loop', itemPath: item.path, tag: g.loop!.tag}));
  const scopeOwner = scopeOwnerOf(item.path, source.items) ?? item;
  const tended = scopeOwner.threads.filter(l => l.status === 'active').map(l => l.leaf);
  const activeLoopTags = item.loops.filter(l => l.status === 'active').map(l => l.tag);
  const threads: EngageOwner[] = [];
  for (const task of open) {
    if (activeLoopTags.some(tag => belongsToLoop(task.tags, tag))) continue;
    const thread = threadOfTags(task.tags, source);
    if (!thread || !tended.includes(thread.counterpart)) continue;
    if (!threads.some(o => o.kind === 'thread' && o.tag === thread.tag)) {
      threads.push({kind: 'thread', scopeOwnerPath: scopeOwner.path, tag: thread.tag});
    }
  }
  return [...loops, ...threads, {kind: 'item', itemPath: item.path}];
}

function counterpartOf(owner: EngageOwner): string | null {
  return owner.kind === 'thread' ? threadOf(owner.tag)?.counterpart ?? null : null;
}

/**
 * The focus screen's owner lines for `ring`: every owner inside the ring's
 * items that has something to pick, the current owner left out. Ring order
 * around the current owner: the same counterpart first, then the same
 * Area/Project (its scope), then the rest, each block in focus panel order.
 */
export function focusOwnerLines(ring: FocusRing, current: EngageOwner | null, source: EngageSource, nowMs: number): OwnerLine[] {
  const seen = new Set<string>(current ? [ownerKey(current)] : []);
  const lines: OwnerLine[] = [];
  for (const item of focusItems(ring, source)) {
    for (const owner of ownersOf(item, source)) {
      const key = ownerKey(owner);
      if (seen.has(key)) continue;
      seen.add(key);
      const {next, plan} = optionsOf(owner, source, nowMs);
      if (next.length === 0 && plan.length === 0) continue;
      lines.push({...ownerTitle(owner, source), owner, nextCount: next.length, pickNext: next.length === 0});
    }
  }
  if (!current) return lines;
  const counterpart = counterpartOf(current);
  const home = scopeOf(ownerHomePath(current), source.items, source.inboxPath);
  const rank = (line: OwnerLine) => {
    if (counterpart !== null && counterpartOf(line.owner) === counterpart) return 0;
    return home.includes(ownerHomePath(line.owner)) ? 1 : 2;
  };
  return lines.map((line, i) => ({line, i})).sort((a, b) => rank(a.line) - rank(b.line) || a.i - b.i).map(x => x.line);
}

/** How many owners in a ring still have something to pick (the flow's "anything left?"). */
export function ownersLeft(ring: FocusRing, source: EngageSource, nowMs: number): number {
  return focusOwnerLines(ring, null, source, nowMs).length;
}

/** At most this many plan todos are offered in the prompt after a Done (R5). */
export const PROMPT_CANDIDATES = 3;

export interface NextPrompt {
  owner: EngageOwner;
  /** The first plan todos, file order. */
  candidates: EngageTodoRef[];
}

/**
 * After a todo of `itemPath` was ticked done elsewhere in gtdpara (R5): when
 * its owner has no `#next` left but a plan, the prompt's candidates; else
 * null. Asked only right after a Done, and only about the owner of what was
 * just finished (design-philosophy §5).
 */
export function nextPromptOf(itemPath: string, doneTask: Pick<Task, 'tags'>, source: EngageSource, nowMs: number): NextPrompt | null {
  const owner = ownerOfTodo({itemPath, task: doneTask}, source);
  if (!owner) return null;
  const {next, plan} = optionsOf(owner, source, nowMs);
  if (next.length > 0 || plan.length === 0) return null;
  return {owner, candidates: plan.slice(0, PROMPT_CANDIDATES)};
}
