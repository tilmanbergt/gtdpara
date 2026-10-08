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
 *   counterpart inside the scope, or the plain leaf.
 * - **Ahead.** Meetings not cancelled and not over yet, soonest first; I owe:
 *   open todos in the lens that are not Waiting For (Someday/Maybe included);
 *   Waiting for: open Waiting For todos in the lens or `#wf/<counterpart>`.
 * - **Looking back.** Meetings that are over, newest first, each with the
 *   todos agreed in it (domain/provenance.ts) and their counts; a todo's age
 *   is today minus its created date (or the meeting's date).
 *
 * Entries carry their item and the index into its full array, so every row
 * can be changed through storage/itemMutations.ts's mutateEntryTasks/
 * mutateEntryMeetings (the index-safety rule).
 */
import {meetingEndMs, todayIso} from '../domain/meetingTime';
import {daysBetween} from '../domain/nextMeeting';
import {meetingKey, ProvenanceSource, resolveProvenance} from '../domain/provenance';
import {
  belongsToCounterpart,
  belongsToThread,
  inThreadLens,
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
  ahead: {meetings: ThreadMeetingEntry[]; owe: ThreadTaskEntry[]; waiting: ThreadTaskEntry[]};
  /** Newest first. */
  past: PastMeeting[];
}

/** The Inbox's part: its folder path and lists. */
export interface ThreadInboxInput {
  path: string;
  tasks: Task[];
  meetings: Meeting[];
}

interface Source {
  ref: ThreadItemRef;
  tasks: Task[];
  meetings: Meeting[];
}

function sourcesOf(items: readonly CachedItem[], inbox: ThreadInboxInput | null): Source[] {
  const sources: Source[] = items
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
function fallbackOwner(sources: readonly Source[], thread: ThreadRef): ThreadItemRef | null {
  let best: {ref: ThreadItemRef; key: string} | null = null;
  for (const source of sources) {
    for (const m of source.meetings) {
      if (m.cancelled || !belongsToThread(m.tags, thread)) continue;
      if (!best || startKey(m) > best.key) best = {ref: source.ref, key: startKey(m)};
    }
  }
  return best?.ref ?? null;
}

/**
 * The overview of the thread of `tag` in `lens`, scoped to `ownerPath` - see
 * the module doc comment. Null when `tag` is not a nested tag.
 */
export function buildThreadOverview(
  items: readonly CachedItem[],
  inbox: ThreadInboxInput | null,
  tag: string,
  lens: ThreadLens,
  ownerPath: string | null,
  now: Date = new Date(),
): ThreadOverview | null {
  const thread = threadOf(tag);
  if (!thread) return null;
  const today = todayIso(now);
  const nowMs = now.getTime();
  const all = sourcesOf(items, inbox);

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
  const inLens = (tags: readonly string[]) =>
    lens === 'thread' ? inThreadLens(tags, thread) : belongsToCounterpart(tags, thread.counterpart, types);
  const waitsOnCounterpart = (task: Task) => task.waitingOn === thread.counterpart;

  const aheadMeetings: ThreadMeetingEntry[] = [];
  const pastEntries: ThreadMeetingEntry[] = [];
  const owe: ThreadTaskEntry[] = [];
  const waiting: ThreadTaskEntry[] = [];
  for (const source of inScope) {
    source.meetings.forEach((meeting, meetingIndex) => {
      if (meeting.cancelled || !inLens(meeting.tags)) return;
      const entry = {item: source.ref, meetingIndex, meeting};
      if (meetingEndMs(meeting) <= nowMs) pastEntries.push(entry);
      else aheadMeetings.push(entry);
    });
    source.tasks.forEach((task, taskIndex) => {
      if (task.done || task.cancelled) return;
      const entry = {item: source.ref, taskIndex, task};
      if (task.flowState === 'waiting-for') {
        if (inLens(task.tags) || waitsOnCounterpart(task)) waiting.push(entry);
      } else if (inLens(task.tags)) {
        owe.push(entry);
      }
    });
  }
  aheadMeetings.sort((a, b) => startKey(a.meeting).localeCompare(startKey(b.meeting)));
  pastEntries.sort((a, b) => startKey(b.meeting).localeCompare(startKey(a.meeting)));

  // Agreed todos: every todo in the scope whose provenance resolves to a past meeting here.
  const provenanceSources: ProvenanceSource[] = all.map(s => ({path: s.ref.path, meetings: s.meetings}));
  const agreedByMeeting = new Map<string, ThreadTaskEntry[]>();
  for (const source of inScope) {
    source.tasks.forEach((task, taskIndex) => {
      if (task.cancelled || !task.fields.meeting) return;
      const match = resolveProvenance(task, provenanceSources, scope);
      if (!match) return;
      const key = `${match.path}#${match.meetingIndex}`;
      const list = agreedByMeeting.get(key) ?? [];
      list.push({item: source.ref, taskIndex, task});
      agreedByMeeting.set(key, list);
    });
  }

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

  return {
    lens,
    thread,
    owner: ownerRef,
    scope,
    types,
    ahead: {meetings: aheadMeetings, owe, waiting},
    past,
  };
}
