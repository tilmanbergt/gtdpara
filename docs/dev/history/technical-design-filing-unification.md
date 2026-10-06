# Technical design: Filing unification (Inbox/Review Files panel, Lasso auto-destination, Lasso reset bugfix)

Status: design drafted 2026-09-07 from chat requirements clarification (two rounds, including two AskUserQuestion decisions - see §13). Not yet implemented.

## 1. What it is

Generalizes the "arm a `FileBrowserPane` tab, browse, tap to pick" pattern - built for Project↔Area assignment (`technical-design-project-area-assignment.md`) - to every place in the app that currently offers a way to put a new or captured Task/Meeting into a Project/Area, per Tilman's request to reuse that flow throughout and reduce complexity. Five changes, one shared mechanism:

1. **Inbox tab**: the "File" action on Task/Meeting rows becomes arm-based (its Files pane gains Projects/Areas tabs alongside the existing Resources tab). `ui/FileToPicker.tsx`'s inline expandable list is retired here.
2. **Weekly Review's Inbox-to-zero step**: gains the *same* two-pane Files-panel layout Inbox has (today it's single-column with the same inline `FileToPicker`) - Files pane on the left (Resources/Projects/Areas), Tasks/Meetings cards on the right. Its rows also gain the Link action for the first time (they only ever had File before).
3. **Daily view's Open-tasks/Calendar quick-adds, and Weekly Review step 1's ("Week ahead") quick-add**: lose their unrestricted Inbox/Project/Area picker, become `fixedDestination: {type: 'inbox'}` always. "File it properly" now happens exclusively via (1)/(2), never at capture time on these two screens.
4. **Lasso capture** (`CaptureScreen.tsx`): loses its destination picker entirely. Destination is always the source note's enclosing Project/Area, or Inbox if it has none - no override, no choice.
5. **Lasso reset bugfix** (bundled at Tilman's request, unrelated root cause): the regression where every capture after the first shows the previous capture's recognized text. Root-caused to `App.tsx`'s `captureNonceRef` being a `useRef` instead of `useState` - see §9.

**Explicitly requires zero changes**: `ui/FileBrowserPane.tsx`. Everything (1)-(2) need - `entryFilter`, `pickKind: 'folder'`, `label`, `root` on the `arming` `LinkTarget` variant - was already built for Project↔Area assignment. This is the headline complexity-reduction result: **filing a Task/Meeting into a Project/Area and assigning a Project to an Area are the same operation** - "point this thing at that folder" - differing only in what `onPick` does with the pick (move a task/meeting line vs. write a frontmatter field). See §2.

## 2. Filing and area-assignment are the same shape

Area-assignment's `onPick(root, relativePath)` (root `'areas'`, `pickKind: 'folder'`) resolves the picked folder's absolute path and calls `assignProjectToArea`. Filing needs exactly the same resolve-then-mutate shape, just against `storage/inboxFiling.ts`'s already-existing `fileInboxTask`/`fileInboxMeeting` (a **move**: write to the target file first, then remove the Inbox line - unchanged, already reused as-is) instead of a frontmatter write. Concretely, filing's `onPick` needs to turn `(root: 'projects' | 'areas', relativePath: string)` into an `InboxFilingTarget {kind, name, path}` - `relativePath` is a bare folder name (pick only ever fires at depth 0, per `pickKind: 'folder'`), so `kind` is `root === 'projects' ? 'project' : 'area'`, `name` is `relativePath`, `path` is `${paths[root]}/${relativePath}`.

This mapping is identical in both places that need it (Inbox tab, Review's Inbox-to-zero step - see §10 for why it's extracted rather than duplicated), and it's the same three fields `domain/settings.ts`'s `findEnclosingItem` already returns (`EnclosingItem {kind, name, path}`) - which is exactly what Lasso's new auto-destination resolution needs too (§8). Three unrelated-looking features - filing, area-assignment, Lasso's smart default - all bottom out in "resolve a folder to `{kind, name, path}`, then do this specific thing with it."

## 3. Inbox tab: Files pane gains Projects/Areas, File becomes arm-based

### 3.1 New roots

`fileBrowserRoots` (today: `[{key: 'resources', ...}]`, one root, no `entryFilter`) grows to three:

```ts
const fileBrowserRoots: FileBrowserRoot[] = paths
  ? [
      {key: 'resources', label: 'Resources', rootPath: paths.resources},
      {key: 'projects', label: 'Projects', rootPath: paths.projects, entryFilter: activeOnly},
      {key: 'areas', label: 'Areas', rootPath: paths.areas, entryFilter: activeOnly},
    ]
  : [];
```

where `activeOnly = (entry: FolderEntry) => findCachedItem(entry.path)?.status === 'active'` - the exact `entryFilter` the Areas tab already uses for area-assignment, reused verbatim (not Active-and-focused-first like `destinationCandidates` - a `FileBrowserPane` root is a flat filesystem listing with a boolean filter, it doesn't reorder). This is a deliberate simplification worth flagging: linking (not just filing) through the new Projects/Areas tabs is now also restricted to Active items only, since `entryFilter` is a property of the root, not of which action armed the pane. Filing already had this restriction (`destinationCandidates` was always Active-only); this narrows linking's reach slightly. Accepted rather than building a second, action-conditional `entryFilter` mechanism into `FileBrowserPane.tsx` for one edge case - see §13.

### 3.2 `armTarget` gains an intent

Today `armTarget: EditTarget | null` (`{type: 'task'|'meeting'; index: number}`) means exactly one thing: "arming to link." It now needs to distinguish link vs. file:

```ts
type ArmTarget = {type: 'task' | 'meeting'; index: number; intent: 'link' | 'file'};
const [armTarget, setArmTarget] = useState<ArmTarget | null>(null);
```

`armLinkTarget` (existing) sets `intent: 'link'`; a new `armFileTarget(type, index)` sets `intent: 'file'`. `editTarget` is untouched (edit and arm are already mutually exclusive - `startEditTarget`/`armLinkTarget`/the new `armFileTarget` all clear the others, same as today).

### 3.3 Two roots while filing, three while linking (or browsing)

To make "you can't accidentally file into Resources" true **by construction** rather than by a defensive check inside `onPick` (this codebase's stated preference - see the area-assignment doc's §4.1 reasoning for the archive-block-before-dialog ordering), the roots actually passed to `FileBrowserPane` depend on `armTarget.intent`:

```ts
const filingRoots = fileBrowserRoots.filter(r => r.key !== 'resources');
const activeRoots = armTarget?.intent === 'file' ? filingRoots : fileBrowserRoots;
```

`<FileBrowserPane roots={activeRoots} .../>` - normal browsing and link-arming show all three tabs (Resources | Projects | Areas); file-arming shows only Projects | Areas. The Resources tab simply isn't there to tap into by mistake while filing, and MiniTabs re-renders with two tabs the instant `armFileTarget` fires (same conditional-tab-count precedent as area-assignment's own "Area Files" tab appearing/disappearing).

### 3.4 `onPick` / `linkTarget` derivation

```ts
const handlePickFile = useCallback(
  (root: string, relativePath: string) => {
    if (!paths || !armTarget || armTarget.intent !== 'file') return;
    const target = resolveFilingPick(paths, root, relativePath); // storage/inboxFiling.ts, new - see §10
    if (!target) return;
    if (armTarget.type === 'task') handleFileTask(armTarget.index, target);
    else handleFileMeeting(armTarget.index, target);
    setArmTarget(null);
  },
  [paths, armTarget /* + inbox/basePath transitively, same shape as handlePickLinkedFile */],
);

const linkTarget: LinkTarget | null = armTarget
  ? armTarget.intent === 'file'
    ? {mode: 'arming', onPick: handlePickFile, onCancel: cancelArming, pickKind: 'folder', label: 'Select Project/Area', root: 'projects'}
    : {mode: 'arming', onPick: handlePickLinkedFile, onCancel: cancelArming} // unchanged
  : /* existing locating branch, unchanged */ ...;
```

`root: 'projects'` means file-arming always starts on the Projects tab (matches `FileToPicker`'s existing "Projects" section coming first); the user can still tap over to Areas, same as area-assignment's own "always start at Areas" convention just mirrored onto whichever of the two filing roots is more likely.

### 3.5 Row wiring

`renderTaskRow`/`renderMeetingRow` swap `onFile={target => handleFileTask(index, target)}` + `fileCandidates={items}` for `onArmFile={() => armFileTarget('task', index)}` (§4 below covers the row-component side of this rename), and gain `isArming={armingTaskIndex === index && armTarget?.intent === 'file' /* or reuse the existing isArming flag - see note below */}`.

One wrinkle: `isArming` today just means "this row is armTarget" (used for both edit-style highlighting, regardless of intent) - `armingTaskIndex`/`armingMeetingIndex` derive from `armTarget?.index` without caring about intent, so a row highlights whenever it's armed for *either* link or file. That's fine to keep as-is (a row being armed for anything is worth highlighting the same way) - no change needed there.

`handleFileTask`/`handleFileMeeting` (the actual `fileInboxTask`/`fileInboxMeeting` calls) are unchanged - only how they get invoked changes (from `FileToPicker`'s `onSelect` to the new `onPick`).

`items` (the cache, currently passed to `FileToPicker` as `fileCandidates`) is still needed for `refreshItemsFromCache` after a File action, but no longer needs to be threaded into the rows at all once `fileCandidates` is gone from `TaskRow`/`MeetingRow`'s props (§4).

## 4. `ui/TaskRow.tsx` / `ui/MeetingRow.tsx`: `onFile` → `onArmFile`

Both rows currently own an inline `filingOpen` state and render `ui/FileToPicker.tsx` directly beneath the row when `onFile` is passed - explicitly called out in `TaskRow`'s own doc comment as "a known, deliberately deferred exception to the 'nothing expands inline' rule." That exception goes away entirely:

```ts
// Before:
onFile?: (target: InboxFilingTarget) => void;
fileCandidates?: CachedItem[];

// After - mirrors onArmLink exactly:
/** Renders a "File" action when provided - arms the caller's Files pane, same shape as onArmLink. Only Inbox-sourced rows (Inbox tab, Review's Inbox-to-zero step) ever pass it. */
onArmFile?: () => void;
```

- Remove `const [filingOpen, setFilingOpen] = useState(false)`, the `FileToPicker` import, and the `<FileToPicker .../>` block entirely.
- The "File" `Pressable` changes from `onPress={() => setFilingOpen(v => !v)}` to `onPress={onArmFile}`, gated on `onArmFile` instead of `onFile`.
- `fileCandidates` prop removed (its only purpose was feeding the inline `FileToPicker`).

Confirmed via grep: `InboxScreen.tsx` and `ReviewScreen.tsx`'s Inbox-to-zero step are the *only* two current callers passing `onFile`/`fileCandidates` to either row - this rename is fully contained to those two call sites (both being reworked in this same change anyway, §3.5/§5).

Net visual effect: the "File" text next to a row now behaves exactly like the "+📎" clip already does - tap it, the Files pane (now showing Projects/Areas) arms, tap a folder there, done. No more inline list under the row.

## 5. Weekly Review's Inbox-to-zero step

### 5.1 Layout: two-pane, mirroring Inbox tab exactly

`renderInboxZero()` (currently a single `View` stacking the "Clear every capture..." hint, Tasks section, Meetings section) restructures into the same left-Files/right-data split `screens/ItemDetail.tsx` and `screens/InboxScreen.tsx` already use:

```tsx
const renderInboxZero = () => (
  <View style={styles.body /* new: flexDirection: 'row', same shape as InboxScreen's styles.body */}>
    <View style={[styles.leftPane, {borderColor}]}>
      <Text style={[styles.paneTitle, {color: textColor}]}>Resources</Text>
      <FileBrowserPane roots={activeRoots} linkTarget={linkTarget} textColor={textColor} borderColor={borderColor} />
    </View>
    <View style={styles.rightPane}>
      {/* existing hint text, Tasks section, Meetings section - unchanged content, just now the right column */}
    </View>
  </View>
);
```

`fileBrowserRoots`/`activeRoots`/`linkTarget` are built exactly per §3.1/§3.3/§3.4, using Review's own `paths`/`basePath` (already loaded here, same shape as Inbox's).

### 5.2 New `armTarget`/`linkTarget` state - built from scratch here

This is the one genuinely new piece of state machinery in this change: Review's Inbox-to-zero step currently has **no** link/arm concept at all (`editingInboxTaskIndex`/`editingInboxMeetingIndex` are separate plain `useState<number | null>`, and rows here never got `onArmLink`/`isArming` - `design-overview.md` §2.18 documents this as a deliberate prior omission, "neither screen has a Files pane"). It now needs the same shape Inbox tab has:

```ts
type InboxZeroArmTarget = {type: 'task' | 'meeting'; index: number; intent: 'link' | 'file'};
const [inboxZeroArmTarget, setInboxZeroArmTarget] = useState<InboxZeroArmTarget | null>(null);
```

with `armFileTarget`/`armLinkTarget`/`cancelArming` helpers identical in shape to Inbox tab's (§3.2), each clearing `editingInboxTaskIndex`/`editingInboxMeetingIndex` the same way Inbox's `armLinkTarget`/`startEditTarget` clear each other. `handlePickLinkedFile` (new here) and `handlePickFile` (new here, calling the existing `handleFileTask`/`handleFileMeeting`) mirror Inbox's exactly, using `resolveFilingPick` (§10) for the file branch.

Locating an existing link (for `onStartEdit` → showing where a linked file lives) reuses `locateLinkedFile(paths, paths.resources, ...)` the same way Inbox does - Review's Inbox-to-zero items are still un-filed Inbox items, so `paths.resources` doubling as "the item root" is correct here for exactly the same reason it's correct on Inbox tab (§module doc comment, `InboxScreen.tsx`).

### 5.3 Row wiring - Link enabled for the first time

`TaskRow`/`MeetingRow` in `renderInboxZero()`'s task/meeting lists gain `onArmLink`/`isArming` (new) alongside the renamed `onArmFile` (was `onFile`/`fileCandidates`) - this is the concrete effect of the "Yes, add Link too" decision (§13). `linkedFile`/`onOpenLinkedFile` were presumably already threaded (rows already show the clip icon read-only or not at all depending on whether `onArmLink` exists elsewhere in the codebase's convention - confirm during implementation whether Review's Inbox-to-zero rows currently pass `onOpenLinkedFile`; if not, add it, mirroring Inbox tab's row wiring exactly).

### 5.4 `FileToPicker` retirement

This is the second and last caller - once §3 and §5 both land, `ui/FileToPicker.tsx` has zero remaining callers anywhere in the app (confirmed: Inbox tab and Review's Inbox-to-zero step were always the only two, per `InboxScreen.tsx`'s own module doc comment). Flagged in §11 as a deletion candidate rather than deleted here automatically - same "flag rather than silently decide" posture as everything else in this doc.

## 6. Daily view's and Weekly Review step 1's quick-adds → always Inbox

Three call sites currently pass no `fixedDestination` (i.e. show `ui/DestinationPicker.tsx`'s unrestricted Inbox/Project/Area list) and all three switch to `fixedDestination={{type: 'inbox'}}`:

| File | Line (current) | Quick-add |
|---|---|---|
| `screens/DailyView.tsx` | ~840 | `MeetingQuickAdd` (Calendar section) |
| `screens/DailyView.tsx` | ~938 | `TaskQuickAdd` (Open tasks section) |
| `screens/ReviewScreen.tsx` | ~927 | `TaskQuickAdd` (`renderWeekAhead`, "Week ahead" step 1) |

Each gets a local `const FIXED_INBOX_DESTINATION: Destination = {type: 'inbox'};` module constant (same pattern `InboxScreen.tsx:152` already established - a stable object identity, one per file, not centralized - matches this codebase's per-screen-styling convention of not sharing what doesn't need to be shared) and `fixedDestination={FIXED_INBOX_DESTINATION}` added to the JSX. The `items={items}` prop on each becomes dead (ignored once `fixedDestination` is set, per `TaskQuickAdd`/`MeetingQuickAdd`'s own doc comments) - harmless to leave, but fine to drop during implementation for clarity.

Note `screens/ReviewScreen.tsx`'s Week ahead `MeetingQuickAdd` doesn't exist - that step's Calendar section is read-only (a listing of the coming week's meetings) plus `GoogleCalendarPanel` (which already always defaults imported events to Inbox via its own `defaultDestination` prop, unaffected by this change) - so there is no Meeting quick-add to convert there.

This is the concrete mechanism behind Tilman's "remove filing option [from Daily], put everything to Inbox" request, and the "Always Inbox (Recommended)" answer to the AskUserQuestion about Review step 1 (§13) - both are the same `fixedDestination` mechanism `InboxScreen.tsx` and `ProjectDataPanel.tsx` already use everywhere else.

## 7. `ui/DestinationPicker.tsx` becomes fully dead code

Once §6 lands, grep confirms zero remaining callers pass `items` without `fixedDestination` to either `TaskQuickAdd` or `MeetingQuickAdd` anywhere in the app (`ProjectDataPanel.tsx`'s two quick-adds, `InboxScreen.tsx`'s two, `ReviewScreen.tsx`'s Inbox-to-zero pair and its per-item stalled/neglected card, all already `fixedDestination`-only). `ui/DestinationPicker.tsx` itself, and the `items`/`destinationOpen`-driven branch inside `TaskQuickAdd.tsx`/`MeetingQuickAdd.tsx` that renders it, become unreachable.

Unlike `ui/FileToPicker.tsx` (§5.4, retired because its two callers are being actively rewritten), nothing here forces a code change to `DestinationPicker.tsx`/`TaskQuickAdd.tsx`/`MeetingQuickAdd.tsx` themselves - the unrestricted-picker code paths just stop being exercised. Flagged for a decision during review (§11): delete now (same moment as `FileToPicker`, since both are dead for the same reason), or leave in place a while longer as prior art for `folderIndex.ts`-style deferred dead code. Recommendation: delete alongside `FileToPicker.tsx` in the same pass - unlike `folderIndex.ts` (kept because it might be needed again soon), `DestinationPicker.tsx`'s reason for existing (unrestricted destination choice at capture time) is exactly the capability Tilman is asking to remove app-wide, so it's unlikely to come back.

`domain/destination.ts` itself (`Destination` type, `destinationLabel`, `sameDestination`, `destinationCandidates`, `isFocused`) is **not** dead - `destinationCandidates`/`isFocused` are still used by `GoogleCalendarPanel.tsx`, `storage/dailyAggregate.ts`, and `screens/ItemsList.tsx` for unrelated reasons (focused-first sorting, not destination-picking), and `Destination`/`destinationLabel`/`sameDestination` remain the shared vocabulary every `fixedDestination` caller still uses.

## 8. Lasso capture: remove the destination picker, always auto-resolve

### 8.1 What goes away

In `CaptureScreen.tsx`: the `destination`/`destinationOpen` state (lines 114-115), the entire "Destination" UI section (the expandable/paginated list built from `destinationCandidates` over `projects`/`areas` plus an "Inbox" row, ~lines 449-507), the `DestinationRow` component (~547-568), and the `destinationCandidates`/flat-rows/pagination computation feeding that section.

### 8.2 What stays, simplified

`load()` already computes exactly the right value on mount:

```ts
const enclosing = currentNotePath ? findEnclosingItem(paths, currentNotePath) : null;
const defaultDestination: Destination = enclosing
  ? {type: 'item', kind: enclosing.kind, name: enclosing.name, path: enclosing.path}
  : {type: 'inbox'};
```

Today this seeds the overridable `destination` state (`setDestination(defaultDestination)`); it now **is** the destination, full stop - no separate `destination` state at all. `performSave()`/`handleSaveAndView()` (which branch on `destination.type` to call `saveTasks`/`saveMeetings` directly vs. `ensureItemCached` + `saveTasks`/`saveMeetings` + `updateItemTasks`/`updateItemMeetings`, and to decide which screen "Save & View" jumps to) are otherwise **unchanged** - every reference to `destination` in that logic becomes a reference to `loaded.defaultDestination` (or a locally destructured `const {defaultDestination} = loaded;`). `destinationLabel(defaultDestination)` still renders next to whatever this now-static-not-a-button row is (the "Destination: <name>" line stays, minus its "tap to change" affordance).

The "link to source note" checkbox and Todo/Meeting kind picker are both unaffected - this change touches only the destination row.

## 9. Lasso reset bugfix

Root cause, fully diagnosed (not yet coded): `App.tsx`'s `Mode` (`'loading' | 'capture' | 'tabs'`) stays `'capture'` across both "Cancel" and "Save & Close" - neither calls `setMode` at all, only `PluginManager.closePluginView()` (a native call with no React state change; the JS instance and its component tree stay mounted, hidden). Only "Save & View" ever leaves `'capture'` (via `openItem`/`openDaily`, both calling `setMode('tabs')`).

`captureNonceRef` (a `useRef(0)`, line 154) is bumped on every Lasso-button press specifically so `<CaptureScreen key={captureNonceRef.current} .../>` forces a fresh mount each time - the existing, already-correct comment on this ref explains exactly why a remount is needed (a re-render-in-place would leave `CaptureScreen`'s own `useEffect(load, [load])` from firing again, since `load`'s identity is stable). The bug: on a **second** Lasso press after Cancel/Save & Close, the button handler runs `captureNonceRef.current += 1` (a ref mutation - doesn't itself trigger any re-render) and then `setMode('capture')` - but `mode` is *already* `'capture'`, so React's `Object.is` bailout on identical primitive state means this `setState` call is a no-op: no re-render happens at all, the `key={captureNonceRef.current}` JSX line never re-evaluates, and the stale `CaptureScreen` instance (old recognized text, old `kind`, old destination) stays mounted exactly as-is. This matches Tilman's reported symptom precisely: works the first time (`mode` genuinely transitions from `'loading'`/`'tabs'` to `'capture'`), then always shows the previous capture's text from then on (every subsequent press is a same-value `setState` no-op).

**Fix**: convert `captureNonceRef` to real state, and use a functional updater (guarantees a genuinely new value regardless of what `mode` is doing, so the re-render never depends on `mode`'s own bailout behavior):

```ts
// Before:
const captureNonceRef = useRef(0);
// ...
captureNonceRef.current += 1;
setMode('capture');
// ...
return <CaptureScreen key={captureNonceRef.current} .../>;

// After:
const [captureNonce, setCaptureNonce] = useState(0);
// ...
setCaptureNonce(n => n + 1);
setMode('capture');
// ...
return <CaptureScreen key={captureNonce} .../>;
```

Both `setCaptureNonce` and `setMode` fire on every press now (previously only the ref mutation was guaranteed to "fire"); `setCaptureNonce` alone is sufficient to force the remount even on the no-op-`setMode` path, since it's always a genuinely different value. The existing large comment block above the ref (lines 136-153) stays, updated to describe `useState` instead of `useRef` and to add this second failure mode (same-value `setMode` bailout) alongside the first one it already documents (stale closure over `load`).

## 10. Shared extraction: `resolveFilingPick`

Per this codebase's own "extract once a second caller needs the same shape" bar (the same bar `ui/TaskRow.tsx`/`ui/FileBrowserPane.tsx` were built to): once Review's Inbox-to-zero step (§5) needs the exact same "`(root, relativePath) → InboxFilingTarget`" mapping Inbox tab needs (§3.4), that mapping gets pulled out rather than duplicated a second time. It belongs in `storage/inboxFiling.ts` (already home to `fileInboxTask`/`fileInboxMeeting`, the filing mutation this feeds):

```ts
/**
 * Turns a FileBrowserPane pick (root key + relativePath, from an
 * arming LinkTarget with pickKind:'folder' over the projects/areas roots -
 * technical-design-filing-unification.md §2/§3.4) into an InboxFilingTarget.
 * Pick only ever fires at depth 0 (pickKind:'folder'), so relativePath is
 * always a bare folder name - shared by screens/InboxScreen.tsx and
 * screens/ReviewScreen.tsx's Inbox-to-zero step, the only two filing
 * surfaces in the app.
 */
export function resolveFilingPick(paths: ResolvedParaPaths, root: string, relativePath: string): InboxFilingTarget | null {
  if (root === 'projects') return {kind: 'project', name: relativePath, path: `${paths.projects}/${relativePath}`};
  if (root === 'areas') return {kind: 'area', name: relativePath, path: `${paths.areas}/${relativePath}`};
  return null; // shouldn't happen - Resources isn't offered as a root while file-arming (§3.3)
}
```

The `fileBrowserRoots`/`activeRoots` construction (§3.1/§3.3) is small enough (three object literals + a filter) that it's left as a few lines duplicated per screen rather than extracted into a shared builder function - each screen already builds its own `roots` array today (Inbox's single-root array, `ItemDetail.tsx`'s four-root array) and there's no behavior to keep from drifting the way `resolveFilingPick`'s mapping logic has to.

## 11. Implementation order

1. `ui/TaskRow.tsx`/`ui/MeetingRow.tsx`: `onFile`/`fileCandidates` → `onArmFile` (§4) - small, mechanical, no behavior change yet since nothing calls the new prop until steps 2-3.
2. `storage/inboxFiling.ts`: add `resolveFilingPick` (§10) - pure, verifiable standalone.
3. `screens/InboxScreen.tsx`: new roots + `ArmTarget`/intent + `activeRoots` + `handlePickFile` + row wiring (§3) - Inbox tab fully working with the new File flow.
4. `screens/ReviewScreen.tsx`: `renderInboxZero()`'s two-pane restructure + new arm state + row wiring (§5) - Review's Inbox-to-zero step matches Inbox tab.
5. `screens/DailyView.tsx` (×2) + `screens/ReviewScreen.tsx`'s `renderWeekAhead` (×1): `fixedDestination: inbox` (§6).
6. Delete `ui/FileToPicker.tsx` and `ui/DestinationPicker.tsx` (§5.4/§7), and the now-dead branches inside `TaskQuickAdd.tsx`/`MeetingQuickAdd.tsx` that rendered `DestinationPicker` (the `items`/`destinationOpen` state and the conditional render - `fixedDestination` becomes effectively required in practice, though the prop can stay optional in the type for now unless review decides to simplify it further).
7. `screens/CaptureScreen.tsx`: remove the destination picker (§8).
8. `App.tsx`: `captureNonceRef` → `useState` (§9).
9. `docs/dev/design-overview.md` update (new section, plus updating §2.18's "this tab and Weekly Review's Inbox-to-zero step are the only two filing surfaces" note now that both use the same mechanism, and removing the §2.18 note about Review's Inbox-to-zero step lacking a Files pane) - same as every prior feature.

Steps 1-6 (Inbox/Review/Daily filing unification) and steps 7-8 (Lasso) are independent of each other and could be done in either order or by two separate passes - grouped in one doc because Tilman asked for both together, not because they share code.

## 12. Verification

Same standing pattern as every feature in this project: a scoped `tsc --noEmit --strict` pass over every touched file. Specific things worth checking by hand (no on-device build access this session, same standing caveat as always):

- Inbox tab: File a task into a Project, into an Area; confirm the target file gains the line and Inbox loses it (existing `fileInboxTask`/`fileInboxMeeting` behavior, unchanged - just confirm the new arm-based trigger reaches it correctly). Confirm the Resources tab is genuinely absent while file-arming (not just visually low-priority) and reappears once cancelled.
- Review's Inbox-to-zero step: same File check, plus confirm Link now works there for the first time (arm, pick a Resources file, confirm `linkedFile` is set and the clip renders).
- Daily view: add a task/meeting from the Open tasks/Calendar quick-adds, confirm it always lands in Inbox with no picker shown at all.
- Weekly Review step 1: same check for its Task quick-add.
- Lasso: capture once, Save & Close, capture again (same note, no navigating away) - confirm the second capture's text field shows the *new* selection's recognition, not the first's. Repeat with Cancel instead of Save & Close. Then confirm the destination row shows the enclosing Project/Area when lassoing from a note inside one, and Inbox when lassoing from a note outside any Project/Area (or with no current note) - and that there is no way to change it.

## 13. Flagged assumptions / decisions (confirm or correct when reviewing)

- **Decided via AskUserQuestion**: Weekly Review step 1's quick-add switches to always-Inbox, matching Daily (§6) - answered "Always Inbox (Recommended)".
- **Decided via AskUserQuestion**: Weekly Review's Inbox-to-zero rows gain Link in addition to File, now that a Files panel exists there too (§5.3) - answered "Yes, add Link too (Recommended)".
- **New simplification, flagged not asked**: the Projects/Areas roots' `entryFilter` (Active-only) applies uniformly to both filing and linking through those tabs, narrowing linking's reach slightly (linking through Projects/Areas - newly possible at all, see next point - is now Active-only too). Accepted as a minor, deliberate trade-off rather than building per-action-conditional filtering into `FileBrowserPane.tsx` (§3.1).
- **New side effect, flagged not asked**: because Projects/Areas tabs now exist on Inbox's/Review's Files pane at all times (not just while file-arming), *linking* a Task/Meeting to a file living inside a Project or Area folder becomes possible for the first time on these two screens (previously link targets were Resources-only, since Inbox items weren't filed anywhere yet). This falls out of the shared multi-root pane for free rather than being separately built - flagged in case it's not wanted; easy to suppress by keeping `linkTarget`'s roots at just `['resources']` regardless of `armTarget.intent` if so.
- **New deletion recommendation, flagged not asked**: `ui/DestinationPicker.tsx` and `ui/FileToPicker.tsx` both become fully unreferenced by this change (§5.4/§7) - recommended to delete both in the same pass rather than leaving them as deferred dead code, since (unlike `folderIndex.ts`) neither has an anticipated future caller.
- Lasso's destination is never overridable, full stop, per Tilman's explicit "no other choice possible" (§8) - including the case where the enclosing Project/Area is On Hold/Done/Archived (i.e., `findEnclosingItem` doesn't check status, so a lassoed note inside a since-archived Project would still file there). This mirrors `findEnclosingItem`'s existing use in `App.tsx`'s own `reorient()` (also status-blind), so it's consistent with how "which item is this note in" already works elsewhere - not a new gap introduced here.
