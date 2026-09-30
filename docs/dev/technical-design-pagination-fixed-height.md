# Technical Design: Fixed-Height Paginated List Sections

Status: draft, not yet implemented. Requirements clarified across three
rounds of chat plus an interactive HTML mockup (Artifact "Refile & Page
Fit", now at Rev 2) — see project memory `feature_pagination_fixed_height.md`
for the full clarification log. This doc is the concrete implementation
plan requested once that last mockup round converged, per this project's
own workflow (clarify → design → implement).

## 0. Recap: what's changing and why

Today's pagination (`ui/pagination.ts`'s `usePagination` + `ui/
PageControls.tsx`, from `technical-design-pagination-edit-reuse.md`)
already avoids `ScrollView`/reflow, but two things are changing:

- **Chrome merges to one line.** Header text (a folder breadcrumb, a
  weekday, a flow-state group name…) currently sits on its own line above
  the list, with `‹ Prev / Page N of M / Next ›` on its own line below.
  These merge into a single line: header left, `‹`/`›` arrows right — no
  "page N of M" text.
- **Row count becomes height-driven, not hand-tuned.** Page size today is
  a fixed row-count constant per list type (`PAGE_SIZE.*`, "tuned
  starting points, refine on-device"). It becomes a fixed pixel-height
  content box that fits as many rows as their *actual* rendered heights
  allow, with no need to precompute how many pages that adds up to.

Getting from "fixed row count" to "fixed pixel height" needs a
trustworthy per-row height, which is where the row-height correction from
the second feedback round comes in (§2) — real rows vary 1–3 lines by
title length today (`minHeight`, not `height`), which Rev 1 of this
design got wrong.

## 1. New primitives

### 1.1 `usePagedByHeight`

Add to `ui/pagination.ts`, **alongside** `usePagination`/`Paged<T>`/
`PAGE_SIZE`, not replacing them outright — `DailyFocusPanel`'s fixed
focus-slot section is a flat, tiny, never-overflowing list with no
per-row height variance worth this machinery, and stays on the existing
primitive. Every list in the inventory (§5) below moves to the new one.

```ts
export interface PagedByHeight<T> {
  page: number;
  pageItems: T[];
  canPrev: boolean;
  canNext: boolean;
  goPrev: () => void;
  goNext: () => void;
}

export function usePagedByHeight<T>(
  rows: T[],
  rowHeight: (row: T) => number,
  viewportHeight: number,
  resetKey?: string | number,
): PagedByHeight<T>
```

No `totalPages` — deliberately, per the "no page N of M, no need to
precompute the overall page count" requirement. Mechanism:

- A lazily-grown `pageStarts: number[]` ref, seeded `[0]`. `pageStarts[i]`
  is the row-index page `i` starts at — discovered on the way forward,
  never precomputed for pages not yet visited.
- **Every render**, `pageItems` for the *current* page is recomputed by
  walking forward from `pageStarts[page]` over the live `rows` array,
  summing `rowHeight(row)` and stopping *before* a row would push the
  running total past `viewportHeight` (an empty page always shows at
  least one row even if it's individually taller than the viewport — that
  row's bottom just clips, rather than the page rendering nothing). This
  walk is cheap: bounded by however many rows fit on one page, not by the
  list's total length, and it re-running every render (rather than being
  cached) is what keeps a live edit (a task toggled done, a title
  shortened) reflected immediately without extra invalidation logic —
  same "recompute the derived view each render" style `usePagination`
  itself already uses.
- `goNext`: if `pageStarts[page + 1]` isn't known yet, this walk's stopping
  point *becomes* `pageStarts[page + 1]` before `page` advances. If it's
  already known (the user paged forward, then back, then forward again),
  reuse it as-is rather than re-walking.
- `goPrev`: `page > 0` decrements; that page's start is already recorded.
- `canNext`: `pageStarts[page] + pageItems.length < rows.length` — no
  lookahead walk needed, since `pageItems.length` for the current page is
  already known from the same-render walk above.
- `canPrev`: `page > 0`.
- `resetKey` (same convention as `usePagination`): a change resets
  `pageStarts` to `[0]` and `page` to `0`. A `rows` identity/length change
  *alone* does not reset — matches the existing "preserve page across
  reloads, clamp down only if now out of range" policy. Clamping: if
  `pageStarts[page] >= rows.length` after some rows disappeared, walk
  `page` back to the last index whose recorded start is still in range.

Decoupling *pagination bookkeeping* (this hook) from *how a row's height
is determined* (`rowHeight`, a plain function) is what lets the row-height
correction in §2 fold in as "a smarter `rowHeight` implementation" without
changing this hook's shape at all — the feasibility question from the
first round of feedback resolves here.

### 1.2 `PagedSection` component

New `ui/PagedSection.tsx`. Replaces the separate heading-`Text` +
`PageControls` pair at every call site in §5, and supersedes `ui/
PageControls.tsx` once every caller has moved (§8 sequencing — not
deleted upfront).

```tsx
interface PagedSectionProps<T> {
  header: string;
  /** Optional second line between the header/arrows row and the fixed-
   * height item box - e.g. GoogleCalendarPanel's Refresh/Show-existing
   * row (§3.3). Its rendered height is the caller's responsibility to
   * account for in `viewportHeight`, same as every other fixed constant
   * in this design (see PAGE_SIZE's own "hand-tuned, retune on-device"
   * convention) - PagedSection itself doesn't measure it. */
  subHeader?: React.ReactNode;
  rows: T[];
  rowHeight: (row: T) => number;
  viewportHeight: number;
  resetKey?: string | number;
  renderRow: (row: T) => React.ReactNode;
  /** Shown inside the fixed-height item box when rows.length === 0 - the
   * box itself still renders at full `viewportHeight` (§1.3), this is
   * only what fills it. */
  emptyHint?: string;
  textColor: string;
  borderColor: string;
}

export default function PagedSection<T>({
  header, subHeader, rows, rowHeight, viewportHeight, resetKey, renderRow, emptyHint, textColor, borderColor,
}: PagedSectionProps<T>): React.JSX.Element {
  const paged = usePagedByHeight(rows, rowHeight, viewportHeight, resetKey);
  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={[styles.header, {color: textColor}]} numberOfLines={1}>{header}</Text>
        {/* Arrows are only rendered when that direction is actually
           available (Tilman's original spec: "arrow left/right, if
           applicable") - NOT always-rendered-but-disabled the way the
           old PageControls worked. Most boxes, most of the time, will
           show neither arrow at all, because most lists fit on one page
           - see §1.3 for why that doesn't destabilize the row's height. */}
        {(paged.canPrev || paged.canNext) && (
          <View style={styles.arrows}>
            {/* "+N" hidden-count label (added 2026-09-15, during Batch 1's
               on-device smoke test - not in the original mockup rounds):
               N = rows.length - pageItems.length, i.e. "how many exist
               that aren't visible on THIS page" - not a countdown to the
               end of the list, so an 8-item list showing 3 per page reads
               "+5" on every page, then "+6" on a final partial page of 2.
               Same visibility condition as the arrows (N is only nonzero
               exactly when canPrev||canNext is true), so no separate
               check. Muted/small, same visual weight the old PageControls
               footer text had - an FYI, not a control. */}
            <Text style={[styles.hiddenCount, {color: textColor}]}>
              +{rows.length - paged.pageItems.length}
            </Text>
            {paged.canPrev && (
              <Pressable onPress={paged.goPrev} hitSlop={8}>
                <Text style={[styles.arrow, {color: textColor}]}>‹</Text>
              </Pressable>
            )}
            {paged.canNext && (
              <Pressable onPress={paged.goNext} hitSlop={8}>
                <Text style={[styles.arrow, {color: textColor}]}>›</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
      {subHeader}
      <View style={[styles.viewport, {height: viewportHeight}]}>
        {rows.length === 0 && emptyHint
          ? <Text style={[common.hint, {color: textColor}]}>{emptyHint}</Text>
          : paged.pageItems.map(renderRow)}
      </View>
    </View>
  );
}
```

Notes:

- `styles.headerRow` fixes its own height via padding/line-height, not
  via the arrows' presence — so the header line itself never grows or
  shrinks depending on whether zero, one, or two arrows are showing this
  time (only the trailing content's *width* varies, never the row's
  height). This is what lets "arrows mostly aren't there" coexist with
  "nothing about this section's total height ever changes" (§1.3).
- `styles.viewport` gets a defensive `overflow: 'hidden'` — with a
  correct `rowHeight`, `pageItems` never exceeds what fits by
  construction of the greedy walk, but this keeps a bug in one caller's
  `rowHeight` from spilling into whatever renders below it rather than
  just clipping in place.

### 1.3 The fixed-height guarantee, stated explicitly

Every `PagedSection` instance has one, constant, known-in-advance total
height: `headerRow` (fixed by style, not content) + `subHeader` (fixed,
when present) + `viewportHeight` (the prop, a plain constant the caller
picks — same "hand-tuned starting point, retune on-device" convention
every `PAGE_SIZE` entry already used). **This holds regardless of how
many rows exist** — zero, one, or a full page's worth all render inside
the same `viewportHeight` box; an empty or near-empty page never
shrinks the box, and switching between two pages with a different number
of rows on each (the last page of a list is very often shorter than the
others) never changes the box's height either. This is the property that
makes it safe to drop a `PagedSection` into any layout — the two-column
`ItemsList` split (§3.5) and the half-height boxes it needs depend on
this holding exactly, not approximately.

## 2. Row height: the corrected mechanism

`minHeight`, not `height`, is what every row style declares today
(`TaskRow`'s `minHeight: 64` doc comment: "reserves space for up to 2
lines… regardless of content length" — true for the *minimum*, not a cap
on the *actual* rendered height, since `numberOfLines={2}` still lets a
2-line title genuinely take the full 2 lines and a 1-line title collapse
if `minHeight` weren't there). For `usePagedByHeight`'s greedy fill to
work, `rowHeight(row)` has to match what actually renders — this section
is that prediction.

### 2.1 Pluggable line estimator

```ts
// ui/textLineEstimator.ts
export interface TextLineEstimator {
  estimateLines(text: string, availableWidthPx: number, fontSizePx: number): number;
}
```

Default implementation, `CharClassLineEstimator`: buckets characters into
narrow / average / wide width classes (narrow: `i l . , ' | !` etc.;
wide: uppercase letters, digits, `M W @` etc.; everything else average),
sums a per-class weighted width estimate for `text`, divides by
`availableWidthPx`, rounds up, clamps to a caller-supplied max line
count. This is deliberately simpler than real text shaping — it's the
same trade-off Tilman proposed and asked to be assessed: an occasional
blank gap (over-prediction: the row reserves a line it doesn't need) or
an occasional ellipsis-truncated line (under-prediction: `numberOfLines`
already caps the render at exactly the reserved height, so it clips
cleanly in place rather than spilling into the next row) are both
self-correcting failure modes, not something that breaks the fixed-height
guarantee itself.

**Pluggability, per the explicit "make the whole calibration swappable,
not just constants" requirement**: the interface takes only primitives
(text, width, font size) and returns an integer — none of
`CharClassLineEstimator`'s internal character-class weights leak through
it, so a wholly different future approach (a lookup table calibrated
against real on-device rendering, a canvas-measurement build step, a
different algorithm entirely) can replace it without touching any call
site. One module-level swap point:

```ts
export const activeLineEstimator: TextLineEstimator = new CharClassLineEstimator();
```

### 2.2 Per-component row-height helpers

- **`TaskRow`** (the component that actually varies 1–3 lines by title
  length): reserve a conservative fixed `BADGE_ALLOWANCE_PX` from the
  available text width before estimating, since the title text wraps
  together with `TaskBadges` on the same line (`rowTextLine`'s
  `flexWrap`) — biased toward over- rather than under-predicting, since a
  badge-heavy row under-predicting would be the more visible failure mode.
  ```ts
  export function taskRowHeight(task: Task, columnWidthPx: number, context: TaskBadgeContext): number {
    const text = displayTaskText(task, context, false);
    const availableWidth = columnWidthPx - CHECKBOX_WIDTH_PX - BADGE_ALLOWANCE_PX;
    const lines = clamp(activeLineEstimator.estimateLines(text, availableWidth, FONT.medium), 1, 2);
    return ROW_CHROME_PX + lines * LINE_HEIGHT_PX;
  }
  ```
  `TaskRow` gains an optional `height?: number` prop, computed by the
  caller with `taskRowHeight()` the same way it's summed for pagination —
  applied as `[styles.row, ..., height != null && {height}]`, so the
  rendered row matches exactly what pagination assumed. `numberOfLines`
  becomes the same computed `lines` value instead of the current
  hardcoded `2`. `styles.row`'s `minHeight: 64` stays as a defensive
  floor for the (currently nonexistent, but kept optional rather than
  required to avoid a forced ripple through every caller at once) case of
  a caller not passing `height`.
- **`MeetingRow`**: title is always `numberOfLines={1}` (time + title
  concatenated on one line) — real rendered height essentially never
  varies with text length. `meetingRowHeight()` is just the existing
  `minHeight: 34` (`26` compact) returned as a plain constant; the
  estimator isn't involved here at all. Flagging this explicitly so the
  estimator isn't over-applied somewhere it adds nothing.
- **`FileBrowserPane` entries**: currently render with **no**
  `numberOfLines` at all (a genuine gap, not a variant of the
  `minHeight`-vs-`height` issue) — a long folder/file name can wrap 3+
  lines today. Adding `numberOfLines={fileEntryLines(...)}` (clamped to,
  say, 2) alongside a computed height is bundled into this pass as a
  small independent fix (§3.8).

## 3. Per-screen changes

### 3.1 Daily view — display-mode row + Open-tasks reorder

Two of Daily's own rows merge and swap:

- **Display-mode row** (was the standalone `contextIndicatorRow`, top of
  `common.content`, holding just the `#` context pill): the "Focus mode"
  button — today inside the Open-tasks column's own `sectionTitleRow`,
  next to the "Open tasks" label — moves here instead, since both are,
  per the clarifying feedback, "a certain display mode of daily page."
  New row, confirmed left-to-right order: `[# pill or outline] [Focus
  mode button]`, both still top-right, one line.
- **Open-tasks column reorder**: `QuickAddWidget` moves above the
  "Open tasks" header entirely (today it sits inside `columnScroll`,
  *below* a `sectionTitleRow` that no longer exists once its two pieces
  relocate — the label into `PagedSection`'s own header, the Focus-mode
  button into the display-mode row above). This frees the row the old
  `sectionTitleRow` occupied for the new header+arrows line instead.

  ```tsx
  <View style={common.column}>
    <View style={styles.columnScroll}>
      <QuickAddWidget fixedDestination={FIXED_INBOX_DESTINATION} ... />
      {widgetError && <Text .../>}
      <View style={[common.divider, {backgroundColor: borderColor}]} />
      <PagedSection
        header="Open tasks"
        rows={taskRows}
        rowHeight={row => row.kind === 'header' ? GROUP_HEADER_ROW_PX : taskRowHeight(row.entry.task, columnWidthPx, 'flat')}
        viewportHeight={OPEN_TASKS_VIEWPORT_PX}
        resetKey={contextResetKey}
        renderRow={renderFlatTaskRow}
        emptyHint={dailyContext ? `Nothing tagged #${dailyContext}.` : 'Nothing open - inbox zero!'}
        textColor={textColor}
        borderColor={borderColor}
      />
      {tasksActionError && <Text .../>}
    </View>
  </View>
  ```

  `flattenTaskGroups`'s in-sequence group-header rows (`{kind:'header'}`)
  stay exactly as they are today — `rowHeight` just needs its own small
  constant for that row kind alongside `taskRowHeight` for entry rows.

### 3.2 Daily Calendar column — 3-tab restructure

Today: a `<Text>Calendar</Text>` label, then a `MiniTabs` row
(Meetings/Google), then — only inside the Meetings tab — an inner
Today/Tomorrow toggle row. Per the clarified feedback, this collapses:

- The standalone "Calendar" label is removed entirely (Q2 answer) — the
  tab row becomes the top of the column.
- Meetings/Google's outer `MiniTabs` and the inner Today/Tomorrow toggle
  merge into **one** 3-entry tab row: Today | Tomorrow | Google. State
  collapses from two (`calendarMainTab: 'meetings'|'google'`,
  `calendarDay: 'today'|'tomorrow'`) into one:
  `calendarTab: 'today' | 'tomorrow' | 'google'`.
- Below the tab row, a `PagedSection` header shows the *actual resolved
  date* for whichever tab is active, instead of a generic label:
  - `today`/`tomorrow`: `formatFullDate(todayDate | tomorrowDate)` — a
    new small helper (§6) producing e.g. "Tuesday, September 16th",
    alongside `todayIso`/`isoDateOffset` in `domain/meetingTime.ts`
    (same module, same "small pure date helper" convention).
  - `google`: the resolved considered range, e.g. "15.9–15.10.26" (§3.3).

  ```tsx
  {calendarTab !== 'google' ? (
    <PagedSection
      header={formatFullDate(calendarTab === 'today' ? todayDate : tomorrowDate)}
      rows={meetingsShown}
      rowHeight={() => meetingRowHeight()}
      viewportHeight={CALENDAR_VIEWPORT_PX}
      resetKey={calendarTab}
      renderRow={renderMeetingEntry}
      emptyHint={`Nothing ${calendarTab}.`}
      textColor={textColor}
      borderColor={borderColor}
    />
  ) : (
    <GoogleCalendarPanel maxDays={2} viewportHeight={CALENDAR_VIEWPORT_PX} .../> // §3.3
  )}
  ```

### 3.3 `GoogleCalendarPanel` restructure — confirmed (Q1)

Current structure (re-read in full this session): a `headerRow` with
`headerLeft` (Refresh/Load-Google-Calendar link + Show/Hide-existing
toggle) and a right-aligned `hint` Text showing either
`"${dateRange.start} .. ${dateRange.end}"` or `"today .. +30 days"` plus
`" · updated ${formatFetchedAt(fetchedAt)}"`, then the event list, then
`PageControls`.

Confirmed target (Tilman's own mockup of the two lines):

```
May 15th-16th 2026                              ‹ ›
Refresh (last 3d ago)     Show existing
```

Using `PagedSection`'s `subHeader` slot (§1.2), added specifically
because this is the one list in the inventory whose chrome doesn't fit
the plain header+arrows shape:

```tsx
<PagedSection
  header={formatDateRangeHeader(rangeStart, rangeEnd)}   // e.g. "May 15th-16th 2026"
  subHeader={
    <View style={styles.headerLeft}>
      <Pressable onPress={runRefresh} disabled={loading}>
        <Text>
          {loading
            ? `Refreshing… ${elapsedSeconds}s`
            : hasLoaded
            ? `Refresh (last ${formatFetchedAt(fetchedAt)})`   // e.g. "Refresh (last 3d ago)"
            : 'Load Google Calendar'}
        </Text>
      </Pressable>
      <Pressable onPress={() => setHideExisting(h => !h)} style={styles.toggleButton}>
        <Text>{hideExisting ? 'Show existing' : 'Hide existing'}</Text>
      </Pressable>
    </View>
  }
  rows={windowed}
  rowHeight={...}
  viewportHeight={viewportHeight}
  renderRow={renderEvent}
  textColor={textColor}
  borderColor={borderColor}
/>
```

Two small pieces this needs that didn't exist before:

- `formatDateRangeHeader(startIso, endIso): string` (§6, new, alongside
  `formatFullDate`) — the "May 15th-16th 2026" style, using each date's
  month/day and a single trailing year (safe for every current caller:
  `maxDays` tops out at 30 days, so a window never spans a year
  boundary in practice; worth a defensive same-year check rather than an
  assumption, but not a real edge case at today's window sizes).
  `rangeStart`/`rangeEnd` = `dateRange ?? {start: todayStr(), end:
  isoDateOffset(maxDays ?? 30)}` — the same values the old hint text
  already computed, just reformatted and promoted into the header.
- The "updated Xd ago" text is no longer its own trailing hint — it
  folds directly into the Refresh button's own label as `Refresh (last
  Xd ago)`, replacing the plain "Refresh" text once a load has
  completed. The old separate "today .. +30 days" / explicit-range hint
  text is dropped entirely — that information now lives in the header.

### 3.4 `ProjectDataPanel` Todos/Meetings — shared header (B3)

Mechanical swap, no new decisions: `TodosSection`'s `<Text>Todos</Text>` +
`<PageControls>` become one `<PagedSection header="Todos" rows={flatRows}
.../>`; `MeetingsSection` mirrors it with `header="Meetings"`. The
existing flattening (`flatRows`, group-header rows counted as content)
is unchanged — only the outer chrome (heading text + controls → one
merged line) changes.

### 3.5 `ItemsList` (Projects/Areas top-level tabs) — two-column redesign

Per the clarified layout: left column "Active" (with its own pagination
if it overflows), right column split top/bottom into "On Hold" and
"Done — awaiting review" (Projects) or just "On Hold" alone, filling the
whole right column (Areas — matches `groupByStatus`'s existing "Areas get
no Done group" rule, so no code change needed there).

This actually **simplifies** `ItemsList`'s current data shape: today,
`groupByStatus`'s three groups get flattened into one `FlatRow` union
(`{kind:'header'|'entry'}`) so they can share one paginated sequence.
Once each group is its own independent `PagedSection` (which already
renders its own header), that flattening/union type isn't needed at all
for this screen — each group becomes a plain row array:

```tsx
<View style={styles.twoColumn}>
  <View style={styles.columnLeft}>
    <PagedSection header="Active" rows={groups.active} rowHeight={...} viewportHeight={LEFT_VIEWPORT_PX}
      renderRow={renderEntry} emptyHint="Nothing active." .../>
  </View>
  <View style={styles.columnRight}>
    <View style={styles.halfBox}>
      <PagedSection header="On Hold" rows={groups.onHold} rowHeight={...} viewportHeight={HALF_VIEWPORT_PX}
        renderRow={renderEntry} emptyHint="Nothing on hold." .../>
    </View>
    {kind === 'project' && (
      <View style={styles.halfBox}>
        <PagedSection header="Done — awaiting review" rows={groups.done} rowHeight={...} viewportHeight={HALF_VIEWPORT_PX}
          renderRow={renderEntry} emptyHint="Nothing done yet." .../>
      </View>
    )}
  </View>
</View>
```

Both confirmed: "On Hold"/"Done" get the same `PagedSection` treatment
including their own pagination arrows (not a plain uncapped list), and
every group's box renders unconditionally — even a group with zero items
still shows its box, fixed at `HALF_VIEWPORT_PX`, with an empty hint
("Nothing on hold.") — unlike today's `groupByStatus`, which filters
empty groups out of the sequence entirely. This is just §1.3's
fixed-height guarantee applied here: the right column's two halves are
always exactly half its height each, never reflowing based on whether
either currently has anything in it.

### 3.6 `WeeklyMeetingsColumn` — same swap, low risk

Not explicitly raised in the feedback rounds, but it's the same clean-fit
"weekday label above list, controls below" pattern as everything else
here — included for completeness rather than left half-migrated. Each
day's own heading + `PageControls` becomes `<PagedSection
header={dayLabel} .../>`; no new decisions.

### 3.7 Review screen — card-list simplification (Q3: "simplify and migrate now")

`ReviewItemCard`'s inner open-tasks list (`openTasks.map((t,i) =>
<Text>• {t.text}</Text>)`) is unbounded today — the actual blocker for
giving the *outer* card list a fixed per-card height. Concrete fix: cap
it to the first `N` lines (starting guess `N = 3`, same "tune once
on-device" convention every `PAGE_SIZE` constant already followed), then
a trailing, non-interactive `"+K more"` line when `openTasks.length > N`
— tapping the card already opens the full item where the complete list
is visible, so "+K more" doesn't need its own affordance.

With the inner list capped, the card itself has a fixed height, and the
*outer* Stalled/Neglected/etc. list of cards gets the same
`PagedSection` treatment as everywhere else (`rowHeight` returning that
fixed per-card height).

`UnfocusedNextCard` (a separate Review step, different action set —
Someday/Maybe/Done/Cancel per task, "Add to Daily focus") has the same
list-within-a-list shape and wasn't literally named in the "stalled/
neglected etc." framing — confirmed in scope, same treatment as the
other cards.

**Deliberately deferred**: Review's other steps (inbox-to-zero,
week-ahead, done-projects, on-hold-items) — confirmed to wait until
there's some on-device experience with the new pattern elsewhere first,
rather than auditing them cold now. Revisit once §8's batches 1–6 have
landed and it's clear how the pattern actually feels in practice.

### 3.8 `FileBrowserPane` — bundled `numberOfLines` fix

Independent small fix, bundled into this file's own `PagedSection` swap
(breadcrumb + "‹ Up" become the merged header, replacing today's separate
`paneHeaderRow` + `PageControls`): entries gain `numberOfLines={
fileEntryLines(entry.name, columnWidthPx)}` (clamped to 2) and a matching
computed height, closing the one genuine gap in today's row-height
story (§2.2).

## 4. Updated inventory (all known call sites)

| Screen / component | List | `PagedSection` header | Notes |
|---|---|---|---|
| `DailyView` (Open tasks) | flattened task rows | "Open tasks" | Reordered below `QuickAddWidget`; Focus-mode button relocates (§3.1) |
| `DailyView` (Calendar: Today/Tomorrow) | meetings | resolved date, e.g. "Tuesday, September 16th" | 3-tab row replaces the 2-level Meetings/Google + Today/Tomorrow structure (§3.2) |
| `DailyView` (Calendar: Google) | `GoogleCalendarPanel`'s own list | resolved range, e.g. "May 15th-16th 2026" | `subHeader` slot for Refresh(+last-updated)/toggle row (§3.3) |
| `ProjectDataPanel` (Todos) | flattened todo rows | "Todos" | Mechanical (§3.4) |
| `ProjectDataPanel` (Meetings) | flattened meeting rows | "Meetings" | Mechanical (§3.4) |
| `InboxScreen` (Tasks pane) | flattened task rows | existing label | Same pattern as `ProjectDataPanel` |
| `InboxScreen` (Meetings pane) | flattened meeting rows | "Meetings" | Same |
| `ItemsList` (Projects tab) | Active / On Hold / Done | "Active" / "On Hold" / "Done — awaiting review" | Two-column split (§3.5); flattening no longer needed |
| `ItemsList` (Areas tab) | Active / On Hold | "Active" / "On Hold" | Same, no Done column |
| `FileBrowserPane` | folder/file entries | breadcrumb (content unchanged, now paired inline with arrows) | + `numberOfLines` fix (§3.8) |
| `WeeklyMeetingsColumn` | per-day meetings | weekday label | Mechanical (§3.6) |
| `ReviewScreen` (Stalled/Neglected/Done/On-Hold cards) | cards | step label | Inner list capped first (§3.7) |
| `ReviewScreen` (`UnfocusedNextCard` step) | cards | step label | Same treatment, confirmed in scope (§3.7) |
| `ReviewScreen` (inbox-to-zero, week-ahead, done-projects, on-hold-items steps) | — | — | Deliberately deferred to a later pass (§3.7) |

## 5. `TextLineEstimator` — see §2.1

(Kept as its own numbered section above rather than duplicated here.)

## 6. File-by-file summary

| File | Change |
|---|---|
| `ui/pagination.ts` | Add `usePagedByHeight`/`PagedByHeight<T>`; keep `usePagination`/`PAGE_SIZE` for `DailyFocusPanel`'s fixed slots. Per-list `PAGE_SIZE.*` constants lose their only caller as each site migrates — remove them alongside that site's own change, not as a separate bulk pass. |
| `ui/PageControls.tsx` | Deleted once every caller has moved to `PagedSection` (§8, last step — avoids a broken in-between state). |
| `ui/PagedSection.tsx` | **New.** §1.2 — merged header+arrows component, including the optional `subHeader` slot (§3.3). |
| `ui/textLineEstimator.ts` | **New.** §2.1 — `TextLineEstimator` interface, `CharClassLineEstimator` default impl, the `activeLineEstimator` swap point. |
| `ui/TaskRow.tsx` | `taskRowHeight()` helper; optional `height` prop overriding `minHeight`; `numberOfLines` computed instead of hardcoded `2`. |
| `ui/MeetingRow.tsx` | `meetingRowHeight()` helper — a plain constant, no estimator involved (§2.2). |
| `ui/FileBrowserPane.tsx` | `numberOfLines` added to entries (previously absent) + computed height; breadcrumb/`PageControls` → `PagedSection` (§3.8). |
| `ui/GoogleCalendarPanel.tsx` | Restructure per §3.3 — resolved-range header ("May 15th-16th 2026"), `subHeader` with Refresh (label now carries "last updated") + Show/Hide-existing, old window-text hint dropped. |
| `ui/WeeklyMeetingsColumn.tsx` | Mechanical `PagedSection` swap (§3.6). |
| `screens/DailyView.tsx` | §3.1/§3.2 — display-mode row merge, Open-tasks reorder, Calendar's 2-level tab structure collapses into one 3-tab row + resolved-date headers, `calendarMainTab`+`calendarDay` state collapses into one `calendarTab`. |
| `screens/ProjectDataPanel.tsx` | §3.4 — Todos/Meetings sections swap to `PagedSection`. |
| `screens/InboxScreen.tsx` | Same swap for its Tasks/Meetings panes. |
| `screens/ItemsList.tsx` | §3.5 — two-column layout; `groupByStatus`'s `FlatRow` flattening no longer needed, each group becomes its own `PagedSection` over a plain row array. |
| `screens/ReviewScreen.tsx` | §3.7 — `ReviewItemCard`'s open-tasks list capped + "+K more"; outer card list becomes `PagedSection`; `UnfocusedNextCard` gets the same treatment; other steps deferred. |
| `domain/meetingTime.ts` | New small helpers: `formatFullDate` (weekday + month + ordinal day, Daily's Today/Tomorrow headers) and `formatDateRangeHeader` (Google tab's "May 15th-16th 2026" style), alongside the existing `todayIso`/`isoDateOffset`. |

## 7. Open questions / flagged before or during implementation

1. **`GoogleCalendarPanel`'s restructuring (§3.3)** is a working
   interpretation of a dense instruction — worth a quick look at the
   sketch before that file specifically gets touched.
2. **`ItemsList`'s On Hold/Done columns (§3.5)**: give them their own
   pagination arrows for consistency (recommended) vs. leave them
   uncapped on the assumption they rarely overflow half a screen.
3. **Empty groups in `ItemsList`'s now-always-boxed layout (§3.5)**: keep
   the box with an empty hint (recommended, no layout reflow) vs.
   collapse it away, unlike today's filtering.
4. **`UnfocusedNextCard` (§3.7)**: fold into the same cap-then-paginate
   treatment now (recommended — identical underlying problem) vs. leave
   for a follow-up, since it wasn't literally named in the "stalled/
   neglected" framing.
5. **Review's other steps (§3.7/§4)**: inbox-to-zero, week-ahead,
   done-projects, on-hold-items weren't individually audited for
   card-density issues this round — flagging rather than assuming
   they're all trivial swaps.
6. **Cap value `N` for Review's inner open-tasks preview (§3.7)**: `3` is
   a starting guess, same "tune once on-device" convention as every
   `PAGE_SIZE` constant.
7. **Display-mode row ordering (§3.1)**: context pill left of the
   "Focus mode" button, or the reverse — purely cosmetic.

None of these block starting the work — all narrow, all cheap to adjust
either way — but worth a fast pass, same as `technical-design-daily-
focus-panel.md`'s own §7 flagged its interpretive calls rather than
guessing silently on something visible.

## 8. Rough sequencing / effort shape

1. Shared primitives: `usePagedByHeight` + `PagedSection` (§1),
   `textLineEstimator.ts` (§2), row-height helpers on `TaskRow`/
   `MeetingRow`/`FileBrowserPane` entries.
2. Lowest-risk, structurally simplest call sites first, to prove the
   primitive on-device before anything with a layout decision attached:
   `WeeklyMeetingsColumn` (§3.6), `ProjectDataPanel` Todos/Meetings
   (§3.4), `InboxScreen` panes, `FileBrowserPane` (§3.8).
3. `ItemsList`'s two-column redesign (§3.5) — the first call site that's
   an actual layout change, not just a chrome swap.
4. `DailyView` — display-mode row merge, Open-tasks reorder, Calendar's
   tab/header restructure (§3.1/§3.2), `GoogleCalendarPanel` restructure
   (§3.3) — the largest single-screen change in this pass, done after the
   primitive and estimator are already proven elsewhere.
5. `ReviewScreen` card simplification (§3.7) — deliberately last: the
   `UnfocusedNextCard` scope question and the cap value both benefit from
   a working `PagedSection` already visible on-device before deciding.
6. Delete `ui/PageControls.tsx` and any now-unused `PAGE_SIZE.*`
   constants once every caller has moved.
7. `tsc --noEmit` + eslint, then an on-device smoke test of at least one
   converted screen from each of the three "shapes" this design
   introduces (a flattened list, a two-column layout, a card-with-inner-
   list) before considering the pass done.

This touches nearly every screen in the app — more than any single prior
pass — and should land in the phased order above across more than one
implementation session, same conclusion `technical-design-pagination-
edit-reuse.md`'s own §7 reached for the pass this one builds on.
