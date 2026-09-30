# Technical design: Project↔Area assignment, Area Files, Areas/Project Files tabs

Status: design drafted 2026-09-07 from chat requirements clarification (two rounds). Not yet implemented. UI draft published alongside this doc as a Claude Design canvas (static mockups) — see the chat message that links it.

## 1. What it is

A Project can optionally be assigned to **one** Area — the Project "supports" that Area. This is a soft, frontmatter-only link (no physical folder nesting: Projects stay under `1 Projects/`, Areas under `2 Areas/`, exactly as today). The button lives in `ui/ItemStatusPanel.tsx`, in the same row as "🗄 Archive…", Projects only.

The assignment is picked the same way a linked file is picked (§2.18): arm a Files-pane tab, then tap the thing you want. Two new tabs make this possible, symmetric across Projects and Areas:

- **Projects gain an "Areas" tab** (distinct from the existing "Project Files"/"Resources", and distinct from the new "Area Files" below) — a live, filtered listing of the `2 Areas/` folder showing **Active** areas only. Normally just another browsable root (drill into any area to look at its files). Pressing "Assign to Area…" arms it: the pane resets to the Areas root and the next **top-level** tap assigns that Area, instead of drilling into it.
- **Projects gain a fourth tab, "Area Files"**, once assigned — the assigned Area's own folder, for linking a Task/Meeting to a file that lives there (the third root `locateLinkedFile` needs to know about — §6). Hidden entirely when there's no assignment. No pinned-default-subfolder (Resources-only feature, not extended here).
- **On the Area's own Current-tab view**, the item's own root tab is relabelled "Area Files" (it's already that item's own folder — today's `ItemDetail.tsx` always calls this root "Project Files" regardless of kind, which is simply wrong for an Area and gets fixed here), and a new tab **"Project Files"** is added: a live, filtered listing of `1 Projects/` showing only Projects assigned to this Area (any status) — browsable, to dive into one's own files. Pure navigation, no arming — Areas never get assigned to anything.

Everything reuses `ui/FileBrowserPane.tsx`'s existing `roots: FileBrowserRoot[]` shape (MiniTabs already renders however many roots are passed) and its existing `LinkTarget` arm/locate machinery — nothing about the pane's fundamental shape changes, it gains one new filtering hook and one new arm variant.

## 2. Data model

`domain/types.ts`: no new exported type is strictly needed — the assignment is just a nullable string, same shape as `defaultResourceFolder`.

`FrontMatter`/`ParsedFrontMatter`/`CachedItem`/`ProjectFileState` all gain:

```ts
/** Bare folder name of the Area this Project supports, or null — Projects only. Areas never set this (always null). Same "identity = folder name, renaming breaks it" accepted risk as defaultResourceFolder/linkedFile. */
area: string | null;
```

- `domain/markdown.ts`'s `parseFrontMatter`/`writeFrontMatterIntoContent` gain an `area:` line, same "omit when null" convention `defaultResourceFolder` already established (not the always-written convention `status` uses).
- `storage/projectFile.ts`'s `loadProjectFile`/`saveFrontMatter` widen to carry `area` alongside `defaultResourceFolder` — same trailing-parameter, default-`null` shape (`saveFrontMatter(kind, itemPath, rawContent, status, dailyFocus, weeklyFocus, extraLines, defaultResourceFolder, area)`).
- `storage/dataCache.ts`'s `CachedItem`/`updateItemFrontMatter` widen the same way.
- Stored as a **bare folder name** (e.g. `area: Squad Value`), not a path. Confirmed acceptable: renaming the Area folder silently breaks the link, same as every other named-folder reference in this app. Because archiving an Area doesn't rename it (only moves its parent), the bare name stays valid even after the Area is archived — this matters for §5's "archiving preserves the reference" decision.

## 3. Storage/domain layer

### 3.1 `storage/areaAssignment.ts` (new)

Parallel to `statusControl.ts` — the plain, non-cascading read/write half of this feature:

- `assignProjectToArea(project: Pick<CachedItem, 'kind'|'path'|'rawContent'|'status'|'dailyFocus'|'weeklyFocus'|'frontMatterExtraLines'|'defaultResourceFolder'>, areaName: string): Promise<{rawContent: string; area: string}>` — one `saveFrontMatter` + `updateItemFrontMatter` call, same write-then-cache-update shape every other frontmatter mutation in this app uses. No side effects on the Area itself (assignment is purely informational from the Area's side).
- `unassignProject(project: ...): Promise<{rawContent: string; area: null}>` — writes `area: null`.
- `assignedProjects(areaName: string): CachedItem[]` — reads `getCachedData()`, filters `kind === 'project' && item.area === areaName`. Used by: the Area's "Project Files" tab, the archive-block check (§5), and the on-hold cascade (§5).

Only Active Areas are ever offered by the Areas tab's own filter (§4.2), so nothing in this module needs to re-validate "is the target Area active" — the picker already guarantees it structurally, same way `destinationCandidates` guarantees Active-only by construction rather than by a second check downstream.

### 3.2 `storage/statusControl.ts` — cascading Area status

`setItemStatus` needs `item.name` added to its `Pick<CachedItem, ...>` parameter (currently omits `name`) so an Area's cascade can match by name. New behavior, additive to the existing function:

> Moving an **Area** to `on-hold` also moves every currently-**Active** Project in `assignedProjects(item.name)` to `on-hold` (each via the same `setItemStatus`, so each one's own focus-flag auto-clear fires too, unchanged). On Hold → Active is **not** symmetric — reactivating an Area never reactivates its projects, same one-directional-cascade posture `dailyFocus`/`weeklyFocus` already have ("moving back to Active never re-focuses anything"). Flagged as the assumed default, same as prior features' flagged assumptions — easy to revisit if wanted.

Areas never reach `done` (2-way picker), so there's no Done-cascade to design here — only `on-hold` cascades.

### 3.3 `storage/archive.ts` — the Area-specific precondition and cascade

`archiveItem` gains an `area`-aware branch, kept inside the one function (not forked into a second one — same "archiving is one coupled function per item" posture the module doc comment already argues for):

1. If `item.kind === 'area'`: read `assignedProjects(item.name)` from the cache.
2. **Block** if any assigned project has `status === 'active'` or `'on-hold'` — throw a descriptive error (surfaces through `ItemStatusPanel`'s existing `archiveError` text, no new UI needed) naming how many/which projects need to move or be unassigned first. This check runs **before** the confirmation `Alert` even opens (§4.1) — the destructive dialog is never offered for an Area that can't actually be archived yet.
3. **Cascade**: for every assigned project with `status === 'done'`, call `archiveItem` on that project first (same function, recursively — each one's own folder move + frontmatter stamp + cache removal happens exactly as a standalone Project archive would). If any cascaded project's move throws, stop immediately and surface that error — the Area itself is *not* archived in that case, rather than leaving a partial cascade silently swallowed (this module already treats a failed *frontmatter stamp* as log-and-continue, but a failed *folder move* has always been a hard stop — the cascade keeps that same distinction per sub-item).
4. Only once the cascade succeeds (or there was nothing to cascade) does the Area's own folder move + stamp run, exactly as today.
5. **The cascaded projects' `area:` field is left untouched** — it keeps naming the Area by its (unchanged) folder name. This is the resolution of "archiving should update all projects to point to the archived area": because assignment is stored by bare name and archiving doesn't rename the folder, the reference is already correct after the move — no rewrite needed, and the relationship survives in the file for anyone who goes looking in `Archive/` by hand later, consistent with this app's "never silently drop hand-relevant content" posture.

Net effect worth calling out explicitly: by construction, once an Area finishes archiving, **zero non-archived Projects can still reference it** — active/on-hold ones are a hard block, done ones are cascaded. There is no "Area Files tab pointing at a folder that quietly moved out from under it" state to design defensively against; it can't occur.

## 4. UI changes

### 4.1 `ui/ItemStatusPanel.tsx`

New row, Projects only, same row as the existing Archive action:

- **Unassigned**: `[ 🗄 Archive… ]  [ Assign to Area… ]`
- **Assigned**: `[ 🗄 Archive… ]  [ Area: Squad Value  ✕ ]`

Tapping the "Area: Squad Value" text (not the ✕) re-opens the picker (re-arms the Areas tab) to reassign. Tapping ✕ clears immediately via `unassignProject` — no confirmation, same as the Resources pin having none: this is a reversible, non-destructive action, unlike Archive.

This panel doesn't own a `FileBrowserPane` — arming a *sibling* pane needs the same kind of upward report `ProjectDataPanel` already does for file-linking (`onLinkTargetChange`). New prop: `onRequestAreaAssignment?: (mode: {onPick, onCancel} | null) => void`, called on press/cancel.

### 4.2 `ui/FileBrowserPane.tsx` — the two additions

**(a) `entryFilter` on `FileBrowserRoot`:**

```ts
export interface FileBrowserRoot {
  key: string;
  label: string;
  rootPath: string;
  defaultSubfolder?: string | null;
  onSetDefaultSubfolder?: (subfolderRelativePath: string) => void;
  /** Applied ONLY to entries at this root's own top level (depth 0) — a folder entered from here shows its real, unfiltered contents. Used by the Areas tab (active-only) and an Area's Project Files tab (assigned-to-this-area-only). Omitted (undefined) for every existing root — no behavior change there. */
  entryFilter?: (entry: FolderEntry) => boolean;
}
```

`handleEntryPress`'s existing folder/file branching is unchanged; only the entries array rendered at `depth === 0` gets `.filter(activeRoot.entryFilter ?? (() => true))` applied before pagination. One generic mechanism serves both new tabs:

- Areas tab: `entryFilter: entry => findCachedItem(entry.path)?.status === 'active'`
- Area's Project Files tab: `entryFilter: entry => findCachedItem(entry.path)?.area === thisAreaName`

(`FileBrowserPane` currently has zero `dataCache` import — this is the one new dependency it picks up, read-only, same "reads should prefer the cache" convention as everywhere else.)

**(b) `pickKind` on the `arming` `LinkTarget` variant:**

```ts
export type LinkTarget =
  | {mode: 'locating'; root: string; folderPath: string; fileName: string; fileMissing: boolean}
  | {
      mode: 'arming';
      onPick: (root: string, relativePath: string) => void;
      onCancel: () => void;
      /** 'file' (default, omitted) = today's linked-files behavior unchanged: a folder tap always drills in, only a file tap picks. 'folder' = a top-level (depth 0) folder tap picks immediately instead of drilling in; below the root, taps still drill in normally (so a user can look inside an Area before committing — picking only ever fires at depth 0). */
      pickKind?: 'file' | 'folder';
      /** Overrides the "Select Attachment" badge text — e.g. "Select Area" — defaults to "Select Attachment" when omitted, so existing callers need no change. */
      label?: string;
    };
```

On arming start (`pickKind: 'folder'`), the pane resets its stack to the target root exactly like `locating` mode already does (`buildStack(root, undefined)`) — the user always starts the pick at the Areas root, not wherever they last drilled to.

### 4.3 `screens/ItemDetail.tsx` — owning one combined link/arm target

Today `linkTarget` is *reported by* `ProjectDataPanel` and *piped through* by `ItemDetail`, which "never sets `linkTarget` itself" (existing doc comment). That changes: `ItemDetail` becomes the arbiter between **two** siblings that can each want to arm the pane — `ProjectDataPanel` (file-linking, unchanged) and `ItemStatusPanel` (area-assignment, new). Starting one now needs to clear the other, extending the existing "one edit-or-arm target per screen" rule up one level:

- `ItemStatusPanel`'s `onRequestAreaAssignment` and `ProjectDataPanel`'s `onLinkTargetChange` both write into one `ItemDetail`-owned `linkTarget` state; whichever fires clears the target the other one might have set.
- `ItemDetail` builds the `roots` array itself now (it already does — see current code): `Project Files` / `Area Files` (kind-dependent label), `Resources`, `Areas` (Projects only, `entryFilter`: active), `Area Files` (Projects only, when `area` is set, `rootPath` = resolved absolute path of `paths.areas + '/' + area`), `Project Files` (Areas only, `entryFilter`: assigned-to-this-area).
- The Area-assignment `onPick(root, relativePath)` callback (root will be `'areas'`, `relativePath` is the picked Area's bare folder name) calls `assignProjectToArea` and clears the arm target — same shape as the existing file-link `onPick` in `ProjectDataPanel`.

### 4.4 Tab counts, concretely

- Project, unassigned: **Project Files | Resources | Areas** (3-way MiniTabs).
- Project, assigned: **Project Files | Resources | Areas | Area Files** (4-way).
- Area (any): **Area Files | Resources | Project Files** (3-way).

No screen ever shows more than 4 tabs. The UI draft shows all three states.

## 5. Lifecycle rules (summary — see §3.2/§3.3 for the mechanics)

| Trigger | Effect |
|---|---|
| Area → On Hold | Every Active project assigned to it → On Hold too (cascading `setItemStatus`, their own focus auto-clears as a result). Not reversed on Area → Active. |
| Archive an Area with an assigned Active/On-Hold project | Blocked outright, before the confirm dialog — error names the projects. |
| Archive an Area with an assigned Done project | The Done project is archived too, in the same action, before the Area's own folder moves. Its `area:` field is left as-is. |
| Archive an Area with no assigned projects, or only already-Archived ones | Archives normally, unchanged from today. |
| Rename an Area's folder | Breaks the assignment silently (accepted, same as `defaultResourceFolder`/`linkedFile`). |

## 6. Linked-files reach into Area Files (§2.18 integration)

`storage/linkedFiles.ts`'s `locateLinkedFile(paths, itemPath, linkedFile)` checks exactly two roots today (`itemPath`, then `paths.resources`) and returns `null` for anything else. It gains a third check, only reachable when the Task/Meeting's own Project has an `area` set:

```ts
export function locateLinkedFile(
  paths: ResolvedParaPaths,
  itemPath: string,
  linkedFile: string,
  areaPath: string | null,   // new — resolved absolute path of the assigned Area's folder, or null
): LinkedFileLocation | null {
  // ...existing itemPath, resources checks...
  if (areaPath) {
    const underArea = relativeLocation(areaPath, absolutePath);
    if (underArea) return {root: 'area', ...underArea};
  }
  return null;
}
```

`LinkedFileLocation.root` widens from `'item' | 'resources'` to `'item' | 'resources' | 'area'`. The one caller (`ProjectDataPanel.tsx`, deriving the `locating` `LinkTarget` for whichever Task/Meeting is being edited) passes the Project's own resolved area path through — it already has the item's cached `area` field in scope from the same load `ItemStatusPanel`/`ItemDetail` use. No change needed to `FileBrowserPane` itself for this — `locating` mode already accepts an arbitrary `root: string` and matches it against whatever `roots` were passed in, so `'area'` just needs to be one of the keys in `ItemDetail`'s `fileBrowserRoots` array (§4.3), which it already is.

Arming to link a *new* file works unchanged — `ProjectDataPanel`'s existing arm flow already lets the user switch tabs (including the new Area Files tab) before tapping a file, since `roots.length > 1` already renders MiniTabs during arming.

## 7. Implementation order

1. Data model + storage (`domain/markdown.ts`, `domain/types.ts` doc comment, `storage/projectFile.ts`, `storage/dataCache.ts`) — `area` field round-trips, verified with a standalone script extension (§8) before any UI work starts.
2. `storage/areaAssignment.ts` (new) + `statusControl.ts`'s cascade + `archive.ts`'s block/cascade — pure logic, verifiable without touching a screen.
3. `ui/FileBrowserPane.tsx`'s `entryFilter` + `pickKind`/`label` additions — backward compatible, so `ItemDetail.tsx`/`InboxScreen.tsx`'s existing calls need no change yet.
4. `ui/ItemStatusPanel.tsx`'s new row + `onRequestAreaAssignment` prop.
5. `screens/ItemDetail.tsx` — combined link/arm target, the four-root-building logic, kind-dependent "Area Files" label fix.
6. `storage/linkedFiles.ts`'s third `locateLinkedFile` root + `ProjectDataPanel.tsx` threading the resolved area path through.
7. `docs/dev/design-overview.md` update (new §2.19, plus a note in §2.12's status/archive section and §2.18's linked-files section pointing at it) — same as every prior feature.

## 8. Verification

Same standing pattern as every feature above: a scoped `tsc --noEmit --strict` pass over every touched file before calling this done, plus extending the existing standalone-Node scripts (`verify-markdown.ts` for `area`'s frontmatter round-trip, a new case in whatever script covers `statusControl`/`archive` for the cascade/block logic — no such script exists yet for status/archive per design-overview.md §4's own outstanding-scope note, so this is a good place to finally add one rather than testing the cascade only by hand). No on-device build access this session, same standing caveat as every feature in this doc's history.

## 9. Flagged assumptions (confirm or correct when reviewing)

- Area → Active never re-activates previously cascaded On-Hold projects (§3.2). 
- The Area's "Project Files" tab shows assigned projects of **any** status except Archived (Active/On-Hold/Done all listed) — not filtered to Active-only, since it's a navigation aid, not a destination picker.
- A cascaded project-archive failure aborts the whole Area-archive attempt rather than archiving the Area anyway with a partial cascade (§3.3, point 3).
