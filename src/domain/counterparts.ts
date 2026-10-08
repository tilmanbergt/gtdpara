/**
 * Counterparts per scope (docs/dev/history/technical-design-tending-threads.md
 * §1.3, §3.9.2). Pure.
 *
 * - **Scope.** An Area together with the Projects assigned to it, or a
 *   Project without an Area (decision D16). A Project whose `area:` names no
 *   Area that is known here is treated as a Project without an Area. The
 *   scope's **owner** is the Area, or that Project; its file holds the
 *   scope's `## Threads` section (domain/threadsSection.ts). The Inbox is no
 *   scope here (decision D18).
 * - **Which counterparts exist** (decision D2): the counterpart of every
 *   nested tag whose type is a rule type (the Tag Rule tags, plus `wf` and
 *   `owe`) on a todo or meeting of the scope (not cancelled, done included),
 *   plus every status line of the scope. A section found in a member Project
 *   (a hand edit, or a Project assigned to an Area later) is read too; the
 *   owner's line wins.
 * - **Status.** `active` / `inactive` from the line, `new` while there is none.
 * - **One-off** (decision D17): no meeting thread (no type other than `wf` /
 *   `owe`), only `#wf/x` and/or `#owe/x` - labelled where counterparts are
 *   listed, never given a "next —" hint.
 * - **Back in use** (decisions D3, D20): an inactive counterpart with an
 *   upcoming meeting of one of its threads.
 */
import {WAITING_FOR_TYPE} from './flowState';
import {meetingEndMs} from './meetingTime';
import {isCounterpartType, OWE_TYPE, ScopeItem, threadOf, ThreadRef} from './threads';
import {CounterpartLine, CounterpartStatus} from './threadsSection';
import {ItemStatus, Meeting, Task} from './types';

/** What counterparts are read from: a Project or Area with its lists (a CachedItem fits). */
export interface CounterpartSource extends ScopeItem {
  status: ItemStatus;
  tasks: readonly Task[];
  meetings: readonly Meeting[];
  threads: readonly CounterpartLine[];
}

export interface CounterpartScope<T extends ScopeItem = CounterpartSource> {
  /** The Area, or the Project without an Area; its file holds the `## Threads` section. */
  owner: T;
  /** Every item of the scope, the owner first. */
  members: T[];
}

export type OneOff = 'wf' | 'owe' | 'wf+owe' | null;

export interface Counterpart {
  leaf: string;
  status: CounterpartStatus | 'new';
  /** Its threads in use inside the scope (types other than `wf`/`owe`), in first-seen order. */
  threads: ThreadRef[];
  oneOff: OneOff;
  /** Whether a todo or meeting of the scope uses it (false for a status line nobody uses). */
  inUse: boolean;
  /** Inactive, with an upcoming meeting of one of its threads (D3, D20). */
  backInUse: boolean;
}

/** The types that make counterparts (D2): the first segment of every enabled Tag Rule's tags, then `wf` and `owe`. */
export function ruleTypesOf(rules: ReadonlyArray<{enabled: boolean; tags: readonly string[]}>): string[] {
  const types: string[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    for (const raw of rule.tags) {
      const type = raw.replace(/^#/, '').toLowerCase().split('/')[0].trim();
      if (type && !types.includes(type)) types.push(type);
    }
  }
  for (const type of [WAITING_FOR_TYPE, OWE_TYPE]) if (!types.includes(type)) types.push(type);
  return types;
}

function areaItemFor<T extends ScopeItem>(project: T, items: readonly T[]): T | null {
  if (!project.area) return null;
  return items.find(i => i.kind === 'area' && i.name === project.area) ?? null;
}

/** The owner of the scope `path` belongs to: an Area itself, a Project's Area, or a Project without one; null for the Inbox or an unknown path. */
export function scopeOwnerOf<T extends ScopeItem>(path: string, items: readonly T[]): T | null {
  const item = items.find(i => i.path === path);
  if (!item) return null;
  if (item.kind === 'area') return item;
  return areaItemFor(item, items) ?? item;
}

/** Every item of the scope `owner` heads, the owner first. */
export function scopeMembers<T extends ScopeItem>(owner: T, items: readonly T[]): T[] {
  if (owner.kind !== 'area') return [owner];
  return [owner, ...items.filter(i => i.kind === 'project' && i.area === owner.name)];
}

/**
 * The scopes counterparts are tended in: the Areas, then the Projects
 * without an Area, each in `items` order, and only those whose owner is
 * Active or On Hold.
 */
export function counterpartScopes<T extends ScopeItem & {status: ItemStatus}>(items: readonly T[]): CounterpartScope<T>[] {
  const live = (i: T) => i.status === 'active' || i.status === 'on-hold';
  const areas = items.filter(i => i.kind === 'area' && live(i));
  const loneProjects = items.filter(i => i.kind === 'project' && live(i) && areaItemFor(i, items) === null);
  return [...areas, ...loneProjects].map(owner => ({owner, members: scopeMembers(owner, items)}));
}

interface Use {
  types: string[];
  threads: ThreadRef[];
  upcoming: boolean;
}

/** The counterparts of `scope`, alphabetically - see the module doc comment. */
export function counterpartsOf(scope: CounterpartScope, ruleTypes: readonly string[], now: Date = new Date()): Counterpart[] {
  const nowMs = now.getTime();
  const uses = new Map<string, Use>();
  const note = (tags: readonly string[], upcomingMeeting: boolean) => {
    for (const tag of tags) {
      const thread = threadOf(tag);
      if (!thread || !ruleTypes.includes(thread.type)) continue;
      const use = uses.get(thread.counterpart) ?? {types: [], threads: [], upcoming: false};
      if (!use.types.includes(thread.type)) use.types.push(thread.type);
      if (!isCounterpartType(thread.type)) {
        if (!use.threads.some(t => t.tag === thread.tag)) use.threads.push(thread);
        if (upcomingMeeting) use.upcoming = true;
      }
      uses.set(thread.counterpart, use);
    }
  };
  for (const member of scope.members) {
    for (const task of member.tasks) if (!task.cancelled) note(task.tags, false);
    for (const meeting of member.meetings) {
      if (!meeting.cancelled) note(meeting.tags, meetingEndMs(meeting) > nowMs);
    }
  }

  const statuses = new Map<string, CounterpartStatus>();
  for (const member of scope.members) {
    for (const line of member.threads) if (!statuses.has(line.leaf)) statuses.set(line.leaf, line.status);
  }

  const leaves = [...new Set([...uses.keys(), ...statuses.keys()])].sort((a, b) => a.localeCompare(b));
  return leaves.map(leaf => {
    const use = uses.get(leaf);
    const status = statuses.get(leaf) ?? 'new';
    return {
      leaf,
      status,
      threads: use?.threads ?? [],
      oneOff: use ? oneOffOf(use.types) : null,
      inUse: use !== undefined,
      backInUse: status === 'inactive' && (use?.upcoming ?? false),
    };
  });
}

function oneOffOf(types: readonly string[]): OneOff {
  if (types.some(t => !isCounterpartType(t))) return null;
  const wf = types.includes(WAITING_FOR_TYPE);
  const owe = types.includes(OWE_TYPE);
  if (wf && owe) return 'wf+owe';
  if (wf) return 'wf';
  return owe ? 'owe' : null;
}

/** The label a one-off counterpart carries wherever counterparts are listed (D17). */
export function oneOffLabel(oneOff: Exclude<OneOff, null>): string {
  if (oneOff === 'wf') return 'w/f only';
  if (oneOff === 'owe') return 'owe only';
  return 'w/f · owe only';
}

/** A nested tag that names `counterpart` - its first meeting thread, else `wf/` or `owe/` - to open its overview with. */
export function counterpartTag(counterpart: Pick<Counterpart, 'leaf' | 'threads' | 'oneOff'>): string {
  if (counterpart.threads.length > 0) return counterpart.threads[0].tag;
  return `${counterpart.oneOff === 'owe' ? OWE_TYPE : WAITING_FOR_TYPE}/${counterpart.leaf}`;
}

/**
 * The counterparts to leave out of the tag suggestions: set inactive in a
 * scope and active in none (the suggestions are not per scope).
 */
export function inactiveLeaves(items: readonly CounterpartSource[]): Set<string> {
  const inactive = new Set<string>();
  const active = new Set<string>();
  for (const scope of counterpartScopes(items)) {
    const seen = new Set<string>();
    for (const member of scope.members) {
      for (const line of member.threads) {
        if (seen.has(line.leaf)) continue;
        seen.add(line.leaf);
        (line.status === 'inactive' ? inactive : active).add(line.leaf);
      }
    }
  }
  for (const leaf of active) inactive.delete(leaf);
  return inactive;
}
