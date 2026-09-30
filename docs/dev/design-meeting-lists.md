# Meeting lists — inventory, use cases, unified display (PROPOSAL)

Status: **requirements proposal, 2026-09-27** — nothing implemented yet. Decisions taken 2026-09-27 are in §0; remaining open points are marked **❓**.
Trigger: Tilman on the Month day panel — (a) not aligned with other calendar lists, (b) no add-note / add-file,
(c) the SHORT editor is not worth having; a trailing bracket should simply *be* the short form (today it is only
recognised when it is 1–12 ASCII letters/digits, so "(Geburtstag Jörg)", "(AoT-2)", "(Jour fixe)" silently fall back
to the full title). Plus: 1-line / 2-line switch per list, and a denser Week overview with a day panel like Month.

> **2026-09-29:** later decisions (Daily uses the day panel, M only in 2-line rows, `29.9. 10:00`, session-only layout
> memory, Review week ahead = the Week screen) and the 1 dp = 1.41 px calibration are in
> `docs/dev/technical-design-meeting-lists.md` §0–1, which supersedes this document where they differ.

## 0. Decisions (Tilman, 2026-09-27)

- **No file linking on planning screens** (Daily/Week/Month): rows there only *open* an already-linked file; linking stays on
  Project/Inbox (Files pane). "+📓" (add note) is available everywhere.
- **Default layouts**: day lists 2-line (Daily, Week/Month day panel, Review close-out); everything else 1-line.
  Per-list switch, remembered.
- **Week chips**: time + short form (trailing bracket), else truncated title; M-highlight shown bold.
- **Week grid size: fixed** — weekdays 4 rows × 2 columns (8), weekends 2 × 2 (4). Tilman: today 3 rows fit and roughly one
  more, so 4/2 is what the space holds; overflow pages per day.

---

## 1. Inventory — every place that shows meetings today

| # | Screen / place | Component | Row look today | Actions | Paging | Notes / problems |
|---|---|---|---|---|---|---|
| 1 | Daily → Calendar column (Today / Tomorrow) | `ui/MeetingRow` normal | time — title, wraps to 2 lines (estimated), `#abbrev` badge | edit, note, open clip (no +clip), P/R tracking, tappable context tags, M mark | PagedSection, height-estimated | only list with context-tag filter |
| 2 | Daily → focus mode "Coming up" | `MeetingRow` normal | same, 1 line | same | none (≤4 h window) | |
| 3 | Week → Meetings column | `MeetingRow compact` via `WeeklyMeetingsColumn` | small font, 1 line, `#abbrev`, icons | edit, note, open clip, tracking | per day, 3:2 flex | only ~3 per weekday visible, icons eat width |
| 4 | Month → day strip (left) | `MonthDaysColumn` | "Th 01 · AoT // igroup // … +N" | select day | none (1 row/day) | label-level summary, not a meeting list |
| 5 | Month → day panel (right) | own `DayPanelMeetingRow` | **2 lines**: bold time/"all day 2/3" + title; full item name muted; SHORT field | M toggle, SHORT edit, edit | PagedSection, fixed 76 px | no note, no file, no tracking, gray-background edit state (everyone else: left accent bar) |
| 6 | Project/Area page → Meetings | `MeetingRow` normal | "28.9. 10:00 — title", wraps | edit, note, clip + **+clip (arm)**, tracking | PagedSection, Upcoming / Past headers | no source (single item) |
| 7 | Inbox → Meetings | `MeetingRow` normal | as 6 | as 6 | as 6 | |
| 8 | Review → Inbox-to-zero → Meetings | `MeetingRow` normal | as 6 | as 6 | PagedSection | |
| 9 | Review → Week ahead | **plain `<Text>`** | "title — Item name" under day labels | none | none | no time shown; ignores multi-day spans (`meeting.date === date` only) |
| 10 | Review → Meetings to close out (master list) | own `CloseOutRow` | 2 lines: ✓ title / "2026-09-25 10:00 · Item" | select | ReviewMasterDetail | ISO date, own style |
| 11 | Review → Stalled / Neglected cards | plain `<Text>` | "2026-09-30, 10:00 — title" | none | none | ISO date |
| 12 | Review → Done / On-hold detail "All meetings" | `MeetingRow` with only `meeting` | — | — | none | passes none of the required props (probably a tsc error / crash risk — verify) |
| 13 | Google tab (Daily / Week / Month / Month day / Project / Inbox / Review) | `GoogleCalendarPanel` own row | "28.9. 10:00 │ title │ ✓" | select → copy footer | PagedSection | time in its own column; everyone else inlines it |
| — | QuickAddWidget edit mode | form | — | — | — | not a list; stays as is |

So today there are **five different row renderings** (MeetingRow normal, MeetingRow compact, DayPanelMeetingRow,
CloseOutRow, plain text ×2) plus the Google row, **three date formats** (`28.9.`, ISO `2026-09-28`, none),
**two edit-highlight styles**, and file/note actions that depend on the screen rather than on the meeting.

## 2. Use cases (including ones not in the original list)

| Use case | Where | What matters |
|---|---|---|
| U1 **Work a day** — act on meetings: open/create note, P/R, link file, edit | Daily, Month/Week day panel | all actions, source, readable time |
| U2 **Scan a period** — see density/shape of a week or month at a glance | Week grid, Month strip | max. items per screen, no chrome, tap → drill into U1 |
| U3 **Per-item list** — one Project/Area/Inbox, upcoming + past | Project, Inbox, Review inbox | date needed (spans many days), no source, arm file link |
| U4 **Select for a workflow step** — row is a selector, detail on the right | Review close-out | selected / done (✓) state, no inline actions |
| U5 **Read-only context** — meetings shown as context in a card | Review cards, Done/On-hold detail, Week-ahead | compact, no actions, consistent date/time |
| U6 **Pick highlights** — mark meetings for the month | Month (and Week) day panel | M toggle visible and tappable |
| U7 **Copy from Google** — external events, not yet meetings | all Google tabs | same geometry as meeting rows, copied ✓, no meeting actions |

Scenarios that deserve explicit handling (easy to forget):

- **Multi-day meetings**: "◂ Offsite ▸" + "day 2/3", shown on every covered day — also in Review week-ahead (bug today).
- **All-day vs. timed**: one wording everywhere ("all day", not "All day" in Google and "" elsewhere).
- **Past meetings** on the Project page: same row, maybe muted; P/R icon becomes the actionable thing.
- **Arming a file link** (U1/U3): planning screens (Daily/Week/Month) have **no Files pane** — decided: no linking there, only open (see §5).
- **Editing state**: one look everywhere (proposal: left accent bar, as in MeetingRow).
- **Empty day / overflow day** (Week grid with 12 meetings) — per-day paging with "+N".
- **Today marker** and **weekend shading** consistent between Week and Month.
- **Context-tag filter** stays Daily-only, but the row renders tags the same way everywhere.

## 3. The standard: one row, two layouts, plus one mini variant

### 3.1 Shared building blocks (pure, `domain/meetingDisplay.ts`, new)

- `meetingTimeLabel(meeting, span, {withDate})` → `10:00`, `10:00–11:30`, `all day`, `all day 2/3`, with date prefix
  `Mo 28.9.` only in lists spanning several days (U3/U4/U5). Replaces 5 local variants.
- `meetingShortLabel(meeting)` → short form if the title ends in a bracket, else tag-stripped title.
- `shortFormOf` relaxed: **any** trailing `( … )` — spaces, umlauts, punctuation, up to ~30 chars — is the short form.
  Short forms are edited as part of the title in Quick Add; SHORT field and "use (AoT)" chip go away.

### 3.2 `MeetingRow` — `layout: 'oneLine' | 'twoLine'`, fixed height each (no more line estimation)

```
oneLine (≈38 px)   [M] 10:00  Art of Transformation (AoT) …        #AoT  [P] 📓 📎
twoLine (≈58 px)   [M] 10:00–11:30   Art of Transformation Session (AoT)      [P] 📓 📎
                       Art of Transformation · day 2/3 · #ctx
```

- Time sits in a **fixed-width left column** in both layouts (and in the Google row) → aligned lists everywhere.
- Source: `#abbrev` at line end in oneLine; full item name on line 2 in twoLine. Hidden on single-item lists (U3).
- Actions are **props, not screen-specific code**: `note`, `file` (open / +arm), `tracking`, `highlight` (`'mark'` read-only
  M, `'toggle'` tappable M), `onPress` (edit or select). `actions="none"` for U4/U5.
- State: `editing | arming | selected | done` — one visual language.
- Heights become constants → `meetingRowLines/meetingEntryHeight` and the text estimator drop out for meetings.

### 3.3 `MeetingChip` — the mini variant (Week grid, U2)

`10:00 AoT session…` — FONT.small, one line, **no date, no icons, no source**, M shown as bold/underline.
Tap = open that day's panel and edit this meeting. ≈30–34 px.

### 3.4 `MeetingList` — PagedSection + layout switch

Wraps every list of U1/U3/U4/U5: header, optional group headers (Upcoming/Past, day labels), `‹ ›` paging and a
small **≡ / ☰ layout toggle** in the header. Layout choice persisted per list (`settings.meetingListLayout[listId]`).

### 3.5 Mapping

| # | Place | Standard | Default layout |
|---|---|---|---|
| 1, 2 | Daily Calendar, Coming up | MeetingList + MeetingRow, all actions (file: open only), source | twoLine |
| 3 | Week overview | **WeekGrid of MeetingChips** (new, §4) | — |
| — | Week day panel | DayMeetingsPanel (= generalised Month day panel) | twoLine |
| 4 | Month strip | stays `MonthDaysColumn` (labels use `meetingShortLabel`) | — |
| 5 | Month day panel | DayMeetingsPanel, **+ note, open file, tracking, M toggle** | twoLine |
| 6, 7, 8 | Project / Inbox / Review-inbox | MeetingList, no source, date prefix | oneLine |
| 9 | Review week ahead | read-only WeekGrid (same component as Week) or MeetingList with day headers ❓ | — |
| 10 | Review close-out master | MeetingRow twoLine, `actions="none"`, selected/done | twoLine |
| 11, 12 | Review cards / Done-On-hold | MeetingRow oneLine, `actions="none"` | oneLine |
| 13 | Google tabs | own row, but same time column/fonts/heights as oneLine | oneLine |

## 4. Week view redesign

- **Left:** 7 day blocks, each a **2-column grid of MeetingChips**, filled column-first (left column top→bottom, then
  right) so reading order stays chronological. Day header "Mo 28.9. · Today · 7" (count), tappable.
- **Size (decided): fixed 4 rows × 2 per weekday, 2 × 2 per weekend**, overflow pages per day ("+N ‹ ›"). Chip height is
  derived from the measured block height ÷ 4 (resp. ÷ 2), so it matches what fits today rather than a guessed pixel value.
- **Right:** Quick Add on top, then **DayMeetingsPanel | Focus panel** — exactly the Month pattern.
  Tap a chip → day panel for that day + Quick Add in edit mode for that meeting. Tap a day header → day panel only.
  "Done" → back to the Focus panel.
- Week and Month then share: `DayMeetingsPanel`, the selected-day/edit state (moved into `usePlanningScreen`), the
  right-column composition.

## 5. Adding files on planning screens (decided: no)

"+📎" arms a link and relies on a Files pane (only Project/Inbox have one). **Decision: no linking on Daily/Week/Month** —
the row shows 📎 only when a file is linked (tap opens it); `MeetingRow`'s `file` action is `'open'` there and
`'openOrArm'` on Project/Inbox/Review-inbox.

## 6. Implementation route (each step shippable, device-testable)

1. **Domain**: `domain/meetingDisplay.ts` (time label, short label), relax `shortFormOf`; unit tests. Remove SHORT editor,
   `saveShortForm`, suggestion chip.
2. **MeetingRow v2**: `layout` + action props + state; fixed heights; keep old props as a thin adapter during migration.
3. **MeetingList** (PagedSection + toggle + group headers + persisted layout). Settings key.
4. **Migrate simple lists**: Project, Inbox, Review-inbox, Daily (incl. Coming up). Delete `meetingRowLines/Entry/Sizing`.
5. **DayMeetingsPanel** from `MonthDayPanel`; Month uses it (gains note/file/tracking). Selected-day state → `usePlanningScreen`.
6. **Week**: `MeetingChip`, `WeekGrid` (paged 2-column grid, column-first), day panel on the right, tap behaviour.
7. **Review**: close-out master, cards, Done/On-hold, week-ahead → standard rows / read-only grid; fix span + ISO-date issues
   and the prop-less `MeetingRow` call.
8. **Google row** alignment (time column, all-day wording, heights).
9. Docs: `design-device-rendering.md` row table (+ new heights), `design-overview.md` §2/§5, remove `compact`.

Component result: `MeetingRow` (2 layouts) · `MeetingChip` · `MeetingList` · `WeekGrid` · `DayMeetingsPanel` ·
`MonthDaysColumn` — instead of today's 6 ad-hoc renderings.
