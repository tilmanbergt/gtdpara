# Technical design: Weekly Goals (V2 of the Week view)

Status: proposed, 2026-09-13 - awaiting sign-off before implementation.
Builds on: `docs/dev/history/technical-design-weekly-view.md` (V1, implemented), [[feature_weekly_view]] project memory.

## 1. What this adds

A short, free-text "goal for this week" on each weekly-focused Project/Area, set from its card in the Week tab's Focus panel. Requirements locked in from chat (2026-09-13):

1. **One goal per item per ISO week** - not a list, a single short line. Re-setting a week's goal replaces it.
2. **Plain free text, no checkbox** - a statement of intent, not a task. No done/not-done state.
3. **Editable on the same weeks the Focus panel itself is now editable on** (`canEditFocus`, see V1.1): the current week, and next week whenever the real today is Friday/Saturday/Sunday. Any other week is read-only.
4. **Historical view, goal-driven, not focus-driven**: browsing to a week that isn't editable shows *only* the items that actually had a goal set for that specific week - not every currently-focused item, and not an empty placeholder per item. If nothing was ever set for that week, it shows the same kind of "nothing here" hint the Focus panel already uses for non-editable weeks today.

Explicitly out of scope for this pass: editing/backfilling a goal for a genuinely past week (still read-only only), a "copy last week's goal forward" shortcut, goals on Inbox (Inbox can't be weekly-focused at all, so this never applies to it), and anything notification/reminder-shaped.

## 2. Data model

A new `## Weekly Goals` section in `project.txt`/`area.txt` only (never Inbox.txt, never frontmatter - per Tilman's earlier explicit correction during V1 chat). One line per ISO week that ever had a goal set:

```
## Weekly Goals
- 2026-W37: Ship the technical design doc
- 2026-W38: Get the review-script draft to Anna
```

Sparse by nature - most files will have zero or a handful of lines here, not one per week that ever existed. Unlike Tasks/Meetings, this section is *not* part of `ensureSkeleton`'s scaffold (a brand-new project/area still gets `## Tasks`/`## Meetings` from its very first save, but no empty `## Weekly Goals` heading) - `domain/markdown.ts`'s existing `setSpan` already appends a fresh heading the first time it's actually needed, so nothing has to change there.

`domain/types.ts` gains:
```ts
export interface WeeklyGoal {
  /** ISO week key, e.g. "2026-W37" - domain/weekDate.ts's isoWeekKey(). */
  weekKey: string;
  text: string;
}
```

## 3. Parsing/serialization (`domain/markdown.ts`)

Mirrors `parseTasksSpan`/`writeTasksIntoContent` exactly - same `getSpan`/`setSpan` convention every other section here uses:

```ts
const WEEKLY_GOALS_HEADING = '## Weekly Goals';
const WEEKLY_GOAL_LINE_RE = /^-\s*(\d{4}-W\d{2}):\s?(.*)$/;

export interface ParsedWeeklyGoals {
  goals: WeeklyGoal[];
  extraLines: string[]; // unrecognized lines, preserved verbatim - same contract as Tasks/Meetings
}

export function parseWeeklyGoalsSpan(content: string): ParsedWeeklyGoals { ... }

function serializeWeeklyGoalLine(goal: WeeklyGoal): string {
  return `- ${goal.weekKey}: ${goal.text}`;
}

export function writeWeeklyGoalsIntoContent(
  content: string,
  goals: WeeklyGoal[],
  extraLines: string[] = [],
): string { ... } // setSpan(content, WEEKLY_GOALS_HEADING, [...goals.map(serializeWeeklyGoalLine), ...extraLines])
```

Plus one small pure helper, next to these (same file - it's tightly coupled to `WeeklyGoal`'s shape, same reasoning `setDueTag`/`setFlowStateTag` already sit next to the span parsers they support):

```ts
/** Replaces `weekKey`'s entry in `goals` with `text` (added if absent), or removes it entirely if `text` is blank - so clearing the field deletes that week's goal rather than leaving an empty line. */
export function setGoalForWeek(goals: WeeklyGoal[], weekKey: string, text: string): WeeklyGoal[] { ... }
```

## 4. Read/write plumbing

Same three-layer shape Tasks/Meetings already use, one more parallel track through each:

- **`storage/projectFile.ts`**: `ProjectFileState` gains `weeklyGoals: WeeklyGoal[]` + `weeklyGoalsExtraLines: string[]`. `loadProjectFile` calls `parseWeeklyGoalsSpan` alongside the existing three parses. New `saveWeeklyGoals(kind, itemPath, rawContent, goals, extraLines)`, byte-for-byte the same shape as `saveTasks`/`saveMeetings`.
- **`storage/dataCache.ts`**: `CachedItem` gains the same two fields (and the error-fallback branch in `loadOneItem` gets `weeklyGoals: [], weeklyGoalsExtraLines: []`, same as its other empty defaults). New `updateItemWeeklyGoals(path, rawContent, goals, extraLines)` write-through, mirroring `updateItemTasks`/`updateItemMeetings` exactly.

No changes needed to `storage/focusSlots.ts` - goals are independent of the `weeklyFocus` flag itself (an item can in principle have a goal recorded for a week it wasn't even focused during, though the UI only ever writes one while the item is shown as focused).

## 5. Aggregation (`storage/weeklyAggregate.ts`)

`buildWeeklyAggregate` gains one more parameter, `weekKey: string` (the caller - `WeekView.tsx` - already computes this via `domain/weekDate.ts`'s `isoWeekKey`, no new date math needed anywhere).

`WeeklyFocusCardData` gains `goal: string | null` - this displayed week's goal text for that item, looked up from `item.weeklyGoals` by `weekKey`, `null` if none set. This is what the editable-week card renders/edits.

New exported function, for the read-only history view:

```ts
export interface WeeklyGoalHistoryEntry {
  item: WeeklyItemRef; // same shape WeeklyMeetingEntry.item already uses
  goal: string;
}

/** Every item (any kind, any current weeklyFocus state) that has a goal recorded for `weekKey` specifically - not "currently focused", just "had a goal that week". Empty if nothing was ever set for that week. */
export function findWeeklyGoalsForWeek(items: CachedItem[], weekKey: string): WeeklyGoalHistoryEntry[] { ... }
```

`WeeklyAggregate` gains `historicalGoals: WeeklyGoalHistoryEntry[]`, always computed by `buildWeeklyAggregate` (cheap - a filter over already-loaded items) regardless of which week is displayed; the screen decides whether to render it.

## 6. UI

**Editable weeks** (`canEditFocus` true - unchanged trigger from V1.1): `ui/WeeklyFocusPanel.tsx`'s existing `FixedSlotSection` card gains one more stacked row under today's `cardCountRow` (Next/Someday/meetings) - the goal line, tap to edit in place (a lightweight local `TextInput` toggle on the row itself, not routed through `QuickAddWidget` - this is a single free-text field, not a Task/Meeting). Empty state reads as a light "+ Add a goal for this week" prompt, same visual weight as the panel's existing "+ Add project/area" empty-slot rows.

New prop on `WeeklyFocusPanel`: `onSaveGoal: (item: CachedItem, weekKey: string, text: string) => Promise<void>`. `screens/WeekView.tsx` implements `handleSaveWeeklyGoal`, mirroring `handleToggleItemWeeklyFocus`'s exact shape: re-fetch the item fresh from cache, `setGoalForWeek(item.weeklyGoals, weekKey, text)`, `saveWeeklyGoals(...)`, `updateItemWeeklyGoals(...)` write-through, `refreshFromCache()`.

**Non-editable weeks** (`canEditFocus` false - past or far-future): instead of today's plain hint `Text`, a new small component, `ui/WeeklyGoalsHistoryPanel.tsx` - deliberately separate from `WeeklyFocusPanel` rather than a third branch inside it, matching this codebase's "one component, one honest job" pattern (`WeeklyFocusPanel`/`WeeklyMeetingsColumn`/etc. are all single-purpose already). No `MiniTabs`, no arm-and-pick, no counts - just, for each `aggregate.historicalGoals` entry, a read-only row: item name (tap to navigate via the same `onOpenItem` prop every other Week view piece already gets) + its goal text underneath. If `historicalGoals` is empty, falls back to the same hint-text treatment used today, reworded: *"No weekly goals were set for this week."*

`screens/WeekView.tsx`'s existing `canEditFocus ? <WeeklyFocusPanel .../> : <Text ...hint/>` branch becomes `canEditFocus ? <WeeklyFocusPanel ... onSaveGoal={handleSaveWeeklyGoal} /> : <WeeklyGoalsHistoryPanel weekKey={weekKey} historicalGoals={aggregate.historicalGoals} onOpenItem={onOpenItem} textColor={textColor} borderColor={borderColor} />`.

## 7. Files touched (summary)

- `domain/types.ts` (edit) - `WeeklyGoal` interface.
- `domain/markdown.ts` (edit) - `parseWeeklyGoalsSpan`/`writeWeeklyGoalsIntoContent`/`setGoalForWeek`.
- `storage/projectFile.ts` (edit) - `ProjectFileState` fields, `saveWeeklyGoals`.
- `storage/dataCache.ts` (edit) - `CachedItem` fields, `updateItemWeeklyGoals`.
- `storage/weeklyAggregate.ts` (edit) - `weekKey` param, `WeeklyFocusCardData.goal`, `findWeeklyGoalsForWeek`, `WeeklyAggregate.historicalGoals`.
- `ui/WeeklyFocusPanel.tsx` (edit) - goal row on `FixedSlotSection`'s cards, `onSaveGoal` prop.
- `ui/WeeklyGoalsHistoryPanel.tsx` (new) - the read-only historical view.
- `screens/WeekView.tsx` (edit) - `weekKey` computed and threaded through, `handleSaveWeeklyGoal`, the branch swap in §6.

No changes to `domain/weekDate.ts` (already has `isoWeekKey`), `storage/focusSlots.ts`, or anything V1.1 just touched.

## 8. Verification plan (same as V1/V1.1)

`npx tsc --noEmit` against the scratch project tree; the Jest + `react-test-renderer` smoke-render harness built for the App.tsx crash (still set up in the scratch project) re-run to catch anything render-breaking; commit to device + re-stage/md5-verify every file, per [[gtdpara_project]]'s standing rule.
