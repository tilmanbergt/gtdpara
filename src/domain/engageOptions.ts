/**
 * Which todos the Engage panel offers for an owner, and which owners the
 * focus screens list (docs/dev/history/technical-design-engage.md §3.2). Pure.
 *
 * - `#next` first; the plan (open todos without a flow state) only matters
 *   once no `#next` is left (D16). `#now` counts as `#next`. For threads and
 *   loops "I owe" comes first, file order inside
 *   (docs/dev/history/technical-design-engage-in-context.md E5).
 * - Waiting For, Someday and Maybe are never offered: not choosable now; the
 *   "Also here" counts name them (E7).
 * - The Agreed tab lists what was agreed in the page's meeting, else in a
 *   thread's or loop's latest meeting that is over (E6).
 * - The current todo is in the Now box, never in a list.
 * - An owner is empty with no open todo (any flow state) and no meeting ahead,
 *   the rule `closeBlockers` uses for loops.
 */
import {scopeOwnerOf} from './counterparts';
import {
  EngageItem,
  EngageItemRef,
  EngageOwner,
  EngageSource,
  EngageTodoKey,
  EngageTodoRef,
  itemRefOf,
  MeetingEntryRef,
  MeetingRef,
  ownerHomePath,
  ownerKey,
  ownerMeetings,
  ownerOfTodo,
  ownerTitle,
  ownerTodos,
  OwnerTitle,
  OwnerTodoRef,
  sameTodo,
  threadOfTodo,
  todoKeyOf,
} from './engageOwner';
import {isLoopMember} from './loops';
import {isSomedayMaybe, setFlowStateTag, setNowTag} from './flowState';
import {meetingEndMs, meetingStartMs, todayIso} from './meetingTime';
import {scopeOf, threadOf} from './threads';
import {Meeting, Task} from './types';

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

/** The todos agreed in one meeting (E6). */
export interface AgreedList {
  meeting: MeetingEntryRef;
  rows: OwnerTodoRef[];
}

export interface EngageOptions {
  /** Open `#next` (or `#now`) todos: "I owe" before the rest for threads and loops, file order inside (E5). */
  next: OwnerTodoRef[];
  /** Open todos without a flow state, the same order. */
  plan: OwnerTodoRef[];
  /** The Agreed tab (E6); null = no tab. */
  agreed: AgreedList | null;
  /** What the panel leaves out (E7): Waiting For, and Someday + Maybe. */
  alsoHere: {waiting: number; someday: number};
  /** The owner's next meeting that is not over, any date (E8). */
  nextMeeting: MeetingEntryRef | null;
  /** No open todo and no meeting ahead. */
  ownerEmpty: boolean;
}

export function isNextTask(task: Task): boolean {
  return task.flowState === 'next' || task.now;
}

function isPlanTask(task: Task): boolean {
  return task.flowState === null && !task.now;
}

const sameMeeting = (a: MeetingRef | null, b: MeetingRef | null) => a !== null && b !== null && a.itemPath === b.itemPath && a.meetingIndex === b.meetingIndex;

/** "I owe" first for threads and loops (agreed first for loops), stable; Areas and Projects keep file order (E5). */
function ordered(owner: EngageOwner, todos: OwnerTodoRef[]): OwnerTodoRef[] {
  if (owner.kind === 'item') return todos;
  return todos.map((todo, i) => ({todo, i})).sort((a, b) => (a.todo.relation === 'owe' ? 0 : 1) - (b.todo.relation === 'owe' ? 0 : 1) || a.i - b.i).map(x => x.todo);
}

/** The meeting at `ref` as an entry, from the items or the Inbox. */
function meetingEntryAt(ref: MeetingRef, source: EngageSource): MeetingEntryRef | null {
  const item = source.items.find(i => i.path === ref.itemPath);
  const meeting = item?.meetings[ref.meetingIndex];
  return item && meeting ? {item: itemRefOf(item), meetingIndex: ref.meetingIndex, meeting} : null;
}

/**
 * The Agreed tab (E6, D8): the open todos agreed in the reference meeting,
 * file order, without Someday/Maybe and the current todo. Reference = the
 * page's meeting when it has rows; else, for a thread or loop, its latest
 * meeting that is over, when that has rows.
 */
function agreedOf(owner: EngageOwner, todos: OwnerTodoRef[], meetings: MeetingEntryRef[], source: EngageSource, nowMs: number, current: EngageTodoKey | null, pageMeeting: MeetingRef | null): AgreedList | null {
  const candidates = todos.filter(t => !isSomedayMaybe(t.task) && !sameTodo(todoKeyOf(t), current));
  const rowsOf = (ref: MeetingRef) => candidates.filter(t => sameMeeting(t.agreedIn, ref));
  if (pageMeeting) {
    const rows = rowsOf(pageMeeting);
    const meeting = meetingEntryAt(pageMeeting, source);
    if (rows.length > 0 && meeting) return {meeting, rows};
  }
  if (owner.kind === 'item') return null;
  const latest = meetings
    .filter(m => meetingEndMs(m.meeting) <= nowMs)
    .reduce<MeetingEntryRef | null>((best, m) => (!best || meetingStartMs(m.meeting) > meetingStartMs(best.meeting) ? m : best), null);
  if (!latest) return null;
  const rows = rowsOf({itemPath: latest.item.path, meetingIndex: latest.meetingIndex});
  return rows.length > 0 ? {meeting: latest, rows} : null;
}

/** The earliest-starting entry, or null. */
function earliest(entries: MeetingEntryRef[]): MeetingEntryRef | null {
  return entries.reduce<MeetingEntryRef | null>((best, m) => (!best || meetingStartMs(m.meeting) < meetingStartMs(best.meeting) ? m : best), null);
}

export function optionsOf(
  owner: EngageOwner,
  source: EngageSource,
  nowMs: number,
  current: EngageTodoKey | null = null,
  pageMeeting: MeetingRef | null = null,
): EngageOptions {
  const todos = ownerTodos(owner, source);
  const meetings = ownerMeetings(owner, source);
  const listed = ordered(owner, todos.filter(ref => !sameTodo(todoKeyOf(ref), current)));
  const ahead = meetings.filter(m => meetingEndMs(m.meeting) > nowMs);
  return {
    next: listed.filter(ref => isNextTask(ref.task)),
    plan: listed.filter(ref => isPlanTask(ref.task)),
    agreed: agreedOf(owner, todos, meetings, source, nowMs, current, pageMeeting),
    alsoHere: {
      waiting: todos.filter(t => t.task.flowState === 'waiting-for').length,
      someday: todos.filter(t => isSomedayMaybe(t.task)).length,
    },
    nextMeeting: earliest(ahead),
    ownerEmpty: todos.length === 0 && ahead.length === 0,
  };
}

/**
 * The next timed meeting today that is not over, across every Project, Area
 * and the Inbox (E9); cancelled and untimed ones never count. Information
 * only: computed when asked, never by a timer.
 */
export function todayNextMeeting(source: EngageSource, nowMs: number): MeetingEntryRef | null {
  const today = todayIso(new Date(nowMs));
  const entries: MeetingEntryRef[] = [];
  const add = (item: EngageItemRef, meetings: readonly Meeting[]) =>
    meetings.forEach((meeting, meetingIndex) => {
      if (!meeting.cancelled && meeting.time && meeting.date === today && meetingEndMs(meeting) > nowMs) entries.push({item, meetingIndex, meeting});
    });
  source.items.forEach(item => add(itemRefOf(item), item.meetings));
  if (source.inbox) add({kind: 'inbox', name: 'Inbox', path: source.inbox.path, abbrev: null}, source.inbox.meetings);
  return earliest(entries);
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
  // Active loops by main date (loops without one last, then by tag), like the page's todo groups.
  const activeLoopTags = item.loops
    .filter(l => l.status === 'active')
    .slice()
    .sort((a, b) => (a.mainDate ?? '9999').localeCompare(b.mainDate ?? '9999') || a.tag.localeCompare(b.tag))
    .map(l => l.tag);
  const loops = activeLoopTags
    .filter(tag => open.some(task => isLoopMember(item, tag, task)))
    .map((tag): EngageOwner => ({kind: 'loop', itemPath: item.path, tag}));
  const scopeOwner = scopeOwnerOf(item.path, source.items) ?? item;
  const tended = scopeOwner.threads.filter(l => l.status === 'active').map(l => l.leaf);
  const threads: EngageOwner[] = [];
  for (const task of open) {
    if (activeLoopTags.some(tag => isLoopMember(item, tag, task))) continue;
    // Its own thread tag, else the thread of the meeting it was agreed in (E4).
    const thread = threadOfTodo(item.path, task, source);
    if (!thread || thread.kind !== 'thread' || !tended.includes(threadOf(thread.tag)?.counterpart ?? '')) continue;
    if (!threads.some(o => ownerKey(o) === ownerKey(thread))) threads.push(thread);
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
  const home = scopeOf(ownerHomePath(current), source.items, source.inbox?.path ?? null);
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
  /** The first plan todos, in the panel's order. */
  candidates: OwnerTodoRef[];
}

/**
 * After a todo of `itemPath` was ticked done elsewhere in gtdpara (R5): when
 * its owner has no `#next` left but a plan, the prompt's candidates; else
 * null. Asked only right after a Done, and only about the owner of what was
 * just finished (design-philosophy §5).
 */
export function nextPromptOf(itemPath: string, doneTask: Pick<Task, 'tags' | 'fields'>, source: EngageSource, nowMs: number): NextPrompt | null {
  const owner = ownerOfTodo({itemPath, task: doneTask}, source);
  if (!owner) return null;
  const {next, plan} = optionsOf(owner, source, nowMs);
  if (next.length > 0 || plan.length === 0) return null;
  return {owner, candidates: plan.slice(0, PROMPT_CANDIDATES)};
}

/** What the options screen shows (Addendum "Next and Plan tabs"): the Now box todo and the two tabs' rows. */
export interface EngageLists {
  /** The Now box todo: the current one, else the owner's only `#next`; null otherwise. */
  nowTodo: EngageTodoRef | null;
  /** 'current' (stored, you work on it) or 'single' (shown because it is the only `#next`). */
  nowKind: 'current' | 'single' | null;
  /** The Next tab: `#next` todos other than the Now box todo. */
  next: EngageTodoRef[];
  /** The Plan tab. */
  plan: EngageTodoRef[];
}

/** `options` (current todo already left out) with the current todo resolved; a single `#next` moves up into the Now box. */
export function engageListsOf(options: EngageOptions, current: EngageTodoRef | null): EngageLists {
  if (current) return {nowTodo: current, nowKind: 'current', next: options.next, plan: options.plan};
  if (options.next.length === 1) return {nowTodo: options.next[0], nowKind: 'single', next: [], plan: options.plan};
  return {nowTodo: null, nowKind: null, next: options.next, plan: options.plan};
}
