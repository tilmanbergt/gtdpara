# Technical design: Monthly focus in Review + Gmail archive feedback

Status: APPROVED and IMPLEMENTED 2026-09-28 (tsc clean apart from 4 pre-existing errors; not yet device-tested).
As built: exactly as below; `handleToggleItemWeeklyFocus` became `handleTogglePeriodFocus(item, scope, value)`, `WeeklyFocusKindSection` became `PeriodFocusKindSection`. Open: Focus reset has no scrolling - two blocks leave less room for an expanded candidate list (roughly 20 rows), check on device.
Related: technical-design-monthly-view.md, technical-design-daily-todo-filter.md
(+ its 2026-09-16 "Round 4" widening), technical-design-review-master-detail.md,
technical-design-review-gmail-inbox.md.

## 0. Requirements (decided in chat 2026-09-28)

1. A Project/Area in **Monthly** focus counts as "focused" for its `#next`
   tasks: they appear on **Daily** (new - today they do not) and the item is
   therefore **not** listed under Review's "Unfocused next items".
2. "Unfocused next items" detail panel gets a third pill
   **"+ Add <name> to Monthly focus"** next to Daily/Weekly, and its
   "Current focus" section lists **Monthly** focus (with ✕) under Daily and
   Weekly.
3. Last Review step **"Weekly focus reset" → "Focus reset"**: sets weekly AND
   monthly focus. Layout: two blocks stacked - **Monthly** (Projects | Areas)
   on top, **Weekly** (Projects | Areas) below.
4. Gmail step, Archive: the pill **flashes black** right after the tap, then
   the email **disappears from the list immediately** and archiving runs in
   the background. Only if archiving fails does the email go **back into the
   list**. After the removal the **next email is selected automatically**
   (the one below; the one above if it was the last).

## 1. Monthly focus = "focused" (req. 1)

Finding: `domain/destination.ts`'s `isFocused()` is `dailyFocus ||
weeklyFocus`; `monthlyFocus` (added by the Month view) is ignored by every
consumer.

Change: widen `isFocused` to `dailyFocus || weeklyFocus || monthlyFocus`
(the `FocusFlags`/`DestinationCandidate` shapes gain `monthlyFocus`). One
change, every consumer follows automatically:

| Consumer | Effect |
|---|---|
| `dailyAggregate.ts` #next leg | monthly-focused items' `#next` tasks show on Daily |
| `dailyAggregate.ts` `buildFocusCandidateEntries` (#now picker) | same widening (consistent with Round 5) |
| `dailyAggregate.ts` group sort, `destinationCandidates`, `ItemsList.tsx` ★/sort | monthly-focused items also float up / get ★ |
| `reviewAggregate.ts` `unfocusedNextItems` | monthly-focused items drop out of the step |
| `ReviewScreen.tsx` Unfocused-next row checkmark | ✓ also for monthly |

Type ripple: `DailyItemRef` (dailyAggregate.ts) carries `dailyFocus/
weeklyFocus` today - gains `monthlyFocus` (the synthetic Inbox ref gets
`false`). Any other object literal passed into `isFocused`/
`destinationCandidates` gets the field too (tsc will list them).

`ReviewScreen.handleRemoveItemFocus`'s "ripple" check (an item that becomes
unfocused re-enters the frozen Unfocused-next list) currently checks "the
other scope" - generalised to "no remaining focus flag after this removal":
`isFocused({...item, [field]: false})`.

## 2. Unfocused next items: Monthly pill + Current focus (req. 2)

- New handler `handleAddToMonthlyFocus(itemRef)` - same shape as
  `handleAddToWeeklyFocus`, delegating to a new generic
  `handleTogglePeriodFocus(item, scope: 'weekly'|'monthly', value)` that
  replaces `handleToggleItemWeeklyFocus` (focusBlockedReason → setItemFocus
  → refreshFromCache → bump → requestEinkRefresh). Marks the card acted-on.
- `UnfocusedNextTaskDetail`: third pill (greyed "✓ …" once
  `monthlyFocus` is set, same live rule as the other two), third "Monthly —
  n of limit" subsection with `FocusedItemRow` + ✕ (`onRemoveFocus(item,
  'monthly')`), kind-filtered like the other two.
- Empty-state text: "...aren't in Daily, Weekly or Monthly focus...".
- Space: the panel grows by one pill row + max. 3 rows (monthly area limit).
  If the pill row gets too wide, the three pills wrap (row is already
  `flexWrap`-style) - verify on device.

## 3. "Focus reset" step (req. 3)

- `domain/reviewSteps.ts`: title → `'Focus reset'`. The step **id stays
  `'weeklyFocus'`** - it is the persisted key of the per-step last-reviewed
  date/stats; renaming it would reset that history. (Only a code comment
  explains the mismatch.)
- `ReviewScreen.tsx`: `WeeklyFocusKindSection` becomes
  `PeriodFocusKindSection` with a `scope: 'weekly'|'monthly'` prop (reads/
  writes `weeklyFocus` or `monthlyFocus`, limit from the matching settings
  count). `renderFocusReset` renders:
  - hint "Choose which Projects and Areas get your attention this month and
    this week."
  - block heading "Monthly" + the two columns (Projects | Areas)
  - block heading "Weekly" + the two columns (Projects | Areas)
- Month boundary: monthly focus is a plain flag (not per-month) - nothing
  period-specific needed; goals are not part of this step (unchanged).
- Hub count (`buildReviewStepCounts`): `n` = weekly-filled + monthly-filled,
  `of` = sum of the four limits (keeps the "N of M slots filled" format).
- Recap: new counter `monthlyFocusAdded` in `ReviewSummaryCounts` +
  `ZERO_REVIEW_SUMMARY` + line "N items added to monthly focus". Old saved
  stats blobs lack the key → every read uses `?? 0` (check the stats-merge
  code for plain `a + b` additions).
- Space: left column worst case = Monthly 2 project slots + Weekly 5 project
  slots + 2 headings ≈ well within the column; the expandable candidate list
  is inside the existing step scroll view.

## 4. Gmail archive: flash, instant removal, background archive (req. 4)

### 4.1 Flash
`GmailDetailPanel`: on Archive tap, set local `archiveFlash=true` → the pill
renders inverted (black fill `COLORS.accent`, white text - the app's "active"
convention) + `requestEinkRefresh()`. After ~350 ms (`ARCHIVE_FLASH_MS`)
call `onArchive(message)`. The panel does NOT await the network call any
more (no `pending`/spinner for archive).

### 4.2 Removal + selection
`ReviewMasterDetail` gets optional **controlled selection** props
(`selectedKey?: string | null`, `onSelectedKeyChange?`) - when provided,
its internal state is bypassed; all other steps stay uncontrolled
(unchanged). The Gmail step holds `gmailSelectedKey` (reset on
`stepEntryToken`, like the internal reset).

`handleArchiveGmailMessage` (ReviewScreen), now synchronous from the UI's
point of view:
1. compute the neighbour in the current `gmailList` (next, else previous,
   else null) and `setGmailSelectedKey(neighbour)`;
2. `startGmailArchive(settings, uid)` - removes from the cache immediately,
   `setGmailMessages(getCachedGmailInbox())`, bump `gmailArchived`;
3. background promise: on success nothing more (log only); on failure the
   cache has already restored the message → `setGmailMessages(...)`, undo the
   `gmailArchived` bump (bump(-1)), show a step-level error
   "⚠ Couldn't archive "<subject>": <reason> - it's back in the list." in the
   existing error line under the Refresh button (new `gmailArchiveError`
   state, cleared on the next archive/refresh), `requestEinkRefresh()`.

Left-list pagination: if the neighbour sits on another page, the selected
row may be off-page; the detail still shows it. Acceptable for v1 (flag if it
bothers on device).

### 4.3 gmailInboxCache.ts
- `restoreCachedGmailMessage` re-inserts at the **original index** (removal
  returns `{message, index}`), so a failed email reappears where it was.
- Archives are **serialised** through a module-level promise chain
  (`archiveQueue`) - fast consecutive taps must not open parallel IMAP
  sessions against the native module (its thread safety is untested).
- Race: a manual Refresh while archives are still queued could re-list a
  message the server hasn't archived yet. Mitigation: the cache keeps a
  `pendingArchiveUids` set and `refreshGmailInbox` filters those out of the
  fresh list.

## 5. Files touched

- `src/domain/destination.ts` - isFocused + shapes
- `src/storage/dailyAggregate.ts` - DailyItemRef.monthlyFocus, doc comments
- `src/storage/reviewAggregate.ts` - doc comments, step counts
- `src/domain/reviewSteps.ts` - title, monthlyFocusAdded, summary line
- `src/storage/gmailInboxCache.ts` - index restore, queue, pending set
- `src/ui/ReviewMasterDetail.tsx` - optional controlled selection
- `src/screens/ReviewScreen.tsx` - handlers, UnfocusedNextTaskDetail,
  PeriodFocusKindSection, renderFocusReset, Gmail archive flow/flash
- possibly further literal call sites of `isFocused`/`destinationCandidates`
  found by tsc
- `docs/dev/design-overview.md` - §2.13 Review (Focus reset, Unfocused next),
  Daily filter rule; `docs/dev/history/technical-design-daily-todo-filter.md` note.

## 6. Verification
Syntax/tsc check in a cloud scratch project with stubs; commit, re-stage and
md5 every file (ReviewScreen.tsx revert history). Device test: monthly-focused
project's #next on Daily; not in Unfocused next; Monthly pill + ✕; Focus
reset both blocks; Gmail archive flash/next selection/failure (e.g. airplane
mode) restoring the email.
