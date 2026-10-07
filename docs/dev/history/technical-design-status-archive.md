# Technical Design — Project/Area Status & Archive

*Companion to docs/dev/design-overview.md. Written before implementation, per the project's workflow (requirements → technical design → implementation). Once built, fold the "as-built" parts of this into design-overview.md §2/§4/§5 and retire this file, same as any other feature's technical draft.*

Requirements this implements: see project memory `feature_status_archive.md` (decided 2026-09-01/02) and `feature_focus_selection.md` for the Focus feature this sits alongside.

---

## 1. Status model

```ts
// domain/types.ts
export type ItemStatus = 'active' | 'on-hold' | 'done' | 'archived';
```

One type for both kinds. The UI restricts which values are *offered*:

- **Projects**: Active, On Hold, Done — plus Archived, reachable only through the dedicated Archive action (§5), never through the status picker itself.
- **Areas**: Active, On Hold — plus Archived, same as above. No Done (Areas don't complete).

The parser stays permissive about what it *reads* regardless of kind — if someone hand-edits `status: done` into an area.txt, it round-trips and displays with whatever fallback treatment the UI gives an unexpected value (§4), rather than the app rejecting or silently rewriting it. This matches every other parsing rule in `domain/markdown.ts` (never invent structure, never clobber what's there).

`archived` is a real value in the type and the parser recognizes it, but nothing in this design ever *writes* `archived` through the plain status-picker path — see §5.

Wire format (frontmatter value, not just the TS union): `active` / `on-hold` / `done` / `archived` — plain kebab-case words, chosen so a hand-edited file reads naturally in a text editor, same spirit as the existing `#due:2026-09-05` tag syntax being human-typeable.

## 2. Frontmatter parsing (`domain/markdown.ts`)

Extends `ParsedFrontMatter`/`parseFrontMatter`/`writeFrontMatterIntoContent` the same way `dailyFocus`/`weeklyFocus` were added — this is a second field on the same block, following an established pattern, not a new mechanism.

```ts
export interface ParsedFrontMatter {
  status: ItemStatus;      // NEW — defaults to 'active' if missing or unrecognized
  dailyFocus: boolean;
  weeklyFocus: boolean;
  extraLines: string[];
}

const STATUS_LINE_RE = /^status:\s*(.*)$/;
const KNOWN_STATUSES: ItemStatus[] = ['active', 'on-hold', 'done', 'archived'];
```

In `parseFrontMatter`: a `status:` line is recognized and pulled out of `extraLines` (same as the two focus lines); its value is trimmed and checked against `KNOWN_STATUSES` — an unrecognized value (typo, future value, hand-edit gone wrong) falls back to `'active'` rather than throwing or propagating garbage into the UI, matching the project's general "never invent structure, but never load-bearing-fail on it either" posture. If the line is absent entirely (an old file written before this feature, or `ensureSkeleton`'s pre-existing `status: active` literal), same default: `'active'`.

Serialization order in `writeFrontMatterIntoContent`, matching the hand-written example already in design-overview.md §2.2 (`kind` / `status` / `dailyFocus`) — `status` is always written (not conditionally like the focus flags, since it always has a meaningful value):

```ts
export function writeFrontMatterIntoContent(
  content: string,
  status: ItemStatus,        // NEW param
  dailyFocus: boolean,
  weeklyFocus: boolean,
  extraLines: string[] = [],
): string {
  const lines = [...extraLines, `status: ${status}`];
  if (dailyFocus) lines.push('dailyFocus: true');
  if (weeklyFocus) lines.push('weeklyFocus: true');
  return setFrontMatterSpan(content, lines);
}
```

`extraLines` here no longer includes the old literal `status: active` from `ensureSkeleton` — that line is now a recognized field, same transition `dailyFocus`/`weeklyFocus` already went through.

## 3. Cache & write-through (`storage/dataCache.ts`)

`CachedItem` gains `status: ItemStatus`. `loadOneItem` populates it from `parseFrontMatter`; the error-fallback branch (file failed to load) defaults it to `'active'`, same treatment dailyFocus/weeklyFocus already get there.

`updateItemFrontMatter` widens to also carry `status`, since a status change and a focus change are both "the frontmatter block changed" — one write-through function, matching the fact that a status change and an auto-unfocus (§4) happen as *one* file write, not two:

```ts
export function updateItemFrontMatter(
  path: string,
  rawContent: string,
  status: ItemStatus,        // NEW
  dailyFocus: boolean,
  weeklyFocus: boolean,
  frontMatterExtraLines: string[],
): void
```

`storage/projectFile.ts`'s `saveFrontMatter` (the function `focusSlots.ts` calls) widens the same way.

## 4. Status changes & auto-unfocus (`storage/focusSlots.ts` → rename concerns, or new `storage/statusControl.ts`)

New function, same shape as the existing `setItemFocus`:

```ts
export async function setItemStatus(
  item: Pick<CachedItem, 'kind' | 'path' | 'rawContent' | 'status' | 'dailyFocus' | 'weeklyFocus' | 'frontMatterExtraLines'>,
  nextStatus: 'active' | 'on-hold' | 'done',   // never 'archived' here — see §5
): Promise<{rawContent: string; status: ItemStatus; dailyFocus: boolean; weeklyFocus: boolean}> {
  const clearsFocus = nextStatus !== 'active';
  const dailyFocus = clearsFocus ? false : item.dailyFocus;
  const weeklyFocus = clearsFocus ? false : item.weeklyFocus;
  const rawContent = await saveFrontMatter(item.kind, item.path, item.rawContent, nextStatus, dailyFocus, weeklyFocus, item.frontMatterExtraLines);
  updateItemFrontMatter(item.path, rawContent, nextStatus, dailyFocus, weeklyFocus, item.frontMatterExtraLines);
  return {rawContent, status: nextStatus, dailyFocus, weeklyFocus};
}
```

**Applied decision, flagging for confirmation**: moving to On Hold *or* Done both clear focus, on the reasoning already agreed for On Hold ("a deliberate signal, stronger than running low on slots") extended to Done ("nothing to gain from keeping a finished project occupying a focus slot"). If Done should keep its focus until the project is actually archived, this is a one-line change (`nextStatus === 'on-hold'` instead of `nextStatus !== 'active'`).

One file write per status change (`saveFrontMatter` → `writeTextFile`), same "write file, then update cache, in that order" rule every other mutation in this codebase follows.

`focusBlockedReason`/`canAddFocus`/DailyView's focus-candidate filter (`items.filter(item => item.kind === kind && !item.dailyFocus)`, `screens/DailyView.tsx:973-974`) gain `&& item.status === 'active'` — an On Hold or Done item can no longer be offered as a focus candidate anywhere, closing the open question already flagged in `feature_focus_selection.md`.

## 5. Archive — status + physical move as one action

This is deliberately **not** a value the plain status picker can set. It's its own action because it does two things that must stay coupled: change the frontmatter *and* move the folder off the filesystem location the app scans. Decoupling them (as briefly considered) would let a folder sit in Projects/ marked `archived` — invisible to nothing, since the app doesn't filter by status for scanning, only for the picker/list groupings — so status and location would silently disagree. Keeping them one action avoids that state entirely.

### 5.1 Native: `moveFolder` (`android/.../GtdParaFileModule.kt`)

New method alongside the existing four (`listFolderEntries`/`readTextFile`/`writeTextFile`/`ensureFolder`), same style:

```kotlin
@ReactMethod
fun moveFolder(fromPath: String?, toPath: String?, promise: Promise) {
    if (fromPath.isNullOrEmpty() || toPath.isNullOrEmpty()) {
        promise.reject("E_PATH", "Both a source and destination path are required")
        return
    }
    try {
        val source = File(fromPath)
        if (!source.exists() || !source.isDirectory) {
            promise.reject("E_NOT_DIRECTORY", "Source is not a folder: $fromPath")
            return
        }
        val dest = File(toPath)
        if (dest.exists()) {
            promise.reject("E_DEST_EXISTS", "A folder named \"${dest.name}\" already exists at the destination")
            return
        }
        dest.parentFile?.mkdirs()
        val moved = source.renameTo(dest)
        if (!moved) {
            promise.reject("E_MOVE", "Could not move the folder (renameTo failed)")
            return
        }
        promise.resolve(true)
    } catch (error: Throwable) {
        promise.reject("E_MOVE", error.message, error)
    }
}
```

`File.renameTo()` is atomic and effectively instant here because source and destination are always under the same base root (just a different top-level PARA folder) — same storage volume, no cross-filesystem copy involved. It *can* still return `false` for OS-level reasons (rare on plain external storage, but possible) — the JS wrapper must treat that as a real, surfaced error, never a silent no-op, since the caller (§5.2) assumes success means "the folder is really gone from Projects/Areas."

This is a small, self-contained addition to a native module you already own and fully control — not a dependency on `sn-plugin-lib`/`PluginFileAPI` at all, unlike `openFile`/`createNote`. Low technical risk; the earlier concern about this being a hard blocker doesn't hold once you look at where `listFolderEntries`/`readTextFile`/`writeTextFile` already live.

### 5.2 JS wrapper (`supernote/fileSystem.ts`)

```ts
export async function moveFolder(fromPath: string, toPath: string): Promise<void>
```
Mirrors `ensureFolderExists`'s shape (write-permission check, log, try/catch rethrow).

### 5.3 Orchestration (new `storage/archive.ts`)

```ts
export async function archiveItem(
  item: CachedItem,
  settings: GtdParaSettings,
): Promise<{path: string}> {
  const paths = resolvePaths(settings);
  const destRoot = paths.archive;
  const toPath = `${destRoot}/${item.name}`;
  await moveFolder(item.path, toPath);                 // 1. physical move first
  const rawContent = await saveFrontMatterAt(            // 2. stamp the file at its NEW location
    item.kind, toPath, item.rawContent, 'archived', false, false, item.frontMatterExtraLines,
  );
  removeCachedItem(item.path);                          // 3. drop from cache — it's no longer under Projects/Areas
  log('archiveItem: done', item.path, '→', toPath);
  return {path: toPath};
}
```

If step 2 fails after step 1 succeeds, the folder is still correctly out of Projects/Areas (the part that matters for the one-way-door behavior) — it just keeps whatever `status` it had before archiving. Not worth building rollback/retry machinery around; log it and move on, same proportionality as the rest of this codebase's error handling.

Step 3 needs a small new `dataCache.ts` export, `removeCachedItem(path)` — filters the item out of `cached.items`, the mirror of how `ensureItemCached` adds one in.

**Collision handling**: `moveFolder` rejects if a same-named folder already exists in Archive/ (§5.1). The UI surfaces that rejection as a plain error message (same `error` state pattern `ItemsList`/`CaptureScreen` already use) — no auto-rename-with-suffix behavير, since silently renaming someone's project folder is a bigger surprise than asking them to resolve the name clash themselves (rename the old archived copy, or the one being archived now).

## 6. Destination-picker filtering + ordering (`domain/destination.ts`)

`CaptureScreen.tsx` and `DailyView.tsx`'s quick-add both independently do `items.filter(item => item.kind === 'project')` / `'area'` today — exactly the kind of duplication `destination.ts`'s own doc comment already warns about ("so the two pickers can never drift on what counts as the same destination"). This feature's new rule (exclude On Hold/Done, float focused items to the top) is a second thing both pickers must apply identically, so it belongs in that shared file, not copy-pasted into both screens:

```ts
// domain/destination.ts
interface DestinationCandidate {
  kind: 'project' | 'area';
  status: ItemStatus;
  dailyFocus: boolean;
  weeklyFocus: boolean;
}

/**
 * Which of `items` (already filtered to one kind by the caller) are valid
 * quick-add/capture destinations, in display order: focused items (daily or
 * weekly) first, then the rest — Array.prototype.sort is stable (Hermes
 * included), so "the rest" keeps whatever order the caller's array was
 * already in (alphabetical, from the native folder listing).
 * Excludes anything not Active — On Hold/Done/Archived items are never
 * offered as a place to file a new Task/Meeting.
 */
export function destinationCandidates<T extends DestinationCandidate>(items: T[]): T[] {
  return items
    .filter(item => item.status === 'active')
    .slice()
    .sort((a, b) => Number(isFocused(b)) - Number(isFocused(a)));
}

function isFocused(item: DestinationCandidate): boolean {
  return item.dailyFocus || item.weeklyFocus;
}
```

`CaptureScreen.tsx:354-355` and `DailyView.tsx:875-876` both change from
```ts
const projects = loaded.items.filter(item => item.kind === 'project');
```
to
```ts
const projects = destinationCandidates(loaded.items.filter(item => item.kind === 'project'));
```
(and the same for `areas`).

## 7. Projects/Areas list (`screens/ItemsList.tsx`)

Currently a flat, ungrouped `entries.map(...)`. Becomes three (Projects) or two (Areas) labeled sections, all shown, nothing behind a toggle:

```
Active            (focused items first, then alphabetical)
On Hold           (alphabetical)
Done — awaiting review     (Projects only; alphabetical)
```

Applying the same "focused floats to the top" rule inside the Active section here too, not just in the destination pickers — one consistent rule for "wherever focused items appear in a list of items," rather than a picker-only special case. Flagging this as the applied interpretation of your "always shown on top" note, since it wasn't scoped explicitly to just the create-menus.

A section with zero items in it is simply omitted (no "On Hold (0)" empty header) — matches the existing `cache && entries.length === 0` "nothing here" messaging style rather than showing empty groups.

Each row gets a small status/focus indicator — see the UI draft for the exact treatment; kept to plain-text/emoji tags (★ for focused, a short "On Hold"/"Done" caption) rather than color, since color isn't a reliable signal on the e-ink display style this app already uses (no color anywhere in ItemsList/ProjectDataPanel today beyond the one blue accent button).

## 8. ProjectDataPanel — Status section

New "Status" section, placed **above** the existing "Focus" section (§2.10 in design-overview.md) — status is read top-to-bottom before focus because it gates it.

- **Projects**: a 3-way row — Active / On Hold / Done — same visual pattern as the existing Focus checkboxes (`FocusSection`), calling `setItemStatus` (§4) on selection.
- **Areas**: a 2-way row — Active / On Hold.
- A separate **"🗄 Archive…"** action, visually distinct from the 3-way/2-way picker (it's not a peer option, it's a different kind of action) — opens the confirm dialog (§9), then calls `archiveItem` (§5.3) on confirm, then closes `ItemDetail` back to the Projects/Areas list (the item's folder no longer exists at the path `ItemDetail` was showing).
- When status is not `'active'`, the existing `FocusSection` becomes disabled with a short inline note ("Focus is only available for Active items") rather than hidden outright — an On Hold/Done item is still fully present in the app (unlike Archived), so an explained disabled state reads as "not right now" rather than "this doesn't exist here."

## 9. Archive confirmation dialog

A simple native `Alert.alert`-style confirm ("Move '[Name]' to Archive? This moves the folder out of [Projects/Areas] on your device.") — no custom modal component needed, matches the lightweight-confirmation bar this app hasn't needed anywhere else yet (this is the first destructive-ish action in the app). Destination folder name and current PARA folder name come from `resolvePaths(settings)` so the message is accurate to whatever the user has configured in Settings, not hardcoded "Archive"/"Projects".

## 10. Build order (suggested)

1. `ItemStatus` type + frontmatter parse/write (§1-2) — pure, unit-testable via the existing Node scripts, no device needed.
2. `CachedItem`/`dataCache.ts`/`setItemStatus` (§3-4) — still pure/testable except the native write call.
3. `destinationCandidates` (§6) + wire into both pickers — pure, testable, and already shrinks real duplication.
4. ItemsList grouping (§7) + ProjectDataPanel Status section (§8) — UI, needs on-device or emulator check.
5. `moveFolder` native method (§5.1) — the one genuinely new native surface; test in isolation (a scratch button, or adb-driven) before wiring the full Archive action.
6. `archiveItem` orchestration + confirm dialog (§5.3, §9) — last, since it depends on everything above.

This order front-loads everything that's pure-TS and covered by the project's existing verification approach (standalone Node scripts + `tsc --noEmit`), leaving the one real native-code risk (step 5) isolated and easy to test on its own before it's wired into the full user-facing action.
