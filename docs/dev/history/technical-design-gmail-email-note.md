# Technical design - Gmail review: "Link email as note" (multi-page .note)

Status: IMPLEMENTED 2026-09-21 (not yet device-tested; needs a native rebuild + reinstall) - the assumptions in section 2 were adopted as written, with the page cap changed to 10 (below). Deviations of the as-built code from this design are listed in section 8. Replaces the `.txt` half of [technical-design-review-gmail-inbox.md](technical-design-review-gmail-inbox.md) section 9 ("Save email text as file"); attachments there are unchanged. Shares its native text-measurement module with [technical-design-textbox-metrics.md](technical-design-textbox-metrics.md) (section 3.1 there) - see 3.9. **Aligned 2026-09-21** with that concept: one native module, one wrapper (`measureTextHeight`), one shared contract (3.9).

## 1. Why (analysis 2026-09-21)

The Gmail step's "Link email text" pill worked end to end: `<Resources>/Gmail/<subject>.txt` was written and `+[[Gmail/....txt]]` landed on the Inbox.txt line. But the Supernote host cannot open a `.txt` through `PluginFileAPI.openFile`, so the clip on the task did nothing. Two adjacent findings shaped this design:

- The link gave no visible feedback (the "Created from this email" row never shows what was linked), and the failure path of `runLink` never calls `requestEinkRefresh()`, so an error text would not necessarily paint either.
- Every `onOpenLinkedFile` handler (Daily, Inbox, Review, ProjectDataPanel) does `openPath(...).catch(logError)` - a failed open is invisible. Out of scope here (section 7), but it is why the `.txt` problem went unseen.

## 2. Requirements (Tilman, decided in chat 2026-09-21)

a) The email-text pill creates a real Supernote `.note` instead of a `.txt`.
b) Content: **Subject / From / Date lines, then the full email text**.
c) A long email **continues on extra pages**; the splitting approach is the one from the sister project `NoteDraft/textboxHelper` (`src/shared/`).
d) The note **stays a linked file** (clip, `Task/Meeting.linkedFile`, single-valued) - it does NOT use the item's own `notePath`, so a Todo/Meeting can still have its own note, and the base-relative path survives filing/refiling. Location: `3 Resources/Gmail/`.
e) File name: `<date> <subject>.note`, date as `2026-01-31` (e.g. `2026-01-31 Quarterly planning.note`).
f) (From the analysis) linking gives visible feedback, and errors are visible on the e-ink screen.

Assumptions I made - please confirm or correct:

1. `<date>` is the **email's own date** (from the Date header, local time), falling back to today when unparseable. (The alternative, the day you linked it, would sort the folder by triage day instead of mail date.)
2. The note uses the **blank background** (`style_white`, via `getNoteTemplate()`), not the per-context Todo/Meeting template - `insertNotePage` with a MyStyle template path is unverified, and an email note is not "owned" by a Todo or Meeting.
3. **Page cap of 10** (Tilman, 2026-09-21: "we can cap large mails at 10 pages" - roughly 20k characters); beyond that the last page ends with a `[mail capped]` line. Newsletters can be enormous and every page costs several bridge calls.
4. Subject in the file name is sanitized (`sanitizeFileNameComponent`) and **truncated to 80 characters** (Android file names are limited to 255 bytes; a long subject would otherwise fail the write).
5. **One note per email per visit**: linking the text onto a second Todo/Meeting created from the same email reuses the first note instead of creating "(2)".
6. Text boxes stay editable (`textEditable: 1`, like the template pieces), so you can annotate the note in the NOTE app.

## 3. Design

### 3.1 Data flow

```
pill "Link email as note"
  -> ReviewScreen.handleLinkGmailArtifact(kind 'body')
       body = fetchGmailBody()                       (cached, unchanged)
       reuse existing note for this uid? -> skip to link
       storage/gmailEmailNote.saveGmailEmailAsNote()
         domain/emailNote        : file name + header/body text        (pure)
         domain/textPagination   : text -> pages[]                     (pure, measurer injected)
         supernote/textboxMetrics: native StaticLayout measurement     (bridge + fallback)
         storage/textNote        : createNote + insertNotePage + insertElements
       mutateEntryTasks/Meetings: set linkedFile (+ text guard)
       gmailCreatedItems[uid][i].linked = {kind, name}   -> row shows clip + name
```

### 3.2 Pure pagination (`domain/textPagination.ts`, new)

textboxHelper's `paginateTextIntoTextboxPages` is coupled to its native module. Here the algorithm is ported but the measurer is **injected**, so it stays in `domain/` (no RN/SDK imports, unit-testable with a fake measurer):

```ts
type MeasureHeight = (text: string) => Promise<number>;      // px at the note's text width/font
paginateText(text, measure, {maxHeightPx, maxPages, truncationNotice})
  -> Promise<{pages: {text: string; heightPx: number}[]; truncated: boolean; droppedChars: number}>
```

Algorithm (same shape as the sister project, one improvement):

1. Normalise: CRLF -> LF, strip trailing spaces per line, runs of blank lines -> one, trim.
2. Split into paragraphs on blank lines. Fill the current page paragraph by paragraph (`candidate = page + "\n\n" + paragraph`), start a new page when `measure(candidate) > maxHeightPx`.
3. A paragraph that alone exceeds a page is split in this order: **by line** (new - email text is line-structured: signatures, quoted `>` blocks; the sister project goes straight to sentences and would flatten those), then by sentence, then by word, then - for one unbreakable token such as a long URL - by characters (binary search on the prefix that fits). Every fallback level joins its parts with the separator it split on (`\n` / space).
4. After the last page, one more `measure` per page gives its final `heightPx` (used as the text box height, capped at `maxHeightPx`).
5. If more than `maxPages` pages result: keep the first `maxPages`, then append the truncation notice to the last page, removing trailing paragraphs from that page until page + notice fits.

Cost: about one native call per paragraph plus one per page. Expected well under two seconds for a normal email; unverified until the device test (section 6).

### 3.3 Native measurement (`TextboxMetricsModule.kt` port + `supernote/textboxMetrics.ts`)

- Kotlin: port `NoteDraft/textboxHelper/.../TextboxMetricsModule.kt` into `eu.embodyagile.gtdpara` (package renamed, bridge name kept `"TextboxMetrics"`). Only `measureTextLayout` is ported (returns `layoutHeight`, `lineCount`, `maxLineWidth`); `measureTextLayoutDetailed` (word hit-testing) is dropped - nothing here needs it. Register it in the **existing** `GtdParaFilePackage.createNativeModules` list next to `GtdParaFileModule`/`GmailImapModule`, so `MainApplication.kt` needs no change (a small deviation from textbox-metrics 3.1, same effect).
- JS wrapper `supernote/textboxMetrics.ts` (new, next to `fileSystem.ts` - it is a native-bridge wrapper). **This is the single measurement API of the plugin**; both this feature and the textbox-metrics feature call it and nothing else touches the native module:

```ts
export const TEXT_MEASURE_WIDTH_ADJUSTMENT_PX = 30;   // sister project's calibration (widthAdjustment)
export type TextMeasurement = {
  heightPx: number;          // calibrated: layout height + explicit-empty-line extra (see below)
  layoutHeightPx: number;    // raw StaticLayout height
  lineCount: number;
  maxLineWidthPx: number;    // widest line, measured at (widthPx - 30) - see note below
  source: 'native' | 'fallback';
};
export function measureTextHeight(
  text: string, widthPx: number, fontSizePx: number,
  opts?: {fontPath?: string},     // optional, passed through to the native module; unused by the email feature
): Promise<TextMeasurement>;
```

  - The native call requests `widthPx - TEXT_MEASURE_WIDTH_ADJUSTMENT_PX`. Consequence for callers: `maxLineWidthPx` is a width inside the *reduced* box, so a caller that wants a box that just fits the text uses `ceil(maxLineWidthPx) + TEXT_MEASURE_WIDTH_ADJUSTMENT_PX` (the metrics feature does; the email feature does not need it).
  - On a missing module or a throwing call it returns `source: 'fallback'` with the **raw, unmodified** `estimatePieceTextHeight(...)` value (`domain/meetingNoteBlock.ts`) and `lineCount`/`maxLineWidthPx` derived from the same estimate. It does **not** add a safety factor: whether to over- or under-provision on fallback is a decision of the caller, because the two consumers want opposite things (see below). The failure is `logError`-ed once per app session (not per call), so it shows up in logcat without flooding.
  - **Second calibration (found while implementing; missing from the first draft of this design):** the sister project's `estimateTextboxHeight` adds `max(fontSize + 3, round(fontSize * 1.1))` px (40 px at size 36) for every explicit empty line, because the NOTE app renders blank lines taller than a plain `StaticLayout`. Email text is full of blank lines, so without it the pages would overflow. `heightPx` therefore includes it (native path only) and `layoutHeightPx` keeps the raw value; the constants live next to the wrapper (`emptyLineExtraPx`, `countExplicitEmptyLines`). This is part of the shared contract - the textbox-metrics feature needs it for the same reason.
  - **Email pagination adds the over-provision itself**: the measurer that `saveGmailEmailAsNote` hands to `paginateText` multiplies `heightPx` by **1.15 when `source === 'fallback'`** (constant `FALLBACK_HEIGHT_SAFETY = 1.15` in `storage/gmailEmailNote.ts`). Over-provisioning is the safe failure there: too many pages, never clipped text. The metrics feature instead wants today's behaviour on fallback (the raw estimate, no factor).
- Calibration risk (same as textbox-metrics 3.3): Android `StaticLayout` in this process is not guaranteed to match the NOTE app's renderer. The bottom margin (below) is the buffer; the device check in section 6 is required, not optional.

### 3.4 Writing the note (`supernote/fileSystem.ts` + `storage/textNote.ts`)

- `fileSystem.ts`: new wrapper `insertNotePage(path, page, template)` next to `createNote`, same permission check and error mapping, plus an 8 s timeout per call (textboxHelper needed one; `insertNotePage` can hang).
- `storage/textNote.ts` (new, generic - not email-specific, so meeting minutes or other text can reuse it):

```ts
createTextNote({absolutePath, pages: {text, heightPx}[], template, onProgress}): Promise<void>
  1. createNote(absolutePath, template, true)          // existing wrapper (keeps its debug logging)
  2. for i = 1..n-1: insertNotePage(absolutePath, i, template)   // sequential, appends (as built: interleaved with step 3, see section 8)
  3. for i = 0..n-1: insertElements(absolutePath, i, [textbox])   // one textbox per page
```

  It uses the file-level wrappers only. **No `PluginNoteAPI.saveCurrentNote()`** (the sister project calls it because it edits the note that is open; the new note is not open, and `meetingNoteContent.ts` avoids `PluginNoteAPI` for the same reason - see its module comment).
- Page geometry (constants in `storage/textNote.ts`, from the sister project's tested import defaults): page 1404 x 1872 (`NOTE_PAGE_WIDTH_PX/HEIGHT_PX`, A5X like the rest of the note code), margins left 100 / top 100 / right 200 / bottom 200, so the text rect is x 100, y 100, **1104 wide x 1572 high**; font size 36 (`DEFAULT_PIECE_FONT_SIZE`). Rough capacity: about 35 lines, about 2000 characters per page.

### 3.5 Email specifics (`domain/emailNote.ts` new, `storage/gmailEmailNote.ts` new)

- `domain/emailNote.ts` (pure): `emailNoteBaseName(dateIso, subject, today)` -> `"2026-01-31 Subject"` (local date from the ISO string, `today` fallback, subject sanitized + truncated to 80); `buildEmailNoteText(message, body)` -> `"Subject: ...\nFrom: ...\nDate: 2026-01-31 14:05\n\n" + body`. The header lines have single newlines, so they stay together in the first paragraph.
- `storage/gmailEmailNote.ts`: `saveGmailEmailAsNote(paths, message, body, onProgress) -> {linkedFile, pageCount, truncated}`: `ensureFolderExists(<Resources>/Gmail)`, `collisionFreeName(folder, base, '.note')`, paginate (measurer = `measureTextHeight` at width 1104 / size 36, `heightPx` times `FALLBACK_HEIGHT_SAFETY` when `source === 'fallback'`, see 3.3), `createTextNote`, return `toLinkedFile(paths, absolutePath)` (same base-relative convention as today).
- `saveGmailEmailAsFile` and its `.txt` path are removed from `storage/gmailAttachments.ts`; `GMAIL_EMAILS_SUBFOLDER` ('Gmail') is kept. Existing `.txt` links keep working as far as they ever did (nothing migrates them).

### 3.6 Shared utilities extracted (Tilman: "reuse ... or extract shared utilities")

1. **`storage/fileNaming.ts` (new): `collisionFreeName(folderPath, stem, ext)`** - the "`stem`, `stem (2)`, `stem (3)`" loop that exists twice today (`createLinkedNote` in `noteLinks.ts`, `collisionFreeFileName` in `gmailAttachments.ts`). Both call the shared one; callers sanitize the stem themselves (`createLinkedNote`'s callers already do; `gmailAttachments.ts` does at its call sites). Behaviour-identical.
2. **`supernote/noteElements.ts` (new): `buildTextboxElement({text, x, y, width, height, fontSize, userData?, editable})`** - the `createElement(ELEMENT_TYPE_TEXT)` + `textBox` literal that `populateNoteFromDefinition` and `populateMeetingNoteBlockFallback` each spell out (and this feature would make a third copy). `textNote.ts` uses it from the start; migrating the two `meetingNoteContent.ts` call sites is **Phase 3 (optional)** because it touches working note-template code for zero behaviour change.

### 3.7 ReviewScreen / `GmailDetailPanel` changes

- `GmailCreatedItem` gains `linked?: {kind: 'body' | 'attachment'; name: string}`. After a successful link `handleLinkGmailArtifact` sets it (via `setGmailCreatedItems`); the created row then shows a second line with the clip icon (`ClipIcon` from `ui/icons.tsx`, black SVG per the e-ink icon rule) and the file name. Replaced links overwrite it.
- New screen state `gmailEmailNotes: Record<uid, linkedFile>` (reset with `gmailCreatedItems` on step entry). Linking the email text for a second item of the same email reuses that file (after a `linkedFileStatus` check; if it is gone, it is recreated).
- Pill labels: "Link email as note" (was "Link email text"); while running "Creating note... page 2/5" (progress from `onProgress`); the pill of the currently linked artifact reads "✓ ..." and is disabled, the others stay tappable and replace the link (single-valued).
- `runLink` (and `runAction`) call `requestEinkRefresh()` in `.finally`, so busy state, progress, success and errors all paint.
- Guard against index drift: the `mutateEntryTasks/Meetings` callbacks in `handleLinkGmailArtifact` additionally check `next[item.index].text === item.label` (`title` for meetings) and throw the usual "changed on disk - tap refresh" message otherwise. Today only existence at that index is checked, so a shifted Inbox would silently link the wrong item.

### 3.8 Failure handling

- `createNote` blocked (plugin launched from a PDF/epub - the confirmed host restriction, see `bugfix_createnote_blocked`): nothing is written; the panel shows the existing "note creation was blocked by the device: ..." error. No fallback - a `.txt` would not open anyway.
- Failure after `createNote` succeeded (e.g. `insertNotePage` times out on page 4): the plugin has no delete capability for files, so a partial `.note` stays in `Resources/Gmail`. The error names the file; retrying creates "(2)" and the reuse map is only filled on success. Accepted; pagination and measurement happen before the first write, so what is left to fail is only the host API calls.
- Measurement fallback: see 3.3.

### 3.9 Relation to the textbox-metrics concept - shared contract

[technical-design-textbox-metrics.md](technical-design-textbox-metrics.md) (sizing the textboxes that `meetingNoteContent.ts` writes) was aligned with this design on 2026-09-21 so the two features dock onto the same base. Split of responsibilities:

| Layer | Owner | Used by |
|---|---|---|
| `TextboxMetricsModule.kt` (only `measureTextLayout`), registered in `GtdParaFilePackage` | **this design, Phase 0** | both |
| `supernote/textboxMetrics.ts` - `measureTextHeight`, `TextMeasurement`, `TEXT_MEASURE_WIDTH_ADJUSTMENT_PX` (3.3) | **this design, Phase 0** | both |
| `supernote/noteElements.ts` - `buildTextboxElement` (3.6) | this design (Phase 2 for `textNote.ts`) | both; metrics feature via Phase 3 |
| `domain/textPagination.ts`, `storage/textNote.ts`, `storage/gmailEmailNote.ts` | this design | email feature only |
| `storage/notePieceMetrics.ts` - `measureNotePieceRect(text, x, fontSizePx)` (content-fit width, fallback to today's estimate) | **textbox-metrics design** | metrics feature only; **builds on** `measureTextHeight`, adds no second bridge |

Interface contract (what must stay stable so neither feature breaks the other):

1. `measureTextHeight`'s signature and the `TextMeasurement` fields above. Adding fields or options is fine; renaming/removing is a breaking change for both.
2. The wrapper never throws and never applies a caller-specific safety factor; it reports `source` and callers decide.
3. `maxLineWidthPx` is measured at `widthPx - TEXT_MEASURE_WIDTH_ADJUSTMENT_PX`; the constant is exported so nobody re-hardcodes 30.
4. `buildTextboxElement({text, x, y, width, height, fontSize, userData?, editable})` is the one place that spells out the `createElement(ELEMENT_TYPE_TEXT)` + `textBox` literal. The metrics feature will pass its own `width`/`height` from `measureNotePieceRect`; the email feature passes the full text rect.
5. Page geometry constants (`NOTE_PAGE_WIDTH_PX/HEIGHT_PX`, `DEFAULT_PIECE_FONT_SIZE`, `DEFAULT_PIECE_X/Y`) keep their current single home; nothing new is duplicated.
6. `domain/meetingNoteBlock.ts` (`estimatePieceTextHeight`, `pieceWidthPx`) stays untouched; it is the wrapper's fallback and the metrics feature's fallback.

Open question 2 of the metrics doc (content-fit width per piece type) does not affect this feature - email pages always use the full text rect width.

**Sequencing.** Whichever feature lands first builds Phase 0 exactly as specified here (the Kotlin port needs one native rebuild - doing it once is the point). If the metrics migration follows, it should be done together with Phase 3 (`buildTextboxElement` in `meetingNoteContent.ts`) in one pass over those two call sites, so the working note-template code is touched once.

## 4. Files touched

New: `domain/textPagination.ts`, `domain/emailNote.ts`, `supernote/textboxMetrics.ts`, `supernote/noteElements.ts`, `storage/textNote.ts`, `storage/gmailEmailNote.ts`, `storage/fileNaming.ts`, `android/.../eu/embodyagile/gtdpara/TextboxMetricsModule.kt`.

Edited: `android/.../GtdParaFilePackage.kt` (register module), `supernote/fileSystem.ts` (+`insertNotePage`), `storage/gmailAttachments.ts` (drop `.txt` writer, use `fileNaming`), `storage/noteLinks.ts` (use `fileNaming`), `screens/ReviewScreen.tsx` (`GmailCreatedItem`, `handleLinkGmailArtifact`, `GmailDetailPanel`, refresh calls), this design's pointer in `technical-design-review-gmail-inbox.md`, `design-overview.md` sections 2/4/5 after implementation. Phase 3 only: `storage/meetingNoteContent.ts`.

Not touched: `domain/meetingNoteBlock.ts`, `ui/textLineEstimator.ts`, anything in the plugin's own UI row estimation.

## 5. Phasing (each phase compiles and is testable on its own)

- **Phase 0 - native measurement.** Kotlin port + registration + `supernote/textboxMetrics.ts` (contract in 3.9; shared with textbox-metrics). Device check: a debug log of `measureTextHeight` for a few known strings (1 line, 10 lines, one long URL) confirming sane numbers and `source: 'native'`. Needs a rebuild + reinstall (native change).
- **Phase 1 - pure pieces.** `domain/textPagination.ts`, `domain/emailNote.ts` with a scratch Jest test using a fake measurer (fill, oversize paragraph by line/sentence/word/char, cap + notice, empty body, header date fallback, filename truncation).
- **Phase 2 - the feature.** `fileNaming`, `noteElements`, `insertNotePage`, `textNote`, `gmailEmailNote`, ReviewScreen/panel changes, removal of the `.txt` writer.
- **Phase 3 (optional).** Migrate `meetingNoteContent.ts`'s two textbox literals to `buildTextboxElement`; behaviour-identical. If the textbox-metrics migration is done, do it in the same pass (3.9).

## 6. Verification / device checks

Compile-time: tsc scratch pass over all touched files (per this repo's routine); after every commit re-stage and md5-compare (standing revert mitigation, `gtdpara_project.md`).

On the device:
1. Short email -> one page, header + text, tapping the clip on the Todo opens the note (also from Inbox and Daily).
2. Long email (about 10k characters) -> the expected number of pages, **no text clipped at the page bottom** and no large empty gap - this is the calibration check (predicted fill vs. what the NOTE app actually shows; adjust `widthAdjustment` / bottom margin if needed).
3. Two Todos from the same email -> both link to the same note, no "(2)".
4. Launched from a PDF/epub -> the clear blocked-by-device error, nothing left behind.
5. Row shows clip + name after linking; an error (e.g. force one) is visible without a manual refresh.
6. Very large email -> 10 pages, last page ends with `[mail capped]`, creation time acceptable.

## 7. Out of scope / found on the way

- **Open errors are swallowed** in the four `onOpenLinkedFile` handlers (Section 1). A visible error there is a separate small bugfix.
- **Gmail-step quick-file ignores the destination.** `QuickAddWidget` passes `(text, destination)` to `onAddTask`/`onAddMeeting` (an `#abbrev` tag resolves to a Project/Area and strips the tag), but `GmailDetailPanel` wires `text => onAddTask(message, text)`, so the item always goes to Inbox with the tag removed. Separate bugfix; not verified on the device.
- **Attachment allow-list still offers `text/plain`.** `SUPPORTED_ATTACHMENT_MIME_TYPES` (`gmailAttachments.ts`) includes plain text, which this analysis showed the device cannot open. Whether to drop it (and what about .doc/.docx) is your call; not changed here.
- Background templates per context for email notes; other device page sizes (would use `PluginFileAPI.getPageSize`); deleting a half-written note (no delete capability).
- Sister project: `textboxHelper/src/shared/supernoteTextPagination.ts` has a stray `c` on line 14 (would throw at module load) - fix it there; it is not copied here. The `new code/` folder in the gtdpara root holds the copied NoteDraft `MainActivity.kt`/`MainApplication.kt` too - those must never replace gtdpara's own files; delete the folder once the port is done.

## 8. As built (2026-09-21) - deviations from the design above

- **Page cap 10, notice `[mail capped]`** (`EMAIL_NOTE_MAX_PAGES`, `EMAIL_NOTE_TRUNCATION_NOTICE` in `domain/emailNote.ts`), instead of 30 / a "N more characters" line. Input is also clamped to 60,000 characters before pagination so a pathological mail never reaches the measurer; the paginator stops measuring as soon as a page beyond the cap starts.
- **Empty-line calibration** in the wrapper (see 3.3) and `TextMeasurement.layoutHeightPx`.
- **`createTextNote` interleaves** page creation and text insertion (`insertNotePage(i)` then the textbox for page i) instead of creating all pages first; same API calls and order per page, and it gives natural per-page progress ("Creating note... page 2/5", shown on the running pill).
- **Progress**: `saveGmailEmailAsNote(..., onProgress(text))`, `handleLinkGmailArtifact(..., onProgress)`, `GmailDetailPanel.runLink(key, fn(onProgress))`.
- **File header / date line**: `Date:` shows `2026-01-31 14:05` (local) or, when the message has no parseable date, today's date without time.
- **Drift guard** compares trimmed text/title; a mismatch throws "...changed on disk - tap refresh".
- **Not done (unchanged from the design)**: `text/plain`/`.doc`/`.docx` are still in `SUPPORTED_ATTACHMENT_MIME_TYPES`; swallowed open-file errors in four screens and the quick-file destination in the Gmail step are separate bugfixes; Phase 3 (`meetingNoteContent.ts` -> `buildTextboxElement`).
- **Tests**: no Jest in the scratch environment; `domain/textPagination.ts` and `domain/emailNote.ts` were exercised with a plain node script (33 checks: fill, oversize by line/sentence/word/char, surrogate pairs, cap + notice, early stop, blob of 100k characters, file-name and header rules), and the whole write flow with mocked host calls (call order, collision "(2)", 10-page cap).
