# Technical design: Review master-detail rework

Status: draft, for review before implementation. Covers the Stalled
projects, Done awaiting review, On Hold reconsideration, Neglected areas
and Unfocused next items steps of `screens/ReviewScreen.tsx`. Week ahead,
Inbox to zero and Weekly focus reset are unchanged (deferred, per the
requirements chat).

Requirements this implements: `feature_review_master_detail_redesign.md`
(project memory) and the two mockup rounds published as the "Review
Master-Detail Redesign" Claude Design canvas.

## 1. Goal, and how this finishes the pagination work

Two goals sit on top of each other here, and the design below is shaped by
both:

1. **The visible goal**: replace each step's scrolling stack of cards with
   a left list (single-line, paginated) / right detail panel layout.
2. **The goal underneath it**: `docs/dev/technical-design-pagination-fixed-
   height.md`'s Batch 7 was blocked on ReviewScreen's cards holding multiple
   unbounded lists at once, which doesn't compose with a fixed-height
   paginated grid. Master-detail sidesteps that problem rather than solving
   it head-on (see that doc's Batch 7 section for the road not taken). Once
   this lands, `screens/ReviewScreen.tsx` has zero remaining `usePagination`/
   `<PageControls>` call sites, so `ui/PageControls.tsx`, `usePagination`,
   and the `Paged<T>` interface become fully dead code (verified zero other
   importers in the Batch 7 research) - this design's cleanup section
   deletes them, which is the actual completion of that original pagination
   unification goal, not just a Review-screen facelift.

## 2. Component inventory

| Component | Status | Notes |
|---|---|---|
| `ui/PagedSection.tsx` | reused as-is | left list in every step, and nested inside detail panels for Done/On-Hold's task/meeting history |
| `ui/itemEntryRow.ts` (new) | **extracted** from `screens/ItemsList.tsx` | `itemEntryHeight`/`itemEntryLines`/`itemEntryDisplayText`/`COLUMN_WIDTH_PX`, today private to ItemsList - pulled into a shared module so Review's left list uses the identical row height/text-fit logic instead of a second, drifting copy |
| `ui/ItemContextRows.tsx` (new) | **extracted** from `ui/ItemFocusPanel.tsx` | `ItemScopeRow` and `ItemGoalRow`, today private sub-components - pulled out so both `ItemFocusPanel` (unchanged behavior on the item detail screen) and Review's new detail panels render Scope/Goal with identical markup, styling and edit interaction |
| `ui/ReviewMasterDetail.tsx` (new) | new, shared across steps | generic left-list/right-detail shell: selection state, empty state, acted-on tracking/checkmark - see §3 |
| `ui/ItemContextBlock.tsx` (new) | new, shared across steps | Area line (read-only) + `ItemScopeRow` + `ItemGoalRow`, stacked - see §5.1 |
| `ui/FocusedItemRow.tsx` (new) | **extracted** from `ui/DailyFocusPanel.tsx`/`ui/WeeklyFocusPanel.tsx` | just the "name + ✕ to remove" row, pulled out of `FixedSlotSection` - see §5.4's trade-off |
| `ui/TaskRow.tsx`, `ui/MeetingRow.tsx` | reused as-is | already shared row primitives, no change needed |
| `ui/QuickAddWidget.tsx` | reused as-is | Stalled/Neglected's fixed-destination quick-add, unchanged |
| `storage/reviewAggregate.ts` | **unchanged** | see §4 - no widening needed after all |
| `domain/weekDate.ts` | small addition | one new pure helper for "N weeks ago" phrasing - see §4.2 |
| `ui/ReviewItemCard`, `ui/StatusActionCard`, `ui/UnfocusedNextCard` (in `ReviewScreen.tsx`) | **retired** | their content moves into the new detail-panel renderers per step; the components themselves go away once nothing calls them |

## 3. `ReviewMasterDetail`: the shared left/right shell

One generic component used by all five steps, parameterized over the row
type:

```
function ReviewMasterDetail<T>({
  rows: T[],                       // already flattened (header+entry) where needed
  rowHeight: (row: T) => number,
  renderRow: (row: T, selected: boolean, actedOn: boolean) => ReactNode,
  isSelectable: (row: T) => boolean,   // false for header rows
  rowKey: (row: T) => string,
  isCountableRow?: (row: T) => boolean,
  header: string,                  // left-column caption, e.g. "Stalled projects"
  renderDetail: (selectedKey: string | null) => ReactNode,
  actedOnKeys: Set<string>,        // which rows show the checkmark
})
```

Behavior, all decided in the requirements chat:

- **No pre-selection.** `selectedKey` starts `null` on every step entry
  (mirrors the existing `savedStepIndex`/frozen-snapshot session-only reset
  pattern - reset when `goToStep` moves *into* this step, not on every
  render).
- **Acted-on rows stay, marked, still tappable.** Taking an action in the
  detail panel adds the row's key to `actedOnKeys` (component-local
  `Set<string>`, reset the same way `selectedKey` is) rather than removing
  it from `rows` - this generalizes the existing Stalled/Neglected frozen-
  snapshot idea to all five steps, but changes its behavior: today's wrapper
  handlers (`handleStalledArchive` etc.) filter a resolved item OUT of the
  frozen snapshot immediately; the new rule keeps it in, checkmarked,
  reopenable. This is a deliberate behavior change confirmed in the
  requirements chat, not an oversight - `handleStalledArchive`/`handleDone*`/
  etc. change from "filter out" to "mark in `actedOnKeys`".
- **Empty state renders in the detail column** when `selectedKey` is `null`,
  via a `renderDetail(null)` branch - each step supplies its own guide copy
  (already drafted in the requirements doc) rather than the shell hard-
  coding one message.
- `PagedSection` renders the left list; `ReviewMasterDetail` doesn't
  reimplement pagination, it wraps one `PagedSection` and owns selection/
  acted-on state around it.

## 4. Data layer

### 4.1 No `reviewAggregate.ts` changes needed for "All tasks / All meetings"

The original plan (see the requirements doc's round-2 notes) assumed
`doneProjects`/`onHoldItems` would need widening from bare `ReviewItemRef[]`
to carry full task/meeting arrays. Re-checking against how
`ReviewItemCard` already works: it never trusts its frozen `entry`'s own
data for task content - it does `items.find(i => i.path === entry.item.path)`
against the live cache on every render and reads `current.tasks`/
`current.meetings` directly (see `reviewAggregate.ts`'s and
`ReviewScreen.tsx`'s module doc comments on why - keeps a just-added task
visible immediately without re-freezing). The Done/On-Hold detail panel can
use the exact same lookup and just skip the `isActionableOpenTask` filter -
render `current.tasks`/`current.meetings` unfiltered instead of the
open-only subset Stalled/Neglected use. **No aggregate type changes at
all** - `doneProjects: ReviewItemRef[]`/`onHoldItems: ReviewItemRef[]` stay
exactly as they are; only the detail-panel component's rendering logic
differs from `ReviewItemCard`'s.

### 4.2 One new pure helper for goal "recency" phrasing

`ItemGoalRow` today renders "Last goal (Week NN): ..." with no relative
offset. The requirements ask for "(Week NN, N weeks ago)". This needs one
new pure function, `weeksBetween(a: string, b: string): number` in
`domain/weekDate.ts` (ISO week key arithmetic, same file that already has
`isoWeekKey`/`shiftWeeks`/`weekRangeIso`) - a small, independently-testable
addition, no new state. `ItemGoalRow` gains an optional `currentWeekKey`
prop it already effectively has access to (its edit path already targets
"this week" - see `handleSaveGoal` callers) and computes the relative
phrase locally; `ItemFocusPanel`'s existing call site is unaffected if it
simply keeps passing today's real current week (same value it already
computes for editing).

### 4.3 `ItemGoalRow`'s `disabled` prop: this is a policy fork, not a component fork

`ItemGoalRow`'s `disabled` prop is driven by `ItemFocusPanel.tsx` as
`state.status !== 'active'` (the same flag that disables the Focus
checkboxes, since a non-Active item can't hold a focus slot - see
`ui/ItemFocusPanel.tsx:235`). Review explicitly wants Scope *and* Goal
editable on Done/On-Hold items (confirmed in the requirements chat - "ich
denke editierbar ist okay an dieser Stelle" for Scope, and Goal follows the
same reasoning). Because `disabled` is already an externally-supplied prop
- not computed inside `ItemGoalRow` itself - this needs **zero changes to
the shared component**. `ItemContextBlock` (Review's caller) simply always
passes `disabled={false}`, while `ItemFocusPanel` keeps passing its
status-derived value. Two callers, two policies, one component - this is
the clean case the trade-offs in §6 contrast against the messier ones.

## 5. Detail panel design per step

### 5.1 `ItemContextBlock` (shared: Stalled, Neglected, Done, On-Hold)

```
<ItemContextBlock item={current} kind={item.kind} />
```

Renders, top to bottom:
- **Area** (Projects only, `current.area`) - plain text "Area: {name}",
  read-only. **Not** `ItemStatusPanel`'s interactive "Area: name ✕" pill -
  see §6.2 for why that one specific piece isn't reused.
- **Scope** - `<ItemScopeRow scope={current.scope} onSaveScope={...}
  disabled={false} .../>`, identical to the item detail screen.
- **Last goal** - `<ItemGoalRow goals={current.weeklyGoals}
  currentWeekKey={...} disabled={false} onSaveGoal={...} .../>`.

Same block, same component, same visual/interaction rules on all four
steps - this is the concrete answer to "gleiche visuelle und UX Logik für
gleiche Elemente überall": there is exactly one place Scope/Goal rendering
and editing logic lives now (`ui/ItemContextRows.tsx`), used by the item
detail screen and every Review step that shows an item.

### 5.2 Stalled projects / Neglected areas

`ItemContextBlock` + `QuickAddWidget` (fixed destination, task-only,
unchanged) + open-tasks bullets + upcoming meetings + shelved Someday/Maybe
with "→ Next" promote + status pills + Archive - this is `ReviewItemCard`'s
existing content, unchanged in substance, just relocated into the detail
column and given `ItemContextBlock` up top. `ReviewItemCard` itself is
retired; its JSX becomes (most of) this new renderer.

### 5.3 Done awaiting review / On Hold reconsideration

`ItemContextBlock` + status action pills (Reactivate / →Done [Projects
only] / Archive - unchanged from today's `StatusActionCard`) + two new
sections:

- **All tasks** - every task on `current.tasks`, not just open ones. Same
  three-state row look already used in the mockup (open: bullet; done:
  strikethrough; cancelled: strikethrough + muted). Reuses `ui/TaskRow.tsx`
  directly rather than a new bullet renderer - `TaskRow` already knows how
  to render done/cancelled state (it's the same row used everywhere else),
  so this is a straight reuse once passed the full unfiltered array. No
  pagination needed if `TaskRow`'s existing rendering fits comfortably;
  if a project genuinely has many tasks, wrap in its own small
  `PagedSection` (own header "All tasks", own `‹`/`›`) exactly the way
  `ProjectDataPanel.tsx`'s `TodosSection` already does - same pattern,
  smaller instance.
- **All meetings** - `current.meetings`, split Upcoming/Past exactly like
  `ProjectDataPanel.tsx`'s `MeetingsSection` (`{kind:'header'}`/
  `{kind:'entry'}` flat rows, `isCountableRow`), in its own `PagedSection`
  when needed. See §6.3 for why this reuses the *pattern*, not the
  component itself.

### 5.4 Unfocused next items

Left list: `unfocusedNextItems` flattened into `{kind:'header', label:
item.name}` + `{kind:'entry', task}` rows (identical convention to
`ProjectDataPanel.tsx`'s `TodosSection`/`MeetingsSection` flattening,
`isCountableRow={row => row.kind === 'entry'}`).

Right panel, for the selected task:
- Task text as heading, its parent project/area name as a small caption.
- Someday / Maybe / Done / Cancel pills (unchanged from `UnfocusedNextCard`).
- "+ Add to Daily focus" / "+ Add to Weekly focus" pills (new: Weekly is
  genuinely new, the underlying `setItemFocus(item, 'weekly', true)` call
  already exists in `storage/focusSlots.ts` - `WeekView.tsx` already calls
  it, this is a second caller, not new storage logic).
- **Current focus** section: two `FocusedItemRow` lists (Daily, then
  Weekly), each row "{name} [{Area} tag if kind==='area']" + "✕" to
  remove, plus a slot-count caption read from
  `settings.dailyFocusProjectCount` etc. (already-existing settings
  fields). See §6.4 for why this is a new small component rather than
  reusing `FixedSlotSection` wholesale.

## 6. Reuse vs. context trade-offs

This is the part of the brief worth being explicit about - not every
"same-looking" element is worth sharing code for, and forcing reuse in the
wrong place creates worse coupling than duplicating five lines of JSX.

### 6.1 Scope / Goal → full reuse (easy case)

`ItemScopeRow`/`ItemGoalRow` already take everything they need as props
(`scope`/`goals`/`onSave*`/`disabled`/color props) - no internal coupling
to `ItemFocusPanel`'s own state beyond what's already passed in. Extracting
them costs one new file and two import changes. This is the case the ask
("neue Komponenten schaffen, die Wiederverwendung begünstigen") is really
about, and it was already halfway there before this feature - the
components just hadn't been asked to live in two places yet.

### 6.2 Area display → deliberately *not* reusing `ItemStatusPanel`'s pill

`ItemStatusPanel.tsx`'s Area UI is a single interactive unit: unassigned
shows an "Assign to Area…" button that arms the Areas file-browser tab;
assigned shows a pill with "✕" that calls `unassignProject`. Review's
requirement is explicitly the opposite of that - **read-only, no
reassignment from here** (confirmed in the requirements chat: "area aber
nicht wechselbar"). Reusing the interactive component and disabling its
button would mean threading a `readOnly` prop through code whose entire
reason to exist is the arm-and-pick interaction, for a component that
would then render nothing but a text label. The cheaper, clearer move is
one line of plain text in `ItemContextBlock` ("Area: {name}"), styled to
match, sharing no code with `ItemStatusPanel`. Not every visual match needs
a shared component - this one is cheap enough to just repeat.

### 6.3 Task/meeting history → reuse the *pattern*, not `TodosSection`/`MeetingsSection`

These two components look like the obvious reuse target for §5.3's "All
tasks/All meetings", but they're built for `ProjectDataPanel`'s own
editing model: `editingIndex`/`armingIndex` (inline edit-in-place),
`onArmLink`/`onOpenLinkedFile` (Files-pane linking), `onStartEdit` (lifted
to a single shared `QuickAddWidget` above the section on that screen).
Review's history view is **read-only** - reusing these components would
mean passing no-op stand-ins for half their props just to get the
row-and-header layout. The right-sized reuse is one level down: `TaskRow`/
`MeetingRow` (the actual shared row primitives both sections already
delegate to) plus the same flat header/entry-row convention and
`PagedSection`, assembled fresh for Review. Same look, same pagination
behavior, none of the borrowed editing machinery.

### 6.4 Current-focus panel → extract one row, not the whole `FixedSlotSection`

`FixedSlotSection` (in `DailyFocusPanel.tsx`/`WeeklyFocusPanel.tsx`) is the
"focused rows + empty slots + arm-and-pick candidate browser" unit -
adding a new focus item from it opens `FileBrowserPane` to pick one. That
picker doesn't fit inside Review's already-busy detail column, and isn't
what was asked for here anyway (Review's own "+ Add to Daily/Weekly focus"
pills already are the add-action, sized for a single already-in-view item -
see §5.4). What Review needs from `FixedSlotSection` is just its "focused
item + ✕" row rendering. Extracting that one row into `ui/FocusedItemRow.tsx`
and having both `FixedSlotSection` and Review's new focus list use it keeps
the remove-affordance visually and behaviorally identical everywhere
without pulling Review into the arm-and-pick flow it doesn't want.

### 6.5 Left-list rows → full reuse via extraction (same shape as §6.1)

`ItemsList.tsx`'s `itemEntryHeight`/`itemEntryLines`/`itemEntryDisplayText`/
`COLUMN_WIDTH_PX` are pure functions operating on a `CachedItem` and a
column width - already decoupled from `ItemsList`'s own state, just not
exported. Moving them to `ui/itemEntryRow.ts` (mirroring how
`ui/textLineEstimator.ts` already lives as a standalone shared module) is
a pure extraction, zero behavior change for `ItemsList` itself, and gives
Review's left list the exact same row-fit math - including abbreviation
handling - as the Projects/Areas list, rather than a second copy that can
drift (the kind of drift `[[feature_pagination_fixed_height]]`'s own
"recurring lessons" section already warns about).

## 7. Pagination / cleanup

Once all five steps convert to `PagedSection`:
- `ui/PageControls.tsx`, `usePagination`, `Paged<T>` - delete (zero
  remaining importers, verified in the Batch 7 research).
- `PAGE_SIZE.review` - delete (last caller was Stalled/Done/On-Hold/
  Neglected/Unfocused's old `usePagination` calls).
- `PAGE_SIZE.stacked` - **keep**, still used by Inbox-to-zero's Tasks/
  Meetings panes, which stay out of scope for this pass.
- `PAGE_SIZE.column`/`googleCalendarDaily` - already orphaned before this
  feature (per the Batch 7 research), fine to delete in the same sweep.
- Run `tsc --noEmit` + eslint after the deletions specifically (a dangling
  import of a deleted export is exactly the class of error tsc catches
  cleanly here).

## 8. What still needs on-device numbers (not decided here)

Consistent with how every other row-height constant in this app has been
tuned (`docs/dev/design-device-rendering.md`'s own convention: start from a
reasoned estimate, correct once against a real screenshot) - the following
are intentionally left as "figure out on-device," not guessed here:
- Exact vertical budget for the detail column on Done/On-Hold when both
  "All tasks" and "All meetings" are present and non-trivially long -
  whether both fit un-paginated in the common case or need their nested
  `PagedSection`s from day one.
- Whether `ItemContextBlock`'s three lines (Area/Scope/Goal) plus a
  multi-line Scope push the Stalled/Neglected card's open-tasks section
  below a comfortable fold - may want Scope's `numberOfLines` capped there
  even though the item-detail screen leaves it uncapped (open question, not
  a contradiction - Review already shows less of everything else per card
  than the full item detail screen does).
- e-ink refresh behavior on left-list tap (repaints just the detail column)
  - likely a `requestEinkRefresh()` scoped the same way step transitions
  already trigger one, but worth confirming it doesn't need a wider refresh
  given the two columns are visually independent regions.

## 9. Suggested implementation order

1. Extractions first, no behavior change: `ui/itemEntryRow.ts` (from
   ItemsList), `ui/ItemContextRows.tsx` (from ItemFocusPanel) - land and
   smoke-test these alone before anything in Review changes, since a
   regression here would silently affect the existing item detail screen
   too.
2. `ui/ReviewMasterDetail.tsx` + `ui/ItemContextBlock.tsx` (new, unused by
   anything yet).
3. Stalled projects + Neglected areas (structurally identical, do together)
   - retire `ReviewItemCard`.
4. Done awaiting review + On Hold reconsideration (structurally identical,
   do together) - retire `StatusActionCard`, add the All tasks/All meetings
   sections.
5. Unfocused next items - retire `UnfocusedNextCard`, add `ui/
   FocusedItemRow.tsx`, wire Weekly focus add + current-focus panel.
6. Empty-state copy for all five steps (text already drafted in the
   requirements doc).
7. Cleanup sweep (§7) + tsc/eslint + on-device smoke test (§8's items get
   resolved here).

See `feature_review_master_detail_redesign.md` (project memory) for the
full requirements history and mockup links this design implements, and
`docs/dev/history/technical-design-pagination-fixed-height.md` for the pagination
architecture/cleanup context in §7.
