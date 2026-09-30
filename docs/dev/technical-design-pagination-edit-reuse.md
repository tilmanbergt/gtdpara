# Technical Design: List Pagination + Add/Edit Form Reuse

Status: draft, not yet implemented. Requirements clarified in chat 2026-09-06 (see project memory `feature_list_pagination_edit_reuse.md` for the full clarification log). This design covers two changes together because they share one root cause and, in places, one mechanism.

## 1. Goals and motivation

The app currently uses `ScrollView` everywhere and edits rows in place (expanding them). Both cause unpredictable partial-refresh regions on the Supernote's e-ink panel, and inline editing specifically can land the edit box anywhere on screen relative to the fixed handwriting-input area at the bottom third of the screen. Two changes fix this:

- **(a) Pagination, not scrolling.** Every list becomes a fixed-height box showing a constant number of rows, with ‹ Prev / Next › controls. Scope: every list in the app, including read-only navigation lists (Projects/Areas tabs, file browser, Lasso-capture's destination picker), not just the task/meeting editing surfaces.
- **(b) Editing reuses the Add form.** Tapping a task or meeting row no longer expands that row. Instead, the existing "Add task"/"Add meeting" block — which already lives in a fixed slot at the top of each column — switches into an "editing" mode, pre-filled with that row's data. The row itself stays the same height and is just highlighted while its edit is open elsewhere on screen.

Explicitly out of scope for this pass (confirmed in chat): `ui/FileToPicker.tsx`'s inline expansion (the "File" action on Inbox rows) has the same reflow problem but is left for a future pass — lower traffic, and keeping this pass focused.

## 2. Shared pagination primitive

New: `src/ui/pagination.ts` (pure logic) + `src/ui/PageControls.tsx` (presentation), used by every list in the app.

```ts
// src/ui/pagination.ts
export interface Paged<T> {
  page: number;
  totalPages: number;
  pageItems: T[];
  canPrev: boolean;
  canNext: boolean;
  goPrev: () => void;
  goNext: () => void;
}
export function usePagination<T>(items: T[], pageSize: number): Paged<T>
```

- **Page-size policy:** a fixed constant per list *type* (not measured/computed from layout at runtime — avoids a measure-then-reflow double-render, which is its own e-ink hazard). Candidate constants to tune once against the real device, starting point during implementation: 6 rows for two-column lists (Daily/Inbox's Tasks/Meetings columns, ~half-screen width each), 10 rows for single-column full-width lists (Projects/Areas tabs, Project/Area panel's Todos/Meetings, file browser). Review's per-step lists likely need their own tuning pass since steps vary in row complexity (see §4).
- **Reset/clamp policy:** the current page is preserved across data reloads (add/save/toggle-done) and only clamped down if it's now past the new last page (e.g., after deleting the last item on the last page). We do **not** auto-jump to whatever page a newly-added item lands on — `TaskQuickAdd`/`MeetingQuickAdd` already show a "✓ Added "…"" acknowledgment line, which already confirms the add without needing the list to jump.
- **Grouped lists** (flow-state groups in Project/Area Todos and Inbox, status groups in Projects/Areas tabs, day groups in Review) are **flattened** into one paginated sequence per list, with group-label rows counted as content within that sequence (chosen over "one group per page" — keeps page size uniform and avoids a group with 1 item wasting most of a page).
- `PageControls` renders a fixed-height row: `‹ Prev` / `Next ›`, disabled (not hidden) at the ends, plus a light "no more items" state — always present so screens don't reflow depending on whether pagination is "needed" this time.

## 3. Row height stability

For pages to be truly stable boxes, every row type used in a paginated list needs a fixed rendered height regardless of content:

- `TaskRow` (non-editing state): already close — single line of text + inline badges wrap (`flexWrap: 'wrap'`) today, which can make a row 1 or 2 lines depending on text/badge length. Needs `numberOfLines` capped (2) with ellipsis and a fixed-height wrapper, so every row reserves the same space whether or not it wraps.
- `MeetingRow` (non-editing state): similar — optional `showSource` subtext line changes height. Needs the subtext slot reserved (rendered empty/invisible) rather than conditionally omitted, so the row is a constant height whether or not `showSource` is passed.
- `ItemsList` entry rows: already `numberOfLines={2}` — keep, but same "reserve the space" treatment for the ★-focused prefix (doesn't currently change height, just leading text, so no change needed there).
- File-browser (`ItemDetail`) entry rows: currently `numberOfLines` not set at all — needs the same 1–2 line cap.
- Review's cards (`ReviewItemCard` and friends) are visually denser (title + open tasks + upcoming meetings + shelved tasks) — these will need their own per-card height budget decided during implementation, since "fixed height regardless of content" is harder when a card's whole point is to show a variable list-within-a-list. Flagged as the one area of this design likely to need a follow-up chat decision once we're looking at it concretely (e.g., "show first N sub-items with a '+2 more' hint" inside a fixed-height card, mirroring the outer pagination pattern one level down).

## 4. Per-screen application (the "everywhere" scope)

| Screen | List(s) | Change |
|---|---|---|
| `DailyView.tsx` | Meetings column, Google-Calendar column, Open-tasks column | Each `ScrollView` → fixed box + `PageControls`. Quick-add stays above the list in its fixed slot (unchanged position), now also carries the edit-mode swap (§5). |
| `ProjectDataPanel.tsx` | Todos section, Meetings section | Same treatment; this screen is currently one big `ScrollView` for the whole panel — splits into two independently-paginated boxes (Todos, Meetings), each below its own quick-add slot. |
| `InboxScreen.tsx` | Meetings pane, Tasks pane | Same treatment as Daily's two columns. |
| `ReviewScreen.tsx` | Each step's list (inbox-to-zero cards, stalled-project/neglected-area cards, week-ahead list, done-projects, on-hold-items) | Each step's `ScrollView` → paginated box. Card-level density issue noted in §3. |
| `ItemsList.tsx` (Projects/Areas tabs) | Single grouped list | Flatten groups per §2, paginate. No edit form involved (read-only nav list). |
| `ItemDetail.tsx` | File-browser entries | Paginate. No edit form involved. |
| `CaptureScreen.tsx` | Project/area destination picker | Paginate. No edit form involved. |
| `Settings.tsx` | Form fields (not really a "list") | Out of scope — it's a form, not a data list; stays a `ScrollView`. |

## 5. Edit reuse: swap the fixed Add slot

**Mechanism (per chat decision):** the Add form's existing fixed slot switches to an "editing" mode instead of opening a new form somewhere else. Concretely:

- `TaskQuickAdd` gains an optional `editingTask?: Task` prop (alongside existing `onAdd`). When set: fields are pre-filled from the task (text/flowState/waitingOn/dueDate — the same population `TaskEditCard` currently does), the destination picker is hidden (editing never re-files an item — matches today's behavior, `TaskEditCard` doesn't move items either), the submit button reads "Save" instead of "+ Add" and calls a new `onSaveEdit(nextText)` instead of `onAdd`, and a "Cancel" action appears to exit edit mode without saving. Label switches from "Add task" to "Editing task".
- `MeetingQuickAdd` gets the same treatment: `editingMeeting?: Meeting`, pre-filled title/date/time, destination picker hidden, "Save"/`onSaveEdit`/"Cancel".
- `ui/TaskEditCard.tsx` becomes redundant once `TaskQuickAdd` absorbs its field set and save logic — deleted at the end of this work, not kept as a second parallel form.
- `TaskRow`/`MeetingRow` lose their in-place edit branch entirely. `isEditing` still gets passed in, but now only changes the row's visual treatment (highlight — background tint/border, matching the chat decision) and disables `onStartEdit`/tap-to-open while true, since the real form for it is already open in the fixed slot elsewhere on screen. Rows no longer change height when edited.
- Screens keep their existing `editingTaskKey`/`editingMeetingKey` state (already present in `DailyView`, `InboxScreen`, `ReviewScreen`, `ProjectDataPanel` under slightly different names — `editingTaskIndex`/`editingInboxTaskIndex` etc.) — no new state shape needed, just repurposed: it now drives which row is highlighted *and* which task/meeting object gets passed into the quick-add component's `editingTask`/`editingMeeting` prop, instead of driving which row renders its own inline form. The screen-level `meetingDraft` state that several screens currently thread into `MeetingRow` goes away — `MeetingQuickAdd` owns its own draft internally in edit mode, same as it already does in add mode.

## 6. Explicitly not in this pass

- `ui/FileToPicker.tsx`'s inline expansion (File action, Inbox-sourced rows) — same underlying issue, deliberately deferred (chat decision 2026-09-06).
- Any change to what fields exist in the add/edit forms themselves (flow-state chips, due date, waiting-on) — unchanged, just relocated/reused.
- Moving/re-filing an item's destination via edit — stays a separate, existing "File" action.

## 7. Rough sequencing / effort shape

1. Shared primitives: `pagination.ts`, `PageControls.tsx`, row-height-stability pass on `TaskRow`/`MeetingRow`/`ItemsList` entries/file-browser entries.
2. `TaskQuickAdd`/`MeetingQuickAdd` edit-mode support; delete `TaskEditCard`; strip inline-edit branches from `TaskRow`/`MeetingRow`.
3. Wire pagination + the new edit-mode props through each screen, one at a time: `DailyView` → `ProjectDataPanel` → `InboxScreen` → `ReviewScreen` (card density decision happens here) → `ItemsList` → `ItemDetail` → `CaptureScreen`.
4. `tsc --noEmit` + eslint pass (no `device_bash` this session — see project memory's recurring note that this still needs on-device verification), then an on-device smoke test of paging + edit on at least one two-column screen (Daily) and one single-column screen (Project/Area panel) before rolling the pattern out further.

This is comparable in size to the Daily-compact-UI and Tags passes (both were multi-file, multi-session efforts) — expect it to span more than one implementation session, and land best as the same phased sequence above rather than one big edit.
