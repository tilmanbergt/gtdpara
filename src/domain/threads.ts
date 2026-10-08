/**
 * Threads and counterparts (docs/dev/history/technical-design-tending-threads.md
 * §1.2, §3.2). Pure.
 *
 * A nested tag `#retro/alpha` has three meanings: its first segment is the
 * **type** (`retro`), its second the **counterpart** (`alpha`, a person, team
 * or process), and both together the **thread** (`retro/alpha`). Persons and
 * series are not model entities; matching happens at read time only:
 *
 * - an item tagged `#retro/alpha` (or deeper, `#retro/alpha/2026`) belongs to
 *   that thread and to counterpart `alpha`;
 * - the plain leaf `#alpha` belongs to the counterpart and shows in every
 *   thread of it;
 * - `#wf/alpha` is Waiting For from `alpha` (Waiting For is one more type);
 * - `#owe/alpha` is a promise to `alpha` made outside a meeting (decision
 *   D13). Not a flow state: it combines with `#next`, a due date, Someday. A
 *   bare `#owe` is a plain tag without meaning;
 * - a plain parent tag (`#retro`) never reaches down into the retro threads.
 *
 * `wf` and `owe` name a counterpart, not a thread (`isCounterpartType`): they
 * have no thread lens and are never offered for "+ Next".
 *
 * Every overview is **scoped** to one owner (decision D9): the owner's Area
 * plus the Projects assigned to it. A Project without an Area is its own
 * scope, and so is the Inbox.
 */

import {WAITING_FOR_TYPE} from './flowState';

/** The type of a promise made outside a meeting: `#owe/<counterpart>`. */
export const OWE_TYPE = 'owe';

/** One thread: `tag` is always `type/counterpart`, lowercased. */
export interface ThreadRef {
  type: string;
  counterpart: string;
  tag: string;
}

/** The two ways to look at a thread: just this thread, or everything with its counterpart. */
export type ThreadLens = 'thread' | 'counterpart';

/** The thread a tag belongs to (deeper segments are dropped), or null for a tag without `/`. */
export function threadOf(tag: string): ThreadRef | null {
  const parts = tag.toLowerCase().split('/');
  if (parts.length < 2 || !parts[0] || !parts[1]) return null;
  const [type, counterpart] = parts;
  return {type, counterpart, tag: `${type}/${counterpart}`};
}

/** The threads among `tags`, once each, in order. */
export function threadsOfTags(tags: readonly string[]): ThreadRef[] {
  const out: ThreadRef[] = [];
  for (const tag of tags) {
    const thread = threadOf(tag);
    if (thread && !out.some(t => t.tag === thread.tag)) out.push(thread);
  }
  return out;
}

/** Whether `type` names a counterpart rather than a thread: `wf` and `owe`. */
export function isCounterpartType(type: string): boolean {
  return type === WAITING_FOR_TYPE || type === OWE_TYPE;
}

/** The counterparts `tags` promise something to: one per `owe/<counterpart>[/…]` tag, once each. */
export function owedTo(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const tag of tags) {
    const thread = threadOf(tag);
    if (thread && thread.type === OWE_TYPE && !out.includes(thread.counterpart)) out.push(thread.counterpart);
  }
  return out;
}

/** Whether `tags` carry the thread's tag itself or one nested below it. */
export function belongsToThread(tags: readonly string[], thread: ThreadRef): boolean {
  return tags.some(tag => tag === thread.tag || tag.startsWith(`${thread.tag}/`));
}

/**
 * Whether `tags` belong to `counterpart`: a `<type>/<counterpart>[/…]` tag for
 * one of `types`, or the plain leaf `#<counterpart>`.
 */
export function belongsToCounterpart(tags: readonly string[], counterpart: string, types: readonly string[]): boolean {
  return tags.some(tag => {
    if (tag === counterpart) return true;
    const thread = threadOf(tag);
    return thread !== null && thread.counterpart === counterpart && types.includes(thread.type);
  });
}

/** Whether `tags` show in the thread lens of `thread`: the thread itself, or the plain leaf. */
export function inThreadLens(tags: readonly string[], thread: ThreadRef): boolean {
  return belongsToThread(tags, thread) || tags.includes(thread.counterpart);
}

/** The types used with `counterpart` among `tagLists`, in first-seen order. */
export function typesForCounterpart(tagLists: ReadonlyArray<readonly string[]>, counterpart: string): string[] {
  const types: string[] = [];
  for (const tags of tagLists) {
    for (const tag of tags) {
      const thread = threadOf(tag);
      if (thread && thread.counterpart === counterpart && !types.includes(thread.type)) types.push(thread.type);
    }
  }
  return types;
}

/** What `scopeOf` needs to know about a Project or Area (a CachedItem fits). */
export interface ScopeItem {
  kind: 'project' | 'area';
  name: string;
  path: string;
  /** A Project's assigned Area, by folder name; null for Areas. */
  area: string | null;
}

/**
 * The paths inside the scope of `ownerPath`: an Area with its assigned
 * Projects; a Project with an Area widens to that Area and its Projects; a
 * Project without an Area, the Inbox (`inboxPath`) and an owner that is not
 * a known item are their own scope.
 */
export function scopeOf(ownerPath: string, items: readonly ScopeItem[], inboxPath: string | null): string[] {
  if (ownerPath === inboxPath) return [ownerPath];
  const owner = items.find(item => item.path === ownerPath);
  if (!owner) return [ownerPath];
  const areaName = owner.kind === 'area' ? owner.name : owner.area;
  if (!areaName) return [ownerPath];
  const paths = items
    .filter(item => (item.kind === 'area' ? item.name === areaName : item.area === areaName))
    .map(item => item.path);
  return paths.includes(ownerPath) ? paths : [ownerPath, ...paths];
}
