/**
 * The thread lens (docs/dev/history/technical-design-tending-threads.md
 * §1.2.1, §3.3): what belongs to a thread or a counterpart inside one scope,
 * and how a todo relates to it. Pure. The one definition the thread overview
 * (storage/threadAggregate.ts), the "Since last time" piece, the Threads
 * tab's filter, the Review roster and Engage's thread owners ask
 * (docs/dev/history/technical-design-engage-in-context.md §2.1).
 *
 * - **Scope.** The owner's scope (domain/threads.ts's `scopeOf`, decision
 *   D9); without an owner, the item holding the thread's latest meeting.
 *   The Inbox is in scope only when it is the owner.
 * - **Lens.** Thread: the thread's tag (or deeper) or the counterpart's plain
 *   leaf. Counterpart: any `<type>/<counterpart>` for a type used with the
 *   counterpart inside the scope, or the plain leaf. `wf` and `owe` name a
 *   counterpart, not a thread, so their lens is always the counterpart lens
 *   (decision D13).
 * - **Relation** of a todo, the first that applies (decision D12):
 *   1. waiting: `#wf/<counterpart>`; or bare `#wf` on a todo agreed in a
 *      meeting of the lens, or with the lens's tags;
 *   2. owe: agreed in a meeting of the lens (its provenance resolves to one),
 *      or `#owe/<counterpart>`;
 *   3. relevant: the lens's tags.
 *   A meeting of the lens is one with the lens's tags, past or ahead, inside
 *   the scope.
 */
import {ProvenanceMatch, ProvenanceSource, resolveProvenance} from './provenance';
import {
  belongsToCounterpart,
  belongsToThread,
  inThreadLens,
  isCounterpartType,
  owedTo,
  scopeOf,
  ScopeItem,
  threadOf,
  ThreadLens,
  ThreadRef,
  typesForCounterpart,
} from './threads';
import {Meeting, Task} from './types';

/** A Project, an Area or the Inbox as a lens entry names it. */
export interface LensItemRef {
  kind: 'project' | 'area' | 'inbox';
  name: string;
  path: string;
  abbrev: string | null;
}

/** One Project/Area or the Inbox with its lists. */
export interface LensSource {
  ref: LensItemRef;
  tasks: readonly Task[];
  meetings: readonly Meeting[];
}

/** How an open or done todo relates to a lens (§1.2.1); the first that applies. */
export type ThreadRelation = 'waiting' | 'owe' | 'relevant';

/** A lens resolved against the sources: its scope and the §1.2.1 predicates. */
export interface ThreadLensContext {
  lens: ThreadLens;
  thread: ThreadRef;
  owner: LensItemRef | null;
  scope: string[];
  /** The sources inside the scope (the Inbox only when it is the owner). */
  inScope: LensSource[];
  types: string[];
  /** Whether tags carry the lens's tags (thread tag or plain leaf; counterpart lens: any thread of it). */
  inLens: (tags: readonly string[]) => boolean;
  /** The meeting a todo (or an agreement) was agreed in, when its provenance resolves. */
  provenanceOf: (task: {fields: {meeting: string | null}}) => ProvenanceMatch | null;
  /** How a todo (filed inside the scope) relates to the lens, or null. */
  relationOf: (task: Task, match?: ProvenanceMatch | null) => ThreadRelation | null;
}

/** A meeting's start as a sortable key. */
export function meetingStartKey(m: Pick<Meeting, 'date' | 'time'>): string {
  return `${m.date} ${m.time || '00:00'}`;
}

/** The item holding the thread's latest meeting - the owner when none was given. */
function fallbackOwner(sources: readonly LensSource[], thread: ThreadRef): LensItemRef | null {
  let best: {ref: LensItemRef; key: string} | null = null;
  for (const source of sources) {
    for (const m of source.meetings) {
      if (m.cancelled || !belongsToThread(m.tags, thread)) continue;
      if (!best || meetingStartKey(m) > best.key) best = {ref: source.ref, key: meetingStartKey(m)};
    }
  }
  return best?.ref ?? null;
}

/**
 * The lens of `tag` in `requestedLens` (the counterpart lens for `wf`/`owe`
 * tags), scoped to `ownerPath` - see the module doc comment. `scopeItems`
 * are the Projects and Areas `scopeOf` reads, `sources` every loaded item
 * plus the Inbox. Null when `tag` is not a nested tag.
 */
export function threadLensContext(
  scopeItems: readonly ScopeItem[],
  sources: readonly LensSource[],
  inboxPath: string | null,
  tag: string,
  requestedLens: ThreadLens,
  ownerPath: string | null,
): ThreadLensContext | null {
  const thread = threadOf(tag);
  if (!thread) return null;
  const lens: ThreadLens = isCounterpartType(thread.type) ? 'counterpart' : requestedLens;

  const ownerRef = ownerPath
    ? sources.find(s => s.ref.path === ownerPath)?.ref ?? null
    : fallbackOwner(sources, thread);
  const scopeOwnerPath = ownerPath ?? ownerRef?.path ?? null;
  const scope = scopeOwnerPath ? scopeOf(scopeOwnerPath, scopeItems, inboxPath) : sources.map(s => s.ref.path);
  const inScope = sources.filter(s => scope.includes(s.ref.path));

  const tagLists = inScope.flatMap(s => [...s.tasks.map(t => t.tags), ...s.meetings.map(m => m.tags)]);
  const used = typesForCounterpart(tagLists, thread.counterpart);
  const types = [thread.type, ...used.filter(t => t !== thread.type)];
  const cp = thread.counterpart;
  // `#wf/<cp>` and `#owe/<cp>` have their own meaning below; they are not the lens's tags.
  const threadTypes = types.filter(t => !isCounterpartType(t));
  const inLens = (tags: readonly string[]) =>
    lens === 'thread' ? inThreadLens(tags, thread) : belongsToCounterpart(tags, cp, threadTypes);

  const provenanceSources: ProvenanceSource[] = sources.map(s => ({path: s.ref.path, meetings: s.meetings}));
  const provenanceOf = (task: {fields: {meeting: string | null}}): ProvenanceMatch | null =>
    task.fields.meeting ? resolveProvenance(task, provenanceSources, scope) : null;
  const agreedInLens = (match: ProvenanceMatch | null) =>
    match !== null && scope.includes(match.path) && inLens(match.meeting.tags);

  const relationOf = (task: Task, known?: ProvenanceMatch | null): ThreadRelation | null => {
    const agreed = agreedInLens(known === undefined ? provenanceOf(task) : known);
    const tagged = inLens(task.tags);
    if (task.flowState === 'waiting-for') {
      if (task.waitingOn === cp) return 'waiting';
      if (task.waitingOn === null && (agreed || tagged)) return 'waiting';
    }
    if (agreed || owedTo(task.tags).includes(cp)) return 'owe';
    return tagged ? 'relevant' : null;
  };

  return {lens, thread, owner: ownerRef, scope, inScope, types, inLens, provenanceOf, relationOf};
}
