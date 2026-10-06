# Technical design - Gmail inbox review: email text at the bottom, scrollable, selectable, Copy / -> Todo / -> Meeting

Status: implemented 2026-09-21 (not yet device-tested). Extends [technical-design-review-gmail-inbox.md](technical-design-review-gmail-inbox.md).

## 1. Requirements (Tilman, 2026-09-21, decided in chat)

a) In the Gmail step's detail panel the email text moves to the **bottom**, fills **all remaining height** and is **scrollable** - the only exception to the app-wide no-scroll policy.

b) The email text is **selectable**, with the actions **Copy**, **-> Todo** and **-> Meeting**; the latter two **pre-fill** the Todo / Meeting form.

Decisions from the follow-up questions:

- Without a selection, Copy / -> Todo / -> Meeting are **greyed out** (no "whole email" fallback). An explicit **All** button selects the whole text.
- Pre-fill **appends** to whatever is already in the Todo text / Meeting title (one space between), so several passages can be collected into one item. Line breaks / repeated whitespace in the selection collapse to single spaces.
- The button bar is a **fixed row above the text** (not a floating overlay).
- The text pane keeps a **minimum height** (`GMAIL_BODY_MIN_PX` = 150).
- Follow-up 2026-09-21 (same day): the email text must **open at its top**, and attachments the device can't open are **not listed individually** - see 2.4. (This replaces the first cut's "max 2 rows + +N more" cap: viewable attachments are all listed, the min height protects the text.)

## 2. Design

### 2.1 Layout (screens/ReviewScreen.tsx, `GmailDetailPanel`)

The panel root becomes `flex: 1` (`styles.gmailDetailRoot`) - `ReviewMasterDetail`'s detail column is already a bounded, full-height box. Top to bottom: subject, from, attachments (capped), divider, `QuickAddWidget`, "Created from this email", Archive, error line, and last `styles.gmailBodyArea` (`flex: 1`, `minHeight: GMAIL_BODY_MIN_PX`) holding the email text. "Loading..." / "couldn't be read" hints render in that same area.

### 2.2 The text pane (new: ui/GmailBodyPane.tsx)

A read-only multiline `TextInput` (`flex: 1`, scrolls natively inside itself) under a bar `All | Copy | -> Todo | -> Meeting`.

Why not `<Text selectable>`: Android's native selection toolbar never shows in the Supernote plugin host (see domain/clipboardText.ts, bugfix 2026-09-11), so a selection would be useless, and Text exposes no selection range. A `TextInput` reports the range via `onSelectionChange`.

Read-only by being controlled (`value` constant, `onChangeText` no-op) + `showSoftInputOnFocus={false}` + `caretHidden`. `editable` stays true because a non-editable Android EditText cannot be text-selected.

Selection handling follows the 2026-09-11 lesson: the range lives in a ref, never state. The only selection-derived state is the boolean `hasSelection` (greys the buttons); an unchanged primitive setState bails out, so re-renders happen only when the selection flips empty <-> non-empty, and only inside this small component. `All` sets the selection programmatically through the controlled `selection` prop (released again on the next `onSelectionChange`, same as ui/ClipboardTextInput.tsx). New pure helper `selectedText(text, selection)` in domain/clipboardText.ts (clamped, '' when collapsed/null).

Copy uses `@react-native-clipboard/clipboard` (button reads "Copied" for 1.5 s). E-ink: `requestEinkRefresh()` after every button action and on `onTouchEnd` of the text field (scrolling/selecting produces no React commit the panel would flush by itself).

### 2.3 Pre-fill (ui/QuickAddWidget.tsx)

New optional prop `prefill?: {kind: 'task' | 'meeting'; text: string; nonce: number} | null`. An effect keyed on `prefill?.nonce` (plus `handledPrefillNonceRef` against double application) switches `activeType`, appends the whitespace-collapsed text to `taskDraft.text` / `meetingDraft.title` (`stripSpaceAfterHash` applied like any typed text), resets that tab's tag page and "just added" notes, clears the error. It does not touch date/time/flow state, does not focus a field (no soft keyboard) and is ignored while an edit is open or for Meeting on a `taskOnly` widget. The item is then created with the widget's own **+ Add** - the existing create / handled-checkmark / "Created from this email" path is unchanged.

`GmailDetailPanel` keeps `prefill` in local state with a nonce counter (`sendToWidget`); a message switch keeps the nonce, so an old request never re-applies to a new email.

### 2.4 Follow-up: open at the top; collapsed attachments (2026-09-21)

**Top of the text.** A controlled multiline `TextInput` gets its cursor at the END of a freshly set `value`, and Android scrolls to the cursor - the first version therefore opened at the bottom. `GmailBodyPane` now drives the controlled `selection` prop to `{0, 0}` initially and on every text change, released by the field's first `onSelectionChange`. The reset happens in the render phase (derive-state-from-props: `shownText` compared with `text`) so text and top selection reach the native field in one commit. If a device test still shows the bottom, the fallback is an imperative scroll/selection reset after layout.

**Attachments.** In `GmailDetailPanel` the attachments split by `isAttachmentSupported`: viewable ones (PDF/EPUB/plain text) keep one line each (all of them, no cap) and their "Save & link" pill; all others collapse into ONE hint line by lower-cased file extension, most frequent first: `+4 .png, +2 .jpg` (pure helper `summarizeAttachmentsByExtension` in `domain/attachmentSummary.ts`; no/over-long extension -> `other`). No "Not viewable" text. The left list's `📎 N` now counts only viewable attachments (signature/inline images no longer make a mail look like it has an attachment); the panel's "Attachments" header still shows whenever the mail has any attachment.

## 3. Files touched

- `src/ui/GmailBodyPane.tsx` (new)
- `src/domain/attachmentSummary.ts` (new, follow-up)
- `src/domain/clipboardText.ts` (+ `selectedText`)
- `src/ui/QuickAddWidget.tsx` (+ `prefill` prop/effect)
- `src/screens/ReviewScreen.tsx` (`GmailDetailPanel` layout, constants, styles)

## 4. Verification / open device checks

tsc scratch pass: no new errors versus the pre-change baseline (only the two extra `GmailCacheMessage.attachments` hits, same missing-module-noise class as the existing ones; the scratch project lacked most sibling modules). To confirm on the device:

1. Does a controlled, `caretHidden`, no-soft-keyboard `TextInput` give word-select / drag handles in the PluginHost, and does `onSelectionChange` fire? (If drag-select is too flaky: `All` still works; a follow-up could add tap-to-select-paragraph.)
2. No keyboard pops up on tapping the text.
3. The text pane fills the remaining height, scrolls, and repaints after scrolling (`onTouchEnd` refresh).
4. -> Todo / -> Meeting switch the tab and append (also a second selection appends with a space); +Add still creates and checkmarks the email.
5. A mail with PDFs + several PNGs lists the PDFs individually and one `+N .png` line; `📎` in the left list only for mails with a viewable attachment; the text pane keeps at least ~150 px.
6. The text opens at its top for every mail (also when switching between mails, and for a very long text).
