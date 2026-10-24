/**
 * Which todos the Engage panel offers for an owner, and which owners the
 * focus screens list (docs/dev/history/technical-design-engage.md §3.2). Pure.
 *
 * - `#next` first; the plan (open todos without a flow state) only matters
 *   once no `#next` is left (D16). `#now` counts as `#next`. For threads and
 *   loops "I owe" comes first, file order inside
 *   (docs/dev/history/technical-design-engage-in-context.md E5).
 * - Waiting For, Someday and Maybe are never offered to work on: Waiting
 *   For has its own tab (Done only), Someday/Maybe is counted in "Also here".
 * - From (docs/dev/history/technical-design-meetings-0.21.md R10): what
 *   came out of the owner's meetings that have started, newest first, one
 *   group per meeting - open todos agreed in it (not Someday/Maybe), active
 *   agreements made in it, and done todos only for the reference meetings
 *   (Before: the previous meeting; During: the previous one and this one;
 *   After: this one; off a meeting page: the latest that is over). A
 *   Project/Area owner gets it only on a meeting's page.
 * - Waiting (R11): the owner's open Waiting For todos (a thread's by the
 *   lens's rule), file order. Agreements (R12): its active agreements.
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
  ownerAgreedTodos,
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
import {agreementMadeIn, AgreementRef, ownerAgreements} from './agreementOwner';
import {isLoopMember} from './loops';
import {MeetingMoment, momentByTime, previousMeeting} from './meetingMoment';
import {isSomedayMaybe, setFlowStateTag, setNowTag} from './flowState';
import {meetingEndMs, meetingStartMs, todayIso} from './meetingTime';
import {scopeOf, threadOf} from './threads';
import {Meeting, Task} from './types';

/** The flow a todo is set to from the panel: picked (`#next`), Someday, Waiting For (R15), or none (Remove #next). */
export type EngageFlowChoice = 'next' | 'someday' | 'waiting' | null;

/**
 * A todo's text with its flow set to `flow`, through `setFlowStateTag`;
 * Waiting For on `counterpart` (`#wf/<counterpart>`, a bare `#wf` without
 * one). Leaving `#next` also drops `#now`, which is only ever layered on
 * top of it.
 */
export function engageFlowText(text: string, flow: EngageFlowChoice, counterpart: string | null = null): string {
  const withFlow = flow === 'waiting' ? setFlowStateTag(text, 'waiting-for', counterpart ?? undefined) : setFlowStateTag(text, flow);
  return flow === 'next' ? withFlow : setNowTag(withFlow, false);
}

/** One From row: a todo agreed in the meeting (open, or done for a reference meeting) or an agreement made in it. */
export type FromRow = {kind: 'todo'; todo: OwnerTodoRef} | {kind: 'agreement'; agreement: AgreementRef};

/** What came out of one meeting (R10). */
export interface FromGroup {
  meeting: MeetingEntryRef;
  rows: FromRow[];
}

/** The meeting whose page Engage is open on, and the moment chosen for it (R1-R3). */
export interface EngagePage {
  meeting: MeetingRef;
  moment: MeetingMoment;
}

export interface EngageOptions {
  /** Open `#next` (or `#now`) todos: "I owe" before the rest for threads and loops, file order inside (E5). */
  next: OwnerTodoRef[];
  /** Open todos without a flow state, the same order. */
  plan: OwnerTodoRef[];
  /** The From tab (R10), newest meeting first; [] = no tab. */
  from: FromGroup[];
  /** The Waiting tab (R11): open Waiting For todos, file order; [] = no tab. */
  waiting: OwnerTodoRef[];
  /** The Agreements tab (R12): active agreements, file order; [] = no tab. */
  agreements: AgreementRef[];
  /** What the panel leaves out: Someday + Maybe (E7). */
  alsoHere: {someday: number};
  /** The owner's next meeting that is not over, any date (E8). */
  nextMeeting: MeetingEntryRef | null;
  /** No open todo and no meeting ahead. */
  ownerEmpty: boolean;
}

/** How many rows the From tab lists (captions not counted). */
export function fromRowCount(groups: readonly FromGroup[]): number {
  return groups.reduce((n, g) => n + g.rows.length, 0);
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

const refOf = (m: MeetingEntryRef): MeetingRef => ({itemPath: m.item.path, meetingIndex: m.meetingIndex});
const startDesc = (a: MeetingEntryRef, b: MeetingEntryRef) => meetingStartMs(b.meeting) - meetingStartMs(a.meeting);

/** The meetings whose done todos show (R10): by the page's moment, else the latest meeting that is over. */
function referenceMeetings(meetings: MeetingEntryRef[], page: {entry: MeetingEntryRef; moment: MeetingMoment} | null, nowMs: number): MeetingRef[] {
  if (page) {
    const prev = previousMeeting(meetings, page.entry);
    const prevRef = prev ? [refOf(prev)] : [];
    if (page.moment === 'before') return prevRef;
    if (page.moment === 'during') return [...prevRef, refOf(page.entry)];
    return [refOf(page.entry)];
  }
  const over = meetings.filter(m => meetingEndMs(m.meeting) <= nowMs).sort(startDesc);
  return over.length > 0 ? [refOf(over[0])] : [];
}

/** The From tab (R10) - see the module doc comment. */
function fromGroupsOf(
  owner: EngageOwner,
  source: EngageSource,
  meetings: MeetingEntryRef[],
  nowMs: number,
  current: EngageTodoKey | null,
  page: EngagePage | null,
): FromGroup[] {
  const pageEntry = page ? meetings.find(m => sameMeeting(refOf(m), page.meeting)) ?? meetingEntryAt(page.meeting, source) : null;
  const pageOf = page && pageEntry ? {entry: pageEntry, moment: page.moment} : null;
  const reference = referenceMeetings(meetings, pageOf, nowMs);
  const isReference = (m: MeetingEntryRef) => reference.some(r => sameMeeting(r, refOf(m)));
  // A Project/Area: only on a meeting's page - its group, and the previous meeting's done todos.
  let shown: MeetingEntryRef[];
  if (owner.kind === 'item') {
    if (!pageEntry) return [];
    const prev = previousMeeting(meetings, pageEntry);
    shown = [pageEntry, ...(prev && isReference(prev) ? [prev] : [])];
  } else {
    // The page's meeting counts as started once its moment is During or After, chosen or by time.
    const pageStarted = (m: MeetingEntryRef) => !!pageOf && pageOf.moment !== 'before' && sameMeeting(refOf(m), refOf(pageOf.entry));
    shown = meetings.filter(m => meetingStartMs(m.meeting) <= nowMs || pageStarted(m));
  }
  shown = [...shown].sort(startDesc);
  const todos = ownerAgreedTodos(owner, source, shown.map(refOf));
  const agreements = ownerAgreements(owner, source).map(ref => ({ref, madeIn: agreementMadeIn(ref, source)}));
  const groups: FromGroup[] = [];
  for (const m of shown) {
    const ref = refOf(m);
    const doneOnly = owner.kind === 'item' && pageEntry !== null && !sameMeeting(ref, refOf(pageEntry));
    const agreed = todos.filter(t => sameMeeting(t.agreedIn, ref));
    const open = doneOnly ? [] : agreed.filter(t => !t.task.done && !isSomedayMaybe(t.task) && !sameTodo(todoKeyOf(t), current));
    const made = doneOnly ? [] : agreements.filter(a => sameMeeting(a.madeIn, ref));
    const done = isReference(m) ? agreed.filter(t => t.task.done) : [];
    const rows: FromRow[] = [
      ...open.map(todo => ({kind: 'todo' as const, todo})),
      ...made.map(a => ({kind: 'agreement' as const, agreement: a.ref})),
      ...done.map(todo => ({kind: 'todo' as const, todo})),
    ];
    if (rows.length > 0) groups.push({meeting: m, rows});
  }
  return groups;
}

/** The page meeting with its moment: `chosen` when set, else by time (R2, R3); null without a page meeting or a moment. */
export function engagePageOf(pageMeeting: MeetingRef | null, source: EngageSource, nowMs: number, chosen: MeetingMoment | null = null): EngagePage | null {
  if (!pageMeeting) return null;
  const entry = meetingEntryAt(pageMeeting, source);
  if (!entry) return null;
  const byTime = momentByTime(entry.meeting, nowMs);
  if (!byTime) return null;
  return {meeting: pageMeeting, moment: chosen ?? byTime};
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
  page: EngagePage | null = null,
): EngageOptions {
  const todos = ownerTodos(owner, source);
  const meetings = ownerMeetings(owner, source);
  const listed = ordered(owner, todos.filter(ref => !sameTodo(todoKeyOf(ref), current)));
  const ahead = meetings.filter(m => meetingEndMs(m.meeting) > nowMs);
  return {
    next: listed.filter(ref => isNextTask(ref.task)),
    plan: listed.filter(ref => isPlanTask(ref.task)),
    from: fromGroupsOf(owner, source, meetings, nowMs, current, page),
    // A thread's by the lens's rule (#wf/<counterpart>, or a bare #wf agreed or tagged in it), file order.
    waiting: todos.filter(t => t.task.flowState === 'waiting-for' && (owner.kind !== 'thread' || t.relation === 'waiting') && !sameTodo(todoKeyOf(t), current)),
    agreements: ownerAgreements(owner, source),
    alsoHere: {someday: todos.filter(t => isSomedayMaybe(t.task)).length},
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
