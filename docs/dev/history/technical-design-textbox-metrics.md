# Technical design: Textbox metrics port

Status: IMPLEMENTED 2026-09-23 (see §7 "As built"), not yet device-tested — needs the on-device calibration check §3.3 always flagged, plus a real install/rebuild since this feature relies on the email-note feature's native module (Phase 0), which itself hasn't been device-tested at time of writing. Originally 2026-09-21 — requirements decided in chat, then rescoped in chat after a first draft wrongly pulled in this plugin's own UI (`PagedSection`/`TaskRow`); this version is scoped strictly to writing content onto external Supernote `.note` files, per Tilman's correction. Per this project's own workflow (clarify requirements → technical design → implementation), §§1-6 below are the technical-design step as reviewed and answered by Tilman; §7 is what was actually built.

**Aligned 2026-09-21 with [technical-design-gmail-email-note.md](technical-design-gmail-email-note.md)** (Gmail "Link email as note", multi-page `.note`). That feature is being designed first and needs the same native measurement. To avoid two ports and two bridges, the native module and the JS bridge wrapper are now specified **once, in that document** (its 3.3, 3.9 and Phase 0); this document only defines what sits **on top** of that shared base. Nothing in this document is in scope for the email feature; it is written so it can be implemented later without rework of the shared parts.

## 0. Scope, stated plainly

This is about **sizing the textbox elements gtdpara writes onto a Supernote `.note` page** — the note-template piece system (`storage/meetingNoteContent.ts`'s `populateNoteFromDefinition`/`populateMeetingNoteBlockFallback`, writing `textBox.textRect` elements via `createElement(ELEMENT_TYPE_TEXT)`). It is **not** about this plugin's own on-screen UI. `ui/TaskRow.tsx`'s `taskRowHeight`/`taskRowLines` and `ui/PagedSection.tsx`'s row pagination are a different rendering context (React Native's own `Text` component really wraps on-screen there, self-correcting on the next render) and are out of scope — untouched by anything below.

The two consumers happen to share one estimator today (`ui/textLineEstimator.ts`'s `activeLineEstimator`), which is exactly the confusion the first draft of this doc fell into. Keeping them separate going forward means: the NOTE-page path gets its own measurement, and `ui/textLineEstimator.ts` keeps serving `TaskRow`/`PagedSection` exactly as it does today, unmodified.

## 1. Problem

`domain/meetingNoteBlock.ts`'s `estimatePieceTextHeight()` computes the height of a textbox element before it's written to a `.note` page, by summing `activeLineEstimator.estimateLines()` over each line and converting to px. Its own doc comment already names the exact gap this concept closes:

> "This is a known-imprecise reuse — textLineEstimator was calibrated for this plugin's own React Native row rendering, not for predicting how the NOTE app's native textbox renderer wraps text — so treat this as a rough starting rect, over-provisioning being the safe failure mode... Flagged for recalibration once a real on-device screenshot of an actual inserted textbox element exists to compare against."

A second, separate gap sits right next to it: **width is never fit to content at all**. `domain/noteTemplate.ts`'s `pieceWidthPx(x) = NOTE_PAGE_WIDTH_PX - x` — every piece's textbox width is the full remaining page width from its `x` to the page's right edge, regardless of whether the text is one short word or a paragraph. A "Title" piece a few characters long gets a box stretching to the page edge. Between an over-wide box and a heuristic-guessed height, "the textboxes are often way too large" is exactly what this combination produces.

Both call sites that write these elements live in `storage/meetingNoteContent.ts`:
- `populateNoteFromDefinition` — one call per piece, the current note-template system (`width = pieceWidthPx(piece.x); height = estimatePieceTextHeight(text, width, piece.fontSize)`).
- `populateMeetingNoteBlockFallback` — the older fixed meeting-note block, same `estimatePieceTextHeight` call against a fixed max width.

## 2. What's actually being ported

Same native module identified in the first pass (now shared with the email-note feature, see 3.1) — `TextboxMetrics`, a native Android module (not a JS file) in the sister project (`NoteDraft/textboxHelper`), using `android.text.StaticLayout`/`TextPaint` to get real, pixel-accurate text layout from Android's own text engine, instead of a guess. Source inventory (unchanged from the first pass — only the *use* of it is rescoped):

| File | Role | Port this pass? |
|---|---|---|
| `android/.../textboxhelper/TextboxMetricsModule.kt` | Builds an Android `StaticLayout` from `(text, width, fontSize, fontPath?)`, reports line count, total height, max line width | **Yes** |
| `android/.../textboxhelper/TextboxMetricsPackage.kt` | `ReactPackage` registration boilerplate | **Yes** |
| `src/shared/supernoteTextboxLayout.ts` | JS wrapper: native call + types + calibration constant | **Partially** — the native-call wrapper + types only; **lands as `supernote/textboxMetrics.ts` via the email-note design's Phase 0**, not here |
| `src/shared/supernoteTextboxHitTesting.ts`, pagination/insertion/import-parsing files | Word-level hit-testing, splitting text across NOTE pages, interactive textbox authoring | **No** — none of this applies to gtdpara, which only ever writes one fixed-size textbox per piece, never edits one interactively |

gtdpara already has the native-module registration pattern this needs (`GtdParaFileModule.kt`/`GmailImapModule.kt` are listed in `GtdParaFilePackage.createNativeModules`), so the Kotlin side is close to a direct copy.

## 3. Proposed architecture

### 3.1 Native module port and bridge wrapper - shared, not owned here

Owned by [technical-design-gmail-email-note.md](technical-design-gmail-email-note.md) **Phase 0** (its 3.3): `TextboxMetricsModule.kt` (package `eu.embodyagile.gtdpara`, bridge name `"TextboxMetrics"`, only `measureTextLayout`), registered in the **existing** `GtdParaFilePackage.createNativeModules` list — so `MainApplication.kt` is **not** touched (this replaces the earlier proposal to add a separate `TextboxMetricsPackage.kt` and register it in `MainApplication.kt`) — plus the JS wrapper `supernote/textboxMetrics.ts`:

```ts
measureTextHeight(text, widthPx, fontSizePx, opts?: {fontPath?: string})
  -> Promise<{heightPx, layoutHeightPx, lineCount, maxLineWidthPx, source: 'native' | 'fallback'}>
TEXT_MEASURE_WIDTH_ADJUSTMENT_PX = 30
```

What this feature relies on (the contract, email-note 3.9):

- The wrapper requests `widthPx - 30`, so **`maxLineWidthPx` is a width inside the reduced box**. A content-fit box therefore needs `ceil(maxLineWidthPx) + TEXT_MEASURE_WIDTH_ADJUSTMENT_PX` (+ padding), otherwise the NOTE renderer wraps the last word of the widest line.
- `heightPx` already includes the NOTE app's explicit-empty-line extra (`max(fontSize + 3, round(fontSize * 1.1))` per blank line, from the sister project's `estimateTextboxHeight`); the raw layout height is `layoutHeightPx`. So `measureNotePieceRect` should use `heightPx` and gets the calibration for free — pieces with blank lines (e.g. the Relevant Todos list) need it.
- On failure the wrapper returns `source: 'fallback'` with the **raw** `estimatePieceTextHeight` value and applies no safety factor (the email feature multiplies by 1.15 itself; this feature deliberately does not, see 3.2 step 4). It never throws and logs the failure once per session.
- `fontPath` is optional and passed through; today's pieces use the default font, so it stays unused unless a note template gains a font setting.

If this feature is implemented before the email feature, it builds Phase 0 exactly as specified there; nothing in this document may change the wrapper's signature.

### 3.2 Where the new measurement lives — and why not in `domain/`

`domain/meetingNoteBlock.ts` must stay RN/SDK-free (this project's standing domain-layer convention — pure TS, unit-testable without a device). A native-module call can't live there. So:

- `domain/meetingNoteBlock.ts` keeps `estimatePieceTextHeight`/`pieceWidthPx` exactly as they are today — they become the **fallback**, used only if native measurement is unavailable or fails (mirroring how the sister project's own wrapper treats a missing/failing native module: a silent `null` → caller falls back).
- A new function `measureNotePieceRect(text, x, fontSizePx)` in `storage/notePieceMetrics.ts` (new; the only new file of this feature besides the call-site edits) does the piece-specific work **on top of the shared wrapper** — it adds no native call and no second bridge:
  1. Calls `measureTextHeight(text, pieceWidthPx(x), fontSizePx)` once (today's ceiling as the requested width).
  2. Computes a **content-fit width**: `min(pieceWidthPx(x), ceil(maxLineWidthPx) + TEXT_MEASURE_WIDTH_ADJUSTMENT_PX + CONTENT_FIT_PADDING_PX)` — this is the actual fix for "way too large" boxes; a short piece no longer stretches to the page edge. (`CONTENT_FIT_PADDING_PX` is a small constant to be tuned in the on-device check, 3.3.)
  3. Uses the returned `heightPx` as the height, instead of the char-bucket-estimated one. No second measurement is needed for the narrower box: it is exactly as wide as the widest line plus the calibration adjustment, so no line wraps differently.
  4. When `source === 'fallback'`, returns **today's exact combo** — `pieceWidthPx(x)` as width and the raw `estimatePieceTextHeight(...)` as height (no content-fit, no safety factor) — so the failure case is behaviour-identical to today, as this document always promised.
  Return type: `{width, height, source}`; the callers pass `width`/`height` on to the textbox element (later via `buildTextboxElement`, see 4).
- `populateNoteFromDefinition` and `populateMeetingNoteBlockFallback` (both already `async function`s in `storage/meetingNoteContent.ts`) call `measureNotePieceRect` instead of today's two-line `pieceWidthPx`/`estimatePieceTextHeight` combo. **No sync/async bridging problem here at all** — unlike this plugin's own paginated UI (out of scope, see §0), both call sites already `await` other native calls (`createElement`, etc.) right next to where this would slot in.

### 3.3 The calibration question is sharper here than it first looked

For this plugin's own UI (out of scope, §0), "is the estimate right" is self-correcting — RN renders the real thing a moment later, on the same screen, in the same process. For a `.note` page, there is no such self-correction: gtdpara's plugin process computes the rect once, writes it, and the **Supernote NOTE app** — a separate app/firmware — is what actually draws the textbox later, whenever the note is opened. Android's `StaticLayout` (what the native module measures against) approximates *this plugin's own process's* text layout, which is not guaranteed to be identical to whatever renderer the Supernote NOTE app itself uses to draw a `textBox` element.

This is a real, named risk, not a formality — the sister project's own calibration constant (`widthAdjustment: 30`) exists precisely because NoteDraft hit this same gap and hand-tuned a correction against real on-device screenshots. It's a reasonable starting point (same hardware family, same underlying Android text stack) but gtdpara needs its own on-device check before trusting it — exactly the check `estimatePieceTextHeight`'s own doc comment already asks for: compare a predicted rect against a real inserted textbox element on the actual device.

### 3.4 Rollout

Migrate `populateNoteFromDefinition` (the current, primary note-template path) first, since it's the one Tilman actually uses today; `populateMeetingNoteBlockFallback` (the older fixed-block path, only hit when no definition matches) can follow once the first is validated on-device, or be migrated in the same pass if that's simpler in practice — both call the same new `measureNotePieceRect`, so there's little reason to stage them far apart.

## 4. Files touched (implementation phase, for reference — nothing here is written yet)

Shared, built by the email-note feature's Phase 0 / Phase 2 (not part of this feature's diff): `TextboxMetricsModule.kt`, `GtdParaFilePackage.kt` (registration), `supernote/textboxMetrics.ts`, `supernote/noteElements.ts` (`buildTextboxElement`).

This feature's own diff:

- New: `storage/notePieceMetrics.ts` (`measureNotePieceRect`, built on `measureTextHeight`)
- Edit: `storage/meetingNoteContent.ts` (`populateNoteFromDefinition`/`populateMeetingNoteBlockFallback` call `measureNotePieceRect`; do this in the same pass as the optional Phase 3 of the email-note doc, i.e. also switch the two textbox literals to `buildTextboxElement`, so these call sites are touched once)
- Unchanged: `MainApplication.kt`, `domain/meetingNoteBlock.ts` (fallback only), `ui/textLineEstimator.ts`, `ui/TaskRow.tsx`, `ui/PagedSection.tsx` — none of this plugin's own UI is touched

## 4a. Sequencing relative to the email-note feature

1. Email-note Phase 0 (native port + wrapper) — prerequisite for both.
2. Email-note Phases 1–2 (feature) — independent of this document.
3. This feature: `notePieceMetrics.ts` + call-site migration (+ email-note Phase 3), including the on-device calibration check of 3.3. Because Phase 0 already exists by then, this step needs **no native rebuild**.

## 5. Non-goals for this pass

- **This plugin's own UI row-height estimation** (`TaskRow`/`PagedSection`/`MeetingRow`/`FileBrowserPane`) — explicitly out of scope per §0. If that's ever worth revisiting, it's a separate concept with a separate problem shape (the sync-pagination-loop issue the first draft of this doc wrongly focused on).
- **Word-level hit-testing / detailed layout** (`measureTextLayoutDetailed`) — no gtdpara feature needs it.
- **Note-template Settings-UI preview** (`ui/NoteTemplatePreview.tsx`) — doesn't currently use any height/width estimation at all (checked directly); out of scope here, could be a natural follow-up once real measurement exists.

## 6. Open questions for Tilman

Resolved by the 2026-09-21 alignment:

1. ~~File/function naming~~ — settled: shared wrapper `supernote/textboxMetrics.ts` / `measureTextHeight`; this feature's `storage/notePieceMetrics.ts` / `measureNotePieceRect`.
3. ~~Fallback behaviour~~ — settled: silent fallback to today's exact behaviour, the wrapper logs once per session and reports `source`, so a caller (or a debug view) can tell. Not surfaced to the user.

Still open:

2. Should every piece get content-fit width, or are there piece types where the current "stretch to page edge" behavior is actually wanted (e.g. a "Relevant Todos" list piece, where lines vary a lot in length and a stable wide box might read better than one that changes width per note)? Worth deciding per piece type rather than assuming "always fit to content" is right everywhere. (Does not block the email feature; `measureNotePieceRect` can take an optional `fit: 'content' | 'full'` argument once this is decided.)

## 7. As built (2026-09-23)

Implemented in the same pass as §3.4's rollout plan and the email-note doc's Phase 3, per Tilman's answers to the open questions above ("1. ok / 2. yes 100 px min seems good / 3. each piece should have its own length cap, separately stored for each definition / 4. can be one thing"):

- **Per-piece, not per-definition width cap.** Answer 3 corrected the shape this document didn't explicitly propose either way: `NotePiece.maxWidthPx?: number` (domain/noteTemplate.ts) — each piece stores its own cap, resolved via `pieceMaxWidthPx(piece)` (absent-safe default `DEFAULT_MAX_PIECE_WIDTH_PX = Math.round(NOTE_PAGE_WIDTH_PX / 2)` = 702px, per Tilman: "should be half the total screen width as default"). `MIN_PIECE_MAX_WIDTH_PX = 100` floors the ±25 control in `ui/NudgePad.tsx` (Tilman: "100 px min seems good"); no upper clamp (`measureNotePieceRect` already takes `min(cap, pieceWidthPx(x))`, so a cap wider than the page-edge ceiling is harmless).
- **§3.2's step-1/4 bug, fixed as flagged**: `measureNotePieceRect(text, x, fontSizePx, maxWidthPx)` measures at `min(pieceWidthPx(x), maxWidthPx)` from the start (not at the full page-edge width, clamped afterward), so line-wrapping is correct for the box that's actually written.
- **Fallback path now also respects the cap** — a deliberate deviation from §3.2 step 4's original plan ("today's exact combo... no content-fit"). The width cap is a user setting independent of native-measurement availability, so `measureNotePieceRect` requests the already-capped width from `measureTextHeight` regardless of `source`; only the content-fit *narrowing* (step 2) is native-only. A `source === 'fallback'` piece is capped at `maxWidthPx` but not shrunk below it to fit shorter text.
- **Combined with email-note Phase 3** (Tilman, answer 4: "can be one thing"): both `populateNoteFromDefinition` and `populateMeetingNoteBlockFallback` (storage/meetingNoteContent.ts) now call `buildTextboxElement` (supernote/noteElements.ts) instead of hand-spelling `createElement(ELEMENT_TYPE_TEXT)` + a `textBox` literal. The fallback block has no `NotePiece` behind it, so it passes its own fixed `FALLBACK_BLOCK_MAX_WIDTH` (1280px, unchanged) as `measureNotePieceRect`'s `maxWidthPx` argument — the function takes plain primitives, not a `NotePiece`, exactly so this reuse works.
- **Visible in the preview, per Tilman's original ask**: `ui/NoteTemplatePreview.tsx`'s per-piece label now gets a scaled `width: min(pieceMaxWidthPx(piece), pieceWidthPx(piece.x))` instead of auto-sizing to its truncated text — the box shown is the same boundary `measureNotePieceRect` caps at, updating live as the ±25 control is used. This previews the width boundary only, not real line-wrapping (still `numberOfLines={1}`, no native measurement call in this synchronous preview) — §5's "non-goal" framing for this file is now partly superseded by this minimal addition, kept intentionally small.
- `CONTENT_FIT_PADDING_PX = 20` (storage/notePieceMetrics.ts) — a first guess for §3.3's calibration margin, not yet validated against a real on-device screenshot. Still an open follow-up, same as §3.3 always flagged.
- Not yet done: the on-device calibration check itself (§3.3) — needs a real inserted textbox compared against the predicted rect, once this can be tested on the device.
- Question 2 (§6, "should every piece get content-fit width") is now moot for the *width ceiling* — that's user-controlled per piece via `maxWidthPx` — but stays open for whether content-fit *narrowing below the cap* is ever unwanted for a piece type like "Relevant Todos."

This is no longer concept-only — implemented, not yet device-tested (same status as the email-note feature's own Phase 0–2 as of this writing).
