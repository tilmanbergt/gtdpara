# Device rendering reference

> **About this document.** The measured and derived facts about how gtdpara renders on the
> Supernote A5 X - screen size and density, fonts, fixed row heights, pagination and a
> per-element space budget - and the method for budgeting a new screen. It describes the current
> code and device, in present tense, and is the reference every UI design is checked against
> (`DEVELOPMENT-POLICY.md` §4). Keep it true: when a style value, row height or paging rule
> changes, update the matching number here in the same change; when a number is an estimate,
> say so. Open questions and planned tuning go to the internal backlog, not here; history stays
> in the technical designs and git.

## 1. Screen facts

- **Device: Supernote A5X.** 10.3" e-ink panel, **1404 × 1872 px, 226 PPI**,
  portrait. Confirmed by Tilman 2026-09-14.
- **1 React Native dp = 1.41 device px on this screen (226 PPI ÷ 160).**
  *Corrected 2026-09-29* (docs/dev/history/technical-design-meeting-lists.md §1): this
  section used to say 1 dp ≈ 1 px, because the screenshots came in 1404 px
  wide - but that is the panel's pixel width, not its dp width. Measured on
  Tilman's Week and Month screenshots, every style value renders 1.41× in
  device pixels. So the screen is **~994 × 1325 dp**, one of the two
  columns is **~473 dp** wide, and a 1404 px wide screenshot must be divided
  by 1.41 before its measurements are compared with style values. Style
  numbers (`fontSize`, `padding*`, `height` …) are dp. Known leftover:
  `COLUMN_WIDTH_PX = 678` (ui/itemEntryRow.ts, InboxScreen, FileBrowserPane,
  used by the task/item line estimators) is a px figure used as dp; it is
  left as is for now because those estimators were tuned against it on the
  device - changing it would re-page every task list (open follow-up).
- **Grayscale/monochrome e-ink only.** No color channel exists on the
  hardware. A dev preview or a screenshot rendering something in blue does
  not mean the device shows blue — see §6.
- **No scrolling, anywhere, by design** (`docs/dev/history/technical-design-pagination-edit-reuse.md`).
  Every list is a fixed-height box paged via ‹Prev/Next›, specifically
  because redrawing an arbitrary/growing scroll region is expensive on
  e-ink; a fixed-size box is cheap and predictable to refresh. This is why
  §4/§5 below (pagination + the element budget table) are the main levers
  for "does this screen use its space well" — there's no scroll to fall
  back on if a budget is wrong.

## 2. Typography (`ui/theme.ts` → `FONT`)

Only three sizes exist project-wide, by design (collapsed from eight
scattered 13-22px sizes pre-cleanup). New UI should reuse one of these
three rather than introducing a fourth:

| Constant | Value (px) | Use |
|---|---|---|
| `FONT.large` | 22 | Screen/section headings only — rare; most screens in day-to-day use don't show one at all. |
| `FONT.medium` | 17 | The workhorse size — list item text, tab labels, buttons, most body text, inputs. |
| `FONT.small` | 15 | Captions, badges, tags, pagination footer text, hints, breadcrumbs. |

**Line-height caveat:** none of these set an explicit `lineHeight` in code,
so the actual rendered line box comes from Android/Roboto's own font
metrics rather than a value this app controls. The estimates in §5 below use
a ~1.2× multiplier (a typical system-font ratio) — `large`→~27px,
`medium`→~21px, `small`→~18px — which is the single biggest source of
uncertainty in this whole document. Two ways to close that gap later: pull
an exact measurement off a device screenshot with a known reference size,
or set `lineHeight` explicitly on each `FONT` size in `theme.ts` (which
would also make row-height math exact instead of estimated, for free).

**Descender-clipping bugfix (2026-09-17, [[feature_pagination_fixed_height]]):**
Tilman found `g`/`y`/`p`-style descenders getting clipped exactly at each
row's own fixed-height boundary on `screens/ItemsList.tsx`'s Projects/Areas
rows, with visible unused headroom above the glyphs — not a symmetric
top+bottom shortfall. Root cause wasn't the ~1.2× line-height estimate being
too small overall; it's Android's default `includeFontPadding` (`true`)
reserving extra space *above* cap-height for arbitrary-script accents
without a matching reservation *below* the baseline for descenders, inside
rows that are both fixed-height and top-aligned (deliberately, per §3) so
any shortfall shows up entirely as bottom clipping. Setting
`includeFontPadding: false` on `ItemsList.tsx`'s row `Text` style fixed it,
confirmed on-device — no change to the row-height budget numbers needed.
Not yet rolled out to `TaskRow.tsx`/`MeetingRow.tsx`/`FileBrowserPane.tsx`,
which share the same unset-`includeFontPadding` default and the same
22px-line-height convention, so are presumed to have the same latent issue.

## 3. Fixed list-row heights

Rows are deliberately fixed-height rather than intrinsic-to-content, so a
page never reflows when one row's content is shorter or longer than its
neighbor's, and every row on a paginated page is the same height
(`docs/dev/history/technical-design-pagination-edit-reuse.md` §3):

| Row | File | minHeight | paddingVertical | Notes |
|---|---|---|---|---|
| Task row | `ui/TaskRow.tsx` | 64 | 7 | Reserves space for up to 2 lines of text + badges, regardless of actual content length. |
| Meeting row, 1-line | `ui/MeetingRow.tsx` | **37 (fixed)** | 7 | Since 2026-09-29 (docs/dev/history/technical-design-meeting-lists.md §2.3): one 22 dp line - time column (58 dp for a time, 104 dp for "29.9. 10:00"), title, source `#abbrev`, icons. `MEETING_ROW_HEIGHT.oneLine`. |
| Meeting row, 2-line | `ui/MeetingRow.tsx` | **57 (fixed)** | 7 | 22 dp title line + 18 dp source line (or the title wrapping onto line 2 at 2 × 21 dp when there is no source). `MEETING_ROW_HEIGHT.twoLine`. Every meeting list has a 1-line/2-line switch (session-only memory per list). |
| Week chip | `ui/MeetingChip.tsx` | **34 (fixed)** | – | Week overview grid, 4 × 2 chips per weekday, 2 × 2 per weekend day, + 30 dp day header. |
| Group header (Upcoming/Past) | `ui/MeetingList.tsx` | **30 (fixed)** | – | |

The old variable-height meeting rows (normal 56 dp with estimated title
lines, `compact` 38 dp for the old Week column) were removed on 2026-09-29.

Pattern for any new row type: pick one fixed `minHeight`, reserve blank
space for optional lines instead of letting them collapse the row, and only
add a compact variant once a specific screen is proven too tall at the
normal size — don't pre-optimize a second size before there's evidence one
screen needs it.

## 4. Pagination (`ui/pagination.ts` → `PAGE_SIZE`)

Every list pages through a **plain integer row count**, never measured from
layout at runtime (measuring would mean render → measure → re-render, which
is its own e-ink-unfriendly reflow). That means every `PAGE_SIZE` entry is a
guess until checked against a real screenshot with realistic data in it.

### What the 2026-09-14 screenshots showed, list by list

- **Current tab (Project/Area panel), Meetings section**
  (`projectMeetings: 3`) — visible slack. The list + pagination footer stop
  well short of the panel's actual bottom (the Status block below it).
  Candidate to raise.
- **Inbox tab, Tasks** (`inboxTasks: 5`) **and Meetings**
  (`inboxMeetings: 3`) — same shape: both sections stop with real room left
  in the column before the panel ends. Candidates to raise.
- **Daily tab, Calendar column** (`dailyCalendarMeetings: 5`) — exactly
  fills its own budget (5 rows shown, "Page 1 of 2"), but still leaves a
  visible gap before the Focus/Projects/Areas strip underneath it.
  Candidate to raise.
- **Daily tab, Open-tasks column** (`column: 10`, grouped by project/area
  with header rows apparently counted against the same budget) — packs
  tightly: 6 task rows + 4 group headers = 10, no visible slack. Leave as
  is.
- **Week view, per-weekday meetings** (`weeklyDayMeetings: 3`,
  `weeklyWeekendMeetings: 1`, using `MeetingRow`'s `compact` mode) — packs
  tightly; Monday's 3 rows run straight into the pagination footer with no
  gap. Already close to right, don't touch without new evidence.
- **Projects / Areas tabs** (`full: 23`) — not a pagination problem in this
  data: there just aren't 23 projects/areas yet. The blank space below the
  list is a content fact, not a tuning signal — leave alone.
- **Review, step 1 ("Overview")** — not a paginated list at all, just four
  static stat lines. Its whitespace is inherent to that step's content and
  unrelated to `PAGE_SIZE`.

### How to use this section going forward

Whenever a change touches a paginated list, or a new one is added: get a
fresh on-device screenshot of it filled with realistic data, and check
whether the last row + pagination footer lands close to the section's real
bottom edge — a big gap means under-tuned (raise it), the footer landing at
or past the visible edge means over-tuned or right (don't raise further
without new evidence). §5 below now gives a way to estimate this *before*
that screenshot exists, for a first draft.

## 5. Element & row-height budget

The reusable numbers for sketching a new screen before it's ever run on
device. All figures are px on the 1404×1872 panel (§1), sourced directly
from each component's own `StyleSheet.create` block. Where a component has
no fixed `minHeight` (most single-line rows), the height shown is
*intrinsic*: padding × 2 + one text line at the estimated line-height from
§2.

### 5.1 Global chrome (present on every screen, once)

| Element | File | Height (px) | Composition |
|---|---|---|---|
| Top tab bar | `ui/TabBar.tsx` | **~44** | `paddingTop 8 + tab paddingVertical 4×2 + text line ~21 + border 2 + container paddingBottom 4 + border 1` (was ~80 with `paddingTop 40`/`paddingBottom 8` until 2026-09-29) |
| Status slot | `ui/status/StatusFrame.tsx` | **36** | `STATUS_SLOT_HEIGHT` — always reserved under the tab bar (and at the top of focus mode and the capture screen), empty or not (`docs/dev/history/technical-design-status-slot.md`) |
| Screen content top padding | most screens' own `container` style | **16** | `paddingTop: 16` — consistent across screens (matches `commonStyles.common.container`'s `SPACING.base`) |
| Screen content side padding | same | **16 each side** | Usable content width = `1404 − 16×2 = 1372px` |
| Screen content bottom padding | varies by screen | **0–40** | Settings' inner `content` sets 40; most others rely on natural end-of-content with no explicit bottom pad |
| Two-column split (`middleRow`/`body`) | Daily/Week/Inbox | **16px gutter** | `columnLeft: {marginRight: 16}`, both columns `flex:1` → each column ≈ `(1372 − 16) / 2 ≈ 678px` wide |

So: **every screen starts with ~96px already spent** (44 tab bar + 36 status slot + 16 top
content padding) before any of its own content, leaving roughly **1776px**
of vertical room on a single-column screen, or per-column room on a
two-column one, minus whatever that screen's own header/section rows add
before the section you're placing.

### 5.2 List rows (single line, intrinsic height)

| Row | File | Height (px) | Composition |
|---|---|---|---|
| File/folder browser entry | `ui/FileBrowserPane.tsx` | **~41** | `entryRow paddingVertical 5×2 + entry paddingVertical 5×2 + text line ~21` (padding applied twice — on the row wrapper and the text) |
| Project/Area list entry | `screens/ItemsList.tsx` | **~33** | `paddingVertical 6×2 + text line ~21` |
| Focus-panel slot row | `ui/DailyFocusPanel.tsx` / `ui/WeeklyFocusPanel.tsx` | **~36** | `paddingVertical 7×2 + text line ~21 + border 1` |
| Google Calendar row | `ui/GoogleCalendarPanel.tsx` | **37** | Since 2026-09-29 the same as a 1-line meeting row: `paddingVertical 7×2 + line 22`, MeetingRow's time column width and wording |

### 5.3 Buttons, chips, pills, inputs

| Element | File | Height (px) | Composition |
|---|---|---|---|
| Status pill (Active/On Hold) | `ui/ItemStatusPanel.tsx` | **~34** | `paddingVertical 8×2 + text (small) line ~18`, width intrinsic to label |
| Archive / area-assignment pill | `ui/ItemStatusPanel.tsx` | **~34** | same padding as status pill |
| Flow/tag chip (w/f, Maybe, Someday, #tag) | `ui/FlowStateChips.tsx` / `ui/TagChips.tsx` | **~32** | `paddingVertical 6×2 + text (small) line ~18 + border 2` — matches `QuickAddWidget`'s own chip row `minHeight: 32` exactly |
| Settings text input | `screens/Settings.tsx` | **~39** | `paddingVertical 8×2 + text line ~21 + border 2` |
| Settings "Save" button | `screens/Settings.tsx` | **~53** | `paddingVertical 12×2 + text line ~21` (marginTop 8 sits *above* this, not inside it) |
| Pagination footer band | `ui/PageControls.tsx` | **~43** | `border 1 + paddingTop 8 + marginTop 4 + button paddingVertical 6×2 + text (small) line ~18` — only rendered when a list has 2+ pages |
| Mini-tab strip (Todo/Meeting, Meetings/Google, Focus/Projects/Areas) | `ui/MiniTabs.tsx` | **~44** | `tab paddingVertical 6×2 + text line ~21 + border 2, + row marginBottom 8 + border 1` |

### 5.4 The quick-add widget (Current/Inbox/Week/Review's "New task" card)

`ui/QuickAddWidget.tsx`'s card is the single most space-hungry recurring
element outside of list rows — worth budgeting as one block:

| Internal row | minHeight (px) | Purpose |
|---|---|---|
| Row 1 | 22 | Todo/Meeting tabs |
| Row 2 | 36 | The main text input |
| Row 3 | 32 | Flow-state/tag chips |
| Row 4 | 32 | Attach cluster / date / Add button |

Card total ≈ `padding 10 + row1 22 + gap 6 + row2 36 + gap 6 + row3 32 + gap
6 + row4 32 + padding 10 + border 2` ≈ **~162px**. This is a fixed cost on
every screen that includes it (Current tab, Inbox tab, Week tab) — budget
it before the list(s) below it, the same way §7's worked example does for
Settings' fields.

### 5.5 Section headings / labels

| Style | Used for | Height (px) | Composition |
|---|---|---|---|
| `common.subheading` / per-screen `subheading` (small, 60% opacity) | "Todos", "Meetings" section labels | **~30** | `marginTop 8/10 + text line ~18 + marginBottom 4` |
| `groupLabel` (uppercase, small, 60% opacity) | "ACTIVE"/"ON HOLD"/"DONE" group headers in Projects/Areas lists | **~38** | `marginTop 16 + text line ~18 + marginBottom 4` |
| `sectionTitle` (medium, 600 weight) | Panel/column titles ("Focus", "Files", panes in Inbox) | **~35** | `text line ~21 + marginBottom 10` (no top margin of its own — inherits whatever precedes it) |
| Screen heading (`FONT.large`, 700 weight) | Inbox's "Inbox" title, Week's "Week 38 · 2026" | **~27–31** | `text line ~27` + a few px from the row it sits in (`headerRow marginBottom 20` in Inbox) |

## 6. How to budget a screen

1. Start from **1872px** total height, subtract the **~96px** global chrome
   (§5.1: tab bar + content top padding) → your screen's real vertical
   budget.
2. Walk down the screen in rendering order, subtracting each fixed element
   as you place it: a heading (§5.5), the quick-add card if present (§5.4),
   a mini-tab strip if present (§5.3), then for each list section: its own
   subheading (§5.5, ~30px) + `N × row height` (§3 or §5.2, whichever row
   type) + the pagination footer (§5.3, ~43px) *if* `N` is less than the
   section's real item count.
3. Whatever's left after every section is placed is your slack (or deficit)
   for that screen. A large positive remainder on a paginated section is
   exactly the §4 "candidate to raise" signal — you can now estimate *how
   much* to raise it, roughly `remaining px ÷ row height`, before ever
   touching the device.
4. For a two-column screen, run this independently per column (§5.1 gives
   each column's width, not height — height budget is shared, since both
   columns start and end at the same vertical bounds).

### Worked example: Settings → Folders tab

Cross-checked against the 2026-09-14 Settings screenshot, which showed a
large blank area below "Reset to defaults" — here's why, in px:

- Global chrome: **96** (§5.1)
- Folders/Focus/Calendar mini-tab strip: **44** (§5.3)
- 5 folder fields (Base root, Projects, Areas, Resources, Archive), each
  `label (~24) + input (~39) + path-preview line (~22) + field marginBottom
  18` ≈ **103px × 5 = 515**
- Save button (`marginTop 8` + button `~53`): **61**
- Reset link (`marginTop 20` + text line `~18`): **38**
- Settings' own bottom content padding: **40**

Total consumed ≈ `96 + 44 + 515 + 61 + 38 + 40 = 794px` out of **1872px** —
leaving **~1078px, well over half the screen, genuinely empty**. That
matches the screenshot closely: everything below "Reset to defaults" was
blank. Concretely, that leftover room is enough for another ~10 folder-style
fields, or (more realistically) the Focus/Calendar tabs' own settings plus
a good amount of headroom — worth knowing before assuming Settings needs a
denser layout.

## 7. Color: grayscale only, never a signal

The hardware has no color channel. `ui/theme.ts` keeps all shared colors in `COLORS`; the accent
is black (`COLORS.accent`, with `COLORS.accentText` white) and is used only as a fill or border
color - chip, pill and button backgrounds, the active-tab underline, the editing row's left
border - never as plain text color, where it would read like body text. Any distinction that a
color screen would show with hue (active vs. inactive, selected vs. unselected) uses weight,
fill, border, underline or a glyph instead. `ui/TaskBadges.tsx`'s Unicode badges (☑/☐ done,
▷/▶ next/now, ⚠/📅 overdue/due) are the model: grayscale-safe by construction.

