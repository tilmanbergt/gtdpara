# Technical design — "Linked file" note piece

Status: IMPLEMENTED 2026-09-25 (not yet device-tested) - see §10 As built. Closes Phase 5 item #2 of `technical-design-note-templates.md` ("Folding the 'Link:' element into the piece system").

## 1. Requirements (decided in chat, 2026-09-25)

1. New predefined piece type **"Linked file"**, placed like Title/Date/Related (Add-piece page, nudge pad, font size, max width, preview). Contexts: **Todo + Meeting** (the only items that have a `linkedFile`).
2. A Tag Rule **without** a Linked-file piece writes **no link at all** (today's auto-appended "Link:" under the last piece is removed).
3. Link text stays `Link: <filename>`.
4. If the item's linked file **no longer exists**, the link is **skipped** (nothing written, no placeholder).
5. The link box is **sized from its real text**, like textboxes now are (`measureNotePieceRect`), plus a bit of extra width/height for the link icon and underline.
6. **Everything behaves the same, rules decide** (decision A): the old fixed Meeting fallback layout is removed. A Meeting that matches no rule gets no content, same as a Todo today. The user shapes the default through the "Meeting (default)" rule.
7. **Default pieces for a new rule** (decision B), stacked top to bottom: Meeting = Title, Date, Time, Linked file; Todo = Title, Linked file.

## 2. Current state (as built)

- `storage/meetingNoteContent.ts` → `populateNoteFromDefinition(notePath, definition, pieceContent, linkedFileAbsolutePath, page)` always appends `buildLinkElement(...)` below the last rendered piece when `linkedFileAbsolutePath` is set.
- `buildLinkElement` sizes the box as `width = pieceWidthPx(x)` (to the page edge) and `height = noteLinkLineHeight(fontSize)` (one line, never measured).
- No existence check: `refreshMeetingNoteBlock`/`refreshTodoNoteBlock` only call `resolveLinkedFilePath`.
- `storage/linkedFiles.ts` already has `linkedFileStatus(paths, linkedFile)` → `'ok' | 'missing'` (Files-pane ⚠ path), reused here.

## 3. Data model (`domain/noteTemplate.ts`)

- `PieceType` gains `'link'`.
- `PIECE_CONTEXTS.link = ['todo', 'meeting']`.
- `PieceRenderContext` gains `linkedFileName?: string` (bare filename, set only when the file exists).
- `renderPieceText` case `'link'` → `ctx.linkedFileName ? \`Link: ${ctx.linkedFileName}\` : ''`. Empty string = piece skipped, same convention as Date/Time/Related already use.
- No new stored fields: a link piece uses the existing `x`/`y`/`fontSize`/`maxWidthPx`/`step`. `addPieceToDefinition` seeds it like any other piece (default max width 702px).
- No settings migration: existing definitions simply have no link piece → no link (requirement 2). Old notes lose their link on the next auto-update refresh, which is what was asked for; frozen (past/done) notes keep theirs because they aren't rewritten.

## 4. Rendering (`storage/meetingNoteContent.ts`)

- `refreshMeetingNoteBlock` / `refreshTodoNoteBlock`: when the item has `linkedFile`, call `linkedFileStatus(...)`. Only when `'ok'` pass `linkedFileAbsolutePath` on and put `linkedFileName` into the render context; otherwise pass `null` (requirement 4). Cost: one folder listing, only for items that have a link.
- `populateNoteFromDefinition`: in the piece loop, a `'link'` piece with text builds a **link element** instead of a textbox; every other type is unchanged. The "append link after the last piece" block and the `lastX/lastBottom/lastFontSize` tracking it needed are removed.
- `buildLinkElement(absPath, x, y, fontSize, maxWidthPx, userData, page)`: now positioned at the piece's own `x`/`y`, with userData `notePieceUserData(index)` like every other piece. `isNoteTemplateManagedElement` already cleans up both the old `NOTE_LINK_USERDATA` marker and per-piece markers, so re-rendering an existing note removes the old auto-link cleanly.
- **Fallback path removed** (decision A): `populateMeetingNoteBlockFallback` is deleted, and `refreshMeetingNoteBlock` behaves like `refreshTodoNoteBlock` when `resolveNoteTemplate` returns `null`: it writes nothing. `domain/meetingNoteBlock.ts`'s `buildMeetingNoteText` and `FALLBACK_BLOCK_*` constants go with it. `MEETING_NOTE_BLOCK_USERDATA` and `NOTE_LINK_USERDATA` **stay** as recognised markers in `isNoteTemplateManagedElement`, so old notes that still carry the fixed block or auto-link get cleaned up on their next refresh. `noteLinkLineHeight` becomes unused and is removed.

### 4.1 Default pieces (decision B)

- New `defaultPiecesFor(context)` in `domain/noteTemplate.ts`: meeting → `['title','date','time','link']`, todo → `['title','link']`, project/area → `['title']` (the only default that makes sense there; Link/Date/Time don't exist for those contexts). Each piece is added via `addPieceToDefinition`, so `nextPieceSeedPosition` stacks them one below the other (x 100, y 100, then about 64px apart at size 36).
- `screens/Settings.tsx` "+ New rule": the draft starts with `defaultPiecesFor(context)`. If the user switches the context of a **new** draft whose pieces are still exactly the untouched seed, it re-seeds for the new context; once they've edited pieces, switching context leaves them alone.
- `createDefaultMeetingDefinition` (the "Meeting (default)" rule seeded when the rule list is empty) uses the same Meeting defaults, plus Related items at the bottom, so it keeps what it had before.
- **Existing rules are not migrated**: they keep their pieces, with no link piece added. Links on their notes disappear on the next refresh, until the user adds the piece.

## 5. Sizing the link box (requirement 5)

New helper in `storage/notePieceMetrics.ts`:

```ts
export async function measureNoteLinkRect(text, x, fontSizePx, maxWidthPx): Promise<NotePieceRect> {
  const rect = await measureNotePieceRect(text, x, fontSizePx, maxWidthPx - linkExtraWidthPx(fontSizePx));
  return {
    ...rect,
    width: Math.min(pieceWidthPx(x), rect.width + linkExtraWidthPx(fontSizePx)),
    height: rect.height + LINK_EXTRA_HEIGHT_PX,
  };
}
```

- The text is measured at the cap *minus* the icon allowance, so adding the allowance back never goes past the piece's max width or the page edge.
- `linkExtraWidthPx(fontSize) = Math.ceil(fontSize * LINK_ICON_WIDTH_FACTOR)`, with `LINK_ICON_WIDTH_FACTOR = 1.2` as a first guess (the icon scales with the font), and `LINK_EXTRA_HEIGHT_PX = 8` for the underline. Both are named calibration constants, unvalidated until tried on the device, same as `CONTENT_FIT_PADDING_PX`.
- Long filenames: if the measured text wraps, the box gets the multi-line height. Whether Supernote actually wraps link text inside its box, or keeps it on one line, is **unknown**. It gets checked on the device: if links never wrap, we instead measure at unlimited width and clamp to one line height.
- `noteLinkLineHeight` stays, but only for the fallback path.

## 6. Settings UI

- Add-piece page: "Linked file" appears automatically in the predefined list for Todo/Meeting rules (driven by `PIECE_CONTEXTS`). The right-panel description/example gets an entry, e.g. *"Tappable link to the file attached to this Todo/Meeting (paperclip). Left out when nothing is attached or the file is missing."*, example `Link: Kickoff deck.pdf`.
- `ui/NoteTemplatePreview.tsx`: label map gets `link: 'Link: file'`. The preview label is drawn underlined, so it reads as a link. It uses the same width/max-width handling as other pieces.
- Nudge pad, font ± and max-width ± work unchanged.

## 7. Files touched

`domain/noteTemplate.ts`, `storage/meetingNoteContent.ts`, `storage/notePieceMetrics.ts`, `ui/NoteTemplatePreview.tsx`, `domain/meetingNoteBlock.ts` (fallback builder removed), `storage/settingsStorage.ts` untouched, `screens/Settings.tsx` (piece description + default seeding on new rule), `docs/dev/history/technical-design-note-templates.md` (§4 out-of-scope note + §7 Phase 5 #2 marked done, pointing here).

## 8. Verification

- Node checks: `renderPieceText` for link (with/without name), `PIECE_CONTEXTS` filtering, measurement rect never exceeding cap/page edge.
- Local tsc on the touched files.
- On device: (1) a rule with a link piece shows the link at its position, with a tight box; (2) a rule without one shows no link; (3) delete the linked file, then reopen a note that isn't frozen: the link disappears; (3b) a Meeting matching no rule gets no content, and an old note loses its fixed block/auto-link on refresh; (3c) "+ New rule" shows the default stack for each context; (4) a long filename, to see wrap behaviour; (5) the icon/underline allowances look right.

## 9. Decisions log

- **A (2026-09-25):** "everything should behave the same, user decides how the default layout works" → fixed Meeting fallback removed entirely (§4).
- **B (2026-09-25):** new rules start with Title, Date, Time, Linked file (Meeting) / Title, Linked file (Todo), stacked in that order (§4.1). "Filename" in the chat means the Title piece (confirmed).

## 10. As built (2026-09-25)

- `domain/noteTemplate.ts`: `PieceType` + `'link'`; `PIECE_CONTEXTS.link = ['todo','meeting']`; `DEFAULT_PIECE_TYPES`, `withDefaultPieces`, `hasUntouchedDefaultPieces`; `PieceRenderContext.linkedFileName`; `linkPieceText`; `renderPieceText` case `'link'`; `createDefaultMeetingDefinition` = Meeting defaults + Related.
- `storage/meetingNoteContent.ts`: `populateMeetingNoteBlockFallback` and the auto-appended link are removed; `populateNoteFromDefinition` builds a link element for a `link` piece (per-piece userData); new `existingLinkedFile` (existence check via `linkedFileStatus`, only run when the rule has a link piece); both refresh functions write nothing when no rule matches. A note that matches no rule is left untouched (legacy block/link stay until a rule matches and the note refreshes).
- `storage/notePieceMetrics.ts`: `measureNoteLinkRect`, `LINK_ICON_WIDTH_FACTOR = 1.2`, `LINK_EXTRA_HEIGHT_PX = 8`, `linkExtraWidthPx`.
- `domain/meetingNoteBlock.ts`: `buildMeetingNoteText`/`MeetingNoteTodo` removed; the two legacy markers kept for cleanup only; `MEETING_NOTE_FONT_SIZE`/`noteLinkLineHeight` kept (still used by `supernote/textboxMetrics.ts`'s fallback).
- `ui/NoteTemplatePreview.tsx`: label "Linked file"; preview shows an underlined "Link: file".
- `screens/Settings.tsx`: "Linked file" in the Add-piece list (Todo/Meeting) with description/example; "+ New rule" starts with the context's default pieces; switching context on a new, untouched draft re-seeds.
- Verification: tsc shows only the 16 pre-existing baseline lines (technical_debt #7), identical before/after; 11 node checks on the domain helpers passed. On-device checks: §8.

## 11. Bugfix 2026-09-28 — link to a non-PDF/non-note file broke the whole note

- **Symptom (on device):** creating a Meeting note whose rule has a Linked-file piece, with a `.txt` attached, failed: `insertElements` FAIL, "Destination file is not a note file. Cannot call the API!", and the note got no content. The same rule without the link piece, or with a `.pdf` attached, worked.
- **Root cause:** `linkTypeForExtension` fell back to link type 1 (note file) for every unrecognized extension; the host validates the target and rejects the whole insert.
- **Fix:** `.note` → 1, images → 3, **everything else → 2 (document)** (Tilman: "note really only makes sense for .note"). Safety net in `populateNoteFromDefinition`: if the insert fails and contained a link element, retry once without the link elements (logged), so a rejected link never costs the rest of the note.
- Still to confirm on device: which non-PDF formats (txt, epub, docx, …) the NOTE app actually opens through a document link.
