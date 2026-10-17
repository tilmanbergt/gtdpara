# Technical design: Home notebooks (0.17.0)

Status: **approved** (Tilman, 2026-10-17). Release **0.17.0**, branch `feature/home-notebooks` from `main` after Engage 0.16.0 is released.
Requirements: claude.ai project doc `claude/feature-home-notebooks.md` (v2, decided 2026-10-17), summarized in §1. UI draft: canvas "gtdpara Home notebooks — UI draft" (https://claude.ai/artifact/3cRfE1wb95kCBcsPfbnFni).
Builds on: `docs/dev/history/technical-design-note-setups.md` and `docs/dev/history/technical-design-note-setups-finish.md` (Default notebook, `{name}`/`{abbr}`), `docs/dev/history/technical-design-shared-note-pages.md` (notebooks, anchors, plan-then-confirm), `docs/dev/history/technical-design-loops.md` (first page of a notebook), `docs/dev/history/technical-design-projects-findable-notes.md` (headings, keywords), `docs/dev/history/technical-design-files-0.6.md` (statFiles), `docs/dev/history/technical-design-integrity-check.md`, `docs/dev/history/technical-design-engage.md`.

## 1. Requirements (decided)

- **Home notebook** of a Project/Area = the **Default setup's notebook** rendered for that item (name template + folder of `noteSetupDefaults.notebook`). Implicit, no per-item link. Default without notebook → the whole feature is hidden. Never for the Inbox.
- **Notebook icon** (plain = exists → open; with + = missing → create after a confirm) on: Projects tab and Areas tab rows (all statuses), the Project/Area page header (next to Engage ›), Week focus cards, Daily focus rows. **Not** on Daily's todo group headers (each todo has its own link), task/meeting rows, Inbox, Review.
- **Opening**: without a specific page, the notebook opens on the page **last viewed in Supernote** (`openFile(path, -1)`). A heading tapped in Contents opens that page. A notebook just created opens on its first page.
- **New year**: this year's file missing, earlier year's present → status line **Create 2027** (default) · **Open 2026** · ✕.
- **Creating**: plan-then-confirm in the status line; the new notebook gets a **Home page** as page 1, laid out like a loop's First page from a template: the Project/Area **name**, its **Scope** and its **latest monthly and weekly goals**.
- **Notebook tab** on the Project/Area page's left pane: Threads · Loops/Projects · **Notebook** · Files. Shows the notebook name + Open, **chips for every year present** (current first), and **Contents** (headings in page order; tap = open at that page). No notebook yet: the file it will be + Create notebook.
- **Contents** (experimental, first test): pages gtdpara made are titled from their item (no lookup); other headings are read from the typed textbox they cover; handwritten headings show as "Handwritten heading". Cached per file, refreshed when the file changed. Can be switched off.
- **Engage**: inside any note of the Project/Area folder Engage already shows its todos (`storage/noteOwnerOf.ts` rule 3). New: when the owner is a Project/Area and the open file is not its home notebook, one line **"Go to <notebook> ›"**.
- **Rename safety net**: the item's name is kept in its project file. When the folder was renamed elsewhere:
  - the **Integrity Check** (where it is today, Settings) reports it;
  - **on entering the Project/Area page** the status line offers it directly: "Leadership is now People Leadership. Rename Leadership 2026.note to People Leadership 2026.note?" **Rename** · **Not now**. Rename moves this year's notebook and updates the links pointing into it. Earlier years keep their names.

## 2. Current state (what exists)

| Need | Exists in | Notes |
|---|---|---|
| Rendering the Default notebook's name for an item | `storage/noteTargets.ts` `place()` (private), `domain/sharedNotePages.ts` `renderSharedFileName`, `storage/noteOwner.ts` `noteOwnerNames` | Only reachable through `placeNoteCandidates`, per todo/meeting. |
| Creating a notebook with a first page | `storage/sharedNotePages.ts` `ensureSharedNoteFile`; `storage/loopNotes.ts` `ensureLoopNoteFile` (+ page-1 keyword); `storage/meetingNoteContent.ts` `populateLoopNotePage` → `populatePage` | A loop's First page is the model for the Home page. |
| Opening a file | `supernote/fileSystem.ts` `openPath(path, page = -1)` | `-1` = last viewed page (SDK `openFile`). |
| Plan-then-confirm / two-choice status | `domain/noteCreationPlan.ts` (`NoteCreationPlan` `new-shared-file`), `ui/useNoteCreateConfirm.ts`, `ui/useStatusChoice.ts`, texts in `domain/fileChangeText.ts` | |
| Batch existence + mtime | `supernote/fileSystem.ts` `statFiles`, `storage/dataCache.ts` wrapper | |
| Folder change notifications | `supernote/fileSystem.ts` `subscribeFolderChanges` | |
| Page keywords of a notebook | `storage/sharedNotePages.ts` `readAllKeywords` (keywords + total pages) | Item pages: `meetingPageKeyword`, `todoPageKeyword`; loop page `loop <tag>`. |
| Headings | `supernote/noteTitles.ts` (`ElementWithTitle`, build), `getElements` | No `getTitles` wrapper yet; SDK `PluginFileAPI.getTitles(notePath, pages)` returns `Title{page, X, Y, width, height, style, controlTrailNums}`. Textbox text: `Element.textBox.textContentFull`. |
| Left-pane tabs | `ui/FileBrowserPane.tsx` `extraTabs` (shown before the Files group), `screens/ItemDetail.tsx` | Threads, Loops/Projects are extraTabs. |
| Page layouts | `domain/pageLayout.ts` (`PageKind = 'meeting' \| 'todo' \| 'first'`, `PIECE_PAGES`, `DEFAULT_PIECE_TYPES`, `renderPieceText`), Default pages in `noteSetupDefaults.pages`, Settings `PageRows.tsx` (`DEFAULT_PAGE_KINDS`) | |
| Front matter | `domain/markdown.ts` `parseFrontMatter`/`FrontMatterFields`, `storage/projectFile.ts` `saveFrontMatter`, `storage/dataCache.ts` `frontMatterOf`/`updateItemFrontMatter` | Unknown keys survive in `frontMatterExtraLines`. |
| Goals | `## Weekly Goals` / `## Monthly Goals` spans on the cached item; "Last goal" display in `ui/ItemFocusPanel.tsx` | |
| Integrity Check | `domain/integrityCheck.ts` (registry of per-item checks with `IntegrityCheckIO`), `storage/integrityCheck.ts` | Report-only. |
| Engage context | `storage/noteOwnerOf.ts` `noteContextOf` | Rule 3 = folder fallback. |
| Item rename inside gtdpara | none | Renames only happen outside gtdpara. |

Verify these names against the code before relying on them; where they moved, follow the code and note it in "As built".

## 3. Design

### 3.1 The home notebook (domain + storage)

**`domain/homeNotebook.ts`** (new, pure):
- `homeNotebookName(input: {template: string; itemName: string; itemAbbrev: string; date: string}): string` - `renderSharedFileName` with empty `tag`/`subtag`, `fallbackName` `'Notes'`, then `sanitizeFileNameComponent` (`domain/fileName.ts`). `storage/noteTargets.ts` `place()` calls this for the Default, so there is **one** rendering of the Default notebook's name.
- `hasYear(template)`: `{year}` present and none of `{quarter}`/`{month}`/`{day}`. Only then are there "years".
- `homeNotebookYears(input, existingFileNames, thisYear)`: renders the name for `thisYear` down to `thisYear - 10` (with `date` = `<year>-01-01`) and returns `{year, fileName, exists}` for this year plus every earlier year whose file exists, current first. Without `hasYear`: one entry (current).
- `HomeNotebook` type: `{itemPath; folder (absolute); fileName; absolutePath; exists; years: Array<{year; absolutePath; exists}>}`.
- `HOME_PAGE_KEYWORD = 'home'`.

**`storage/homeNotebooks.ts`** (new):
- `homeNotebookOf(item: CachedItem, settings): HomeNotebook | null` - null when the Default has no notebook or the item is the Inbox. Folder = item path + `notebook.folder`. `exists` from the state cache below; `years` filled on demand (`loadHomeNotebookYears`, one `listFolderEntries` of the folder).
- **State cache**: `Map<absolutePath, boolean>` filled by `refreshHomeNotebookStates(items)` with **one `statFiles` call** for all listed items; refreshed on `subscribeCache`, `subscribeFolderChanges` (a created/moved file in that folder) and after gtdpara's own create/rename. `useHomeNotebookState(items)` (`ui/useHomeNotebooks.ts`) exposes it to screens; screens never poll.
- `openHomeNotebook(nb, page?: number)` - `openPath(absolutePath, page ?? -1)`.
- `createHomeNotebook(item, settings)` - §3.2, then `openPath(path, 0)`. Creating notes needs the plugin to have been opened from a note (known host limit); the same guard and message as the existing note creation.
- `planHomeNotebookTap(nb)` (pure, in the domain file): exists → `open`; missing and an earlier year exists → `choose-year` (Create <this year> · Open <last year>); missing otherwise → `create`.

### 3.2 Home page (page 1 of a home notebook)

- `PageKind` gains **`'home'`**, a page of the **Default only** (`pageKindsOf` for setups unchanged). Settings › Note setups › Default lists it as **Home page** (`DEFAULT_PAGE_KINDS` + `PAGE_KIND_LABELS`), only when the Default has a notebook.
- Two new piece types, offered only on `home` (`PIECE_PAGES`):
  - **`scope`** - the item's Scope text (`## Scope`); empty → piece skipped.
  - **`goals`** - the item's **latest monthly goal and latest weekly goal** (the most recent entries of `## Monthly Goals` / `## Weekly Goals`, whatever period they belong to), one line each with their period ("October 2026: …", "Week 43: …"; labels via `domain/dateFormat.ts`, the same wording as the "Last goal" display in `ui/ItemFocusPanel.tsx`); none → skipped.
- `home` also offers `title` (the item name, Heading on by default) and `text` (static texts). `DEFAULT_PIECE_TYPES.home = ['title', 'scope', 'goals']`.
- `PieceRenderContext` gains `scope?: string`, `goals?: string`; `renderPieceText` handles both.
- Written **once, at creation** (like a loop's First page). It is the user's page afterwards; nothing refreshes it.
- Page-1 keyword **`home`**, so Contents and the page order recognize it.
- `storage/meetingNoteContent.ts`: `populateLoopNotePage` and the new `populateHomePage` share one helper, `populateFirstPage(notePath, layout, ctx, linked, settings)`.
- **Also when the Default notebook is created by a todo/meeting note** (the existing `new-shared-file` plan in `resolveItemNote`): the file gets the Home page first, the item's page after it - one path to a new home notebook, whichever tap creates it.
- **Page order** (`domain/pageOrder.ts`, Timeline): a page with the `home` keyword is fixed at the front like a loop's page 1; item pages are placed after it. Check how the loop page is handled there and extend the same rule.
- **Settings completion**: profiles without `noteSetupDefaults.pages.home` get the seeded layout on load (the `completeMigratedSettings` pattern), so the first home notebook already has the page. Upgrade note in CHANGELOG.

### 3.3 Notebook icon

- `ui/icons.tsx`: `NotebookIcon({size, color, plus})` - the outlined notebook from the UI draft, a small circled + when `plus`.
- `ui/HomeNotebookButton.tsx` (new): props `item`, `variant: 'icon' | 'labeled'` ("Notebook" text in the header), hidden when `homeNotebookOf` is null. Tap → `planHomeNotebookTap` →
  - `open` → `openHomeNotebook(nb)`;
  - `create` → `useNoteCreateConfirm` with a `new-shared-file` plan (existing text "Create <file> in <folder>?") → `createHomeNotebook`;
  - `choose-year` → `useStatusChoice` with **Create 2027 · Open 2026** (texts in `domain/fileChangeText.ts`).
- Touch target ≥ 44 × 36 px, grayscale. Row heights: `ItemsList` rows get `max(text height, ICON_ROW_MIN)` in `entryHeight`, budgeted per `docs/dev/design-device-rendering.md` §5-6; Week card header and Daily focus row fit 36 px.
- Placement: `screens/ItemsList.tsx` (row end, own Pressable; the row still opens the page), `screens/ItemDetail.tsx` header (before `EngageButton`), `ui/PeriodFocusPanel.tsx` card header (between `FocusBadges` and ✕), `ui/DailyFocusPanel.tsx` via `ui/FocusedItemRow.tsx` (optional `accessory` slot before ✕ - FocusedItemRow is shared with Review, which passes none).

### 3.4 Notebook tab (`screens/notebook/NotebookTab.tsx`, new)

- An `extraTabs` entry after Threads and Loops/Projects in `ItemDetail.tsx`: label **Notebook**, so the row reads Threads · Loops · Notebook · Files. Not an arming target.
- Content, top to bottom (PagedSection for the list, self-measured height):
  1. notebook icon, file name, **Open** (opens the last viewed page);
  2. year chips (from `loadHomeNotebookYears`): current first; a missing current year shows as "+ 2027" and taps into the create flow; the selected chip decides which file Open and Contents use;
  3. **Contents** of the selected file (§3.5); a row = "p.<n>  <text>", tap → `openHomeNotebook(nb, page)`;
  4. missing and no earlier year: "No home notebook yet. It will be <file> in this <Project/Area>'s folder." + **Create notebook**.
- `requestEinkRefresh` when Contents arrives (content appears without a tap).

### 3.5 Contents

**`supernote/fileSystem.ts`**: `getTitles(path, pages): Promise<NoteTitle[]>` (wrapper like `getKeyWords`, permission check, logs counts only).

**`domain/notebookContents.ts`** (new, pure): `buildContents({keywords, titles, textByTitle, items})` →
`ContentsEntry {page; y; text; source: 'home' | 'meeting' | 'todo' | 'loop' | 'typed' | 'handwritten'}` sorted by page, then y:
- a page with the `home` keyword → one entry, the item's name;
- a page whose keyword is an item page of this item (`meetingPageKeyword`/`todoPageKeyword` of a cached meeting/todo) → one entry from the item (meeting: date + title; todo: text); **its titles are not looked up**;
- a loop page keyword → the loop's name;
- every title on any other page → `textByTitle` (typed) or "Handwritten heading".

**`storage/notebookContents.ts`** (new): `loadContents(absolutePath)`:
1. `statFiles([path])` → mtime; cache hit (`Map<path, {mtimeMs, entries}>`, in memory, rebuildable) → return.
2. `readAllKeywords(path)` (one call, gives `totalPages`), `getTitles(path, allPages)` (one call).
3. Pages that have titles and no gtdpara keyword → `getElements(page)` once per such page; for each title, the element whose `numInPage` is in `controlTrailNums` and has `textBox` → `textContentFull` (first line, trimmed). Elements recycled (`recycleElements`).
4. `buildContents`, store, return. Errors → logged; the status slot says "Contents can't be read right now."; Open still works.
- Switch: Settings › Advanced **"Notebook contents"** (default on), device-wide, classified in `domain/profiles.ts`; off → the tab shows name, years and Open only. Debug bundle line: `homeNotebooks: on/off, contents on/off, cached n`.
- Logs: counts and ms only, never heading texts (client names).

### 3.6 Engage "Go to"

- In the Engage view model (`screens/engage/useEngageView.ts` / `EngageOverlay.tsx`): when the current owner is `{kind:'item'}`, its home notebook exists, and the open note's path is neither it nor one of its earlier years, the view gets `goTo: {label: "Go to <fileName>", path}` (text in `domain/engageText.ts`).
- Rendered as one line above the collapsed Quick Add; tap → `openPath(path, -1)` and the panel closes (as when picking a todo with a note). Missing notebook → no line (Engage never creates files).

### 3.7 Rename safety net

**Stored name**: front matter key **`name:`** (`FrontMatterFields.name: string | null`, parsed and written by `domain/markdown.ts`; older versions keep it as an extra line). Written:
- when gtdpara creates the home notebook (§3.2, either path);
- when a home notebook is opened from gtdpara and `name:` is missing (backfill, one `saveFrontMatter`, write-through).
No mass migration. Upgrade note: "gtdpara now notes each Project's and Area's name in its project file, to notice renamed folders."

**Detection** - `domain/homeNotebook.ts` `renameCase(...)`:
- `stored` set, ≠ folder name, the notebook rendered with `stored` (this year) **exists**, the one with the folder name **doesn't** → `{from, to}`;
- both exist → `{conflict}` (report only);
- the old one doesn't exist → nothing to move: `name:` is updated the next time the item's front matter is written anyway (no extra write).

**Where it shows**:
- **Integrity Check**: a new per-item check `homeNotebookRenamed` in the registry (uses `IntegrityCheckIO.fileExists`), message "Folder renamed to <to>; its notebook is still <from>.note" / the conflict text. Report-only, like every check.
- **Project/Area page**: on mount, `ItemDetail` runs the same detection (two `fileExists`) and, if it applies, `useStatusChoice`: "<from> is now <to>. Rename <from file> to <to file>?" **Rename** · **Not now**. Not now is remembered for this session only (in-memory set), so it asks again after gtdpara restarts.

**Rename** (`storage/homeNotebookRename.ts`, new) - confirmed before, reported after (`domain/fileChangeText.ts`):
1. `moveFile(old, new)` - this year's file only; earlier years keep their names.
2. Rewrite links that point into the old file, through the existing write-through mutations (`saveTasks`/`saveMeetings` + `updateItemTasks`/`updateItemMeetings`), span-scoped. The pure part (`relinkNotePath(notePath, itemPath, oldRel, newRel, oldAbs, newAbs)`) lives in `domain/homeNotebook.ts`:
   - this item's todos/meetings whose `notePath` file part (`parseSharedNoteAnchor` / `parsePageAnchor` / own path) equals the old relative file → new relative file, keyword/page unchanged;
   - other items and the Inbox with an **absolute** link (page link `/…#page=n`) to the old file → new absolute path;
   - open marks whose note is the old file (`storage/markStore.ts`) → new path.
3. `name:` := folder name. Refresh the state cache. Status: "Renamed to <file>; <n> links updated."
4. If step 2 fails after the move, the status names what was not updated; the Integrity Check's missing-note checks report the leftovers. No automatic undo.

### 3.8 Settings

- `noteSetupDefaults.pages.home` (seeded, §3.2) - part of the existing per-profile Default.
- `notebookContentsEnabled: boolean` (default `true`, Advanced, device-wide), in `DEFAULT_SETTINGS` and `domain/profiles.ts`.
- The Default's setup page: one line under its Notes row when it uses one notebook: "This is each Project's and Area's home notebook." (`domain/noteSetupText.ts`).

## 4. Files

New: `domain/homeNotebook.ts`, `domain/notebookContents.ts`, `storage/homeNotebooks.ts`, `storage/notebookContents.ts`, `storage/homeNotebookRename.ts`, `ui/HomeNotebookButton.tsx`, `ui/useHomeNotebooks.ts`, `screens/notebook/NotebookTab.tsx`.
Changed: `domain/pageLayout.ts` (PageKind `home`, pieces `scope`/`goals`), `domain/noteSetups.ts` (seed), `domain/noteSetupText.ts`, `domain/markdown.ts` (`name:`), `domain/integrityCheck.ts` (+ check), `domain/fileChangeText.ts`, `domain/pageOrder.ts`, `domain/engageText.ts`, `domain/settings.ts` + `domain/profiles.ts`, `storage/noteTargets.ts` (use `homeNotebookName`), `storage/meetingNoteContent.ts` (`populateFirstPage`, Home page on Default-notebook creation), `storage/loopNotes.ts` (shared first-page helper), `supernote/fileSystem.ts` (`getTitles`), `ui/icons.tsx`, `ui/FocusedItemRow.tsx` (accessory), `ui/DailyFocusPanel.tsx`, `ui/PeriodFocusPanel.tsx`, `screens/ItemsList.tsx`, `screens/ItemDetail.tsx`, `screens/engage/*` (Go to), `screens/settings/noteSetups/PageRows.tsx`, `screens/settings/AdvancedTab.tsx`, `storage/debugBundle.ts`.
Docs: help pages (Projects/Areas, Project page, Note setups, Engage, Integrity Check), CHANGELOG (New; Experimental: Contents; Upgrade notes: `name:`, Home page), README features, `docs/dev/design-overview.md` (home notebook concept, new building blocks), demo space (one Project with a home notebook and a few headings).

## 5. Steps (one commit each, `npm run check` green after each)

- **S0** Diagnostic (log only, behind Debug logging): on the open note, `getTitles` counts + ms, and per title whether a covered textbox was found. No checkpoint stop; Tilman runs it with the S2 build.
- **S1** `domain/homeNotebook.ts` + `noteTargets` on it (Jest: names, years, sanitizing, no-year templates, tap plan).
- **S2** `storage/homeNotebooks.ts`, state cache, `HomeNotebookButton`, icon on ItemsList + ItemDetail header; open / create (without Home page yet) / year choice. **Checkpoint A** (device).
- **S3** Home page: PageKind `home`, `scope`/`goals` pieces, settings seed, `populateFirstPage`, page order, creation from both paths, Settings row.
- **S4** Icons on Week and Daily.
- **S5** Engage "Go to".
- **S6** Notebook tab (name, Open, year chips, Create).
- **S7** Contents (`getTitles`, `buildContents`, cache, switch). **Checkpoint B** (device).
- **S8** Rename: `name:` field + backfill, detection, Integrity Check entry, page status choice, `homeNotebookRename`.
- **S9** Docs, demo space, debug bundle line, "As built". Then beta.

## 6. Test plan

**Jest** (domain): `homeNotebookName` (placeholders, `{abbr}` fallback, sanitizing, empty render → `Notes`); `homeNotebookYears` (gaps, no `{year}`, `{month}` templates → one entry); `planHomeNotebookTap`; `renderPieceText` for `scope`/`goals` (latest goals of older periods, none → ''); `buildContents` (home/item/loop/typed/handwritten, sort by page then y, gtdpara pages never use titles); `renameCase` (rename, conflict, nothing); front matter `name:` round-trip and old files without it; `relinkNotePath` (anchor, page link, own path, absolute link from another item, unrelated paths untouched); page order with a `home` page; settings completion adds `pages.home`.
Smoke renders: ItemsList with icons, ItemDetail with the Notebook tab, NotebookTab empty/years/contents, Engage with Go to.

**Device checklist** (demo space):
1. Projects/Areas tabs: icon plain/with + correct; tap opens on the last viewed page; + → confirm → created with Home page (name, scope, goals) and opened on page 1.
2. A todo note into the Default notebook of a Project without one → Home page is page 1, the todo's page 2.
3. Header button, Week card, Daily focus row: same behavior; Daily group headers have no icon.
4. A `{year}` template with last year's file present and this year's missing (rename a test file to last year's name): Create <year> · Open <last year>.
5. Notebook tab: chips for each existing year; Contents lists the Home page, item pages from their items, a typed heading made by hand, a handwritten heading as "Handwritten heading"; tap opens that page; edit the notebook, come back → Contents refreshed; switch off → no Contents.
6. Engage in a todo's own note of an Area → "Go to <Area> <year> ›" opens the notebook and closes; inside the notebook → no line.
7. Rename an Area folder in the file manager → entering its page offers Rename; Rename moves the file, links still open their pages; Not now → asked again after restart; Integrity Check lists it.
8. Default set to own note per item → no icons, no Notebook tab, no Go to.

## 7. Decided after review (2026-10-17)

- Typed headings made by hand are expected to cover their textbox like gtdpara's own (`controlTrailNums` = its `numInPage`). Not a gate: S0 only logs what it sees; a heading that turns out otherwise shows as "Handwritten heading" and is dealt with then.
- Goals piece = the latest monthly and the latest weekly goal (§3.2).
- Earlier years' notebooks keep their names on rename.

## As built

Filled in step by step; differences from §3 and the reason.

- **`getTitles`** lives in `supernote/noteTitles.ts`, not `supernote/fileSystem.ts`: that file is at its code-health baseline and may not grow.
- **S0 diagnostic**: `storage/noteTitlesDiagnostic.ts`, called from `App.tsx`'s `reorient()` on the note the plugin was opened from, only while Debug logging is on. One line `NoteTitles: open note` with pages, titles, `getTitles` ms, and per title `p<page>:yes|own|no` (a covered textbox found; `own` = gtdpara's marker). Counts, ms and yes/no only.
- **Tap flow** is its own hook, `ui/useHomeNotebookTap.ts` (one hook per file); `ui/HomeNotebookButton.tsx` is only the control and takes the notebook (`nb`) and `onPress` instead of the item, so a list has one tap hook per screen rather than one per row.
- **`HomeNotebook`** also carries `itemAbbrev` (the years are rendered with the same `{abbr}`), `relativeFile` and `known` (the state cache has an answer). Until `known`, the icon's space stays empty, so no wrong icon is drawn and the row doesn't reflow. `loadHomeNotebookYears(nb, settings)` returns absolute paths; `openHomeNotebook(path, page?)` takes a path, because a year chip opens another year's file; `createHomeNotebook(nb, absolutePath)` creates the given year's file.
- **State cache refresh** also runs when a screen is shown again, and on a tap (existence is checked again before open or create). A native build without `statFiles` falls back to one `fileExists` per file.
- **Create confirm** is the existing note confirm for a `new-shared-file` plan without a setup name: "new file <file>.note" · Create, detail "Creates <full path> with a first page for this item." The year choice reads "No <notebook> yet." · Create <year> · Open <year> (texts in `domain/fileChangeText.ts`, as in the UI draft). After a create, "Created <file>.note in <folder>." shows in the status slot.
- **Row height** on the Projects/Areas tabs: with the feature on, the name's line estimate uses the column width minus the icon (44), and a row is at least 36 tall.
- **Home page creation** has one file helper, `storage/homeNotebooks.ts`'s `ensureHomeNotebookFile` (file with the Home page's background, `home` keyword on page 1), used by both paths. The icon's create (`createHomeNotebook`) lives in `storage/homeNotebookCreate.ts`, because filling the page (`storage/meetingNoteContent.ts`'s `populateHomePage`) would otherwise close an import cycle (meetingNoteContent → itemNotePlan → homeNotebooks). A todo's or meeting's `new-shared-file` plan for the Default's notebook returns `homePage: true`, and meetingNoteContent fills the Home page next to the loop's first page (`fillHomePage`). A deleted home notebook created again by a todo's note (`recreate-shared-file`) gets no Home page: that path recreates only the item's page.
- **Goals piece** labels come from `domain/period.ts`'s `periodLabel` (the "Last goal" display's labels), with the year added for a month: "September 2026: …", "Week 40: …". Built by `domain/homeNotebook.ts`'s `homeGoalsText`/`homePageContext`.
- **Settings**: the Home page row and "Home page" in the Default's row summary show only while the Default has a notebook (`domain/noteSetupText.ts`'s `defaultPageKinds`). The line "This is each Project's and Area's home notebook." sits below the notebook's name and folder fields. The Home page offers Title, Static text, Scope and Latest goals (no Linked file: an item has none). Settings completion is `completeHomePage` in `domain/noteSetupMigration.ts`, run with the other load-time completions.
