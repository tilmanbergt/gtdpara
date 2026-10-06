/**
 * Which Review page is shown, and the recap tally of the step visit in
 * progress. Module-level, not React state: App.tsx unmounts the Review
 * screen on a tab switch, and both must survive that (and reopening the
 * plugin from a note opened in a step). Session-only - an app relaunch
 * starts on the hub again.
 *
 * The tally is per visit: steps call `bump` as actions happen, and the
 * shell's leaveStep turns it into the step's record (domain/reviewSteps.ts's
 * applyStepVisit). Stalled projects / Neglected areas also register their
 * frozen list, so leaving the step can count how many picked up a next task.
 */
import {ReviewStepId, ReviewSummaryCounts, ZERO_REVIEW_SUMMARY} from '../../domain/reviewSteps';
import {ReviewProjectEntry} from '../../storage/reviewAggregate';

/** Which page the screen shows: the hub, one step, or the end page after the last step. */
export type ReviewView = {kind: 'hub'} | {kind: 'step'; id: ReviewStepId} | {kind: 'end'};

let savedView: ReviewView = {kind: 'hub'};

interface Visit {
  id: ReviewStepId;
  counts: ReviewSummaryCounts;
  /** Stalled/Neglected: the step's frozen list, for projectsActivated/areasActivated. */
  activationCandidates: ReviewProjectEntry[];
}

let visit: Visit | null = null;

export function getSavedView(): ReviewView {
  return savedView;
}

/** Remembers `view` for a remount; the end page is not remembered (a remount after it lands on the hub). */
export function rememberView(view: ReviewView): void {
  savedView = view.kind === 'end' ? {kind: 'hub'} : view;
}

export function startVisit(id: ReviewStepId): void {
  visit = {id, counts: {...ZERO_REVIEW_SUMMARY}, activationCandidates: []};
}

/** The step whose visit is in progress, or null on the hub/end page. */
export function visitStepId(): ReviewStepId | null {
  return visit?.id ?? null;
}

/**
 * Bumps one recap counter of the visit in progress. A no-op outside a visit;
 * never goes below 0 (a tick that gets un-ticked takes its count back).
 */
export function bump(key: keyof ReviewSummaryCounts, delta = 1): void {
  if (!visit) return;
  visit = {...visit, counts: {...visit.counts, [key]: Math.max(0, (visit.counts[key] ?? 0) + delta)}};
}

export function setActivationCandidates(entries: ReviewProjectEntry[]): void {
  if (visit) visit = {...visit, activationCandidates: entries};
}

/** Ends the visit of step `id` and returns it, or null when no visit of that step is open (a double tap). */
export function endVisit(id: ReviewStepId): Visit | null {
  if (visit?.id !== id) return null;
  const ended = visit;
  visit = null;
  return ended;
}
