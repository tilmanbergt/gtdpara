/**
 * The loops of an Area or Project at a glance
 * (docs/dev/history/technical-design-loops.md §4.7): what the Projects tab
 * (Area page) and the Loops tab (Project page) list. Pure over the warm
 * cache, like storage/projectGlance.ts, whose signals each loop row shows for
 * the loop's own todos and meetings.
 *
 * - Active loops by main date (without one last, then by tag).
 * - New: loop tags used on an active todo or a meeting without a line.
 * - Someday: loop ideas (a bare loop tag with someday/maybe).
 * - Closed: done and dropped loops, newest main date first.
 */
import {LoopRef, loopIdeas, loopMembers, loopOf, loopsInUse} from '../domain/loops';
import {LoopLine} from '../domain/loopsSection';
import {CachedItem} from './dataCache';
import {GlanceSignals, glanceSignals} from './projectGlance';

export interface LoopGlanceRow extends GlanceSignals {
  line: LoopLine;
  loop: LoopRef;
}

export interface LoopGlance {
  active: LoopGlanceRow[];
  fresh: LoopRef[];
  ideas: LoopRef[];
  closed: LoopGlanceRow[];
}

const byMainDate = (a: LoopLine, b: LoopLine): number =>
  (a.mainDate ?? '9999').localeCompare(b.mainDate ?? '9999') || a.tag.localeCompare(b.tag);

export function buildLoopGlance(owner: CachedItem, kinds: readonly string[], today: string, now: Date): LoopGlance {
  const nowMs = now.getTime();
  const rowOf = (line: LoopLine): LoopGlanceRow => {
    const loop = loopOf(line.tag, kinds) ?? {kind: line.tag.split('/')[0], name: line.tag.split('/').slice(1).join('/'), tag: line.tag};
    const members = loopMembers(owner, line.tag);
    return {line, loop, ...glanceSignals(members.tasks, members.meetings, today, nowMs)};
  };
  return {
    active: owner.loops.filter(l => l.status === 'active').sort(byMainDate).map(rowOf),
    fresh: loopsInUse(owner, kinds),
    ideas: loopIdeas(owner, kinds),
    closed: owner.loops
      .filter(l => l.status !== 'active')
      .sort((a, b) => byMainDate(b, a))
      .map(rowOf),
  };
}

/** Line 2, left of a loop row: `14.11. · next 20.10.`; `no main date` when it has none. */
export function loopDateText(row: LoopGlanceRow, formatDate: (iso: string) => string): string {
  const main = row.line.mainDate ? formatDate(row.line.mainDate) : 'no main date';
  return `${main} · next ${row.nextMeeting ? formatDate(row.nextMeeting) : '—'}`;
}
