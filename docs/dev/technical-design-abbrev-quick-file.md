# Technical design: abbreviation quick-file + space-after-# auto-strip

Status: implemented 2026-09-17 (all of §5.1-§5.5 wired); two on-device bugs found in smoke-testing and fixed 2026-09-18 (see §9). See `docs/dev/design-overview.md` §2.26 for the shipped write-up and verification notes. Requirements chat: 2026-09-17 (memory: `feature_abbrev_quick_file`). UI sketch: Claude Design canvas "Abbrev Quick-File — UI States" (4 artboards showing Row 4 in each state).

**One divergence from this design as written below**: `onQuickFile`'s doc comment in §4 undersold self-exclusion's own subtlety for Daily specifically — `fixedDestination` is always `{type: 'inbox'}` there regardless of which Project/Area the entry being edited actually lives in, so deriving the exclude path from it (as every other screen correctly does) would have let a self-matching tag show a same-place no-op button on Daily. Fixed by adding a new `editingItemPath?: string | null` prop that Daily passes explicitly (the entry's real current path) and every other screen omits (falling back to the `fixedDestination`-derived value, unchanged). See `design-overview.md` §2.26 for the full note.

**Two more divergences, found in on-device smoke-testing (2026-09-18)**: §4.3's `handleQuickFile`/`onQuickFile` snippets below never actually stripped the matched tag from the saved text (a plain implementation gap against §1/the original requirements chat), and edit-mode's `onQuickFile?: (target) => Promise<void>` signature turned out to be the wrong contract — every screen's handler re-read its own last-saved copy of the task/meeting instead of the text/fields still being edited, so any in-progress edit (including the tag) was silently discarded. Both fixed together; see §9 for the corrected contract and per-screen shape. Read §9 alongside §4.3/§5 rather than trusting those sections' code samples verbatim for `onQuickFile`'s current shape.

## 1. What this builds

Two independent changes to `ui/QuickAddWidget.tsx`, both app-wide:

1. **Abbreviation quick-file.** When the current draft/edit text contains a `#tag` matching a registered Project/Area abbreviation (`domain/abbrev.ts`, technical-design-project-area-abbreviations.md), a "File: `<Name>`" affordance takes over where Refile normally sits, and performs the file/move directly with no Browse picker. For a brand-new item it instead relabels "+ Add" itself and creates the item directly at that destination.
2. **Space-after-# auto-strip.** Any whitespace immediately following a `#` in any QuickAddWidget text field is stripped live, since Supernote's handwriting recognition often inserts one there and `TAG_RE` (`domain/markdown.ts`) requires no space after `#` to parse as a tag at all — today a `"# "` sequence doesn't just look wrong, it silently fails to become a tag.

Both changes touch only `ui/QuickAddWidget.tsx` plus one new pure domain function; item (1) additionally needs small, mechanical changes to a handful of screens' `onAddTask`/`onAddMeeting` handlers (§4) and, for one screen (Daily), genuinely new move-between-files plumbing (§5).

## 2. New pure logic: `domain/abbrev.ts`

```ts
import {extractContextTags} from './markdown';
import {ItemStatus} from './types';

export interface AbbrevFileMatch {
  kind: 'project' | 'area';
  name: string;
  path: string;
}

/**
 * The first #tag in `text` (in appearance order) that names a registered,
 * Active or On Hold Project/Area's abbreviation - the target for the
 * "File: <Name>" quick-file affordance (feature_abbrev_quick_file, chat
 * 2026-09-17). Reuses extractContextTags for tag scanning (already
 * lowercased, deduped, reserved flow-state/due/#now words excluded - an
 * abbreviation can never collide with those per validateAbbrev, so nothing
 * here needs to re-derive that exclusion).
 *
 * `excludePath` is the item's own current location (fixedDestination.path
 * when it's an 'item' destination, null for Inbox) - a tag that resolves to
 * wherever the item already is/would be created is a no-op, so this returns
 * null rather than a self-target. This check happens on the FIRST matching
 * tag only: if that tag is a self-match, quick-file is unavailable even if a
 * later tag in the text would resolve elsewhere - "the first recognized tag
 * decides, full stop" (chat's "first one wins" answer didn't explicitly
 * cover this interaction; this is the reading that keeps the rule simple -
 * flag to Tilman if a cascade to the next tag is actually wanted instead).
 *
 * Deliberately broader than storage/dailyAggregate.ts's own destination
 * rules elsewhere in the app: domain/destination.ts's destinationCandidates
 * (the picker Daily/Capture use for a brand-new item with no tag typed) is
 * Active-only - On Hold is excluded there specifically to avoid overloading
 * a browsed list. That reasoning doesn't apply here (this is a typed-tag
 * match, never a list), so On Hold items ARE valid quick-file targets - an
 * explicit, confirmed divergence, not an oversight. Done/Archived never
 * match either way.
 */
export function resolveAbbrevFileTarget<
  T extends {abbrev: string | null; path: string; name: string; kind: 'project' | 'area'; status: ItemStatus},
>(text: string, items: T[], excludePath: string | null): AbbrevFileMatch | null {
  for (const tag of extractContextTags(text)) {
    const match = items.find(
      item =>
        item.abbrev !== null &&
        item.abbrev.toLowerCase() === tag &&
        (item.status === 'active' || item.status === 'on-hold'),
    );
    if (match) return match.path === excludePath ? null : {kind: match.kind, name: match.name, path: match.path};
  }
  return null;
}
```

`extractContextTags` already lowercases every matched tag, so no separate normalization is needed on the `tag` side; `item.abbrev` is compared via `.toLowerCase()` since it's stored in whatever casing the user gave it (e.g. `"AoT"`).

This lives in `domain/abbrev.ts` (not `domain/markdown.ts`) because it's abbreviation-specific policy (status filtering, self-exclusion) layered on top of markdown.ts's plain tag extraction — same split `resolveAbbrevPath` already establishes in this file. It's a one-directional new dependency, `abbrev.ts` → `markdown.ts`; `markdown.ts` has no reference back to `abbrev.ts`, so no cycle.

## 3. New pure logic: space-after-# strip

```ts
// domain/markdown.ts, alongside TAG_RE
export function stripSpaceAfterHash(text: string): string {
  return text.replace(/#\s+/g, '#');
}
```

Collapses ANY run of whitespace right after every `#` in the string (not just a single space, not just the first occurrence) — simplest rule that matches "any space after a # should be automatically removed," and cheap enough to run on every keystroke.

Wired into `ui/QuickAddWidget.tsx` at the one funnel point each field already has:

```ts
const setTaskText = (t: string) => {
  const stripped = stripSpaceAfterHash(t);
  if (editFields?.kind === 'task') updateTaskEditField({text: stripped});
  else setTaskDraft(d => ({...d, text: stripped}));
  clearTaskJustAdded();
};
```

Same one-line change to `setMeetingTitle`, `setNoteTitleRaw`, and `setTaskWaitingOn` (Tilman's "every text field" answer) — all four already exist as the single `onChangeText` handler for their field, so this is a pure insertion, no new wiring. Because it happens inside the shared setter rather than a keypress event, it applies uniformly whether the text arrived by typing, by Supernote's handwriting recognition, or by the widget's own Paste button (`ui/ClipboardTextInput.tsx`'s `handlePaste` already routes through `onChangeText`).

**Cursor behavior**, noted for smoke-testing rather than solved here: these fields are controlled `TextInput`s with their own selection-tracking refs (the same custom Select-All/Copy/Cut/Paste overlay mechanism `domain/clipboardText.ts`/`ui/ClipboardTextInput.tsx` documents). Shortening the string by one character inside `onChangeText` should let the native Android EditText keep its own already-committed cursor position (the JS-side value update just confirms text that's one space shorter than what the native view already showed), but this is exactly the kind of behavior that's cheap to state and easy to get subtly wrong — verify on-device that typing `"#ATR "` continues naturally without a visible cursor jump before relying on it.

## 4. `QuickAddWidget.tsx` changes

### 4.1 Computing the match

```ts
const cachedItems = getCachedData()?.items ?? [];
const excludePath = fixedDestination.type === 'item' ? fixedDestination.path : null;
const taskAbbrevTarget = resolveAbbrevFileTarget(taskFields.text, cachedItems, excludePath);
const meetingAbbrevTarget = resolveAbbrevFileTarget(meetingFields.title, cachedItems, excludePath);
const abbrevTarget = displayType === 'task' ? taskAbbrevTarget : displayType === 'meeting' ? meetingAbbrevTarget : null;
```

`getCachedData` (`storage/dataCache.ts`) is a plain synchronous read of the already-loaded cache — `QuickAddWidget.tsx` already imports directly from `storage/` (`getRecentTags`/`recordTagsUsed` from `storage/tagUsage.ts`), so this isn't a new kind of dependency for this file. Recomputed on every render, same as `TagChips` already re-deriving `extractContextTags(text)` every render — cheap (one array scan over however many Projects/Areas exist), no memoization needed.

`excludePath` falls out of `fixedDestination` for free: on every screen that can edit an already-filed item (`ProjectDataPanel`/`ItemDetail`'s Current tab), that item always belongs to `fixedDestination` itself, since those screens only ever edit their own item's tasks/meetings. On Inbox/Review's Inbox-to-zero step, `fixedDestination` is always `{type: 'inbox'}`, which has no `path` — correctly never self-excludes, since Inbox itself can never carry an abbreviation. No new prop needed for this.

The Note mini-tab is excluded entirely (`displayType === 'note'` → `abbrevTarget` stays `null`) — a standalone Note has no "filing" concept; it's placed wherever the Files pane happens to be browsing at Add-time (`feature_standalone_note_quickadd`), an unrelated mechanism.

### 4.2 Create mode: relabeled "+ Add"

```ts
const addLabel = abbrevTarget ? `+ Add to ${abbrevTarget.name}` : '+ Add';

const effectiveTaskDestination: Destination = taskAbbrevTarget
  ? {type: 'item', kind: taskAbbrevTarget.kind, name: taskAbbrevTarget.name, path: taskAbbrevTarget.path}
  : fixedDestination;
```

`submitTaskCreate`/`submitMeetingCreate` pass `effectiveTaskDestination`/the meeting equivalent to `onAddTask`/`onAddMeeting` instead of unconditionally passing `fixedDestination` — everything else about those functions (building the `Task`/`Meeting` object, clearing the draft, setting `taskJustAdded`) is unchanged. Row 4's single primary button (there is no second button — matches the "relabel it" decision) reads `addLabel` instead of the literal `"+ Add"` string; no new layout, since create mode's `actionsLeft` stays empty either way.

### 4.3 Edit mode: "File: `<Name>`" replaces Refile

```ts
const handleQuickFile = () => {
  if (!abbrevTarget) return;
  Keyboard.dismiss();
  setPending(true);
  onQuickFile?.(abbrevTarget)
    .catch(e => setError(e instanceof Error ? e.message : String(e)))
    .finally(() => setPending(false));
};
```

```tsx
{onRefile && !abbrevTarget && (
  <Pressable style={[styles.ghostButton, {borderColor}]} onPress={handleRefile} disabled={pending} hitSlop={8}>
    <Text style={[styles.ghostButtonText, {color: textColor}]}>Refile</Text>
  </Pressable>
)}
{onQuickFile && abbrevTarget && (
  <Pressable style={[styles.ghostButton, {borderColor}]} onPress={handleQuickFile} disabled={pending} hitSlop={8}>
    <Text style={[styles.ghostButtonText, {color: textColor}]}>File: {abbrevTarget.name}</Text>
  </Pressable>
)}
```

New prop:

```ts
/**
 * Performs the abbreviation quick-file move/create directly (no Browse
 * picker) once a recognized #tag resolves to `target` - feature_abbrev_
 * quick_file, 2026-09-17. Renders "File: <Name>" in Refile's own Row 4 slot
 * WHENEVER a match is present, independent of onRefile - so it also works on
 * screens with no Files pane to arm (Daily), which never pass onRefile at
 * all. Absent entirely (no fallback button, no error) on a screen whose edit
 * mode doesn't support moving an item to a different file yet.
 */
onQuickFile?: (target: AbbrevFileMatch) => Promise<void>;
```

Note this is intentionally **not gated on `onRefile`** — the whole point of this affordance is that it needs no Files pane, so a screen can support quick-file in edit mode without supporting manual Refile at all. Today that distinction is moot (every screen that can edit an existing item already has Refile wired - §5.4 covers the one screen, Daily, where `onQuickFile` needs new plumbing behind it rather than being a straight alias for an existing handler), but the prop is independent on principle rather than accidentally coupled to `onRefile`.

## 5. Screen-by-screen wiring

### 5.1 Inbox tab (`screens/InboxScreen.tsx`) and Review's Inbox-to-zero step

**Edit mode / `onQuickFile`.** Both already have a working Refile flow (`onRefile` arms the Browse picker; the resulting pick calls into `storage/inboxFiling.ts`'s `fileInboxTask`/`fileInboxMeeting`, which call `appendTaskToTarget`/`appendMeetingToTarget` then remove from Inbox). `onQuickFile` is wired to call that exact same commit path directly with the resolved `{kind, name, path}` — the underlying function doesn't care whether its target came from a Browse pick or a tag match, so this is a pass-through, not new logic.

**Create mode.** `InboxScreen.tsx:474`'s `handleAddTask`/`:573`'s `handleAddMeeting` currently both ignore the `destination` parameter outright (`_destination: Destination` — ignored on purpose, since this screen only ever adds to Inbox today) and always call `saveInboxTasks`/its meeting equivalent. This needs an actual branch, mirroring the shape `DailyView.tsx` already has (§5.2):

```ts
const handleAddTask = async (text: string, destination: Destination): Promise<void> => {
  const newTask: Task = {text, done: false, cancelled: false, ...deriveTaskFields(text), notePath: '', linkedFile: ''};
  if (destination.type === 'inbox') {
    await saveInboxTasks(tasks => [...tasks, newTask]);
  } else {
    await appendTaskToTarget(destination, newTask);
  }
  log('InboxScreen: added task');
};
```

(`appendTaskToTarget` already accepts exactly `{kind, name, path}` as its `InboxFilingTarget` parameter — a `Destination` of `type: 'item'` structurally satisfies that shape today; pass it straight through or narrow it explicitly, whichever reads better against the rest of the file's style.) Same shape for `handleAddMeeting`/`appendMeetingToTarget`.

### 5.2 Daily view (`screens/DailyView.tsx`) and focus mode

**Create mode: no change needed beyond the widget itself.** `DailyView.tsx:1018`'s `handleAddTask` and `:1043`'s `handleAddMeeting` **already** branch on `destination.type` and call `ensureItemCached(destination.kind, destination.name, destination.path)` for the non-Inbox case — this is exactly the DailyView/CaptureScreen-shared `Destination` machinery `domain/destination.ts`'s own doc comment describes. Passing an `{type: 'item', ...}` destination that names a *different* Project/Area than "today's Inbox capture" already works today, unexercised only because `fixedDestination` is always `{type: 'inbox'}` and nothing before this feature ever passed a different one. **This is the one screen where the create-mode half of this feature is genuinely free.**

**Edit mode: new plumbing required.** Daily is one of the "bare" screens Refile always skipped (no Files pane, no `armTarget`/`handleRefilePick`), but Tilman's "yes, everywhere" answer means Daily should still get "File: `<Name>`" in edit mode, not just the create-mode relabel. Today, `commitTaskEdit`/`commitMeetingEdit` only ever write back to the SAME entry's own source file (Inbox, or whichever Project/Area the `DailyTaskEntry`/`DailyMeetingEntry` came from) — there's no existing "move to a different file" path here at all, unlike Inbox/Current tab/Review. `onQuickFile` for Daily needs a new handler that:

1. Appends the task/meeting to the resolved target (`appendTaskToTarget`/`appendMeetingToTarget` — reused as-is, they don't care which screen calls them).
2. Removes it from wherever `editingTaskEntry`/`editingMeetingEntry` actually lives — which could be Inbox (`saveTasks`/`saveMeetings` against `inbox`, same as Daily's own existing Inbox-sourced mutations) or a Project/Area (the same `ensureItemCached` + filter-by-index-then-`saveTasks` pattern `handleAddTask`'s own `else` branch already demonstrates for the *append* half, mirrored for *removal*).
3. Closes the edit (`cancelEditTarget`) and triggers Daily's usual `refreshFromCache`.

This is real new code (not a wiring pass-through like §5.1/5.3), on the order of what `storage/inboxFiling.ts`'s `fileInboxTask`/`appendTaskToTarget` pair already does, generalized to a source that can be either Inbox or an item rather than always Inbox. Worth scoping as its own implementation step, distinct from the otherwise-mechanical rest of this design — flag to Tilman before starting if this feels like more than "everywhere" was meant to buy.

**Focus mode** reuses `DailyView`'s own `handleAddTask`/`handleAddMeeting` (`focusMode` prop switches layout only, per the file's own doc comment) and never renders `editingTask`/`editingMeeting`, so it inherits the create-mode behavior for free and has no edit-mode surface to extend.

### 5.3 Current tab (`screens/ProjectDataPanel.tsx` / `screens/ItemDetail.tsx`)

**Edit mode / `onQuickFile`.** Already has `ArmTarget.intent: 'refile'` and `handleRefilePick` (target-first-then-remove-from-source, with the self-refile guard `feature_refile.md` documents). `onQuickFile` is wired to call `handleRefilePick` directly with the resolved target — same pass-through as §5.1, not new logic. (The self-refile guard there becomes redundant with `resolveAbbrevFileTarget`'s own `excludePath` check for this specific call path, but leaving it in place is harmless — it only ever fires for a Browse-picked target now that quick-file already filters self-matches upstream.)

**Create mode.** Not yet inspected line-by-line this pass (the file is 54KB; wasn't staged for this design), but by the same pattern as §5.1: whatever local `handleAddTask`/`handleAddMeeting` currently does when adding to the Project/Area's own Todos/Meetings list needs the same `if (destination.path === ownPath) { <existing local-state append> } else { await appendTaskToTarget(destination, newTask); }` branch. Confirm the exact current shape before implementing — flagged here rather than guessed, since this screen's add path might already route through a shared helper rather than inline state, in which case the branch may belong there instead.

### 5.4 Review screen (`screens/ReviewScreen.tsx`)

- **Inbox-to-zero step**: same as §5.1 (already has `armTarget`/`onRefile` wired against its own Inbox-shaped state, per `feature_refile.md`) — `onQuickFile` passes through to its existing refile-pick handler.
- **Week-ahead step, stalled-project/neglected-area cards**: task-only, add-only, no edit support at all (confirmed in `feature_unified_quickadd.md`) — so there is no edit-mode "File: `<Name>`" case to build here, only the create-mode relabel. These cards' `fixedDestination` already names the specific Project/Area the card is about; the same "branch on `destination.path === ownPath`" pattern as §5.1/§5.3 applies to whichever add handler they use today (not inspected this pass — same flag as §5.3).

### 5.5 Week view (`screens/WeekView.tsx`)

**Resolved (implementation pass): in scope, and needed zero changes.** `WeekView.tsx` renders exactly one `QuickAddWidget` instance, always `fixedDestination: {type: 'inbox'}`, with no `editingTask`/`editingMeeting`/`onRefile` at all — create-only, same shape as Review's Week-ahead card. Its own `handleAddTask`/`handleAddMeeting` already branched on arbitrary `destination` (identical to `DailyView.tsx`'s own, pre-dating this feature), so the create-mode relabel/direct-create behavior works automatically once `QuickAddWidget` itself supports it — nothing to wire here.

## 6. What does NOT change

- `domain/abbrev.ts`'s existing `resolveAbbrevPath` (the Daily context-tag filter's project-aware resolution) — untouched, this feature adds a sibling function rather than modifying it.
- The abbreviation feature's original "soft reference only, purely metadata" decision — still true for every tag that isn't acted on via this button. Typing `#ATR` and pressing ordinary Save/Add without tapping "File: Atruvia" leaves the tag exactly as it is today, an inert soft-reference tag.
- `domain/destination.ts`'s `destinationCandidates`/its own Active-only filtering — untouched; that's a separate picker used by Daily/Capture for a brand-new item with no tag typed, and stays Active-only by its own existing rule (§2's divergence note above).
- Refile's own manual Browse-picker flow, self-refile guard, and Active-only destination list — untouched; it continues to exist and work exactly as today whenever no recognized tag is present.

## 7. Verification plan (per this project's usual pattern)

- Standalone-Node unit tests for `resolveAbbrevFileTarget`/`stripSpaceAfterHash` (pure, zero RN imports) — same convention `domain/abbrev.ts`'s existing functions were tested with before anything was built on top.
- Scratch `tsc --noEmit` pass across every touched file (the project has no live `node_modules`/project-wide config in a cloud session; the established stub-typed scratch-project pattern applies).
- On-device smoke test checklist: typing `#ATR` live toggles the button on/off correctly in both Create and Edit, for both Todo and Meeting; a self-matching tag correctly hides the button in both modes; Active vs. On Hold vs. Done vs. Archived abbreviations behave as designed; two different recognized tags resolve to the first one; the space-after-# strip doesn't visibly glitch the cursor while typing at various positions in a longer string, and specifically survives a Supernote handwriting-recognized insert (not just a manual keyboard test); Daily's new quick-file-from-edit path correctly removes the item from wherever it actually was (Inbox vs. a Project/Area) rather than assuming one or the other.

## 8. Open items carried over from the requirements chat (not yet asked, noted for awareness)

- ~~Whether `ui/TagChips.tsx` should visually distinguish an abbreviation-matching tag from an ordinary context tag~~ — pre-existing open question from `feature_project_area_abbreviations.md`; **decided and built 2026-09-18, see §10.**
- Whether the "✓ Added" status message should name the destination when quick-filed (e.g. `✓ Added "Call Sarah..." to Atruvia`) — a small nice-to-have, not required by any decided requirement; easy to add in §4.2 if wanted.

## 9. On-device bugfixes (2026-09-18)

Two bugs Tilman reported from testing the shipped feature on-device.

**(a) Row 4 truncation.** The "File: `<Name>`"/"+ Add to `<Name>`" buttons rendered far short of `truncateItemName`'s 14-char cap ("Fil..", "Add t"). `QuickAddWidget.tsx`'s Row 4 layout had `actionsLeft`/`actionsRight` (the containers holding these buttons) hard-capped to `flex: 1` — a fixed quarter of the row's width regardless of what they contained — while `centerText` claimed `flex: 2`, even though it's empty in the normal case where the File/Add button is showing. Fix: dropped `flex: 1` from `actionsLeft`/`actionsRight` (RN Views default to `flexShrink: 0`, so they now size to their content instead of being squeezed) and changed `centerText` to `flex: 1` plus `flexShrink: 1`, making it the one element that absorbs and shrinks into whatever space is left. No change to `truncateItemName` itself or the 14-char cap — this was purely a layout bug downstream of it.

**(b) Tag not stripped.** §1/the requirements chat decided the matched tag gets stripped from the saved text once quick-file uses it; no code path ever did this. Fixing it surfaced a second, deeper problem: §4.3's `onQuickFile?: (target: AbbrevFileMatch) => Promise<void>` signature meant every screen's edit-mode handler had to re-derive what to move from its own state, and every one of them re-read the last-*saved* task/meeting rather than the text/fields currently in the open edit session — so any live edit (a text change, a flow-state/due tag, a linked-file pick, and specifically the abbreviation tag itself) was silently discarded on quick-file, edit-mode Save's one behavioral difference from quick-file that nothing had actually verified until now.

Corrected design, superseding §4.3's snippets and the `onQuickFile` type shown there:

- `domain/abbrev.ts`'s `AbbrevFileMatch` gained a `tag: string` field (the exact matched tag text, as `extractContextTags` returns it) so callers can pass it to `domain/markdown.ts`'s pre-existing `removeTagFromText`.
- `submitTaskCreate`/`submitMeetingCreate` (create mode) now call `removeTagFromText(finalText, abbrevTarget.tag)` right before `onAddTask`/`onAddMeeting` — the fix for create mode is this simple, since create mode never had the stale-read problem (there's no "already saved" copy to go stale against).
- Edit mode's `onQuickFile` contract changed to:

  ```ts
  onQuickFile?: (target: AbbrevFileMatch, payload: QuickFilePayload) => Promise<void>;

  export type QuickFilePayload =
    | {kind: 'task'; text: string; linkedFile: string}
    | {kind: 'meeting'; fields: MeetingQuickAddFields; linkedFile: string};
  ```

  `handleQuickFile` builds `payload` exactly the way `submitTaskEdit`/`submitMeetingEdit` build their own `nextText`/`fields` (flow-state/due tags folded in via `setFlowStateTag`/`setDueTag`, meeting fields through `validateMeetingFields`), then additionally strips the matched tag via `removeTagFromText` — this is "Save, but file elsewhere," not a bare move of whatever was last persisted.
- Every screen's `handleQuickFileEdit` (Inbox, Review's Inbox-to-zero step, `ProjectDataPanel`'s Current tab, Daily) now builds the moved task/meeting by spreading the *currently stored* item first — so `done`/`cancelled`/`notePath`/`recurrence`/`occurrences` survive — then overlaying `payload`'s fields, the identical merge shape each screen's own `commitTaskEdit`/`commitMeetingEdit` (plain Save) already used. That merged object, not the stored one, is what gets passed to `appendTaskToTarget`/`appendMeetingToTarget`. Inbox and Review's Inbox-to-zero step no longer call `fileInboxTask`/`fileInboxMeeting` for this specific path (those re-read the stored index internally, which is exactly the staleness being fixed) — `appendTaskToTarget`/`appendMeetingToTarget` plus a manual source-removal (`saveInboxTasks`/`saveInboxMeetings` on Inbox, `saveTasks`/`saveMeetings` directly on Review) replace them here; both functions are still used as-is by the unrelated Browse-picker Refile flow.

Verified the same way as the original implementation pass (§7): scratch `tsc --noEmit` with the two updated files (`domain/abbrev.ts`, `ui/QuickAddWidget.tsx`) copied in directly, plus one isolated check file per screen importing the real `storage/`/`domain/` types to validate each rewritten `handleQuickFileEdit` without staging the full screen dependency graph, plus `esbuild` syntax checks on all six touched files. All six committed to device and re-staged for a byte/md5sum comparison — clean match on the first attempt this time.

## 10. Uppercase display for recognized tags (2026-09-18)

Resolves the open item from §8 (originally raised in `feature_project_area_abbreviations.md`). Tilman: "write recognized area or project tags with upper case letters so they are immediately visible as such in the tag list... still really case insensitive, but when actively shown by the app use upper case for project and area tags, lowercase for the undefined tags." Flow-state chips (`FlowStateChips`) are a separate component with their own custom labels and are untouched.

**Decided scope (chat, 2026-09-18):** "recognized" uses the same Active-or-On-Hold eligibility `resolveAbbrevFileTarget` already applies — a Done/Archived item's old abbreviation still renders as a plain lowercase tag. Applies to every chip `ui/TagChips.tsx` renders, pinned (already in the current text, shown highlighted) and suggested/recent alike — one consistent rule, not two.

**Implementation.** Purely a display transform — the tag string passed to `onInsertTag`/`onRemoveTag`, the value matched against `text` for pinning, and the underlying stored/typed text are all untouched; only the rendered label changes. `ui/QuickAddWidget.tsx` computes, once per render, right before Row 2/3 (hoisted above every `TagChips` call site, and above the existing abbrev quick-file section which now reuses the same `getCachedData()` read rather than calling it twice):

```ts
const cachedAbbrevItems = getCachedData()?.items ?? [];
const recognizedAbbrevTags = new Set(
  cachedAbbrevItems
    .filter(item => item.abbrev !== null && (item.status === 'active' || item.status === 'on-hold'))
    .map(item => item.abbrev!.toLowerCase()),
);
```

`TagChips` gained a new required prop, `recognizedTags: Set<string>` (lowercased abbreviations), and its chip label changed from `#{tag}` to `#{recognizedTags.has(tag) ? tag.toUpperCase() : tag}`. All four `TagChips` call sites (Task's two Row 3 branches, Meeting's Row 3, Note's Row 3) pass `recognizedAbbrevTags`. `TagChips.tsx` itself stays free of any `storage/`/`ItemStatus` dependency — the caller does the classification, the component just renders a `Set` membership check — keeping it the same kind of pure display primitive it was before.

Verified via scratch `tsc --noEmit` (both files copied in) plus `esbuild` syntax checks; committed to device and byte-verified, clean match on the first attempt.
