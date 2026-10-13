# Technical design: Note setups - finishing 0.15.0 (steps 8-10)

Status: **approved** (2026-10-13). Release: **0.15.0**, branch `feature/note-setups`.
Builds on `docs/dev/history/technical-design-note-setups.md` (steps 0-7, its §12 As built and
§13 page order). Kept as its own document so the main design's As built stays untouched while
these steps are built.

Three small, independent changes, one commit each, then a beta and the release.

## 1. Step 8 - `{name}` and `{abbr}` in note names

### 1.1 Requirements (decided)

- Two more placeholders for every note name (a setup's notebook name, a Loop setup's loop note
  name, the Default's notebook):
  - `{name}` - the name of the Project or Area the item belongs to (its folder name);
  - `{abbr}` - that Project's or Area's abbreviation (`abbrev:`), or its name when it has none.
- Example: `{abbr} {tag} {subtag} {year}` → `LP sparring peter 2026.note`.
- Renaming a Project/Area or changing its abbreviation: new pages go to a file with the new
  name; existing pages stay where they are and their links keep working (same as `{year}` at New
  Year). Accepted, documented on the help page.
- Not in scope: a "Project/Area name" **piece** on the page.

### 1.2 Design

- `domain/sharedNotePages.ts`: `SharedFileNameInput` gains `itemName: string` and
  `itemAbbrev: string` (`''` when unknown); `renderSharedFileName` replaces `{name}` and `{abbr}`
  (case-insensitive like the others; `{abbr}` falls back to `itemName`);
  `SHARED_FILE_NAME_PLACEHOLDERS` gains both, after `{subtag}` - the Settings chips follow.
- The owner is the item's Project/Area (`itemPath`): name = its folder's base name, abbreviation
  from the cached item (`findCachedItem(itemPath)?.abbrev`). Resolved in storage where the file
  name is rendered today (`storage/noteTargets.ts`, `storage/loops.ts` `loopNoteName`), passed
  into the pure functions (`domain/loops.ts` `loopNoteBaseName` gains the same two inputs).
- Sanitizing stays as is (`sanitizeFileNameComponent`), so a Project name with characters a file
  name can't hold is cleaned the same way as a subtag.
- Settings preview (`NoteNameField` / setup page): uses a sample, "Project" and "PRJ", like the
  sample subtag.
- Inbox items never get notebooks, so no Inbox case.

### 1.3 Tests

- Jest: `{name}`, `{abbr}` with and without an abbreviation, mixed case, both missing (`''`),
  together with date placeholders and an empty subtag (no double spaces), loop note names.
- Device: a setup named `{abbr} {tag} {subtag} {year}` in a Project with an abbreviation and
  one without; the first-note confirm shows the expected file names.

## 2. Step 9 - one Files tab on the Project/Area page

### 2.1 Requirements (decided)

The left pane's tabs (`screens/ItemDetail.tsx` → `ui/FileBrowserPane.tsx`) overflow on a Project
with an Area: Threads · Loops · Project Files · Resources · Area Files. Today:

| Page | Tabs |
|---|---|
| Project, no Area | Threads · Loops · Project Files · Resources |
| Project with Area | Threads · Loops · Project Files · Resources · Area Files |
| Area | Threads · Projects · Area Files · Resources |

New: **three tabs everywhere** - Threads · Loops · **Files** on a Project, Threads · Projects ·
**Files** on an Area. Inside Files a second, smaller row picks the place:

- Project: **Project** · **Area** (only when assigned) · **Resources**
- Area: **Area** · **Resources**

Files opens on the page's own files. Everything else behaves as today:

- Arming (link a file, refile, assign an Area) switches to Files and to the right place by
  itself, and back to Threads when it ends.
- Places that can't be picked during an arm are greyed out, as today.
- Browse ("Other Projects/Areas ›", the Project Files root's `alternate`) stays where it is.
- The Area page's Projects tab keeps its arming root (Project Files of its Projects).

### 2.2 Design

- The roots stay what they are (`fileBrowserRoots` in `ItemDetail.tsx`, unchanged keys
  `project` / `area` / `resources`, unchanged `alternate`, `disabled`, `defaultSubfolder`).
- `ui/FileBrowserPane.tsx` gets an optional grouping: `groupLabel?: string` (here `"Files"`).
  When set, all `roots` share **one** top tab with that label, and the pane shows a second
  `MiniTabs` row with the roots' own labels (short labels via a new optional
  `FileBrowserRoot.shortLabel`: "Project", "Area", "Resources") above the list. Extra tabs
  (`extraTabs`) stay top-level. Without `groupLabel` the pane behaves exactly as today
  (InboxScreen and other users are unchanged).
- Active state: the pane already keeps the active root key; the top tab is "Files" whenever
  the active key is one of the grouped roots. Arming that targets a root (`linkTarget.root`)
  selects Files and that root - the existing auto-switch effect, now selecting the group too.
- Height: the second row costs one `MiniTabs` row (≈ 45 dp); the list below is self-measuring
  (`PagedSection`), so it simply gets one row less. Budget per design-device-rendering §5-6.
- Labels: "Files" plus the place names; help pages that say "Project Files", "Area Files" or
  "Resources tab" are updated (grep `docs/user`).

### 2.3 Tests

- Smoke render: Project without Area, Project with Area, Area - three top tabs each, the right
  places inside Files.
- Jest where logic is pure (which top tab is active for an active root key; which places show).
- Device: all three page kinds; link a file from a todo (Files opens on Project); refile
  (Browse); assign an Area (Browse, other places greyed); Area page → Projects tab arming.

## 3. Step 10 - the About page shows the build's version

### 3.1 Failure (found on the device)

A 0.15.0 beta build (file name, Supernote plugin list and changelog all say 0.15.0) shows
**"gtdpara 0.14.0"** as the title of Settings → About.

### 3.2 Root cause

`screens/settings/AboutTab.tsx` renders `gtdpara {BUILD_INFO.version}`. `version` is
`package.json` `version` - the **last released** version (0.14.0) until `scripts/release.ps1`
sets the new one. The label of a build towards the next release is in `BUILD_INFO.label`
(`0.15.0-beta+ba1ca43`), with `nextVersion` and `stage`; the plugin list shows the packaged
`versionName` built from the same values.

### 3.3 Fix

- The title shows the version the build is: a release → `gtdpara 0.15.0`; a build towards a next
  version → `gtdpara 0.15.0 beta` (or `alpha`); any other development build →
  `gtdpara <label>`. One small pure function next to the build info consumers
  (`domain/buildVersionText.ts` or in an existing domain file about versions), with Jest tests
  for the three cases. The commit line below stays as it is.
- Check the other places that show `BUILD_INFO.version` to a user (debug bundle header, stale
  build banner, What's new) and use the same function where they mean "this build".
- CHANGELOG `[Unreleased]` → Fixed: "Settings → About shows the version of the installed build
  (a beta of 0.15.0 showed 0.14.0)."

## 4. Then

- Full device checklist: `technical-design-note-setups.md` §9.2 and §13.4, plus §1.3, §2.3 and
  §3 above.
- Beta build, Tilman's own use for a few days, then `scripts/release.ps1` for 0.15.0.
- Each step gets an "As built" note at the end of **this** document if anything differs.

## 5. As built

### Step 8

- The two inputs are one type, `NoteOwnerNames` (`itemName`, `itemAbbrev`) in
  `domain/sharedNotePages.ts`; `SharedFileNameInput` extends it and `loopNoteBaseName` takes it
  as its fourth argument.
- Resolved in one small storage helper, `storage/noteOwner.ts` `noteOwnerNames(itemPath)`,
  used by `storage/noteTargets.ts`, `storage/loopNotes.ts` and `storage/loops.ts` (a helper in
  `noteTargets.ts` would have made `loops.ts` → `noteTargets.ts` → `loopNotes.ts` → `loops.ts` a
  cycle). The name is the base name of `itemPath`, so it is known even for an item not in the
  cache; the abbreviation comes from the cache.
- Loop note renames and the note carried along when a todo becomes a loop use the owner too.
  A rename computes the old and the new file name with the current abbreviation: after an
  abbreviation change the old note is not found under its old name and stays where it is
  (as §1.1 accepts for notebooks).
- The placeholder chips wrap to a second row on the setup page (8 chips); about 30 dp more.
