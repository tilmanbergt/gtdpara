# Technical design: Lasso (0.8.0)

Status: **built** (2026-10-06), see §10 "As built". Approved with two changes (Tilman,
2026-10-05): Close out shows open marks as a warning, and split items are separate rows you can
edit and remove.
Branch: `feature/lasso-0.8`, created from `main` after the 0.7.0 release.

Background:
- Requirements were agreed in chat on 2026-10-05.
- Screen designs: the artifact "Lasso 0.8 Screens" (v2).
- Spike: `spike-lasso-marks.md`, run in six device rounds. Its branch `spike/lasso-0.8` is
  never merged; its useful parts are ported here (§9).

What 0.8.0 is about: lasso capture becomes reliable and quicker to work with.
1. The "second lasso recognizes nothing" bug is fixed.
2. Capture becomes a wide Quick Add that can make several todos from one lasso.
3. **Mark for later**: one tap stores a lasso without recognizing it, and puts a bookmark into
   the note as proof. The marks are processed later in the same screen, from the Inbox, the
   project or area they belong to, the Weekly Review or the Close-out.

## 1. Requirements as decided

| # | Item | Decision (Tilman, 2026-10-05) |
|---|---|---|
| R1 | Recognition bug | Fix the root cause found in spike round 5 (§2.1). One recognition function for Capture and marks. |
| R2 | Mark for later | A second lasso-toolbar button, "Mark for later". One tap; no gtdpara screen opens. It works for strokes and text boxes, in notes and PDFs. |
| R3 | Proof in the note | A black bookmark icon appears at the top right inside the lassoed area. It carries `userData` with the mark id. |
| R4 | After processing | Save: the bookmark becomes a check icon, which stays. Discard: the icon is removed. PDFs: the icon stays when it can't be changed safely. |
| R5 | No recognition at mark time | Recognition runs when the processing screen opens, with the next marks recognized ahead while you work on the current one. |
| R6 | Storage | Open marks are lines in a `## Marks` section of the owning `project.txt` / `area.txt` / `Inbox.txt` (owner: §3.2). Pictures and stroke data live in gtdpara's private folder. |
| R7 | Source of truth | A mark line deleted by hand counts as discarded. Saved and discarded marks are removed from the section. |
| R8 | One screen | Capture and marks processing are the same screen and component. Left column (max 1/3 of the width): open marks. Right: the capture panel. The column is hidden when there are no open marks. |
| R9 | Capture panel | `QuickAddWidget variant="capture"`: Quick Add's rows 1-4 (Todo/Meeting, text + date, flow chips, Save buttons right under the input). Below them: more tag rows, all abbreviations as "File to" chips, "Link to this page", Mark for later / Cancel. For a mark: Open page / Discard… / Close. |
| R10 | Buttons | Save & next, Save & view, Save & close. Save & next means "clear the form for a typed extra item" in direct capture and "next mark" when processing marks. The destination is kept after Save & next. The lasso is not kept. |
| R11 | Left column | Grouped by source file, this note first. A row shows the picture until the recognized text is longer than 3 characters, then the text. Page and date are always shown. |
| R12 | Split lines | Automatic when at least 2 lines start with a bullet (§3.5). The bullet is stripped. A heading line before the first bullet is put in front of every item. Without split, line breaks and runs of spaces collapse to one space. One mark produces one kind of item. |
| R13 | Where marks show up | The Inbox shows all marks. A project's or area's Current tab shows the marks from notes in its folder. Saving in either place removes the mark from both. |
| R14 | Other flows | The Weekly Review's Inbox to zero counts marks (no new step). Close out lists open marks. The integrity check gets a marks check. There is no indicator on Daily. |
| R15 | Shared-note meeting tags | Not added automatically (v2 idea). |

Out of scope: landscape, rotated pages, A6/A6X (the plugin is portrait A5 X only), one mark
becoming both a todo and a meeting, and recognition in the background.

## 2. Current state (code check, 2026-10-05, `main` after 0.7.0)

### 2.1 Root cause of the recognition bug

`CaptureScreen.runRecognition()` calls `recognizeElements(getLassoElements(), getPageDisplaySize())`.
- On this device the stroke points use the 21632 × 16224 EMR range, about 11.5 EMR per px.
- The page reports 1404 × 1872 px. In the documented mapping that size corresponds to
  15819 × 11864 EMR.
- So the recognizer treats everything below about 1368 px as outside the page. It fails with
  117, or returns partial text.
- The "second lasso" pattern was a coincidence of position: the first lasso was usually higher
  on the page.

Spike round 5 recognized all six test marks correctly with **shifted copies**: strokes rebuilt
from their saved points and moved to the top-left. Round 6 confirmed it (box `☐`, dash `-`,
dot `•`, line breaks kept). Recognition takes about 3-4 s per mark, plus about 0.3-0.5 s to
build the copies.

### 2.2 Code paths 0.8 builds on

- **Capture** (`screens/CaptureScreen.tsx`):
  - Opened full-screen by `App.tsx` (`mode === 'capture'`) from lasso button 200
    (`showType: 1`).
  - Destination: fixed, from `findEnclosingItem(paths, notePath)`, or the Inbox.
  - Saves through `addTaskToDestination` / `addMeetingToDestination`
    (`storage/itemMutations.ts`). The link is written as `→ [[/abs/path.note]]`.
  - Exits through `onOpenItem` / `onOpenDaily` / `PluginManager.closePluginView()`.
  - It has its own meeting fields with the old single-time parser.
- **Quick Add** (`ui/QuickAddWidget.tsx`, ~1950 lines):
  - Four rows: R1 tabs, R2 text and date, R3 flow chips + `TagChips` (one row per page), and
    R4 "+ Add" / "+ Add to <Name>".
  - Abbreviations: `resolveAbbrevFileTarget`.
  - Tag and flow composition lives inside `submitTaskCreate`.
  - It has no multiline input and no custom actions.
- **File format** (`domain/markdown.ts`):
  - Sections via `getSpan`/`setSpan`, plus the generic `readSectionLines` /
    `writeSectionLines` / `removeSection`, used by `## Close-out`.
  - The keyed-goals parsers are the template for a list section.
  - Unknown lines in a section survive.
- **Cache** (`storage/dataCache.ts`):
  - `CachedItem` and the Inbox's `ProjectFileState` hold parsed sections plus `rawContent`.
  - Saves are read-modify-write from the cached `rawContent`.
  - `refreshCache` re-reads files whose stamp changed on every open (0.6).
  - There is no write queue.
- **Text files**:
  - `supernote/fileSystem.ts` provides `readTextFile` / `writeTextFile`, which write the
    whole file through `GtdParaFile`.
  - The private temp folder (`getPrivateTempDir`) is **wiped on every plugin start**.
  - `deleteTempTree` refuses anything outside `tmp`.
- **Links**:
  - `→ [[path]]` is relative to the item folder or absolute.
  - Shared-note anchors use `#<keyword>` (`parseSharedNoteAnchor`).
  - There is no page-number anchor yet. `openPath(path, page)` takes a 0-based page.
- **Places marks will appear**:
  - `InboxScreen`, `ProjectDataPanel` (Current, a kept tab), Review `renderInboxZero`, the
    close-out `evaluateReadiness` / `ChecklistStep`, and `integrityCheck.ts`.
  - The integrity check's `RECOGNIZED_HEADINGS` drives the duplicate-heading check.
  - Each has a natural slot between Quick Add and its lists, or a finding hook.
- **Navigation**:
  - The `closeOut` state replaces Review's body.
  - Kept tabs reach App through `stableNav`.
  - `decideLanding` handles return to origin.

## 3. Design

### 3.1 The mark line (`## Marks`)

```
## Marks

- 2026-10-05 10:42 [[Offsite prep.note]] p3 ^m-20261005-104212-351
- 2026-10-05 16:12 [[/storage/emulated/0/Document/Spec.pdf]] p12 Order new toner ^m-20261005-161230-017
```

- Fields: date and time, then the note link, then the 1-based page, then optional text, then
  the block id `^m-<YYYYMMDD-HHmmss-NNN>`.
  - The id format is the spike's `newMarkId` with an `m-` prefix.
  - It is a valid Obsidian block id.
- Link:
  - relative to the item folder when the note lies inside it (the `→ [[…]]` rule);
  - absolute otherwise, for example a PDF in `Document/` whose mark lands in the Inbox.
  - Resolved with the existing `resolveNotePath`.
- Text is written only when it is known at mark time, i.e. text-box marks.
  - Recognized text is **not** written back. That keeps every write to the file a deliberate
    user action.
- Parser: `MARK_LINE_RE = /^- (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) \[\[([^\]]+)\]\] p(\d+)(?: (.*?))? \^(m-\d{8}-\d{6}-\d{3})\s*$/`.
  - Other lines in the section go to `marksExtraLines` and survive.
- The section is created lazily (like Weekly Goals) and never by `ensureSkeleton`. It is
  written after `## Meetings` if missing, which is `setSpan`'s append at the end.

Types (`domain/types.ts`):

```ts
export interface Mark {
  id: string;              // 'm-20261005-104212-351'
  createdAt: string;       // '2026-10-05 10:42'
  notePath: string;        // as written (relative or absolute)
  page: number;            // 0-based (line shows page + 1)
  text: string | null;     // text-box text, if any
}
```

`CachedItem` and `ProjectFileState` gain `marks: Mark[]` and `marksExtraLines: string[]`.

### 3.2 Owner of a mark (pure, `domain/marks.ts`)

`markOwner(paths, notePath, knownItems): Destination`
- An item: the note lies under a project or area folder at any depth (`findEnclosingItem`).
  That includes `Todos/`, `Meetings/` and shared Tag Rule notes in an area. The item must be
  in the cache, i.e. its data file exists.
- The Inbox: everything else (the Inbox folder, Resources, Archive, PDFs in `Document/`, loose
  notes).

The same rule already picks Capture's default destination, so a mark and a direct capture
from the same note default to the same place. A note moved by hand to another project later
keeps its marks in the old file. This is harmless: the mark still works, and the integrity
check reports the note as missing if its path is gone.

### 3.3 Private mark data

- Location: `<plugin private folder>/data/marks/<id>/`, with two files:
  - `picture.png`: the lasso preview.
  - `mark.json`: `{version, id, path, page, rect, displaySize, pageSize, textBoxText, strokes:
    StoredStroke[], icon: {num, box, kind}}`. `StoredStroke` is the spike's format: EMR points
    flattened, pressures, pen, thickness.
- **Native, new** (`GtdParaFileModule.kt`, `supernote/fileSystem.ts`):
  - `getPrivateDataDir()` returns `<private>/data`.
  - `deletePrivateDataTree(path)` refuses anything outside `<private>/data`.
  - This is the second and last private delete next to `deleteTempTree`. These are the
    plugin's own files, so there's no user confirmation (the policy's delete rule covers
    shared storage).
  - DEVELOPMENT-POLICY §3 gets one sentence for it in the same change.
- `storage/markData.ts`:
  - `writeMarkData(id, json, pictureSrc)`
  - `readMarkData(id)`
  - `pictureUri(id)`
  - `deleteMarkData(id)`
  - `listMarkDataIds()`
- Lifetime:
  - Deleted after Save or Discard.
  - Orphans (data without a line, e.g. a line deleted by hand) are deleted when the
    processing screen opens, if they are older than 24 h. The integrity check reports them too.
- **Device checks (§7, D1/D2)**:
  - Does the folder survive installing a new build over the old one?
  - Can `generateLassoPreview` write into it, given the note app may run in another process?
  - Fallback if either fails, as a single constant: `EXPORT/gtdpara/marks/`. PRIVACY.md would
    then say so.

### 3.4 Reading a lasso and recognizing (one path for Capture and marks)

`supernote/lassoRead.ts`:
- `readLasso(): Promise<LassoSnapshot>` returns `{path, page, rect, displaySize, pageSize,
  textBoxText, strokes: StoredStroke[], elementCount, typeCounts}`.
  - Steps: `getCurrentFilePath`, `getCurrentPageNum`, `getLassoRect`, `getLassoElements`,
    `getPageDisplaySize`, `getPageSize`.
  - Text boxes: `textContentFull` joined in reading order (`joinInReadingOrder`).
  - Strokes: points and pressures read through the element accessors (spike `saveStrokes`).
  - Elements are recycled in `finally`.
- `saveLassoPreview(target)` calls `generateLassoPreview`. It must run while the lasso is
  active, and uses `result.imagePath` when the host returns one.

`supernote/strokeRecognition.ts`:
- `recognizeStrokes(strokes, textBoxText): Promise<{text, error}>`
  - Build stroke elements with `createElement` + batch `setRange`, shifted so the minimum
    point lies at EMR (300, 300) (spike `buildStoredStrokes(shift=true)`).
  - `recognizeElements(built, pageSize)`, then recycle.
  - The result is `[recognized, textBoxText]` joined by a newline, without empty parts.
  - With no strokes it returns the text-box text straight away.
- **Serial**: a module-level promise chain, because the host recognizer is never called twice
  at once.

Direct Capture uses `readLasso()` and then `recognizeStrokes(snapshot.strokes, …)` from memory,
so it never passes live elements with the page size again. This is the fix for R1.

### 3.5 Text from recognition (pure, `domain/captureText.ts`)

```ts
export function prepareCaptureText(raw: string, kind: 'todo' | 'meeting'): {text: string; split: boolean};
export function splitItems(text: string): string[];   // the field's lines, trimmed, non-empty
export function collapseText(text: string): string;    // all whitespace runs → ' ', trimmed
```

- **Bullet**: the first characters after spaces match
  `/^\s*(?:[-–—•·*☐□☑☒✓✔]|\(?\d{1,2}[.)](?=\s))\s*/`.
  - Covers dash, bullets, boxes and checks, and numbers like `1.`, `1)`, `(1)`.
  - Numbers need a space after them, so `3.5 hours` is not a bullet.
- **Split**, for a todo with at least 2 bullet lines. The result is a list of items:
  - Lines before the first bullet are the heading, joined by spaces.
  - Each bullet line starts an item, with the bullet stripped.
  - A later line without a bullet is appended to the item above it.
  - Each item becomes `heading + ': ' + item`. If the heading already ends with `:` or `-`,
    it becomes `heading + ' ' + item` instead.
  - `split = true`; the panel shows one row per item (§3.9).
- **One item** in every other case, and always for a meeting:
  - a single leading bullet is stripped;
  - the text is collapsed.
- **Toggle by hand**:
  - Split on: the current text, one item per line (`splitItems`). Text without line breaks
    becomes one row.
  - Split off: the rows joined with spaces (`collapseText`).
  - The Save buttons show the count ("Save 3 & close"). Empty rows are skipped when saving.
- Recognition fills the field only while the user hasn't typed (per item key). It never
  overwrites typed text.

### 3.6 Mark for later

**Button** (`index.js`):
- `registerButton(2, ['NOTE','DOC'], {id: MARK_BUTTON_ID = 300, name: 'Mark for later',
  icon: assets/mark.png, editDataTypes: [0,1,2,3,4], showType: 0})`.
- A module-level `registerButtonListener` handles id 300. It works whether or not `App` is
  mounted, and switches on Debug logging from the settings (spike pattern).

**Pipeline** (`storage/marks.ts` `createMarkFromLasso()`). Timings are logged; about 2 s in
the spike.
1. `readLasso()`. Empty selection: outcome "Nothing to mark", done.
2. `saveLassoPreview` to the mark's data folder.
3. `setLassoBoxState(2)`, which hides the lasso.
4. `insertBookmark(page, rect, id)` (§3.8), then `PluginNoteAPI.saveCurrentNote()`.
5. `writeMarkData(id, …)`.
6. `addMarkLine(owner, mark)`. **This is the commit point.** If it fails, the icon is removed
   again (best-effort) and the outcome is an error.
7. Outcome. Success is silent. Failures go to `markOutcomeStore` (module state). Then
   `PluginManager.showPluginView()`: App reads the store on render and shows the small screen
   from screen F ("Mark saved, icon missing · Try icon again / OK", or the error).
   - If `showPluginView` doesn't work from a `showType: 0` handler (device check D3), the
     outcome is shown in the status slot the next time gtdpara opens.

**Writing a mark line** (`storage/markStore.ts`):
- `addMarkLine(owner, mark)` and `removeMarkLine(owner, id)`.
- They run on one **serial queue** (a promise chain) and always read the data file **from
  disk**. The Mark button runs while gtdpara's cache may be old or missing.
- They change only the `## Marks` span, then `writeTextFile`.
- If a cache exists, `applyItemRawContent(path, raw)` / `applyInboxRawContent(raw)` (new in
  `dataCache.ts`) re-parse that file into the cache and notify listeners. A later Quick Add
  save, which starts from the cached `rawContent`, therefore keeps the mark. Without this,
  the next todo saved into the same file would drop the line.

**Mark for later from the Capture screen** runs the same pipeline (the lasso is still active),
then `closePluginView()`.

### 3.7 The Capture screen (one component, two sources)

```ts
type CaptureRequest =
  | {source: 'lasso'}
  | {source: 'marks'; scope: {type: 'all'} | {type: 'item'; path: string};
     returnTo: 'inbox' | 'current' | 'review' | 'closeOut'};
```

**App**:
- `mode === 'capture'` renders `<CaptureScreen request={captureRequest} …/>`, keyed by
  `captureNonce` as today.
- Lasso button 200 sets `{source: 'lasso'}`.
- `openMarks(scope, returnTo)` is new, and also goes on `navRef`/`stableNav` for the kept
  Current tab. It sets the marks request.
- **Return**:
  - From marks mode, Close and Save & close go back to `mode 'tabs'`, on the tab they came
    from. The close-out state is kept by App, so the wizard reloads its findings.
  - From lasso mode, Save & close calls `closePluginView()` (return to the note, as today).

**Layout** (`screens/CaptureScreen.tsx`, rewritten; budget in §4):
- Header: "New from Lasso" / "Marks", the source note and page.
- Status slot.
- Body is a row: `MarksColumn` (flex 1) | `CapturePanel` (flex 2).
  - With no open marks in scope and source lasso, the column isn't rendered and the panel
    takes the full width.

**`ui/capture/MarksColumn.tsx`**:
- A `PagedSection` over flattened rows: `group` (file name + count, 30 px), `lasso` (this
  lasso), and `mark`.
- A mark row:
  - picture: `Image` 90 px high, `resizeMode: contain`, column width;
  - or text: up to 2 lines;
  - plus "p3 · 10:42" (or "p3 · Fri").
  - Fixed heights: picture row 128 px, text row 76 px.
  - `rowHeight` reads the row state, so a row switching to text re-pages without clipping.
- Groups: this note first, then by the oldest mark. Within a group, rows sort by page, then
  time.
- A tap selects. The current draft is kept per mark in a `Map` until the screen closes
  (never saved implicitly).

**`ui/capture/useRecognitionQueue.ts`**:
- Recognition states: `waiting | recognizing | done | empty | failed`, per id.
- Order: the selected row first, then the next 3 in list order. Only one runs at a time
  (§3.4). It refills after every result and after every selection change.
- Results live in memory only.
- A text-box-only mark is `done` at once.
- `empty` and `failed` show "no text found, type it". `failed` is logged with the host's
  error.

**`ui/capture/CapturePanel.tsx`**:
- The picture: 180 px, contain.
- `QuickAddWidget variant="capture"`.
- The extras below it.

**Save** (`onAddTask` / `onAddMeeting` closures in CaptureScreen):
- Link: `→ [[<note>#page=<n>]]`, with n 1-based, when "Link to this page" is on (default on).
  - Opening it calls `openPath(abs, n - 1)`.
  - `noteLinks.ts` / `parseSharedNoteAnchor` treat `#page=<digits>` as a page and everything
    else as a keyword, as before.
  - Older versions read the anchor as a keyword and open the note at its first page.
- Split: one `addTaskToDestination` per item, in order, all with the same flow, tags, due,
  destination and link.
- Marks mode, after a successful save:
  - `removeMarkLine`;
  - `swapToDone(mark)` (§3.8; a failure is a warning in the status slot, not an error);
  - `deleteMarkData`;
  - then select the next mark.
  - If none is left, return (Save & next) or go as the button says.
- Direct capture, after a save:
  - `setLassoBoxState(2)` (once);
  - Save & next clears the text and flow chips and keeps the type, destination and link, as
    Quick Add does after an add;
  - the lasso row shows "n saved".
- **Discard…** confirms in the status slot ("Discard mark 'Room for offsite?' and remove its
  bookmark from Offsite prep.note p3?"), then `removeMarkLine`, `removeIcon`,
  `deleteMarkData`. The note's strokes are never touched.
- **Open page**: `openPath(abs, mark.page)`. This closes the plugin view through the host.

**Cancel / Close**: nothing is saved. In lasso mode the lasso stays, as today.

### 3.8 Icons (`supernote/markIcons.ts`)

- **Bookmark**:
  - Created with `createElement(GEO)`, `geometry = GEO_polygon` (spike `bookmarkPolygon`,
    black, penWidth 200), `userData = 'gtdpara:mark:<id>'`.
  - Inserted with `PluginCommAPI.insertPageElements([el], page)`.
  - One retry after error 105 (500 ms), then `saveCurrentNote()`.
  - Box: `iconBox(rect)`, 28 px, at the top right inside the lasso.
- **Find**: by `userData` on the page (`getElements(page, path)`), falling back to a scan of
  all pages (pages may have shifted).
- **Change or remove** only when the found element's `numInPage` is **unique** on that page.
  In PDFs the `.mark` layer repeats numbers (spike round 3); otherwise the icon is left as it is
  and the result says so.
  - Note open in the host (`mark.path === getCurrentFilePath()`): `modifyPageElements` /
    `deletePageElements`, then `saveCurrentNote()`.
  - Any other file: `PluginFileAPI.modifyElements(path, page, [el])` / `deleteElements`.
- **Done icon**:
  - The same element changed in place: geometry points become a check-mark polygon
    (`checkPolygon(box)`), and `userData` becomes `gtdpara:mark:<id>:done`.
  - Modifying in place avoids an insert into a closed file.
- **Pending**: if a change fails (busy note, error 105), `{id, action, path, page}` goes into
  `data/marks/pending-icons.json`. It is retried when that file is the current note:
  - when Capture or Mark runs there;
  - when the processing screen opens from it.
  - The icon is cosmetic, so it never blocks the save.

### 3.9 `QuickAddWidget variant="capture"`

The widget stays one component (§1 of `technical-design-unified-quickadd.md`). The capture
variant adds props and does not fork it.

```ts
variant?: 'default' | 'capture';
captureSeed?: {key: string; text: string; split: boolean; kind: 'task' | 'meeting'} | null;
onCaptureSubmit?: (mode: 'next' | 'view' | 'close') => void;   // after a successful add
captureDestination?: Destination;                              // "File to" chip state
onCaptureDestinationChange?: (d: Destination) => void;
captureExtras?: React.ReactNode;                               // link checkbox, Mark/Cancel or Open/Discard/Close
```

- **Pure composition**: the text building in `submitTaskCreate` moves to
  `domain/quickAddCompose.ts`: `composeTaskText(draft)`, covering the flow tag, waiting-on,
  due, and abbreviation strip / target. It gets tests, and both variants call it. This step
  also benefits the default variant.
- **R2 (capture)**:
  - one item: a multiline `TextInput`, 3 lines visible and growing to 6, plus 📅;
  - split: one row per item (`ui/capture/SplitRows.tsx`). Each row is a single-line
    `TextInput` (editable) with a ✕ that removes it. Up to 6 rows are shown; with more, the
    rows page with ‹ › in the row header, so nothing scrolls. The 📅 sits on the header line.
    Rows are state (`string[]`) in the widget's capture draft, so editing one row never
    re-splits the others;
  - a "Split lines" checkbox in R1's right corner (todo only);
  - `captureSeed` replaces the draft when its `key` changes and the draft is untouched.
- **R3**: unchanged (flow chips, w/f → Waiting on). Meeting: the time field. The meeting date
  starts at the mark's day (`initialDate`).
- **R4 (capture)**:
  - "→ <destination>", then Save & next, Save & view, Save & close.
  - With split, the labels read "Save 3 & …".
  - Each button submits (`composeTaskText` per item), awaits `onAddTask`, then calls
    `onCaptureSubmit(mode)`.
- **Below R4 (capture only)**:
  - `TagChipGrid`: recent tags in wrapped rows, up to 3 rows, no paging. It reuses `TagChips`'
    insert/remove handlers.
  - "File to": all active and on-hold abbreviations from `useAbbrevItems`, plus "Inbox".
    - The selected chip comes from `captureDestination`.
    - A typed `#ABBR` still wins, as in Quick Add.
  - `captureExtras`.
- The Note tab, the edit styles, Refile and the "M" toggle are not rendered in capture.

### 3.10 Marks in the rest of the app

- **List** (`storage/marksList.ts`):
  - `listOpenMarks(scope)` is built from the cache: the Inbox's marks plus each item's marks,
    each with its owner and resolved absolute path.
  - It is pure grouping and sorting, in `domain/marks.ts`.
- **Card** (`ui/MarksCard.tsx`):
  - "n marks to process", a sub-line ("3 notes · oldest 3 days"), and "Process ›".
  - Fixed height 56 px. Rendered only when n > 0, between Quick Add's divider and the
    flex-weighted lists, so the lists shrink by themselves.
  - Placed on `InboxScreen` (scope all), `ProjectDataPanel` (scope item, via `stableNav`) and
    Review `renderInboxZero` (scope all, `returnTo 'review'`).
- **Review**: `inboxOpenCount` adds the number of all open marks, so the Inbox to zero count
  and the auto-reviewed rule include marks.
- **Close out**:
  - `FindingId` gets `'openMarks'`, and `ReadinessInput` gets `marks`.
  - Severity is **warning** (Tilman, 2026-10-05), caption "move to the Inbox on archive".
  - Archiving does not lose them: the archive step moves the remaining `## Marks` lines from
    the project's file into Inbox.txt. Their links are rewritten to the archived note's
    absolute path. The bookmark in the note stays, and the private data is unchanged (keyed
    by id). An archived project leaves the cache, so without the move its marks would never
    be seen again.
  - `ChecklistStep` actions: "Process ›" (`openMarks({item}, 'closeOut')`) and "Discard…".
- **Integrity check**:
  - `'## Marks'` goes into `RECOGNIZED_HEADINGS`.
  - New check `marks`. Per item: the note is missing (`io.fileExists`), or the mark data is
    missing. Whole run: data without a line, i.e. orphans.
  - Report only, as for the other checks. Orphans are also cleaned up automatically (§3.3).
- **Debug bundle**: `marks: open N (inbox a · items b) · data n · pending icons k`.
- **Help topic**: capture mode maps to the new page `lasso`.

### 3.11 What stays as it is

- Lasso button 200's name and position.
- Return to origin. `'resume'` already turns `capture` back into `tabs`.
- Daily, Week and Month show no marks.
- Settings: no new setting.

## 4. Screen budget (A5 X, 1404 × 1872)

| Area | Height |
|---|---|
| Header + status slot | 70 + 36 |
| Picture | 180 |
| R1 + R2 (3 lines) + R3 + R4 | 48 + 120 + 44 + 52 |
| Total up to the Save buttons | ≈ 550 px. The keyboard band starts at 1248, so there's room even with a 6-line R2 in split mode. |
| Tags (3 rows), File to (2 rows), link, extras | ≈ 330 px; tap-only, so the keyboard band is fine |

- Marks column: 468 px wide.
- A page holds about 8 picture rows or 13 text rows over the 1740 px body, less the group
  headers.
- The capture panel is 936 px wide. QuickAdd's text width becomes a prop (it is 678 px today).

## 5. Files

| File | Change |
|---|---|
| `src/domain/types.ts` | `Mark` |
| `src/domain/marks.ts` (new) | line parse/serialize, `newMarkId`, `markOwner`, grouping/sorting, `checkPolygon`/`bookmarkPolygon`/`iconBox` (from the spike) |
| `src/domain/captureText.ts` (new) | §3.5 |
| `src/domain/quickAddCompose.ts` (new) | composition moved out of QuickAddWidget |
| `src/domain/markdown.ts` | `MARKS_HEADING`, `parseMarksSpan`, `writeMarksIntoContent` |
| `src/domain/closeOut/readiness.ts` | `openMarks` |
| `src/domain/integrityCheck.ts` | heading list, `marks` check |
| `src/domain/buttonIds.ts` | `MARK_BUTTON_ID = 300` |
| `src/domain/helpTopics.ts` | `lasso` |
| `src/domain/noteLinks` / anchor parsing | `#page=<n>` |
| `src/storage/projectFile.ts`, `dataCache.ts` | marks fields; `applyItemRawContent`, `applyInboxRawContent` |
| `src/storage/markStore.ts`, `markData.ts`, `marks.ts`, `marksList.ts` (new) | §3.3, §3.6, §3.10 |
| `src/storage/closeOut/context.ts` + the archive step, `integrityCheck.ts`, `debugBundle.ts` | §3.10 (archive moves open marks to the Inbox) |
| `src/supernote/lassoRead.ts`, `strokeRecognition.ts`, `markIcons.ts` (new) | §3.4, §3.8 (ported from spike) |
| `src/supernote/fileSystem.ts` + `android/.../GtdParaFileModule.kt` | `getPrivateDataDir`, `deletePrivateDataTree` |
| `src/ui/QuickAddWidget.tsx`, `ui/TagChipGrid.tsx` (new) | §3.9 |
| `src/ui/capture/MarksColumn.tsx`, `CapturePanel.tsx`, `SplitRows.tsx`, `useRecognitionQueue.ts`, `ui/MarksCard.tsx` (new) | §3.7, §3.10 |
| `src/screens/CaptureScreen.tsx` | rewritten (§3.7) |
| `App.tsx`, `index.js` | capture request, `openMarks`, mark outcome screen; Mark button + listener |
| `src/screens/InboxScreen.tsx`, `ProjectDataPanel.tsx`, `ReviewScreen.tsx`, `ui/closeOut/ChecklistStep.tsx`, `CloseOutWizard.tsx` | card / count / finding |
| `assets/mark.png` (new) | toolbar icon |
| `__tests__/domain/marks.test.ts`, `captureText.test.ts`, `quickAddCompose.test.ts`, `markdownMarks.test.ts`, `closeOut/readiness`, `integrityCheck` (extended), `__tests__/storage/markStore.test.ts`, smoke renders of CaptureScreen (both sources) and QuickAddWidget capture | §7 |
| `docs/user/lasso.md` (new), `quick-add.md`, `review.md`, `close-out.md`, `files-and-folders.md`, `index.md` | help |
| `CHANGELOG.md`, `README.md`, `PRIVACY.md`, `docs/dev/design-overview.md`, `DEVELOPMENT-POLICY.md` §3 | docs |

- File-format change: the new `## Marks` section, which older versions keep untouched, and the
  `#page=` anchor. Both get an **Upgrade note**.
- No new setting and no new permission.

## 6. Implementation plan

One commit per step on `feature/lasso-0.8`. Each step ends with `npx tsc --noEmit` and
`npm test`. Steps with UI also get a smoke render. Two device checkpoints (A and B) come early,
because the risky parts are on the device.

| Step | Content | Commit message |
|---|---|---|
| S1 | Pure domain: `marks.ts`, `captureText.ts`, `quickAddCompose.ts` (+ QuickAddWidget calls it, no visible change), tests | `lasso 0.8: S1 pure mark/text/compose logic` |
| S2 | File format: `## Marks` parse/write, cache fields, `applyItemRawContent`/`applyInboxRawContent`, `markStore` with serial queue, round-trip tests (old files, unknown lines, missing section) | `lasso 0.8: S2 ## Marks section and mark store` |
| S3 | Native private data folder + `markData.ts`; `lassoRead`, `strokeRecognition`, `markIcons` ported from the spike | `lasso 0.8: S3 private mark data, lasso read, shifted recognition, icons` |
| S4 | Mark button (`index.js`, asset), `createMarkFromLasso`, outcome store + App mini screen; Capture's recognition switched to `readLasso` + `recognizeStrokes` (bug fix, old screen otherwise) | `lasso 0.8: S4 Mark for later button and recognition fix` |
| **A** | **Device checkpoint**: D1-D5 (§7.2) with a build from S4 | - |
| S5 | `QuickAddWidget variant="capture"`, `TagChipGrid`, File-to chips | `lasso 0.8: S5 Quick Add capture variant` |
| S6 | Capture screen rewrite: request, `MarksColumn`, `CapturePanel`, recognition queue, save/split/link `#page=`, marks mode (Open page, Discard, done icon), App wiring | `lasso 0.8: S6 shared capture and marks screen` |
| **B** | **Device checkpoint**: §7.2 Capture + processing items | - |
| S7 | Entry points: Inbox / Current / Review cards and count, Close-out `openMarks`, integrity check, orphan cleanup, debug bundle | `lasso 0.8: S7 marks in Inbox, Current, Review, Close out, integrity` |
| S8 | Help pages, CHANGELOG, README, PRIVACY, design-overview, policy §3; "As built" here | `lasso 0.8: S8 docs` |

Estimated size: S6 is the largest (the screen plus the widget props). S1-S3 are mostly
mechanical or ported from the spike.

## 7. Tests

### 7.1 Automated

- `captureText`:
  - dash, box, dot and numbered lists;
  - heading prefix, also with `:` / `-` endings;
  - a continuation line;
  - a single bullet;
  - no bullets (collapse);
  - `3.5 hours` not treated as a bullet;
  - meeting is always one line;
  - the round-6 strings (`☐ Test Box\n- Test Dash\n• Test Bullet` gives 3 items).
- `marks`:
  - line round trip (relative and absolute path, text, no text);
  - a malformed line stays in extras;
  - the `markOwner` cases (project, area subfolder, Inbox folder, Resources, Archive, PDF
    outside Note, item without data file);
  - grouping and order.
- `markdown`: a section in a file without one, in front of and after other sections, and
  removing the last mark (the heading stays empty, like Weekly Goals).
- `markStore`: queue order; reads from disk; the cache is updated so that a later `saveTasks`
  keeps the mark line (the regression this design prevents).
- `quickAddCompose`: today's behavior, so the default variant doesn't change.
- `closeOut/readiness`: an `openMarks` warning; ok when empty. Archive move: the mark lines
  land in Inbox.txt with rewritten absolute links, and the project's section is empty.
- `integrityCheck`: `## Marks` duplicates, a missing note.
- Smoke renders: CaptureScreen lasso without marks (no column), CaptureScreen marks mode, and
  QuickAddWidget capture with split.

### 7.2 Device test (demo space)

Checkpoint A (S4 build):
- [ ] D1 Mark, then install the same build over the old one: the private data is still there,
      and the mark still recognizes.
- [ ] D2 The preview is written into the private folder (else the EXPORT fallback).
- [ ] D3 A forced failure (e.g. a read-only note or a PDF page) opens the small screen via
      `showPluginView` (else it shows on the next open).
- [ ] D4 The bookmark appears in about 2 s, in a note and in a PDF. The note stays open. After
      closing and reopening, the icon is still there.
- [ ] D5 Capture of text low on the page (below 1400 px) recognizes in full: the original bug.

Checkpoint B and final:
- [ ] Mark 3 areas in a project note and 1 in a Resources PDF. The project's Current tab shows
      "3 marks"; the Inbox shows 4. `## Marks` lines are in project.txt and Inbox.txt.
- [ ] Process from the Inbox: rows show pictures, then text (pre-fetch). Save & next goes
      through all of them. The icons turn into ✓ (PDF: ✓, or unchanged and reported).
- [ ] A list with `☐` / `-` / `•`: split on by itself, bullets gone. With a heading, the
      heading is in front of each item.
- [ ] Without bullets: one item, line breaks removed. Toggle on: one item per line.
- [ ] Save & next in direct capture: the form is cleared, the destination kept, a typed extra
      todo is saved.
- [ ] "File to" chip changes the destination, Inbox chip included. Typed `#ABBR` wins.
- [ ] Meeting from a mark: the date is the mark's day; the time field takes `15-16.30`.
- [ ] Link to this page opens the note at that page.
- [ ] Discard: confirmation names the mark; the icon is gone; the strokes stay.
- [ ] Delete a mark line by hand on the PC: the mark is gone in gtdpara. Its data is removed a
      day later and reported by the integrity check meanwhile.
- [ ] Close out a project with an open mark: warning, Process › opens the marks, and back.
      Archive with a mark left: it shows in the Inbox afterwards, and Open page finds the
      archived note.
- [ ] Review: the Inbox to zero count includes marks, and the card is shown.
- [ ] Capture with no open marks: no column, full-width panel.
- [ ] Mark while gtdpara is kept alive with a cached project, then add a todo to the same
      project via Quick Add: the mark line is still there.

## 8. Open points

- D1-D3 decide the data location and the failure feedback. The fallbacks are in the design.
- Changing an icon in a note open in the host vs. a closed file: both paths are designed
  (§3.8). Checkpoint B shows which one works, and the "pending" queue covers the rest.
- Moving marks to the Inbox on archive (§3.10) is new work in the archive step; it reuses
  `markStore` and the operation journal's order (write the Inbox first, then clear the
  project's section).

## 10. As built (2026-10-06)

Built in steps S1-S8 plus three fix rounds after device checkpoints B and C (S6b, S6c, S6d).
Where the build differs from §1-§8:

**Capture screen**
- The source link is the item's **linked file** (the clip), `<file>#page=N` (1-based), not its
  working note: the note icon keeps creating the item's own note. `storage/linkedFiles.ts`
  `openLinkedFile` opens it at the page; the integrity check and the close-out link rewrite
  strip the anchor. A source path outside the base folder is stored absolute.
- Recognized text of a mark is kept in its `mark.json` (`recognizedText`) and preloaded when
  the screen opens, so each mark is recognized once. The recognition queue waits for that
  preload.
- The recognizer returns no line breaks for a handwritten list: boxes and dots inside a line
  (`☐ □ ☑ ☒ •`) are treated as item starts (`breakAtInlineBullets`); dashes are not, they
  occur inside text. **✂ Split at cursor** splits by hand: a caret splits there, a selection
  becomes the next item (`splitAtSelection`).
- Options row under the text: Split lines, ✂ Split at cursor, due date (📅 left R2 in the
  capture variant).
- **File to**: a short list (Inbox, the mark's or lasso's own place, the current choice,
  focused items daily → weekly → monthly, recent capture destinations from
  `storage/destinationUsage.ts`) plus **More…** with every Active item alphabetically, 15 per
  page. On Hold items are no longer offered as chips (a typed `#ABBR` still reaches them).
- Marks column: always the picture, with "p2 · 5.10. 10:42 · status" (not recognized /
  recognizing… / recognized / no text / picture missing) and one fixed row height. Text rows
  instead of pictures (§3.7) were dropped.
- Save & next on a mark always goes to the next mark; in the lasso flow, after the last mark
  (lasso already saved) an empty form without the old picture: "Lasso saved · no marks left".
  Save & close closes.
- Recognized text and status changes request an e-ink refresh; before, the text only showed
  after a tap into the field.
- For the current lasso, recognition starts right after the lasso is read, before settings,
  cache, picture and screen ("route A"). A direct recognition of the lasso elements with a
  corrected size ("route B") was considered and not built; the speed with route A was enough.
  `strokeRecognition: done` logs `build=` (time spent rebuilding strokes) for a later look.
- `CapturePanel.tsx` and `SplitRows.tsx` (§5) were not split out; the capture panel is
  `QuickAddWidget variant="capture"`.

**Rest of the app**
- The cards open the marks screen through `ui/marksNav.ts` (App registers `openMarks` once),
  not through props: they sit inside kept screens whose elements App creates once.
- Returning from the marks screen shows the tab that opened it again, freshly loaded (the tab
  shell is unmounted while the capture screen is open).
- Close-out: "Process ›" per mark; "Discard…" is in the marks screen only.
- Archive: also the direct archive (`storage/archive.ts` `archiveItem`, projects and areas,
  incl. the cascade) moves open marks to the Inbox, before the folder move; if that write
  fails, nothing is archived.
- Integrity check: `markNoteMissing` (per item). "Mark data missing" and orphan reporting were
  not added: the marks screen shows "picture missing", and orphans are cleaned up silently.
- Help: no help mapping for the capture screen (it has no tab bar); the new page
  `docs/user/lasso.md` is linked from the index, Quick Add, Review, Close out and Files.
- The temporary multi-line diagnostic (patch 0007) was removed again in S8.

**Device results**
- Checkpoint A: marks with picture and icon in 1.1-1.7 s; recognition low on the page works.
- Checkpoint B/C: bookmark and check icons, PDF text, saving, page links. Lasso with about 40
  strokes took about 11 s from button to text before route A; with route A it is "pretty fast"
  (Tilman, 2026-10-06).
