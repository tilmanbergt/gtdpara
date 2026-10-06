# Technical design: Review hub, per-step review tracking, combined stats

Status: implemented 2026-09-20 (type-checked and unit-tested off-device; on-device check §12 pending). Requirements and the five open points (§13) were confirmed in chat.

Covers `screens/ReviewScreen.tsx` (navigation model, step list, recap), `domain/settings.ts` (what is persisted about reviews), the Review tab badge in `App.tsx`/`ui/TabBar.tsx`, and one new presentational file. The *content* of the individual steps (Week ahead, Inbox to zero, the five master-detail steps, Weekly focus reset) is unchanged.

> **Note:** the parallel "meetings that need review" step (`feature_meeting_tracking`, `domain/meetingTracking.ts`) is now in the code as step `meetingsCloseOut` (registry position 2). §9 records how it was integrated.

## 1. Requirements (decided in chat, 2026-09-20)

1. The Review tab opens on a **hub page** that lists every step directly, so a single step can be done without paging through the others.
2. Each hub row shows the step title, **how many items are waiting** in it, and **when the step was last reviewed**. Steps whose last review is older than about a week get an alarm marker.
3. Inside a step there are two ways forward, and **both go to the next step**: **Reviewed** (really looked at it, time invested) and **Skip** (not really reviewed). Only Reviewed stamps the step's review date. A permanent **Overview** button returns to the hub.
4. There is **no "Finish review" any more.** The "last review" date is the **oldest last-reviewed date of any step**.
5. A step with **nothing in it counts as reviewed automatically** and does not drag the oldest date backwards (Q1 answer).
6. The recap stats are **combined from the last review of each step** (each step keeps its own numbers, the hub shows the sum). Rules, deliberately simple:
   - Tapping **Reviewed** saves what happened in that visit as the step's stats (replacing the old ones), even if that is "nothing".
   - **Skip** with nothing done leaves the old stats and date untouched.
   - Edge case: **Skip after doing things** still counts those actions in the stats, but does not update the date.
7. The stats are shown on the hub **and** on the last page of the review ("last review completed" page).
8. Count texts: Week ahead = number of meetings; Weekly focus reset = "N of M slots filled"; the list steps = the number of items on their left list (e.g. 3 stalled projects stays "3" even after the step was reviewed - the number is a marker for "is it worth going there", not a to-do backlog).

## 2. What changes for the user, and what does not

| Today | After |
|---|---|
| Tab opens on step 0 "Overview" (last-completed line + recap) | Tab opens on the hub (list of steps + last-review line + combined recap) |
| `‹ Back` / `Next ›` in a fixed 9-step sequence | `‹ Back`, `Overview`, `Skip ›`, `Reviewed ›` inside a step; hub rows open any step |
| "Finish review" on the last step writes one timestamp + one summary | Each step records its own review date + stats; nothing is "finished" |
| Badge: last finish > 7 days ago | Badge: any relevant step's last review > 7 days ago |
| Recap from the *previous finished review* | Recap = sum of every step's *last recorded visit* |
| Resume step after tab switch (module var `savedStepIndex`) | Resume the same view (hub / step / end page), see §4.1 |

Unchanged: everything inside a step; frozen snapshots and acted-on checkmarks per step visit; `ReviewMasterDetail`; `QuickAddWidget` reuse; the shared 🔄 refresh.

## 3. Data model

### 3.1 Persisted (in `GtdParaSettings`, `domain/settings.ts`)

`lastReviewCompletedAt` and `lastReviewSummary` are **removed** and replaced by one field:

```ts
reviewSteps: ReviewStepsMap;          // default {}

type ReviewStepsMap = Record<string, ReviewStepRecord>;   // keyed by stable step id

interface ReviewStepRecord {
  /** Last time the user tapped "Reviewed" on this step; null if never. */
  reviewedAt: string | null;          // ISO timestamp
  /** Stats of the last recorded visit of this step (see §3.3). */
  counts: ReviewSummaryCounts;
  /** Last time the hub saw this step empty (§7). Absent when it was non-empty the last time we looked. */
  emptyAt?: string;                   // ISO timestamp
}
```

Why keyed by a **string id**, not the step's index: today every step is addressed by its position in `STEP_TITLES` (`STALLED_STEP = STEP_TITLES.indexOf(...)` etc.). A persisted index would silently point at the wrong step the moment a step is inserted (which is exactly what the parallel meetings step does, §9). Unknown ids found in the map (from another build) are kept and ignored.

`ReviewSummaryCounts` and `ZERO_REVIEW_SUMMARY` **move** out of `settings.ts` into the new `domain/reviewSteps.ts` (avoids a settings ↔ reviewSteps import cycle); `ReviewScreen.tsx`'s one import is updated. The interface itself is unchanged in this design.

### 3.2 Step registry (new `domain/reviewSteps.ts`, pure, zero RN imports)

```ts
type ReviewStepId = 'weekAhead' | 'inbox' | 'stalled' | 'done' | 'onHold'
                  | 'neglected' | 'unfocusedNext' | 'weeklyFocus';

interface ReviewStepDef { id: ReviewStepId; title: string; kind: 'backlog' | 'ritual'; }

const REVIEW_STEPS: ReviewStepDef[]   // order = walk-through order = hub order
```

The registry is the **only** place step order and titles live (renderers stay in `ReviewScreen.tsx` since they are JSX). `kind`:

- **backlog** - has a count that can reach 0, and 0 means "nothing to review": Inbox to zero, Stalled projects, Done awaiting review, On Hold reconsideration, Neglected areas, Unfocused next items.
- **ritual** - always worth a look even when the number is small or zero: Week ahead, Weekly focus reset (an empty week or 0 of 8 slots filled is exactly what those steps exist to fix).

Only *backlog* steps are auto-reviewed when empty (requirement 5). This is a small refinement of the "yes" to Q1 - see open point 2 in §13.

### 3.3 Semantics of a visit (the one rule set)

A *visit* starts when a step is entered and ends when it is left. While it runs, the existing `bump(...)` calls add into a **per-visit tally** (not a whole-session tally). Leaving happens in exactly one of three ways:

| Leave action | Date (`reviewedAt`) | Stats (`counts`) |
|---|---|---|
| **Reviewed** | set to now | replaced by this visit's tally (even if all zero) |
| **Skip**, tally has any non-zero counter | unchanged | replaced by this visit's tally |
| **Skip**, tally all zero | unchanged | unchanged (nothing written) |
| **Overview** / **Back** | unchanged | same as Skip (tally saved only if non-zero) |
| Tab switch away and back | unchanged | tally survives in a module var, visit simply continues; an app relaunch loses an unfinished tally (as today) |

So: `Overview` and `Back` mean "I'm leaving without saying I reviewed it" = Skip semantics. This matches "not too clever": one rule - *the step's stats are the last visit that either was Reviewed or actually did something*.

Known consequence, accepted: reviewing a step a second time with nothing left to do replaces e.g. "3 stalled projects activated" with nothing. The hub headline names the oldest date so the numbers are not read as one week's total.

### 3.4 Derived, never persisted

- **Count per step** (live, from the already-warm aggregate): see §5.2.
- **Row state** per step: `empty | ok | stale | never` (§5.3).
- **Last review date** (hub headline) = oldest `reviewedAt` over *relevant* steps (ritual, or backlog with count > 0). If any relevant step has `reviewedAt === null` the headline says no complete review yet.
- **Combined stats** = field-wise sum of `counts` over all records, `?? 0` per key so counters added later (or the pre-rename `focusAdded` blob) fall out harmlessly.

### 3.5 Migration

Same pattern as `migrateNoteTemplateDefaults` in `storage/settingsStorage.ts`: a pure function `migrateReviewSteps(merged, parsedRaw)` in `domain/reviewSteps.ts`, called from `loadSettings` right after the existing migration, written back once when it changed anything.

- Trigger: `parsedRaw.reviewSteps === undefined` (idempotent; after the first write it exists).
- Fresh install, or legacy `lastReviewCompletedAt === null`: `reviewSteps = {}` (never reviewed; badge on, as today).
- Legacy `lastReviewCompletedAt` present: seed **every step currently in `REVIEW_STEPS`** with `{reviewedAt: legacyTimestamp, counts: ZERO}`. Consequence: existing users do not get an instant alarm on every row; and if the meetings step is already in the registry when this runs it is seeded too (§9).
- The legacy `lastReviewSummary` is **dropped** (it cannot be attributed to steps; it was a non-essential recap). The hub recap is empty until steps are reviewed again.
- Both legacy keys are stripped before write-back (`const {lastReviewCompletedAt, lastReviewSummary, ...rest}`), since `{...DEFAULT_SETTINGS, ...parsed}` would otherwise carry them along untyped.
- `DEFAULT_SETTINGS.reviewSteps = {}` is a shared object: every helper returns new objects and never mutates its input.

## 4. `ReviewScreen.tsx` restructuring

### 4.1 View state replaces the numeric step

```ts
type ReviewView = {kind: 'hub'} | {kind: 'step'; id: ReviewStepId} | {kind: 'end'};
let savedView: ReviewView = {kind: 'hub'};      // replaces savedStepIndex (~line 316)
```

- `useState(step)` / `goToStep(n)` / `STEP_COUNT` / the `*_STEP` index constants (~lines 254-270) become `view` / `enterStep(id)` / registry lookups. Every `step === STALLED_STEP` comparison (the mount-time freeze effect ~673-682, `goToStep`'s refreeze ~684-729, the renderer table ~2307) becomes `view.kind === 'step' && view.id === 'stalled'`.
- `STEP_RENDERERS` becomes `Record<ReviewStepId, () => ReactNode>` so the array order can no longer drift from the registry.
- **Resume behavior**: on remount (tab switch back, or the "return to origin" reopen from a note, `technical-design-return-to-origin.md`) the screen restores `savedView`, exactly like `savedStepIndex` did - someone who opened a task's note from a Stalled-projects card comes back to Stalled projects, not to the hub. The hub is the initial value for a fresh app session and after the end page. (Open point 1 in §13: alternative is "always land on the hub".)
- The snapshot/acted-on/`stepEntryToken` machinery is untouched: `enterStep(id)` does what `goToStep(index)` does today for that step, including `requestEinkRefresh()`.

### 4.2 Navigation row

The existing top row (`styles.stepNavRow`, ~line 2329) is kept in place; only its content changes:

```
‹ Back   Overview      Step 3 of 8 — Stalled projects      Skip ›   Reviewed ›
```

- `‹ Back` = previous step in registry order (from the first step: the hub). Skip semantics (§3.3).
- `Overview` = hub. Skip semantics.
- `Skip ›` / `Reviewed ›` = §3.3, then next step in registry order; from the last step: the **end page** (§5.4).
- Rough width at FONT.medium bold (~10px/char): 60 + 90 + ~300 + 60 + 110 plus gaps is ~700px of the ~1400px width - fits on one row; row height unchanged, so no pixel budget elsewhere moves (the master-detail steps self-measure into `stepScroll` since 2026-09-17; the old `REVIEW_STEP_NAV_ROW_PX` constant only feeds the unused `REVIEW_LIST_VIEWPORT_PX`).
- **Every new tap handler here must call `requestEinkRefresh()`** (the `goToStep` comment, `bugfix_eink_refresh.md` Follow-ups 3/4: a tap-triggered state change is not guaranteed to flush on this device). This applies to the hub row taps, Back, Overview, Skip and Reviewed alike.

### 4.3 Visit tally replaces the session tally

- `savedSessionCounts` (module var) + `sessionCounts` (React state mirror) are replaced by one module var `savedVisit: {id: ReviewStepId; counts: ReviewSummaryCounts} | null`. No React mirror is needed any more: nothing renders the tally live (the old Overview step showed the *previous* review's saved summary, never the running tally).
- `bump(key)` adds into `savedVisit.counts` when a visit is active and is a no-op on the hub. All roughly a dozen existing `bump(...)` call sites stay as they are - attribution to a step is automatic because each action can only happen inside its step. A `bump` that lands after the user already navigated away (an awaited save finishing late) is attributed to whatever visit is active or dropped; accepted, this is the "keep the recap coarse" rule.
- `enterStep(id)` starts a fresh visit (`counts = ZERO`). A resumed step after a tab switch keeps its tally (module var).

### 4.4 `leaveStep(outcome, destination)` replaces `handleFinish`

```ts
leaveStep('reviewed' | 'skip', destination: ReviewView): void
```

1. Finalize the tally. For `stalled` / `neglected` only, compute `projectsActivated` / `areasActivated` *now* from that step's frozen snapshot (`stalledSnapshot` / `neglectedSnapshot` entries whose live cache item has an `isActionableOpenTask`) - the exact logic that lived in `handleFinish` (~1553-1587), just moved from "at Finish" to "at leaving the step". The snapshots still exist at that moment (they are only replaced on the next entry).
2. `next = applyStepVisit(settings.reviewSteps, id, outcome === 'reviewed', counts, new Date())` (pure, §3.3; returns the **same reference** when nothing changes).
3. Navigate to `destination` immediately (optimistic, no spinner - the old `finishing` flag is not needed) and `requestEinkRefresh()`.
4. If `next !== settings.reviewSteps`: persist through a new `updateReviewSteps(mutator)` in `storage/settingsStorage.ts` (load → apply → save, **serialized** through a module-level promise chain so two quick taps cannot clobber each other), then `setSettings` + the `onReviewRecorded` callback (the renamed `onFinished` prop; App re-loads settings so the badge updates). On failure: `logError` and a one-line banner on the hub ("Couldn't save review progress: ..."), reusing the old `finishError` styling.

### 4.5 Removed from `ReviewScreen.tsx`

`renderOverview`, `handleFinish`, `finishing`/`finishError`/`justFinished`, the Finish button/`finishedText` block at the bottom of `renderFocusReset` (~2295-2303) plus `styles.finishButton*`/`finishedText`, `sessionCounts`/`savedSessionCounts`. **Kept**: `formatCompletedAt` and `summaryLines` (both reused by the hub and the end page). The module doc comment (which still describes 9 steps, the Overview page and Finish) must be rewritten as part of the change.

## 5. Screens

New file **`ui/ReviewHub.tsx`** (presentational, props in / callbacks out, no data loading) with three exports, so `ReviewScreen.tsx` (already ~150KB) does not grow further:

- `ReviewHub` - headline, stats block, step list.
- `ReviewStatsBlock` - the recap bullets; shared by the hub and the end page.
- `ReviewEnd` - the end page.

### 5.1 Hub layout

```
Last review: 3 days ago            (oldest step; "No complete review yet." when a relevant step was never reviewed)
From your last reviews             (heading only when the sum is non-zero)
 • 4 tasks added  • 2 inbox items cleared  • 3 stalled projects activated ...

 Week ahead              5 meetings          2 days ago
 Inbox to zero           7 items           ● 9 days ago
 Stalled projects        3 projects          4 days ago
 Done awaiting review    nothing to review   -
 On Hold reconsideration 2 items             6 days ago
 Neglected areas         nothing to review   -
 Unfocused next items    12 tasks          ● never
 Weekly focus reset      5 of 8 slots filled 2 days ago
```

- One row = one full-width tap target (whole row opens the step), three columns (title / count / last reviewed) on a single line. Rough height 52-56px per row (padding included, comfortably above the minimum e-ink tap size); 8-10 rows ≈ 450-560px, plus headline and up to ~10 recap lines (~300px): well inside the ~1770px content height, so **no pagination** is needed up to roughly 14 steps. If the registry ever outgrows that, the list can move into a `PagedSection` (already available); noted, not built. The exact pixel figures are estimates to be checked against `design-device-rendering.md` §6 during implementation.
- Grayscale only (theme rule): the alarm marker is the existing tab-badge glyph `●` plus bold date text, not colour.
- The whole hub renders from the already-loaded `aggregate`, `inbox` and `settings` state; it adds no I/O of its own.

### 5.2 Count per step (derived live)

Computed by a new pure `buildReviewStepCounts(aggregate, inboxOpenCount, items, settings)` in `storage/reviewAggregate.ts` (same "pure transform over the warm cache" rule as `buildReviewAggregate`; `inboxOpenCount` is passed in because Inbox.txt lives outside the cache - `ReviewScreen` already derives `inboxOpenTasks`/`inboxOpenMeetings`, ~1611-1616).

| Step | Count | Text |
|---|---|---|
| Week ahead (ritual) | `aggregate.weekMeetings.length` | "N meetings" |
| Inbox to zero | open Inbox tasks + open Inbox meetings | "N items" |
| Stalled projects | `aggregate.stalledProjects.length` | "N projects" |
| Done awaiting review | `aggregate.doneProjects.length` | "N projects" |
| On Hold reconsideration | `aggregate.onHoldItems.length` | "N items" |
| Neglected areas | `aggregate.neglectedAreas.length` | "N areas" |
| Unfocused next items | sum of `nextTasks.length` over `aggregate.unfocusedNextItems` (the left list's selectable rows are tasks, not projects) | "N tasks" |
| Weekly focus reset (ritual) | `items.filter(weeklyFocus).length` of `weeklyFocusProjectCount + weeklyFocusAreaCount` | "N of M slots filled" |

Counts are **live, not the frozen snapshot**: the hub shows current reality after actions taken in a step (a stalled project you just gave a task drops out of the count), independent of the step's own "acted-on rows stay visible" snapshot rule. Week ahead counts gtdpara meetings only, not Google Calendar events (the ICS panel is a separate async cache); it is a ritual step so it is never auto-treated as empty anyway.

### 5.3 Row state and the alarm marker

Pure `stepRowState(def, record, count, now)` in `domain/reviewSteps.ts`:

- backlog step with `count === 0` -> **empty**: text "nothing to review", no date, no marker; excluded from the headline's oldest-date computation.
- otherwise, `reviewedAt === null` -> **never**: "never" with `●`.
- otherwise, `now - reviewedAt > REVIEW_STALE_MS` (7 x 24h, the existing `REVIEW_OVERDUE_MS` value, one constant for the badge *and* the row marker) -> **stale**: date text with `●`.
- otherwise **ok**: date text via the existing `formatCompletedAt` ("today", "yesterday", "N days ago", short date).

About "older than 8 days": with a 7 x 24h rule a row first alarms when its label would read "8 days ago", which matches the wish for a marker after a week. If exactly 8 x 24h is wanted it is a one-constant change.

### 5.4 End page ("last review completed")

Shown after `Skip`/`Reviewed` on the last step (`view.kind === 'end'`): a short line ("That was the last step."), the same headline as the hub (oldest date), the same `ReviewStatsBlock`, and one `Overview` button. It does **not** depend on every step having been reviewed - skipping through to the end simply shows the end page with whatever the stats currently are. Leaving it sets `savedView` back to the hub.

## 6. Tab badge (`domain/settings.ts` -> `domain/reviewSteps.ts`, `App.tsx`)

`isReviewOverdue(lastReviewCompletedAt)` is replaced by `isReviewOverdue(steps: ReviewStepsMap, now)`: true when **any** registry step's effective last-done date is missing or older than `REVIEW_STALE_MS`, where effective date = `max(reviewedAt, emptyAt)` (§7). `App.tsx` line ~488 becomes `isReviewOverdue(settings?.reviewSteps ?? {})`; `ui/TabBar.tsx` still just receives a boolean (comment update only). `App.tsx`'s `refreshSettings` (~452) is unchanged and simply wired to the renamed `onReviewRecorded` prop (~558).

## 7. Auto-reviewed empty steps: why a persisted `emptyAt`

The badge lives in `App.tsx`, which does **not** have the review aggregate: `reorient()` starts `rebuildCache` fire-and-forget and never waits for it, and Inbox.txt is loaded separately. Computing counts there would mean new plumbing and a badge that flickers while the cache warms. Instead:

- Whenever the hub is shown, and after each `load()`, `ReviewScreen` calls the pure `applyEmptyStamps(steps, emptyBacklogIds, now)`: a backlog step that is empty gets `emptyAt = now` (refreshed at most once per calendar day, so no write on every render), a step that is non-empty again gets `emptyAt` deleted. It returns the same reference when nothing changed and is persisted via `updateReviewSteps` only when it did change.
- `emptyAt` is separate from `reviewedAt` on purpose: the user's rule says a Skip keeps the old date and stats, and auto-empty must not overwrite real review history either.
- Consequence, accepted: if Review is not opened for over a week, empty steps also age past the threshold and the badge appears; opening Review re-stamps them and the badge clears for those, leaving only real work flagged. The badge's job is to make the user open Review, and it does.

Simpler alternative if this feels heavy: have `ReviewScreen` push a count-aware boolean up to `App` (badge is then only accurate after the Review tab was opened once per app session). Not chosen because it makes the badge wrong exactly when it matters, right after launch.

## 8. Files touched

| File | Change |
|---|---|
| `domain/reviewSteps.ts` | **new**: registry, `ReviewStepRecord`/`ReviewStepsMap`, `ReviewSummaryCounts` + `ZERO_REVIEW_SUMMARY` (moved), `REVIEW_STALE_MS`, `stepRowState`, `oldestRelevantReview`, `sumReviewSummaries`, `applyStepVisit`, `applyEmptyStamps`, `isReviewOverdue`, `migrateReviewSteps` |
| `domain/settings.ts` | remove `lastReviewCompletedAt`, `lastReviewSummary`, `isReviewOverdue`, `REVIEW_OVERDUE_MS`, the summary types; add `reviewSteps` + default |
| `storage/settingsStorage.ts` | call `migrateReviewSteps` in `loadSettings`; add serialized `updateReviewSteps(mutator)` |
| `storage/reviewAggregate.ts` | add `buildReviewStepCounts` (aggregate itself unchanged) |
| `ui/ReviewHub.tsx` | **new**: `ReviewHub`, `ReviewStatsBlock`, `ReviewEnd` |
| `screens/ReviewScreen.tsx` | view state, registry-driven nav row, `leaveStep`, visit tally, removals (§4.5), doc comment rewrite |
| `App.tsx` | badge call (~488), `onFinished` -> `onReviewRecorded` (~558), comments (~71-75, ~449-451) |
| `ui/TabBar.tsx` | comment only |
| `docs/dev/design-overview.md` | as-built update after implementation (Review section step list/flow) |

## 9. The meetings close-out step (as built)

The parallel meetings work landed while this was being implemented, so the hub includes it as a normal registry entry:

- **Registry**: `{id: 'meetingsCloseOut', title: 'Meetings to close out', kind: 'backlog'}` in position 2 (after Week ahead, before Inbox to zero). Nothing else in the step plumbing is meeting-specific; it is an id-based branch like the other master-detail steps (frozen `closeOutSnapshot`, `closeOutActedOn`, refrozen in `enterStep`).
- **Count**: `aggregate.meetingsToClose.length` in `buildReviewStepCounts`, shown as "N meetings". Being a backlog step, the auto-empty rule (§7) applies: nothing outstanding means "nothing to review" and it never holds back the headline date or the badge. Its own lookback window already lets old items drop off.
- **Stats (beyond the original design)**: a new counter `meetingsClosedOut` in `ReviewSummaryCounts`/`ZERO_REVIEW_SUMMARY` and a "N meetings closed out" line in `summaryLines`. `handleToggleCloseOutReviewed` bumps it by +1/-1 (undo), clamped at 0 within the visit. `sumReviewSummaries` is key-driven and needed no change.
- **Migration**: the step is in the registry when `migrateReviewSteps` first runs, so it is seeded with the legacy date like every other step.
- **"Step N of 9"** and the module doc comment derive from the registry.

## 10. E-ink and rendering notes

- Every tap that changes what is shown calls `requestEinkRefresh()` (§4.2).
- The hub is static text plus tap rows - no timers, no measurement hooks, no `PagedSection`; it should paint in one pass.
- A late-finishing async `updateReviewSteps` must not trigger a full re-render churn on the hub: `setSettings` is called once per completed write.

## 11. Suggested implementation order

1. `domain/reviewSteps.ts` (pure) + scripted tests (§12). Move `ReviewSummaryCounts`.
2. `domain/settings.ts` + `settingsStorage.ts` (field swap, migration, `updateReviewSteps`) + `App.tsx` badge/prop rename. App builds and the badge works before any screen change.
3. `buildReviewStepCounts`.
4. `ui/ReviewHub.tsx` against fixture props.
5. `ReviewScreen.tsx`: view state -> registry-driven nav -> visit tally + `leaveStep` -> hub/end wiring -> removals -> doc comment.
6. Real `tsc --noEmit` + eslint in the scratch project; on-device check (§12). Then `design-overview.md`.

## 12. Verification plan

Scripted tests (pure functions, same style as the `returnContext` checks):

- `migrateReviewSteps`: fresh install; legacy `null`; legacy timestamp (all registry steps seeded, legacy keys stripped); second run is a no-op (same reference).
- `applyStepVisit`: Reviewed with zero tally (date set, counts replaced by zeros); Skip with non-zero tally (counts replaced, date unchanged, record created with `reviewedAt: null` if absent); Skip with zero tally (same reference returned).
- `applyEmptyStamps`: stamps an empty backlog step; same-day re-stamp is a no-op; clears when non-empty; never touches ritual steps.
- `stepRowState`: empty backlog, never, ok, stale exactly at and around the 7 x 24h boundary, malformed timestamp -> never/stale like today's `isReviewOverdue`.
- `oldestRelevantReview` (ignores empty backlog steps, `null` when a relevant step was never reviewed), `sumReviewSummaries` (missing keys = 0), `isReviewOverdue` (`max(reviewedAt, emptyAt)`).

On-device checklist: (a) fresh entry lands on the hub; counts match what the steps show; (b) open Stalled from the hub, add a task to a stalled project, Reviewed -> next step opens, hub row shows "today", stats show the activation; (c) same but Skip -> date unchanged, stats updated; (d) Skip with no action -> nothing changes; (e) Overview/Back mid-step behave like Skip; (f) last step -> end page with stats; (g) open a note from a card, return -> resumes the same step; (h) a step with 0 items shows "nothing to review" and does not hold the badge; (i) upgrade from a build with a saved `lastReviewCompletedAt`: rows show that date, no instant alarm, no recap until reviewed; (j) 🔄 refresh on a step does not kick you to the hub; (k) rapid double-tap on Reviewed writes once and does not skip two steps (`leaveStep` ignores a tap whose visit was already closed); (l) close out a meeting in the meetings step, Reviewed -> hub shows "1 meeting closed out" in the recap.

## 13. Open points / judgment calls to confirm

1. **Landing view**: resume where you were (default here, keeps today's behavior and the return-to-origin reopen working) vs. always land on the hub. One-line change either way.
2. **Ritual steps are never auto-empty** (Week ahead, Weekly focus reset): they stay "due" weekly regardless of count. A slight narrowing of the "empty step counts as reviewed" answer; the alternative is treating 0 meetings / 0 slots as empty too.
3. **`‹ Back` is kept** next to `Overview` (previous step, or the hub from the first step). It was not asked for or against; drop it if the hub makes it redundant.
4. **Old recap is dropped** on migration (cannot be attributed to steps).
5. **Skip-after-action replaces the step's stats** with the visit tally (one rule for Reviewed and Skip-with-actions) rather than adding to them.
