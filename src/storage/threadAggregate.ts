/**
 * The thread overview's data (docs/dev/history/technical-design-tending-threads.md
 * §3.3): a pure, synchronous transform over the warm cache plus the shared
 * Inbox, the storage/dailyAggregate.ts posture - no file reads here.
 *
 * Everything is limited to the owner's scope (domain/threads.ts's `scopeOf`,
 * decision D9). The owner is the item of the row whose tag was tapped; only
 * when none is known, the item holding the thread's latest meeting.
 *
 * - **Lens.** Thread: the thread's tag (or deeper) or the counterpart's plain
 *   leaf. Counterpart: any `<type>/<counterpart>` for a type used with the
 *   counterpart inside the scope, or the plain leaf. `wf` and `owe` name a
 *   counterpart, not a thread, so their overview is always the counterpart
 *   lens (decision D13).
 * - **Ahead.** Meetings not cancelled and not over yet, soonest first. Open,
 *   not cancelled todos are classified once (§1.2.1, decision D12), the first
 *   that applies:
 *   1. Waiting for: `#wf/<counterpart>`; or bare `#wf` on a todo agreed in a
 *      meeting of the lens, or with the lens's tags;
 *   2. I owe: agreed in a meeting of the lens (its provenance resolves to
 *      one), or `#owe/<counterpart>`; Someday/Maybe included;
 *   3. Relevant: the lens's tags (thread tag or plain leaf; in the
 *      counterpart lens any thread of the counterpart).
 *   A meeting of the lens is one the overview lists (the lens's tags, past
 *   or ahead, inside the scope), so every todo counted under a meeting in
 *   Looking back is also under I owe or Waiting for while it is open.
 * - **Since.** Done todos completed on or after the latest past meeting's
 *   date that relate to the lens in any of the three ways, latest first;
 *   none without a past meeting. Todos ticked before completion dates were
 *   recorded never appear.
 * - **Looking back.** Meetings that are over, newest first, each with the
 *   todos agreed in it (domain/provenance.ts) and their counts; a todo's age
 *   is today minus its created date (or the meeting's date).
 *
 * Todos count where they are filed (decision D15): an agreed todo in the
 * Inbox shows in its meeting's thread only once it is filed into the scope.
 *
 * Entries carry their item and the index into its full array, so every row
 * can be changed through storage/itemMutations.ts's mutateEntryTasks/
 * mutateEntryMeetings (the index-safety rule).
 */
import {meetingEndMs, todayIso} from '../domain/meetingTime';
import {daysBetween, MeetingSeedFields, nextMeetingSeed} from '../domain/nextMeeting';
import {meetingKey, ProvenanceMatch, ProvenanceSource, resolveProvenance} from '../domain/provenance';
import {
  belongsToCounterpart,
  belongsToThread,
  inThreadLens,
  isCounterpartType,
  owedTo,
  scopeOf,
  threadOf,
  ThreadLens,
  ThreadRef,
  typesForCounterpart,
} from '../domain/threads';
import {Meeting, Task} from '../domain/types';
import {CachedItem} from './dataCache';

export interface ThreadItemRef {
  kind: 'project' | 'area' | 'inbox';
  name: string;
  path: string;
  abbrev: string | null;
}

export interface ThreadTaskEntry {
  item: ThreadItemRef;
  /** Index into the item's full tasks array. */
  taskIndex: number;
  task: Task;
}

export interface ThreadMeetingEntry {
  item: ThreadItemRef;
  /** Index into the item's full meetings array. */
  meetingIndex: number;
  meeting: Meeting;
}

export interface PastMeeting {
  entry: ThreadMeetingEntry;
  /** Its provenance key. */
  key: string;
  /** Todos agreed in it (not cancelled): open first, then done. */
  agreed: ThreadTaskEntry[];
  counts: {agreed: number; done: number; open: number; oldestOpenDays: number | null};
}

export interface ThreadOverview {
  lens: ThreadLens;
  thread: ThreadRef;
  owner: ThreadItemRef | null;
  /** Paths inside the owner's scope. */
  scope: string[];
  /** The types used with the counterpart inside the scope (the thread's own type first). */
  types: string[];
  ahead: {meetings: ThreadMeetingEntry[]; owe: ThreadTaskEntry[]; waiting: ThreadTaskEntry[]; relevant: ThreadTaskEntry[]};
  /** `from`: the latest past meeting's date (null without one); `done`: latest completion first. */
  since: {from: string | null; done: ThreadTaskEntry[]};
  /** Newest first. */
  past: PastMeeting[];
}

/** The Inbox's part: its folder path and lists. */
export interface ThreadInboxInput {
  path: string;
  tasks: Task[];
  meetings: Meeting[];
}

/** One Project/Area or the Inbox with its lists. */
export interface ThreadSource {
  ref: ThreadItemRef;
  tasks: Task[];
  meetings: Meeting[];
}

/** Every Project/Area that loaded, then the Inbox. */
export function threadSourcesOf(items: readonly CachedItem[], inbox: ThreadInboxInput | null): ThreadSource[] {
  const sources: ThreadSource[] = items
    .filter(item => !item.loadError)
    .map(item => ({
      ref: {kind: item.kind, name: item.name, path: item.path, abbrev: item.abbrev},
      tasks: item.tasks,
      meetings: item.meetings,
    }));
  if (inbox) {
    sources.push({ref: {kind: 'inbox', name: 'Inbox', path: inbox.path, abbrev: null}, tasks: inbox.tasks, meetings: inbox.meetings});
  }
  return sources;
}

function startKey(m: Meeting): string {
  return `${m.date} ${m.time || '00:00'}`;
}

/** The item holding the thread's latest meeting - the owner when none was given. */
function fallbackOwner(sources: readonly ThreadSource[], thread: ThreadRef): ThreadItemRef | null {
  let best: {ref: ThreadItemRef; key: string} | null = null;
  for (const source of sources) {
    for (const m of source.meetings) {
      if (m.cancelled || !belongsToThread(m.tags, thread)) continue;
      if (!best || startKey(m) > best.key) best = {ref: source.ref, key: startKey(m)};
    }
  }
  return best?.ref ?? null;
}

/** How an open or done todo relates to a lens (§1.2.1); the first that applies. */
export type ThreadRelation = 'waiting' | 'owe' | 'relevant';

/**
 * A lens resolved against the cache: its scope and the §1.2.1 predicates.
 * Shared by the overview, the Threads tab's filter, the Review roster and the
 * "Since last time" piece, so they all agree on what belongs to a thread or
 * counterpart.
 */
export interface ThreadLensContext {
  lens: ThreadLens;
  thread: ThreadRef;
  owner: ThreadItemRef | null;
  scope: string[];
  /** The sources inside the scope (the Inbox only when it is the owner). */
  inScope: ThreadSource[];
  types: string[];
  /** Whether tags carry the lens's tags (thread tag or plain leaf; counterpart lens: any thread of it). */
  inLens: (tags: readonly string[]) => boolean;
  /** The meeting a todo was agreed in, when its provenance resolves. */
  provenanceOf: (task: Task) => ProvenanceMatch | null;
  /** How a todo (filed inside the scope) relates to the lens, or null. */
  relationOf: (task: Task, match?: ProvenanceMatch | null) => ThreadRelation | null;
}

/**
 * The lens of `tag` in `requestedLens` (the counterpart lens for `wf`/`owe`
 * tags), scoped to `ownerPath` - see the module doc comment. Null when `tag`
 * is not a nested tag.
 */
export function threadLensContext(
  items: readonly CachedItem[],
  inbox: ThreadInboxInput | null,
  tag: string,
  requestedLens: ThreadLens,
  ownerPath: string | null,
): ThreadLensContext | null {
  const thread = threadOf(tag);
  if (!thread) return null;
  const lens: ThreadLens = isCounterpartType(thread.type) ? 'counterpart' : requestedLens;
  const all = threadSourcesOf(items, inbox);

  const ownerRef = ownerPath
    ? all.find(s => s.ref.path === ownerPath)?.ref ?? null
    : fallbackOwner(all, thread);
  const scopeOwnerPath = ownerPath ?? ownerRef?.path ?? null;
  const scope = scopeOwnerPath
    ? scopeOf(scopeOwnerPath, items, inbox?.path ?? null)
    : all.map(s => s.ref.path);
  const inScope = all.filter(s => scope.includes(s.ref.path));

  const tagLists = inScope.flatMap(s => [...s.tasks.map(t => t.tags), ...s.meetings.map(m => m.tags)]);
  const used = typesForCounterpart(tagLists, thread.counterpart);
  const types = [thread.type, ...used.filter(t => t !== thread.type)];
  const cp = thread.counterpart;
  // `#wf/<cp>` and `#owe/<cp>` have their own meaning below; they are not the lens's tags.
  const threadTypes = types.filter(t => !isCounterpartType(t));
  const inLens = (tags: readonly string[]) =>
    lens === 'thread' ? inThreadLens(tags, thread) : belongsToCounterpart(tags, cp, threadTypes);

  const provenanceSources: ProvenanceSource[] = all.map(s => ({path: s.ref.path, meetings: s.meetings}));
  const provenanceOf = (task: Task): ProvenanceMatch | null =>
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

/**
 * The overview of the thread of `tag` in `requestedLens` (the counterpart
 * lens for `wf`/`owe` tags), scoped to `ownerPath` - see the module doc
 * comment. Null when `tag` is not a nested tag.
 */
export function buildThreadOverview(
  items: readonly CachedItem[],
  inbox: ThreadInboxInput | null,
  tag: string,
  requestedLens: ThreadLens,
  ownerPath: string | null,
  now: Date = new Date(),
): ThreadOverview | null {
  const ctx = threadLensContext(items, inbox, tag, requestedLens, ownerPath);
  if (!ctx) return null;
  const {lens, thread, scope, inScope, types, inLens, provenanceOf, relationOf} = ctx;
  const today = todayIso(now);
  const nowMs = now.getTime();

  const aheadMeetings: ThreadMeetingEntry[] = [];
  const pastEntries: ThreadMeetingEntry[] = [];
  const lists = {waiting: [] as ThreadTaskEntry[], owe: [] as ThreadTaskEntry[], relevant: [] as ThreadTaskEntry[]};
  const doneRelated: ThreadTaskEntry[] = [];
  const agreedByMeeting = new Map<string, ThreadTaskEntry[]>();
  for (const source of inScope) {
    source.meetings.forEach((meeting, meetingIndex) => {
      if (meeting.cancelled || !inLens(meeting.tags)) return;
      const entry = {item: source.ref, meetingIndex, meeting};
      if (meetingEndMs(meeting) <= nowMs) pastEntries.push(entry);
      else aheadMeetings.push(entry);
    });
    source.tasks.forEach((task, taskIndex) => {
      if (task.cancelled) return;
      const entry = {item: source.ref, taskIndex, task};
      const match = provenanceOf(task);
      if (match) {
        // Every todo agreed in a meeting here, for Looking back.
        const key = `${match.path}#${match.meetingIndex}`;
        agreedByMeeting.set(key, [...(agreedByMeeting.get(key) ?? []), entry]);
      }
      const relation = relationOf(task, match);
      if (!relation) return;
      if (task.done) doneRelated.push(entry);
      else lists[relation].push(entry);
    });
  }
  aheadMeetings.sort((a, b) => startKey(a.meeting).localeCompare(startKey(b.meeting)));
  pastEntries.sort((a, b) => startKey(b.meeting).localeCompare(startKey(a.meeting)));

  const past: PastMeeting[] = pastEntries.map(entry => {
    const agreed = agreedByMeeting.get(`${entry.item.path}#${entry.meetingIndex}`) ?? [];
    const open = agreed.filter(a => !a.task.done);
    const done = agreed.filter(a => a.task.done);
    const ages = open.map(a => daysBetween(a.task.fields.created ?? entry.meeting.date, today));
    return {
      entry,
      key: meetingKey(entry.meeting),
      agreed: [...open, ...done],
      counts: {
        agreed: agreed.length,
        done: done.length,
        open: open.length,
        oldestOpenDays: ages.length > 0 ? Math.max(...ages) : null,
      },
    };
  });

  const from = past[0]?.entry.meeting.date ?? null;
  const sinceDone = from
    ? doneRelated
        .filter(e => e.task.fields.completion !== null && e.task.fields.completion >= from)
        .sort((a, b) => (b.task.fields.completion ?? '').localeCompare(a.task.fields.completion ?? ''))
    : [];

  return {
    lens,
    thread,
    owner: ctx.owner,
    scope,
    types,
    ahead: {meetings: aheadMeetings, ...lists},
    since: {from, done: sinceDone},
    past,
  };
}

/**
 * Whether a todo or meeting of the scope of `ownerPath` belongs to the
 * counterpart of `tag` - the counterpart lens's §1.2.1 predicate, the one the
 * overview classifies with (the Current page's counterpart filter). Null when
 * `tag` is not a nested tag.
 */
export function counterpartMatcher(
  items: readonly CachedItem[],
  inbox: ThreadInboxInput | null,
  tag: string,
  ownerPath: string,
): {task: (task: Task) => boolean; meeting: (meeting: Meeting) => boolean} | null {
  const ctx = threadLensContext(items, inbox, tag, 'counterpart', ownerPath);
  if (!ctx) return null;
  return {task: task => ctx.relationOf(task) !== null, meeting: meeting => ctx.inLens(meeting.tags)};
}

/** One "+ Next <type>" offer: the seed from the thread's latest meeting, to that meeting's item. */
export interface NextMeetingOffer {
  type: string;
  seed: MeetingSeedFields;
  item: ThreadItemRef;
}

/** "+ Next <type>" offers of an overview: per thread type (one in the thread lens), seeded from its meetings in the overview. */
export function nextMeetingOffers(overview: ThreadOverview, today: string): NextMeetingOffer[] {
  const types = overview.lens === 'thread' ? [overview.thread.type] : overview.types.filter(t => !isCounterpartType(t));
  const entries = [...overview.ahead.meetings, ...overview.past.map(p => p.entry)];
  const out: NextMeetingOffer[] = [];
  for (const type of types) {
    const tag = `${type}/${overview.thread.counterpart}`;
    const own = entries.filter(e => belongsToThread(e.meeting.tags, {type, counterpart: overview.thread.counterpart, tag}));
    const seed = nextMeetingSeed(own.map(e => e.meeting), today);
    const base = own.reduce<ThreadMeetingEntry | null>(
      (latest, e) => (!latest || startKey(e.meeting) > startKey(latest.meeting) ? e : latest),
      null,
    );
    if (seed && base) out.push({type, seed, item: base.item});
  }
  return out;
}
