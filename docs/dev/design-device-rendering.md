# Device rendering reference

> **About this document.** This is a living document. It describes how gtdpara renders on the
> Supernote A5 X *today*: screen facts, typography, row heights, how lists are paged, a
> per-element space budget, and how to budget a new screen. It describes the current code only,
> in present tense; design history stays in `docs/dev/history/` and in git. It is the reference
> every UI design is checked against (`DEVELOPMENT-POLICY.md` §4). Keep it true: when a style
> value, row height or layout rule changes, update the matching number here in the same change.
> When a number is an estimate, say so.

## 1. Screen facts

- **Device: Supernote A5 X.** 10.3" e-ink panel, **1404 × 1872 px at 226 PPI**, portrait.
- **Units: React Native layout uses dp, and 1 dp = 1.41 px on this device** (226 PPI ÷ 160).
  Every style number (`fontSize`, `padding*`, `margin*`, `height`, `minHeight` …) is in dp.
  The screen is about **994 × 1325 dp**.
- **Where real pixels matter:**
  - Note and PDF pages: a `.note` page is 1404 × 1872 px (`NOTE_PAGE_WIDTH_PX` /
    `NOTE_PAGE_HEIGHT_PX` in `domain/tagRules.ts`). Note-template pieces, text boxes and lasso
    coordinates use these real pixels, not dp.
  - Screenshots: a device screenshot is 1404 px wide. Divide a measurement taken from a
    screenshot by 1.41 before comparing it with a style value.
- **Naming caveat:** many layout constants in `src/ui` and `src/screens` end in `_PX`
  (`TASK_ROW_LINE_HEIGHT_PX`, `SUBHEADING_ROW_PX`, `COLUMN_WIDTH_PX` …). They hold **dp**
  values, because React Native reads them as dp. Only the note-page constants above are real
  pixels.
- **Column width used by the line estimators:** `COLUMN_WIDTH_PX = 678` (in `ui/itemEntryRow.ts`,
  `ui/taskRowLayout.ts` as `TASK_COLUMN_WIDTH_PX`, `ui/FileBrowserPane.tsx`,
  `screens/InboxScreen.tsx`, `screens/DailyView.tsx`, `screens/ProjectDataPanel.tsx`). This is a
  pixel figure, while a real half-screen column is about **473 dp** wide
  (`(994 − 2 × 16 − 16) ÷ 2`). The line estimator (`ui/textLineEstimator.ts`) is tuned
  together with 678 (narrow character widths plus a 0.8 safety margin), so the two errors
  partly cancel out. Treat line-count predictions as estimates; changing 678 re-pages every
  task and item list.
- **Grayscale e-ink only.** The hardware has no color. See §7.
- **No scrolling, anywhere, by design**
  (`docs/dev/history/technical-design-pagination-edit-reuse.md`). Every list is a fixed-size
  box paged with ‹ › arrows, because redrawing a growing scroll area is slow and messy on
  e-ink, while a fixed box is cheap to refresh. So row heights (§3) and the space budget (§5)
  decide whether a screen uses its space well; there is no scroll to fall back on.

## 2. Typography (`ui/theme.ts` → `FONT`)

There are three font sizes. New UI reuses one of them instead of adding a fourth.

| Constant | Value (dp) | Use |
|---|---|---|
| `FONT.large` | 22 | Screen headings only; rare. |
| `FONT.medium` | 17 | The main size: list text, tab labels, buttons, inputs, most body text. |
| `FONT.small` | 15 | Captions, chips, tags, section headers, hints, breadcrumbs. |

**Line heights.** `FONT` sets no `lineHeight`, so a text line is as tall as Android's font
metrics make it. The code budgets these line heights:

| Size | Line height (dp) | Where it comes from |
|---|---|---|
| `FONT.medium` | **22** | Measured on the device for task rows (`TASK_ROW_LINE_HEIGHT_PX` in `ui/TaskRow.tsx`). `ui/MeetingRow.tsx` sets `lineHeight: 22` explicitly (21 for a wrapped two-line title). The same 22 is used by `ui/FileBrowserPane.tsx` and `ui/itemEntryRow.ts`. |
| `FONT.small` | **18** | `ui/MeetingRow.tsx` sets `lineHeight: 18` for its source line; other budgets use ~18 as an estimate. |
| `FONT.large` | **~27** | Estimate (about 1.2 × font size). |

**`includeFontPadding: false`.** On Android, `Text` has `includeFontPadding: true` by default.
It adds extra space above the letters for accents, but no matching space below the baseline.
In a fixed-height, top-aligned row this pushes the text down, so the bottom of letters like
`g`, `y`, `p` gets cut off at the row's edge, and the real line is taller than the budgeted
22 dp. Row text that must fit a fixed height therefore sets `includeFontPadding: false`:

- `ui/TaskRow.tsx` (`rowText`)
- `ui/MeetingRow.tsx` (time, title, source line, `#abbrev`, note icon)
- `ui/FileBrowserPane.tsx` (`entry`)
- `screens/ItemsList.tsx` (`entry`)
- `ui/MeetingChip.tsx`, `ui/WeekGrid.tsx`, `ui/StatusMarkRow.tsx`

A new fixed-height row should do the same, or its height estimate will be too small.
`ui/FocusedItemRow.tsx` and `ui/PagedSection.tsx`'s header line keep the default; they are
not clipped to a computed height.

## 3. List-row heights

A paged list needs to know each row's height *before* it renders, so it can decide how many
rows fit on a page without a measure-and-reflow pass. Every row type therefore has a height
function or a fixed height, and the row renders at exactly that height (it passes the value
as `height` and `minHeight`, clips overflow, and caps text with `numberOfLines`). Rows are
top-aligned, so if a prediction is too large the spare space sits at the bottom of the row.

| Row | File | Height (dp) | How it is computed |
|---|---|---|---|
| Task row | `ui/TaskRow.tsx` → `taskRowHeight()` | **42** (1 line) / **64** (2 lines) | `TASK_ROW_CHROME_PX 20` (`paddingVertical 7 × 2` + border + rounding, device-measured) + lines × 22. Lines (1–2) come from `ui/taskRowLayout.ts`, which estimates title + labels together; a long title is shortened with "…" so labels always show. Text width = column width − 28 (checkbox) − 90 (note/clip icons). The style's `minHeight: 64` is only a fallback for callers that pass no `height`. |
| Meeting row, 1-line | `ui/MeetingRow.tsx` | **37 (fixed)** | `MEETING_ROW_HEIGHT.oneLine`: `paddingVertical 7 × 2` + one 22 dp line + border. Time column 58 dp (`time`) or 118 dp (`dateTime`, e.g. "28.12. 23:59"). |
| Meeting row, 2-line | `ui/MeetingRow.tsx` | **57 (fixed)** | `MEETING_ROW_HEIGHT.twoLine`: 22 dp title + 2 + 18 dp source line (or the title wrapping onto line 2 at 2 × 21 dp when there is no source). Time column 58 dp or 96 dp. Every meeting list has a 1-line/2-line switch. |
| Meeting group header (Upcoming/Past) | `ui/MeetingList.tsx` | **30 (fixed)** | `MEETING_LIST_HEADER_ROW_HEIGHT`. |
| Google Calendar event | `ui/GoogleCalendarPanel.tsx` | **37 (fixed)** | `GOOGLE_EVENT_ROW_PX = MEETING_ROW_HEIGHT.oneLine`, same time column as a meeting row. |
| Week chip | `ui/MeetingChip.tsx` | **34 (fixed)** | `MEETING_CHIP_HEIGHT`. The Week grid shows 4 rows × 2 chips per weekday and 2 × 2 per weekend day, under a 30 dp day header (`WEEK_DAY_HEADER_HEIGHT`). |
| File/folder entry | `ui/FileBrowserPane.tsx` → `fileEntryHeight()` | **42** / **64** | `FILE_ENTRY_CHROME_PX 20` (`paddingVertical 5` on both the row and the text, × 2) + lines × 22, max 2 lines. |
| Project/Area entry, Projects/Areas tabs | `screens/ItemsList.tsx` → `itemEntryHeight()` | **38** / **60** | Padding 8 × 2 + lines × 22, max 2 lines, `#ABBR` included in the estimate. |
| Project/Area entry, Review lists | `ui/itemEntryRow.ts` → `itemEntryHeight()` | **34** / **56** | Padding 6 × 2 + lines × 22. |
| Task group header (Project, Inbox) | `screens/ProjectDataPanel.tsx`, `screens/InboxScreen.tsx` | **30** | `SUBHEADING_ROW_PX`: `marginTop 10` + small line ~18 + `marginBottom 4`, rounded down. |
| Task group header (Daily "Next todos") | `screens/DailyView.tsx` | **57** budgeted | `GROUP_HEADER_ROW_PX`. The header renders at its natural height (`common.subheading` + `marginTop 12` ≈ 42); the budget leaves room on purpose. |

Pattern for a new row type: give it a height function (or one fixed height) that matches the
style exactly, pass that height to the row, clip overflow, cap lines with `numberOfLines`,
set `includeFontPadding: false` on its text, and top-align it.

## 4. Pagination (`ui/pagination.ts`, `ui/PagedSection.tsx`)

Lists are paged **by height, not by a fixed row count.**

- **`usePagedByHeight(rows, rowHeight, viewportHeight, resetKey?, jumpTo?)`** fills a page
  greedily: starting at the page's first row, it adds rows while the sum of `rowHeight(row)`
  stays within `viewportHeight`. A page always holds at least one row, even an oversize one.
  Page boundaries are found lazily, one page at a time, and remembered for paging back. The
  current page survives data reloads and only moves back if that page is gone; `resetKey`
  jumps to page 0 (a genuinely different list, e.g. another folder) and `jumpTo` jumps to the
  page that holds a given row index.
- **`PagedSection`** is the shared list box: one header line (title left; `+N` hidden count and
  ‹ › arrows right, shown only when the list has more than one page), an optional `subHeader`,
  then the row box with `overflow: hidden`. The total height is the same whether the list has
  zero, one or many rows; `emptyHint` fills the same box.
- **Self-measuring (the normal case).** When `viewportHeight` is omitted, `PagedSection`'s root
  and row box become `flex: 1`, and the row box reads its real height with `onLayout`
  (`ui/useMeasuredHeight.ts`). Flexbox, not a hand-written formula, decides how much room the
  list gets. This needs a bounded `flex: 1` parent chain. On the first render (before
  `onLayout`) the page shows one row; the next render shows the real page. A measured box
  under 50 dp is logged as suspicious (usually a greedy sibling above it). Stacked sections
  share a column by flex weight, e.g. Project panel Todos : Meetings = 4 : 3 and Inbox Tasks :
  Meetings = 8 : 6 (`docs/dev/history/technical-design-flex-weight-stacking.md`).
- **Explicit `viewportHeight`.** A few callers still pass a fixed height:
  - `ui/DailyFocusPanel.tsx`: `fileBrowserViewportHeightPx(PAGE_SIZE.dailyFocusPanel)` =
    5 × 42 = **210 dp** for its Projects/Areas file lists.
  - `screens/ItemsList.tsx`, Areas tab, right column "On Hold": `FULL_VIEWPORT_PX` ≈ 1700, built
    from the 1872 px panel height. That is larger than the real column (about 1150 dp, see §6),
    so rows past the visible box can be cut off.
- **`PAGE_SIZE`** in `ui/pagination.ts` still lists per-list row counts, but the only entry the
  code reads is `PAGE_SIZE.dailyFocusPanel` (above). The other entries are not used for
  paging.

When a paginated list changes, check it on the device with realistic data: the last row should
end close to the bottom of its box, and no row should be cut off.

## 5. Element budget

Numbers for sketching a screen before it runs on the device. All values are **dp**, taken from
each component's `StyleSheet`. Where a component has no fixed height, the value is padding +
borders + one text line (§2 line heights) and is marked "~".

### 5.1 Global chrome (on every screen, once)

| Element | File | Height (dp) | Composition |
|---|---|---|---|
| Top tab bar | `ui/TabBar.tsx` | **~46** | `paddingTop 8` + tallest item (close button `paddingVertical 6 × 2` + medium line ~21 ≈ 33; tab buttons ≈ 31) + `paddingBottom 4` + border 1. |
| Status slot | `ui/status/StatusFrame.tsx` | **36** | `STATUS_SLOT_HEIGHT`, always reserved under the tab bar, empty or not (`docs/dev/history/technical-design-status-slot.md`). |
| Screen top padding | `common.container` | **16** | `SPACING.base`. |
| Screen side padding | `common.container` | **16 each side** | Usable width ≈ 994 − 32 = **962 dp**. |
| Screen bottom padding | per screen | **0–40** | Settings' content has `paddingBottom 40`; most screens have none. |
| Two-column split | `common.column` / `common.columnLeft` | **16 gutter** | Both columns `flex: 1` → each ≈ (962 − 16) ÷ 2 ≈ **473 dp** wide (see §1 on the 678 estimator width). |

So every screen spends **~98 dp** (46 + 36 + 16) before its own content, leaving about
**1227 dp** of height for a single column, or for each column of a two-column screen.
(`screens/ItemsList.tsx` uses `GLOBAL_CHROME_PX = 96` for the same total.)

### 5.2 List rows

See §3. Other single-line rows:

| Row | File | Height (dp) | Composition |
|---|---|---|---|
| Focus slot row | `ui/FocusedItemRow.tsx` | **~37** | `paddingVertical 7 × 2` + medium line ~22 + border 1. |
| Unfocused-next entry (Review) | `screens/review/steps/UnfocusedNextStep.tsx` | **34** / **56** | `UNFOCUSED_ENTRY_CHROME_PX 12` + lines × 22; header row 30, note row 28. |
| Gmail message row (Review) | `screens/review/steps/GmailStep.tsx` | **60** | `GMAIL_ROW_PX`. |

### 5.3 Headers, buttons, chips, inputs

| Element | File | Height (dp) | Composition |
|---|---|---|---|
| `PagedSection` header line | `ui/PagedSection.tsx` | **~31** | `paddingVertical 4 × 2` + small line ~18 + border 1 + `marginBottom 4` (`SECTION_HEADER_ROW_PX` in `screens/ItemsList.tsx`). The arrow buttons (medium text + `paddingVertical 2 × 2` ≈ 26) are taller than the header text, so a header with arrows can be a few dp taller (estimate). Self-measuring lists absorb this. |
| Mini-tab strip | `ui/MiniTabs.tsx` | **~45** | Tab `paddingVertical 6 × 2` + medium line ~22 + underline 2, + row border 1 + `marginBottom 8`. |
| Status pill (Active/On Hold) | `ui/ItemStatusPanel.tsx` | **~36** | `paddingVertical 8 × 2` + small line ~18 + border 2 (plus `marginBottom 8` below). |
| Archive / area pill | `ui/ItemStatusPanel.tsx` | **~36** | Same as the status pill. |
| Flow/tag chip | `ui/FlowStateChips.tsx`, `ui/TagChips.tsx` | **~32** | `paddingVertical 6 × 2` + small line ~18 + border 2. Matches QuickAdd's row 3 `minHeight: 32`. |
| Pill button | `ui/PillButton.tsx` | **~30** / **44** | Normal: `paddingVertical 5 × 2` + small line ~18 + border 2. Large: `minHeight 44`. |
| Text input (`ClipboardTextInput`) | `ui/ClipboardTextInput.tsx` | **~33** | `paddingVertical 5 × 2` + medium line ~21 + border 2 (as budgeted in `screens/ItemsList.tsx`'s `CREATE_ROW_PX`). |

### 5.4 The QuickAdd card

`ui/QuickAddWidget.tsx`'s card (Project panel, Inbox, Week, Review) is the largest recurring
block outside lists. Budget it as one block:

| Internal row | minHeight (dp) | Purpose |
|---|---|---|
| Row 1 | 22 | Todo / Meeting / Note tabs |
| Row 2 | 36 | Main text input |
| Row 3 | 32 | Flow-state and tag chips |
| Row 4 | 32 | Attach cluster, date, Add button |

Card total ≈ `padding 10 + 22 + 6 + 36 + 6 + 32 + 6 + 32 + padding 10 + border 2` ≈ **162 dp**
(minimum; the capture screen's variant adds more rows).

### 5.5 Section headings and labels

| Style | Used for | Height (dp) | Composition |
|---|---|---|---|
| `common.subheading` (small, 600 weight, 60% opacity) | Section labels, group headers | **~30–32** | `marginTop 8` (10 in the Project and Inbox screens' own `subheading`) + small line ~18 + `marginBottom 4`. |
| `sectionTitle` (medium, 600 weight) | Panel/column titles | **~30–32** | Medium line ~22 + `marginBottom 8–10`; no top margin of its own. |
| Screen heading (`FONT.large`, 700 weight) | Rare screen titles | **~27+** | Large line ~27 + whatever margin its row adds. |
| `common.divider` | Thin rule between blocks | **25** | `height 1` + `marginVertical 12 × 2`. |

## 6. How to budget a screen

1. Start from **~1325 dp** of screen height and subtract the **~98 dp** global chrome (§5.1).
   That is the height your content can use.
2. Walk down the screen in render order and subtract each fixed element: headings (§5.5), the
   QuickAdd card (§5.4), mini-tab strips (§5.3), and for each list its `PagedSection` header
   line (§5.3, ~31 dp).
3. What is left is the list box. With self-measuring `PagedSection`s, flexbox hands that
   space to the list automatically; your budget tells you how many rows a page will show:
   divide the box height by the row height (§3). If two lists share a column, split the box
   by their flex weights first.
4. On a two-column screen, budget each column on its own. Both columns share the same top and
   bottom; for row *width*, use the ~473 dp column width (§5.1).

### Worked example: Projects tab (`screens/ItemsList.tsx`)

The Projects tab has a create row on top, then two columns: "Active" on the left (one list) and
"On Hold" over "Done — awaiting review" on the right (two lists, equal `flex: 1`, 12 dp gap).

- Screen height: **~1325**
- Global chrome (§5.1): **− 98** → ~1227
- Create row (input ~33 + `marginBottom 12`, `CREATE_ROW_PX`): **− 45** → ~1182 per column

Left column, "Active":

- `PagedSection` header line: **− 31** → **~1151 dp** row box
- One-line entries are 38 dp (§3) → **~30 projects per page**; two-line entries are 60 dp →
  ~19 per page.

Right column, "On Hold" and "Done":

- Gap between the halves: **− 12** → 1170, split equally → ~585 each
- Each `PagedSection` header line: **− 31** → **~554 dp** row box each
- → **~14 one-line projects per page** in each half.

The left column pages itself by measured height, so these counts come out of flexbox on the
device; the budget lets you predict them before you run the screen. On the Areas tab, the
right column "On Hold" uses the fixed `FULL_VIEWPORT_PX` ≈ 1700 instead (§4), which is more
than the ~1151 dp the column really has.

## 7. Color: grayscale only, never a signal

The hardware has no color channel. `ui/theme.ts` keeps all shared colors in `COLORS`; the accent
is black (`COLORS.accent`, with `COLORS.accentText` white) and is used only as a fill or border
color - chip, pill and button backgrounds, the active-tab underline, the editing row's left
border - never as plain text color, where it would read like body text. Any distinction that a
color screen would show with hue (active vs. inactive, selected vs. unselected) uses weight,
fill, border, underline or a glyph instead. Todo rows are the model: the checkbox is a glyph
(☑/☐ in `ui/TaskRow.tsx`), and the labels (`#next`, `#now`, `#w/f …`, `#due …` in
`ui/TaskLabels.tsx`) are set apart from the title by a smaller, bolder font, not by color.
