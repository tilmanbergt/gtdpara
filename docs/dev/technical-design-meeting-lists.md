# Technical design — unified meeting lists

Status: **technical design, 2026-09-29** — steps 1–6 implemented 2026-09-29 (see §9), steps 7–10 open.
Requirements: `docs/dev/design-meeting-lists.md` (inventory, use cases) plus the decisions below. UI draft: design canvas
"gtdpara Meeting Lists — unified components" (calibrated at 1 dp = 1.41 px).

---

## 0. Decisions (Tilman, 2026-09-27 … 29)

1. One meeting row component, two layouts: **1-line (37 dp)** and **2-line (57 dp)**, switchable per list from the
   list header, **remembered per list for the session only**.
2. Defaults: **day lists 2-line** (Daily, Week/Month day panel, Review close-out); **everything else 1-line**.
3. **No file linking on Daily/Week/Month** — a row there only *opens* a linked file. Linking (+📎) stays where a Files
   pane exists (Project, Inbox, Review-inbox). "+📓" (note) is available everywhere.
4. **Short form = any trailing bracket** in the title. The SHORT field and "use (AoT)" chip go away.
5. **Week overview = grid of chips**: weekdays 4 rows × 2 columns, weekend 2 × 2, filled column-first, per-day paging.
   A chip shows time + short form (else title); highlight = bold; no date, source, tracking, note or file.
   Tap chip → day panel on the right + that meeting in Quick Add edit mode. Tap day header → day panel only.
   Tapping a chip of another day while the panel is open switches day and edit target.
6. **Day panel shared by Daily, Week and Month** (Daily: tabs Today | Tomorrow | Google, no Close).
7. **M (highlight)** is shown **only in 2-line rows** (read-only mark in Daily/Project-type lists, tappable toggle in the
   Week/Month day panel). 1-line rows show no M.
8. Date format in 1-line rows of multi-day lists: **`29.9. 10:00`** (today's `meetingDatePrefix`, no weekday).
9. **Review "week ahead" = the Week screen itself** (same component, same behaviour), technically as simple as possible.
10. Week chips: no tracking icons. Daily focus mode "Coming up": 1-line. Week drops the "Focus" label above Quick Add.
    Empty weekday: empty grid, no "No meetings." hint.

## 1. Calibration finding: 1 dp = 1.41 px

Tilman's Week/Month screenshots (2026-09-29) prove the A5X renders at **Android density ≈ 1.41** (226 PPI / 160):
the Month day panel's `height: 76` rows measure 107 px, Week's compact rows (34 dp) measure 47 px, 16 dp padding
measures 23 px. `docs/dev/design-device-rendering.md` §1 ("1 dp = 1 px") is wrong. Consequences:

- The screen is **≈ 994 × 1325 dp**; a two-column content column is **≈ 473 dp**, not 678.
- Code constants that were *measured in px* but are used as dp are ~41 % too large:
  `COLUMN_WIDTH_PX = 678` (DailyView, InboxScreen, ProjectDataPanel — drives `meetingRowLines`/`taskRowLines`
  line estimation, so titles wrap more often than predicted), and DailyView's kept-but-unused `GLOBAL_CHROME_PX`,
  `QUICK_ADD_WIDGET_PX`, etc.
- Week today shows 3 rows because each weekday block is ~176 dp, its PagedSection header ~36 dp, and pagination
  budgets 38 dp per row while rows render at ~33 dp.

**In this change:** meeting rows get fixed heights (no line estimation), so meeting lists no longer depend on
`COLUMN_WIDTH_PX`. The constant itself is corrected to **473** in the three screens (it still drives *task* row
estimation — that correction makes task wrapping predictions more conservative, i.e. safer). `design-device-rendering.md`
§1/§2/§5 get a correction note and the dp/px table (step 10).

## 2. New and changed building blocks

### 2.1 `domain/meetingDisplay.ts` (new, pure)

```ts
export type MeetingTimeMode = 'time' | 'dateTime';
export interface MeetingTimeCell { line1: string; line2: string }   // line2 used by 2-line only
export function meetingTimeCell(meeting: Meeting, span: MeetingSpanDay | undefined,
                                mode: MeetingTimeMode, now?: Date): MeetingTimeCell;
export function meetingChipLabel(meeting: Meeting, span?: MeetingSpanDay): string; // short form ?? plain title, with span arrows
export function meetingTitleParts(meeting: Meeting): {text: string; contextTags: string[]};
```

`meetingTimeCell` rules (one place instead of five):

| case | mode `time` (day lists) | mode `dateTime` (multi-day lists) |
|---|---|---|
| timed, with end | `10:00` / `–11:30` | 1-line `29.9. 10:00`; 2-line `29.9.` / `10:00–11:30` |
| timed, no end | `10:00` / `` | `29.9. 10:00`; 2-line `29.9.` / `10:00` |
| all day, 1 day | `all day` / `` | `29.9.` / `all day` |
| multi-day, day n/m | `all day` / `day 2/3` | `30.9.` / `day 2/3` |

Date prefix = `meetingDatePrefix` (empty for today, as today). The 1-line renderer uses `line1` only; for `dateTime`
1-line the function returns the combined string in `line1`.

~~`meetingTitleParts`~~ — dropped during implementation: some meetings are titled by a tag alone ("#Daily",
"#JFMieke"), so moving tags to line 2 would leave line 1 empty. Tags stay inline in the title in both layouts (still
tappable for Daily's context filter); line 2 of a 2-line row is the source name only.

### 2.2 `domain/monthHighlight.ts` (changed)

- `TRAILING_SHORT_FORM_RE` → `/\s*\(([^()]{1,40})\)\s*$/` — any bracket content (spaces, umlauts, punctuation), trimmed.
- `setShortForm`, `isValidShortForm`, `SHORT_FORM_TOKEN` are deleted (only MonthDayPanel/usePlanningScreen use them).
- `monthLabel` unchanged in behaviour (now benefits from the relaxed regex).

### 2.3 `ui/MeetingRow.tsx` (rewritten, same file)

```ts
interface MeetingRowProps {
  meeting: Meeting;
  span?: MeetingSpanDay;
  layout: 'oneLine' | 'twoLine';
  time: MeetingTimeMode;
  /** oneLine: '#abbrev' at the end (tappable); twoLine: full name on line 2 (tappable). Omit for single-item lists. */
  source?: {abbrev: string; name: string; onPress: () => void};
  /** twoLine only. 'mark' = read-only M, 'toggle' = tappable 30 dp box. Ignored for oneLine. */
  highlight?: 'mark' | 'toggle';
  onToggleHighlight?: () => void;
  tracking?: MeetingTrackingConfig;           // unchanged type
  note?: {onOpen: () => void; onCreate: () => void};
  file?: {linkedFile: string; onOpen: (f: string) => void; onArm?: () => void};  // onArm only where a Files pane exists
  onPress?: () => void;                        // edit (most lists) or select (Review close-out)
  state?: 'editing' | 'arming' | 'selected' | 'done';
  contextTag?: string | null; onToggleContext?: (tag: string) => void;          // Daily only, as today
  textColor: string; borderColor: string;
}
export const MEETING_ROW_HEIGHT = {oneLine: 37, twoLine: 57} as const;
```

- Fixed heights → `meetingRowHeight/meetingRowLines/meetingEntryHeight/meetingRowSizing`, `NORMAL_*`, the
  `compact` variant and the `height`/`numberOfLines` props are **deleted**. Every caller passes
  `rowHeight={() => MEETING_ROW_HEIGHT[layout]}` (headers keep their own height).
- Time column: fixed width per mode/layout (`time` 58 dp; `dateTime` 1-line 104 dp, 2-line 96 dp) so times line up.
- `state` replaces `isEditing`/`isArming`: editing = 4 dp solid left bar (today's look), arming = dashed bar,
  selected = bar + light grey, done = greyed + "✓ ".
- Every action is optional → the read-only Review usages simply pass none (fixes the prop-less call in
  `DoneOnHoldDetail`).

### 2.4 `ui/listLayout.ts` (new) — session-only layout memory

```ts
export type MeetingListId = 'daily' | 'dayPanel' | 'focusComingUp' | 'project' | 'inbox' | 'reviewInbox' | 'reviewCloseOut';
export function useListLayout(id: MeetingListId, fallback: 'oneLine'|'twoLine'): ['oneLine'|'twoLine', (l) => void];
```

A module-level `Map` plus a tiny subscribe/notify (same pattern as the Google calendar loading state) — survives tab
switches and remounts, resets when the plugin process restarts. No settings file changes. `dayPanel` is shared by
Daily, Week, Month and Review-week-ahead, so switching it once applies to all of them.

### 2.5 `ui/MeetingList.tsx` (new) — PagedSection + layout switch

Thin wrapper around the existing `PagedSection` (no pagination logic of its own):

```ts
interface MeetingListProps<T> {
  listId: MeetingListId; defaultLayout: 'oneLine'|'twoLine';
  header: React.ReactNode;
  rows: Array<T | {kind: 'header'; label: string}>;   // optional group headers (Upcoming/Past), 30 dp each
  renderRow: (row: T, layout) => React.ReactNode;
  resetKey?: string; emptyHint?: string; textColor; borderColor;
}
```

- Puts the two 26 dp layout icons into PagedSection's existing `headerAccessory` slot (no new header row).
- `rowHeight` = header rows 30, entries `MEETING_ROW_HEIGHT[layout]`; `resetKey` gets the layout appended so a switch
  returns to page 1.

### 2.6 `ui/DayMeetingsPanel.tsx` (new, replaces `ui/MonthDayPanel.tsx`)

```ts
interface Props {
  date: string;
  entries: WeeklyMeetingEntry[];              // already the day's entries, day order
  tabs: 'daily' | 'planning';                 // daily: Today|Tomorrow|Google (no Close); planning: Meetings (n)|Google + Close
  dailyTab?: 'today'|'tomorrow'|'google'; onDailyTabChange?: (t) => void;
  onClose?: () => void;                       // planning only
  googlePanel: React.ReactNode;               // screen-built, as today
  renderRow: (entry, layout) => React.ReactNode;  // screen wires MeetingRow (keeps action wiring in the screen)
  textColor; borderColor;
}
```

Layout: MiniTabs strip (Close button right-aligned in the strip for `planning`) → `MeetingList` (listId `dayPanel`,
default 2-line, header = `formatFullDate(date)` + count). ≈ 83 dp of chrome (today's Month panel ~108 dp).

### 2.7 `ui/WeekGrid.tsx` + `ui/MeetingChip.tsx` (new, replace `ui/WeeklyMeetingsColumn.tsx`)

- `MeetingChip`: 34 dp, FONT.small, `time` (50 dp bold) + `meetingChipLabel`; `highlighted` → bold label;
  `editing` → inverted. `onPress`.
- `WeekGrid` props: `weekStart`, `meetings: WeeklyMeetingEntry[]`, `selectedDate`, `editingKey`, `keyOf`,
  `onPressChip(entry)`, `onPressDay(date)`, `readOnly?` (unused for now — see §4.6).
- Per day: header row 30 dp (`Mo 28.9. · 5`, "· Today", selected = inverted; `+N ‹ ›` only when it pages), then a
  CSS-grid-like block: two columns (`flexDirection: row`, each column a stack of 4 or 2 chip slots), filled
  column-first. **Fixed capacity 8 (weekday) / 4 (weekend) per page** — no measurement, no flex weights; paging is a
  per-day `page` state (`resetKey` = week start). Blocks are content-sized (30 + 4 × 34 = 166 dp, weekend 98 dp) →
  ~1068 dp total, fits the ~1113 dp column.
- Page arithmetic is a plain slice by page index (`chips.slice(page*cap, (page+1)*cap)`), a few lines in WeekGrid;
  `ui/pagination.ts` no longer exports a count-based helper, and height-based `usePagedByHeight` is not needed for
  fixed-capacity blocks.

### 2.8 `screens/usePlanningScreen.ts` (changed)

- **Remove** `saveShortForm`.
- **Add** the day-panel state shared by Week, Month and Review-week-ahead:
  `selectedDate`, `selectDay(date)` (toggle, cancels edit), `openMeetingFromGrid(entry)` (= set `selectedDate` to
  `entryDate(entry)` + `startMeetingEdit(entry)`), `closeDayPanel()`.
- **Add** `renderDayRow(entry, layout)` helper that builds the planning `MeetingRow` (2-line: M toggle, tracking,
  note, file open, source) so Week, Month and Review don't each wire it.
- `meetingsOnDay` (storage/monthlyAggregate.ts) stays the data source for the panel on every planning screen.

### 2.9 `screens/WeekPlanner.tsx` (new, extracted from WeekView)

Everything below WeekView's `‹ Week 40 · 2026 ›` header: left MiniTabs (Meetings | Google) + WeekGrid; right Quick Add
(edit target from the grid/panel) + (DayMeetingsPanel | PeriodFocusPanel / goal history). Props: `weekOffset`,
`onOpenItem`, `onOpenInbox`, `onOpenCalendarSettings`, `planning` (the hook result, passed in so the host owns
loading/refresh). `WeekView` becomes header + `<WeekPlanner>` (~100 lines instead of ~470).

### 2.10 `ui/GoogleCalendarPanel.tsx` (small change)

Event row reuses MeetingRow's time-column widths and `meetingTimeCell` wording ("all day" instead of "All day"),
height 37 dp (currently ~33). Copy footer and behaviour unchanged.

## 3. Per-place wiring

| Place | Component | layout (default) | time | source | highlight | tracking | note | file | onPress |
|---|---|---|---|---|---|---|---|---|---|
| Daily · Today/Tomorrow | DayMeetingsPanel `daily` (list `dayPanel`) | 2-line | time | yes | mark | yes | yes | open | edit |
| Daily · focus mode "Coming up" | MeetingRow, unpaged (list `focusComingUp`, no toggle shown) | 1-line | time | yes | – | yes | yes | open | edit |
| Week · overview | WeekGrid / MeetingChip | chip | – | – | bold | – | – | – | day panel + edit |
| Week · day panel | DayMeetingsPanel `planning` | 2-line | time | yes | toggle | yes | yes | open | edit |
| Month · day panel | same | 2-line | time | yes | toggle | yes | yes | open | edit |
| Month · day column | MonthDaysColumn (unchanged; labels via relaxed short form) | – | – | – | – | – | – | – | select day |
| Project/Area · Meetings | MeetingList `project`, Upcoming/Past headers | 1-line | dateTime | – | 2-line: mark | yes | yes | open / +arm | edit |
| Inbox · Meetings | MeetingList `inbox` | 1-line | dateTime | – | 2-line: mark | yes | yes | open / +arm | edit |
| Review · Inbox-to-zero | MeetingList `reviewInbox` | 1-line | dateTime | – | 2-line: mark | yes | yes | open / +arm | edit |
| Review · Meetings to close out | ReviewMasterDetail rows = MeetingRow | 2-line (list `reviewCloseOut`) | dateTime | yes | – | – | – | – | select (state selected/done) |
| Review · Stalled/Neglected cards | MeetingRow read-only | 1-line | dateTime | – | – | – | – | – | – |
| Review · Done/On-hold "All meetings" | MeetingRow read-only | 1-line | dateTime | – | – | – | – | – | – |
| Review · Week ahead | **WeekPlanner** (same as Week tab) | as Week | | | | | | | |
| Google tabs (all) | GoogleCalendarPanel (aligned row) | 1-line look | dateTime | – | – | – | – | – | select → copy |

Review close-out: `ReviewMasterDetail` keeps its fixed master-row height contract; `CLOSE_OUT_ROW_PX` becomes
`MEETING_ROW_HEIGHT[layout]`. `ReviewMasterDetail` gets one optional `headerAccessory` prop passed straight through to
its PagedSection (a one-line change), so the close-out list gets the same layout switch as every other list.

## 4. Screen-level changes

### 4.1 Daily
- Calendar column: `MiniTabs` + `PagedSection` replaced by `DayMeetingsPanel tabs="daily"`; Google tab stays inside it.
- `meetingHeightFor`, `meetingRowLines` usage, `height`/`numberOfLines` wiring deleted.
- Context-tag filter keeps working: `contextTag/onToggleContext` passed through to MeetingRow (2-line: tags on line 2).

### 4.2 Week
- WeekView → header + `WeekPlanner`. "Focus" section label dropped.
- Right column shows `DayMeetingsPanel` when `planning.selectedDate` is set, else the focus/goal panel (Month pattern).
- `editingMeetingEntry` is looked up in the week aggregate **or** the selected day's rows (a multi-day meeting can
  start before the week).

### 4.3 Month
- `MonthDayPanel` → `DayMeetingsPanel tabs="planning"`; row wiring from `planning.renderDayRow`.
- Everything else unchanged.

### 4.4 Project page / Inbox / Review Inbox-to-zero
- Replace the three hand-built `PagedSection` + `meetingFlatRows` blocks with `MeetingList`
  (the `{kind:'header'}` Upcoming/Past rows move into MeetingList's generic group-header support).
- `meetingRowSizing(...)` spreads and `COLUMN_WIDTH_PX` uses for meetings disappear.

### 4.5 Review cards, Done/On-hold, close-out
- Stalled/Neglected card meeting lines and `CloseOutRow` → MeetingRow (fixes ISO dates, adds time alignment).
- `DoneOnHoldDetail`'s prop-less `<MeetingRow>` becomes a valid read-only call.

### 4.6 Review · Week ahead
- `renderWeekAhead` renders `<WeekPlanner planning={weekAheadPlanning} weekOffset={…} … />` below the step nav,
  replacing its QuickAdd (task-only) + MiniTabs + text list + Google panel.
- `weekAheadPlanning` = `usePlanningScreen({logTag: 'ReviewWeekAhead'})`, mounted only while the step is shown
  (a small `WeekAheadStep` component so the hook's lifecycle follows the step). Items are live for both via the shared
  cache (`useCachedItems`); ReviewScreen's separately held **Inbox** state is refreshed by calling ReviewScreen's
  `load(false)` from `WeekAheadStep`'s unmount (leaving the step), so Inbox edits made in the week ahead show up in the
  Inbox-to-zero step.
- Initial week: **next week on Fri–Sun, the current week Mon–Thu** (the same rule `canEditPeriod('weekly', 1)` already
  encodes for focus editing); ‹ › in a compact week header inside the step to move between weeks.
- Space: step nav (~33 dp) + week header (47 dp) sit on top → ~1090 dp for a 1068 dp grid. It fits, but only just.
  If it clips on device, the fallback is to put the week title into the step nav line (no separate week header).
- Today's `weekMeetings` text list (and its `entry.meeting.date === date` multi-day bug) is removed with it.

## 5. Deletions

`ui/MonthDayPanel.tsx`, `ui/WeeklyMeetingsColumn.tsx`, `MeetingRow`'s `compact`/`height`/`numberOfLines`/sizing
exports, `usePlanningScreen.saveShortForm`, `monthHighlight.setShortForm/isValidShortForm`, ReviewScreen's
`CloseOutRow` and week-ahead text list, the meeting half of `meetingFlatRows` in ProjectDataPanel/InboxScreen,
`PAGE_SIZE.googleCalendarWeekly`/`GOOGLE_VIEWPORT_PX` leftovers in WeekView. Stub files `ui/WeeklyFocusPanel.tsx`
and `ui/WeeklyGoalsHistoryPanel.tsx` (already superseded) are listed for Tilman to delete by hand.

## 6. Implementation steps (each builds, tsc-clean, device-testable)

1. **Domain**: `meetingDisplay.ts`, relaxed short form, delete setShortForm & co. Jest tests for time cells
   (timed/end/all-day/multi-day × both modes) and short forms ("(Geburtstag Jörg)", "(AoT-2)", trailing tags).
2. **MeetingRow v2 + listLayout + MeetingList** (MeetingRow keeps a temporary adapter for the old props so nothing else
   breaks yet).
3. **Project, Inbox, Review Inbox-to-zero** → MeetingList (1-line, dateTime). *Device test: switch, paging, arm link.*
4. **DayMeetingsPanel + usePlanningScreen day state + renderDayRow; Month** uses it; MonthDayPanel deleted.
   *Device test: Month panel, M toggle, note, file open, tracking.*
5. **Daily** → DayMeetingsPanel `daily` + focus-mode "Coming up". *Device test: context filter, Today/Tomorrow.*
6. **MeetingChip + WeekGrid + WeekPlanner; WeekView** rebuilt on it. *Device test: 4/2 fit, paging, chip → edit,
   header → panel, day switching.*
7. **Review**: close-out rows, cards, Done/On-hold, **week ahead = WeekPlanner**. *Device test: fit under step nav.*
8. **Google row alignment.**
9. **Cleanup**: remove the old-prop adapter, deletions (§5), `COLUMN_WIDTH_PX` → 473.
10. **Docs**: `design-device-rendering.md` density correction + new row table, `design-overview.md` §2/§5,
    `design-meeting-lists.md` status.

Verification each step: tsc scratch project, eslint, Jest smoke render of `<App/>`; commit → re-stage → md5 (repo rule).

## 7. On-device checklist

- Week: Mon–Fri show 8 chips each without clipping, weekend 4; +N/‹ › on an overfull day; empty day = empty grid.
- Tap chip → right panel shows that day, Quick Add edits that meeting, chip inverted; tap chip on another day → switches.
- Tap day header → panel only; Close → focus panel back.
- Layout switch in the day panel carries over between Daily, Week and Month within a session; resets after restart.
- Month labels show "(Geburtstag Jörg)"-style short forms; no SHORT field.
- Project list: `29.9. 10:00`, no M in 1-line, M mark in 2-line, +📎 arms the Files pane.
- Review week ahead behaves exactly like the Week tab, fits under the step nav.
- Review close-out: rows aligned with other lists; selection bar; ✓ done state.

## 8. Risks and review points

1. **Two planning-hook instances in Review** (ReviewScreen's own state + the embedded WeekPlanner's): both write
   through the shared cache and files; ReviewScreen's Inbox copy is refreshed when the week-ahead step unmounts
   (§4.6). Flagged for the device test.
2. **Week-ahead fit** is tight (~20 dp slack) — fallback in §4.6.
3. The **Weekly focus step** in Review partly overlaps with the focus panel now visible in week ahead — no change now,
   noted for a later Review cleanup.

## 9. As-built

### Steps 1–3 (2026-09-29)

- `domain/meetingDisplay.ts`: `meetingTimeCell` (1-line: `10:00` / `29.9. 10:00` / `all day` / `29.9.`; 2-line:
  `10:00`+`–11:30`, `29.9.`+`10:00–11:30`, `all day`+`day 2/3`; today in dateTime 2-line reads `today`) and
  `meetingChipLabel` (short form, else the displayed title incl. tags, plus ◂ ▸).
- `domain/monthHighlight.ts`: any trailing `( … )` up to 40 chars is the short form; `setShortForm`/`isValidShortForm`
  deleted; `monthLabel` never returns an empty label for tag-only titles.
- SHORT field removed from `ui/MonthDayPanel.tsx` right away (with `usePlanningScreen.saveShortForm`), not in step 4,
  so nothing depended on the deleted helpers. The panel itself is still the old one until step 4.
- `ui/MeetingRow.tsx`: new `MeetingRowProps` (§2.3) rendered by `MeetingRowV2`; the default export dispatches on
  `layout` and still accepts the legacy props (Daily, Week, Review cards) until step 9. Fixed heights via explicit
  `lineHeight` 22/18 dp. Arming uses the same 4 dp bar as editing (as before).
- `ui/listLayout.ts`, `ui/MeetingList.tsx` (layout icons in PagedSection's `headerAccessory`; group headers 30 dp).
- Migrated: Project/Area page, Inbox tab, Review Inbox-to-zero — 1-line default, `29.9. 10:00`, M only in 2-line.
- Verified: tsc (no new errors vs. the 4 pre-existing ones), eslint (no new errors), Jest unit tests for time cells /
  short forms / chip labels, render tests of both layouts and MeetingList, `<App/>` mount smoke test.

### Feedback round 1 on steps 1–3 (Tilman, 2026-09-29)

Sizes confirmed OK on device; Month confirmed working. Changes:
- **2-line rows without a source line** (Project, Inbox, Review-inbox): the title may wrap onto line 2
  (2 × 21 dp line height, same 57 dp row).
- **M in 2-line rows moved to the icon group at the end** (M, P/R, note, file), both the read-only mark and the toggle.
- **Highlight bar is solid black everywhere**: rows now set only `borderBottomColor` to the list's light colour
  (a whole-row `borderColor` could override the left bar); MeetingRow (both prop shapes) and TaskRow use `#000000`.
- **Layout switch keeps the current top row in view**: `usePagedByHeight` exposes `startIndex`, PagedSection reports it
  via `onFirstRowChange`, and MeetingList jumps (`jumpTo`, keyed by layout) to the page containing that row instead of
  resetting to page 1.

### Steps 4–6 (2026-09-29)

- `ui/DayMeetingsPanel.tsx` (new): MiniTabs (+ optional Close via the new `MiniTabs.trailing` slot) and a MeetingList
  (`dayPanel`, default 2-line, header "Tuesday, September 29th · 6 meetings"); `listResetKey` lets Daily reset on a
  context-filter change. `storage/monthlyAggregate.meetingsOnDay` now returns `WeeklyMeetingEntry[]` with `span`.
- `screens/usePlanningScreen.ts`: day-panel state (`selectedDate`, `selectDay`, `openMeetingFromGrid`, `closeDayPanel`)
  and `dayRowProps(entry, layout, {onOpenSource, textColor, borderColor})` → the planning row (M toggle, tracking, note,
  open file, source); `dayEntryKey` for multi-day keys. This is a `.ts` hook, so it returns props instead of JSX.
- Month: uses DayMeetingsPanel + `dayRowProps` (gains note, file-open, tracking; rows 57 dp instead of 76).
- Daily: calendar column = DayMeetingsPanel with Today | Tomorrow | Google (no Close); rows 2-line default with
  source, read-only M (2-line), tracking, note, open file, context-tag filter; focus mode "Coming up" = 1-line rows.
- Week: `ui/MeetingChip.tsx`, `ui/WeekGrid.tsx` (fixed 8/4 per page, column-first, per-day ‹ ›, header tap = panel),
  `screens/WeekPlanner.tsx` (the Week body, embeddable), `screens/WeekView.tsx` = header + WeekPlanner. Changing week
  closes the day panel. Quick Add's default date follows the selected day.
- No longer imported (to delete by hand, the cloud session cannot delete files): `ui/MonthDayPanel.tsx`,
  `ui/WeeklyMeetingsColumn.tsx` (plus the older `ui/WeeklyFocusPanel.tsx`, `ui/WeeklyGoalsHistoryPanel.tsx` stubs).
- Verified: tsc (only the 4 pre-existing errors), eslint (no new errors), Jest: WeekGrid paging/column-first,
  DayMeetingsPanel render, WeekView/MonthView/DailyView/WeekPlanner mount, `<App/>` mount.

### Save-then-switch + steps 7–10 (2026-09-29)

- **Save-then-switch** (§10) in every screen with a Quick Add edit mode: Daily, Week, Month, Project/Area, Inbox and
  Review Inbox-to-zero. This replaces "Finish edit!".
- **Review close-out**: rows are `MeetingRow` (`CloseOutMeetingRow` reads the live meeting and the item's `abbrev` from
  the cache) with a layout switch (`reviewCloseOut`, default 2-line). `ReviewMasterDetail` got `headerAccessory`.
  `CloseOutRow`/`CLOSE_OUT_ROW_PX` are gone.
- **Review cards** (Stalled/Neglected) and **Done/On-hold "All meetings"** use read-only 1-line `MeetingRow`s with
  `dateTime`. This fixes the ISO dates and the old invalid prop-less call.
- **Review week ahead** = `screens/ReviewWeekAhead.tsx`: its own `usePlanningScreen` + `WeekPlanner`. Deviations
  from §4.6:
  - The "‹ Week 40 ›" navigation sits in the grid's Meetings | Google tab row (new `WeekPlanner.leftTabsTrailing` →
    `MiniTabs.trailing`) instead of a separate header. The Review has ~50 dp less than the Week tab, so the fallback
    from §4.6 was taken up front.
  - On leaving the step, ReviewScreen calls `refreshFromCache()` and re-reads its Inbox copy instead of `load(false)`.
    `load(false)` would flash the spinner and reset every step's snapshot; the re-read is enough so that a later
    Inbox-to-zero save never overwrites a meeting added in the week ahead.
  - Removed: the task-only Quick Add, the This week | Google tabs, the text list, `reviewDayLabel` and the unused
    `GOOGLE_VIEWPORT_PX`.
- **Step 8, Google rows**: 37 dp (`GOOGLE_EVENT_ROW_PX = MEETING_ROW_HEIGHT.oneLine`), `paddingVertical` 7,
  `lineHeight` 22, time in `FONT.medium` with MeetingRow's `TIME_COLUMN_DP` (now exported) and `meetingTimeCell`
  wording. A single-day window (day panel) uses `time`, a longer one uses `dateTime`.
- **Step 9, cleanup**:
  - Removed from `ui/MeetingRow.tsx`: the legacy prop shape, `LegacyMeetingRow`, `meetingRowHeight`,
    `meetingRowLines`, `meetingEntryHeight`, `meetingRowSizing`, `MEETING_ROW_CHROME_PX`/`_LINE_HEIGHT_PX` and
    `TRACKING_ICON_ALLOWANCE_PX`. The file is v2 only, with a new module comment.
  - **Not done: `COLUMN_WIDTH_PX` → 473.** No meeting list uses it any more. It still feeds the task/item line
    estimators (TaskRow, ItemsList, Review item rows, FileBrowserPane), which were tuned on the device with 678.
    Changing it would re-page every task list, so it is an open follow-up, noted in `design-device-rendering.md` §1.
- **Step 10, docs**: `design-device-rendering.md` (§1 density, §3 row table, §5.2 Google row, changelog) and
  `design-overview.md` (§2.33 and a §5 entry).
- **Verified**:
  - tsc: 3 errors left, all pre-existing (DoneOnHold `TaskRow` props, Text `hitSlop` in MeetingRow/TaskRow). The
    DoneOnHold `MeetingRow` error is fixed.
  - eslint: no new errors.
  - Jest: new `flush.test.tsx` covers a clean flush (no save), a dirty flush (saves, then a switch reloads the
    fields), a failed save and an invalid time (both block the switch), unmount (saves), the week-ahead start week,
    and ReviewWeekAhead/ReviewScreen mounting. All 21 scratch tests pass.

## 10. Quick Add edit: save-then-switch (Tilman, 2026-09-29)

**Problem.** Tapping a Week chip moved the highlight but left Quick Add editing the previous meeting. The widget only
reloaded its fields on unset↔set transitions of the edit target. The planning screens could switch targets directly,
so a Save then wrote the old fields onto the newly selected meeting, which risked corrupting data. Other screens
avoided this by blocking the switch ("Finish edit!").

**Decision.** Save-then-switch, plus a save when the tab is left:
- Tapping another row first saves the current row's pending changes, but only if they differ from what was loaded.
- If that save fails (validation or a write error), the edit stays open with its error and the switch does not
  happen.
- Cancel still discards. New-item drafts are separate and are never saved implicitly.

**Mechanism.**
- `QuickAddWidget`:
  - `editTargetKey` reloads the fields whenever the target changes (not just on unset↔set).
    `loadedFieldsRef` keeps a JSON snapshot for the dirty check.
  - `submitTaskEdit`/`submitMeetingEdit` resolve a boolean.
  - `flushEditRef.current()` = "save if dirty, resolve whether the caller may move on".
  - An unmount effect runs the latest flush (fire-and-forget). Screens unmount on a tab change because App renders
    tabs conditionally.
- `ui/useEditFlush.ts`: `{flushEditRef, afterSave}`. `afterSave(apply)` runs `apply` right away when there is no open
  edit, otherwise after a successful flush.
- Screens wrap every change of the edit target in `afterSave`:
  - starting an edit on another row;
  - `selectDay`, `openMeetingFromGrid` and `closeDayPanel(then?)`;
  - changing the week or month.
  The commit functions (`commitMeetingEdit`, `commitTaskEdit`, the Review/Inbox equivalents) resolve `false` on
  failure (`runWidgetSave`). Meeting saves are in place (`meetings[index] = …`), so `path#index` keys stay valid
  across the save.
