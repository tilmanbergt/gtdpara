# Technical design: Waiting for, visible (0.7.0)

Status: **approved** - 2026-10-04 (boundary for W1 changed to today in the same review).
Branch: `feature/waiting-0.7`, created from `main` after the 0.6.0 release.
Scope agreed in chat on 2026-10-04 (backlog "Planned: 0.7.0").

The theme: a Waiting For todo is a commitment someone else owes you. Today it disappears from
Daily entirely and, where it shows, hides behind a small ⏸ icon whose text only appears on tap -
and sometimes not even then (the overflow bug). 0.7.0 makes it visible on Daily and replaces the
icon badges on all todo rows with plain text labels. Plus a small pass on the Projects/Areas tabs.

## 1. Requirements as decided

| # | Item | Decision (Tilman, 2026-10-04) |
|---|---|---|
| W1 | Waiting For on Daily | Every open `#waiting-for` todo from **any** Project/Area and the Inbox shows on Daily - not only from focused items. Hidden while its due date is **in the future** (tomorrow included): no date, or date <= **today**, shows. The date works as the follow-up date. Someday/Maybe stay excluded. |
| W2 | Placement | Inside its Project/Area group, **sorted after** the other todos of that group. |
| W3 | Text labels instead of icon badges | On **all** todo rows (Daily, Inbox, Current, Review). Fixed text, no tap-to-reveal. **Inline after the title.** Tag-like wording: `#next`, `#now`, `#w/f Meier`, `#someday`, `#due 5.10.`. |
| W4 | Long title | Title is shortened with "…" so the labels always show in full. |
| W5 | `#now` toggle | Stays a double-tap, now on the `#next`/`#now` label. |
| W6 | Waiting For without a name | Shows plain `#w/f` (today: no badge at all). |
| W7 | Grouped lists | A label is left out when the section heading already shows it (as today): no `#next` under "Next", no `#w/f` alone under "Waiting For". |
| W8 | Date format | `5.10.` (day.month., no leading zeros). A uniform date format across the app is a separate backlog item. |
| W9 | Focus mode / Tomorrow tab | Waiting For todos do **not** appear in focus mode. The Tomorrow tab shows meetings only - unchanged. |
| P1 | Projects/Areas tabs: abbreviation | Each Project/Area entry shows its abbreviation right after the name: `Acme Tender #ATR ›`. |
| P2 | Projects/Areas tabs: row spacing | Rows get ~10% more height (wrong taps reported). |
| B1 | Bug: w/f text doesn't fit | Fixed by W3/W4 (root cause §2). |

Out of scope: a uniform date format app-wide (backlog), meeting rows, Review's item lists (they
share the Projects/Areas row helper but keep their current look), new tags.

## 2. Current state (code check, 2026-10-04)

- **Daily filter** (`storage/dailyAggregate.ts` `buildDailyAggregateImpl`): both the item loop
  and the Inbox loop return early for `waiting-for`/`someday`/`maybe` before the "due soon / focused
  Next" rule. With an active context tag, Waiting For is already let through.
- **Grouping** (`groupDailyTasksByItemImpl`): groups by item path, Inbox first, focused items next;
  task order inside a group is the aggregate's order (file order). No sort.
- **Focus mode** uses its own builders (`buildNowEntries`: `#now` todos; `buildFocusCandidateEntries`:
  Next todos of focused items) - not affected by the Daily filter, so W9 needs no change.
- **Badges** (`ui/TaskBadges.tsx`): `badgeInfos()` builds glyph + label pairs (▷/▶ Next/Now,
  ○ Someday under an active context, ⏸ "Waiting on: X" only when a name is set, 📅/⚠ due). Each
  badge is its own `Pressable` + bordered `Text`; tap shows the label for 2 s, double-tap on
  Next/Now flips `#now`. `isFlowStateConveyed()`/`displayTaskText()` strip tags from the title
  that a badge or heading already shows.
- **Row layout** (`ui/TaskRow.tsx`): title `Text` (`numberOfLines` 2) and `TaskBadges` are
  siblings in a `flexDirection: row, flexWrap: wrap` line. The row has a fixed `height` from
  `taskRowHeight()` and `overflow: hidden`.
- **Root cause of B1**: `taskRowLines()` estimates only the title, with a fixed 70 px
  `BADGE_ALLOWANCE_PX` for the badges. When the title fills its width, the badge row wraps to a
  new flex line below the title, which lies outside the fixed row height and is clipped (or, in
  older paths without `height`, drawn under the next row). Tap-to-reveal makes it worse: "Waiting
  on: Meier Sohn" is much wider than ⏸, so revealing it can push it onto a clipped line. The
  estimate and the layout disagree by construction.
- **Callers of `taskRowHeight`**: Daily (`'flat'`), Review Inbox-to-zero (`'flat'`), Current's
  Todos (`ProjectDataPanel`, `'grouped'`), Inbox tab (`'grouped'`). `ReadOnlyTaskRow` (Review
  Done/On Hold detail) uses the same badges without a computed height.
- **Projects/Areas tabs** (`screens/ItemsList.tsx`): rows render `★ Name ›`; sizing comes from
  `ui/itemEntryRow.ts` (`ITEM_ENTRY_CHROME_PX = 12`, line 22 → 34 px per 1-line row), which Review's
  master-detail lists share. `CachedItem.abbrev` holds the abbreviation without `#`.

## 3. Design

### 3.1 Daily filter and order (W1, W2, W9)

`storage/dailyAggregate.ts`:

- New pure helper in `domain/flowState.ts`:
  `isWaitingForShownOnDaily(task, todayDate): boolean` → `task.flowState === 'waiting-for' &&
  (task.dueDate === null || task.dueDate <= todayDate)`.
- Both loops: Someday/Maybe keep the early return; Waiting For is included when
  `isWaitingForShownOnDaily(...)`, otherwise skipped. Not tied to focus.
- `groupDailyTasksByItemImpl`: after building each group, stable-sort its entries so Waiting For
  comes last (`Number(a.task.flowState === 'waiting-for') - Number(b...)`). `taskIndex` stays the
  index into the file, so all row actions keep working.
- Focus mode builders unchanged (W9). Calendar tabs unchanged.

### 3.2 Labels (W3, W6-W8) - `domain/taskLabels.ts` (new, pure)

```ts
export type TaskLabelKind = 'next' | 'now' | 'waiting' | 'someday' | 'due' | 'overdue';
export interface TaskLabel { kind: TaskLabelKind; text: string }
export function taskLabels(task, context: 'flat' | 'grouped', today: string, contextActive: boolean): TaskLabel[]
export function shortDate(iso: string, today: string): string   // '2026-10-05' -> '5.10.'; other year -> '5.1.2027'
```

Rules (same conditions as today's `badgeInfos`, new texts):

| Case | flat | grouped |
|---|---|---|
| Next | `#next` (`#now` if `task.now`) | - (heading) |
| Waiting For with name | `#w/f Meier Sohn` | `#w/f Meier Sohn` (the name is not in the heading) |
| Waiting For without name | `#w/f` | - (heading) |
| Someday (only reaches flat under a context filter) | `#someday` | - (heading) |
| Due, not overdue | `#due 5.10.` | `#due 5.10.` |
| Overdue | `#due 28.9. !` | `#due 28.9. !` |

Order: flow state, then due. The waiting name is capped at 20 characters ("…"). `isFlowStateConveyed`
and `displayTaskText` move here too and keep their meaning (a tag is stripped from the title
exactly when a label or heading shows it), extended for W6 (`#waiting-for` without name is now
conveyed in flat context). `ui/TaskBadges.tsx`'s `taskBadgeLabels` is replaced by `taskLabels`.

### 3.3 Row rendering (W3-W5, B1) - `ui/TaskRow.tsx`, `ui/TaskLabels.tsx`

- The title and the labels become **one `Text`**: title runs (incl. the existing tappable context
  tags), then for each label two spaces and a nested `Text` span. One text flow means one wrap
  and one clamp - the flex-wrap sibling line that got clipped is gone.
- Label span style: `FONT.small`, `fontWeight: '600'`, `opacity: 0.75` - set apart by size and
  weight, not by color (grayscale rule). Nested spans can't have borders, so the pill border goes.
- `ui/TaskBadges.tsx` is replaced by `ui/TaskLabels.tsx`, which renders the spans and owns the
  double-tap: only the `#next`/`#now` span gets an `onPress` (when `onToggleNow` is passed);
  two taps within 350 ms flip `#now`, a single tap does nothing (as before, minus the reveal).
  Other spans have no `onPress`, so a tap on them falls through to the row's `onStartEdit`.
- **Fitting (W4)**: new `fitTitleToLines(title, labelsText, widthPx, maxLines)` in
  `ui/TaskRow.tsx`: if `estimateLines(title + labels)` <= `maxLines`, the title is unchanged;
  otherwise the title is cut at the longest word boundary that fits and gets "…" (binary search
  over cut positions with `activeLineEstimator`). The estimator measures labels at `FONT.medium`
  width (labels are smaller in reality - errs on the safe side).
- **Height**: `taskRowLines()` estimates the fitted `title + labels` string over the full text
  width (`column - checkbox - trailing icons`). `BADGE_ALLOWANCE_PX` is removed. MAX_LINES stays 2,
  so row heights stay 42/64 px and page sizes barely change. The rendered `Text` keeps
  `numberOfLines` = the estimate as a last safety net.
- `ReadOnlyTaskRow` uses the same rendering (no `onToggleNow`).

### 3.4 Projects/Areas tabs (P1, P2) - `ui/itemEntryRow.ts`, `screens/ItemsList.tsx`

- `itemEntryDisplayText(item, {showAbbrev})`: `★ Acme Tender #ATR ›` when `showAbbrev` and
  `item.abbrev` is set; nothing added when there is no abbreviation.
- `itemEntryLines/itemEntryHeight(item, width, opts?)` take
  `{showAbbrev?: boolean; paddingPx?: number}`; defaults (`false`, 6) keep Review's lists exactly
  as they are.
- `ItemsList.tsx` passes `{showAbbrev: true, paddingPx: 8}`: row height 16 + 22 = 38 px instead of
  34 (+12%), and `styles.entryRow.paddingVertical` 8 to match. The abbreviation renders as a nested
  span in `FONT.small`, normal weight (the name stays `500`), so it reads as a tag, not as part of
  the name.
- The viewport budget is unchanged (`FULL_VIEWPORT_PX`); `PagedSection` simply fits ~10% fewer rows
  per page.

## 4. Files

| File | Change |
|---|---|
| `src/domain/flowState.ts` | `isWaitingForShownOnDaily` |
| `src/domain/taskLabels.ts` (new) | `taskLabels`, `shortDate`, `isFlowStateConveyed`, `displayTaskText` (moved) |
| `src/storage/dailyAggregate.ts` | W1 in both loops, W2 sort in grouping, doc comments |
| `src/ui/TaskLabels.tsx` (new) | label spans + `#now` double-tap |
| `src/ui/TaskBadges.tsx` | removed |
| `src/ui/TaskRow.tsx` | one-Text layout, `fitTitleToLines`, new `taskRowLines`, `ReadOnlyTaskRow` |
| `src/screens/DailyView.tsx` | import of `displayTaskText` from `domain/taskLabels`; comments |
| `src/ui/itemEntryRow.ts`, `src/screens/ItemsList.tsx` | P1, P2 |
| `__tests__/domain/taskLabels.test.ts` (new) | labels per case, `shortDate`, conveyed/stripping |
| `__tests__/storage/dailyAggregate*.test.ts` | W1 boundaries (no date, today, tomorrow, after tomorrow, other item not focused, Inbox), W2 order, Someday/Maybe still out, context filter unchanged |
| `__tests__/ui/fitTitle.test.ts` (new) | `fitTitleToLines`: fits unchanged, cut at word boundary, very long single word, labels alone |
| `docs/user/daily.md`, `docs/user/tags.md` | what appears on Daily; labels instead of badges; `#now` double-tap on the `#next` label |
| `docs/user/projects-and-areas.md` | abbreviation shown in the list |
| `CHANGELOG.md` `[Unreleased]` | Changed: Waiting For on Daily, text labels; Fixed: w/f text cut off |
| `docs/dev/design-overview.md` | tags/Daily sections in present tense |

No settings, no file-format change, no new permission, nothing new for the debug bundle.

## 5. Steps

- **S1** `domain/taskLabels.ts` + tests (pure, no UI change yet).
- **S2** Daily filter + order (§3.1) + tests.
- **S3** `TaskLabels.tsx` + `TaskRow.tsx` one-Text layout, fitting, new height estimate; remove
  `TaskBadges.tsx` + tests for `fitTitleToLines`.
- **S4** Projects/Areas tabs (§3.4).
- **S5** Help pages, CHANGELOG, design-overview.

Each step: `npx tsc --noEmit`, `npm test`; S3/S4 also a smoke render of Daily and ItemsList.

## 6. Test plan (device, demo space)

- [ ] Waiting For todo without date in an **unfocused** project → on Daily, last in its group,
      label `#w/f Name`.
- [ ] Waiting For due today → on Daily; due tomorrow or in 3 days → not on Daily; overdue → on
      Daily with `#due … !`.
- [ ] Waiting For in the Inbox → on Daily in the Inbox group, last.
- [ ] Waiting For without a name → label `#w/f`.
- [ ] Very long title + `#w/f Long Name` + due → title ends with "…", both labels fully visible,
      nothing under the row, next row not covered (Daily, Current, Inbox, Review Inbox step).
- [ ] Double-tap `#next` → `#now`, and back; single tap on `#next` does nothing; tap on title or
      `#due` opens edit; tap on a context tag still filters.
- [ ] Current/Inbox grouped lists: no `#next` under Next, no lone `#w/f` under Waiting For, name
      and due shown.
- [ ] Focus mode: no Waiting For todos. Tomorrow tab: meetings only.
- [ ] Projects/Areas tabs: `#ABC` after each name that has one, rows visibly a bit taller, taps
      land on the intended row; paging still fits the column.
- [ ] Review's Stalled/Neglected lists look unchanged.

## 7. Open points

- None blocking. To watch on the device: whether `FONT.small` + `600` labels are distinct enough
  next to context tags (`#lena`), which render in the title font.

