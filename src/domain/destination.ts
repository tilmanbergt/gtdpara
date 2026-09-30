import {ItemStatus} from './types';

/**
 * The "where should this new Task/Meeting go" destination a user picks when
 * creating one outside its own Project/Area file - Inbox, or any Project/
 * Area. Shared between CaptureScreen (Lasso capture) and DailyView (its own
 * on-page quick-add), so the two pickers can never drift on what counts as
 * "the same destination" or how one is labeled. Deliberately just this pure
 * logic - the expandable-list picker UI itself stays a local, per-screen
 * component in each file (design-overview.md §3's per-screen-styling
 * convention: presentation isn't shared, logic that must stay identical is).
 */
export type Destination =
  | {type: 'inbox'}
  | {type: 'item'; kind: 'project' | 'area'; name: string; path: string};

export function destinationLabel(destination: Destination): string {
  return destination.type === 'inbox' ? 'Inbox' : destination.name;
}

export function sameDestination(a: Destination, b: Destination): boolean {
  if (a.type === 'inbox' || b.type === 'inbox') return a.type === b.type;
  return a.path === b.path;
}

interface DestinationCandidate {
  status: ItemStatus;
  dailyFocus: boolean;
  weeklyFocus: boolean;
  monthlyFocus: boolean;
}

/**
 * Which of `items` (already filtered to one kind by the caller - a
 * Projects list, or an Areas list) are valid quick-add/capture
 * destinations, in display order: focused items (daily, weekly or monthly) first,
 * then the rest in whatever order the caller's array was already in
 * (alphabetical, from the native folder listing) - Array.prototype.sort is
 * stable (Hermes included), so a plain compare-by-focused is enough, no
 * secondary tiebreaker needed.
 *
 * Excludes anything not Active - On Hold/Done/Archived items are never
 * offered as a place to file a new Task/Meeting (technical-design-status-archive.md §6).
 * Used by both CaptureScreen.tsx and DailyView.tsx's quick-add so the two
 * pickers can't drift on this rule either, same reasoning as the rest of
 * this file.
 */
export function destinationCandidates<T extends DestinationCandidate>(items: T[]): T[] {
  return items
    .filter(item => item.status === 'active')
    .slice()
    .sort((a, b) => Number(isFocused(b)) - Number(isFocused(a)));
}

interface FocusFlags {
  dailyFocus: boolean;
  weeklyFocus: boolean;
  monthlyFocus: boolean;
}

/**
 * Exported (2026-09-03 Daily-cleanup pass, technical-design-daily-compact-
 * ui.md §3/§6) so storage/dailyAggregate.ts's groupDailyTasksByItem and
 * screens/ItemsList.tsx can share this one "focused floats to top" check
 * instead of each keeping their own copy - ItemsList.tsx used to have an
 * identical private isFocused of its own. Widened to the minimal shape this
 * needs (just the two focus flags, not the full DestinationCandidate with
 * `status`) so a plain CachedItem/DailyItemRef satisfies it structurally.
 *
 * Widened 2026-09-28 (docs/dev/technical-design-review-monthly-focus.md §1) to
 * include Monthly focus: a Project/Area in ANY focus level counts as
 * focused, so its #next tasks show on Daily (storage/dailyAggregate.ts) and
 * it no longer counts as "unfocused" in Review (storage/reviewAggregate.ts).
 */
export function isFocused(item: FocusFlags): boolean {
  return item.dailyFocus || item.weeklyFocus || item.monthlyFocus;
}
