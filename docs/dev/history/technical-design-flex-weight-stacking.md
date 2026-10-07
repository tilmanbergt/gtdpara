# Technical Design: Weighted Flex Stacking for Self-Measuring Lists

Follow-on to `docs/dev/history/technical-design-pagination-fixed-height.md` and its
self-measured-viewport-height extension (2026-09-17+, tracked in memory as
`[[feature_pagination_fixed_height]]`, not yet folded back into that repo
doc). That work let a `PagedSection` (or a component wrapping one -
`GoogleCalendarPanel`, `FileBrowserPane`, `ReviewMasterDetail`,
`WeeklyFocusPanel`) fill whatever real space its parent gives it via RN's
own `onLayout`, replacing a hand-tuned pixel constant - but only when it's
the **sole occupant** of a bounded `flex:1` box. This document designs the
missing piece: two or more such sections sharing **one** box in **declared
proportions**, rather than each independently guessing a pixel budget.

## 0. Recap: what's changing and why

Several call sites deliberately stack two or more lists in one column and
were left on the old approach when the rest of the app converted, because
self-measuring alone can't decide how to split one box between several
things that all want to grow:

- `ui/WeeklyMeetingsColumn.tsx` - 7 boxes, one per weekday, weekday/weekend
  row budgets deliberately different.
- `screens/ItemsList.tsx` - Projects tab's right column, On Hold/Done
  split into two equal halves (`HALF_VIEWPORT_PX`, used by both).
- `screens/ProjectDataPanel.tsx` - Todos section (always visible) above
  Meetings, one column, not a tab toggle.
- `screens/InboxScreen.tsx` - Tasks pane above Meetings pane in
  `rightPane`, separated by a divider.
- `screens/ReviewScreen.tsx`'s Inbox-to-zero step - same Tasks/Meetings
  shape as InboxScreen.
- `screens/DailyView.tsx` - Calendar column (already self-measuring) with
  `DailyFocusPanel` sitting after it as a natural-height sibling, not
  inside it - a related but structurally different shape (see §3.5).

Every one of these still uses independently-tuned, hand-derived pixel
constants per section - the exact pattern the self-measuring architecture
exists to replace, just not yet reachable because nothing today lets a
caller say "split this box 60/40" instead of "give each list its whole
own box."

## 1. Core mechanism

**Key fact: RN's flexbox already does proportional splitting for free.**
When multiple sibling `View`s in a `flex:1` column each carry their own
`flex: N` style, Yoga gives each one `N / (sum of all siblings' flex
values)` of the parent's available height. This is the exact same
mechanism every existing self-measuring sole-occupant already relies on -
a sole occupant is just the N=1-sibling case, so it gets 100%.

**Consequence: no shared component needs to change.** `PagedSection.tsx`
already hard-codes `flex:1` on its own self-measuring root (`styles.
selfMeasuringRoot`) and its item viewport (`styles.viewportFlex` +
`onLayout`) - see that file's own doc comment and JSX. So does every
wrapper built on it this session (`GoogleCalendarPanel`, `FileBrowserPane`,
`ReviewMasterDetail`, `WeeklyFocusPanel`). Wrapping one of these in a
caller-owned `<View style={{flex: weight}}>` composes correctly with zero
changes to any of them:

- The outer weighted `View` claims `weight / (sum of siblings' weights)`
  of the shared bounded parent.
- The self-measuring component inside it - already `flex:1`, sole child of
  that outer weighted `View` - fills 100% of *that* resolved height.
- Its own `onLayout`/`useMeasuredHeight` reads the fully-resolved pixel
  number Yoga already computed. No new measurement code, no new prop
  threaded into `PagedSection` itself.

This is the direct N-ary generalization of the "composability over
arithmetic" principle already used for `GoogleCalendarPanel`'s
fixed-chrome-plus-flexible-list shape (extend self-measuring *into* a
wrapper box, rather than computing a total and subtracting known pixel
terms) - here the wrapper box just happens to be one of several siblings
sharing a parent, instead of the parent's only child.

Minimal shape:

```tsx
<View style={styles.stackedColumn /* flex:1, bounded */}>
  <View style={{flex: TODOS_WEIGHT}}>
    <TodosSection {/* viewportHeight now omitted - self-measures into this box */} />
  </View>
  <View style={{flex: MEETINGS_WEIGHT}}>
    <MeetingsSection {/* same */} />
  </View>
</View>
```

`weight` is a plain positive number - the same units `flex` already uses,
not a row count and not a pixel value. A caller names its own weights as
constants, the same way this codebase already names `PAGE_SIZE.*`
constants (a self-documenting, single source of truth, easy to re-tune on
a real device): e.g. `const TODOS_WEIGHT = 4; const MEETINGS_WEIGHT = 3;`.
Equal weights (`1`/`1`, or any equal pair) mean an equal split.

## 2. Preconditions

- **The outer container must itself be a bounded `flex:1` box** - same
  rule every self-measuring conversion this session has already needed.
  A weighted `View` splitting space that isn't itself bounded just grows
  to fit content, same failure mode as any other self-measuring attempt
  without a bounded ancestor.
- **Whatever sits inside one weighted box must be its sole occupant** -
  the same sole-occupant rule, just evaluated per weighted slot instead of
  per whole column. Nothing stops a weighted slot from containing a
  further nested stack (its own further-weighted children), but none of
  the six cases in §0 need that today.
- **The inner content's own `viewportHeight`-equivalent prop must be
  optional** (self-measuring), if it isn't already. `GoogleCalendarPanel`/
  `FileBrowserPane`/`ReviewMasterDetail`/`WeeklyFocusPanel` already support
  this from earlier conversions this session; a bare `PagedSection` call,
  or `TodosSection`/`MeetingsSection`'s own props, would need the same
  "make it optional, self-measure when omitted" treatment already applied
  everywhere else, nothing new in kind.
- **Weights are static per screen, chosen once - not computed from
  content at runtime.** Matches how every existing `PAGE_SIZE` constant
  already works. This document deliberately does not propose
  content-driven weighting (e.g. "give more space to whichever section has
  more rows today") - that would reintroduce the exact reflow instability
  the fixed-height architecture exists to avoid (`PagedSection`'s own doc
  comment: "these boxes should be fixed and always there, even when
  empty").
- **An empty section still claims its full weighted share** - same "fixed
  box, filled by `emptyHint`" behavior every `PagedSection` already
  provides. Not a new decision, just confirming it carries through
  unchanged.

## 3. Per-case survey

### 3.1 `ui/WeeklyMeetingsColumn.tsx` - cleanest first candidate

7 stacked day boxes. Today's weekday/weekend row budgets translate
directly to a weight pair - `weekday: 3` and `weekend: 2` per
`PAGE_SIZE`'s existing values - so the desired ratio already exists in the
current code; nothing new to decide, purely a mechanical conversion.
Recommended as the first case to actually implement, to prove the
mechanism on-device before touching anything with an undecided ratio.

### 3.2 `screens/ItemsList.tsx` - Projects tab's On Hold/Done split

Today's `HALF_VIEWPORT_PX` is used for *both* On Hold and Done - an
already-equal split. Weight `1`/`1` reproduces this exactly. The
Areas-tab, single-box case stays as it is today (already sole-occupant
eligible, but deliberately left explicit for JSX consistency between
`kind='project'`/`'area'`, per the earlier self-measuring rollout note -
unaffected by this document).

### 3.3 `screens/ProjectDataPanel.tsx` - Todos above Meetings

`PAGE_SIZE.projectTodos = 8`, `PAGE_SIZE.projectMeetings = 6` today (a
4:3 ratio) - these don't currently share one box, so there's no *implicit*
existing ratio the way §3.1/§3.2 have, but 8:6 is a reasonable,
already-considered starting point to carry forward rather than inventing
fresh numbers: `TODOS_WEIGHT = 4`, `MEETINGS_WEIGHT = 3`. Tune on-device
from there, same convention every `PAGE_SIZE` constant already follows.

### 3.4 `screens/InboxScreen.tsx` / `screens/ReviewScreen.tsx`'s Inbox-to-zero step - open question, not just an implementation detail

Both are explicitly documented today as **deliberately not flex-splitting**
- `styles.stackedSection`'s own comment: "no flex-splitting... each
section sized by its own fixed row count." `InboxScreen.tsx` uses
`PAGE_SIZE.inboxTasks = 8` / `PAGE_SIZE.inboxMeetings = 6` (the same 4:3
ratio as `projectTodos`/`projectMeetings`); `ReviewScreen.tsx`'s
Inbox-to-zero step instead anchors both lists on one shared
`PAGE_SIZE.stacked = 4` (an implied 1:1 split, and deliberately
independent of `inboxTasks`/`inboxMeetings` so tuning one never silently
moves the other).

This was a stated design choice earlier in the project, not an oversight
- so whether to bring these two under weighted splitting now is a real
requirements question, not something this document should decide
unilaterally (see open question 2 below).

### 3.5 `screens/DailyView.tsx` - Calendar column + `DailyFocusPanel`

A related but structurally different shape: not two `PagedSection`s
sharing one box, but a self-measuring `flex:1` box (the Calendar column's
`columnScroll`) with `DailyFocusPanel` sitting *after* it as a
natural-height sibling (wrapped in `common.spacer`) rather than inside a
box of its own. `DailyFocusPanel`'s current total height is therefore one
of the *inputs* to how much space `columnScroll` gets, which is exactly
why its own 3 tabs are hand-matched to one pixel budget
(`PAGE_SIZE.dailyFocusPanel`) today - to keep switching its own tabs from
silently reflowing the Calendar box above it.

The same weighted-`View` mechanism resolves this cleanly: wrap the
Calendar column's content and `DailyFocusPanel` each in their own weighted
`View` inside a shared bounded parent, instead of one being a bounded
`flex:1` box and the other a natural-height sibling. Once `DailyFocusPanel`
sits inside a genuinely bounded (weighted) box, it can finally self-measure
too - dropping its `PAGE_SIZE.dailyFocusPanel` cross-tab-matching hack
entirely and unifying it with `WeeklyFocusPanel.tsx`'s already-self-
measuring behavior (§ in `[[feature_pagination_fixed_height]]`'s "Daily vs.
Weekly Focus panel" note). This is a nice bonus outcome, not a requirement
- worth calling out as newly unlocked, not as something this pass must
solve.

## 4. Open questions

1. **Starting weights for §3.3 (`ProjectDataPanel`)**: use the existing
   8:6 (→ 4:3) ratio as a starting point (recommended - continuity with
   today's proportions, tune from there same as any `PAGE_SIZE` constant)
   vs. pick something else outright?
2. **§3.4 (`InboxScreen`/`ReviewScreen`'s Inbox-to-zero step)**: opt these
   into weighted splitting now, or explicitly leave them on independent
   fixed constants since "no flex-splitting" was a stated deliberate
   choice, not an oversight? If yes, which ratio - `InboxScreen`'s own
   8:6, `ReviewScreen`'s own 1:1, or a fresh decision for each?
3. **§3.5 (`DailyView`'s Calendar + `DailyFocusPanel`)**: fold into the
   same implementation pass as the simpler cases, or treat as its own
   follow-up once §3.1-§3.3 have proven the mechanism on-device (this one
   touches the most-tested, most-recently-stabilized screen in the app,
   so lower urgency argues for going last regardless)?

## 5. Rough sequencing (once the open questions above are answered)

1. `ui/WeeklyMeetingsColumn.tsx` (§3.1) - ratio already known, proves the
   mechanism on the lowest-risk case.
2. `screens/ItemsList.tsx`'s On Hold/Done split (§3.2) - ratio already
   known (1:1), same low risk.
3. `screens/ProjectDataPanel.tsx` (§3.3) - first case needing a genuinely
   new (if continuity-derived) weight decision.
4. `screens/InboxScreen.tsx` / `screens/ReviewScreen.tsx`'s Inbox-to-zero
   step (§3.4) - only once open question 2 is answered.
5. `screens/DailyView.tsx`'s Calendar column + `DailyFocusPanel` (§3.5) -
   last, per open question 3's own reasoning.

Each step follows the same per-case pattern already proven repeatedly this
session: read the current structure to confirm the bounded-parent
precondition, make the inner content's viewport prop optional where it
isn't already, wrap each stacked section in its own weighted `View`,
commit, verify byte-count/md5sum clean, and flag for on-device testing
before moving to the next.
