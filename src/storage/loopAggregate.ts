/**
 * The loop overview's data (docs/dev/history/technical-design-loops.md §4.5):
 * the thread overview's lists (storage/threadAggregate.ts) for the loop's
 * tag, limited to its owner - a loop lives in one file - and to the loop's
 * full tag: the plain-leaf matching a counterpart has does not apply to a
 * loop. Pure over the warm cache.
 *
 * - Ahead: the loop's meetings not over yet; its open todos (domain/loops.ts's
 *   `isLoopMember`: tagged, or agreed in one of its meetings, past, running
 *   or ahead), those agreed first, then the ones waiting for someone, then
 *   the rest.
 * - Looking back: its meetings that are over, each with the todos agreed in
 *   it; "Since" the todos done since the latest of them.
 */
import {belongsToLoop, closeBlockers, isLoopMember, LoopRef, loopOf} from '../domain/loops';
import {findLoopLine, LoopLine} from '../domain/loopsSection';
import {CachedItem} from './dataCache';
import {buildThreadOverview, ThreadItemRef, ThreadOverview, ThreadTaskEntry} from './threadAggregate';

export interface LoopOverview {
  loop: LoopRef;
  /** Its `## Loops` line; null while the loop is not tracked yet. */
  line: LoopLine | null;
  owner: ThreadItemRef;
  /** The thread overview's shape, so its sections draw it. */
  lists: ThreadOverview;
  /** What keeps it from closing (§4.9). */
  blockers: {openTodos: number; upcomingMeetings: number};
}

export function buildLoopOverview(
  items: readonly CachedItem[],
  tag: string,
  ownerPath: string,
  kinds: readonly string[],
  now: Date = new Date(),
): LoopOverview | null {
  const owner = items.find(i => i.path === ownerPath);
  const loop = loopOf(tag, kinds);
  if (!owner || owner.loadError || !loop) return null;
  const all = buildThreadOverview([owner], null, loop.tag, 'thread', owner.path, now);
  if (!all) return null;
  const ofLoop = (tags: readonly string[]) => belongsToLoop(tags, loop.tag);
  const past = all.past.filter(p => ofLoop(p.entry.meeting.tags));
  // Todos count when tagged with the loop or agreed in one of its meetings, past, running or ahead.
  const keep = (e: ThreadTaskEntry) => isLoopMember(owner, loop.tag, e.task);
  const ref: ThreadItemRef = {kind: owner.kind, name: owner.name, path: owner.path, abbrev: owner.abbrev};
  // Since the loop's own latest meeting (the thread lists' "since" may start at another meeting).
  const from = past[0]?.entry.meeting.date ?? null;
  const since = from
    ? owner.tasks
        .map((task, taskIndex) => ({item: ref, taskIndex, task}))
        .filter(e => e.task.done && !e.task.cancelled && e.task.fields.completion !== null && e.task.fields.completion >= from && keep(e))
        .sort((a, b) => (b.task.fields.completion ?? '').localeCompare(a.task.fields.completion ?? ''))
    : [];
  const lists: ThreadOverview = {
    ...all,
    scope: [owner.path],
    types: [loop.kind],
    ahead: {
      meetings: all.ahead.meetings.filter(e => ofLoop(e.meeting.tags)),
      owe: all.ahead.owe.filter(keep),
      waiting: all.ahead.waiting.filter(keep),
      relevant: all.ahead.relevant.filter(keep),
    },
    since: {from, done: since},
    past,
  };
  const blockers = closeBlockers(owner, loop.tag, now.getTime());
  return {
    loop,
    line: findLoopLine(owner.loops, loop.tag) ?? null,
    owner: ref,
    lists,
    blockers: {openTodos: blockers.openTodos.length, upcomingMeetings: blockers.upcomingMeetings.length},
  };
}
