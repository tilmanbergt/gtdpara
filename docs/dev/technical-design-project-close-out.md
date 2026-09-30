# Technical design: project close-out and archive PDF

Status: approved 2026-09-28 (open points resolved, §11). Implementation: slices 1–5 done (§12); first device check after slice 5.

Inputs:
- requirements and spike: `docs/dev/spike-project-archive-pdf.md` (§1 decisions, §4 results)
- UX mockups: Claude Design canvas "gtdpara Project Close-out Wizard" (9 artboards)
- change after the mockups (Tilman, 2026-09-28): there are no meeting series. A future meeting is treated like an open todo: **Cancel / → Area / → Inbox**. There is no "End series" and no "Delete".

## 0. Goals for the structure

1. **Reuse before building.** Every UI element that already exists is used as-is or extended:
   - `ReviewMasterDetail`, `PagedSection`, `MiniTabs`, `FileBrowserPane` arming, `TaskRow`/`MeetingRow`, the `common`/`theme` styles
   - area assignment, refile, `setItemStatus`, `archiveItem`, the return-to-origin record
2. **Reusable PDF pipeline independent of close-out.** "Turn notes, images and text into one linked PDF" is a general service. Close-out is only one client. Later exports (a single meeting note, a Weekly Review printout, an Area's yearly archive) reuse it unchanged.
3. **Pure logic in `domain/`, device I/O in `storage/`/`supernote/`, screens thin** (design-overview.md §3). Close-out rules take their input as plain data plus a small I/O interface, like `domain/integrityCheck.ts`'s `IntegrityCheckIO`, so they can be tested with `npx tsx` without a device.
4. **Nothing irreversible without a record.** Every move is journaled in the project file and every step is idempotent, so an interrupted archive can be resumed.
5. **ReviewScreen.tsx does not grow.** It is already 4,574 lines. The wizard is its own screen with its own step components.

## 1. Module map

```
android/…/PdfModule.kt              (renamed from ArchivePdfModule.kt) PDF writer, PDF info, progress, cancel
android/…/GtdParaFileModule.kt      + moveFile, moveFolderMerge, deleteTempTree

src/supernote/pdfNative.ts          (renamed from archivePdf.ts) JS binding for PdfModule + note-render API wrappers
src/supernote/fileSystem.ts         + moveFile, moveFolderMerge, deleteTempTree wrappers

src/domain/pdf/helveticaMetrics.ts  glyph widths for Helvetica / Helvetica-Bold (WinAnsi)          [reusable]
src/domain/pdf/pdfDocument.ts       document model: text blocks, image pages, anchors, outline      [reusable]
src/domain/pdf/pdfLayout.ts         pure layout: document -> positioned PdfSpec (wrap, paginate)    [reusable]
src/storage/pdfExport.ts            job runner: render note pages -> layout -> native build          [reusable]
                                     (progress, cancel, temp dir, .part rename)

src/domain/closeOut/plan.ts         CloseOutPlan type + parse/serialize of the "## Close-out" span
src/domain/closeOut/inventory.ts    classify project files into PDF groups, default include/exclude
src/domain/closeOut/readiness.ts    checklist rules -> findings (blocker / warning / notice / ok)
src/domain/closeOut/archivePaths.ts target year/area paths (also used by Area archive)
src/domain/closeOut/archiveDocument.ts  builds the PdfDocument: cover, TOC, record, sections, index
src/domain/closeOut/archiveOps.ts   ordered, idempotent operation list for step 5 / quick archive

src/storage/closeOut/scan.ts        walks the project folder, page counts, shared-note keyword pages
src/storage/closeOut/planStore.ts   load/save the plan span (write-through to cache)
src/storage/closeOut/execute.ts     runs archiveOps with journaling and resume
src/storage/itemMove.ts             moveTaskToTarget / moveMeetingToTarget (extracted refile, §6.3)
src/storage/archive.ts              year/area layout, Area merge (existing file, refactored)

src/ui/wizard/WizardFrame.tsx       breadcrumb + title + StepIndicator + content + footer          [reusable]
src/ui/wizard/StepIndicator.tsx     numbered step bar (done / current / upcoming)                   [reusable]
src/ui/ProgressBar.tsx              fixed-height e-ink progress bar                                  [reusable]
src/ui/StatusMarkRow.tsx            ✓ / ✕ / ! / i mark + label + trailing caption + action slot     [reusable]
src/ui/closeOut/ChecklistStep.tsx
src/ui/closeOut/ContentsStep.tsx
src/ui/closeOut/OutcomesStep.tsx
src/ui/closeOut/PdfStep.tsx
src/ui/closeOut/ArchiveStep.tsx
src/screens/CloseOutWizard.tsx      container: loads plan + scan, owns step state, renders one step
```

Everything marked [reusable] has no close-out imports.

## 2. Native layer (Kotlin)

### 2.1 `PdfModule` (evolves the spike's `ArchivePdfModule`)

These were proven in the spike and are kept unchanged: the two-pass writer, Flate grayscale images, Helvetica/WinAnsi text, `/Link` annotations, nested outline, `.part` + rename, and DARKEN layer compositing (still needed for image files on a white page and for future `.mark` overlays).

Changes:
- **Progress events.** `buildPdf` emits `PdfProgress {jobId, done, total}` through `DeviceEventEmitter` after every image page. Image encoding is about 0.8 s per page, and without events a 300-page build is 4 minutes of silence.
- **Cancel.** `cancelBuild(jobId)` sets an `AtomicBoolean` checked between pages. On cancel: close the stream, delete the `.part` file, reject with `E_CANCELLED`.
- **Job id.** `buildPdf(jobId, specJson, outPath)`, so events and cancel are addressable.
- **Image pages accept JPEG as well as PNG.** They already do, via `BitmapFactory`. Layers are scaled to the page's aspect ratio by the caller (§3.3).
- **Removed:** `renderPdfPages` (batch). `pdfInfo`/`renderPdfPage` stay, unused in v1, as groundwork for PDF merging in v2.

### 2.2 `GtdParaFileModule` additions

| Method | Behavior |
|---|---|
| `moveFile(from, to)` | `renameTo`. Rejects if the destination exists. Creates missing parents. |
| `moveFolderMerge(from, to)` | If `to` doesn't exist: plain `renameTo`. If it does: moves each child that doesn't collide and rejects with the list of collisions *before* moving anything (a dry-run check first). Used for the Area archive (decision 23). |
| `deleteTempTree(path)` | Deletes recursively, **only** if `path` contains `/.gtdpara_tmp/`. Anything else rejects. This is the only delete in the codebase, and its reach is structurally limited to our own temp folder. |

The temp root is `<base>/.gtdpara_tmp/<jobId>/`. Rendered PNGs go there: the host process writes them (the spike wrote successfully under `<base>`), and `listFolderEntries` already hides dot-folders.

## 3. Reusable PDF pipeline

### 3.1 `domain/pdf/pdfDocument.ts`: the document model

```ts
type PdfBlock =
  | {kind: 'heading'; text: string; level: 1 | 2 | 3; anchor?: string}
  | {kind: 'paragraph'; text: string; size?: 'body' | 'small'}
  | {kind: 'row'; cells: string[]; widths: number[]; linkTo?: string}    // tables, TOC lines
  | {kind: 'spacer'; height: number}
  | {kind: 'pageBreak'};

type PdfPart =
  | {kind: 'text'; blocks: PdfBlock[]}              // flows over as many pages as needed
  | {kind: 'image'; source: ImageSource; anchor?: string; label: string};

type ImageSource =
  | {kind: 'notePage'; notePath: string; page: number}
  | {kind: 'imageFile'; path: string};

interface PdfDocument {
  title: string;
  pageSize: {w: number; h: number};                 // text pages; A5X size by default
  parts: PdfPart[];
  outline: {title: string; anchor: string; children?: …}[];
}
```

Links and bookmarks point to **anchors**, not page numbers. The layout step resolves anchors to pages. Callers never do page arithmetic, which removes the most fragile part of the spike's code (the TOC's `frontCount + index` math).

### 3.2 `domain/pdf/pdfLayout.ts`: pure layout

`layoutDocument(doc, imagePages: Map<partIndex, {w,h}>) → {spec: PdfSpec, anchorPages: Map<string, number>}`

- Word-wraps with `helveticaMetrics.ts` (standard AFM widths for the 218 WinAnsi glyphs; a character outside WinAnsi measures as `?`, matching what the writer prints).
- Paginates text parts with fixed margins and line heights, and carries a heading onto the next page if it would sit alone at the bottom.
- **Two-pass TOC.** The TOC's own length changes the page numbers it prints, so layout runs twice: pass 1 finds the page count, pass 2 prints the real numbers. It's deterministic and fits in about 20 lines.
- Everything here is pure, so it's tested with `npx tsx` (wrapping, page breaks, anchor resolution, TOC page numbers).

### 3.3 `storage/pdfExport.ts`: the job runner

```ts
interface PdfExportJob { cancel(): void; done: Promise<PdfExportResult> }
function startPdfExport(doc: PdfDocument, outPath: string, onProgress: (p: PdfExportProgress) => void): PdfExportJob
```

It runs in four phases, reported as `{phase, done, total, label}`:
1. **render**: for each `notePage` image part, `generateNotePng(type 1, times 1)` into the temp dir. Background included, as confirmed in the spike. Cancel is checked between pages. A failed page becomes a text placeholder page ("Sketches.note page 3 could not be rendered") and is recorded in `result.failedPages`.
2. **measure**: `imageInfo` for each image file, fitted into the A5X page's aspect ratio.
3. **layout**: pure (§3.2).
4. **build**: native `buildPdf` with progress events and cancel.

Temp files are deleted with `deleteTempTree` in `finally`. Locked notes (`getPathEncryptionStatus`) are skipped by the caller before building the document, and are never attempted.

Nothing in this module knows about projects or archives.

## 4. Data model

### 4.1 Frontmatter

- `doneAt: YYYY-MM-DD`. Set by `setItemStatus(…, 'done')` when it's missing, cleared on reactivation. Existing Done projects without it show "Done on: not set" in the checklist, defaulting to today.
- `archivedAt: YYYY-MM-DD`. Stamped by the archive step next to `status: archived`.

**As built (slice 4):** both are stored as `key: YYYY-MM-DD` lines in the frontmatter's verbatim `extraLines`, read and written only through `domain/lifecycleDates.ts`. They are not first-class fields: that would have meant threading them through ProjectFileState, CachedItem, frontMatterOf, updateItemFrontMatter and three screens' local snapshots, for values only status changes and close-out touch.

### 4.2 The `## Close-out` span in project.txt

It is stored the same way as `## Weekly Goals`: `getSpan`/`setSpan`, human-readable and Obsidian-friendly. It holds **only deviations from the defaults**, so files added later are picked up with their default treatment.

```
## Close-out
- step: outcomes
- exclude: Todos/Order wood.note
- include: Emails/offer-carpenter.pdf          (reserved; v1 never includes PDFs)
- move: Sketches.note => area:Workbench
- move: werkplan-basteltisch.pdf => resources:Woodworking/Plans
- moved-todo: Return leftover screws => area:Home & Workshop
- moved-meeting: 2026-10-08 Follow-up call => inbox
- pdf: Workbench build.pdf | 2026-09-28 10:02 | 34 pages | checked
- journal: outcomes-moved 2026-09-28 10:15
```

- `moved-todo`/`moved-meeting` lines are written when a checklist action moves an item away. That is how the project record page can still show "→ moved to Area" after the item has left the project file.
- `pdf:` records the generated file and whether it was checked. Any later change to contents or outcomes clears `checked`, so the PDF must be recreated or re-checked.
- `journal:` lines are written by the executor (§7).
- Parser and serializer live in `domain/closeOut/plan.ts` (pure) and round-trip unknown lines untouched, the same convention as the existing `…ExtraLines`.

## 5. Close-out domain logic

### 5.1 Archive paths: `domain/closeOut/archivePaths.ts`

```ts
archiveTargets(item, doneAt, today, paths) → {year, folder, pdf}
```

- year = the year of `doneAt`, falling back to `today`
- with an area: folder `Archive/<Y>/<Area>/<Project>/`, PDF `Archive/<Y>/<Area>/<Project>.pdf`
- without an area: folder `Archive/<Y>/<Project>/`, PDF `Archive/<Y>/<Project>.pdf`

For an Area: `Archive/<Y>/<Area>/`, merged into what's there (decision 23). `storage/archive.ts` calls this for both kinds and replaces its hard-coded `${paths.archive}/${item.name}`.

### 5.2 Inventory: `domain/closeOut/inventory.ts` + `storage/closeOut/scan.ts`

**`scan.ts` (I/O)** walks the project folder recursively with `listFolderEntries` and collects, for each file:
- relative path and type (note / pdf / image / other)
- for notes: the page count, and `getPathEncryptionStatus`

It then resolves meetings and todos to notes:
- own notes: `resolveNotePath`
- shared notes: `parseSharedNoteAnchor` plus one `getKeyWords` call per shared file, mapping keyword → page (reusing `domain/sharedNotePages.ts`'s `findExactKeywordPage`)

**`inventory.ts` (pure)** classifies the scan into the PDF groups from decision 10, in this order: record, Meetings (date order, with shared-note pages expanded per meeting and "other pages of X" collected), Todos, Emails and attachments (`Emails/` folder plus Gmail attachments), Other notes and files, Linked from outside (from tasks'/meetings' `linkedFile` pointing outside the folder), Locked (listed only).

Defaults:
- notes and images are included
- PDFs and other files are listed only
- files linked from outside are listed as references
- the plan's `exclude`/`include` lines are applied on top

The result is the `ContentsModel` that step 2 renders and the document builder consumes. It also yields the estimated page count and time (1.3 s per page, from the spike).

### 5.3 Readiness: `domain/closeOut/readiness.ts`

`evaluateReadiness(input) → Finding[]`, where each finding is `{id, severity: 'blocker'|'warning'|'notice'|'ok', label, caption, items?}`.

| id | Severity | Rule | Actions offered (UI) |
|---|---|---|---|
| `openTodos` | blocker | a task that is not done and not cancelled | Done · Cancel · → Area · → Inbox |
| `futureMeetings` | blocker | a meeting that is not cancelled, dated today or later | Cancel · → Area · → Inbox |
| `meetingsCloseOut` | warning | `isReviewOutstanding` / prep open (domain/meetingTracking.ts) | open the meeting row's existing toggles |
| `periodRefs` | warning | the project's goal for the current week/month, or a month highlight in the future | none (informational: they leave the Week/Month views) |
| `incomingLinks` | warning | any other cached item's task/meeting `linkedFile` pointing inside this folder, unless that file has a move in the plan | hint to use step 3 |
| `targetCollision` | blocker | the folder or PDF target already exists | none (rename by hand) |
| `lockedNotes` | notice | an encrypted note in the folder | none |
| `openFromHere` | notice | the remembered launch path is inside the folder | none |
| `noArea` | ok | shown as info only (decision 24) | Assign… |

`input` is plain data: the cached item, all cached items, the scan result, the plan, today, and the launch path. There is no I/O in the rules. Blockers gate only step 5 and quick archive.

### 5.4 Document builder: `domain/closeOut/archiveDocument.ts`

`buildArchiveDocument(item, contents, plan, targets, today) → PdfDocument`

- **Cover:** name, kind and area, active period (earliest meeting/creation to `doneAt`), the done and archived dates, scope, counts.
- **Contents:** one `row` per section and entry, with `linkTo` its anchor.
- **Project record:** the todos table (✓ done / ✗ cancelled / → moved to X, from the plan's `moved-todo` lines). No completion dates: tasks don't store them. Then the meetings list (date, time, #prepped/#reviewed, "→ p. N" link to the note anchor) and the outcomes moved out.
- **Sections:** image parts per included note page and per image file, each note's first page carrying its anchor.
- **Index: files not in this PDF.** Each file listed only, with its **post-archive** location (inside the archive folder, or its outcome destination).
- **Outline:** the same tree as the Contents page.

Pure, and tested with `npx tsx` against a fixture project.

### 5.5 Archive operations: `domain/closeOut/archiveOps.ts`

`planArchiveOps(item, plan, targets, cachedItems) → ArchiveOp[]`, in this fixed order:

1. `moveFile` for each outcome, source → destination
2. `rewriteLinks` for each item/task/meeting whose `linkedFile` pointed at a moved file
3. `moveFile` for the project PDF → `targets.pdf` (full close-out only)
4. `stampArchived`: `status: archived`, `archivedAt`, focus cleared, plus a journal line
5. `moveFolder` for the project folder → `targets.folder`
6. `dropFromCache`

Quick archive = steps 4–6 only.

## 6. Reused and extended existing pieces

### 6.1 Review "Done awaiting review" (ReviewScreen.tsx)

- `DoneOnHoldDetail` gains a small **close-out status block**: for the Done step only, it reads the plan span and shows the step reached, with the buttons **Start / Continue close-out** and **Quick archive…**. Reactivate stays.
- The left rows' subtitle gets the status ("close-out: step 3 of 5", "2 blockers"). `ReviewLeftRow` already takes the item, so the change goes in `reviewAggregate.ts`'s entry and is computed from the plan span and readiness in the cache. It's cheap because the plan span is parsed with the rest of the file.
- The direct **Archive** buttons in Stalled, On Hold and Done (`handleArchiveItem` for Projects) are replaced by "Quick archive…", which opens the wizard in quick mode. Every Project archive then goes through the checklist (decision 28). Areas keep their direct Archive, now year-based (§5.1).

### 6.2 Item detail (ItemStatusPanel)

For a Project, **Archive…** becomes **Close out…**, which opens the wizard. The existing "Assign to Area…" arming stays and is reused by the checklist (§8.2).

### 6.3 Refile, extracted: `storage/itemMove.ts`

`ProjectDataPanel.handleRefilePick` and ReviewScreen's filing code each combine "append to target + remove from source" by hand. It is extracted once:

```ts
moveTaskToTarget(sourceRef: TaskEntryRef, target: InboxFilingTarget | 'inbox', ctx): Promise<void>
moveMeetingToTarget(sourceRef: MeetingEntryRef, target: …, ctx): Promise<void>
```

These are built on the existing `appendTaskToTarget`/`appendMeetingToTarget` and `mutateEntryTasks`/`mutateEntryMeetings`. ProjectDataPanel switches to it in the same slice, and that is the only behavior-neutral refactor of existing screens in this plan. The checklist's → Area / → Inbox use it.

### 6.4 Status and return-to-origin

- `setItemStatus` writes and clears `doneAt` (§4.1).
- **Open PDF to check** uses `openPath`. The existing return-to-origin record makes the plugin *resume* on return from the PDF reader, so the wizard is still on screen at step 4, with no new code. If the JS process was restarted meanwhile, the wizard reopens from the plan span at `step: pdf`.

### 6.5 Integrity check

A new registered check, `closeOutInterrupted`: a plan span with a `journal:` line but `status` not archived. It is reported with "resume close-out". This reuses the existing check registry; there is no new report mechanism.

## 7. Executor and failure handling: `storage/closeOut/execute.ts`

- Runs the `ArchiveOp[]` from §5.5 one at a time. **Before** each op it appends `journal: <op-id> started`, and after it `journal: <op-id> done`. These go to the plan span while the folder is still in place; after the folder move, to the file at its new location.
- **Idempotent ops:**
  - `moveFile` skips if the source is gone and the destination exists
  - `rewriteLinks` skips links already pointing to the new path
  - `moveFolder` skips if the target exists and the source is gone
- **Resume** = run the same op list again. It only continues.
- **Failure:** stop at the first error and report exactly which ops completed and which did not (mockup 5, "after archiving"). Nothing is rolled back or deleted.
- The whole run is guarded by the readiness blockers, re-evaluated immediately before starting, since the cache may have changed since the checklist was shown.

## 8. UI

### 8.1 Shared, reusable components

- **`ui/wizard/WizardFrame.tsx`**: props `{breadcrumb, onBreadcrumb, title, steps, currentStep, children, footer}`. It owns the fixed layout (header, `StepIndicator`, flex content with a bounded height, footer row) so steps never measure the screen themselves. It calls `requestEinkRefresh()` on step change (the bugfix_eink_refresh lesson).
- **`ui/wizard/StepIndicator.tsx`**: equal-width cells with a bottom bar: thick black for the current step, mid-grey for done steps (✓ prefix), light for upcoming. Grayscale by weight and glyph only, per `theme.ts`.
- **`ui/ProgressBar.tsx`**: a fixed-height box with a black fill. The step calls `requestEinkRefresh` at most once per second while it moves, to limit e-ink flashing.
- **`ui/StatusMarkRow.tsx`**: a mark (✓ / ✕ filled / ! / i round) plus label, trailing caption, and an optional action row underneath. It has a fixed `minHeight` per the device-rendering guide §3 and is reusable in the integrity-check UI later.

All of them use `FONT`/`SPACING`/`RADII`/`COLORS` and `common` styles, with no new sizes.

### 8.2 Steps

| Step | Built from |
|---|---|
| **Wizard container** `screens/CloseOutWizard.tsx` | Loads cached item + scan + plan; owns `mode: 'full'|'quick'`, current step, action runner (the `pending/error` pattern from `DoneOnHoldDetail`). Rendered by App.tsx in place of the Review tab's content while `closeOut` is set (§8.3). |
| **1 Checklist** | `StatusMarkRow` per finding; open todos/meetings rendered with the existing `TaskRow`/`MeetingRow` (context "flat") plus pill buttons (the existing `styles.pill` look) wired to `mutateEntryTasks` (Done/Cancel) and `itemMove.ts` (→ Area / → Inbox). **Area "Change…"** arms an embedded `FileBrowserPane` with the same `LinkTarget` that `ItemStatusPanel` uses today (`pickKind:'folder'`, root Areas, label "Select Area"), calling `assignProjectToArea`. **Done on "Edit"** reuses `ui/DateInput.tsx`. |
| **2 Contents** | One `PagedSection` over the flattened header+row list (the same flatten convention as ProjectDataPanel's TodosSection). Rows are a new small `ContentRow` (checkbox box + name + meta + result), its height from the pagination budget. A tap on the name opens the file (`openPath`). The summary line comes from `inventory.ts`. |
| **3 Outcomes** | `ReviewMasterDetail` (left list with a destination subtitle, right detail); `MiniTabs` as the Stays / → Area / → Resources segmented control; `FileBrowserPane` arming with `pickKind:'folder'` and roots **Area Files** (the assigned area, disabled when there is none) / **Resources**, exactly as `ItemDetail` builds them; "+ New folder" via `ensureFolderExists`. The destination is only written to the plan; nothing moves. Meeting and todo notes are not listed (decision 6 of the mockup review). |
| **4 PDF** | Idle: summary + **Create PDF**. Running: `ProgressBar` + phase label + the per-section list (`StatusMarkRow` in a compact variant) + **Cancel** → `pdfExport` job. Ready: result line, failed-page notice, **Open PDF to check** / **Create again** / **Change contents…**, TOC preview (from the document model, no PDF parsing), and a "I checked the PDF" checkbox → plan `checked`. |
| **5 Archive** | A numbered op list rendered straight from `planArchiveOps` (what the user sees is what runs), the open-note notice, **Archive now** → executor; the result view reuses the same op list with ✓/✕ per op. |
| **Quick archive** | The same container in `mode: 'quick'`: steps = Checklist, Archive. The Archive step shows ops 4–6 only. |

### 8.3 Navigation (App.tsx)

- New app state: `closeOut: {path: string; mode: 'full'|'quick'} | null`, with `openCloseOut(path, mode)` passed to ReviewScreen and ItemDetail (the same prop-drilling pattern as `onOpenItem`).
- While it is set, the Review tab shows `<CloseOutWizard>` instead of `<ReviewScreen>`; the tab bar stays. The breadcrumb, "Save & leave", and success all clear it. ReviewScreen keeps its step and selection because it's the same mounted-state pattern it already uses for its module-level saved step.
- The Review badge and hub counts are untouched; the Done step just counts fewer items after archiving.

## 9. Edge cases, and where they are handled

| Case | Handling |
|---|---|
| Project folder renamed or deleted while the wizard is open | The container re-validates `findCachedItem(path)` on every step change and shows the standard "changed on disk – tap 🔄" error |
| Two projects with the same name in the same year/area | `targetCollision` blocker |
| Outcome destination already has that file name | Blocked at step 3 when choosing; re-checked in the op pre-flight |
| A shared note file (e.g. Daily.note) used by several projects | Not possible: shared files are per Project (shared-note-pages decision). The scan treats one as a normal project file. |
| Shared-note page with no matching keyword | Goes into "other pages of X" |
| Note with 0 pages or a failed page count | Listed only, with the reason |
| Plugin killed during PDF creation | `.part` left in the temp or target folder; the next Create deletes any stale `.part` for that output first |
| Plugin killed during archive | Journal lines, the `closeOutInterrupted` integrity check, and the Done step row shows "archive interrupted – resume" |
| Project reactivated after partial close-out | The plan span stays (harmless). The next close-out continues with it; "Start over" clears it. |
| Archive year folder or area folder missing | Created (`moveFile`/`moveFolder` create parents) |
| Launched from a PDF (DOC context) | Spike S3 not yet verified. If `generateNotePng` is blocked there, the PDF step shows "Open gtdpara from a note to create the PDF" (same approach as the createNote limitation). |
| Non-WinAnsi characters in titles | Printed as "?" in page text; bookmarks use UTF-16, so they stay correct |

## 10. Implementation plan

Each slice is tsc-clean, committed and md5-verified before the next one starts, following the project's standing workflow. Pure slices come with `npx tsx` tests in the scratch project. Native slices are compile-checked against stubs and the PDF output is validated on the desktop (qpdf, pypdf, rendering to PNG), as in the spike.

| # | Slice | Contents | Device test after? |
|---|---|---|---|
| 1 | **Spike cleanup + native layer** | Remove the Spike tab, `archivePdfSpike.ts` and `meetingNoteSpike.ts` (the files must be deleted by hand, or the removal granted); rename to `PdfModule` / `pdfNative.ts`; progress events + cancel; `moveFile`, `moveFolderMerge`, `deleteTempTree` | – |
| 2 | **PDF model + layout (pure)** | `helveticaMetrics`, `pdfDocument`, `pdfLayout` + tsx tests | – |
| 3 | **PDF export service** | `pdfExport.ts` (render → layout → build, progress, cancel, temp cleanup) | – (first device run is slice 9; no debug export, §11.1) |
| 4 | **Data model** | `doneAt`/`archivedAt` frontmatter; `setItemStatus` writes doneAt; `plan.ts` parse/serialize + `planStore.ts`; tsx round-trip tests | – |
| 5 | **Archive paths** | `archivePaths.ts`; `archive.ts` switched to the year/area layout; Area merge via `moveFolderMerge` | ✓ archive a test Area |
| 6 | **Close-out domain** | `scan.ts`, `inventory.ts`, `readiness.ts`, `archiveDocument.ts`, `archiveOps.ts` + tsx tests on a fixture project | – |
| 7 | **Executor + itemMove** | `execute.ts` with journal/resume; extract `itemMove.ts` and switch ProjectDataPanel to it; `closeOutInterrupted` integrity check | – |
| 8 | **Shared UI components** | `WizardFrame`, `StepIndicator`, `ProgressBar`, `StatusMarkRow` | – |
| 9 | **Wizard steps** | Container + steps 1–5 + quick mode | ✓ full close-out of the "Test" project |
| 10 | **Wiring** | App.tsx `closeOut` state; Done step status + buttons; ItemStatusPanel "Close out…"; Archive buttons → Quick archive | ✓ both entry points, quick archive, resume after a forced kill |
| 11 | **Docs** | design-overview.md §2/§4/§5; this doc's as-built notes | – |

Slices 1–7 have no visible UI change, apart from the optional debug export in slice 3, so they can land without disturbing daily use.

## 11. Decisions on the open points (Tilman, 2026-09-28)

1. **No debug or standalone "Export note as PDF".** Supernote already has its own note-to-PDF export. Enriched meeting/todo exports may come later, not now. The pipeline stays reusable, but v1 has no second caller.
2. **Future meetings are a blocker**: they must be moved or cancelled. **This week's/month's goal** (`periodRefs`) is a warning only.
3. **Meetings to close out** (`meetingsCloseOut`) is a warning only (table in §5.3 updated).
4. **Spike files:** Tilman grants delete access for the slice-1 cleanup. If this session's tools can't delete, he deletes the listed files by hand. Until then they stay unreferenced and the build stays green.

## 12. Implementation status (as built)

- **Slice 1 (2026-09-28) — done.**
  - `PdfModule.kt` (native name `GtdParaPdf`) with job id, `GtdParaPdfProgress` events and `cancelBuild`.
  - `GtdParaFileModule` gains `moveFile`/`moveFolderMerge`/`deleteTempTree`; `supernote/pdfNative.ts`; `fileSystem.ts` wrappers (`TEMP_FOLDER_NAME = '.gtdpara_tmp'`).
  - Spike tab removed from Settings; spike files deleted by Tilman.
  - Verified: Kotlin compiled against stubs plus a behavior run (progress, cancel leaves no `.part`, merge collision check before any move, temp-only delete), and tsc clean (only the 2 known hitSlop errors).
- **Slice 2 (2026-09-28) — done.**
  - `domain/pdf/helveticaMetrics.ts` (AFM widths, 219 WinAnsi glyphs × 2 weights).
  - `domain/pdf/pdfSpec.ts`: the writer's input types, moved out of `pdfNative.ts` so `domain/` never imports `supernote/`.
  - `domain/pdf/pdfDocument.ts`: model, `A5X_PAGE`, `ResolvedImage`.
  - `domain/pdf/pdfLayout.ts`: wrap, truncate, keep-with-next headings, rows with `linkTo`/`pageOf`, placeholders for failed images, iterative anchor resolution, page-number footer.
  - Verified: 7 tsx tests (metrics, wrapping, truncation, a 60-entry TOC spanning 2 pages with correct printed numbers and links, keep-with-next, placeholder, unresolved anchors), plus end-to-end layout → Kotlin writer → qpdf/pypdf check (63 pages, 60 links to the right pages, nested outline, umlauts). Tests live in the scratch mirror, not the repo, per project convention.
- **Slice 3 (2026-09-28) — done.**
  - `storage/pdfExport.ts`: `startPdfExport(doc, outPath, {baseRoot, overwrite, onProgress})` returns `{jobId, cancel(), done}`. It runs the phases render → layout → build; temp PNGs go in `<base>/.gtdpara_tmp/<jobId>/` and are removed in `finally`; `PdfExportCancelled` is thrown on cancel; `fitIntoPage` handles image files.
  - Native `buildPdf` gained `overwrite`: it replaces an existing `*.pdf`, and only once the new file is complete. Behavior tested against the stub harness.
- **Slice 4 (2026-09-28) — done.**
  - `domain/lifecycleDates.ts` (doneAt/archivedAt in frontmatter extraLines).
  - `setItemStatus` stamps `doneAt` on the first → Done (Projects), keeps it on Done → On Hold → Done, and clears it on → Active. It now returns `frontMatterExtraLines`; `ItemStatusPanel` keeps its snapshot in sync.
  - `markdown.ts` gains `readSectionLines`/`writeSectionLines`/`removeSection`.
  - `domain/closeOut/plan.ts`: parse/serialize/edit helpers, with edits that uncheck the PDF.
  - `storage/closeOut/planStore.ts`: cache-based load/save, plus `savePlanAt` for after the move; `dataCache.updateItemRawContent`.
- **Slice 5 (2026-09-28) — done.**
  - `domain/closeOut/archivePaths.ts`.
  - `archive.ts`: `archiveTargetsFor` plus `archiveItem` on the new layout. Projects go to `Archive/<doneAt year>/[<Area>/]<name>/`; Areas merge into `Archive/<this year>/<name>/` via `moveFolderMerge`; `archivedAt` is stamped. Done projects cascaded with an Area land in `Archive/<their year>/<Area>/`.
  - The confirm dialog in ItemStatusPanel shows the exact target path.
  - Every existing Archive button (item detail, Review steps) now uses the new layout; the checklist gating follows in slices 9–10.
- **Tests for slices 3–5:** 6 tsx tests (lifecycle dates through a frontmatter round-trip; plan round-trip incl. a path containing " => ", unknown lines, idempotent rewrite; inclusion deviations and PDF uncheck; Start over in the middle and at the end of a file; archive year/paths). tsc clean (only the 2 known hitSlop errors).

- **Slice 6 (2026-09-29) — done.**
  - `domain/closeOut/inventory.ts` (`buildContents`, groups, outcome candidates, estimate) and `readiness.ts` (`evaluateReadiness`, `blockers`, `readinessSummary`).
  - `archiveDocument.ts` (cover, TOC, record, file sections, index; anchors `e:<key>`) and `archiveOps.ts` (`planArchiveOps`, `describeOp`).
  - `storage/closeOut/scan.ts`; `sharedNotePages.readAllKeywords` is exported.
  - Gmail email notes are **included by default**. A note whose page count can't be read is shown as "could not be read"; `getPathEncryptionStatus` is not used.
- **Slice 7 (2026-09-29) — done.**
  - `storage/itemMove.ts` (`moveTaskTo`, `moveMeetingTo`, `closeTask`, `cancelMeeting`). ProjectDataPanel keeps its own refile code for now.
  - `storage/closeOut/context.ts` (`loadCloseOutContext`/`refreshCloseOutContext`), `pdf.ts` (`startCloseOutPdf`) and `execute.ts` (`runCloseOutArchive`: preflight, journal, resume).
  - Op order as built: outcome moves and link rewrites → PDF → **folder move → stamp `archivedAt`** (stamped at the new location).
  - There is no separate "close-out interrupted" integrity check. The Review hint (`planStatusLabel`) says "archive interrupted – continue to resume" instead.
  - Verified with a Node integration test (real fs): blockers, move to Area, cancel meeting, forced failure at the folder move with the journal kept, then resume and stamp.
- **Slice 8 (2026-09-29) — done.** Shared UI: `ui/PillButton`, `ui/ProgressBar`, `ui/StatusMarkRow`, `ui/wizard/StepIndicator`, `ui/wizard/WizardFrame` (e-ink refresh on step change).
- **Slice 9 (2026-09-29) — done.**
  - `ui/closeOut/*` (Checklist, Contents, Outcomes, Pdf, Archive steps plus shared styles) and `screens/CloseOutWizard.tsx` (container: load/refresh, plan updates, PDF job with 1 s progress throttle, archive run).
  - `statusControl.setDoneDate`.
  - Deviations:
    - The Area picker in the checklist is a PagedSection list, not FileBrowserPane arming.
    - Outcomes use FileBrowserPane in browse mode plus "Move here" (via `onActiveLocationChange`).
- **Slice 10 (2026-09-29) — done.**
  - ReviewScreen "Done awaiting review" detail has "Close out…" and "Quick archive…" buttons plus the plan status hint. The Archive button on Projects in the other Review steps opens the quick close-out.
  - ItemStatusPanel shows "Close out…" for Projects.
  - App.tsx hosts the wizard in the Review tab (state `closeOut {path, mode}`).
  - tsc: no new errors (only the pre-existing MeetingRow/TaskRow hitSlop and DoneOnHoldDetail row-prop errors).
- **Slice 11 (2026-09-29) — done.** `design-overview.md`: new §2.32 (close-out and the reusable PDF pipeline); §2.12 archive-layout note; §3 "Reusable building blocks"; §4 device test and follow-ups; §5 decision entry.
- **Next:** device test of the wizard (slices 9–10).
