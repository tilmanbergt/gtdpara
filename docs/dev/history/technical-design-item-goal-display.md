# Technical design: weekly goal on the Project/Area detail page

2026-09-13. Follows `docs/dev/history/technical-design-weekly-goals.md` (V2, weekly
goals on the Week tab, implemented same day). This is a new consumer of
that same data - no data-model change.

## Requirement (chat, verbatim)

> update the project and area pages (current). show the curren goal below
> the focus settings below showing it beeing weekly focus. If there has
> been a last focus goal show that even if it is not currenty in focus.
> currently no history of goals shown here.

Clarified via follow-up questions:
1. Placement: the existing Daily focus / Weekly focus checkbox row is
   unchanged; one new line goes below it, inside the same Focus section.
2. Editable here too (not read-only) - same tap-to-edit affordance the
   Week tab's `GoalRow` already has.
3. When showing an older goal (not the current week's), label which week
   it's from: "Last goal (Week NN): ...".
4. No history list here - at most one goal line, ever, on this page.

## Where

`ui/ItemStatusPanel.tsx`'s `FocusSection` - the same component that
already renders the Daily focus / Weekly focus checkboxes on the Current
tab's left pane (Status → Focus → Archive/Assign-to-Area). New content
goes directly below the existing `focusRow`/disabled-hint/actionError
block, still inside Focus's own `styles.section`.

## Which goal is shown

One rule covers both bullets of the requirement: show the goal entry with
the **latest ISO week key** among everything in this item's
`weeklyGoals[]` (weekKey strings sort correctly as plain strings -
`"2025-W52" < "2026-W01"` - so `Math.max` by string comparison is exact,
same fact `findWeeklyGoalsForWeek` already relies on implicitly).

- If that entry's `weekKey` equals today's real ISO week
  (`isoWeekKey(new Date())`), it's shown plain - this *is* the current
  goal.
- Otherwise it's shown as `Last goal (Week NN): <text>` - this is the
  fallback case, and per the requirement it's shown **regardless of
  whether the item is currently weekly-focused** (no `weeklyFocus`
  check gates this at all, matching `findWeeklyGoalsForWeek`'s own
  goal-driven-not-focus-driven rule from the Week tab design).
- If `weeklyGoals[]` is empty, the line reads "+ Add a goal for this
  week" (identical empty-state wording to the Week tab's `GoalRow`).

This deliberately picks up a goal pre-set for *next* week (the Week
tab's Fri-Sun early-edit allowance) too, on the rare days that applies -
it would show as "Last goal (Week NN): ..." even though that week hasn't
started yet. Flagging this now since it's a minor label-accuracy
edge case, not because it needs different handling - "last recorded
goal" reads fine either way and a special case for it isn't worth the
code.

## Editing

Tapping the line always edits **this week's** goal
(`isoWeekKey(new Date())`) - never the week the displayed text actually
belongs to. The draft pre-fills with whatever text was showing
(current-week text if that's what was shown, or the last goal's text as
a carry-forward starting point otherwise) - saving always writes to the
current week via `setGoalForWeek`, so carrying an old goal's wording
forward and tweaking it is one edit, but it never silently rewrites the
*other* week's own stored entry. Same Save/Cancel/ClipboardTextInput
shape as the Week tab's `GoalRow` - this page gets its own small
`ItemGoalRow` component (not a shared import) since `GoalRow` today is
declared un-exported inside `ui/WeeklyFocusPanel.tsx` and is written
against that panel's `CachedItem`+`onSaveGoal` prop shape, which doesn't
fit ItemStatusPanel's own already-loaded `StatusPanelState` local state
- duplicating the ~40-line component avoids a cross-cutting refactor for
one new call site.

## Data flow

`ItemStatusPanel`'s own independent `ensureItemCached` load
(`StatusPanelState`) gains two fields, mirroring every other
already-loaded span on this same item:

```ts
interface StatusPanelState {
  ...
  weeklyGoals: WeeklyGoal[];
  weeklyGoalsExtraLines: string[];
}
```

Saving mirrors `screens/WeekView.tsx`'s `handleSaveWeeklyGoal` exactly,
just scoped to this panel's own already-loaded `state` (no separate
cache re-fetch needed - this component already owns fresh state the way
`toggleFocus`/`changeStatus` do):

```ts
const nextGoals = setGoalForWeek(state.weeklyGoals, isoWeekKey(new Date()), text);
const nextRaw = await saveWeeklyGoals(kind, path, state.rawContent, nextGoals, state.weeklyGoalsExtraLines);
updateItemWeeklyGoals(path, nextRaw, nextGoals, state.weeklyGoalsExtraLines);
setState(prev => prev ? {...prev, rawContent: nextRaw, weeklyGoals: nextGoals} : prev);
```

No new storage/domain code at all - `setGoalForWeek`, `saveWeeklyGoals`,
`updateItemWeeklyGoals`, `isoWeekKey` all already exist from V2/V1.

## Files touched

- `ui/ItemStatusPanel.tsx` - `StatusPanelState` gains the two fields,
  `load`/`changeStatus`/`toggleFocus` pass them through (same pattern
  every other field there already follows), new `handleSaveGoal`
  handler, `FocusSection` renders the new `ItemGoalRow` below its
  existing checkbox row, new `ItemGoalRow` sub-component + styles.

No other file changes - this page doesn't touch `storage/weeklyAggregate.ts`
(no cross-item aggregation needed, just this one item's own `weeklyGoals`).

## Out of scope (per requirement's own "currently no history shown here")

No list of past goals on this page - that stays exclusive to the Week
tab's `WeeklyGoalsHistoryPanel`. This page only ever shows zero or one
goal line.
