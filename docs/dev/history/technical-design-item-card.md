# Item card and the four-row Quick Add box

Requirements (Part A), technical design (Part B) and test scenarios (Part C) for replacing the
meeting-list toolbar of `docs/dev/history/technical-design-meeting-reflection.md` (M3-M6) with an
item card in Quick Add's place, and for the Quick Add box that holds create, card and edit in one
fixed frame. Status: **approved** (Tilman); open points decided below. UI draft: canvas "Meeting item card – UI
draft" (sheet "Quick Add box – every state", boards C1-C3, the Reflect icon sheet).

An "As built" section is added when the branch is finished (DEVELOPMENT-POLICY §8).

## Part A — Requirements as decided

### Why

The meeting-list toolbar put a second place for item actions next to Quick Add's edit form, and
the edit form itself mixed field editing with commands that act at once (delete, New from this,
Refile, unlink). Actions lived in three places: the row, the toolbar and the edit form. Quick Add
is the plugin's central surface; this restructure gives every item action one place and keeps the
box calm on e-ink.

### Decisions

- **K1 One tap selects, a second tap edits.** Tapping a meeting row (title or status mark)
  selects it: black bar on the row, and the **item card** takes Quick Add's place. **Edit** on the
  card, or a second tap on the selected row, opens Quick Add's edit form for it. ✕ on the card
  goes back to Quick Add with its drafts as they were.
- **K2 One box, four rows, one height.** Create (Todo, Meeting, Note, Todo with w/f), card
  (meeting, todo) and edit (meeting, todo) all use the same four rows and the same height:
  **170 dp** (today 162). Nothing below the box moves when it changes what it shows.
- **K3 Row 1: tabs and the main button.** Tabs on the left; on the right the main action:
  **+ Add** (create; "+ Add to <Name>" with a recognized abbreviation tag, as today), **Cancel ·
  Save** (edit; "Save to <Name>" with a recognized abbreviation tag, replacing "File: <Name>"),
  **✕ · Edit** (card). The M switch sits next to + Add when creating a meeting.
- **K4 Rows 2 and 3 as today.** Row 2: the text or title and the date (grey placeholders, no
  labels; Todo's due date unfolds from the 📅 icon). Row 3: flow chips (Todo) or time (Meeting),
  then tag chips; w/f swaps in "Waiting on" as today.
- **K5 Row 4: more tags.** Row 4 continues Row 3's tag chips, with ‹ › at its end. Tags stay in
  the title text; chips insert, remove and show them exactly as now (pinned first, filled;
  labels over 8 characters shortened).
- **K6 Provenance.** While Quick Add adds provenance ("↳ from Retro alpha · Wed 30.9." in a thread
  overview, the close-out step, a capture from a meeting page), that line takes Row 4 instead of
  the second tag row. The todo card shows the meeting a todo came from in Row 1 ("↳ Sparring
  Mieke ›", opens its thread overview).
- **K7 The edit form holds fields only.** Delete, New from this, Refile/"File:", unlink and M
  leave the edit form. M is on the card only (a setting, like Prepped and Reviewed).
- **K8 Meeting card.**
  - R1: "Meeting · <before | today | over | cancelled>", the thread link ("# mieke ›") when the
    meeting has a thread tag, ✕, **Edit**.
  - R2: title (with its tags) and when.
  - R3: **P** / **R** when the setup tracks that phase, **M** (filled = on, tap toggles at once);
    note; **Reflect** (loop with a question mark, filled once the page exists) once the meeting is
    over; the linked file as one chip (name opens, ✕ unlinks) or **+clip** to link one where a
    Files pane exists.
  - R4: the **area chip** ("Coaching ›" opens the Project/Area; the arrow beside it refiles, where
    the screen can refile), **New from this**, **Cancel meeting**.
- **K9 Todo card** (second step, same release): R1 "Todo · <due / waiting / …>", "↳ <meeting> ›"
  when it has provenance, ✕, Edit; R2 title with labels; R3 ☐ done, flow chips (w/f · Maybe ·
  Someday · Next) and **Now**, all acting at once, note; R4 area chip with refile, file chip or
  +clip, delete (right).
- **K10 No list toolbar.** The meeting-list toolbar is removed; rows stay quiet (M1-M2 of the
  reflection design). Lists without Quick Add (close-out, Looking back, Engage) are unchanged.
- **K12 After saving.** Save of an edited item returns to its card; + Add returns to an empty
  Quick Add with the previous item's Project/Area abbreviation tag pre-filled (when it had one).
  A double tap on an unselected row goes straight to edit.
- **K11 Out of scope:** the lasso capture variant (its own taller layout), loop editing in the
  loop overview (it goes straight to edit, as today), Engage's collapsed Quick Add.

## Part B — Technical design

### 1. Current state

- `ui/QuickAddWidget.tsx` (2138 lines, baseline 2139: may only shrink) renders R1 tabs, R2/R3 per
  kind (all mounted, hidden with `display: none` so TextInputs never remount), the provenance line
  as an extra row (create, Todo), and R4 (`ui/quickAdd/ActionRow.tsx`: `CreateActionRow`,
  `EditActionRow` with trash, New from this, Refile/File:, Cancel, M, Save). Edit mode is chosen by
  `editingTask` / `editingMeeting` / `editingLoop` and `editTargetKey`.
- `ui/useEditTarget.ts`: one `target` and one `arm` per screen; `start` saves the open edit first.
- Refile exists where a Files pane exists (`onRefile` arms it with intent `refile`/`file`:
  Project/Area, Inbox, Review's Inbox step); elsewhere a recognized abbreviation tag files the
  item ("File: <Name>", `onQuickFile`).
- On `feature/meeting-reflection`: the list toolbar (`ui/MeetingToolbar.tsx`,
  `ui/useMeetingToolbar.ts`, `domain/meetingToolbar.ts`), `ui/useReflectionLookup.ts`, and the
  reflection storage and entry points.

### 2. Sequencing with Q4 (Quick Add split)

**Q4 first, on its own branch, then this feature on top.** Reasons:

1. `QuickAddWidget.tsx` cannot grow (baseline ceiling). K3-K6 change R1, R3, R4 and the
   provenance row; without the split they would force the split inside this feature anyway.
2. Q4 is proven by "behaviour unchanged, scenarios green". Mixed with this behaviour change, that
   proof is lost and a regression in the central surface could hide in the diff.
3. Q4's planned shape - one hook per draft, one `editTarget: {kind, …}`, the capture variant as
   its own shell - is exactly the seam this feature needs. Two small additions to Q4's design make
   the hand-over clean, without changing behaviour:
   - the frame as row slots: `QuickAddFrame` renders `row1 … row4` with fixed heights (still
     22/36/32/32 in Q4), so this feature only changes heights and contents;
   - `editTarget` carries a `mode` field that Q4 always sets to `'edit'`.

Order:

1. **Q4** on `feature/quickadd-split` from `main` (as designed in
   `docs/dev/history/technical-design-quality-hardening.md` §6, plus the two additions above);
   scenarios 1-6 and the Quick Add scenarios unchanged and green; device check; merge to `main`.
2. Merge `main` into `feature/meeting-reflection`.
3. This feature on `feature/meeting-reflection` (steps in §8). The toolbar of S5 is replaced
   before anything is released, so users never see it.
4. One release: the Reflection page and the item card together.

### 3. Selection and edit state — `ui/useEditTarget.ts`

```ts
type EditMode = 'card' | 'edit';
// returned in addition to today's fields
mode: EditMode;
select(t: T): void;   // first tap: saves an open edit first (as start does), then card mode;
                      // a tap on the target already shown as card switches to edit
edit(): void;         // the card's Edit
close(): void;        // ✕ on the card or Cancel in edit: back to Quick Add (create)
```

- `start(t)` stays for callers that edit directly (loop overview's Edit, "New from this" seeds),
  meaning `select` + `edit`.
- Save-then-switch (`useEditFlush`) runs only when leaving `mode === 'edit'`.
- The arm stays as today; the card's +clip and area-chip arrow call the screen's existing
  `armFor` (`intent: 'link' | 'refile' | 'file'`). While armed, the card stays shown.
- The rule "a screen's edit/arm state through `ui/useEditTarget.ts`" holds; `npm run code-health`
  needs no change.

### 4. The box — `ui/quickAdd/QuickAddFrame.tsx` (from Q4)

- Fixed heights: **R1 30, R2 36, R3 32, R4 32**, gaps 6, padding 10, border 1 → **170 dp**. The
  frame sets `height` (not `minHeight`) and clips; every row sets its own `height`.
  `QUICK_ADD_HEIGHT = 170` is exported and used by the budget docs and the render test.
- Children: `QuickAddWidget` (create/edit; stays mounted the whole time, hidden with
  `display: none` while the card shows, so drafts and TextInputs survive) and the card.
- `design-device-rendering.md` §5.4 changes to 170; every screen with Quick Add loses 8 dp from
  its self-measured lists.

### 5. Rows

- **R1** (`ui/quickAdd/Row1.tsx`): tabs (inactive greyed while editing, as today) and the action
  cluster: create `[M] + Add` (label as today, incl. "+ Add to <Name>"); edit `Cancel · Save`
  (`Save to <Name>` when `resolveAbbrevFileTarget` finds a target: Save then runs today's
  `onQuickFile` path, so the item is saved and moved in one step); card `✕ · Edit`.
- **R2, R3**: unchanged components. R3 loses the attachment cluster (it moves to the card).
- **R4** (`ui/quickAdd/TagRows.tsx`): the second tag row, or the provenance line (K6). In
  w/f-mode Todo, R3 holds "Waiting on" and R4 the tags.
- **Tag paging over two rows**: `ui/tagChipLayout.ts` gains
  `paginateTwoRows(items, widthOf, row3Width, row4Width)` → pages of `{row3: T[], row4: T[]}`;
  page 0's `row3Width` is what the flow chips or time field leave; later pages use the full R3
  width. `TagChips` renders one page across two rows; ‹ › at the end of R4. Label shortening,
  pinned-first and the 1.25 width safety stay as they are. With provenance, only R3 holds tags.

### 6. The cards — `ui/itemCard/`

- `domain/itemCard.ts` (pure, replaces `domain/meetingToolbar.ts`):
  `meetingCardModel({meeting, setups, nowMs, reflection, canLink, canRefile, ownerName,
  threadTag})` and later `todoCardModel(...)` → what each row shows (phase label, which toggles,
  reflect state, file chip vs +clip, area chip with or without refile). Labels and phase texts
  live here.
- `ui/itemCard/MeetingCard.tsx`, `TodoCard.tsx`: lay the model out in the four rows; shared
  `AreaChip.tsx` (name › + optional refile arrow), `FileChip.tsx` (name opens, ✕ unlinks; or
  +clip), `ToggleBox.tsx` (P / R / M / Now; filled = on), `icons.tsx` additions (reflect: loop
  back with a question mark; refile arrow; new from this; cancel meeting).
- `ui/itemCard/useMeetingCardActions.ts` (from `useMeetingToolbar.ts`): tick, M, note, reflect
  (via `ui/useReflectionLookup.ts` and `storage/reflectionPage.ts`), unlink, link (arm), refile
  (arm or `onQuickFile`-free path), New from this (seeds the meeting draft, closes the card),
  cancel meeting (the screen's existing cancel). Every write goes through the screen's existing
  handlers (`saveEntryMeetings`, `mutateEntryMeetings`, …); writes target the current stored copy
  (M7 of the reflection design).
- Unlink writes `linkedFile: ''` through the same path the edit form's ✕ used.
- Each action ends with `requestEinkRefresh()`; errors go to the status slot via the screen's
  `useActionError`.

### 7. Screens

| Screen | Selection today | Card gets | Refile | Link |
|---|---|---|---|---|
| Daily | `editTarget` | meetings (+ todos in step 2) | abbreviation only | no |
| Week / Month day panel (`usePlanningScreen`) | `editingKey` | meetings | abbreviation only | no |
| Project / Area (`ProjectDataPanel`) | `editTarget` | both | yes (arm) | yes |
| Inbox | `editTarget` | both | yes (arm) | yes |
| Review Inbox step | `editTarget` | both | yes (arm) | yes |
| Thread / loop overview (`useEntryActions`) | `edit.target` | both | abbreviation only | no |

Removed: `ui/MeetingToolbar.tsx`, `ui/useMeetingToolbar.ts`, the `toolbar` props on
`MeetingList`/`DayMeetingsPanel`/`AheadSection`, `domain/meetingToolbar.ts` (logic moves to
`domain/itemCard.ts`). Kept: `PagedSection.subHeader` (generic), `useReflectionLookup`, the
reflection storage and entry points, the quiet `MeetingRow`.

### 8. Implementation steps (each: `npm run check` green, one commit, push)

- **P0** (before): Q4 merged to `main`, `main` merged into this branch.
- **P1 Frame and rows**: `QuickAddFrame` at 170 dp, R1 actions, R4 tag rows, two-row paging,
  provenance in R4, "Save to <Name>", edit form without R4 commands. Todo edit keeps delete and
  Refile reachable through a temporary card-less path only until P3 (see Open point 1).
- **P2 Meeting card**: `useEditTarget` modes, `domain/itemCard.ts`, `MeetingCard` and actions;
  wiring on all six screens; toolbar removed; reflection scenarios moved from toolbar to card.
- **P3 Todo card**: `TodoCard`, todo actions (done, flow, Now, delete, refile, link/unlink);
  todo rows: tap selects as for meetings.
- **P4 Docs**: help pages (`quick-add.md`, `meetings.md`, `daily.md`, `week-and-month.md`,
  `projects-and-areas.md`, `threads.md`, `loops.md`, `review.md`), CHANGELOG (Changed; the toolbar
  lines of the reflection work are replaced before release), `design-overview.md`,
  `design-device-rendering.md` (170 dp), scenario catalog, "As built" here and a pointer in the
  reflection design's As built.

## Part C — Tests

The box is the plugin's central surface: every behaviour that moves gets a test before it moves,
and every new state a scenario.

### Jest (pure and component)

- `domain/itemCard.test.ts`: phase labels; P/R only when tracked for that phase; M state; Reflect
  only when over and not cancelled, filled when the page exists; file chip vs +clip vs nothing
  (no Files pane); area chip with/without refile; thread link only with a thread tag; todo model:
  due/waiting/origin labels, Now only with #next.
- `tagChipLayout.test.ts`: `paginateTwoRows` - page 0 narrower R3, later pages full; pinned tags
  first and possibly spilling into R4 and page 1; provenance (R3 only); arrows reserved; one
  over-wide chip still makes progress.
- `useEditTarget.test.tsx`: select → card; second select on the same target → edit; select
  another while editing saves first and lands in card mode; a failed save stays; close/cancel
  clear the arm; `start` = select + edit.
- **Height test** `quickAddFrame.test.tsx`: renders the frame in every state (create Todo /
  Meeting / Note, w/f, provenance, edit meeting, edit todo, meeting card before/over/cancelled,
  todo card) and asserts the frame's `height` is `QUICK_ADD_HEIGHT` and each row's height is its
  constant - so no future change can make the box jump.
- Render tests for `MeetingCard` / `TodoCard`: each slot present or absent per model, buttons
  call their handlers, accessibility labels on icon-only buttons.

### Scenario tests (`__tests__/scenarios/itemCard.test.tsx`, plus updates)

1. **Tap a meeting shows its card; ✕ brings back the half-typed todo.** Given a draft "Call Anna"
   in Quick Add; when I tap a meeting; then the card names it and the draft is gone from view;
   when I tap ✕; then "Call Anna" is still in the field.
2. **Second tap edits, Save keeps it.** Tap the meeting twice; change the title; Save; the file
   has the new title; the card is shown again (or Quick Add, per Open point 2).
3. **Tick Reviewed and M on the card.** The line gets `#reviewed` and `#monthly`; the row shows
   ✓ and M; nothing else in the file changes.
4. **Reflect from the card** (the three reflection scenarios rewritten from toolbar to card:
   placement after hand-added pages, no page yet, renamed meeting).
5. **Link and unlink a file from the card on the Area page.** +clip arms the Files pane, pick a
   file, the chip shows its name; ✕ unlinks; the line has no link.
6. **Refile from the area chip** (Area page): the arrow arms the Files pane, pick a Project, the
   meeting moves with its note.
7. **Save to <Name>.** Edit a meeting on Daily, type `#GR`; the button says "Save to Garden
   renovation"; Save moves the meeting there.
8. **New from this and Cancel meeting from the card.** New from this fills Create · Meeting with
   the title; Cancel meeting marks it cancelled after the confirm.
9. **Provenance takes Row 4.** In a thread overview, Create · Todo shows "↳ from …" and the
   todo is added with `[meeting:: …]`.
10. **Daily has no +clip, the Area page has.** (M4 of the reflection design, rewritten for the
    card.)
11. **Todo card**: tick done; Next → Someday at once; Now; delete with its confirm; refile; the
    "↳ <meeting> ›" link opens the thread overview.
12. **Switching while editing saves first.** Edit a meeting, change its title, tap another
    meeting: the first is saved, the second shows as card.

Existing scenarios that change with the UI (taps only, never their assertions): Quick Add
(`quickAdd.test.tsx`), Inbox refile, Daily, Review Inbox, the reflection scenarios. They are
updated in the step that changes the tap path, and stay green.

### Device (A5 X)

1. Every state on Current and Daily: the box keeps its height, the lists below never move or
   flash; e-ink refresh after card actions.
2. Tag rows: long tags, many tags, paging on both rows; the abbreviation chips upper-case.
3. Typing in edit: keyboard and handwriting panel stay below the box; Save/Cancel reachable.
4. Card icons readable without labels (P, R, M, note, reflect, refile, new from this, cancel).
5. Regression: Quick Add create on Daily, Inbox, Project, Week, Month, thread and loop overview,
   Review steps; capture variant unchanged.

## Decisions on the open points

Decided with Tilman:

1. **P1-P3 together.** The three steps are built together on one branch and ship in one release;
   users never see the edit form without its commands.
2. **After Save** of an edited item: back to that item's card. **After + Add** of a new item:
   back to an empty Quick Add, ready for the next one, with the Project/Area abbreviation tag of
   the previous item pre-filled when one was used (so a run of items for "#GR" needs the tag
   once).
3. **Second tap** on a selected todo or meeting opens its edit form. A **double tap** on a row
   that is not selected goes straight to edit as well (two taps within the double-tap interval
   the rows already use for `#next`/`#now`; on the device, check that a slow double tap still
   reads as "select, then edit", which ends in the same place).
4. **Order:** Q4 (Quick Add split) first, on its own branch, merged to `main`; then this feature.
