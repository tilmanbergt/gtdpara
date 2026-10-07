# Technical Design: Linked Files (Todos & Meetings)

Status: draft, not yet implemented. Requirements clarified in chat 2026-09-07 across three UX rounds (see project memory `feature_linked_files.md` for the clarification log and the published mockup). This design covers: replacing the row's `✕` with an attachment icon, moving deletion into edit mode, letting a Todo/Meeting link an existing file from its own Project/Area folder or from Resources, a per-item default Resources subfolder, and the Inbox screen restructure that follows from it.

## 1. Goals and what was decided

- The row's `✕` (soft-delete) is retired. Deletion becomes a "Delete" button inside the edit form (`TaskQuickAdd`/`MeetingQuickAdd`'s `editingTask`/`editingMeeting` mode), next to "Save" — same soft-delete mutation, just relocated.
- A Todo or Meeting can link to **one** existing file (not a note this plugin creates — an existing file the user points at), shown as a paperclip icon in the row's icon cluster where `✕` used to be.
- Picking a file has no dialog: tapping the row's unfilled clip arms the existing Files pane (Current tab) or Resources pane (Inbox) — the next *file* tapped there completes the link. Tapping a filled clip just opens the file.
- Resources is one global folder; a Project/Area can pin a default subfolder within it so its Resources tab doesn't always start at the root.
- Opening edit mode on an item that already has a link auto-navigates the Files pane to it and marks it with a solid black line (not the existing blue — needs to hold up on e-ink).
- Daily is read-only: a filled clip if a link exists (tap to open), nothing otherwise — no way to start a link from Daily.
- Inbox is rebuilt to mirror Current's two-pane shape: left pane is Resources only (no Project Files tab — Inbox items aren't filed anywhere yet), right pane stacks Tasks above Meetings (previously side by side).
- Only one edit (task or meeting) can be open at a time per screen — starting one cancels the other, which is also what keeps the Files-pane auto-locate unambiguous.
- Storage: a new trailing `+[[path]]` token, same convention as the existing `→ [[path]]` note-link token, deliberately shaped so a second (future) attachment is just a second token, not a format change. One link only for v1.

Explicitly confirmed out of scope for this pass: multiple links per item, an "undo" for delete beyond the existing soft-delete/cancel semantics, and any change to how linked *notes* (`storage/noteLinks.ts`, the `→ [[...]]` token) work — that stays exactly as-is; this is a second, independent link slot.

## 2. Data model

`domain/types.ts` — both `Task` and `Meeting` gain one field, directly beside `notePath`:

```ts
/**
 * Relative path (from the configured base root, domain/settings.ts's
 * ResolvedParaPaths.base) to an existing file this item links to - e.g.
 * "1 Projects/Squad Value/Sprints/Sprint_Board_Export.png" or
 * "3 Resources/Atruvia/Templates/Scrum_Guide_2020.pdf". '' = no link.
 *
 * Deliberately base-root-relative rather than item-relative like notePath:
 * a linked file can live under Resources, which isn't nested under the
 * item's own folder, so one resolution rule (always relative to base) is
 * simpler than branching on where it was picked from.
 */
linkedFile: string;
```

Not modeled as an array yet (`linkedFile: string`, not `linkedFiles: string[]`) — confirmed one-per-item is enough for now. The storage syntax below is chosen so widening to an array later only touches the parse loop and `linkedFile → linkedFiles`, not the on-disk format.

## 3. Storage syntax (`domain/markdown.ts`)

New trailing token, appended **after** the note link (rightmost on the line):

```
- [ ] Send retro notes to Sabine #next #due:2026-09-10 → [[Todos/Draft.note]] +[[3 Resources/Atruvia/Templates/Scrum_Guide_2020.pdf]]
```

```ts
// mirrors NOTE_LINK_RE exactly, one token to the right of it
const LINKED_FILE_RE = /\s*\+\[\[([^\]]+)\]\]\s*$/;

function extractLinkedFile(rawText: string): {text: string; linkedFile: string} {
  const match = LINKED_FILE_RE.exec(rawText);
  if (!match) return {text: rawText, linkedFile: ''};
  return {text: rawText.slice(0, match.index), linkedFile: match[1]};
}

function appendLinkedFile(text: string, linkedFile: string): string {
  return linkedFile ? `${text} +[[${linkedFile}]]` : text;
}
```

Parse order matters — strip right-to-left, append left-to-right:

- `parseTasksSpan`/`parseMeetingsSpan`: run `extractLinkedFile(rawText)` **first** (strips the trailing `+[[...]]`), then `extractNoteLink` on what's left (strips `→ [[...]]`), then `deriveTaskFields(text)` on the fully-stripped text — same order dependency `extractNoteLink` already has on `deriveTaskFields` today, just one step earlier in the chain.
- `serializeTaskLine`/`serializeMeetingLine`: `appendLinkedFile(appendNoteLink(text, notePath), linkedFile)` — note link first, then the file link, so round-tripping reproduces the exact token order above.

No change to `TAG_RE`/`extractTags` — `+[[...]]` doesn't start with `#`, so it was never picked up as a tag and doesn't need excluding.

### 3.1 Default Resources folder — new frontmatter field

`ParsedFrontMatter` gains `defaultResourceFolder: string | null` (relative to `paths.resources`, e.g. `"Atruvia"` or `"Atruvia/Templates"`), parsed the same way `status`/`dailyFocus`/`weeklyFocus` already are:

```ts
const DEFAULT_RESOURCE_FOLDER_LINE_RE = /^defaultResourceFolder:\s*(.*)$/;
```

`writeFrontMatterIntoContent` gains a `defaultResourceFolder: string | null` parameter, written as a `defaultResourceFolder: <value>` line only when non-null (same "only write when meaningful" convention `dailyFocus`/`weeklyFocus` use). `storage/projectFile.ts`'s `saveFrontMatter` and `storage/dataCache.ts`'s `CachedItem`/its frontmatter write-through function both widen the same way `dailyFocus`/`weeklyFocus` already did when they were added — no new function, just one more field threaded through the existing ones.

## 4. New module: `storage/linkedFiles.ts`

Parallel to `storage/noteLinks.ts`, but for pointing at an *existing* file rather than creating one:

```ts
/** Turns a stored linkedFile value into an absolute path. Always base-relative (see domain/types.ts), so unlike storage/noteLinks.ts's resolveNotePath there's no absolute-path branch to handle. */
export function resolveLinkedFilePath(paths: ResolvedParaPaths, linkedFile: string): string {
  return `${paths.base}/${linkedFile}`;
}

/** linkedFile relative to paths.base, given an absolute FolderEntry.path under either Projects/Areas or Resources - the inverse of resolveLinkedFilePath, used once when a file is tapped while armed. */
export function toLinkedFile(paths: ResolvedParaPaths, absolutePath: string): string

export type LinkedFileStatus = 'ok' | 'missing';

/**
 * Whether the linked file itself still exists, by listing its parent folder
 * (supernote/fileSystem.ts's listFolderEntries) and checking for a matching
 * name. Note: listFolderEntries resolves an empty array both when a folder
 * is genuinely empty and when it doesn't exist at all - this check can't
 * tell those apart, but doesn't need to: either way the file isn't in the
 * list, so 'missing' is correct regardless of which case it is. The Files
 * pane's own auto-navigate just shows whatever that folder listing returns
 * (empty or not) - no special-cased "folder is gone" message, per the "no
 * text banner, ⚠ is enough" decision.
 */
export async function linkedFileStatus(paths: ResolvedParaPaths, linkedFile: string): Promise<LinkedFileStatus>

/** Where linkedFile's *containing folder* lives, for the Files pane's auto-navigate: which root (Project Files vs Resources) and the folder-only path relative to that root. Returns null if linkedFile doesn't resolve under either root (shouldn't happen for anything this plugin wrote, but a hand-edited file is possible). */
export interface LinkedFileLocation {
  root: 'item' | 'resources';
  /** Folder path relative to the item's own root (root: 'item') or paths.resources (root: 'resources'). '' = the root itself. */
  folderPath: string;
  fileName: string;
}
export function locateLinkedFile(paths: ResolvedParaPaths, itemPath: string, linkedFile: string): LinkedFileLocation | null
```

## 5. Shared UI primitive: `ui/FileBrowserPane.tsx` (new)

`ItemDetail.tsx`'s left pane and Inbox's rebuilt left pane both need the same shape — folder-stack navigation, pagination, and now the locating/arming/pin behavior below — so this is a second (Inbox) and effectively third (both Files tabs on Current) caller needing what `ItemDetail.tsx` already does, the same "extract once a second caller needs the same shape" bar `TaskRow`/`FileToPicker` were built to (`ItemDetail.tsx`'s own file-browsing code moves here rather than being duplicated into `InboxScreen.tsx`).

```ts
export interface FileBrowserRoot {
  key: string;            // 'project' | 'resources'
  label: string;          // MiniTabs label - "Project Files" / "Resources"
  rootPath: string;       // absolute path this root starts browsing at
  /** Resources root only - lets the pane render the pin and start at the pinned subfolder instead of rootPath. */
  defaultSubfolder?: string | null;
  onSetDefaultSubfolder?: (subfolderRelativePath: string) => void;
}

export type LinkTarget =
  | {mode: 'locating'; root: FileBrowserRoot['key']; folderPath: string; fileName: string; fileMissing: boolean}
  | {mode: 'arming'; onPick: (root: FileBrowserRoot['key'], relativePath: string) => void};

interface Props {
  roots: FileBrowserRoot[];        // 1 root (Inbox) -> MiniTabs omitted; 2 roots (Current) -> MiniTabs shown
  linkTarget: LinkTarget | null;   // drives the black-line auto-locate, or the armed "Select Attachment" state
  onCancelArming?: () => void;
  onOpenFile: (absolutePath: string) => Promise<void>;
  resetKey?: string;               // same usePagination reset-on-item-change convention ItemDetail already has
  textColor: string;
  borderColor: string;
}
```

Behavior, folded in from the three UX rounds:

- **Normal** (`linkTarget: null`): today's `ItemDetail` left-pane behavior exactly — tap a folder to drill in, tap a file to open it via `openPath`.
- **`locating`**: on mount/whenever `linkTarget` changes, the pane switches to `root`, drills its stack to `folderPath`, and (once entries load) pages to whichever page contains `fileName` — needs `ui/pagination.ts`'s `usePagination` to grow a way to jump to the page containing a given predicate (a small addition, e.g. `pageIndexOf(items, predicate)`, alongside the existing `resetKey` jump-to-0). The matching row renders with a solid `#000` left border (4px, mirroring `rowEditing`'s shape but black, not `#2f6feb` — the one deliberate e-ink legibility exception across this whole feature). If `fileMissing`, the pane still navigates to `folderPath` (if listing it returns anything sensible) but nothing gets the highlight — there's nothing to point at.
- **`arming`**: tabs and folder-drilling keep working; a `Select Attachment  ✕` block sits inline at the right end of the `MiniTabs` row (or, for Inbox's single-root pane, in the same slot the tabs row would occupy). Tapping the `✕` calls `onCancelArming`. Tapping a *file* (not a folder) calls `linkTarget.onPick(root, relativePath)` instead of opening it.
- **Pin** (Resources root only, `defaultSubfolder`/`onSetDefaultSubfolder` present): the breadcrumb row's trailing icon is the outline pin when the currently-browsed subfolder isn't `defaultSubfolder`, tappable to call `onSetDefaultSubfolder(currentSubfolder)`; filled, non-tappable, when it already matches. Opening the Resources root starts at `defaultSubfolder` if set, the root otherwise.

`ItemDetail.tsx` renders this with two roots (`project` → the item's own folder, `resources` → `paths.resources` with the item's `defaultResourceFolder`); `InboxScreen.tsx` renders it with one root (`resources`, no default-folder concept — Inbox has no single item to pin one for) and the `Files`/pane-title area relabeled `Resources` directly, no `MiniTabs`.

## 6. Row changes: `ui/TaskRow.tsx` / `ui/MeetingRow.tsx`

- `onCancel`/the `✕` render branch is removed entirely — rows no longer offer a delete affordance at all.
- New props:
  ```ts
  linkedFile: string;                 // task.linkedFile / meeting.linkedFile, always passed
  onOpenLinkedFile?: (linkedFile: string) => void;
  /** Only passed by callers that support starting a link from this row - Current tab, Inbox. Its absence (Daily, and Review pending the note in §9) is what makes the icon read-only there. */
  onArmLink?: () => void;
  /** Highlights the row while it's the one currently armed - same visual treatment isEditing already gets. */
  isArming?: boolean;
  ```
- Render rule, replacing the old `✕`'s slot:
  - `linkedFile` non-empty → filled clip, tap → `onOpenLinkedFile(linkedFile)`. Always rendered when there's a link, regardless of whether `onArmLink` was passed — this is what makes Daily's clip show up read-only.
  - `linkedFile` empty and `onArmLink` provided → `+`-prefixed clip, tap → `onArmLink()`.
  - `linkedFile` empty and `onArmLink` not provided → nothing renders (Daily, no link, no way to start one).
- Icon is a small inline SVG (`<Svg>`/`<Path>` from `react-native-svg`, already a transitive dependency via the plugin SDK — needs confirming/adding if not already available at build time) drawn in plain black, not an emoji, per the e-ink-legibility feedback — same reasoning as the black locate-highlight above.

## 7. Edit form changes: `ui/TaskQuickAdd.tsx` / `ui/MeetingQuickAdd.tsx`

- New props: `onDeleteEdit?: () => void` (required alongside `editingTask`/`editingMeeting`), `linkedFileMissing?: boolean` (drives the ⚠, computed by the caller via `linkedFileStatus` — forms stay free of I/O, matching every other piece of derived state here).
- Heading copy: `'Editing task'` → `'Edit todo'`, `'Editing meeting'` → `'Edit meeting'` (add-mode headings unchanged).
- Layout: heading and "Cancel" move onto one row (`justifyContent: 'space-between'`), replacing the standalone `cancelRow` below the fields. "Delete" renders next to "Save" in the existing button row, calling `onDeleteEdit` (same soft-delete `cancelled: true` mutation the row's `✕` used to trigger, now sourced here instead).
- Attachment: **no new callback.** `editingTask?.linkedFile` seeds local state (`const [linkedFile, setLinkedFile] = useState(editingTask?.linkedFile ?? '')`, mirroring how `flowState`/`dueDate` are already seeded and locally owned in edit mode). When non-empty, render the clip+✕ (or clip+⚠+✕ if `linkedFileMissing`) pill inline in `TaskQuickAdd`'s existing `chipDueRow` (after the flow chips, before the due-date input) and `MeetingQuickAdd`'s existing `fieldsRow` (after date/time, before Save/Delete). The clip glyph itself isn't interactive here — only `✕`, which just does `setLinkedFile('')`. `submit()` composes the final text the same way it already composes `flowState`/`dueDate`: `finalText = setLinkedFileTag(finalText, linkedFile || null)`, a new `domain/markdown.ts` function mirroring `setDueTag`'s shape exactly. This is what makes "swap" a real two-trip flow rather than needing a dedicated relink affordance: clearing here and hitting Save writes `linkedFile: ''` immediately; a *new* link only ever gets set by arming from the row afterward, outside edit mode.
- `TaskQuickAdd`'s chip row: "Waiting" chip label shortens to "W/F" so `Next / W/F / Someday / Maybe / [clip] / Due` fits one line without wrapping at the card's existing width — a copy change only, `FlowStateChips` internals/derived `flowState` values are untouched.

## 8. Cross-cutting: one edit target, bubbled up to the Files pane

This is the part that ties §5-7 together. `ItemDetail.tsx`'s `FileBrowserPane` (left) and `ProjectDataPanel.tsx`'s Todos/Meetings sections (right) are siblings — today they don't talk to each other at all. Two things now need to cross that boundary: which row is being edited (so the pane can auto-locate its link), and which row is armed (so a tapped file resolves to the right target).

**`ProjectDataPanel.tsx`:** `TodosSection` and `MeetingsSection` currently each own an independent `editingIndex`/`setEditingIndex` (confirmed today: a task edit and a meeting edit can be open at the same time, since these are two unrelated `useState` calls in two sibling components). Per the "one edit at a time" decision, this state moves up into `ProjectDataPanel` itself:

```ts
type EditTarget = {type: 'task' | 'meeting'; index: number};
const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
const [armTarget, setArmTarget] = useState<EditTarget | null>(null);
```

`TodosSection`/`MeetingsSection` receive `editingIndex`/`onStartEdit`/`onCancelEdit` (and `armingIndex`/`onArmLink`) derived from these two shared values instead of owning their own — starting an edit or an arm on either row type clears whichever of the other three states was active (an edit starting cancels any arm, and vice versa, per the same "only one thing going on" rule — inferred as the sensible extension of "one edit at a time," flagged in §9). `ProjectDataPanel` computes the `LinkTarget` (`locating` when `editTarget` is set and that task/meeting's `linkedFile` is non-empty, `arming` when `armTarget` is set, `null` otherwise) and reports it upward:

```ts
onLinkTargetChange?: (target: LinkTarget | null) => void;   // new ProjectDataPanel prop
```

**`ItemDetail.tsx`:** stores whatever `onLinkTargetChange` last reported and passes it straight into `FileBrowserPane`'s `linkTarget` prop. The `arming.onPick` callback it hands down through `ProjectDataPanel` closes over `armTarget`, so picking a file writes straight back to the right task/meeting (compose `+[[...]]` via `appendLinkedFile`/`writeTasksIntoContent`/`writeMeetingsIntoContent`, same `saveTasks`/`saveMeetings` calls `TodosSection`/`MeetingsSection` already use) without `ItemDetail` needing to know anything about task/meeting shapes itself.

**`InboxScreen.tsx`** gets the identical treatment (it already has its own `editingTaskIndex`/`editingMeetingIndex` split the same way `ProjectDataPanel` does) — merge into one `editTarget`/`armTarget` pair, render `FileBrowserPane` with a single `resources` root, wire `onLinkTargetChange` the same way, just without a second screen-level component to bubble through (`InboxScreen` owns both panes directly).

**Default-resource-folder** is simpler and doesn't need this bubbling at all: `ItemDetail.tsx` reads it straight off `ensureItemCached`'s `CachedItem` (already cheap/memoized — `ProjectDataPanel` calls the same function) and owns `handleSetDefaultResourceFolder`, independent of the editing machinery above.

## 9. Open items / assumptions made explicit

1. **Review screen wasn't part of the UX rounds.** `ReviewScreen.tsx`'s Inbox-to-zero step uses the same `TaskRow`/`MeetingRow` and has no Files pane either. Defaulting it to the same read-only treatment as Daily (`onArmLink` omitted) for this pass — flag if that's wrong.
2. **"One edit at a time" extended to also cancel an in-progress arm**, and vice versa (§8) — inferred from the chat decision, not asked in those exact words. Seemed like the only sensible reading given there's now one `LinkTarget` slot per screen, but calling it out since it wasn't explicitly confirmed.
3. **`react-native-svg` availability** — the clip/pin icons need real vector drawing, not text glyphs, per the e-ink feedback. Needs a quick check (`package.json`/`node_modules`) before implementation starts; if it's not already a resolved dependency of `sn-plugin-lib`, that's a small addition, not a blocker, but worth confirming in phase 1 rather than discovering it mid-build.
4. **`usePagination`'s "jump to the page containing X" addition** (§5) is new surface on a primitive four other screens already depend on (`docs/dev/history/technical-design-pagination-edit-reuse.md`) — purely additive (a new optional export, no change to existing call sites), but worth a quick pass over `ui/pagination.ts` before writing it to make sure the addition composes cleanly with the existing `resetKey` behavior rather than fighting it.

## 10. Implementation plan

Phased so each step is independently `tsc`/eslint-checkable via the project's existing scratch-project convention (`design-overview.md` §3), roughly in dependency order:

1. **Data + parsing** — `domain/types.ts` (`linkedFile` field ×2), `domain/markdown.ts` (`LINKED_FILE_RE`/`extractLinkedFile`/`appendLinkedFile`, parse-order changes in `parseTasksSpan`/`parseMeetingsSpan`, `setLinkedFileTag`, `defaultResourceFolder` frontmatter parsing/writing), `storage/projectFile.ts` (`saveFrontMatter` widened), `storage/dataCache.ts` (`CachedItem`/its frontmatter write-through widened). New `storage/linkedFiles.ts` (§4). No UI touched yet — verifiable standalone via the Node scripts `domain/`/`storage/` already use.
2. **Row + edit-form changes** — `ui/TaskRow.tsx`/`ui/MeetingRow.tsx` (§6: drop `✕`, add clip states), `ui/TaskQuickAdd.tsx`/`ui/MeetingQuickAdd.tsx` (§7: Delete, heading/Cancel reflow, attach-cluster + `setLinkedFileTag`). Callers not updated yet — expect a transiently-broken build between this step and step 4 (existing `onCancel` props on `TaskRow`/`MeetingRow` calls need removing everywhere in the same pass, or a temporary optional shim); sequence this and step 4 close together rather than leaving the tree broken across a commit boundary.
3. **`ui/FileBrowserPane.tsx`** (§5) — extracted from `ItemDetail.tsx`'s current left-pane code, plus the new `locating`/`arming`/pin behavior and the `pagination.ts` jump-to-page addition (§9.4). Buildable/testable in isolation against `ItemDetail.tsx` alone before `InboxScreen.tsx` is touched.
4. **`ItemDetail.tsx` + `ProjectDataPanel.tsx`** — wire `FileBrowserPane` in with both roots + pin, lift `editTarget`/`armTarget` up into `ProjectDataPanel` (§8), thread the new `TaskRow`/`MeetingRow` props through `TodosSection`/`MeetingsSection`, thread `onDeleteEdit`/`linkedFileMissing` into the `TaskQuickAdd`/`MeetingQuickAdd` calls. This is the point the transient breakage from step 2 resolves.
5. **`InboxScreen.tsx` rebuild** — swap the Meetings-left/Tasks-right layout for `FileBrowserPane` (single `resources` root, no tabs) + stacked Tasks/Meetings sections, same `editTarget`/`armTarget` lift as step 4.
6. **`DailyView.tsx`** (and `ReviewScreen.tsx`, pending §9.1) — pass `linkedFile`/`onOpenLinkedFile` into the existing `TaskRow`/`MeetingRow` calls, `onArmLink` deliberately omitted.
7. **Verification** — `tsc --noEmit` + eslint via the scratch-project convention (`gtdpara_project.md`'s recurring note: no `device_bash` this session unless one becomes available, in which case run it directly instead), covering every file touched above. Then an on-device smoke test once available: link a file from each root, open a linked file, remove+relink, Delete from edit mode, the missing-file ⚠ path (rename a linked file's on-disk target and reopen edit), and the default-Resources-folder pin.
8. **`docs/dev/design-overview.md`** update (§2/§4/§5, per this repo's standing convention) — after implementation, not before, same as every other feature here.

Comparable in size to the Daily-compact-UI and Tags passes — expect this to span more than one implementation session; land it in the phase order above rather than as one pass.
