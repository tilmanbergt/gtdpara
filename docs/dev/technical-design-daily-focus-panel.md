# Technical design: Daily view Focus/Projects/Areas panel

Redesigns Daily view's Focus section (§2.11/§2.10 in `design-overview.md`) into a
narrower panel that sits directly under the Calendar column instead of a
full-width row below both columns — freeing the Open-tasks column to use the
row height the old `focusRow` used to occupy. Requirements were clarified over
several rounds of chat plus four rounds of an interactive HTML mockup
(Artifact), converging on the UX this doc locks in; this pass is the "check
current file-panel implementation, then design for reuse" step that follows,
per this project's own workflow (clarify → design → implement).

**Everything below is additive or a relocation.** No existing screen's current
behavior changes except DailyView.tsx's own layout, and the two small
`FileBrowserPane`/`MiniTabs` extensions in §5 are opt-in (existing callers pass
nothing new and see no change).

## 0. Two things you asked for that are already shipped

Before anything else: both of the auto-unfocus behaviors from the last round
are **already fully implemented** in `storage/statusControl.ts` — I'd
described one of them as a still-open question and the other as new work in
the mockup rounds, which was wrong; I hadn't actually read this file closely
enough at the time. No code changes are needed for either:

- `setItemStatus(item, next)` clears both `dailyFocus` and `weeklyFocus` in
  the same write whenever `next !== 'active'` — this already covers a Project
  going On Hold *or* Done (`design-overview.md` §2.12, "Focus interaction").
- The Area → On-Hold cascade (same function: an Area going On Hold recurses
  `setItemStatus(project, 'on-hold')` over every Active project assigned to
  it) already goes through this same code path per cascaded project, so a
  cascaded project's own focus is already cleared too, for free — it isn't a
  separate case that needs its own handling.

So §2 of the mockup's "Still open" list (auto-unfocus via the cascade) is
resolved with zero new backend work; the panel described below can rely on
this unconditionally.

## 1. Confirmed UX, recapped

- Three direct mini-tabs inside the panel: **Focus | Projects | Areas** (not
  a single wrapping "Browse" tab — that was tried and rejected).
- **Focus tab**: today's fixed-slot display, unchanged in spirit —
  every currently-focused item of a kind gets a row with "✕" to remove;
  `limit - focused.length` empty "+ Add {kind}" slots follow. Tapping a
  focused item's name navigates to it (jumps to Current), same as today.
- **Projects/Areas tabs**: a plain, alphabetically-ordered browse of every
  *Active* Project/Area (not just focused ones) — tapping a name navigates to
  it, exactly like Focus tab's rows do. No add/remove affordance here in
  plain-browse mode.
- **"+ Add {kind}" (Focus tab, empty slot)**: arms the matching tab
  (Projects or Areas) as a picker instead of expanding an inline list in
  place. While armed, that tab's candidates are Active-and-not-already-focused
  items only, and tapping one focuses it immediately (no separate "confirm"
  step). Tapping a name while armed **picks**, it does not navigate — the
  plain-browse "tap to jump to Current" behavior is suspended for the
  duration of the arm.
- **Navigation blocking while armed** is scoped to *this panel's own three
  mini-tabs only*: switching to Focus or the other kind's tab is unavailable
  until the arm is cancelled (✕) or completed (a pick). Switching to a
  *different top-level app tab* (Projects/Areas/Current/Inbox/Review/
  Settings) is never blocked and silently cancels any in-progress arm — see
  §6 for why this falls out of the app's existing architecture for free.
- Panel height is **fixed across all three tabs** — sized to comfortably show
  the maximum number of focus slots, not something that grows/shrinks per
  tab. See §4's sizing discussion.
- Top-level Projects/Areas tabs (`ItemsList.tsx`) are explicitly out of scope
  for this feature (Tilman: "this is out of focus now" — possible future
  monthly-planning-view work).

## 2. What already exists to reuse — the survey this doc was asked for

The single biggest finding here: **this exact interaction already exists in
the app, twice.** `ui/FileBrowserPane.tsx`'s 2026-09-09 rework (`disabled`,
`entryFilter`, `sources`/`onNavigateToItem`, `LinkTarget.startAt`) was built
for precisely this shape — "browse a folder list, but let a caller either (a)
jump to an item on tap, or (b) arm the same list as a picker with a narrower
candidate set" — and two screens already use it that way:

- **`ItemDetail.tsx`'s permanent "Browse" root** — `entryFilter: activeOnly`,
  `onNavigateToItem: (kind, name, path) => onOpenItem?.(kind, {name, path,
  isFolder: true})`. Plain tap jumps to Current. Nothing arms it for a pick
  today, but the machinery is there.
- **`ItemStatusPanel.tsx`'s "Assign to Area…" action** arms the same Browse
  root as a picker: `{mode: 'arming', root: 'browse', startAt: 'area',
  pickKind: 'folder', label: 'Select Area', onPick, onCancel}` — a folder tap
  at the listing level picks immediately instead of drilling in, and
  `startAt` skips straight past the generic chooser into the Areas listing.
- **`InboxScreen.tsx`'s refile-arming** does the same thing for filing an
  Inbox task/meeting: `{mode: 'arming', root: 'browse', pickKind: 'folder',
  label: 'Refile to…'}` (no `startAt` — refile-arming wants the user to
  choose Projects vs. Areas explicitly, unlike area-assignment).

Daily's new panel is the same mechanism a third time, just without the two
things those callers needed and Daily doesn't: a synthetic two-level
"Projects/Areas" chooser under one composite root, and a second, unrelated
root (Resources) that has to be disabled-not-removed while arming. Daily
already has direct Projects/Areas mini-tabs (per §1's confirmed UX), so it
should mount **one plain, single-root `FileBrowserPane` per tab** —
`roots={[projectsRoot]}` when the Projects tab is selected, `roots={[areasRoot]}`
when Areas is — rather than a `sources` composite root. `FileBrowserPane`
only renders its own internal tab strip when `roots.length > 1`
(`FileBrowserPane.tsx` line ~449), so a single-root instance renders no
competing tab row — Daily's own outer `<MiniTabs>` (Focus | Projects | Areas)
is the only tab UI visible, matching the explicit "3 direct tabs, not a
nested Browse" requirement.

Concretely:

```ts
// Built once per render from `paths`, `items` (cache), and `focusArm`
// (§3's local arm state) — not memoized across renders, same as every
// other screen's inline `roots` array (FileBrowserPane's own effects key
// off path/boolean identity, not array identity — see its module doc
// comment on why `sources` being a fresh literal every render is fine).
const activeOnly = (entry: FolderEntry) => findCachedItem(entry.path)?.status === 'active';
const activeAndNotFocused = (entry: FolderEntry) => {
  const cached = findCachedItem(entry.path);
  return cached?.status === 'active' && !cached.dailyFocus;
};

const projectsRoot: FileBrowserRoot = {
  key: 'projects',
  label: 'Projects',
  rootPath: paths.projects,
  entryFilter: focusArm?.kind === 'project' ? activeAndNotFocused : activeOnly,
  onNavigateToItem: (kind, name, path) => onOpenItem(kind, {name, path, isFolder: true}),
};
// areasRoot mirrors this with paths.areas / kind 'area'.

const linkTarget: LinkTarget | null = focusArm
  ? {
      mode: 'arming',
      pickKind: 'folder',
      label: `Select ${focusArm.kind === 'project' ? 'Project' : 'Area'}`,
      onPick: handleFocusPick,
      onCancel: () => setFocusArm(null),
    }
  : null;
```

No `root`/`startAt` on `linkTarget` — those exist so a composite root can
switch itself to a specific source; here Daily's own mini-tab switch (below)
already puts the right single-root `FileBrowserPane` on screen before arming,
so there's nothing for `FileBrowserPane` itself to redirect. `onPick`'s
`(root, relativePath)` — `relativePath` being a bare folder name at this
depth, since the root's `rootPath` is the Projects/Areas folder directly —
looks the item up via `findCachedItem`, runs the existing `focusBlockedReason`
check defensively immediately before writing (belt-and-suspenders alongside
the `entryFilter` already excluding full/already-focused candidates — this
mirrors how `handleToggleItemFocus` already treats the guard as mandatory
right before every write, never assumed satisfied by an earlier filter
alone), then calls `setItemFocus` — both from the existing, unmodified
`storage/focusSlots.ts`.

`onNavigateToItem` calls the exact same `onOpenItem` prop `DailyView` already
receives from `App.tsx` (it's already wired for the Calendar/Focus rows'
"jump to source" affordance) — no new plumbing between `App.tsx` and
`DailyView` at all.

## 3. New component: `DailyFocusPanel`

Replaces `DailyFocusKindSection` and the full-width `focusRow` block. Lives
in `src/ui/DailyFocusPanel.tsx` (a new file — this is screen-specific enough,
and different enough in shape from a generic file browser, that it doesn't
belong inside `FileBrowserPane.tsx` itself; it *uses* `FileBrowserPane` for
two of its three tabs rather than being one).

```ts
interface Props {
  items: CachedItem[];
  paths: ResolvedParaPaths;
  dailyFocusProjectCount: number;
  dailyFocusAreaCount: number;
  onOpenItem: (kind: 'project' | 'area', entry: FolderEntry) => void;
  onToggle: (item: CachedItem, value: boolean) => Promise<void>; // = handleToggleItemFocus, unchanged
  textColor: string;
  borderColor: string;
}
```

Local state, entirely owned by this component (see §6 for why that ownership
matters):

```ts
type FocusPanelTab = 'focus' | 'projects' | 'areas';
const [activeTab, setActiveTab] = useState<FocusPanelTab>('focus');
const [focusArm, setFocusArm] = useState<{kind: 'project' | 'area'} | null>(null);
```

**Tab switching, reusing `MiniTabs`' existing `disabled` mechanism rather
than a new blocked-message widget.** `MiniTabs.tsx` already grew a per-tab
`disabled` flag in the same 2026-09-09 pass as `FileBrowserPane`'s rework —
greyed out, `Pressable disabled={true}`, no `onPress` at all
(`onPress={() => !tab.disabled && onChange(tab.key)}`). This is a stricter,
simpler mechanism than the interactive mockup's separate dimmed-tab-plus-
"Finish adding!"-text combo (that mockup was throwaway HTML/JS, not bound by
this app's actual component set) — but it's the *exact* convention
`FileBrowserPane`'s own Resources-tab-disabled-while-refile-arming already
uses, with no accompanying message anywhere else in the app. For "reuse and
uniformity" I'd recommend following that precedent exactly rather than
introducing a second, message-based blocking convention just for this one
panel:

```ts
const tabs: MiniTabDef<FocusPanelTab>[] = [
  {key: 'focus', label: 'Focus', disabled: !!focusArm},
  {key: 'projects', label: 'Projects', disabled: !!focusArm && focusArm.kind !== 'project'},
  {key: 'areas', label: 'Areas', disabled: !!focusArm && focusArm.kind !== 'area'},
];
```

While armed for `project`, Focus and Areas grey out and stop responding to
taps; Projects (the armed tab itself) stays fully active so the pick can
happen. **This is a deliberate deviation from the mockup's text-message
approach** — flagged in §7 as something to confirm before implementation,
since it's a real (if small) UX difference from what was demoed.

**"+ Add {kind}" (Focus tab)** arms and switches tabs in one step:

```ts
const armFromEmptySlot = (kind: 'project' | 'area') => {
  setFocusArm({kind});
  setActiveTab(kind === 'project' ? 'projects' : 'areas');
};
```

**A successful pick** (`handleFocusPick`, §2) clears `focusArm` and — per my
recommendation, flagged as a confirmable decision in §7 — switches back to
`activeTab: 'focus'` automatically, so the result is visible immediately
without an extra tap. Cancelling (✕ on the arm badge `FileBrowserPane`
already renders in single-root arming mode) clears `focusArm` only, leaving
`activeTab` wherever it was (now unarmed, ordinary browsing).

**Render:**

```tsx
<MiniTabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} .../>
{activeTab === 'focus' && (
  <>
    <FixedSlotSection kind="project" label="Projects" limit={dailyFocusProjectCount}
      items={items} onOpenItem={onOpenItem} onToggle={onToggle} onAddEmpty={() => armFromEmptySlot('project')} .../>
    <FixedSlotSection kind="area" label="Areas" limit={dailyFocusAreaCount}
      items={items} onOpenItem={onOpenItem} onToggle={onToggle} onAddEmpty={() => armFromEmptySlot('area')} .../>
  </>
)}
{activeTab === 'projects' && (
  <FileBrowserPane roots={[projectsRoot]} linkTarget={focusArm?.kind === 'project' ? armingTarget : null} .../>
)}
{activeTab === 'areas' && (
  <FileBrowserPane roots={[areasRoot]} linkTarget={focusArm?.kind === 'area' ? armingTarget : null} .../>
)}
```

`FixedSlotSection` is `DailyFocusKindSection`'s existing row markup (focused
rows with "✕", empty "+ Add {kind}" slots), stacked under a `label` the same
way it renders today — the only real change to that component is deleting
its own `expanded`/candidate-list state and swapping the empty-slot
`onPress` from `setExpanded` to the new `onAddEmpty` prop. Everything else —
`handleRemove`, the tap-to-navigate `Pressable` on a focused row, `pending`/
`actionError` — is unchanged.

## 4. Sizing: why the panel's height stays fixed across tabs

Focus tab's total row budget is `dailyFocusProjectCount + dailyFocusAreaCount`
(defaults 3 + 2 = 5) — that's the most content Focus tab will ever show
without its own scrolling, matching this app's "fixed rows, not a growing
scroll region" convention (`ui/pagination.ts`'s own module doc comment). For
Projects/Areas tabs to occupy the *same* panel height, their `FileBrowserPane`
page size needs to match that same 5-row budget — today it can't: `pageSize`
is hardcoded inside `FileBrowserPane` (`isSourcesRoot ? PAGE_SIZE.browse :
PAGE_SIZE.full` — 20 or 23 rows, both far taller than 5), with no per-instance
override. §5 proposes the small additive change this needs.

Whether that page size should be a literal `PAGE_SIZE` constant (`5`, matching
the *defaults*) or dynamically read from `dailyFocusProjectCount +
dailyFocusAreaCount` is a real trade-off, flagged as an open question in §7 —
`ui/pagination.ts`'s existing constants are deliberately plain, hand-tuned
integers, never computed from a settings value (see its own doc comment:
"tuned as a starting point... retune once checked against the real device"),
so a literal constant matches house convention more closely; a settings-driven
value stays exactly in sync if Tilman ever changes the focus-count settings,
at the cost of being the one `pageSize` in the app that isn't a flat constant.

## 5. Two small, additive changes to `FileBrowserPane.tsx`

**(a) Alphabetical ordering.** Confirmed by re-reading the current file:
entries render in whatever order `listFolderEntries` returns (a raw OS
directory scan) — there is no sort step anywhere in the component today.
Every existing caller inherits this same unspecified order; nothing depends
on it meaning anything. Recommend sorting `entries` by `entry.name`
(locale-aware, case-insensitive `localeCompare`) unconditionally, right after
the scan lands (or when the synthetic two-entry `sources` chooser is built —
though a 2-item list barely needs it). This is a one-line change with no
opt-in flag: every existing root (Resources, Project Files, an Area's own
Project Files, Browse) becomes alphabetical too, which is a strictly more
predictable default than "whatever the filesystem happened to return" and
costs no caller anything. Flagged in §7 in case a global change is
undesired versus scoping it to just Daily's new roots.

**(b) Per-instance page size override.** Add an optional `pageSize?: number`
to `FileBrowserRoot`, consumed as:

```ts
const pageSize = activeRoot?.pageSize ?? (isSourcesRoot ? PAGE_SIZE.browse : PAGE_SIZE.full);
```

Omitted (every existing caller), the fallback is exactly today's behavior —
purely additive, same shape as `entryFilter`/`disabled`/`sources` before it.
Daily's `projectsRoot`/`areasRoot` (§2) pass the new §4 constant.

## 6. Why leaving Daily view for another tab needs zero extra code

`App.tsx` conditionally renders `{activeTab === 'daily' && <DailyView .../>}`
— it genuinely unmounts a tab's screen when it's not active (no
`display:none`, no back-stack; the module's own doc comment is explicit about
this, and it's the same mechanism `ReviewScreen.tsx`'s step-resume state has
to work around with a module-level variable specifically *because* of it).
`focusArm`/`activeTab` living as plain `useState` inside `DailyFocusPanel`
(itself only ever mounted while `DailyView` is) means switching to any other
top-level tab destroys that state completely, and remounting Daily later
starts fresh (`activeTab: 'focus'`, `focusArm: null`) — with no code written
for it at all. This is exactly the "cancels silently, no block" behavior
confirmed for outer-tab switches, and it's an argument to **not** lift
`focusArm`/`activeTab` up into `DailyView` or `App.tsx` state even though
`DailyView` already holds plenty of its own local state elsewhere — doing so
would have to reinvent this auto-cancel by hand (an effect watching for
"did I just get unmounted," which React doesn't offer cleanly) instead of
getting it for free from where the state already lives.

## 7. Open questions to confirm before implementation

1. **Mini-tab blocking mechanism** (§3): reuse `MiniTabs`' existing
   `disabled` (silent grey-out, no message — matches `FileBrowserPane`'s
   Resources-tab precedent exactly) instead of the mockup's dimmed-tab-plus-
   text-message combo. Recommend yes, for uniformity; flagging since it's a
   visible UX difference from the last mockup round.
2. **After a successful pick**, auto-return to the Focus tab (recommended) vs.
   stay on Projects/Areas, now unarmed and browsable. Not explicitly settled
   in the mockup rounds.
3. **Panel/page-size row budget** (§4): a flat new `PAGE_SIZE` constant
   (defaulting to 5, matching today's default settings) vs. computing it from
   `dailyFocusProjectCount + dailyFocusAreaCount` at render time. Recommend
   the flat constant, for consistency with every other entry in
   `ui/pagination.ts`, unless keeping exact sync with the settings screen
   matters enough to be the one exception.
4. **Alphabetical sort scope** (§5a): applied inside `FileBrowserPane` for
   every root/caller (recommended) vs. scoped to only Daily's new
   `projectsRoot`/`areasRoot`. Recommend the global change — no current
   caller relies on directory-scan order, so there's no regression risk, and
   it keeps the "one component, one behavior" reuse principle intact.
5. **Calendar's reduced row budget** (Tilman's "shrink Calendar's own row
   budget a bit"): the Meetings sub-tab already paginates via
   `usePagination(meetingsShown, PAGE_SIZE.column)` (currently 10) and the
   Google sub-tab via `PAGE_SIZE.googleCalendarDaily` (currently 20) — both
   need a smaller, Calendar-column-specific constant now that the Focus panel
   moves into the same column underneath Calendar rather than sitting in its
   own full-width row. The exact new numbers need on-device layout tuning
   (same "tune the constant against the real device" convention every other
   `PAGE_SIZE` entry already followed) rather than a guess made here — I'd
   suggest starting both noticeably smaller (e.g. roughly half) and adjusting
   after seeing it on the actual e-ink display, same as how every other
   pagination constant in this file was arrived at.

None of these block writing the code — they're all narrow, easy to change
either way after a quick look — but worth a yes/no pass before I start.

## 8. Layout changes to `DailyView.tsx`

- `middleRow`'s left column (`column`/`columnLeft`) gains a second stacked
  block below Calendar: the new `DailyFocusPanel`. Calendar's own content
  (MiniTabs, day toggle, meeting rows, PageControls) is unchanged apart from
  the reduced page sizes (§7.5).
- The old full-width `Text style={styles.sectionTitle}>Focus</Text>` +
  `focusRow` block (two side-by-side `DailyFocusKindSection`s) is deleted
  entirely. The right column (Open tasks) keeps its existing markup
  unchanged — it structurally gains the vertical space the old `focusRow`
  used to occupy, simply because that row no longer exists below it.
- `DailyFocusKindSection` is deleted from `DailyView.tsx`; its row-rendering
  logic moves into `DailyFocusPanel.tsx`'s `FixedSlotSection` (§3) essentially
  unchanged.
- `handleToggleItemFocus` (existing) is passed through to `DailyFocusPanel`
  as `onToggle`, unchanged.

## 9. Explicitly unchanged / out of scope

- `storage/focusSlots.ts`, `storage/statusControl.ts`, `storage/areaAssignment.ts`
  — no changes anywhere in this feature.
- Top-level Projects/Areas tabs (`ItemsList.tsx`) — untouched, per Tilman's
  call in §1.
- Weekly focus / `ReviewScreen.tsx`'s step 7 — unrelated, untouched.
- `ItemDetail.tsx`, `InboxScreen.tsx`, `ItemStatusPanel.tsx` — untouched
  except that they benefit incidentally from §5a's alphabetical-sort change
  if it's applied globally.

## 10. File-by-file summary

| File | Change |
|---|---|
| `src/ui/DailyFocusPanel.tsx` | **New.** §3 — the mini-tab panel (Focus/Projects/Areas, arm-and-pick, `FixedSlotSection`). |
| `src/screens/DailyView.tsx` | Remove `DailyFocusKindSection` + `focusRow`; mount `DailyFocusPanel` under Calendar in the left column; reduce Calendar's page sizes (§7.5). |
| `src/ui/FileBrowserPane.tsx` | Two additive changes: alphabetical sort (§5a), optional per-root `pageSize` (§5b). |
| `src/ui/MiniTabs.tsx` | No change — its existing `disabled` flag is reused as-is. |
| `src/ui/pagination.ts` | New `PAGE_SIZE` constant for the Focus/Projects/Areas panel (§4/§7.3); a smaller Calendar-specific constant (§7.5) replacing `PAGE_SIZE.column`/`googleCalendarDaily` for that one column. |
| `src/storage/focusSlots.ts`, `statusControl.ts` | No changes. |
| `docs/dev/design-overview.md` | Update §2.11 (layout) and §2.10 (UI touch points) once implemented, per this project's own "update after implementing" convention. |

## 11. Mockup follow-ups (small, cosmetic)

- Remove the `(focused)` annotation from the mockup's browse-mode row text —
  agreed: browsing (unarmed) shows every Active item identically, focused or
  not, since a plain tap always navigates regardless of focus state.
- The "Still open: auto-unfocus via the cascade" item is resolved — see §0.
