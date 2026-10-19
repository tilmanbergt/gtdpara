/**
 * The thread overview's data (docs/dev/history/technical-design-tending-threads.md
 * §3.3): a pure, synchronous transform over the warm cache plus the shared
 * Inbox, the storage/dailyAggregate.ts posture - no file reads here.
 *
 * Everything is limited to the owner's scope (domain/threads.ts's `scopeOf`,
 * decision D9). The owner is the item of the row whose tag was tapped; only
 * when none is known, the item holding the thread's latest meeting.
 *
 * - **Lens.** domain/threadLens.ts decides the scope, the lens's tags and how
 *   a todo relates to it; this module only sorts into lists.
 * - **Ahead.** Meetings not cancelled and not over yet, soonest first. Open,
 *   not cancelled todos go to the list of their relation (Waiting for, I owe,
 *   Relevant); Someday/Maybe go to their own list instead, which the
 *   overview only counts (docs/dev/history/technical-design-engage-in-context.md
 *   E10). Waiting For is one flow state, so never Someday.
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
import {isSomedayMaybe} from '../domain/flowState';
import {meetingEndMs, todayIso} from '../domain/meetingTime';
import {daysBetween, MeetingSeedFields, nextMeetingSeed} from '../domain/nextMeeting';
import {meetingKey} from '../domain/provenance';
import {
  LensItemRef,
  LensSource,
  meetingStartKey,
  threadLensContext as lensContextOf,
  ThreadLensContext,
  ThreadRelation,
} from '../domain/threadLens';
import {belongsToThread, isCounterpartType, ThreadLens, ThreadRef} from '../domain/threads';
import {Meeting, Task} from '../domain/types';
import {CachedItem} from './dataCache';

export type ThreadItemRef = LensItemRef;

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
  ahead: {
    meetings: ThreadMeetingEntry[];
    owe: ThreadTaskEntry[];
    waiting: ThreadTaskEntry[];
    relevant: ThreadTaskEntry[];
    /** Open Someday/Maybe todos of the lens: counted only, never in owe/relevant (E10). */
    someday: ThreadTaskEntry[];
  };
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
export type ThreadSource = LensSource;

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

export type {ThreadLensContext, ThreadRelation};

const startKey = meetingStartKey;

/** The lens of `tag` over the cache plus the Inbox (domain/threadLens.ts). Null when `tag` is not a nested tag. */
export function threadLensContext(
  items: readonly CachedItem[],
  inbox: ThreadInboxInput | null,
  tag: string,
  requestedLens: ThreadLens,
  ownerPath: string | null,
): ThreadLensContext | null {
  return lensContextOf(items, threadSourcesOf(items, inbox), inbox?.path ?? null, tag, requestedLens, ownerPath);
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
  const lists = {waiting: [] as ThreadTaskEntry[], owe: [] as ThreadTaskEntry[], relevant: [] as ThreadTaskEntry[], someday: [] as ThreadTaskEntry[]};
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
      else lists[isSomedayMaybe(task) ? 'someday' : relation].push(entry);
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
