/**
 * What the Engage panel is about (docs/dev/history/technical-design-engage.md
 * §3.2, §3.5): an owner - a Project or Area, one of its loops, or a thread in
 * a scope - and its open todos, plus the current todo's key and how it is
 * found again. Pure.
 *
 * Membership is the overviews' (docs/dev/history/technical-design-engage-in-context.md
 * §2.4): a thread holds what its overview's thread lens holds
 * (domain/threadLens.ts), a loop what `loopRelation` says, an Area or Project
 * everything but its active loops' members.
 *
 * Identity is the folder path and the tag, like everywhere else
 * (design-overview §3). Todo references carry the item and the index into its
 * full tasks array, the same shape as the thread overview's entries, so the
 * one action hook (ui/useEntryActions.ts) takes them unchanged.
 */
import {scopeOwnerOf} from './counterparts';
import {belongsToLoop, isLoopMember, loopAgreedIn} from './loops';
import {LoopLine} from './loopsSection';
import {ProvenanceMatch, resolveProvenance} from './provenance';
import {LensSource, threadLensContext, ThreadLensContext} from './threadLens';
import {scopeOf, threadOf, ThreadRef} from './threads';
import {CounterpartLine} from './threadsSection';
import {ItemStatus, Meeting, Task} from './types';

export type EngageOwner =
  | {kind: 'item'; itemPath: string}
  | {kind: 'loop'; itemPath: string; tag: string}
  | {kind: 'thread'; scopeOwnerPath: string; tag: string};

/** A Project or Area as a todo reference names it (the thread overview's item ref). */
export interface EngageItemRef {
  kind: 'project' | 'area' | 'inbox';
  name: string;
  path: string;
  abbrev: string | null;
}

/** One todo of an owner: its item and its index into the item's full tasks array. */
export interface EngageTodoRef {
  item: EngageItemRef;
  taskIndex: number;
  task: Task;
}

/** How the current todo is remembered (settings, §3.5): found again by index and text. */
export interface EngageTodoKey {
  itemPath: string;
  taskText: string;
  taskIndex: number;
}

/** What the panel reads about a Project or Area (a cached item fits). */
export interface EngageItem {
  kind: 'project' | 'area';
  name: string;
  path: string;
  /** A Project's Area by folder name; null for Areas. */
  area: string | null;
  abbrev: string | null;
  status: ItemStatus;
  dailyFocus: boolean;
  weeklyFocus: boolean;
  tasks: readonly Task[];
  meetings: readonly Meeting[];
  loops: readonly LoopLine[];
  threads: readonly CounterpartLine[];
}

/** The Inbox's lists: the lens's provenance sources and today's meetings (E9). */
export interface EngageInbox {
  path: string;
  tasks: readonly Task[];
  meetings: readonly Meeting[];
}

/** Everything the pure Engage decisions read: the Projects and Areas, the Inbox, the setups' kinds. */
export interface EngageSource {
  items: readonly EngageItem[];
  inbox: EngageInbox | null;
  /** Loop kinds (domain/loops.ts `loopKindsOf`). */
  loopKinds: readonly string[];
  /** Thread types (domain/counterparts.ts `threadTypesOf`). */
  threadTypes: readonly string[];
}

/** How an owner's todo relates to it (docs/dev/history/technical-design-engage-in-context.md E1-E3, E5). */
export type EngageRelation = 'owe' | 'waiting' | 'relevant';

/** A meeting by its item and its index into the item's full meetings array. */
export interface MeetingRef {
  itemPath: string;
  meetingIndex: number;
}

/** A todo as one of an owner's: how it relates, and the meeting it was agreed in (when that meeting counts for the owner). */
export interface OwnerTodoRef extends EngageTodoRef {
  relation: EngageRelation;
  agreedIn: MeetingRef | null;
}

/** One meeting with its item and its full-array index. */
export interface MeetingEntryRef {
  item: EngageItemRef;
  meetingIndex: number;
  meeting: Meeting;
}

/** A stable string for an owner: React keys and equality. */
export function ownerKey(owner: EngageOwner): string {
  switch (owner.kind) {
    case 'item':
      return `item:${owner.itemPath}`;
    case 'loop':
      return `loop:${owner.itemPath}:${owner.tag}`;
    case 'thread':
      return `thread:${owner.scopeOwnerPath}:${owner.tag}`;
  }
}

export function sameOwner(a: EngageOwner | null, b: EngageOwner | null): boolean {
  return a === b || (a !== null && b !== null && ownerKey(a) === ownerKey(b));
}

export function itemRefOf(item: EngageItem): EngageItemRef {
  return {kind: item.kind, name: item.name, path: item.path, abbrev: item.abbrev};
}

/** The key that finds `ref` again. */
export function todoKeyOf(ref: EngageTodoRef): EngageTodoKey {
  return {itemPath: ref.item.path, taskText: ref.task.text, taskIndex: ref.taskIndex};
}

export function sameTodo(a: EngageTodoKey | null, b: EngageTodoKey | null): boolean {
  return a !== null && b !== null && a.itemPath === b.itemPath && a.taskIndex === b.taskIndex;
}

export function isOpenTask(task: Task): boolean {
  return !task.done && !task.cancelled;
}

function itemAt(source: EngageSource, path: string): EngageItem | null {
  return source.items.find(item => item.path === path) ?? null;
}

function activeLoopTags(item: EngageItem): string[] {
  return item.loops.filter(l => l.status === 'active').map(l => l.tag);
}

/** The thread a tag set names: the first `type/counterpart` tag whose type is a Thread setup's (never a loop tag). */
export function threadOfTags(tags: readonly string[], source: EngageSource): ThreadRef | null {
  for (const tag of tags) {
    const thread = threadOf(tag);
    if (thread && source.threadTypes.includes(thread.type) && !source.loopKinds.includes(thread.type)) return thread;
  }
  return null;
}

/** The Projects/Areas, then the Inbox, as the lens reads them. */
function lensSourcesOf(source: EngageSource): LensSource[] {
  const sources: LensSource[] = source.items.map(item => ({ref: itemRefOf(item), tasks: item.tasks, meetings: item.meetings}));
  if (source.inbox) sources.push({ref: {kind: 'inbox', name: 'Inbox', path: source.inbox.path, abbrev: null}, tasks: source.inbox.tasks, meetings: source.inbox.meetings});
  return sources;
}

/** A thread owner's lens: the overview's thread lens in the same scope (E1). */
function threadLensOf(owner: Extract<EngageOwner, {kind: 'thread'}>, source: EngageSource): ThreadLensContext | null {
  return threadLensContext(source.items, lensSourcesOf(source), source.inbox?.path ?? null, owner.tag, 'thread', owner.scopeOwnerPath);
}

const refOfMatch = (match: ProvenanceMatch | null): MeetingRef | null => (match ? {itemPath: match.path, meetingIndex: match.meetingIndex} : null);

/** The meeting of its own item a todo was agreed in, or null. */
function agreedInItem(item: EngageItem, task: Task): ProvenanceMatch | null {
  return task.fields.meeting ? resolveProvenance(task, [{path: item.path, meetings: item.meetings}], [item.path]) : null;
}

/** A thread's todos: the overview's thread lens - tagged, the leaf, agreed in a meeting of the lens, `#owe/<counterpart>` (E1). */
function threadTodos(owner: Extract<EngageOwner, {kind: 'thread'}>, source: EngageSource): OwnerTodoRef[] {
  const ctx = threadLensOf(owner, source);
  if (!ctx) return [];
  const out: OwnerTodoRef[] = [];
  for (const s of ctx.inScope) {
    s.tasks.forEach((task, taskIndex) => {
      if (!isOpenTask(task)) return;
      const match = ctx.provenanceOf(task);
      const relation = ctx.relationOf(task, match);
      if (!relation) return;
      const inLens = match !== null && ctx.scope.includes(match.path) && ctx.inLens(match.meeting.tags);
      out.push({item: s.ref, taskIndex, task, relation, agreedIn: inLens ? refOfMatch(match) : null});
    });
  }
  return out;
}

/** A loop's todos: tagged, or agreed in one of its meetings, past or ahead (E2); agreed ones are "owe". */
function loopTodos(owner: Extract<EngageOwner, {kind: 'loop'}>, source: EngageSource): OwnerTodoRef[] {
  const item = itemAt(source, owner.itemPath);
  if (!item) return [];
  const out: OwnerTodoRef[] = [];
  item.tasks.forEach((task, taskIndex) => {
    if (!isOpenTask(task)) return;
    const agreed = loopAgreedIn(item, owner.tag, task);
    if (!agreed && !belongsToLoop(task.tags, owner.tag)) return;
    const relation: EngageRelation = agreed ? 'owe' : task.flowState === 'waiting-for' ? 'waiting' : 'relevant';
    out.push({item: itemRefOf(item), taskIndex, task, relation, agreedIn: refOfMatch(agreed)});
  });
  return out;
}

/** An Area's or Project's todos: none of its active loops' members, so a loop step never shows twice (E3). */
function itemTodos(owner: Extract<EngageOwner, {kind: 'item'}>, source: EngageSource): OwnerTodoRef[] {
  const item = itemAt(source, owner.itemPath);
  if (!item) return [];
  const loops = activeLoopTags(item);
  const out: OwnerTodoRef[] = [];
  item.tasks.forEach((task, taskIndex) => {
    if (!isOpenTask(task) || loops.some(tag => isLoopMember(item, tag, task))) return;
    const relation: EngageRelation = task.flowState === 'waiting-for' ? 'waiting' : 'relevant';
    out.push({item: itemRefOf(item), taskIndex, task, relation, agreedIn: refOfMatch(agreedInItem(item, task))});
  });
  return out;
}

/** The owner's open todos, in item and file order (docs/dev/history/technical-design-engage-in-context.md §2.4). */
export function ownerTodos(owner: EngageOwner, source: EngageSource): OwnerTodoRef[] {
  switch (owner.kind) {
    case 'thread':
      return threadTodos(owner, source);
    case 'loop':
      return loopTodos(owner, source);
    case 'item':
      return itemTodos(owner, source);
  }
}

/** The owner's meetings that are not cancelled: a thread's lens (leaf-tagged ones too), a loop's, an item's outside its active loops. */
export function ownerMeetings(owner: EngageOwner, source: EngageSource): MeetingEntryRef[] {
  const out: MeetingEntryRef[] = [];
  if (owner.kind === 'thread') {
    const ctx = threadLensOf(owner, source);
    for (const s of ctx?.inScope ?? []) {
      s.meetings.forEach((meeting, meetingIndex) => {
        if (!meeting.cancelled && ctx!.inLens(meeting.tags)) out.push({item: s.ref, meetingIndex, meeting});
      });
    }
    return out;
  }
  const item = itemAt(source, owner.itemPath);
  if (!item) return out;
  const loops = activeLoopTags(item);
  item.meetings.forEach((meeting, meetingIndex) => {
    if (meeting.cancelled) return;
    const member = owner.kind === 'loop' ? belongsToLoop(meeting.tags, owner.tag) : !loops.some(tag => belongsToLoop(meeting.tags, tag));
    if (member) out.push({item: itemRefOf(item), meetingIndex, meeting});
  });
  return out;
}

/**
 * The todo's thread: its own thread tag (a Thread setup's type), else the
 * thread of the meeting it was agreed in, inside the item's scope (E4). The
 * thread owner is scoped to the item's scope owner.
 */
export function threadOfTodo(itemPath: string, task: Pick<Task, 'tags' | 'fields'>, source: EngageSource): EngageOwner | null {
  const item = itemAt(source, itemPath);
  if (!item) return null;
  const scopeOwnerPath = scopeOwnerOf(item.path, source.items)?.path ?? item.path;
  const own = threadOfTags(task.tags, source);
  if (own) return {kind: 'thread', scopeOwnerPath, tag: own.tag};
  if (!task.fields.meeting) return null;
  const scope = scopeOf(item.path, source.items, source.inbox?.path ?? null);
  const sources = lensSourcesOf(source).map(s => ({path: s.ref.path, meetings: s.meetings}));
  const match = resolveProvenance(task, sources, scope);
  const thread = match && scope.includes(match.path) ? threadOfTags(match.meeting.tags, source) : null;
  return thread ? {kind: 'thread', scopeOwnerPath, tag: thread.tag} : null;
}

/** The owner of a todo (E4): its active loop, else its thread, else its item. */
export function ownerOfTodo(ref: {itemPath: string; task: Pick<Task, 'tags' | 'fields'>}, source: EngageSource): EngageOwner | null {
  const item = itemAt(source, ref.itemPath);
  if (!item) return null;
  const loop = activeLoopTags(item).find(tag => isLoopMember(item, tag, ref.task));
  if (loop) return {kind: 'loop', itemPath: item.path, tag: loop};
  return threadOfTodo(item.path, ref.task, source) ?? {kind: 'item', itemPath: item.path};
}

/** The owner of a meeting: its thread when its tags name one, else its active loop, else its item. */
export function ownerOfMeeting(ref: {itemPath: string; meeting: Pick<Meeting, 'tags'>}, source: EngageSource): EngageOwner | null {
  const item = itemAt(source, ref.itemPath);
  if (!item) return null;
  const thread = threadOfTags(ref.meeting.tags, source);
  if (thread) {
    const scopeOwner = scopeOwnerOf(item.path, source.items);
    return {kind: 'thread', scopeOwnerPath: scopeOwner?.path ?? item.path, tag: thread.tag};
  }
  const loop = activeLoopTags(item).find(tag => belongsToLoop(ref.meeting.tags, tag));
  return loop ? {kind: 'loop', itemPath: item.path, tag: loop} : {kind: 'item', itemPath: item.path};
}

/**
 * The current todo again (§3.5): the open task at `taskIndex` if its text
 * still matches; else the first open task of the item with exactly that text;
 * else null (the caller drops the key silently).
 */
export function resolveTodoKey(key: EngageTodoKey, source: EngageSource): EngageTodoRef | null {
  const item = itemAt(source, key.itemPath);
  if (!item) return null;
  const at = item.tasks[key.taskIndex];
  if (at && isOpenTask(at) && at.text === key.taskText) return {item: itemRefOf(item), taskIndex: key.taskIndex, task: at};
  const index = item.tasks.findIndex(t => isOpenTask(t) && t.text === key.taskText);
  return index >= 0 ? {item: itemRefOf(item), taskIndex: index, task: item.tasks[index]} : null;
}

/** Whether the owner still exists: its item (or scope owner) is known, a loop's line is active. */
export function ownerExists(owner: EngageOwner, source: EngageSource): boolean {
  if (owner.kind === 'thread') return itemAt(source, owner.scopeOwnerPath) !== null;
  const item = itemAt(source, owner.itemPath);
  if (!item) return false;
  return owner.kind === 'item' || item.loops.some(l => l.tag === owner.tag);
}

/** The header's words for an owner: kind, name and the item or scope it lives in. */
export interface OwnerTitle {
  kindLabel: 'Project' | 'Area' | 'Loop' | 'Thread';
  name: string;
  /** The Area of a Project, the item of a loop, the scope owner of a thread; null when none. */
  parent: string | null;
}

export function ownerTitle(owner: EngageOwner, source: EngageSource): OwnerTitle {
  if (owner.kind === 'thread') {
    return {kindLabel: 'Thread', name: `#${owner.tag}`, parent: itemAt(source, owner.scopeOwnerPath)?.name ?? null};
  }
  const item = itemAt(source, owner.itemPath);
  if (owner.kind === 'loop') {
    const name = owner.tag.split('/').slice(1).join('/') || owner.tag;
    return {kindLabel: 'Loop', name, parent: item?.name ?? null};
  }
  return {
    kindLabel: item?.kind === 'area' ? 'Area' : 'Project',
    name: item?.name ?? owner.itemPath.split('/').pop() ?? '',
    parent: item?.kind === 'project' ? item.area : null,
  };
}

/** The item a loop or Project/Area owner lives in; a thread's scope owner. */
export function ownerHomePath(owner: EngageOwner): string {
  return owner.kind === 'thread' ? owner.scopeOwnerPath : owner.itemPath;
}

/** The current todo with its owner, as stored or offered as the way back. */
export interface OwnedTodo {
  owner: EngageOwner;
  key: EngageTodoKey;
}

/** What the panel opens on (Addendum "Engage follows the note"). */
export interface EngageOpening {
  owner: EngageOwner | null;
  current: EngageTodoKey | null;
  /** Offered as "Continue with …" when it belongs to another owner than the one shown. */
  back: OwnedTodo | null;
  /**
   * What becomes the stored current todo: the note page's todo; or, when the
   * way back is offered, what this panel shows for the note's owner (its
   * next action, `key` null when there is none), so the way back is
   * offered on one opening only.
   */
  store: {owner: EngageOwner; key: EngageTodoKey | null} | null;
}

/**
 * The opening order: "Engage ›" > the note page's todo > the note's owner >
 * the stored current todo's owner > none. `stored` is the stored current
 * todo, already found again (null when gone). `noteOwnerNext` is the todo the
 * panel shows for the note's owner without a current one (its only `#next`),
 * or null.
 */
export function decideOpening(input: {
  pageOwner: EngageOwner | null;
  noteOwner: EngageOwner | null;
  noteTodo: EngageTodoKey | null;
  noteOwnerNext?: EngageTodoKey | null;
  stored: OwnedTodo | null;
}): EngageOpening {
  const {pageOwner, noteOwner, noteTodo, stored} = input;
  const backFrom = (owner: EngageOwner) => (stored && !sameOwner(stored.owner, owner) ? stored : null);
  if (pageOwner) {
    const keep = stored && sameOwner(stored.owner, pageOwner) ? stored.key : null;
    return {owner: pageOwner, current: keep, back: null, store: null};
  }
  if (noteOwner && noteTodo) {
    const same = stored && sameOwner(stored.owner, noteOwner) && sameTodo(stored.key, noteTodo);
    return {owner: noteOwner, current: noteTodo, back: same ? null : backFrom(noteOwner), store: {owner: noteOwner, key: noteTodo}};
  }
  if (noteOwner) {
    const keep = stored && sameOwner(stored.owner, noteOwner) ? stored.key : null;
    const back = backFrom(noteOwner);
    // Offered once: what this panel shows replaces the stored todo; the line itself takes you back.
    return {owner: noteOwner, current: keep, back, store: back ? {owner: noteOwner, key: input.noteOwnerNext ?? null} : null};
  }
  if (stored) return {owner: stored.owner, current: stored.key, back: null, store: null};
  return {owner: null, current: null, back: null, store: null};
}
