# Technical design - Observable cache, one shared add/save path, "where did it go" note (2026-09-20, rev. 2)

Status: **IMPLEMENTED and committed to device 2026-09-20 - not yet device-tested** (see "As built" at the end). Requirements settled in chat 2026-09-20 (bugfix analysis, then: do steps 1 and 2; a short note after adding a meeting that lands outside the visible list, on Week *and* Daily; no automatic switching of the displayed week/day).

Touches:
- `src/storage/dataCache.ts` (subscribe + version, notify on every mutation)
- `src/ui/useCachedItems.ts` (new hook)
- `src/storage/itemMutations.ts` (new - shared build/add/mutate functions, no React)
- `src/domain/dateLabel.ts` (new, pure - "today / tomorrow / next week / 09/28")
- `src/ui/QuickAddWidget.tsx` (new optional prop `isMeetingDateVisible`, note text)
- `src/screens/WeekView.tsx`, `DailyView.tsx`, `ReviewScreen.tsx`, `InboxScreen.tsx`, `ProjectDataPanel.tsx`, `CaptureScreen.tsx` (adopt the above; WeekView/DailyView also pass the visibility predicate)

---

## 0. Failure picture and root cause (from the analysis)

**Symptom:** in Week, a meeting added to a Project/Area (via `#ABBR` quick-file, "+ Add to <Name>", or the tag "New from this" puts into the title) does not appear until something else re-renders the screen (tab switch, week change, 🔄). A meeting added to Inbox appears immediately. Daily is fine in both cases.

**Cause:** for a Project/Area destination the write-through helpers (`ensureItemCached` `.push`, `updateItemMeetings`) mutate the cache **in place**. `WeekView.refreshFromCache()` then calls `setItems(cache.items)` - the *same array reference* - so React bails out and nothing re-renders. Inbox adds work only because they also call `setInbox(newObject)`. Daily works only because its `refreshFromCache` additionally calls `setAggregate(buildDailyAggregate(...))` (a new object every time); Week computes its aggregate inline during render and never got an equivalent trigger. Week's doc comment says "mirrors Daily exactly" - it did not, and nothing forced it to.

**Same class of bug, currently masked or latent:** in Week, meeting tracking toggle (#prepped/#reviewed), create-meeting-note, weekly-focus toggle and weekly-goal save all end in that same no-op `refreshFromCache()`. Edit/cancel look fine only because they also `setEditingKey(null)`.

**Second, separate effect (not a bug):** a meeting dated outside the visible list (copy + `+7` while on this week; a "tomorrow" meeting while on Daily's Today tab) correctly does not show, and the widget only says `✓ Added "…"`. See C.

---

## A. Observable cache (fixes the bug on every screen, structurally)

### dataCache.ts
Add a version counter and a listener set:

```ts
let version = 0;
const listeners = new Set<() => void>();
export function subscribeCache(listener: () => void): () => void   // returns unsubscribe
export function getCacheVersion(): number
function notifyCacheChanged(): void   // version++, call every listener
```

`notifyCacheChanged()` is called from every place that changes what a screen would display:
`doRebuildCache` (after `cached = next`, and again after `migrateMissingAbbrevs`), `ensureItemCached` (only when it actually pushes), `updateItemTasks/Meetings/Scope/WeeklyGoals/FrontMatter` (only when the item was found), `removeCachedItem`, `clearCachedData`, `assignDefaultAbbrevIfMissing`.

Item objects stay **mutated in place** (`migrateMissingAbbrevs` and several callers rely on it - not touched here). The hook below compensates by handing out a fresh array per version.

### ui/useCachedItems.ts (new)
```ts
export function useCachedItems(): CachedItem[]
```
Subscribes with `useState` tick + `useEffect` (no `useSyncExternalStore`, so no dependence on the plugin host's React version) and returns `getCachedData()?.items.slice()`, recomputed only when the version changed - i.e. a **new array identity per cache change**. Nothing in the codebase uses `React.memo`/`useMemo` on `items` today (checked), but this keeps `useEffect`/`useCallback` dependency arrays honest.

### Screen changes
| Screen | Change |
|---|---|
| **WeekView** | `items` state -> `useCachedItems()`. `refreshFromCache` removed entirely (every former call site simply deletes the line). `inbox` stays local state for now (step 3, deferred). Aggregate stays computed per render, as today. |
| **DailyView** | `items` state -> `useCachedItems()`. `aggregate` state -> a per-render `const aggregate = buildDailyAggregate(items, inbox, basePath)` (already what the `dailyContext` branch does; all ~10 readers keep the name). `refreshFromCache` removed. Focus mode does not depend on the old frozen value: `justCompletedTasks` and `focusEntryNowMs` are separate snapshots. |
| **ReviewScreen** | `items` state -> `useCachedItems()` only. **Its `aggregate` stays a deliberate frozen snapshot** (Review steps must not drop rows mid-review - see its "frozen-snapshot pattern" notes), so `refreshFromCache` keeps rebuilding the aggregate but no longer sets `items`. Documented exception, not drift. |
| **InboxScreen** | `items` state -> `useCachedItems()`; `refreshItemsFromCache` removed. |
| **ProjectDataPanel / ItemsList / ItemDetail / CaptureScreen** | no change (they own a local `state` object that is replaced on every save, or show no list). |

Side effect to be aware of: a background cache rebuild (plugin foreground) now also re-renders the open Week/Daily. That is desired (shows externally changed data) and is the same render a manual 🔄 causes.

---

## B. One shared add / mutate path

### storage/itemMutations.ts (new; no React, no RN)
Owns the pieces every screen currently re-types:

```ts
buildTask(text: string, opts?: {notePath?: string}): Task
buildMeeting(fields: MeetingQuickAddFields, opts?: {notePath?: string}): Meeting

interface InboxContext { inbox: ProjectFileState | null; basePath: string | null }

// Result carries the new Inbox state when (and only when) the Inbox file was written.
addTaskToDestination(task, destination, ctx):    Promise<{nextInbox?: ProjectFileState}>
addMeetingToDestination(meeting, destination, ctx): Promise<{nextInbox?: ProjectFileState}>

// The saveEntryTasks/saveEntryMeetings body shared by Daily/Week (Inbox-or-item resolve, stale-index check, save, write-through)
mutateEntryMeetings(entry: {item: {kind, path}, meetingIndex, meeting}, mutate, ctx): Promise<{nextInbox?: ProjectFileState}>
mutateEntryTasks(entry, mutate, ctx): Promise<{nextInbox?: ProjectFileState}>
```

The functions do file save + cache write-through and return the new Inbox state; the **screen** still owns `setInbox`. That keeps the existing async-`setInbox` handling explicit (the return value *is* the override), so `inboxOverride` parameters disappear from Daily/Week without moving Inbox into the cache yet.

Resulting screen handlers:
```ts
const handleAddMeeting = async (fields, destination) => {
  const {nextInbox} = await addMeetingToDestination(buildMeeting(fields), destination, {inbox, basePath});
  if (nextInbox) setInbox(nextInbox);
};
```

### Adoption
| Screen | Uses |
|---|---|
| DailyView, WeekView | `buildX` + `addXToDestination` + `mutateEntryX` (replaces `handleAddTask/Meeting`, `saveEntryTasks/Meetings`) |
| ReviewScreen | `buildX` + `addXToDestination` for the add flow; its own `cachedItem`-based save helpers stay (they never touch Inbox state) |
| InboxScreen, ProjectDataPanel | `buildX` only (their own-file save goes through `saveInboxTasks/withTasks`, cross-target through the existing `appendXToTarget`) |
| CaptureScreen | `buildX` + `addXToDestination` with a freshly loaded Inbox. **Also fixes a latent drift:** its meeting literal has no `linkedFile` field, unlike every other copy. |

Removes six copies of the `newMeeting`/`newTask` literal and five copies of the Inbox-vs-item branch. The Inbox-in-cache step (removing local `inbox` state and `inboxOverride` altogether) stays a separate, later change.

---

## C. "Where did it go" note for meetings outside the visible list

### Requirement
After a successful Add of a meeting whose date is **not in the list the screen currently shows**, Row 4's centre note says where it went instead of the plain `✓ Added "…"`:

- `✓ Added "Team sync" - tomorrow`
- `✓ Added "Team sync" - next week`
- `✓ Added "Team sync" - 09/28`

No switching of the displayed day/week. If the date **is** visible, the message is unchanged. Screens that show all of their meetings anyway (Inbox, Project/Area, Review, Capture) pass nothing and never get the suffix.

### domain/dateLabel.ts (new, pure, injectable `now`)
`describeAddedDate(date: string, now = new Date()): string`, first match wins:

1. same day as today -> `today`; +1 -> `tomorrow`; -1 -> `yesterday`
2. inside the ISO week after today's week -> `next week`; inside the ISO week before -> `last week`
3. otherwise `MM/DD` (same calendar year as today) or `YYYY-MM-DD` (other year, so it is never ambiguous)

Reuses `weekRangeIso`/`addDaysToIso`; the label is always relative to the **real today**, not to the displayed week. (`09/28` follows the format used in the request; swapping to `Sep 28` is a one-line change.)

### QuickAddWidget
New optional prop `isMeetingDateVisible?: (date: string) => boolean`. In `submitMeetingCreate`'s `.then`: if the prop is set and returns `false` for the added date, the just-added state carries the label. State changes from a bare title string to `{title, when: string | null}`. Message: `✓ Added "<title, 16 chars…>" - <when>` - the title is truncated only in this case, because the centre slot is one line (`numberOfLines={1}`) and a long title would cut the suffix off. Without a suffix the message is exactly as today. Cleared by the same events as today.

### Predicates
- **WeekView:** `date => date >= weekStart && date <= weekEnd`
- **DailyView:** `date => calendarTab === 'today' ? date === todayDate : calendarTab === 'tomorrow' ? date === tomorrowDate : false` (on the Google tab nothing from the plugin's own list is visible, so the note always appears)

Meetings only; a Todo's due date is not a list-membership question.

---

## D. Tests
1. `dateLabel`: today/±1, week boundary Sun->Mon, year boundary (ISO week 53/1), other-year ISO format, Feb 29, four time zones (same harness as `dateNudge`).
2. **Regression test for this exact bug:** react-test-renderer component using `useCachedItems()`; with a warm cache, call `updateItemMeetings` (same array reference) and `ensureItemCached` (push) and assert the component re-rendered and sees the new meeting. Fails on the old `setItems(cache.items)` approach.
3. Widget: note shows for a hidden date, not for a visible date, not when the prop is absent; title truncated only with suffix; cleared on next edit.
4. Whole-`src` tsc diff against the baseline (17 pre-existing errors, expect 0 new; expect Capture's missing `linkedFile` error, if it is one of the 17, to drop) + unused-symbol pass.
5. `itemMutations`: Inbox branch returns `nextInbox`, item branch does not; stale-index error; `buildMeeting` produces every `Meeting` field.

## E. On-device checks (after commit)
- Week: add a meeting with a `#ABBR` tag for this week -> appears at once; same with no tag (Inbox) -> appears.
- Week: toggle prepped/reviewed on a filed meeting -> icon updates at once.
- Week: copy a meeting with "New from this", `+7`, Add -> note says `next week`; navigate to next week -> it is there.
- Daily: add a tomorrow meeting on the Today tab -> `tomorrow`; add a today meeting on the Today tab -> plain message.
- Daily and Review still behave as before (focus mode, frozen Review lists).
- E-ink: the list change after Add is flushed without a swipe. The two-line risk: hook-driven re-renders may need the same explicit `requestEinkRefresh()` the other handlers use; if so it is added once, in the hook's consumers, not per handler.

## F. Risks / not done
- Deriving Daily's `aggregate` per render is the largest behavioural change; if a reader turns out to rely on the frozen value, that reader keeps a snapshot and the reason is documented.
- In-place item mutation remains (deliberate, out of scope); the hook's fresh-array-per-version is the mitigation.
- **Step 3 (Inbox as a cached item; drop local `inbox` state and `inboxOverride`) is deferred** until this has been on the device.
- Not covered: a note when a meeting is *filed elsewhere* (e.g. Inbox screen adding via `#ABBR` to a Project). Easy extension of the same widget message if wanted.

## G. Implementation order
1. `dataCache` subscribe/notify + `useCachedItems` + regression test.
2. `dateLabel` + tests.
3. `itemMutations` + tests.
4. Screens one at a time: Week, Daily, Review, Inbox, Project, Capture (tsc diff after each).
5. Widget prop + tests; Week/Daily predicates.
6. `docs/dev/design-overview.md` section, this doc's "As built", commit each step with md5 verification.

---

## As built (2026-09-20)

Implemented as designed, with these specifics and deviations:

- **New files:** `src/ui/useCachedItems.ts`, `src/storage/itemMutations.ts`, `src/domain/dateLabel.ts`. Changed: `dataCache.ts`, `QuickAddWidget.tsx`, `WeekView.tsx`, `DailyView.tsx`, `ReviewScreen.tsx`, `InboxScreen.tsx`, `ProjectDataPanel.tsx`, `CaptureScreen.tsx`, `docs/dev/design-overview.md` (§2.29, a §3 guideline, a §4 on-device bullet).
- **`MeetingInput`** is declared structurally in `itemMutations.ts` (`{title, date, time}`) so `storage/` never imports the widget's `MeetingQuickAddFields` from `ui/`.
- **Daily** keeps its `saveEntryTasks(entry, mutate, inboxOverride?)` / `saveEntryMeetings` as thin wrappers over `mutateEntryTasks/Meetings` so their ~15 callers (including the `#now` cohort clear that threads the returned inbox) are untouched. Its `aggregate` is a per-render `const` (`null` until `basePath` is known, same as the old state). Focus-mode's readers (`nowCohort`, `focusMeetings`, the edit-entry lookups) never depended on the frozen value.
- **Focus-mode widget in Daily gets no `isMeetingDateVisible`**: its list is a 4-hour look-ahead that a date alone cannot express, so it keeps the plain `✓ Added` message.
- **Review's Inbox-to-zero meeting add now honours its `destination`** (found while adopting the shared path: `handleAddInboxMeeting` ignored it, so a tagged meeting - button "+ Add to <Name>", tag stripped from the title - was silently saved into the Inbox). Behaviour change, deliberate.
- **CaptureScreen** reads the Inbox fresh from disk (it keeps no Inbox state) and passes it in the `InboxContext`; its Task/Meeting literals now carry `linkedFile` via the builders, which removes 8 of the 17 pre-existing tsc errors (17 -> 9).
- **Widget note state:** `meetingAddedWhen` alongside `meetingJustAdded`; cleared by the same events; title cut to 16 chars only when a suffix is present.

### Verification
- `tsc --noEmit` over all of `src/`: zero new errors vs the baseline; the 8 Capture errors are gone; unused-symbol pass clean.
- `describeAddedDate`: 27 checks, four time zones (UTC, Los Angeles, Berlin, Auckland), including ISO week 53 and year-boundary cases.
- Jest / react-test-renderer, 34 tests: `useCachedItems` (re-render on in-place mutation, `ensureItemCached` push, identity per change, no-op update does not notify, unsubscribe; plus one test documenting that `setItems(cache.items)` with the same array is a no-op), `itemMutations` (10), the widget (9 earlier + 4 note cases), and real mounts of **WeekView** and **DailyView**.
- **The WeekView regression test fails against the pre-change screen and passes now.** A single filed add did not reproduce it - React still re-renders once for an equal `setState` right after a real update - so the test adds three meetings in a row (one per weekday, to stay clear of the column's pagination); that is also why the bug looked intermittent on the device.

### Not verified (on-device checklist)
See `docs/dev/design-overview.md` §4's on-device bullet for §2.29: Week filed-add appears at once (repeatedly) and Inbox add too; tracking-icon toggle updates at once; copy + `+7` + Add says `- next week`; Daily tomorrow-on-Today-tab says `- tomorrow`; e-ink flush after Add without a swipe; Daily/Review behave as before.

### Deferred
Inbox into the cache (drops each screen's local `inbox` state and `inboxOverride`); a note for a meeting filed to a Project/Area from a screen that does not list it.
