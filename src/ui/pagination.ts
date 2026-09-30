/**
 * Shared pagination logic (docs/dev/technical-design-pagination-edit-reuse.md §2)
 * - every list in the app pages through a fixed set of rows instead of
 * scrolling, so e-ink only ever has to redraw one fixed-size box rather than
 * an arbitrary, growing scroll region.
 *
 * `usePagedByHeight` (docs/dev/technical-design-pagination-fixed-height.md,
 * 2026-09-15/16) is the app's one remaining pagination hook - fits as many
 * rows as their real, per-row `rowHeight` allows into a fixed pixel
 * `viewportHeight`, so the box's total height never varies with content.
 * `PAGE_SIZE` below is still a per-list-type constant, but for most callers
 * it's no longer a literal row count fed straight to a hook - it's an
 * anchor multiplied by a row's own pixel height to get that list's
 * `viewportHeight` (the "N single-line rows" conversion pattern most
 * `PAGE_SIZE.*` doc comments below describe), tuned as a starting point and
 * retuned once checked against the real device rather than computed from
 * measured layout.
 *
 * Current page is preserved across data reloads (add/save/toggle-done) and
 * only clamped down if it's now past the new last page (e.g. the last item
 * on the last page was deleted) - never auto-advanced just because the
 * underlying list changed shape. Callers don't need to reset page on their
 * own; `usePagedByHeight` re-derives `pageItems` whenever `rows` changes.
 *
 * The one exception is the optional `resetKey` param: passing a value that
 * changes jumps back to page 0 - for the rare case where `rows` isn't the
 * same list mutating in place but a genuinely different list (e.g.
 * screens/ItemDetail.tsx's file browser drilling into a different folder -
 * unlike an add/save, staying on "page 2" there would be paging into a
 * folder the user never scrolled into). Omit it (the default) to keep the
 * preserve-current-page behavior above.
 *
 * `jumpTo` (technical-design-linked-files.md §5/§9.4) is the same idea, one
 * step more specific: instead of always landing on page 0, jump to whatever
 * page contains a particular item - ui/FileBrowserPane.tsx's `locating` mode
 * needs this to land on the page holding the linked file being auto-
 * navigated to, not necessarily page 0 of that folder. Purely additive, same
 * opt-in shape as `resetKey` (a new optional param, existing callers
 * unaffected) - the caller finds the real item index itself (e.g.
 * `array.findIndex(...)`) and passes it straight through; see the `JumpTo`
 * doc comment below. If both `resetKey` and `jumpTo.key` change on the same
 * render, `jumpTo` wins (its effect runs after resetKey's).
 *
 * **Retired 2026-09-16**: the old fixed *row-count* `usePagination`/
 * `Paged<T>`/`ui/PageControls.tsx` trio (this file's original API, before
 * `usePagedByHeight` existed) - screens/ReviewScreen.tsx's Inbox-to-zero
 * step was the last caller (docs/dev/technical-design-pagination-fixed-height.md's
 * Batch 7 tail); once it converted to `PagedSection`/`usePagedByHeight`
 * like every other screen, all three had zero remaining importers anywhere
 * in the app and were deleted outright rather than left as dead code.
 */
import {useEffect, useRef, useState} from 'react';

/** Rows-per-page constants, tuned as a starting point (see the design doc's
 * §2) - retune once checked against the real device rather than computing
 * from measured layout. */
export const PAGE_SIZE = {
  /** Half-width columns: Daily's own Meetings and Tasks/Open-tasks columns
   * (Inbox's Tasks/Meetings used to be side-by-side columns too, but moved
   * to a stacked layout - see inboxTasks/inboxMeetings below). */
  column: 10,
  /** Full-width single-column lists that are the only list on their screen:
   * Projects/Areas tabs, the file browser, Lasso-capture's destination
   * picker. */
  full: 23,
  /** The Files pane's Browse tab specifically (ui/FileBrowserPane.tsx's
   * `sources` root), once drilled into its Projects or Areas category listing
   * - 2026-09-09 feedback that `full`'s row count made that particular list
   * too long. Deliberately its own constant, 3 less than `full`, rather than
   * a tweak to `full` itself - every other full-width list (Project Files,
   * Resources, a Project's own Areas-assignment picker, etc.) keeps `full`
   * unchanged; only Browse's own listing uses this. */
  browse: 20,
  /** Weekly Review's Inbox-to-zero step: two full-width lists (Tasks,
   * Meetings) stacked on one screen, each with its own quick-add form above
   * it. Kept separate from the Project/Area panel's own Todos/Meetings sizes
   * below - the two screens' available space and content density differ, and
   * on-device tuning of one shouldn't silently move the other. */
  stacked: 4,
  /** Project/Area panel's Todos section. Independent of `projectMeetings`
   * (2026-09-07 feedback: Todos is usually the longer list and can afford
   * more rows per page than Meetings). Raised 5->8 (2026-09-14, docs/
   * technical-design-pagination-grayscale-proposal.md §1) - well under the
   * column's estimated vertical slack; re-tune from here once checked
   * against the real device. */
  projectTodos: 8,
  /** Project/Area panel's Meetings section - deliberately smaller than
   * `projectTodos`; see that constant's note. Raised 3->6 (2026-09-14,
   * same proposal §1) - this section is the last element in its column, so
   * there's nothing below it to crowd. */
  projectMeetings: 6,
  /** Inbox tab's Tasks section (technical-design-linked-files.md §1/§10.5,
   * 2026-09-07) - Inbox moved from side-by-side Tasks/Meetings columns
   * (`column` above) to a stacked layout, same shape as the Project/Area
   * panel's Todos-above-Meetings, so this starts at the same values as
   * `projectTodos`/`projectMeetings` pending its own on-device tuning - kept
   * as its own constant rather than reused, same "on-device tuning of one
   * shouldn't silently move another" rule projectTodos/projectMeetings
   * themselves follow. Raised 5->8 (2026-09-14, docs/dev/technical-design-
   * pagination-grayscale-proposal.md §1), same reasoning as projectTodos. */
  inboxTasks: 8,
  /** Inbox tab's Meetings section - see inboxTasks. Raised 3->6 (2026-09-14,
   * same proposal §1), same reasoning as projectMeetings (last element in
   * its column). */
  inboxMeetings: 6,
  /** Google Calendar mini-tab, per screen (2026-09-07 feedback) - the same
   * ui/GoogleCalendarPanel.tsx component is reused across screens whose
   * available space/density differ (same reasoning as projectTodos vs.
   * projectMeetings above), so its page size is now a prop instead of one
   * constant hardcoded inside the component. */
  googleCalendarProject: 9,
  googleCalendarDaily: 20,
  googleCalendarReview: 18,
  /** Inbox's Google mini-tab - lowered from its old value of 20 now that it
   * sits in the bottom (Meetings) half of Inbox's stacked right pane rather
   * than a full-height left pane (same restructure as inboxTasks/
   * inboxMeetings above); starting at the same value googleCalendarProject
   * uses, the closest existing "Google panel inside a partial-height
   * stacked section" case, pending its own on-device tuning. */
  googleCalendarInbox: 9,
  /** Daily view's new Focus/Projects/Areas panel (technical-design-daily-
   * focus-panel.md §4/§7.3, 2026-09-10) - one fixed row budget shared by all
   * three mini-tabs, so the panel's own height never grows or shrinks
   * per-tab: Focus tab's total slot count (`dailyFocusProjectCount +
   * dailyFocusAreaCount`, defaults 3 + 2) is this many rows, and the
   * Projects/Areas tabs page their `FileBrowserPane` at the same size via
   * `FileBrowserRoot.pageSize`. A flat constant rather than computed from
   * those settings at render time - matches every other entry here being a
   * plain tuned integer, at the accepted cost that a changed focus-count
   * setting won't resize the panel to match (the design doc's §7.3 flags
   * this trade-off explicitly). */
  dailyFocusPanel: 5,
  /** Week view's Google mini-tab (docs/dev/technical-design-weekly-view.md §7) -
   * independent of `googleCalendarDaily`/`googleCalendarReview`/etc, same
   * "on-device tuning of one shouldn't silently move another" rule those
   * follow. */
  googleCalendarWeekly: 14,
  /** Week view's WeeklyFocusPanel (docs/dev/technical-design-weekly-view.md §7) -
   * the weekly-focus counterpart of `dailyFocusPanel` above, independent of
   * it since the two panels' configured slot counts
   * (weeklyFocusProjectCount/weeklyFocusAreaCount default to 5/3, vs daily's
   * 3/2) and available column space differ. Also doubles as the Projects/
   * Areas mini-tabs' own browse-list page size within this panel (raised
   * 5 -> 10, 2026-09-13 feedback - 5 felt too short to browse through). */
  weeklyFocusPanel: 10,
} as const;

/** A `jumpTo` value, used by `usePagedByHeight` below - see the module doc
 * comment. `key` is what's watched for changes (only a *change* triggers
 * the jump, same as `resetKey`); `index` is the real item index to land on
 * (not a page number - the hook works out which page that index falls on
 * itself, by walking rows from the start since row heights vary - see that
 * hook's own jumpTo effect). A caller with a real item index in hand (e.g.
 * `array.findIndex(...)`) passes it directly; there's no `pageIndexOf`
 * helper any more; the old one only existed to convert a real index into
 * a fixed-page-size page number, which was already a lossy detour back to
 * "some index in the target page" (see the old ui/FileBrowserPane.tsx's
 * `index * pageSize` for what it was reversed for). */
export interface JumpTo {
  key: string | number;
  index: number;
}

export interface PagedByHeight<T> {
  page: number;
  /** Index (into `rows`) of the first row on the current page - lets a caller keep that row in view across a change that re-flows the pages (ui/MeetingList.tsx's layout switch). */
  startIndex: number;
  pageItems: T[];
  canPrev: boolean;
  canNext: boolean;
  goPrev: () => void;
  goNext: () => void;
}

/**
 * The app's pagination hook (docs/dev/technical-design-pagination-fixed-height.md
 * §1.1) - fits as many rows as their real `rowHeight` allows into a fixed-
 * height box, instead of a fixed row count. Used by ui/PagedSection.tsx.
 * Replaced the old fixed-row-count `usePagination`/`Paged<T>` (retired
 * 2026-09-16, see the module doc comment) everywhere, including the fixed
 * focus-slot lists (ui/DailyFocusPanel.tsx/ui/WeeklyFocusPanel.tsx) that
 * used to be cited as `usePagination`'s one remaining reason to stay -
 * those never actually called it directly (they forward a `PAGE_SIZE`
 * constant into ui/FileBrowserPane.tsx, itself already on this hook).
 *
 * No `totalPages` - deliberately (Tilman: "no need to calculate overall
 * number of pages in advance"). `pageStarts` below is grown lazily, one
 * boundary at a time, only for pages actually visited: a very long list
 * costs no more per page-turn than walking that one page's worth of rows,
 * never the whole list.
 */
export function usePagedByHeight<T>(
  rows: T[],
  rowHeight: (row: T) => number,
  viewportHeight: number,
  resetKey?: string | number,
  jumpTo?: JumpTo | null,
): PagedByHeight<T> {
  const [page, setPage] = useState(0);
  // pageStarts[i] = the row-index page i starts at. Seeded [0]; every later
  // boundary is discovered on the way forward (goNext below) and kept, so
  // paging back-and-forth over the same pages never re-walks rows it's
  // already measured once.
  const pageStartsRef = useRef<number[]>([0]);

  // Same resetKey convention the module doc comment describes - an opt-in
  // "this is genuinely a different list now" signal (e.g. a different
  // folder, a different filter), not fired by an ordinary reload of the
  // same list.
  useEffect(() => {
    if (resetKey !== undefined) {
      pageStartsRef.current = [0];
      setPage(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // `jumpTo` (Batch 3, 2026-09-15, ui/FileBrowserPane.tsx's `locating` mode -
  // see the module doc comment) - runs after the resetKey effect above, same
  // "jumpTo wins if both fire on the same render" ordering the module doc
  // comment describes. Unlike a fixed page size, a target row's
  // page here can only be found by actually walking rows from the start and
  // re-running the exact same greedy fill the main render loop below uses,
  // page by page, until the walk passes `jumpTo.index` - there's no formula
  // shortcut once row heights vary. This also fully repopulates
  // `pageStartsRef` up to and including the landing page, so paging forward/
  // back from there afterward reuses those boundaries instead of re-walking
  // them (same as any other page reached via goNext). Cost is bounded by
  // however many rows precede the target, not by the whole list - the same
  // "cheap for the pages actually visited" property the rest of this hook
  // already has, not a new scan-everything cost.
  useEffect(() => {
    if (!jumpTo) return;
    const boundaries: number[] = [0];
    let landingPage = 0;
    let start = 0;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let used = 0;
      let count = 0;
      for (let i = start; i < rows.length; i++) {
        const h = rowHeight(rows[i]);
        if (count > 0 && used + h > viewportHeight) break;
        used += h;
        count += 1;
      }
      const nextStart = start + count;
      landingPage = boundaries.length - 1;
      if (jumpTo.index < nextStart || nextStart >= rows.length) break;
      boundaries.push(nextStart);
      start = nextStart;
    }
    pageStartsRef.current = boundaries;
    setPage(landingPage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jumpTo?.key]);

  // Clamp down (never up/forward) if the page we were on no longer exists -
  // computed rather than corrected via setState during render (this hook
  // self-heals on the next goPrev/goNext).
  let clampedPage = page;
  while (clampedPage > 0 && (pageStartsRef.current[clampedPage] ?? 0) >= rows.length) {
    clampedPage -= 1;
  }

  // Walks forward from this page's start, summing rowHeight until the next
  // row would exceed viewportHeight. Recomputed every render (cheap -
  // bounded by however many rows fit on one page, not by rows.length) so a
  // live edit to `rows` (a task toggled done, a title shortened) is
  // reflected immediately without extra invalidation logic. Always
  // includes at least one row, even an individually oversize one -
  // PagedSection's own `overflow: hidden` clips it rather than the page
  // rendering nothing.
  const start = pageStartsRef.current[clampedPage] ?? 0;
  const pageItems: T[] = [];
  let usedHeight = 0;
  for (let i = start; i < rows.length; i++) {
    const h = rowHeight(rows[i]);
    if (pageItems.length > 0 && usedHeight + h > viewportHeight) break;
    pageItems.push(rows[i]);
    usedHeight += h;
  }

  const nextStart = start + pageItems.length;
  const canNext = nextStart < rows.length;
  const canPrev = clampedPage > 0;

  const goNext = () => {
    if (!canNext) return;
    // Record this boundary the first time it's crossed; a later revisit
    // (forward again after paging back) reuses it instead of re-walking.
    if (pageStartsRef.current[clampedPage + 1] === undefined) {
      pageStartsRef.current[clampedPage + 1] = nextStart;
    }
    setPage(clampedPage + 1);
  };
  const goPrev = () => {
    if (canPrev) setPage(clampedPage - 1);
  };

  return {page: clampedPage, startIndex: start, pageItems, canPrev, canNext, goPrev, goNext};
}
