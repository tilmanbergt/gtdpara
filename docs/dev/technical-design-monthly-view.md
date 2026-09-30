# Technical design — Month view, monthly focus & goals, meeting length

Status: **IMPLEMENTED** (2026-09-23) - as-built notes in §10; not yet device-tested. Was: approved for implementation (2026-09-23). The open questions in §8 were answered the same day and are folded in. Requirements were settled in chat on 2026-09-23. UI drafts are on the "gtdpara Month view drafts" design canvas (Month view, Month view with a day tapped, Week view, Project page, Meeting edit).

Related docs: `technical-design-weekly-view.md`, `technical-design-weekly-goals.md`, `technical-design-item-goal-display.md`, `technical-design-meeting-tracking.md`, `technical-design-flex-weight-stacking.md`, `design-device-rendering.md`.

---

## 0. Requirements (as decided)

1. **New "Month" tab** (placed after Week). ‹ › moves between months. The screen is split into two columns, like the Week view.
2. **Left column: one row per day** (1–31).
   - Each row shows the day's **highlights** (hand-picked meetings), separated by ` // `.
   - When not all highlights fit, the row ends in `+N`.
   - Weekends are shaded, and a thick rule plus a small week number starts each week.
   - A multi-day meeting shows on every day it covers (`Offsite ▸` / `◂ Offsite ▸` / `◂ Offsite`).
   - Meetings only, never tasks.
3. **Highlight** = the bare tag `#monthly` on the meeting line.
   - The short form is **the trailing bracket in the title**, e.g. `Art of Transformation Session (AoT)`. It can be typed by hand or set from the day panel. Letters and digits only, no spaces.
   - Without a short form, the title is shown (tags stripped).
   - The bracket stays visible in the title everywhere (Daily, Week, project page). Decided: that's fine.
4. **Tapping a day row** turns the right column into the **day panel**.
   - It lists every meeting on that day, from every Project/Area/Inbox.
   - Each meeting has an **M** toggle (same small box as in the meeting widget) and a SHORT field. The field offers the owning item's `abbrev` as a one-tap suggestion.
   - `Done` goes back to the monthly focus panel.
5. **Right column (default): monthly focus panel.**
   - Same UX as the weekly one: Focus | Projects | Areas mini-tabs, arm-and-pick for empty slots, cards with counts and a tap-to-edit goal.
   - Default slots: **3 areas + 2 projects**.
   - Monthly goals are one line per item per month.
   - Past months show a read-only goal history, driven by the goals that were set (same rule as weekly).
   - Editable months: the current month, plus next month during the last 7 days of the current month.
6. **Daily, weekly and monthly focus stay independent.** An item can be in all three. Levels are told apart by **D / W / M badges** everywhere focus shows.
   - Weekly cards show the item's month goal as a second line.
   - Monthly cards show this week's goal as a second line.
7. **Project/Area page:** a third checkbox "Monthly focus", plus a month-goal row under the week-goal row. Both editable, same as weekly.
8. **Meeting length**: no new rows in the Quick Add box (it stays at 4 rows). The time field takes it:
   - `15` → starts 15:00, no end (1 h assumed)
   - `15-16.30` → 15:00–16:30 (`:` or `.` as the minute separator)
   - `1d` → all day. A blank field also becomes `1d`, and `1d` is what gets saved: every meeting line always carries a time, a time range or a day count before the title
   - `2d`, `3d`, … → all day, for 2 or 3 days
   - Length is only shown **in the edit form** (and used by the Month view to cover several days). Daily and Week views show the start time only, as today.
9. **"M" toggle** in the meeting Quick Add box: a small box directly to the left of `+ Add` / `Save`. Filled = `#monthly` is set. It works in both create and edit mode.

---

## 1. What already exists and gets reused

| Existing | Reused for the month |
|---|---|
| `storage/focusSlots.ts` — `FocusScope = 'daily' \| 'weekly'`, `countFocused` / `canAddFocus` / `focusBlockedReason` / `setItemFocus` | Add `'monthly'`. Made table-driven so a scope is one row of config, not a new branch. |
| `domain/settings.ts` `*FocusProjectCount` / `*FocusAreaCount` | Add `monthlyFocusProjectCount = 2` and `monthlyFocusAreaCount = 3`. The Settings screen gets two more rows in `FOCUS_COUNT_FIELDS`. |
| `ui/WeeklyFocusPanel.tsx` (arm-and-pick, cards, `GoalRow`) | Generalized into **`ui/PeriodFocusPanel.tsx`** with a `scope` prop. Week and Month both render it, so the UX is the same by construction. |
| `ui/WeeklyGoalsHistoryPanel.tsx` | Generalized into **`ui/PeriodGoalsHistoryPanel.tsx`** (`scope`, `periodLabel`). |
| `## Weekly Goals` span + `setGoalForWeek` + `WEEKLY_GOAL_LINE_RE` | One generic "keyed goals span" parser/writer in `markdown.ts`, used twice: `## Weekly Goals` (`YYYY-Www`) and `## Monthly Goals` (`YYYY-MM`). |
| Three copies of "save a weekly goal" (`WeekView.handleSaveWeeklyGoal`, `ItemFocusPanel.handleSaveGoal`, `ItemContextBlock.handleSaveGoal`) | Replaced by one `storage/periodGoals.ts` → `saveItemGoal(item, scope, key, text)`. |
| `ui/ItemContextRows.tsx` `ItemGoalRow` (week-only) | Gets a `scope` prop: week or month key, labels, "N weeks/months ago". |
| `storage/weeklyAggregate.ts` | Focus-card building and "goals for period" move into shared functions. `monthlyAggregate.ts` adds only the month-specific part (day rows with multi-day spreading). |
| `WeekView.tsx` meeting handlers (edit / cancel / quick-file / tracking / note / add) | Extracted into a hook **`screens/usePlanningMeetingActions.ts`**, used by `WeekView` and `MonthView` (no second copy). |
| `domain/flowState.ts` `setBareTag` / `hasBareTag` / `RESERVED_BARE_TAGS` | `#monthly` is a bare tag like `#now` / `#prepped`. It's added to the reserved list, so it never shows up as a context tag, in tag chips or in the recent-tags list. |
| `domain/meetingTracking.ts` `meetingDisplayTitle` | Also strips `#monthly`. Every meeting row shows a small **M** marker instead of the raw tag. |
| Flex-weight stacking (`technical-design-flex-weight-stacking.md`) | The 31 day rows are `flex:1` siblings in a bounded box, so they get equal heights and need no pagination. |

---

## 2. Data model

### 2.1 Frontmatter: `monthlyFocus` (plus a signature cleanup)

`project.txt` / `area.txt` frontmatter gets `monthlyFocus: true`, written only when true (same convention as `dailyFocus` / `weeklyFocus`).

**Cleanup done as part of this (recommended, not optional):** `saveFrontMatter` / `updateItemFrontMatter` / `writeFrontMatterIntoContent` take **8–10 positional parameters** (status, dailyFocus, weeklyFocus, extraLines, defaultResourceFolder, area, abbrev). Every new flag has had to be threaded through ~10 call sites, and forgetting one silently clears a value (the documented `area` / `abbrev` pitfall). Adding `monthlyFocus` the same way would repeat that risk.

The call sites are `focusSlots`, `areaAssignment` ×2, `dataCache` ×2, `archive`, `statusControl`, and `ItemDetail` ×2.

New shape:

```ts
// domain/markdown.ts
export interface FrontMatterFields {
  status: ItemStatus;
  dailyFocus: boolean;
  weeklyFocus: boolean;
  monthlyFocus: boolean;
  defaultResourceFolder: string | null;
  area: string | null;
  abbrev: string | null;
  extraLines: string[];
}
export function writeFrontMatterIntoContent(content: string, fm: FrontMatterFields): string;
// parseFrontMatter returns FrontMatterFields (+ same parsing as today, + MONTHLY_FOCUS_LINE_RE)

// storage/dataCache.ts
export function frontMatterOf(item: CachedItem): FrontMatterFields;   // one place that knows the field list
export function updateItemFrontMatter(path: string, rawContent: string, fm: FrontMatterFields): void;

// storage/projectFile.ts
export async function saveFrontMatter(kind, path, rawContent, fm: FrontMatterFields): Promise<string>;
```

Every call site then becomes `saveFrontMatter(kind, path, raw, {...frontMatterOf(item), <the one field it changes>})`, and a future field can't be dropped by accident. `CachedItem` / `ProjectFileState` get the flat `monthlyFocus: boolean`, as their siblings have.

`storage/statusControl.ts` (moving off Active clears focus) clears **all three** flags.

### 2.2 Monthly goals

```
## Monthly Goals
- 2026-10: Finish module 2 outline
- 2026-11: Pilot group started
```

- `domain/types.ts`: `MonthlyGoal {monthKey: string; text: string}`. `WeeklyGoal` is left unchanged, so none of its ~60 references need renaming.
- `domain/markdown.ts`: one private generic `parseKeyedGoalsSpan(content, heading, lineRe)` / `writeKeyedGoalsIntoContent(...)` / `setKeyedGoal(goals, key, text)`.
  - The existing weekly exports become thin wrappers, with no behavior change.
  - New monthly exports: `parseMonthlyGoalsSpan`, `writeMonthlyGoalsIntoContent`, `setGoalForMonth`. `MONTHLY_GOAL_LINE_RE = /^-\s*(\d{4}-\d{2}):\s?(.*)$/`.
  - The section is lazy, as with Weekly Goals: not scaffolded, created on the first save.
- `ProjectFileState` / `CachedItem`: `monthlyGoals`, `monthlyGoalsExtraLines`. `loadProjectFile` parses them. New `saveMonthlyGoals` and `updateItemMonthlyGoals` follow the exact weekly shapes.

### 2.3 Meeting length (end time / days)

`Meeting` gets two fields:

```ts
/** HH:mm end of a timed meeting, '' = no end given (1 h assumed wherever an end is needed). Always '' when time === ''. */
endTime: string;
/** Whole days a date-only meeting covers, >= 1. Always 1 for a timed meeting. */
days: number;
```

**Stored inline, in the time slot of the meeting line** (decided). The slot is **always written**: every meeting line has `HH:mm`, `HH:mm-HH:mm` or `Nd` between the date and the title. Examples:

```
- 2026-10-13 15:00 Weekly call
- 2026-10-13 15:00-16:30 Art of Transformation Session (AoT) #monthly
- 2026-10-07 3d Team offsite (Offsite) #monthly
- 2026-10-07 1d Parents' evening             ← all day (written explicitly)
```

`MEETING_LINE_RE` becomes:

```ts
/^-\s*(?:\[(-)\]\s*)?(\d{4}-\d{2}-\d{2})(?:\s+(?:(\d{2}:\d{2})(?:-(\d{2}:\d{2}))?|([1-9]\d?)d))?\s+(.*)$/
```

- `serializeMeetingLine` always writes one of `HH:mm`, `HH:mm-HH:mm` or `Nd` (N ≥ 1). A date-only meeting is written as `1d`.
- The slot stays **optional in the parser**, so existing lines without it still load, and are read as `1d`.
- **One-time migration, no separate step:** the next time a file's Meetings span is saved (any meeting add/edit in that Project/Area/Inbox), the whole span is rewritten, so every date-only line in it gets `1d`. That shows up once as a diff in Obsidian and is harmless.
- This regex is the only meeting-line parser in the code (checked). Old app builds would read `3d` / `-16:30` as part of the title, but nothing is lost.
- Edge case, **old lines only**: an existing line without a slot whose title starts with e.g. `3d printing…` would read as 3 days. New lines are unambiguous (`- 2026-10-07 1d 3d printing workshop`).

Why not a `#len:` tag: the time slot is where a human reading the file expects it. `15:00-16:30` is plain and needs no knowledge of tags. The tag regex also can't hold `1.5`.

### 2.4 Highlight tag + short form

- `#monthly` is a bare tag (`setBareTag` / `hasBareTag`). Add `'monthly'` to `RESERVED_BARE_TAGS`.
- The **short form** is the last `(Token)` at the end of the title, ignoring trailing tags. `Token` = `[A-Za-z0-9]+`. A bracket containing spaces is not a short form, so the full title is shown.
- Month label = short form, or else `meetingDisplayTitle` with all tags stripped.

New pure module `domain/monthHighlight.ts`:

```ts
export const HIGHLIGHT_TAG = 'monthly';
export function isHighlight(m: Pick<Meeting,'tags'>): boolean;
export function setHighlight(title: string, on: boolean): string;        // setBareTag
export function shortFormOf(title: string): string | null;               // /\(([A-Za-z0-9]+)\)\s*$/ on stripAllTags(title)
export function setShortForm(title: string, short: string | null): string; // replaces/removes the trailing (…) before any trailing tags
export function isValidShortForm(s: string): boolean;                    // /^[A-Za-z0-9]{1,12}$/
export function monthLabel(m: Meeting): string;                          // shortForm ?? stripAllTags(title).trim()
```

---

## 3. Domain helpers

### 3.1 `domain/period.ts` (new): one place for week/month arithmetic

```ts
export type PeriodScope = 'weekly' | 'monthly';
export interface Period { scope: PeriodScope; key: string; start: string; end: string; }

export function periodOf(scope: PeriodScope, now: Date): Period;          // week: weekRangeIso+isoWeekKey; month: 1st..last, "YYYY-MM"
export function shiftPeriod(scope: PeriodScope, now: Date, n: number): Date; // shiftWeeks / new Date(y, m+n, 1)
export function canEditPeriod(scope: PeriodScope, offset: number, today: Date): boolean;
//   weekly : offset 0, or offset 1 when today is Fri/Sat/Sun   (moved here from WeekView.tsx, unchanged)
//   monthly: offset 0, or offset 1 when today is within the last 7 days of its month
export function periodsBetween(scope: PeriodScope, a: string, b: string): number; // weeksBetween / month diff
export function periodLabel(scope: PeriodScope, key: string): string;    // "Week 41" / "October"
export function monthKeyOf(date: Date): string;                           // "2026-10"
export function monthOfWeek(weekStart: string): string;                   // month containing the week's Thursday (ISO rule) - for the weekly card's month-goal line
```

`weekDate.ts` stays as it is. `period.ts` builds on it.

### 3.2 `domain/meetingTime.ts`: the flexible time field

```ts
export interface MeetingWhen { time: string; endTime: string; days: number; }

/** '' (= 1d) | 15 | 15:30 | 15.30 | 15-16.30 | 15:00 - 16:30 | 1d | 3d */
export function parseMeetingWhen(input: string): {ok: true; value: MeetingWhen} | {ok: false; error: string};
export function formatMeetingWhen(w: MeetingWhen): string;   // "1d", "3d", "15:00", "15:00-16:30"  (edit-field prefill)
export function meetingEndMs(m: Pick<Meeting,'date'|'time'|'endTime'|'days'>): number;
```

- `parseFlexibleTime` also accepts `.` as the separator (`16.30`).
- Errors: "End must be after start"; days must be 1–60. `Nd` combined with a time is rejected ("Use either a time or days").
- `validateMeetingFields(title, date, time)` returns `{ok, when: MeetingWhen}` instead of `{ok, time}`.

**Decided:** `meetingAutoUpdateCutoffMs` (note freeze, and the switch from prep to review) uses the real end once one exists (via `meetingEndMs`):

- timed with `endTime` → the end time
- timed without one → start + 1 h, as today
- date-only → end of the **last** covered day

Existing meetings behave exactly as before.

### 3.3 Quick Add fields and one shared "apply edit"

`MeetingQuickAddFields` becomes `{title, date, when: MeetingWhen}`.

Today, **10 call sites across 5 screens** copy `title` / `date` / `time` into a Meeting by hand (DailyView, InboxScreen, ProjectDataPanel, ReviewScreen, WeekView: `commitMeetingEdit` + `handleQuickFileEdit` each).

New shared helper in `storage/itemMutations.ts`, next to `buildMeeting`:

```ts
export function applyMeetingEdit(m: Meeting, f: MeetingQuickAddFields, linkedFile: string): Meeting;
// = {...m, title, date, time: when.time, endTime: when.endTime, days: when.days, ...deriveMeetingFields(title), linkedFile}
```

All 10 sites switch to it. Future meeting fields then need one change, not ten. `buildMeeting` sets `endTime` / `days` from `when`, and so does `googleCalendarCopy.buildMeeting` (defaults `''` / `1`).

---

## 4. Storage / aggregation

### 4.1 `storage/focusSlots.ts`: table-driven scopes

```ts
export type FocusScope = 'daily' | 'weekly' | 'monthly';
const SCOPES: Record<FocusScope, {field: 'dailyFocus'|'weeklyFocus'|'monthlyFocus';
  project: keyof GtdParaSettings; area: keyof GtdParaSettings; label: string}> = {...};
```

- `setItemFocus(item, scope, value)` becomes `saveFrontMatter(..., {...frontMatterOf(item), [SCOPES[scope].field]: value})`.
- New `toggleItemFocus(items, item, scope, value, settings)`: checks the limit, then saves. It replaces `DailyView.handleToggleItemFocus` / `WeekView.handleToggleItemWeeklyFocus` / `ItemFocusPanel.toggleFocus`, three copies of "check `focusBlockedReason`, throw, `setItemFocus`".

### 4.2 `storage/periodGoals.ts` (new)

```ts
export interface PeriodGoal { key: string; text: string; }
export function goalsOf(item: CachedItem, scope: PeriodScope): PeriodGoal[];
export function goalFor(item: CachedItem, scope: PeriodScope, key: string): string | null;
export async function saveItemGoal(item: CachedItem, scope: PeriodScope, key: string, text: string): Promise<void>;
//   re-fetches fresh from cache (findCachedItem), setGoalFor{Week|Month}, save{Weekly|Monthly}Goals, update cache
export function findGoalsForPeriod(items: CachedItem[], scope: PeriodScope, key: string): GoalHistoryEntry[];
//   = today's findWeeklyGoalsForWeek, generalized; cache-only, no file scan
```

### 4.3 Shared focus cards (`storage/periodFocusCards.ts`, pulled out of `weeklyAggregate.ts`)

```ts
export interface PeriodFocusCardData {
  item: CachedItem;
  nextCount: number; somedayCount: number;
  meetingCount: number;          // weekly: meetings in range; monthly: #monthly highlights in range
  goal: string | null;           // this period's goal
  secondaryGoal: {label: string; text: string} | null;
  //   weekly card : item's month goal for monthOfWeek(start)          (label "Oct")
  //   monthly card: item's goal for the REAL current week, only when viewing the current month (label "W40")
}
export function buildPeriodFocusCards(items, period: Period, today: Date): PeriodFocusCardData[];
```

`buildWeeklyAggregate` calls it, so its output is unchanged apart from the new `secondaryGoal`.

### 4.4 `storage/monthlyAggregate.ts` (new)

```ts
export interface MonthDayEntry { entry: WeeklyMeetingEntry; label: string; part: 'single'|'first'|'middle'|'last'; }
export interface MonthDay { date: string; weekday: number; isoWeek: number | null /* set on Mondays */; highlights: MonthDayEntry[]; }
export interface MonthlyAggregate {
  days: MonthDay[];                         // 28..31 entries
  highlightCount: number;
  focusCards: PeriodFocusCardData[];
  historicalGoals: GoalHistoryEntry[];
}
export function buildMonthlyAggregate(items, inbox, basePath, period: Period, today: Date): MonthlyAggregate;
export function meetingsOnDay(items, inbox, basePath, date: string): WeeklyMeetingEntry[]; // day panel: ALL meetings covering `date`
```

- A meeting covers `date` … `date + days − 1`. The scan includes meetings that start up to 60 days before the month, so an offsite starting Sep 29 still shows on Oct 1–2.
- Cancelled meetings are excluded.
- Within a day, order is timed first (by time), then date-only.
- Everything is computed from the warm cache, with no I/O, same as every other aggregate.

---

## 5. UI

### 5.1 `ui/QuickAddWidget.tsx` (still 4 rows)

- **Time field** (meeting row 3):
  - Placeholder `15 · 15-16.30 · 2d`. The field starts EMPTY for a new meeting (Tilman, 2026-09-23: most meetings get a time); a blank field is saved as `1d`. Editing an existing date-only meeting shows `1d`.
  - Edit prefill uses `formatMeetingWhen`.
  - Width 70 → **~100 px**, so `15:00-16:30` fits at `FONT.small`. `MEETING_TAG_CAPACITY` 6 → 5 if tag chips overflow (tune on device).
  - Validation errors show in the existing centre text of row 4.
- **M toggle** (row 4, `actionsRight`, directly left of `+ Add` / `Save`):
  - A 32×32 box with the letter M, filled when on.
  - Meeting type only; hidden for Todo and Note.
  - State: `meetingDraft.monthly` / `editFields.fields.monthly`. On entering edit it is initialized from `hasBareTag(tags,'monthly')`, and `#monthly` is **stripped from the title field** (like `setDueTag` for tasks, the tag is composed at save): `title = setHighlight(title, monthly)`.
  - "New from this" does not copy M. Highlights are hand-picked.
- New optional prop `initialMonthly?: boolean`, so a create from the Month day panel starts with M on.

### 5.2 `ui/MeetingRow.tsx`

The same small **M** box as the widget toggle (filled, about 18×18 at `FONT.small`, not tappable in lists) in front of the time for `isHighlight(meeting)`, on every meeting row app-wide (Daily, Inbox, project page, Week, Review, Month day panel; compact and normal). `meetingDisplayTitle` already hides the tag. One shared `ui/HighlightMark.tsx` renders it for rows, and a larger tappable version is used in the widget and the day panel, so the three always look alike. The meeting row's width allowance grows by the mark's width only for highlighted rows (like the tracking icon's allowance).

### 5.3 `ui/FocusBadges.tsx` (new)

`<FocusBadges item scopes={['daily','weekly','monthly']} active="monthly" />` shows the D / W / M boxes (24×22, bold 13), filled for the level of the current view. It is used in `PeriodFocusPanel` cards and `ItemFocusPanel` checkboxes. `DailyFocusPanel` rows can use it later if wanted.

### 5.4 `ui/PeriodFocusPanel.tsx` (from `WeeklyFocusPanel.tsx`)

A rename plus parameterization:

- Props gain `scope`, `period` (key + label) and `projectLimit` / `areaLimit`. They replace `weekKey` and `weeklyFocus*Count`.
- The "not yet focused" filter reads `SCOPES[scope].field`.
- Cards: name + `FocusBadges`, counts line (`meetings` / `highlights` by scope), goal row, then `secondaryGoal` as a dim line.
- Section order is Areas first for monthly (defaults 3 A / 2 P) and unchanged for weekly.
- `WeeklyFocusPanel.tsx` is deleted, and WeekView imports the new file.

### 5.5 `ui/PeriodGoalsHistoryPanel.tsx` (from `WeeklyGoalsHistoryPanel.tsx`)

`scope` + `periodLabel` props. Empty text: "No monthly goals were recorded for October 2026".

### 5.6 `ui/ItemContextRows.tsx` `ItemGoalRow`

- New `scope` prop (default `'weekly'`, so Review's `ItemContextBlock` is unchanged).
- Uses `period.ts` for the current key and "Last goal (October, 1 month ago)".
- Placeholder "Goal for this month".

### 5.7 `ui/ItemFocusPanel.tsx` (Project/Area page)

- Three checkbox rows, each with its badge and slot count ("2 / 2 projects"): Daily, Weekly, Monthly.
- Two goal rows: `ItemGoalRow scope="weekly"`, then `ItemGoalRow scope="monthly"`.
- Toggles go through `toggleItemFocus`, and saves go through `saveItemGoal`.
- The added height is about 40 px (checkbox) + about 40 px (goal row). The Files pane below self-measures, so it just gets shorter.

### 5.8 `ui/MonthDaysColumn.tsx` (new)

- 28–31 `flex:1` rows in the bounded `columnScroll` box. On the A5X that is about 46 px per row, with no paging.
- Row: `Th 01` (bold, 64 px) · labels joined with `  //  ` (`numberOfLines={1}`) · `+N` chip · week number (Mondays only).
- `+N`: the labels are packed greedily against the row's measured width using `ui/textLineEstimator.ts`, and the rest are counted. `onLayout` gives the width.
- Weekend background `#efefea`. Monday gets `borderTopWidth: 3`. The selected day is inverted (black background, white text).
- Tapping a row calls `onSelectDay(date)`.

### 5.9 `ui/MonthDayPanel.tsx` (new)

- Header: full date (`formatFullDate`) and a `Done` button.
- MiniTabs `Meetings (n) | Google (n)`. The Google tab is `GoogleCalendarPanel` with `dateRange={date..date}`; copying works as today, and the copy dialog gets an **M** toggle if it fits. End time and day count are taken over from Google (step 10).
- Rows: **M** toggle (48×48 touch area, same look as the widget's) · time / "all day" / "2/3" · title · source item (name/abbrev) · SHORT field (only when starred).
  - The SHORT field is a `ClipboardTextInput` of about 96 px. Save on blur or submit runs `setShortForm`. Invalid input shows an inline error.
  - When SHORT is empty and the item has an `abbrev`, a `use (AoT)` chip is shown.
- Tapping a row's title puts that meeting in edit mode in the Quick Add box above (decided: the Quick Add box stays on top of the right column in the Month view, as in Week).
- Mutations go through the shared hook's `saveEntryMeetings` (§5.10).

### 5.10 `screens/usePlanningMeetingActions.ts` (new hook, extracted from WeekView)

It returns:

- `inbox` / `basePath` / `settings` / `paths` / `loading` / `error` / `load`
- `editingKey` / `startMeetingEdit` / `cancelEdit` / `editingEntry(entries)`
- `commitMeetingEdit` / `handleCancelMeeting` / `handleQuickFileEdit` / `handleToggleMeetingTracking` / `handleMeetingNote` / `onOpenLinkedFile`
- `handleAddTask` / `handleAddMeeting`
- `toggleHighlight(entry)` / `setShortForm(entry, s)`
- `toggleFocus(scope)` / `saveGoal(scope)`
- `widgetError` / `meetingsActionError`

WeekView shrinks accordingly: it keeps its header, columns and render functions. MonthView is mostly layout.

### 5.11 `screens/MonthView.tsx` (new)

- Header: ‹ `October 2026` › and "16 highlights".
- Left column: MiniTabs `Month | Google`. Google = `GoogleCalendarPanel` with the month range and `PAGE_SIZE.googleCalendarMonthly` (new, 14). Month = `MonthDaysColumn`.
- Right column: `QuickAddWidget`, then one of:
  - `selectedDay` set: `MonthDayPanel`
  - `canEditPeriod('monthly', offset)`: `PeriodFocusPanel scope="monthly"`
  - otherwise: hint + `PeriodGoalsHistoryPanel scope="monthly"`
- The Quick Add `initialDate` is the selected day if there is one, otherwise the 1st of a non-current month.
- `monthOffset` is plain `useState(0)`, as in WeekView. `selectedDay` resets on month change.

### 5.12 Navigation

- `ui/TabBar.tsx`: `AppTab` gets `'month'`. `TABS` gets `{key:'month', label:'Month'}` after Week, for 9 tabs in total.
- `App.tsx`: one render branch, the same props as `WeekView`.

---

## 6. Screen budget (A5X, 1404×1872)

Left column: 1872 − 80 (tab bar) − ~64 (header) − ~44 (MiniTabs) − ~40 (paddings) ≈ **1644 px**.

- 31 rows plus 4 week rules (3 px each) → **~52 px per row**. That's comfortable; the Week view's compact rows are 38 px, and 31 rows × 38 px would also fit.
- February (28 rows) just gets taller rows.

Right column, with the day panel open:

- Quick Add ≈ 162 px
- Header ≈ 60 px
- MiniTabs ≈ 44 px
- 64 px per meeting row

About 18 rows fit, and the panel pages via `PagedSection` in the rare case more do.

---

## 7. Implementation steps

Each step ends with `tsc --noEmit` in the scratch project (0 new errors versus the 16 known), the Jest `<App/>` smoke render, a commit to the device, and a re-stage plus md5 check of every committed file (standing rule).

| # | Step | Files | Notes |
|---|---|---|---|
| 1 | **Frontmatter object refactor + `monthlyFocus`** | `domain/markdown.ts`, `storage/projectFile.ts`, `storage/dataCache.ts`, `storage/focusSlots.ts` (table-driven, `'monthly'`, `toggleItemFocus`), `storage/statusControl.ts`, `storage/areaAssignment.ts`, `storage/archive.ts`, `screens/ItemDetail.tsx`, `domain/settings.ts`, `screens/Settings.tsx` (2 rows) | Pure refactor + 1 flag. Check with a hand-made project.txt round-trip (all fields survive a focus toggle). |
| 2 | **`domain/period.ts`** | new; `WeekView.tsx` uses `canEditPeriod('weekly', …)` | No behavior change for Week. |
| 3 | **Monthly goals storage + `periodGoals.ts`** | `domain/types.ts`, `domain/markdown.ts` (generic keyed span), `storage/projectFile.ts`, `storage/dataCache.ts`, new `storage/periodGoals.ts`; migrate `WeekView` / `ItemFocusPanel` / `ItemContextBlock` to `saveItemGoal` | Weekly goals must round-trip byte-identically. |
| 4 | **Meeting length** | `domain/types.ts`, `domain/markdown.ts` (regex + serialize), `domain/meetingTime.ts` (`parseMeetingWhen` / `formatMeetingWhen` / `meetingEndMs`, `.` separator, `validateMeetingFields`), `storage/itemMutations.ts` (`buildMeeting`, `applyMeetingEdit`), `storage/googleCalendarCopy.ts`, `ui/GoogleCalendarPanel.tsx` (literal), the 5 screens' 10 apply sites, `QuickAddWidget` time field | Unit-check the parser table in §0.8 in the scratch project. `meetingAutoUpdateCutoffMs` switches to `meetingEndMs` (decided). Serializer always writes the slot (`1d` for date-only). |
| 5 | **Highlight tag + short form + M toggle + M row marker** | `domain/flowState.ts` (reserved), `domain/meetingTracking.ts` (`meetingDisplayTitle`), new `domain/monthHighlight.ts`, `ui/QuickAddWidget.tsx` (M toggle, strip/compose, `initialMonthly`), new `ui/HighlightMark.tsx`, `ui/MeetingRow.tsx` (M marker + width allowance) | Usable in Week/Daily straight away, before the Month tab exists. |
| 6 | **Shared focus UI** | new `ui/FocusBadges.tsx`; `WeeklyFocusPanel` → `ui/PeriodFocusPanel.tsx`; `WeeklyGoalsHistoryPanel` → `ui/PeriodGoalsHistoryPanel.tsx`; `ItemGoalRow` `scope`; new `storage/periodFocusCards.ts`; `weeklyAggregate.ts` uses it; `WeekView` switched over | Week view looks the same plus badges and the month-goal line. |
| 7 | **`usePlanningMeetingActions` hook** | new `screens/usePlanningMeetingActions.ts`; `WeekView.tsx` slimmed down | Pure extraction; Week behavior must stay unchanged (manual on-device check of edit / cancel / quick-file / note / tracking). |
| 8 | **Month tab** | new `storage/monthlyAggregate.ts`, `ui/MonthDaysColumn.tsx`, `ui/MonthDayPanel.tsx`, `screens/MonthView.tsx`; `ui/TabBar.tsx`, `App.tsx`, `ui/pagination.ts` (`googleCalendarMonthly`) | |
| 9 | **Project page** | `ui/ItemFocusPanel.tsx` (monthly checkbox, badges, month goal row, `toggleItemFocus`) | |
| 10 | **Google end time / length on copy** (decided: in scope) | `domain/googleCalendarEvent.ts` (`endTime`, `endDate`), `domain/icsParser.ts` (DTEND / DURATION), `storage/googleCalendarCopy.ts` | Timed events get their end time; all-day events get `Nd` (DTEND is exclusive for all-day events, so N = DTEND − DTSTART in days). The dedup key (title+date+time) is unchanged. |
| 11 | **Docs** | `docs/dev/design-overview.md` §2/§4/§5, `docs/dev/design-device-rendering.md` (Month row budget after the first on-device screenshot), this doc's status → as-built | |

Steps 1–5 are each self-contained and can be tested on the device without the Month tab. Step 5 already lets you star meetings from Week/Daily.

### On-device test checklist (after step 8/9)

1. Time field: blank (→ `1d`), `15`, `9.30`, `15-16.30`, `15:00 - 16:30`, `1d`, `3d`, `16-15` (error), `3d` + time (error). Reopen in edit and check the prefill. Check the project.txt line. Check that an old file's date-only lines gain `1d` after one edit and nothing else changes.
2. The M toggle in create and edit writes and removes `#monthly`. The title field never shows `#monthly`. The M marker appears in the Daily, Week, Inbox, Review and project lists.
3. Month: a 3-day offsite across a week boundary and a month boundary; `+N` on a crowded day; February; a month starting on Sunday.
4. Day panel: star/unstar; SHORT `AoT` writes `(AoT)`; clearing SHORT removes it; `Birthday Peter` is rejected; the `use (abbrev)` chip.
5. Monthly focus: slot limits (3 A / 2 P); arm-and-pick; goal edit; next month editable only during the last 7 days; past month shows read-only history.
6. Project page: 3 checkboxes, 2 goal rows. Setting status to On Hold clears all three focus flags.
7. Regression: Week view focus/goals, Review's `ItemContextBlock` goal, and the Daily focus panel behave as before.

---

## 8. Open questions

All answered 2026-09-23:

- **Q1 storage of length:** inline in the time slot, and the slot is always written (`1d` for date-only meetings).
- **Q2 meeting end:** yes, prep→review switching and note freezing use the real end when one is given.
- **Q3 marker in lists:** yes, in every meeting list, as the same small **M** box as the widget toggle (not ★).
- **Q4 Quick Add in the Month view:** yes, it stays on top of the right column; the day panel / focus panel sits below it.
- **Q5 Google:** yes, end time and day count are taken over on copy (step 10 is in scope).

## 9. Out of scope (for now)

- Monthly focus/goals in the weekly Review steps.
- D/W/M badges in the Projects/Areas list tab.
- Recurring highlights.
- Showing length in the Daily/Week views (decided: edit form only).

## 10. As-built notes (2026-09-23)

Implemented in one pass, all steps 1–10. Verification: `tsc --noEmit` over the whole project (0 new errors; 2 of the 6 pre-existing ones are gone), ESLint (no new errors; only the codebase's usual `curly`/prettier warnings), a node round-trip of the file format (meeting slots, goals spans, frontmatter), and Jest/react-test-renderer: the monthly aggregate (multi-day spill-in from the previous month, `+N`, week numbers, focus-card goals), renders of MonthDaysColumn / MonthDayPanel / QuickAddWidget (edit prefill `10:00-11:30`, `#monthly` hidden from the title field) / MeetingRow / PeriodFocusPanel / PeriodGoalsHistoryPanel, and mounts of App, WeekView, MonthView and ItemFocusPanel. **Not yet device-tested.**

Deviations from / details beyond the design:

- Hook file is `screens/usePlanningScreen.ts` (not `usePlanningMeetingActions.ts`); it also holds `useLinkedFileMissing`.
- `ui/WeeklyFocusPanel.tsx` and `ui/WeeklyGoalsHistoryPanel.tsx` are now empty stub modules (nothing imports them) - **delete them** on the PC; the cloud session can't delete device files.
- Quick Add: time field 70 → 110 px and meeting tag-chip capacity 6 → 5 (tune on device). A create draft that is still empty now follows a changed `initialDate`/`initialMonthly` (the Month day panel retargets it; Week benefits too).
- `ItemDetail`, `ItemStatusPanel` and `ItemFocusPanel` now take the item **fresh from the cache** for every frontmatter/goal write instead of their own possibly-stale snapshot (previously a status change after a focus toggle on the same screen could, in principle, restore an old flag).
- Google copy (step 10): a timed event crossing midnight gets no end time (not representable); an all-day event without DTEND counts as 1 day. The day panel's Google copy doesn't set M automatically.
- `## Monthly Goals` added to the integrity check's recognized headings.
- Month day rows use the shared text-width estimator to decide how many labels fit before `+N`; tune if labels get clipped on the device.

### 10.1 Follow-up (2026-09-23, same day)

- **Google copy from the Month view = highlight.** `GoogleCalendarPanel` got a `copyAsHighlight` prop (both Google tabs on the Month screen pass it); `buildMeetingFromEvent(event, {highlight})` adds `#monthly` and now derives the meeting's tags from its title. The "already copied" check compares on the displayed title (`meetingDisplayTitle`), so `#monthly`/`#prepped`/`#reviewed` added later no longer make a copied event look new.
- **Multi-day meetings in Daily and Week.** Supersedes §0.8's "Daily and Week views show the start only": a date-only meeting with `days > 1` is now listed on every covered day in Daily (Today/Tomorrow) and Week, with the Month view's arrows ("Offsite ▸", "◂ Offsite ▸", "◂ Offsite"). Timed meetings still show their start time only. One shared module `domain/meetingSpan.ts` (`coveredDaysIn`, `entriesInRange`, `entryDate`, `withSpanArrows`) now serves all three views; meeting entries carry an optional `span` for the covered day, `MeetingRow` takes it (`span` prop: date prefix + arrows), and `WeeklyMeetingsColumn`/`DailyView` bucket by `entryDate`.
- Focus-card meeting counts now count meetings that *touch* the period (a 3-day offsite starting the Sunday before still counts for the new week/month).
