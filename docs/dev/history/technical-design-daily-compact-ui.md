# Technical design: Daily-view compaction + app-wide header/refresh unification

**Status (2026-09-03): Phases 1-4 implemented** (§1-§4 below) — see `design-overview.md` §2.15/§5 for the as-built writeup and the scope decisions made along the way. **Phase 5 (§5 below, the standalone Inbox tab) was explicitly descoped for this pass** and remains not started — tracked as its own item in `design-overview.md` §4's Outstanding scope. Everything below is left as originally written (the design as proposed, not edited after the fact); where the as-built behavior differs in a small way, `design-overview.md` §2.15 is the source of truth.

Requirements were clarified in chat (2026-09-02) across two rounds — the Daily-view space pass, then a same-day scope widening to all tabs for header/refresh, plus a plugin-icon-reuse check. See project memory `feature_daily_compact_ui.md` for the full decision log this design implements. This document is the technical design step of this project's standing "clarify → design → implement" workflow (`design-overview.md` §gtdpara_project).

Guiding instruction for this design (verbatim intent): **simplify, reuse existing components/patterns wherever possible, keep the architecture uniform** rather than growing a fourth or fifth version of the same UI. Every section below picks the option that reuses an existing pattern over inventing a new one, and calls out explicitly where something genuinely new is unavoidable.

## 0. Already satisfied, no work

**Plugin icon reuse.** `index.js` already registers the sidebar (type 1), lasso (type 2), and selection (type 3) buttons with `icon: Image.resolveAssetSource(require('./assets/icon.png')).uri` — the exact file `PluginConfig.json`'s `iconPath` names as the plugin's own icon. Verified by opening the file (a real checkmark-in-rounded-square glyph, not a placeholder). Nothing to change.

## 1. Shared refresh + header removal (all tabs)

**Problem shape.** `TabBar` (rendered once in `App.tsx`) is the one place `✕ Close plugin` lives, but each of the six tab screens today independently renders its own duplicate heading (Projects/Areas/Daily/Weekly Review/Settings — Current's `ItemDetail` is the one exception, its heading shows the *item name*, not "Current") and, except Settings, its own local refresh action:

| Tab | Own heading today | Own refresh today |
|---|---|---|
| Projects/Areas (`ItemsList`) | "Projects"/"Areas" | Labeled button: "🔄 Build cache" / "🔄 Rebuild cache" |
| Daily (`DailyView`) | "Daily" | Small 🔄 icon |
| Current (`ItemDetail`) | Item name (**keeps this**, not a duplicate) | None today |
| Review (`ReviewScreen`) | "Weekly Review" | Small 🔄 icon |
| Settings | "Settings" | None (nothing cache-backed) |
| Inbox (new, §3) | — | Will need one, same convention |

**Target.** Every redundant heading is removed. One small 🔄 icon lives in `TabBar`'s own row, immediately left of `✕`, and it means "refresh whatever the active tab is showing." It's hidden when the active tab has nothing to refresh (Settings).

### 1.1 Why callback-prop registration, not a ref/imperative-handle

Two ways to let one button in `TabBar` (a sibling, not an ancestor, of whichever screen is mounted) trigger that screen's own `load()`:

- **Ref + `useImperativeHandle`** — `App.tsx` holds a ref to whichever screen is mounted, calls `ref.current.refresh()`. Standard React, but this codebase has never used imperative refs anywhere — every existing "parent needs to react to what a child does" case (`onOpenItem`, `onArchived`, `onFinished`, `onAdd`, `onSelect`, `onRegisterRefresh` below) is a plain callback prop.
- **Callback-prop registration (chosen)** — each screen that has a refresh action calls a prop function once on mount with `{run, loading}` and calls it again with `null` on unmount. `App.tsx` just stores whatever the currently-mounted screen last registered.

Callback-prop registration wins on "keep the architecture uniform": it's the exact same shape every other parent/child data flow in this codebase already uses, not a new React pattern. It also composes for free with something this codebase already relies on (§2.1 of `design-overview.md`): **`App.tsx` genuinely unmounts a tab's screen when it's not active** (conditional rendering, no `display:none`/back-stack). That means the registration effect's cleanup (`onRegisterRefresh(null)`) fires exactly on tab-switch-away, and the newly-mounted screen's own mount effect registers fresh — no tab-change-specific wiring needed in `App.tsx` at all, it fully falls out of the existing lifecycle.

### 1.2 Two callbacks, not one, to avoid a flicker

A single combined prop (`onRegisterRefresh(handle: {run, refreshing} | null)`) looks simpler, but re-running that call on every `loading` toggle means the effect's cleanup fires `null` first and the new value second, as two separate commits — `TabBar`'s icon would visibly flash away and back on every refresh tap. Splitting into two callbacks avoids this entirely:

```ts
// New exported type, colocated in ui/TabBar.tsx (the consumer):
export interface RefreshHandle {
  run: () => void;
}

// Each refreshable screen's Props gain:
onRegisterRefresh?: (handle: RefreshHandle | null) => void;  // called once on mount, once (null) on unmount — never on loading changes
onRefreshingChange?: (refreshing: boolean) => void;          // called whenever the screen's own `loading` boolean changes
```

Usage inside e.g. `DailyView.tsx` (same shape in every other refreshable screen):

```ts
useEffect(() => {
  onRegisterRefresh?.({run: () => load(true)});
  return () => onRegisterRefresh?.(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []); // load's identity is stable (useCallback, []), registered once

useEffect(() => {
  onRefreshingChange?.(loading);
}, [loading, onRefreshingChange]);
```

### 1.3 `App.tsx` wiring

```ts
const [refreshHandle, setRefreshHandle] = useState<RefreshHandle | null>(null);
const [refreshing, setRefreshing] = useState(false);
```

Passed to every refreshable screen as `onRegisterRefresh={setRefreshHandle}` / `onRefreshingChange={setRefreshing}`; **not** passed to `Settings` (it has nothing to register, so `refreshHandle` naturally stays `null` while Settings is active — no special-casing needed). Passed down to `TabBar` as:

```tsx
<TabBar
  ...
  onRefresh={refreshHandle?.run}
  refreshing={refreshing}
/>
```

`TabBar` renders the icon only when `onRefresh` is defined; shows an `ActivityIndicator` in its place while `refreshing` (same small-spinner-in-button idea `ItemsList`'s current button already uses, just relocated).

### 1.4 Per-screen changes

- **`ItemsList.tsx`** — delete `topRow`'s heading `Text` and the labeled `scanButton` `Pressable` (and its now-unused styles); register `{run: handleRebuild}` / `loading: scanning`. The empty-state hint ("Not built yet…") gets reworded to point at the shared icon instead of naming a button label — e.g. *"Not built yet — tap 🔄 above to scan your {TITLES[kind]} folder."* (per the earlier-confirmed "downgrade to shared icon everywhere" decision).
- **`DailyView.tsx`** — delete `headerRow` (heading + refresh `Pressable`) entirely; register `{run: () => load(true)}` / `loading`.
- **`ReviewScreen.tsx`** — same: delete its `headerRow` (heading + refresh `Pressable`); register `{run: () => load(true)}` / `loading`.
- **`Settings.tsx`** — delete its `headerRow` (heading only, it never had a refresh). No registration props needed.
- **`ItemDetail.tsx`** — keeps its own heading (item name — not a duplicate). Gains a *new* refresh capability it didn't have before (confirmed decision): see §1.5.

### 1.5 "Current" tab: new refresh capability

`ItemDetail` reads two independent things: its own live, uncached file-listing pane (`load(current.path)`, always a fresh disk scan by design — a different kind of data, `design-overview.md` §2.1), and `ProjectDataPanel`, which reads the shared `dataCache` once on mount via `ensureItemCached` into its own local `state` — it does not re-read if the cache changes elsewhere. Neither path has ever rebuilt the shared cache itself.

Refreshing "Current" needs to do three things in order: (1) rebuild the shared cache from disk, (2) re-scan the currently-open folder-listing level, (3) make `ProjectDataPanel` re-read the now-fresh cache entry. (1) and (2) are one new async function in `ItemDetail`; (3) needs a small, additive prop rather than any change to how `ProjectDataPanel` fetches data:

```ts
// ItemDetail.tsx — new state + handler
const [refreshToken, setRefreshToken] = useState(0);
const [refreshing, setRefreshing] = useState(false);

const handleRefresh = async () => {
  setRefreshing(true);
  try {
    const settings = await loadSettings();
    await rebuildCache(settings);       // storage/dataCache.ts — same call ItemsList/DailyView/ReviewScreen already use
    await load(current.path);           // ItemDetail's own existing file-listing reload
    setRefreshToken(t => t + 1);        // tells ProjectDataPanel to re-derive from the now-fresh cache
  } finally {
    setRefreshing(false);
  }
};
```

`ProjectDataPanel` gains one new optional prop, `refreshToken?: number`, added to its existing mount `useEffect`'s dependency array (today keyed on `[kind, name, path]`) — no change to what that effect *does* (`ensureItemCached` already returns the freshly-rebuilt cache entry once step (1) above has run, since the item is now already in cache — no second disk read happens). This is the smallest possible change to `ProjectDataPanel`: one more dependency, zero new fetch logic, following the exact `ensureItemCached`-first read pattern every other screen already uses (§3's "reads should prefer the cache" rule).

`ItemDetail` registers `{run: handleRefresh}` / `loading: refreshing`, same convention as every other screen.

### 1.6 Layout risk to watch (flag, not a blocker)

`TabBar`'s single row is about to hold up to **9** interactive elements once the Inbox tab (§3) lands: 7 tab labels + the shared refresh icon + ✕. Nothing in this codebase currently verifies how much horizontal space Supernote's e-ink screen actually gives that row, and it hasn't been checked here either (no on-device build access this session, same standing caveat as every other feature in `design-overview.md`). Worth an explicit on-device look once built — if labels crowd, the cheapest fixes in order of preference are: shorten "Settings" to "⚙", or make the tab row horizontally scrollable. Not designing either pre-emptively; flagging so it's not a surprise.

## 2. Icon-only tag flags (`ui/TaskBadges.tsx`)

**Reuse decision.** Rather than introducing a new icon subsystem (image assets, an SVG library, a new "icon" concept), reuse the exact pattern already established everywhere in this app: a single Unicode/emoji glyph inside the existing `<Text>` badge — the same approach `✕` (cancel), `📓`/`+📓` (note), `🔄` (refresh), `★` (focused), `●` (review-overdue badge), `📅` (already used as a meeting-row prefix in `ReviewScreen`), `⚠` (error), `☑`/`☐` (checkbox) already use throughout. This is grayscale-safe by construction (it already renders in grayscale everywhere else), needs no new dependency, and is the "keep it uniform" choice over anything image-based.

**Glyph set** (one per badge kind — shape-distinct, not color-distinct):

| Badge | Today (text) | New (icon) |
|---|---|---|
| Next | `"Next"` | `▶` |
| Waiting on | `"Waiting on: {name}"` | `⏸` |
| Due (not yet overdue) | `"Due {date}"` | `📅` |
| Overdue | `"Overdue {date}"` | `⚠` |

**Tap-to-reveal.** `taskBadgeLabels(task, context, today)` (the pure, non-visual export) is untouched — it's still the source of the full text a screen-reader-equivalent or a test would want. The rendering component gains local state:

```ts
const [revealedIndex, setRevealedIndex] = useState<number | null>(null);
```

Tapping a badge toggles `revealedIndex` to that badge's index; while revealed, that one badge renders its full label text (`taskBadgeLabels`'s existing string) instead of the glyph; a `setTimeout` (~2s, cleared on unmount/re-tap) collapses it back to the glyph automatically, so a forgotten open badge doesn't stay expanded forever. Every badge becomes a `Pressable` instead of a bare `Text` — the only structural change to this component; `taskBadgeLabels`'s contract, and every call site's props, are unchanged.

**Daily's Open-Tasks context stays `'flat'`.** Once Daily's Open Tasks list is *also* grouped (§4, by Project/Area), it's tempting to read that as "now use `context='grouped'`" — that would be wrong. The `'flat'`/`'grouped'` distinction encodes whether the *flow-state* is already implied by the surrounding grouping (`ProjectDataPanel`'s Todos list groups by flow-state, so repeating "Next" on every row is redundant there). Daily's new grouping is by source Project/Area, a different axis — flow-state is still not implied by a project-name header, so a Next task on Daily still needs its own badge. Daily's rows keep `context="flat"`.

## 3. Open Tasks grouped by Project/Area (Daily view)

**Reuse decision.** The "focused floats to top, then alphabetical" ordering already exists in two places that don't share it: `ItemsList.tsx` has its own local, unexported `isFocused(item)`, and `domain/destination.ts` has an almost-identical private `isFocused` backing `destinationCandidates`. Rather than write a *third* copy for the new Daily grouping, **export `isFocused` from `domain/destination.ts`** (widen its parameter type to the minimal shape `{dailyFocus: boolean; weeklyFocus: boolean}` it already uses) and have `ItemsList.tsx` delete its local copy and import the shared one. Small, pre-existing duplication cleaned up as a side effect of this feature, not a separate ask.

**Grouping function**, colocated in `storage/dailyAggregate.ts` next to `DailyTaskEntry`/`buildDailyAggregate` — same placement convention `domain/flowState.ts`'s `groupTasksByFlowState` already established for `ProjectDataPanel`'s analogous grouping (a pure, exported grouping function living beside the data it groups, called directly from the screen):

```ts
// storage/dailyAggregate.ts

// DailyItemRef widens to carry what group ordering needs — both derivable
// straight from CachedItem, same "cache always reproducible" rule as
// everything else on this type.
export interface DailyItemRef {
  kind: 'project' | 'area';
  name: string;
  path: string;
  dailyFocus: boolean;
  weeklyFocus: boolean;
}

export interface DailyTaskGroup {
  item: DailyItemRef;
  entries: DailyTaskEntry[];
}

/** Groups an already-built DailyAggregate's tasks by source Project/Area.
 *  Group order: daily/weekly-focused items first (domain/destination.ts's
 *  isFocused, same convention as ItemsList/destinationCandidates), then
 *  alphabetical — Array.prototype.sort is stable, so a plain
 *  compare-by-focused over the already-alphabetical item order is enough.
 *  Within a group, task order is preserved exactly as buildDailyAggregate
 *  produced it (file order — there is no existing task sort to preserve;
 *  none is introduced here either). */
export function groupDailyTasksByItem(entries: DailyTaskEntry[]): DailyTaskGroup[] {
  const byPath = new Map<string, DailyTaskGroup>();
  for (const entry of entries) {
    let group = byPath.get(entry.item.path);
    if (!group) {
      group = {item: entry.item, entries: []};
      byPath.set(entry.item.path, group);
    }
    group.entries.push(entry);
  }
  return Array.from(byPath.values()).sort(
    (a, b) => Number(isFocused(b.item)) - Number(isFocused(a.item)),
  );
}
```

**`DailyView.tsx` render change.** The Open Tasks column's flat `aggregate.tasks.map(renderTaskEntry)` becomes `groupDailyTasksByItem(aggregate.tasks).map(renderGroup)`, where each group renders a header (the Project/Area name, now the one and only "jump to this item" affordance — replacing the per-row `rowSource` `Pressable` text, reusing the exact same `openItem(entry.item)` handler that subtext already called) followed by that group's `renderTaskEntry` rows with the per-row source subtext removed (it's now redundant with the group header).

## 4. Today/Tomorrow sub-tabs (Calendar column)

Scoped to the Calendar column only (confirmed decision — Open Tasks stays one unified list). Replaces the two always-both-visible "Today"/"Tomorrow" `subheading` blocks with a small local toggle:

```ts
const [calendarDay, setCalendarDay] = useState<'today' | 'tomorrow'>('today');
```

Rendered as two small `Pressable`s at the top of the Calendar column, visually the same selected/unselected treatment `FlowStateChips`/`TabBar` already use (border → `#2f6feb` + bold when selected — reusing the existing de facto accent color rather than inventing a new one, per `design-overview.md` §3's styling notes). Only `calendarDay === 'today' ? meetingsToday : meetingsTomorrow` renders below.

**Small optional refinement, flagged separately so it isn't silently assumed:** default the "Add meeting" quick-add's date field to whichever day is currently selected (today or tomorrow) rather than always today, so adding a meeting while looking at Tomorrow doesn't require retyping the date. Cheap (`initialDate` prop on the new `MeetingQuickAdd`, §5.2), no new interaction, but it is a small behavior change beyond the literal ask — flagging it as a recommendation, not assuming it.

## 5. Inbox as its own tab

This is the largest piece. Full parity was confirmed: File/Done/Cancel for both tasks and meetings, plus quick-add for both, and Weekly Review's own Inbox-to-zero step (`ReviewScreen.tsx` step 2) was to stay unchanged, duplication accepted.

**Given this session's "reuse wherever possible" instruction, that duplication call is worth revisiting rather than taking as fixed.** `ReviewScreen.tsx`'s step 2 (`renderInboxZero` + its private `FileToPicker`) is already almost exactly what the new Inbox tab needs to render — extracting it once and having both surfaces use it is a smaller, safer change than building a near-duplicate a second time, and it's the same move this codebase has already made twice before (`TaskQuickAdd`/`DestinationPicker` extracted from `DailyView` once Review needed the same "add a task" UI; `TaskBadges`/`TaskEditCard`/`FlowStateChips` extracted once three surfaces needed the same tag UI). Proposing this now, explicitly, rather than silently overriding the earlier "kept separate" answer — flag if the duplication was actually wanted for a reason not visible from the code (e.g. wanting the two surfaces free to diverge later); absent that, extraction is the better default here.

### 5.1 New shared component: `ui/InboxItemList.tsx`

Presentational + local UI state only, same "child owns UI state, parent owns the mutation" split `TaskQuickAdd` already established (its own doc comment describes this exact pattern). Extracted verbatim from `ReviewScreen.tsx`'s current `renderInboxZero` body and its private `FileToPicker` function — no behavior change, pure move:

```ts
interface Props {
  tasks: Array<{task: Task; taskIndex: number}>;
  meetings: Array<{meeting: Meeting; meetingIndex: number}>;
  items: CachedItem[];                 // FileToPicker's candidate list
  onFileTask: (taskIndex: number, target: InboxFilingTarget) => void;
  onDoneTask: (taskIndex: number) => void;
  onCancelTask: (taskIndex: number) => void;
  onFileMeeting: (meetingIndex: number, target: InboxFilingTarget) => void;
  onCancelMeeting: (meetingIndex: number) => void;
  actionError: string | null;
  textColor: string;
  borderColor: string;
}
```

Owns its own `filingKey` state (which row's `FileToPicker` is expanded) exactly as `ReviewScreen` does today — that's local UI state, not data, so it belongs in the component per the established split. `FileToPicker` moves with it as a non-exported helper in the same file (nothing else needs it directly).

`ReviewScreen.tsx`'s step 2 becomes a thin wrapper — filter `inbox.tasks`/`inbox.meetings` (unchanged filtering logic) and render `<InboxItemList ... onFileTask={handleFileTask} onDoneTask={handleInboxTaskDone} ... />`. Every existing handler (`handleFileTask`, `handleInboxTaskDone`, etc., including their `bump('inboxCleared')` review-session-counter side effects) is untouched — only the JSX that called them inline moves into the shared component's callback props. Net effect: `ReviewScreen.tsx` shrinks by roughly the size of the extracted JSX, zero behavior change on the Review tab.

### 5.2 New shared component: `ui/MeetingQuickAdd.tsx`

`DailyView.tsx` has its own hand-rolled meeting quick-add today (title/date/time inputs + a `DestinationPicker` + `submitNewMeeting`, ~60 lines of JSX and 7 pieces of local state) — never extracted the way `TaskQuickAdd` was, per that file's own doc comment ("no MeetingQuickAdd equivalent exists yet - nothing else needed one"). The new Inbox tab now needs the same capability fixed to Inbox, which is exactly the situation that already justified extracting `TaskQuickAdd`. Mirrors it closely:

```ts
interface Props {
  items?: CachedItem[];                              // ignored when fixedDestination is set
  fixedDestination?: Destination;
  initialDestination?: Destination;
  initialDate?: string;                               // defaults to todayIso(); §4's Today/Tomorrow refinement feeds this
  onAdd: (fields: {title: string; date: string; time: string}, destination: Destination) => Promise<void>;
  label?: string;
  textColor: string; borderColor: string; placeholderColor: string;
}
```

Owns title/date/time/destination/pickerOpen/pending/error state internally (same as `TaskQuickAdd`'s equivalents), calls the existing shared `validateMeetingFields` (`domain/meetingTime.ts`, already used by both `DailyView` and `ProjectDataPanel`), and gets the same "✓ Added" acknowledgment `TaskQuickAdd` has — an established pattern for this app's quick-add components now, not something to omit on the newer one.

`DailyView.tsx`'s Calendar column swaps its ~60 lines of inline meeting-add JSX + 7 state variables for `<MeetingQuickAdd items={items} initialDate={calendarDay === 'today' ? todayIso() : isoDateOffset(1)} onAdd={handleAddMeeting} .../>`, where `handleAddMeeting` is `submitNewMeeting`'s existing save logic reshaped to the new callback signature — a net simplification of `DailyView.tsx`, not just a lateral move.

### 5.3 New screen: `screens/InboxScreen.tsx`

Owns its own `inbox`/`items`/`basePath`/`loading` state, loaded the same way `DailyView`/`ReviewScreen` already load Inbox today (`loadProjectFile('inbox', paths.base)` alongside `getCachedData()`/`rebuildCache`-if-missing — `design-overview.md` §2.9's established Inbox-loading pattern, reused verbatim). Defines its own `handleInboxTaskDone`/`handleInboxTaskCancel`/`handleInboxMeetingCancel`/`handleFileTask`/`handleFileMeeting` — same shapes as `ReviewScreen`'s, minus the `bump()` review-counter calls (this tab has no review session). Renders:

1. `TaskQuickAdd` with `fixedDestination={{type: 'inbox'}}` — reused as-is, zero new code.
2. `MeetingQuickAdd` (§5.2) with `fixedDestination={{type: 'inbox'}}` — reused as-is.
3. `InboxItemList` (§5.1) wired to this screen's own handlers — reused as-is.

Registers with the shared refresh (§1) exactly like every other tab. No header of its own, per §1's app-wide rule.

### 5.4 `TabBar`/`App.tsx` tab registration

`AppTab` widens to `'projects' | 'areas' | 'daily' | 'inbox' | 'current' | 'review' | 'settings'`. Suggested placement: **immediately after Daily** — `Projects, Areas, Daily, Inbox, Current, Review, Settings`. Reasoning (not asked, offered as a default worth overriding if it reads wrong once seen): Daily and Inbox are both "flow" tabs (what's in front of you right now), grouped together ahead of the more structural Current/Review/Settings tabs; Inbox was physically part of Daily until this change, so keeping it adjacent matches the mental model users already have. Low-stakes, easy to move if it reads wrong on-device.

`DailyView.tsx`'s Inbox section (heading, task rows with toggle-done, read-only meeting rows) is deleted entirely — no longer loads `inbox`/`basePath` for that purpose (still needs `basePath` for its own meeting/task quick-add's Inbox destination option, unchanged).

## 6. Cross-cutting reuse cleanup this design folds in

Called out separately since none of these were asked for individually — each is a small existing inconsistency this design's own work already touches, and leaving it as found would mean *not* following the "keep architecture uniform" instruction:

- `domain/destination.ts` exports `isFocused` (widened parameter type); `ItemsList.tsx` drops its duplicate local copy (§3).
- `ui/MeetingQuickAdd.tsx` closes the "no MeetingQuickAdd equivalent exists yet" gap `TaskQuickAdd`'s own doc comment flags (§5.2) — the moment a second caller needs it, per this codebase's own established bar for extracting a shared component.
- `ui/InboxItemList.tsx` closes the Inbox-UI duplication the original requirements round explicitly accepted, once a second caller (Inbox tab) makes it worth extracting (§5.1) — same bar as above.

None of these touch data model, file format, or the cache/write-through rules — pure UI-layer de-duplication.

## 7. Suggested implementation phases

Each phase is independently testable and shippable; later phases depend only on earlier ones, not on each other sideways:

1. **Shared refresh + header removal** (§1) — `ui/TabBar.tsx`, `App.tsx`, `ItemsList.tsx`, `DailyView.tsx`, `ReviewScreen.tsx`, `Settings.tsx`, `ItemDetail.tsx`, `ProjectDataPanel.tsx` (one new prop). No visual dependency on anything below.
2. **Icon-only tag flags** (§2) — `ui/TaskBadges.tsx` only; every caller unaffected.
3. **Open Tasks grouped by Project/Area** (§3) — `domain/destination.ts`, `storage/dailyAggregate.ts`, `DailyView.tsx`.
4. **Today/Tomorrow sub-tabs** (§4) — `DailyView.tsx`, plus `ui/MeetingQuickAdd.tsx` (§5.2) since Daily's own quick-add is extracted as part of this phase.
5. **Inbox as its own tab** (§5) — `ui/InboxItemList.tsx` (new), `screens/InboxScreen.tsx` (new), `ReviewScreen.tsx` (refactor to shared component), `ui/TabBar.tsx`/`App.tsx` (new tab), `DailyView.tsx` (Inbox section removed).

## 8. Verification plan

Following this project's standing convention (`design-overview.md` §3 "Verification" — standalone Node scripts for pure logic, plus a `tsc --noEmit` + `eslint` pass, no Jest):

- Extend `verify-aggregate.ts` with cases for `groupDailyTasksByItem` (§3): grouping is correct, focused-groups-first ordering, stable alphabetical fallback, within-group order preserved.
- A quick standalone check for the widened `isFocused` export (§6) — trivial, but worth a one-line case so `ItemsList.tsx`'s behavior provably doesn't change after switching to the shared import.
- `taskBadgeLabels` (§2) is untouched, so its existing coverage (if any) still applies; the new tap-to-reveal interaction is visual/stateful, not something a standalone script can check — an on-device look is the only real verification for it.
- Full `tsc --noEmit` + `eslint` scratch-project pass across every touched file, same standing practice as every prior feature here.
- **On-device smoke test items** (nothing in this design has on-device build access this session, same caveat as every other feature in `design-overview.md`): §1.6's TabBar row width with 7 tabs + refresh + close; §1.5's Current-tab refresh actually rebuilding the cache and updating `ProjectDataPanel`; §2's tap-to-reveal timing/legibility on real e-ink; §5's Inbox tab end-to-end (add → file/done/cancel → confirm the item actually lands in/leaves the right file, not just the UI list).

## 9. Docs to update once implemented

Per `design-overview.md`'s own standing instruction ("update it after implementing" — §2 as-built, §4 outstanding scope, §5 decisions): add a new §2.15 covering this feature once built, remove the Inbox/header/refresh assumptions §2.1/§2.9/§2.11 currently state as fact (they describe the pre-this-design behavior), and fold this document's own "resolved" framing into §5's historical-decisions list, matching how every prior `technical-design-*.md` in this `docs/` folder was folded back in.
