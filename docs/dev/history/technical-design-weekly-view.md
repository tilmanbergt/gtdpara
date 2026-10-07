# Technical design: Weekly view (`WeekView` tab)

Status: ready for implementation pending the open questions in §11. Requirements were clarified in chat across two rounds (2026-09-13, `AskUserQuestion`) plus a follow-up round of V2-ahead thinking, before this design pass — per this project's own clarify → design → implement workflow (`gtdpara_project` memory). This doc is the "check what already exists, then design for reuse" step that follows, same posture `technical-design-daily-focus-panel.md` and `technical-design-now-focus-mode.md` took.

## 0. What this is, and why it slots in cleanly

A new persistent tab: a calendar-week (Monday–Sunday) planning view, meetings on the left, the weekly-focus Projects/Areas on the right, a quick-add widget, and prev/next navigation between weeks. This is literally the "future week view" `domain/settings.ts`'s own doc comment on `weeklyFocusProjectCount`/`weeklyFocusAreaCount` has been pointing at since the Focus feature shipped: *"Weekly isn't consumed by any view yet (reserved for a future week view) but is configurable and enforced the same way daily is, so the data/UI is already in place when that view is built."* That promise turns out to be accurate — §1 below is the walkthrough of just how much is already sitting there unused.

## 1. Survey: what already exists to reuse

This is the single most important section, because it changes the shape of the whole feature from "build a new screen and its data model" to "wire up a new screen out of parts that already work":

- **The focus flag, the limits, and the write path are 100% done.** `storage/focusSlots.ts`'s `setItemFocus(item, scope, value)`, `countFocused`, `canAddFocus`, `focusBlockedReason` are already `scope: 'daily' | 'weekly'`-parameterized — calling them with `'weekly'` instead of `'daily'` is the entire "add/remove weekly focus" backend, with zero new storage code. `GtdParaSettings.weeklyFocusProjectCount`/`weeklyFocusAreaCount` (defaults 5/3) already exist and are already editable in Settings.
- **The exact "add/remove focus with a full-browse picker" UI pattern already exists and already shipped**: `ui/DailyFocusPanel.tsx` (design-overview.md §2.22) — three mini-tabs (Focus/Projects/Areas), a fixed-slot display with ✕-to-remove and "+ Add" empty slots, and an arm-and-pick mechanism (tapping "+ Add" arms the matching Projects/Areas tab as a picker via `ui/FileBrowserPane.tsx`'s existing `LinkTarget` arming mode — the same mechanism `ItemStatusPanel`'s "Assign to Area…" and `InboxScreen`'s refile-arming already use). This is the "same picker used elsewhere" Tilman asked to confirm — §3 below is a close mirror of this component, parameterized on `weekly` instead of `daily`.
- **A simpler, older weekly-focus picker also exists**, `ReviewScreen.tsx`'s private `WeeklyFocusKindSection` (Review step 7, "Weekly focus reset") — an inline-expanding candidate list, the pre-arm-and-pick style `DailyFocusKindSection` used to be before `DailyFocusPanel` replaced it for daily focus. `DailyFocusPanel`'s own design doc explicitly left weekly focus/Review step 7 untouched when it did that replacement for daily. This new feature does the same: it does **not** touch or migrate `WeeklyFocusKindSection` — see §11.1 for why this is flagged as a decision rather than silently made.
- **The Google Calendar mini-tab pattern already exists**, `ui/GoogleCalendarPanel.tsx`, used identically on Daily/Project/Inbox/Review — needs one small additive extension (§5) to support an arbitrary displayed week instead of only "N days from today".
- **The "meetings grouped by weekday" layout already exists once**, in `ReviewScreen.tsx`'s `renderWeekAhead` (step 1, "Week ahead") — a flat 7-day array built with `isoDateOffset`, filtered per day, each day rendered as a labeled block. This is the starting shape for the new Weekly page's meetings column (§4), generalized to an arbitrary Monday-anchored week instead of always "today + 6", and with per-day pagination added (Review's version has none — it's deliberately compact/read-only with no cap, which is fine for a 7-line-max wizard step but wouldn't be for a page meant to be opened daily with a potentially busy week).
- **The quick-add widget's contract already matches what's needed.** `ui/QuickAddWidget.tsx` takes a required `fixedDestination: Destination` (there is no destination picker inside the widget itself — that's a per-screen choice) plus an `initialDate?: string` prop. Every cross-project screen (`DailyView.tsx`, `ReviewScreen.tsx`) already defines its own local `FIXED_INBOX_DESTINATION: Destination = {type: 'inbox'}` and fixes the widget to it — the Weekly page does the same, for the same reason (it isn't "inside" any one Project/Area, so captures go to Inbox to be triaged, same as Daily/Review/focus mode).
- **Pagination is a solved, standard pattern** (`ui/pagination.ts`'s `usePagination`/`PAGE_SIZE`) — every new list this feature needs is a new named `PAGE_SIZE` constant plus a `usePagination` call, not new logic.

Net effect: there is no new persisted state for V1 at all. Every new file below is UI/aggregation glue over existing storage.

## 2. New domain util: `domain/weekDate.ts`

Small, pure, zero-RN (matches `domain/meetingTime.ts`'s own convention, and sits next to it rather than inside it — `meetingTime.ts` is meeting-specific; this is calendar-week math with no Meeting dependency at all).

```ts
import {isoDateOffset, todayIso} from './meetingTime';

/** Monday..Sunday (YYYY-MM-DD) of the week containing `now`. Calendar-field-based via isoDateOffset, same DST-safe convention meetingTime.ts already uses throughout - never now.getTime() + days*ms. */
export function weekRangeIso(now: Date = new Date()): {start: string; end: string} {
  const isoWeekday = (now.getDay() + 6) % 7; // Mon=0 .. Sun=6
  return {start: isoDateOffset(-isoWeekday, now), end: isoDateOffset(6 - isoWeekday, now)};
}

/** `now` shifted by whole `weeks` (may be negative) - for prev/next navigation. A real Date at local midnight, calendar-field arithmetic (new Date(y,m,d+weeks*7)), same convention as isoDateOffset. */
export function shiftWeeks(now: Date, weeks: number): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + weeks * 7);
}

/** ISO-8601 week number + week-year (the Thursday-of-the-week rule) - for the header's "Week 37" display and (V2, see §12) the weeklyGoals section key. */
export function isoWeekOf(now: Date = new Date()): {year: number; week: number} {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayNum = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dayNum + 3); // nearest Thursday decides the ISO week-year
  const isoYear = d.getFullYear();
  const jan4DayNum = (new Date(isoYear, 0, 4).getDay() + 6) % 7;
  const week1Monday = new Date(isoYear, 0, 4 - jan4DayNum);
  const week = Math.round((d.getTime() - week1Monday.getTime()) / (7 * 86400000)) + 1;
  return {year: isoYear, week};
}

/** "2026-W37" - the V2 storage key shape (§12), built from the same isoWeekOf this file already computes for the header, so the two never drift on what "this week" means. */
export function isoWeekKey(now: Date = new Date()): string {
  const {year, week} = isoWeekOf(now);
  return `${year}-W${String(week).padStart(2, '0')}`;
}
```

`todayIso` import is unused above except transitively — drop it if `tsc --noEmit --strict`'s `noUnusedLocals` flags it; kept in the signature here only to show what's already available to build on.

## 3. New storage aggregate: `storage/weeklyAggregate.ts`

Mirrors `storage/dailyAggregate.ts`/`storage/reviewAggregate.ts`'s established shape exactly: a pure, synchronous transform over `storage/dataCache.ts`'s already-warm `CachedItem[]` plus a directly-loaded Inbox — no filesystem I/O in this file, same "read the already-warm cache" rule.

```ts
export interface WeeklyMeetingEntry {
  item: DailyItemRef; // reused from dailyAggregate.ts - already carries kind/name/path/dailyFocus/weeklyFocus, and inboxItemRef() already gives the synthetic Inbox entry this needs too
  meetingIndex: number;
  meeting: Meeting;
}

export interface WeeklyFocusCardData {
  item: CachedItem;
  nextCount: number;       // open (!done && !cancelled), flowState === 'next'
  somedayCount: number;    // open, flowState === 'someday'
  meetingCount: number;    // this item's own meetings whose date falls in [weekStart, weekEnd]
}

export interface WeeklyAggregate {
  /** Every not-cancelled meeting (Projects/Areas + Inbox) dated within [weekStart, weekEnd] inclusive, soonest first. */
  meetings: WeeklyMeetingEntry[];
  /** One card per currently weekly-focused Project/Area, in the same items-array order (no re-sort needed - the Focus panel's own two FixedSlotSection-equivalents already group by kind). */
  focusCards: WeeklyFocusCardData[];
  failedItems: Array<{item: DailyItemRef; error: string}>;
}

export function buildWeeklyAggregate(
  items: CachedItem[],
  inbox: DailyInboxInput | null,
  basePath: string,
  weekStart: string,
  weekEnd: string,
): WeeklyAggregate {
  // meetings: same per-item/per-Inbox loop shape as buildDailyAggregate, date
  // range check (meeting.date >= weekStart && meeting.date <= weekEnd) instead
  // of the today/tomorrow check; sorted with meetingTimestampMs, same as
  // every other meeting list in the app.
  //
  // focusCards: items.filter(i => i.weeklyFocus && !i.loadError).map(item => ({
  //   item,
  //   nextCount: item.tasks.filter(t => !t.done && !t.cancelled && t.flowState === 'next').length,
  //   somedayCount: item.tasks.filter(t => !t.done && !t.cancelled && t.flowState === 'someday').length,
  //   meetingCount: item.meetings.filter(m => !m.cancelled && m.date >= weekStart && m.date <= weekEnd).length,
  // }))
}
```

Deliberately **not** reusing `buildReviewAggregate`'s `weekMeetings` (today..+6, always anchored to "now") — this needs an arbitrary `[weekStart, weekEnd]` the caller supplies from `weekDate.ts`, so prev/next navigation works. `buildDailyAggregate`'s `DailyItemRef`/`inboxItemRef` are reused as-is (exported already, no change needed there).

## 4. New UI: `ui/WeeklyMeetingsColumn.tsx`

The left column. Two mini-tabs, same convention as every other calendar-showing screen (`ReviewScreen.tsx`'s `WEEK_AHEAD_MAIN_TABS` is the closest precedent) — "This week" (local, the new fixed-per-weekday-slot layout below) and "Google Calendar" (the existing `GoogleCalendarPanel`, extended per §5).

**Fixed-per-weekday-slot layout**, addressing "7 days can be packed": all 7 days (Monday first) always render, each in its own small sub-component with its own pagination, rather than one long scrolling list or a slot that grows with content:

```tsx
function WeekDayColumn({date, label, isToday, isPast, meetings, onOpenItem, textColor, borderColor}: {...}) {
  const paged = usePagination(meetings, PAGE_SIZE.weeklyDayMeetings, /* resetKey */ date);
  return (
    <View style={[styles.dayBlock, isPast && styles.dayBlockMuted]}>
      <Text style={[styles.dayLabel, isToday && styles.dayLabelToday]}>{label}</Text>
      {paged.pageItems.length === 0 ? (
        <Text style={styles.hint}>Nothing scheduled.</Text>
      ) : (
        paged.pageItems.map(entry => (
          <Text key={`${entry.item.path}#${entry.meetingIndex}`} style={styles.meetingLine}>
            {entry.meeting.time ? `${entry.meeting.time} ` : ''}{entry.meeting.title} — {entry.item.name}
          </Text>
        ))
      )}
      {meetings.length > PAGE_SIZE.weeklyDayMeetings && (
        <PageControls page={paged.page} totalPages={paged.totalPages} canPrev={paged.canPrev} canNext={paged.canNext} onPrev={paged.goPrev} onNext={paged.goNext} .../>
      )}
    </View>
  );
}
```

`resetKey={date}` matters: without it, paging into "page 2" of a busy Monday and then navigating to next week (a new set of 7 `date`s, but the *same 7* `WeekDayColumn` instances re-rendering with new props, not remounting) would leave each slot stuck on whatever page it happened to be on — exactly the case `ui/pagination.ts`'s own doc comment describes `resetKey` for ("items isn't the same list mutating in place but a genuinely different list").

`isPast`/`isToday` come from comparing each day's date string to `todayIso()` — `isPast` mutes that block (§ requirements: "shown but visually de-emphasized"), `isToday` gets a small emphasis style. Both are plain style flags, no new data.

The parent (`WeeklyMeetingsColumn`) builds the 7 `{date, label, isToday, isPast}` entries from `weekStart` (via repeated `isoDateOffset(n, weekStartAsDate)`, n=0..6) and groups `aggregate.meetings` by `entry.meeting.date === date` per slot, same filter-per-day shape `ReviewScreen.tsx`'s `renderWeekAhead` already uses, just over the wider date range.

## 5. Small additive extension to `ui/GoogleCalendarPanel.tsx`

Every existing caller (Daily/Project/Inbox/Review) windows the shared 30-day cache with `maxDays` — a count of days *from today*. That doesn't work for the Weekly page's prev/next navigation: "next week" needs the window `[nextMonday, nextSunday]`, which `maxDays`-from-today can't express (it can only ever start at today).

Additive fix, same pattern as every other optional prop this component has already grown (`pageSize`, before it `maxDays` itself):

```ts
interface Props {
  maxDays?: number;                       // now optional
  dateRange?: {start: string; end: string}; // new - inclusive YYYY-MM-DD range, takes priority over maxDays when present
  ...
}

function withinWindow(event, maxDays, dateRange, todayStr) {
  if (dateRange) return event.date >= dateRange.start && event.date <= dateRange.end;
  return event.date >= todayStr && event.date <= /* existing maxDays math */;
}
```

Every existing caller passes neither/only `maxDays` and sees no change at all. The Weekly page passes `dateRange={{start: weekStart, end: weekEnd}}` and no `maxDays`. Since the shared cache itself is still only ever fetched for `today..+30 days` (unchanged, `storage/googleCalendarCache.ts`), a `dateRange` for a past week or a week beyond the 30-day horizon simply yields zero events — the existing "Nothing in this window." empty state already covers that with no new copy needed. This is the concrete shape of the constraint already flagged to Tilman in chat (Google events won't appear for weeks outside the fetch window); nothing new to build for it, it falls out for free.

Needs its own `PAGE_SIZE` constant (§7) — same "one shared component, per-screen page size" convention `googleCalendarProject`/`googleCalendarDaily`/`googleCalendarReview`/`googleCalendarInbox` already follow.

## 6. New UI: `ui/WeeklyFocusPanel.tsx`

A close mirror of `ui/DailyFocusPanel.tsx` (§1), scoped to `weekly` instead of `daily`, with a richer per-item row.

```ts
interface Props {
  items: CachedItem[];
  projectsPath: string;
  areasPath: string;
  weeklyFocusProjectCount: number;
  weeklyFocusAreaCount: number;
  weekStart: string;
  weekEnd: string;
  onOpenItem: (kind: 'project' | 'area', entry: FolderEntry) => void;
  onToggle: (item: CachedItem, value: boolean) => Promise<void>; // WeekView's own handleToggleItemWeeklyFocus, mirroring DailyView's handleToggleItemFocus but scope: 'weekly'
  textColor: string;
  borderColor: string;
}
```

Same three mini-tabs (Focus/Projects/Areas), same arm-and-pick via `FileBrowserPane`/`LinkTarget`, same `MiniTabs` `disabled`-while-armed convention, same "leaving the tab destroys local state, no code needed" reasoning (§6 of the daily-focus-panel design) — all copied structurally, with `dailyFocus`/`dailyFocusProjectCount`/`dailyFocusAreaCount` replaced by `weeklyFocus`/`weeklyFocusProjectCount`/`weeklyFocusAreaCount` throughout, and `entryFilter`'s `activeAndNotFocused` checking `cached.weeklyFocus` instead of `.dailyFocus`.

**The one real difference: `FixedSlotSection`'s row.** Daily's version is name + ✕ only. This panel's Focus tab needs a richer `WeeklyFocusCard` per focused item:

```tsx
function WeeklyFocusCard({item, nextCount, somedayCount, meetingCount, onOpenItem, onRemove, textColor, borderColor}) {
  return (
    <View style={[styles.card, {borderColor}]}>
      <View style={styles.cardHeaderRow}>
        <Pressable style={styles.rowTextWrap} onPress={() => onOpenItem(item.kind, {name: item.name, path: item.path, isFolder: true})}>
          <Text style={[styles.rowText, {color: textColor}]}>{item.name}</Text>
        </Pressable>
        <Pressable onPress={() => onRemove(item)} hitSlop={8}><Text style={styles.cancelText}>✕</Text></Pressable>
      </View>
      <Text style={[styles.cardCounts, {color: textColor}]}>
        {nextCount} Next · {somedayCount} Someday · {meetingCount} {meetingCount === 1 ? 'meeting' : 'meetings'} this week
      </Text>
      {/* V2 (§12): a "Goal: ..." line goes here, tap to edit - deliberately
          not rendered at all in V1 (an empty/placeholder line would just be
          dead space with nothing to say yet). Structuring this as its own
          Text row rather than folding the counts/goal into one line is what
          keeps adding it later a one-line insert, not a card reflow. */}
    </View>
  );
}
```

`nextCount`/`somedayCount`/`meetingCount` come straight from `storage/weeklyAggregate.ts`'s `WeeklyFocusCardData` (§3) — this panel receives the already-built `focusCards` array (or just `items` plus `weekStart`/`weekEnd` and computes inline; either is fine, computing in the aggregate keeps `WeeklyFocusPanel` a pure presentation component like `DailyFocusPanel` already is).

**Per §11.2's decision (hide the panel entirely on non-current weeks) this component is only ever mounted when `WeekView` is showing the real current week** — it does not itself need a "disabled" mode. `WeekView` renders a muted one-line placeholder in its place otherwise (§8).

## 7. New `PAGE_SIZE` constants (`ui/pagination.ts`)

Following the file's own established convention (one named, hand-tuned constant per screen/section, never computed from a setting, retuned on-device later):

```ts
/** Weekly view's meetings column, per-weekday slot (docs/dev/history/technical-design-weekly-view.md §4) - a day with more than this many meetings pages internally rather than growing its slot or scrolling the page. Starting point, same on-device-tuning convention as every constant here. */
weeklyDayMeetings: 3,
/** Weekly view's Google Calendar mini-tab (§5) - independent of every other googleCalendar* constant, same "one shared component, per-screen density" reasoning as those. */
googleCalendarWeekly: 14,
/** Weekly view's Focus panel (§6) - Projects/Areas browse tabs page at this size via FileBrowserRoot.pageSize, same "one flat row budget across all three mini-tabs" reasoning as dailyFocusPanel, sized a bit smaller than weeklyFocusProjectCount+weeklyFocusAreaCount's default sum (5+3=8) would suggest, since this panel's rows are taller (name + counts, not just name). */
weeklyFocusPanel: 5,
```

All three are starting points, flagged in §11 for a real on-device look before finalizing.

## 8. New screen: `screens/WeekView.tsx`

```tsx
const FIXED_INBOX_DESTINATION: Destination = {type: 'inbox'}; // own copy, same convention as DailyView.tsx/ReviewScreen.tsx

const [weekOffset, setWeekOffset] = useState(0); // whole weeks from the real current week; unpersisted, resets to 0 on remount - same "session-only local state, dies on tab-away" convention as DailyFocusPanel's own activeTab/focusArm (App.tsx genuinely unmounts a tab's screen when inactive, so there's nothing to reset by hand)
const anchor = shiftWeeks(new Date(), weekOffset);
const {start: weekStart, end: weekEnd} = weekRangeIso(anchor);
const isCurrentWeek = weekOffset === 0;
```

Layout, top to bottom:

1. **Header row**: `‹` / `Week {isoWeekOf(anchor).week} · {short weekStart}–{short weekEnd}` / `›` — `goPrev`/`goNext` just `setWeekOffset(o => o - 1)`/`setWeekOffset(o => o + 1)`, unbounded (no min/max week - browsing arbitrarily far is harmless, it just increasingly shows "nothing" once local meetings run out and Google's window is exceeded).
2. **Two columns**, same `middleRow`/`column`/`columnLeft`/`columnRight` shape `DailyView.tsx` already uses:
   - **Left**: `<WeeklyMeetingsColumn>` (§4), fed `aggregate.meetings`, `weekStart`, `weekEnd`.
   - **Right**: `<QuickAddWidget fixedDestination={FIXED_INBOX_DESTINATION} onAddTask={handleAddTask} onAddMeeting={handleAddMeeting} initialDate={isCurrentWeek ? undefined : weekStart} .../>` first (mirrors "same QuickAddWidget instance ... first" placement from the now-focus-mode design, and is literally what satisfies "an input widget on the top right" against this screen's own right column), then either `<WeeklyFocusPanel>` (§6, only when `isCurrentWeek`) or a muted one-line placeholder ("Weekly focus applies to the current week.") otherwise.

`initialDate={isCurrentWeek ? undefined : weekStart}` is the concrete answer to the open "what date should a new meeting default to while browsing another week" question from chat: `QuickAddWidget` already defaults `initialDate` to today when omitted (`makeMeetingDraft`'s `initialDate ?? todayIso()`), so passing `undefined` on the current week keeps today's-date-by-default exactly as Daily already behaves, and passing that week's Monday while browsing elsewhere means a meeting added while looking at "next week" lands somewhere sensible in that week rather than defaulting to today (still fully editable either way — this is just the prefill).

`handleAddTask`/`handleAddMeeting`: same shape as `DailyView.tsx`'s own (write straight to Inbox, `saveTasks`/`saveMeetings` + cache write-through) — no new logic, copy the existing pattern.

**Data loading**: same shape as every other cross-project screen — `items` from `getCachedData()?.items ?? []` (rebuilt via the shared `rebuildCache` on mount-if-missing, same fallback `DailyView`/`InboxScreen`/`ReviewScreen` already have), Inbox loaded directly via `loadProjectFile('inbox', basePath)`. `aggregate = buildWeeklyAggregate(items, inbox, basePath, weekStart, weekEnd)`, recomputed whenever `items`/`inbox`/`weekStart`/`weekEnd` change (a plain derived value, not stored state — same "pure transform over the cache" posture `dailyAggregate`/`reviewAggregate` already have, so re-deriving on every navigation is cheap and needs no cache invalidation of its own).

**`onRegisterRefresh`/`onRefreshingChange`**: wired the same way every other screen already does (`rebuildCache(settings)` on tap) — no new mechanism.

`handleToggleItemWeeklyFocus(item, value)`: `focusBlockedReason(items, item.kind, 'weekly', settings)` check before turning on (skip for turning off, same rule `setItemFocus`'s own doc comment states), then `setItemFocus(item, 'weekly', value)`, mirroring `DailyView.tsx`'s `handleToggleItemFocus` exactly with `'weekly'` swapped in for `'daily'`.

## 9. Tab wiring

- `ui/TabBar.tsx`: `AppTab` gains `'week'`; `TABS` array gets `{key: 'week', label: 'Week'}` inserted right after `daily` (Projects, Areas, Daily, **Week**, Inbox, Current, Review, Settings) — same grouping logic already used for Inbox's placement ("flow" tabs grouped together ahead of the more structural tabs).
- `App.tsx`: one new render branch, `{activeTab === 'week' && <WeekView onOpenItem={openItem} onRegisterRefresh={setRefreshHandle} onRefreshingChange={setRefreshing} onOpenCalendarSettings={openSettingsCalendar} />}`, same shape as every other tab branch. No `Mode`/`reorient()` changes — Week is an ordinary tab, not a focus-mode-style full-screen overlay.

## 10. Explicitly unchanged / out of scope

- `storage/focusSlots.ts`, `storage/statusControl.ts`, `storage/dataCache.ts`, `storage/googleCalendarCache.ts`'s fetch/persistence layer, `domain/types.ts`, `domain/settings.ts` — no changes. (`GoogleCalendarPanel.tsx` gets the one additive prop in §5; nothing else in the Google Calendar feature changes.)
- `ReviewScreen.tsx`'s "Week ahead" step and `WeeklyFocusKindSection` — untouched, left exactly as they are (see §11.1).
- Settings screen — no new settings; `weeklyFocusProjectCount`/`weeklyFocusAreaCount`/`googleCalendarIcsUrl` already exist and already surface there.
- No changes to `Task`/`Meeting`/`FrontMatter`/`GtdParaFile` types, and no new frontmatter fields — see §12 for why V2's goal field specifically avoids frontmatter.

## 11. Open questions to confirm before implementation

1. **`WeeklyFocusKindSection` (Review step 7) stays on its older inline-expand pattern, not migrated to the new arm-and-pick `WeeklyFocusPanel`.** Both write through the identical `setItemFocus(item, 'weekly', value)`, so there's no data risk either way — this is purely a UI-consistency question (two different "add to weekly focus" interactions would exist in the app at once, on two different screens). Recommend leaving it alone for this feature (same call `technical-design-daily-focus-panel.md` made for daily focus's own analogous old component) rather than scope-creeping into a Review-screen change; flagging since it's a real, visible inconsistency someone will eventually notice.
2. **Per-day meeting cap** (`PAGE_SIZE.weeklyDayMeetings`, proposed 3) and the **Google mini-tab's page size** (proposed 14) and the **Focus panel's row budget** (proposed 5) are all starting-point guesses pending an on-device look, same as every other `PAGE_SIZE` entry in this codebase.
3. **Exact header/placeholder copy** — "Week 37 · Sep 8–14, 2026" and "Weekly focus applies to the current week." are drafted, not confirmed wording.
4. **Whether the "This week" local-meetings tab should also let Tilman jump straight back to the current week** (a "Today"/"This week" shortcut button) once he's paged a few weeks away, versus only ever stepping one week at a time via `‹`/`›`. Not asked yet; cheap to add either way (`setWeekOffset(0)`) if wanted.

## 12. V2 forward-look: weekly focus goals (not built now)

Per Tilman's explicit request to think this through before starting V1, and his correction after seeing the frontmatter idea: **the goal does not belong in frontmatter.** Looking at the actual file format (`docs/dev/design-overview.md` §2.2, `domain/markdown.ts`), that correction lines up with how this codebase already separates concerns — frontmatter is reserved for short scalar/boolean item-level flags (`kind`/`status`/`dailyFocus`/`weeklyFocus`/`defaultResourceFolder`/`area`), while free-text, potentially-multi-entry content already gets its own `## Heading` span with its own parser (`## Tasks`, `## Meetings`, each with its own `getSpan`/`setSpan`-scoped parse/serialize pair in `markdown.ts`). A per-week goal — free text, one entry per ISO week, growing over time — is a much closer match to that second shape than to a frontmatter scalar.

Concretely, when V2 is actually scoped: a new `## Weekly Goals` span, one line per entry, something like `- 2026-W37: Ship the technical design doc` (mirroring the existing `- YYYY-MM-DD ...` Meetings-line convention's spirit: a leading dated key, then free text), parsed/serialized by a new `parseWeeklyGoalsSpan`/`writeWeeklyGoalsIntoContent` pair in `markdown.ts` following the exact same `getSpan`/`setSpan` pattern `parseTasksSpan`/`parseMeetingsSpan` already use — additive, no change to the Tasks/Meetings parsing at all. The `isoWeekKey()` helper `domain/weekDate.ts` already exports (§2) is what both V1's header and V2's storage key would share, so the two can never disagree on what week something is.

Where V1 already leaves room, so V2 stays additive:
1. `WeeklyFocusCard` (§6) is structured as stacked rows specifically so a goal line is a one-line insert, not a reflow.
2. The add/remove picker (arm-and-pick, §6) stays membership-only — goal editing would be a card-level inline affordance, never routed through the picker.
3. `isoWeekKey()` already exists (§2) for the header, ready to double as V2's storage key.

Explicitly **not resolved now, flagged for V2's own requirements pass**: whether browsing to a past week should show a read-only focus panel built from "which items have a `## Weekly Goals` entry for that week" (using goal-presence itself as the historical membership record, since the plain `weeklyFocus` flag has no history) — and if so, that a past week's card could only ever show *today's* live Next/Someday/meeting counts next to a real historical goal, since there's no task-count snapshot from prior weeks without a much bigger feature. V1 sidesteps this cleanly by simply hiding the focus panel outside the current week (§11.2's confirmed behavior) — V2 can revisit it with full information once the goal feature itself is being designed.

## 13. File-by-file summary

| File | Change |
|---|---|
| `src/domain/weekDate.ts` | **New.** §2 — `weekRangeIso`, `shiftWeeks`, `isoWeekOf`, `isoWeekKey`. |
| `src/storage/weeklyAggregate.ts` | **New.** §3 — `buildWeeklyAggregate`, reusing `dailyAggregate.ts`'s `DailyItemRef`/`inboxItemRef`. |
| `src/ui/WeeklyMeetingsColumn.tsx` | **New.** §4 — MiniTabs(This week / Google), `WeekDayColumn` fixed-slot-with-pagination. |
| `src/ui/GoogleCalendarPanel.tsx` | Additive: optional `dateRange` prop (§5), `maxDays` becomes optional. Every existing caller unaffected. |
| `src/ui/WeeklyFocusPanel.tsx` | **New.** §6 — mirrors `DailyFocusPanel.tsx`, scope `weekly`, richer `WeeklyFocusCard` row. |
| `src/ui/pagination.ts` | Three new `PAGE_SIZE` constants (§7). |
| `src/screens/WeekView.tsx` | **New.** §8 — the screen itself: header/nav, two columns, `QuickAddWidget`, data loading, refresh registration. |
| `src/ui/TabBar.tsx` | New `'week'` `AppTab`, new `TABS` entry (§9). |
| `App.tsx` | One new render branch (§9). |
| `src/storage/focusSlots.ts`, `domain/settings.ts`, `domain/types.ts`, `storage/dataCache.ts`, `storage/googleCalendarCache.ts` | No changes (§10). |
| `src/screens/ReviewScreen.tsx` | No changes (§10/§11.1). |
| `docs/dev/design-overview.md` | Update once implemented, per this project's own "update after implementing" convention (new §2.24 or similar, alongside §2.10/§2.22's existing Focus-feature writeup, cross-referenced from both). |
