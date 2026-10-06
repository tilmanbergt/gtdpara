# Spike: Project close-out review + archive PDF

Status: spike code written 2026-09-28, not yet run on the device.
Next after the spike: UX mockups, then `technical-design-project-close-out.md`.

## 1. Requirements decided (chat 2026-09-28)

Numbers match the 31 questions from the requirements round.

### PDF content and format
1. Note pages are rendered as images. Cover, table of contents (TOC) and project record are real text, so they are searchable and clickable. Searchable handwriting (OCR text layer) is v2.
2. Note pages must include their background template. The spike checks whether this needs compositing.
3. Links inside notes are dead in v1. Every item is still reachable through the TOC.
4. Merging existing PDFs into the archive PDF is optional in v1, probably only for PDFs with a few pages. The spike tests rasterizing pages plus the `.mark` annotation overlay.
5. Other file types (epub, docx, audio, ...) are not included. The TOC lists them as "not included, kept in folder".
6. Default is 1x scale, grayscale. 2x is a Settings option.
7. Plain PDF 1.4. No PDF/A, no embedded fonts: text uses Helvetica with WinAnsi encoding and bookmarks use UTF-16.
8. Each page can have its own size.
9. Locked notes: just notify (a rare edge case).
10. Order: cover, TOC with links plus PDF bookmarks, project record as text, meeting notes in date order, todo notes, email notes and attachments, other notes and documents, then an index of files not included with their new location.
11. Shared notes (for example `Daily.note`): each meeting TOC entry jumps to its keyword page. Pages without a matching keyword go under "Other pages of <file>".
12. Handwritten retrospective page: v2.
13. Include by default: everything inside the project folder. Exclude by default: linked files outside the folder, and PDFs in general. Both are listed in the index. Every file can be switched on or off.
14. New frontmatter field `doneAt`, set when the status changes to Done.

### Outcomes
15. Routing is per file: stays with the project, moves to the Area (or a subfolder), or moves to Resources (or a subfolder). The PDF keeps a snapshot marked "moved to ...".
16. Move only, no copies.
17. Links to moved files are updated automatically. Links from outside into the archived folder are flagged in the checklist.
18. Open todos can be done, cancelled, or moved to the Area or Inbox. The PDF records "moved to X".

### Archive layout
19. The year is the done year (`doneAt`). Fallback: the archive date.
20. The project folder goes to `Archive/<Y>/<Area>/<Project>/`, or `Archive/<Y>/<Project>/` when there is no area. Missing year or area folders are created. A name collision is a blocker.
21. The one project PDF sits directly below the area folder, or the year folder when there is no area: `Archive/<Y>/<Area>/<Project>.pdf` or `Archive/<Y>/<Project>.pdf`. It is not inside the project folder.
22. v1 keeps all originals next to the PDF. "PDF only, delete the originals" is a later option.
23. Full-area archive switches to `Archive/<Y>/<Area>/` and merges into a folder that may already exist. Tilman migrates the old flat `Archive/<name>` entries by hand.
24. Projects without an area are allowed. This is not a checklist item.

### Checklist and flow
25. Readiness checklist:
    - no open todos
    - no future or recurring meetings
    - meetings to close out are handled
    - no goals, focus or month highlights still referencing the project
    - no links into the folder from outside
    - no name collision at the target
    - locked notes (notify only)
26. Dropped projects use the same flow, marked "Cancelled" on the cover. The flow can also start from Active or On Hold.
27. Whether a note that is open while the plugin runs can safely be moved: see check S8 below.
28. A wizard inside the "Done awaiting review" step, also reachable from the project detail page: checklist, select contents, outcomes, create PDF, check it, archive. Decisions are saved in `project.md` so you can stop and continue. Quick archive without a PDF is allowed, but it still goes through the checklist.
29. After creation the PDF opens in Supernote for checking. Archiving only happens after you confirm.
30. Progress display. The file is written to `<name>.pdf.part` and renamed at the end. A size cap may be needed, based on spike numbers.
31. The Review-hub step counts as reviewed only when you tap Reviewed.

## 2. What the SDK gives us

The SDK has no PDF API. What it does have:
- `generateNotePng({notePath, page, times: 1|2, pngPath, type: 0 transparent | 1 white})`
- `generateNoteTemplatePng(notePath, page, pngPath)`
- `getPageSize(notePath, page)` (pixels)
- `getFileMachineType(notePath)`: 0 A5, 1 A6, 2 A6X, 3 A5X, 4 Nomad, 5 Manta
- `getTitles(notePath, pageList)`
- `getMarkPages(filePath)`
- `generateMarkThumbnails(markPath, page, pngPath, size)`

Android's `PdfDocument` can't write links or bookmarks. So the spike brings its own small PDF writer (`ArchivePdfModule.kt`) that handles:
- image pages (Flate grayscale, or JPEG for comparison)
- Helvetica text
- internal link annotations
- a nested bookmark tree
- a write to `.part` followed by a rename

Existing PDFs are rasterized with Android's `PdfRenderer`.

## 3. Spike checks

Where to run it: Settings, then "Spike (temp)". The source folder is only read. Everything is written to `<base>/_archive_pdf_spike/<runId>/`: the PNGs, `spike.pdf`, `spike-jpeg.pdf` and `report.txt`.

| # | Question | How | Manual check |
|---|---|---|---|
| S1 | Does `generateNotePng` work from the plugin UI, and how big and fast is it? | Page 0 of the first note, both `type` 0 and 1 | Open `content-white.png` |
| S2 | Does the white render already include the background template? | Compare `content-white.png`, `template.png` and the composite page in `spike.pdf` | Is the background visible in the PDF, and is it in `content-white.png`? |
| S3 | Do these APIs work when the plugin was launched from a PDF (DOC context)? | The report records the launch file | Run once from a note and once from a PDF |
| S4 | Throughput | Renders up to N pages (default 30), content plus template, and records per-page timing | none |
| S5 | PDF writer | Cover, TOC with links, bookmarks, umlauts, image pages; Flate vs. JPEG size; extrapolated to 300 pages | Open in Supernote and on a PC: TOC links, bookmarks, "äöüß", sharpness |
| S6 | Including an existing PDF | First PDF found: up to 3 pages at 150 dpi with the `.mark` overlay | Are the annotations visible, and are they in the right place? |
| S7 | Headings for bookmarks | Raw `getTitles` JSON in the report | none |
| S8 | Moving the folder of a note that is currently open | Separate buttons, steps below | See steps |
| S9 | Size cap | From S5: bytes per page for each encoding | none |

### S8 steps
1. Tap "S8 prepare". This creates `_archive_pdf_spike/openmove/A/OpenMoveTest.note` and opens it.
2. Write "1" on the page. Open the plugin from this note, go to Settings, then Spike, and tap "S8 move open note's folder". This moves `A` to `B`.
3. Close the plugin, write "2" on the still-open note, then leave the note.
4. In the file manager, check:
   - Does `openmove/A` exist again?
   - Does `B/OpenMoveTest.note` contain both 1 and 2?
   - Did an error appear?

If the move is unsafe, the wizard blocks while a note from the project is open (question 27).

## 4. Results

### Run 1 (2026-09-28, project "Test": 3 notes, 3 pages, launched from a NOTE)
- **S1:** `generateNotePng` works from the plugin UI. 1404x1872, about 44 KB, 420-830 ms per page. Type 0 ("transparent") also comes back opaque white (corner alpha 255), so plain alpha-over layering hides the template. Fix: `composeLayers` now uses PorterDuff DARKEN, which works for opaque-white and transparent content alike.
- **S2:** `generateNoteTemplatePng` works (15 KB, about 330-460 ms per page) but is NOT needed. Tilman reports that backgrounds showed fine on every page of run 1's PDF. In that run the opaque content layer sat on top of the template, so the background must come from `generateNotePng` itself. Planned for the real feature: API render only, with no template call and no layering, which saves about 0.46 s per page. Next build adds `spike-api-only.pdf` to confirm this directly. The DARKEN layering stays in the writer only for `.mark` overlays on PDF pages.
- **S3:** only tested from a NOTE so far.
- **S4/S9:** about 0.64 s content + 0.46 s template + 0.9 s Flate encode per page. 300 pages: about 10 min and about 3 MB.
- **S5:** Flate `spike.pdf` 33 KB vs JPEG 172 KB. Tilman sees no visible difference, and TOC links work. Decision: Flate grayscale.
- **S6:** crashed the plugin after the PDF page PNGs were written. The report was lost because it was only written at the end. Now split into its own button, and the report is written before every sub-step.
- **S7:** failed with "Invalid page number" because the spike requested pages 0-9 on a note with fewer pages (spike bug, fixed).
- **S8:** after the move, returning to the note shows "note does not exist any more" and lands in the next folder. There is no hang or crash. Still to confirm: did A reappear, and is "1" in B's note?

### Run 2 (2026-09-28)
- **S2 settled:** `spike-api-only.pdf` (plain `generateNotePng`, no template call, no layering) was identical to the layered `spike.pdf` in look and size (41 KB each). Decision: API render only. Per page about 0.52 s render plus 0.8 s Flate encode, so 300 pages come to about 7 min and about 3 MB.
- **S7:** `getTitles` works with a valid page list. The test notes have no headings, so the result is `[]` and the format is still unseen.
- **S6:** crashed again, inside `renderPdfPages`, on `werkplan-basteltisch.pdf` (the report's last line). Suspected cause: a large-format page means a huge bitmap at 150 dpi, which kills the process (not catchable). Next build: `pdfInfo` logs page sizes first, then pages render one call at a time with the long side capped at 2400 px.

### Decision after run 2 (Tilman, 2026-09-28)
- **v1 does NOT include pages from existing PDFs.** PDFs stay as separate files next to the archive PDF, and the TOC/index lists them. This replaces question 4's "optional merge". S6 is closed and not pursued further. `pdfInfo`/`renderPdfPage` stay in the native module as groundwork for a possible v2.
- **Spike closed** except S3 (launch from a PDF), which is optional and can be checked during implementation.
- **S8 conclusion:** moving the folder of the currently open note is handled gracefully by the host ("note does not exist any more", then the next folder). The wizard shows a notice instead of blocking.

### Consequences for the technical design
- Page pipeline: `generateNotePng(type 1, times 1)`, then Flate grayscale. No template call, no layering.
- Budget: about 1.3 s per page. Needs a progress display and a `.part` file renamed at the end. No size cap needed (about 10 KB per page).
- The PDF writer (`ArchivePdfModule.buildPdf`) is proven: TOC links, nested bookmarks and WinAnsi umlauts work on the device and on a PC.
