/**
 * The open loops per scope for the Review's "Open loops" step
 * (docs/dev/history/technical-design-loops.md §4.8): the scopes are the
 * Tending threads ones (domain/counterparts.ts's `counterpartScopes` - an
 * Area with its Projects, then each Project without an Area), and each
 * scope lists the active loops of its members, by main date
 * (storage/loopGlance.ts). Pure over the warm cache.
 *
 * A loop needs a look when nothing moves it forward - no `#next`/`#now`
 * todo and no meeting ahead ("no next action") - or when its main date has
 * passed ("was <date> · close?"). The step's count is those loops.
 */
import {counterpartScopes} from '../domain/counterparts';
import {CachedItem} from './dataCache';
import {buildLoopGlance, LoopGlanceRow} from './loopGlance';

export type LoopAttention = 'noNext' | 'pastMainDate' | null;

export interface LoopRosterEntry {
  glance: LoopGlanceRow;
  /** The loop's own Area or Project. */
  owner: CachedItem;
  attention: LoopAttention;
}

export interface LoopRosterScope {
  owner: CachedItem;
  loops: LoopRosterEntry[];
}

/** Why `row` needs a look, or null. */
export function loopAttention(row: LoopGlanceRow, today: string): LoopAttention {
  if (row.line.mainDate && row.line.mainDate < today) return 'pastMainDate';
  if (row.stalled && row.nextMeeting === null) return 'noNext';
  return null;
}

export function buildLoopRoster(items: readonly CachedItem[], kinds: readonly string[], today: string, now: Date = new Date()): LoopRosterScope[] {
  if (kinds.length === 0) return [];
  const loaded = items.filter(i => !i.loadError);
  return counterpartScopes(loaded)
    .map(scope => ({
      owner: scope.owner,
      loops: scope.members.flatMap(member =>
        buildLoopGlance(member, kinds, today, now).active.map(glance => ({glance, owner: member, attention: loopAttention(glance, today)})),
      ),
    }))
    .filter(scope => scope.loops.length > 0);
}

/** The step's count: the loops that need a look. */
export function loopRosterCount(roster: readonly LoopRosterScope[]): number {
  return roster.reduce((sum, scope) => sum + scope.loops.filter(l => l.attention !== null).length, 0);
}
