/**
 * Weekly Review step registry and per-step review tracking
 * (docs/dev/technical-design-review-hub.md). Pure logic - no RN imports, no I/O
 * (design-overview.md §3). Persistence lives in storage/settingsStorage.ts
 * (`updateReviewSteps`); the screen that drives all of this is
 * screens/ReviewScreen.tsx, the hub UI is ui/ReviewHub.tsx.
 *
 * What is persisted (`GtdParaSettings.reviewSteps`): one small record per
 * step, keyed by a stable STRING id (never the step's position - steps get
 * inserted into the list, and a persisted index would silently point at the
 * wrong step after an insertion):
 * - `reviewedAt`: the last time the user tapped "Reviewed" on the step.
 * - `counts`: the recap numbers of that step's last recorded visit.
 * - `emptyAt`: the last time the hub saw a *backlog* step with nothing in it.
 *   Exists only so the tab badge (App.tsx), which has no review aggregate,
 *   can tell "empty, so fine" from "not looked at" - see applyEmptyStamps.
 *
 * Everything else the hub shows (counts, "last review", row state, combined
 * recap) is derived on demand, never stored.
 */
import {Features} from './features';
import {formatWeekdayDate} from './dateFormat';
import {todayIso} from './meetingTime';

/**
 * Deliberately coarse counters for the recap - this is not an essential
 * feature, so nothing hard to track is tracked. Every counter is a plain
 * running count bumped inline by whichever action fired, with no further
 * breakdown (e.g. `onHold` doesn't distinguish Projects from Areas), except
 * `projectsActivated`/`areasActivated`, which screens/ReviewScreen.tsx
 * computes once when a step is LEFT (from that step's frozen snapshot).
 * Lives here rather than in domain/settings.ts so settings.ts can import
 * the record type below without an import cycle.
 */
export interface ReviewSummaryCounts {
  tasksAdded: number;
  inboxCleared: number;
  projectsActivated: number;
  areasActivated: number;
  reactivated: number;
  onHold: number;
  markedDone: number;
  archived: number;
  /** "Add to Weekly focus" (docs/dev/technical-design-daily-todo-filter.md) - kept separate from dailyFocusAdded below so the recap's line text stays accurate about which focus scope was touched. A saved blob that lacks this key reads it as undefined, which every consumer here treats as 0 (this recap is deliberately coarse/non-audited). */
  weeklyFocusAdded: number;
  /** "Add to Daily focus" from the Unfocused-next-items review step (docs/dev/technical-design-daily-todo-filter.md) - kept separate from weeklyFocusAdded above so the recap's line text stays accurate about which focus scope was touched. */
  dailyFocusAdded: number;
  /** "Add to Monthly focus" (Unfocused next items) and monthly slots filled in Focus reset (docs/dev/technical-design-review-monthly-focus.md §3). May be absent in saved stats - every reader uses `?? 0`. */
  monthlyFocusAdded: number;
  /** "Meetings to close out" step (docs/dev/technical-design-meeting-tracking.md): meetings ticked `#reviewed` during the visit. */
  meetingsClosedOut: number;
  /**
   * Gmail inbox review step (docs/dev/technical-design-review-gmail-inbox.md
   * §3): Todos/Meetings created from an email during the visit. Kept
   * distinct from `tasksAdded` (which every other step's task creation also
   * bumps) so this step's own recap line reads "N items created from
   * email" rather than folding into the generic "task added" line -
   * gmailInboxCache.ts / the step's own add handlers bump both this and
   * `tasksAdded` together (an email-derived task is still a task).
   */
  gmailItemsCreated: number;
  /**
   * Emails archived during the visit (docs/dev/technical-design-review-gmail-
   * inbox.md §7) - kept distinct from the generic `archived` field above,
   * which means "a Project/Area archived" everywhere else in this recap.
   */
  gmailArchived: number;
}

export const ZERO_REVIEW_SUMMARY: ReviewSummaryCounts = {
  tasksAdded: 0,
  inboxCleared: 0,
  projectsActivated: 0,
  areasActivated: 0,
  reactivated: 0,
  onHold: 0,
  markedDone: 0,
  archived: 0,
  weeklyFocusAdded: 0,
  dailyFocusAdded: 0,
  monthlyFocusAdded: 0,
  meetingsClosedOut: 0,
  gmailItemsCreated: 0,
  gmailArchived: 0,
};

/** Stable ids - the persisted key of a step. Adding a step: one id here, one REVIEW_STEPS entry, one entry in storage/reviewAggregate.ts's buildReviewStepCounts (the `Record<ReviewStepId, ...>` type makes the compiler insist), one renderer in screens/ReviewScreen.tsx. */
export type ReviewStepId =
  | 'weekAhead'
  | 'meetingsCloseOut'
  | 'gmailInbox'
  | 'inbox'
  | 'stalled'
  | 'done'
  | 'onHold'
  | 'neglected'
  | 'unfocusedNext'
  | 'weeklyFocus';

/**
 * - 'backlog': has a count that can reach 0, and 0 means "nothing to review"
 *   - such a step counts as reviewed automatically while it is empty and
 *   never holds the "last review" date back.
 * - 'ritual': always worth a look whatever the number says (an empty week or
 *   0 of 8 focus slots filled is exactly what those steps exist to fix), so
 *   it is never auto-empty.
 */
export type ReviewStepKind = 'backlog' | 'ritual';

export interface ReviewStepDef {
  id: ReviewStepId;
  title: string;
  kind: ReviewStepKind;
}

/**
 * The ONLY place step order and titles live: array order = walk-through
 * order = hub order. Renderers stay in screens/ReviewScreen.tsx (they are
 * JSX). 'gmailInbox' sits right before 'inbox' (docs/dev/technical-design-
 * review-gmail-inbox.md §3) - triaging email naturally happens right before
 * triaging the plugin's own Inbox-to-zero step, and both are "backlog"
 * (count can reach 0 - an unconfigured or empty Gmail inbox counts as
 * reviewed automatically, same as every other backlog step).
 */
export const REVIEW_STEPS: ReviewStepDef[] = [
  {id: 'weekAhead', title: 'Week ahead', kind: 'ritual'},
  {id: 'meetingsCloseOut', title: 'Meetings to close out', kind: 'backlog'},
  {id: 'gmailInbox', title: 'Gmail inbox', kind: 'backlog'},
  {id: 'inbox', title: 'Inbox to zero', kind: 'backlog'},
  {id: 'stalled', title: 'Stalled projects', kind: 'backlog'},
  {id: 'done', title: 'Done awaiting review', kind: 'backlog'},
  {id: 'onHold', title: 'On Hold reconsideration', kind: 'backlog'},
  {id: 'neglected', title: 'Neglected areas', kind: 'backlog'},
  {id: 'unfocusedNext', title: 'Unfocused next items', kind: 'backlog'},
  // The step sets weekly AND monthly focus (docs/technical-design-review-
  // monthly-focus.md §3). The id stays 'weeklyFocus' on purpose: it is the
  // persisted key of this step's last-reviewed date and stats.
  {id: 'weeklyFocus', title: 'Focus reset', kind: 'ritual'},
];

/**
 * The steps actually shown (docs/dev/technical-design-about-debug-experimental.md
 * §3.2): 'gmailInbox' only while the experimental Gmail integration is on.
 * Everything that walks, counts or dates steps takes this list, so a hidden
 * step is never listed, never next/previous and never makes the review overdue.
 * Its stored record is left untouched.
 */
export function activeReviewSteps(features: Pick<Features, 'gmail'>): ReviewStepDef[] {
  return features.gmail ? REVIEW_STEPS : REVIEW_STEPS.filter(step => step.id !== 'gmailInbox');
}

export function reviewStepDef(id: ReviewStepId): ReviewStepDef {
  const def = REVIEW_STEPS.find(step => step.id === id);
  if (!def) throw new Error(`Unknown review step id: ${id}`);
  return def;
}

/** The step after `id` in walk-through order, or null after the last one. */
export function nextReviewStepId(id: ReviewStepId, steps: ReviewStepDef[] = REVIEW_STEPS): ReviewStepId | null {
  const index = steps.findIndex(step => step.id === id);
  return index >= 0 && index < steps.length - 1 ? steps[index + 1].id : null;
}

/** The step before `id`, or null before the first one. */
export function prevReviewStepId(id: ReviewStepId, steps: ReviewStepDef[] = REVIEW_STEPS): ReviewStepId | null {
  const index = steps.findIndex(step => step.id === id);
  return index > 0 ? steps[index - 1].id : null;
}

export interface ReviewStepRecord {
  /** Last time "Reviewed" was tapped on this step (ISO timestamp), null if never. */
  reviewedAt: string | null;
  /** Recap numbers of the last recorded visit - see applyStepVisit for which visits get recorded. */
  counts: ReviewSummaryCounts;
  /** Last time the hub saw this (backlog) step empty; absent when it was non-empty the last time we looked. */
  emptyAt?: string;
}

/** Keyed by ReviewStepId, typed as plain string so an id this build doesn't know (written by another build) is preserved and ignored rather than rejected. */
export type ReviewStepsMap = Record<string, ReviewStepRecord>;

/** A step is "stale" once its last review is older than a week - the one threshold behind both the tab badge and the hub's per-row `●` marker. */
export const REVIEW_STALE_MS = 7 * 24 * 60 * 60 * 1000;

function parseMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const ms = new Date(iso).getTime();
  return Number.isNaN(ms) ? null : ms;
}

/** Missing or malformed counts as stale ("treat unparseable like never") - this only ever drives a passive marker. */
export function isStaleTimestamp(iso: string | null | undefined, now: Date = new Date()): boolean {
  const ms = parseMs(iso);
  return ms === null || now.getTime() - ms > REVIEW_STALE_MS;
}

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function hasAnyCount(counts: Partial<ReviewSummaryCounts>): boolean {
  return (Object.keys(ZERO_REVIEW_SUMMARY) as Array<keyof ReviewSummaryCounts>).some(key => (counts[key] ?? 0) > 0);
}

/**
 * The persisted result of leaving a step (docs/dev/technical-design-review-hub.md
 * §3.3). One rule: the step's stats are the last visit that either was
 * Reviewed or actually did something.
 * - reviewed: date = now, counts replaced by this visit's tally (even zeros).
 * - not reviewed (Skip / Overview / Back) with a non-zero tally: counts
 *   replaced, date untouched.
 * - not reviewed with a zero tally: nothing changes - the SAME `steps`
 *   reference is returned, so callers can skip the write with `===`.
 */
export function applyStepVisit(
  steps: ReviewStepsMap,
  id: ReviewStepId,
  reviewed: boolean,
  counts: ReviewSummaryCounts,
  now: Date = new Date(),
): ReviewStepsMap {
  const existing = steps[id];
  if (reviewed) {
    return {...steps, [id]: {reviewedAt: now.toISOString(), counts: {...counts}}};
  }
  if (!hasAnyCount(counts)) return steps;
  return {...steps, [id]: {reviewedAt: existing?.reviewedAt ?? null, counts: {...counts}, ...(existing?.emptyAt ? {emptyAt: existing.emptyAt} : {})}};
}

/**
 * Keeps `emptyAt` in step with what the hub currently sees (docs/technical-
 * design-review-hub.md §7). `emptyIds` are the steps whose live count is 0;
 * only backlog steps are ever stamped. An empty step gets `emptyAt = now`,
 * refreshed at most once per calendar day (so it is not rewritten on every
 * render); a step that is non-empty again loses it. Separate from
 * `reviewedAt` on purpose: auto-empty must not overwrite real review history.
 * Returns the SAME reference when nothing changed.
 */
export function applyEmptyStamps(
  steps: ReviewStepsMap,
  emptyIds: ReviewStepId[],
  now: Date = new Date(),
  defs: ReviewStepDef[] = REVIEW_STEPS,
): ReviewStepsMap {
  let next = steps;
  for (const def of defs) {
    if (def.kind !== 'backlog') continue;
    const record = steps[def.id];
    if (emptyIds.includes(def.id)) {
      const stampedMs = parseMs(record?.emptyAt);
      if (stampedMs !== null && sameLocalDay(new Date(stampedMs), now)) continue;
      next = {...next, [def.id]: {reviewedAt: record?.reviewedAt ?? null, counts: record?.counts ?? {...ZERO_REVIEW_SUMMARY}, emptyAt: now.toISOString()}};
    } else if (record?.emptyAt) {
      next = {...next, [def.id]: {reviewedAt: record.reviewedAt, counts: record.counts}};
    }
  }
  return next;
}

export type ReviewRowKind = 'empty' | 'never' | 'stale' | 'ok';

export interface ReviewRowState {
  kind: ReviewRowKind;
  /** The step's last "Reviewed" timestamp (null for 'empty' and 'never'). */
  lastAt: string | null;
}

/** What one hub row shows for the last-reviewed column. `count` is the step's live count. */
export function stepRowState(def: ReviewStepDef, record: ReviewStepRecord | undefined, count: number, now: Date = new Date()): ReviewRowState {
  if (def.kind === 'backlog' && count === 0) return {kind: 'empty', lastAt: null};
  const reviewedAt = record?.reviewedAt ?? null;
  if (parseMs(reviewedAt) === null) return {kind: 'never', lastAt: null};
  return {kind: isStaleTimestamp(reviewedAt, now) ? 'stale' : 'ok', lastAt: reviewedAt};
}

export type OldestReview = {kind: 'never'} | {kind: 'date'; iso: string};

/**
 * The hub headline's "last review": the OLDEST last-reviewed date over the
 * steps that currently need looking at (ritual steps, plus backlog steps
 * with something in them - an empty step never holds it back). 'never' when
 * any of those has never been reviewed. `counts` is the live count per step.
 */
export function oldestRelevantReview(
  steps: ReviewStepsMap,
  counts: Record<ReviewStepId, {n: number}>,
  defs: ReviewStepDef[] = REVIEW_STEPS,
): OldestReview {
  let oldestMs: number | null = null;
  let oldestIso = '';
  for (const def of defs) {
    if (def.kind === 'backlog' && counts[def.id].n === 0) continue;
    const iso = steps[def.id]?.reviewedAt ?? null;
    const ms = parseMs(iso);
    if (ms === null || iso === null) return {kind: 'never'};
    if (oldestMs === null || ms < oldestMs) {
      oldestMs = ms;
      oldestIso = iso;
    }
  }
  return oldestMs === null ? {kind: 'never'} : {kind: 'date', iso: oldestIso};
}

/** Combined recap: field-wise sum of every step's last recorded counts. `?? 0` per key so counters added (or renamed) later fall out harmlessly. */
export function sumReviewSummaries(steps: ReviewStepsMap): ReviewSummaryCounts {
  const total: ReviewSummaryCounts = {...ZERO_REVIEW_SUMMARY};
  for (const record of Object.values(steps)) {
    if (!record || !record.counts) continue;
    for (const key of Object.keys(ZERO_REVIEW_SUMMARY) as Array<keyof ReviewSummaryCounts>) {
      total[key] += record.counts[key] ?? 0;
    }
  }
  return total;
}

/**
 * The Review tab's badge (App.tsx): true when ANY step's last-done date is
 * missing or older than a week. Count-agnostic on purpose - App has no review
 * aggregate - so a step's last-done date is `max(reviewedAt, emptyAt)`: a
 * backlog step last seen empty counts as done at that moment (see
 * applyEmptyStamps). Opening Review re-stamps the empty steps, so at worst
 * the badge nudges the user to open the tab.
 */
export function isReviewOverdue(steps: ReviewStepsMap, now: Date = new Date(), defs: ReviewStepDef[] = REVIEW_STEPS): boolean {
  for (const def of defs) {
    const record = steps[def.id];
    const reviewedMs = parseMs(record?.reviewedAt);
    const emptyMs = parseMs(record?.emptyAt);
    const lastMs = reviewedMs === null ? emptyMs : emptyMs === null ? reviewedMs : Math.max(reviewedMs, emptyMs);
    if (lastMs === null || now.getTime() - lastMs > REVIEW_STALE_MS) return true;
  }
  return false;
}

// ---- Text helpers shared by the hub and the end page ----

/** "today", "yesterday", "N days ago", then a weekday and date ("Mon 28.9."). */
export function formatReviewedAt(iso: string, now: Date): string {
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return 'unknown';
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(now) - startOfDay(then)) / (24 * 60 * 60 * 1000));
  if (dayDiff === 0) return 'today';
  if (dayDiff === 1) return 'yesterday';
  if (dayDiff > 1 && dayDiff < 14) return `${dayDiff} days ago`;
  return formatWeekdayDate(then, todayIso(now));
}

export function pluralize(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`;
}

/**
 * Turns recap counts into short lines - one per non-zero counter, in a fixed,
 * roughly review-step order. Deliberately just a flat list: no grouping, no
 * percentages, nothing derived beyond the counts themselves.
 */
export function summaryLines(counts: ReviewSummaryCounts): string[] {
  const lines: string[] = [];
  if (counts.tasksAdded > 0) lines.push(`${pluralize(counts.tasksAdded, 'task')} added`);
  if (counts.meetingsClosedOut > 0) lines.push(`${pluralize(counts.meetingsClosedOut, 'meeting')} closed out`);
  if (counts.gmailItemsCreated > 0) lines.push(`${pluralize(counts.gmailItemsCreated, 'item')} created from email`);
  if (counts.gmailArchived > 0) lines.push(`${pluralize(counts.gmailArchived, 'email')} archived`);
  if (counts.inboxCleared > 0) lines.push(`${pluralize(counts.inboxCleared, 'inbox item')} cleared`);
  if (counts.projectsActivated > 0) lines.push(`${pluralize(counts.projectsActivated, 'stalled project')} activated`);
  if (counts.areasActivated > 0) lines.push(`${pluralize(counts.areasActivated, 'neglected area')} activated`);
  if (counts.reactivated > 0) lines.push(`${pluralize(counts.reactivated, 'item')} reactivated`);
  if (counts.onHold > 0) lines.push(`${pluralize(counts.onHold, 'item')} put on hold`);
  if (counts.markedDone > 0) lines.push(`${pluralize(counts.markedDone, 'item')} marked done`);
  if (counts.archived > 0) lines.push(`${pluralize(counts.archived, 'item')} archived`);
  if (counts.weeklyFocusAdded > 0) lines.push(`${pluralize(counts.weeklyFocusAdded, 'item')} added to weekly focus`);
  if (counts.dailyFocusAdded > 0) lines.push(`${pluralize(counts.dailyFocusAdded, 'item')} added to daily focus`);
  if ((counts.monthlyFocusAdded ?? 0) > 0) lines.push(`${pluralize(counts.monthlyFocusAdded, 'item')} added to monthly focus`);
  return lines;
}
