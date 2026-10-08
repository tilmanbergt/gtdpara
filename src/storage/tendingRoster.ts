/**
 * The counterparts to tend, per scope (docs/dev/history/technical-design-tending-threads.md
 * §3.9.4, §3.10): what the Threads tab on the Current page and Review's
 * "Tending threads" step list. A pure, synchronous transform over the warm
 * cache plus the shared Inbox, like storage/threadAggregate.ts.
 *
 * Every counterpart of a scope (domain/counterparts.ts) gets its signals from
 * the overview's counterpart lens with the scope's owner as owner, so the
 * counts here are the overview's: the latest past and the next meeting, the
 * open I-owe todos, and the open Waiting-for todos with the oldest one's age
 * (today minus its created date; todos without one have no age). No sorting
 * by urgency: counterparts alphabetically, scopes in the order of
 * `counterpartScopes`. The Inbox is no scope (decision D18).
 */
import {Counterpart, counterpartScopes, counterpartsOf, counterpartTag, CounterpartScope, CounterpartSource} from '../domain/counterparts';
import {todayIso} from '../domain/meetingTime';
import {daysBetween} from '../domain/nextMeeting';
import {CachedItem} from './dataCache';
import {buildThreadOverview, ThreadInboxInput, ThreadItemRef, ThreadOverview} from './threadAggregate';

export interface RosterEntry {
  counterpart: Counterpart;
  /** The scope's owner: the Area, or the Project without an Area. */
  owner: ThreadItemRef;
  /** A nested tag naming the counterpart (domain/counterparts.ts's counterpartTag), to open its overview with. */
  tag: string;
  /** Date of the latest meeting that is over, or null. */
  lastMeeting: string | null;
  /** Date of the next meeting that is not over yet, or null. */
  nextMeeting: string | null;
  oweCount: number;
  waitingCount: number;
  /** Days since the oldest open Waiting-for todo was created; null when none has a created date. */
  oldestWaitingDays: number | null;
  /** The counterpart lens overview the signals come from. */
  overview: ThreadOverview;
}

export interface RosterScope {
  owner: ThreadItemRef;
  /** New counterparts and inactive ones back in use (D3, D20): to confirm with Tend / Not. */
  confirm: RosterEntry[];
  active: RosterEntry[];
  inactive: RosterEntry[];
}

function refOf(item: CachedItem): ThreadItemRef {
  return {kind: item.kind, name: item.name, path: item.path, abbrev: item.abbrev};
}

/** One counterpart's roster entry inside the scope headed by `owner`. */
export function rosterEntryOf(
  items: readonly CachedItem[],
  inbox: ThreadInboxInput | null,
  owner: ThreadItemRef,
  counterpart: Counterpart,
  now: Date,
): RosterEntry {
  const tag = counterpartTag(counterpart);
  const overview = buildThreadOverview(items, inbox, tag, 'counterpart', owner.path, now)!;
  const today = todayIso(now);
  const ages = overview.ahead.waiting
    .map(e => (e.task.fields.created ? daysBetween(e.task.fields.created, today) : null))
    .filter((d): d is number => d !== null);
  return {
    counterpart,
    owner,
    tag,
    lastMeeting: overview.past[0]?.entry.meeting.date ?? null,
    nextMeeting: overview.ahead.meetings[0]?.meeting.date ?? null,
    oweCount: overview.ahead.owe.length,
    waitingCount: overview.ahead.waiting.length,
    oldestWaitingDays: ages.length > 0 ? Math.max(...ages) : null,
    overview,
  };
}

/** The roster of one scope (see the module doc comment). */
export function buildScopeRoster(
  items: readonly CachedItem[],
  inbox: ThreadInboxInput | null,
  scope: CounterpartScope<CachedItem>,
  ruleTypes: readonly string[],
  now: Date = new Date(),
): RosterScope {
  const owner = refOf(scope.owner);
  const entries = counterpartsOf(scope as CounterpartScope<CounterpartSource>, ruleTypes, now).map(cp =>
    rosterEntryOf(items, inbox, owner, cp, now),
  );
  return {
    owner,
    confirm: entries.filter(e => e.counterpart.status === 'new' || e.counterpart.backInUse),
    active: entries.filter(e => e.counterpart.status === 'active'),
    inactive: entries.filter(e => e.counterpart.status === 'inactive' && !e.counterpart.backInUse),
  };
}

/** The roster of every scope (Areas with their Projects, then Projects without an Area; Active and On Hold). */
export function buildTendingRoster(
  items: readonly CachedItem[],
  inbox: ThreadInboxInput | null,
  ruleTypes: readonly string[],
  now: Date = new Date(),
): RosterScope[] {
  const loaded = items.filter(i => !i.loadError);
  return counterpartScopes(loaded).map(scope => buildScopeRoster(loaded, inbox, scope, ruleTypes, now));
}
