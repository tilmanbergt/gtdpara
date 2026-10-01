# Technical design: Inbox as a folder under Areas

Status: **implemented 2026-10-01** (approved the same day), not yet device-tested. Planned for 0.2.0.

## 1. Requirements (decided in chat, 2026-10-01)

Goal: a cleaner `Note` folder. Today the Inbox file and its note folders sit in the Note root next to
the PARA folders and look like clutter. The Inbox should become a folder under Areas, like every
other Area on disk, while the app keeps behaving as it does today.

1. **Files only.** The Inbox keeps its own kind (`inbox`) and all of its current behavior: its own
   tab, Quick Add destination, lasso capture default, Review "Inbox to zero", Daily/Week/Month
   rows. Only where its files live changes.
2. **Location:** `<base>/<Areas folder>/<Inbox folder>/`. The Inbox folder name is a **new
   setting** on the Folders tab. Its default is **`0 Inbox`**, so it sorts first among the Areas.
3. **File name stays `Inbox.txt`**, with no format change. Linked notes go into `Todos/` and
   `Meetings/` inside the Inbox folder, the same as for a Project or Area.
4. **One-time automatic move** on the first start of the new version: `Inbox.txt`, `Todos/` and
   `Meetings/` move from the base root into the Inbox folder, merging into whatever is already
   there. A one-line message confirms it.
5. **Hidden as an Area.** The app never treats the Inbox folder as an Area: not on the Areas tab,
   not in focus pickers, Refile/Browse, Review's Area steps, abbreviations or the Integrity Check's
   Area scan.
6. **Renaming in Settings moves the folder.** Saving a new Inbox folder name renames the folder on
   disk. The save is refused if a folder with the new name already exists.
7. **Name clash:** if a real Area already has the Inbox folder's name, the move is skipped. A
   message asks the user to choose a different Inbox folder name in Settings.
8. **Integrity Check** keeps checking the Inbox at its new place. It also reports leftover
   `Inbox.txt`, `Todos/` or `Meetings/` in the base root, which shows an unfinished move.

## 2. Current state (checked in the code, 2026-10-01)

- `domain/settings.ts`'s `resolvePaths` builds `paths.inbox = <base>/Inbox.txt`. Every reader
  addresses the Inbox as `loadProjectFile('inbox', <base>)`.
  `storage/projectFile.ts`'s `dataFileName('inbox')` is `Inbox.txt`, so "item path" for the
  Inbox is simply the base root.
- Linked notes are created under `<itemPath>/Todos|Meetings` (`storage/noteLinks.ts`) and stored
  **relative** (`Todos/x.note`). For the Inbox the item path is the base root, which is how
  `Note/Todos` and `Note/Meetings` came to exist. Relative paths survive a move of the whole set.
- The base root also serves as the reference point for `linkedFile`, which is relative to the base
  root (`storage/linkedFiles.ts`, `domain/integrityCheck.ts`), and for the Browse root of the Files
  pane. **These uses must not change.**
- The variable name `basePath` is overloaded. In screens and storage it usually means "where the
  Inbox is": `InboxMutationContext.basePath`, `inboxItemRef(basePath)`, `fileInboxTask(…, basePath, …)`,
  `GoogleCalendarPanel`'s `basePath` prop and `googleCalendarCopy`. Where `linkedFile` is resolved,
  it really means the base root.
- Area folders are listed raw in three places: `storage/dataCache.ts` (`doRebuildCache`),
  `storage/integrityCheck.ts` and `storage/folderIndex.ts` (no callers left; dead code).
  Everything else (Areas tab, pickers, Browse with `activeOnly`, Review, abbreviations, focus) reads
  the cache. **An Inbox folder that never enters the cache is therefore invisible everywhere else.**
- `domain/settings.ts`'s `findEnclosingItem` would resolve a note under `2 Areas/0 Inbox/...`
  to an Area named `0 Inbox`. App re-orientation and Capture's default destination both use it.
- Native moves exist: `moveFile` (never overwrites), `moveFolder` and `moveFolderMerge` (rejects on
  any top-level name collision before moving anything).
- `storage/closeOut/execute.ts` contains a `rewriteLinks` that rewrites `linkedFile` values that
  match exactly, across cached items plus the Inbox.
- The demo space (`domain/demoSpace.ts`) writes `Inbox.txt` at the root of the demo base.

## 3. Design

### 3.1 Settings and paths (`domain/settings.ts`)

- New setting `inboxFolder: string`, default `'0 Inbox'`, in `GtdParaSettings` and `DEFAULT_SETTINGS`.
  It is a per-profile setting, so it falls into `PROFILE_KEYS` automatically (`domain/profiles.ts`).
  `profiles.test.ts` covers the classification. Older stored settings get the default through the
  existing merge with `DEFAULT_SETTINGS`, so no migration is needed.
- `ResolvedParaPaths` gains:
  - `inboxFolder`: `<areas>/<inboxFolder>`, the folder that is the Inbox's item path;
  - `inbox`: `<inboxFolder>/Inbox.txt` (changed);
  - `legacyInboxFolder`: `<base>`, used only by the migration and the Integrity Check.
- `resolvePaths` gives the **configured** location. The **effective** location (§3.3) is what the
  cache publishes.
- `isInboxFolder(paths, folderPath): boolean` and `validateInboxFolderName(name): string | null`.
  The validation rejects an empty name, `/`, a leading `.`, `..`, and names longer than 60.
- `findEnclosingItem`: a path at or under `paths.inboxFolder` returns `null`. Opening the plugin
  from an Inbox note or lassoing in one therefore behaves as today: Capture defaults to Inbox, and
  re-orientation does not treat it as an Area.

### 3.2 Hiding the folder as an Area

The Areas scan in `storage/dataCache.ts` and `storage/integrityCheck.ts` filters out
`isInboxFolder(paths, entry.path)`. With that, the Inbox folder never becomes a `CachedItem`.
Every cache-based consumer (Areas tab, focus, Refile/Browse via `activeOnly`, Review, abbreviations,
destination candidates) leaves it out with no change of its own. `storage/folderIndex.ts` has no
callers. It gets the same one-line filter for safety, and a note goes on the backlog to delete it.

`storage/createItem.ts`: "Create Area" refuses the Inbox folder's name with the message
"That name is used by the Inbox folder."

### 3.3 Migration (`domain/inboxMigration.ts` + `storage/inboxMigration.ts`)

**Pure planner (domain).** The input is the base-root listing and the listing of the target
Inbox folder (empty if missing). It returns one of:

- `{state: 'none'}`: nothing at the root, so nothing to do;
- `{state: 'blocked', reason}`: the move would break something, so nothing is moved. Reasons:
  - `areaNameClash`: the target folder contains `area.txt` or `project.txt`;
  - `twoInboxFiles`: `Inbox.txt` exists both at the root and in the target;
  - `noteNameClash`: a file name under root `Todos/` or `Meetings/` already exists in the target's
    `Todos/` or `Meetings/` (the same top-level check `moveFolderMerge` does, run up front so
    nothing moves halfway);
- `{state: 'ready', ops}`, an ordered op list:
  1. `ensureFolder` target;
  2. `moveFolderMerge` root `Todos` → target `Todos` (if present);
  3. `moveFolderMerge` root `Meetings` → target `Meetings` (if present);
  4. `rewriteLinks` (see below);
  5. `moveFile` root `Inbox.txt` → target `Inbox.txt` (if present), **last**.

**Executor (storage).** `migrateInboxIfNeeded(paths)` runs at the start of `doRebuildCache`, before
the scan. To keep the extra I/O down to one folder listing, it runs at most once per base root per
session (an in-memory set). Each op is idempotent: an op whose source is already gone and whose
target exists counts as done. A rerun after an interruption therefore resumes, and nothing
needs to be journaled. This is the close-out pattern (design-overview §3, "operation list with a
journal") without a stored journal, because the file system state itself is the journal here.

**Deliberate exception to §3's "shown to the user before running":** per requirement 4 the move
runs automatically. It is a pure relocation of gtdpara's own files, it is checked for collisions
before anything moves, and the user gets a message afterwards.

**Effective Inbox location.** After migration, `DataCache.paths.inboxFolder` is set to:

- the new folder, if `Inbox.txt` is there or there is no `Inbox.txt` at the root;
- otherwise the **root** (`legacyInboxFolder`). This happens when the move was blocked, failed
  (e.g. no write permission), or was interrupted before step 5.

So a blocked or failed move never makes Inbox content "disappear": the app keeps working off the
old location, which is today's behavior. Because `Inbox.txt` moves last, Inbox content stays
readable throughout. The trade-off: until a rerun completes, notes of Inbox items whose folder has
already moved can't be found. This only happens between an interruption and the next start.

**Rule for all callers:** the Inbox is always addressed through `getCachedData().paths.inboxFolder`,
never through `resolvePaths(settings)` directly. That covers `CaptureScreen`, which currently
calls `resolvePaths` and switches to the cache's paths.

**Link rewrite (op 4).** References into the moved folders are rewritten in `Inbox.txt` and in all
cached Projects/Areas (write-through, the same loop shape as close-out's `rewriteLinks`):

- `linkedFile` (base-relative) starting with `Todos/` or `Meetings/` gets the prefix
  `<Areas folder>/<Inbox folder>/`;
- an absolute `notePath` (lasso "link to source note") under `<base>/Todos/` or `<base>/Meetings/`
  is rewritten to the new absolute path;
- relative `notePath`s (`Todos/x.note`) of Inbox items need no change, since they move together
  with `Inbox.txt`.

The pure prefix functions live in `domain/inboxMigration.ts` (`rewriteMovedLinkedFile`,
`rewriteMovedNotePath`). Archived items are **not** rewritten; the Integrity Check reports any
broken link there.

**Messages and logging.** The result (`moved` with counts, `blocked` with reason, `failed`) is kept
in a module variable. `App.tsx` shows it once through the status slot:

- moved: "Inbox moved to 2 Areas/0 Inbox." (the actual names);
- `areaNameClash`: "Inbox not moved: an Area named 0 Inbox exists. Choose another Inbox folder
  name in Settings → Folders.";
- other blocked/failed: "Inbox not moved. Run the Integrity Check for details."

Logging covers every step with counts and no note names (`InboxMigration: …`, DEVELOPMENT-POLICY
§5). The debug bundle gets one line: `inbox location: new | legacy`, `migration: none | moved |
blocked:<reason> | failed`.

### 3.4 Call sites switched from base root to Inbox folder

This is a mechanical rename. Renaming the field in `InboxMutationContext` (`storage/itemMutations.ts`)
from `basePath` to `inboxPath` lets `tsc` list every place that still passes the base root:

- storage: `itemMutations.ts`, `itemMove.ts` (`appendToInbox`), `inboxFiling.ts`
  (`fileInboxTask/Meeting` parameter), `dailyAggregate.ts` / `weeklyAggregate.ts` /
  `monthlyAggregate.ts` (`inboxItemRef(inboxPath)`, which is also what Inbox rows use to resolve
  their notes), `googleCalendarCopy.ts`, `closeOut/context.ts` (the Inbox load only; its
  `linkedFile` prefix stays base), `closeOut/execute.ts`'s `rewriteLinks` (the Inbox load), and
  `integrityCheck.ts` (Inbox target path; `basePath` for `linkedFile` stays base);
- screens/ui: `InboxScreen`, `ReviewScreen`, `DailyView`, `usePlanningScreen` (Week/Month),
  `WeekPlanner`, `MonthView`, `CaptureScreen`, `ProjectDataPanel` and `GoogleCalendarPanel`
  (prop `basePath` → `inboxPath`).

**Not changed:** `linkedFile` resolution (`storage/linkedFiles.ts`, `toLinkedFile`, the
`domain/integrityCheck.ts` input `basePath`) and the Files pane Browse `rootPath: paths.base`.

### 3.5 Renaming the Inbox folder in Settings

The Folders tab gets an **Inbox folder** field directly under Areas, with the full path shown below
it like the other fields. On **Save**, if `inboxFolder` changed:

- if Base or Areas changed in the same save, nothing is moved, the same as for every other folder
  setting today. A message says so;
- otherwise, validate the name (§3.1). If `<areas>/<new>` exists, refuse the save: "A folder named …
  already exists in Areas.";
- if `<areas>/<old>` exists, `moveFolder(old, new)`. On failure, nothing is saved and the error goes
  to the status slot;
- then save the settings and rebuild the cache.

The order is "move first, then save", so settings never point to a folder that wasn't moved.

### 3.6 Integrity Check

A new global check, run once per check rather than per item, called `legacyInboxLeftovers`. A pure
function in `domain/integrityCheck.ts` receives the base-root listing and reports each of
`Inbox.txt`, `Todos/` and `Meetings/` still present at the root. The report text: "Left in the
Note root from the old Inbox location: … (the move to <Areas>/<Inbox folder> did not finish or
was blocked)". The Inbox target uses the effective `inboxFolder`.

### 3.7 Demo space

`domain/demoSpace.ts` writes `2 Areas/0 Inbox/Inbox.txt`, derived from `DEFAULT_SETTINGS` rather than
hard-coded. A demo space created with 0.1.0 is moved by the normal migration when its profile is
active.

## 4. Files

- **New:** `src/domain/inboxMigration.ts`, `src/storage/inboxMigration.ts`,
  `__tests__/domain/inboxMigration.test.ts`, `__tests__/domain/settingsPaths.test.ts`.
- **Changed (domain):** `settings.ts`, `integrityCheck.ts`, `demoSpace.ts`.
- **Changed (storage):** `dataCache.ts`, `integrityCheck.ts`, `folderIndex.ts`, `createItem.ts`,
  `itemMutations.ts`, `itemMove.ts`, `inboxFiling.ts`, `dailyAggregate.ts`, `weeklyAggregate.ts`,
  `monthlyAggregate.ts`, `googleCalendarCopy.ts`, `closeOut/context.ts`, `closeOut/execute.ts`,
  `debugBundle.ts`.
- **Changed (UI):** `App.tsx` (shows the migration message once), `screens/Settings.tsx` (field and
  rename-on-save), and the screens/ui listed in §3.4.
- **Docs:** `docs/user/files-and-folders.md` (layout), `docs/user/settings.md` (Folders tab),
  `CHANGELOG.md` (`[Unreleased]`: Changed + **Upgrade note**), `docs/dev/design-overview.md` (§2.7,
  §2.9, new §2.38; §3 adds the rule "address the Inbox via `paths.inboxFolder`"), and this doc's
  "As built".

## 5. Test plan

**Jest (`npm test`):**

- `resolvePaths`: default and custom `inboxFolder`, trailing slashes; `isInboxFolder`;
  `validateInboxFolderName` edge cases.
- `findEnclosingItem`: a note in `0 Inbox/Todos` gives `null`; a sibling Area `0 Inbox 2` still
  resolves.
- Planner: nothing to do; root with only `Inbox.txt`; all three present; target already partly
  migrated (resume); each blocked reason; op order (`Inbox.txt` last).
- Rewrites: `linkedFile` and absolute `notePath` prefixes; unrelated paths untouched; a path that
  merely starts with `Todos` (`Todos-old/x`) untouched.
- `legacyInboxLeftovers`; demo files at the new path; profiles classification includes
  `inboxFolder`.

**Off-device:** `npx tsc --noEmit` with no new errors, and the App smoke render.

**Device (demo space first, then production):**

- [ ] Install over 0.1.0 with the demo profile active: the message appears once;
      `2 Areas/0 Inbox` holds `Inbox.txt`, `Todos` and `Meetings`; the root no longer has them.
- [ ] Inbox tab shows the same items; opening an existing Inbox todo note and meeting note works.
- [ ] Create a new Inbox todo note: it lands in `0 Inbox/Todos`.
- [ ] Areas tab, focus pickers and Refile/Browse do not show `0 Inbox`.
- [ ] Lasso from a note inside `0 Inbox`: the destination is Inbox.
- [ ] Settings → Folders: rename to `Inbox`: the folder moves and the Inbox tab still works.
      Rename to the name of an existing Area: the save is refused.
- [ ] Clash: create an Area `0 Inbox` in a fresh profile that still has a root `Inbox.txt`: the
      move is blocked, the message appears, and the Inbox keeps working from the root.
- [ ] Integrity Check: clean after the move; reports leftovers in the clash case.
- [ ] Switch back to Production: migrated there too, and the debug bundle shows `inbox location: new`.

## 6. Open points and risks

- **Links inside notes.** Supernote links embedded *inside* `.note` files (e.g. a link to an Inbox
  todo note from another note) store absolute paths and are not rewritten. This is rare;
  accepted.
- **Archived items** are not link-rewritten (§3.3); the Integrity Check reports them.
- **Already in the code, not caused by this change:** refiling an Inbox item that has a linked note
  does not move the note, so its relative `notePath` points to the wrong folder afterwards
  (seen in `storage/inboxFiling.ts`, not yet confirmed on the device).
  This goes on the backlog and is not fixed here.
- `storage/folderIndex.ts` has no callers. Deleting it goes on the backlog.
- Version: behavior and file layout change, so this ships as a **minor** release (0.2.0).

## 7. As built (2026-10-01)

Implemented as designed, with these details:

- **Settings/paths** (`domain/settings.ts`): `inboxFolder` setting; `ResolvedParaPaths.inboxFolder`,
  `inbox`, `legacyInboxFolder`; helpers `withInboxFolder`, `isInboxFolder`, `isUnderInboxFolder`
  (both return false while the Inbox is at the legacy location, so the base root is never mistaken
  for "inside the Inbox"), `validateInboxFolderName`. `findEnclosingItem` returns null inside the
  Inbox folder.
- **Planner** (`domain/inboxMigration.ts`): triggered only by a root `Inbox.txt`, so a `Todos` or
  `Meetings` folder created in `Note` by hand later is never touched. Ops are planned from the
  file state; `rewriteLinks` is idempotent (a rewritten link no longer matches).
- **Executor** (`storage/inboxMigration.ts`): `migrateInboxIfNeeded` (outcome kept per base root,
  so profiles with different bases each get their own move), `effectiveInboxFolderFor`,
  `hiddenAreaFolderFor` (the configured folder, except when it is a real Area, i.e. blocked by
  `areaNameClash`), `renameInboxFolderForSave`, `takeInboxMigrationNotice`. The link rewrite
  works on the files directly (the cache is not built yet at that point): root `Inbox.txt` plus
  every Project/Area folder that has its data file.
- **Cache** (`storage/dataCache.ts`): the rebuild runs the move, publishes the effective location,
  skips the hidden folder in the Areas scan; new `resolveLivePaths(settings)` for storage code
  (close-out context/executor, Integrity Check).
- **Renaming in Settings** also forgets the session's outcome for that base, so a move that was
  blocked by an Area name is tried again with the new name on the next rebuild.
- **Status slot**: `App.tsx` publishes `app.inboxMigration` (global scope): success "Inbox moved
  to 2 Areas/0 Inbox.", or a warning for blocked/failed.
- **Debug bundle**: `inbox location: new | legacy | unknown · migration: none | moved |
  blocked:<reason> | failed`; `inboxFolder` counts towards "folders custom".
- **Tests**: `__tests__/domain/settingsPaths.test.ts`, `__tests__/domain/inboxMigration.test.ts`
  (planner, rewrites, effective location, leftovers), `__tests__/storage/inboxMigration.test.ts`
  (move, link rewrite through the real project-file parser, blocked case, rename, against an
  in-memory file system), demo-space test updated.

Verified off-device: `npx tsc --noEmit` clean, `npm test` 102/102, App smoke render (throwaway,
not committed). Still open: the device checklist in §5, and the Folders tab with one more field
checked against the A5 X budget on the device.
