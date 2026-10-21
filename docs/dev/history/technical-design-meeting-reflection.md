# Meeting reflection page and the meeting-list toolbar

Requirements (Part A), technical design (Part B) and scenario tests (Part C) for the feature on
branch `feature/meeting-reflection`. Approved 2026-10-21. An "As built" section is added when the
branch is finished (DEVELOPMENT-POLICY §8).

## Part A — Meeting reflection page and a quieter meeting row — requirements

Status: **requirements decided, design approved** (Tilman, 2026-10-21). UI design: canvas "Meeting reflection page – UI design" (boards 1, 3, 4, 5 and concept D / D2-1).
Technical design: Part B. Scenario tests: Part C.

### Why

After a meeting, results are already handled: close-out, Marks/lasso, Engage's Agreed tab. **Reflecting** has no home: how did it go, what did I notice, what did I hold back, what do I try next time. For sparring sessions Tilman works around this today with reflection todos whose pages land in the thread notebook. This fills the todo list with things that aren't tasks.

At the same time the meeting row has gathered many small targets (prep/review box, note, +clip, M). One more ("Reflect") doesn't fit. So the row is made quieter, and everything except opening the note moves to one toolbar per list.

### Decisions

#### Reflection page

- **R1 What.** A *Reflection page* is one extra page per meeting, for reflecting in handwriting. It replaces the reflection-todo workaround. Internal page kind: `review`, user-facing name: **Reflection**.
- **R2 When.** It is offered for every meeting that is over (`meetingAutoUpdateCutoffMs`), not cancelled. It isn't tied to "Review after" tracking. It is never required: no counts, no reminders.
- **R3 Where.** In the meeting's note (thread notebook, loop note, home notebook or the meeting's own note), after the meeting's page **and every page that follows it until the next page that starts an item** — the page of another meeting or of a todo, or a pinned first page. Pages inserted by hand after the meeting's page belong to the meeting, so the reflection goes after them, never between the meeting's page and its handwritten pages. In a meeting's own note it is the last page. If the meeting has no page yet, its page is created first, so the order is always meeting page → (hand-added pages) → reflection.
- **R4 What's on it.** The layout comes from the setup's **Reflection page** (own layout) or the Default's (Default layout), like the Meeting and Todo pages. Guiding questions are static text pieces of that layout. The Default's Reflection page starts with only *Date & title* as a heading; questions are the user's choice.
- **R5 Findable.** The page has the keyword `reflection <date> <title>` (fitted to the keyword limit), its heading, and the meeting's tags as keywords. It gets no bare date keyword, so for the page order it belongs to the meeting rather than starting a new item.
- **R6 First tap asks.** Creating it asks once in the status slot, in the wording of the other note confirms: "Sparring: reflection page in Meetings/sparring mieke 2026.note, after the meeting's page" · **Add page** (without a meeting page yet: "…: pages for the meeting and its reflection in …" · **Add pages**). After that, tapping opens it.
- **R7 Reflecting ≠ reviewed.** Writing a reflection never ticks `#reviewed`. That stays the user's own tick.
- **R8 Labels.** **Reflect ›** while no page exists, **Reflection ›** once it does.
- **R9 Where to reach it.**
  - the list toolbar (M3) for the selected meeting;
  - Review › Meetings to close out: a third pill after Mark reviewed / Open note (board 1);
  - Engage on the meeting's page once it's over: a quiet line "Reflect on this meeting ›" above "Go to … ›" (board 3);
  - Thread overview › Looking back: a pill next to Open note for the selected past meeting (board 4).
  - No link piece in the next meeting's note.
- **R10 Part of the meeting.** On a reflection page, Engage, Marks and lasso treat the page as the meeting's page: todos captured there get the meeting as their provenance, and Engage opens on its Agreed tab like on the meeting page.
- **R11 Settings.** Note setups gets a page row **Reflection page** for Thread and Loop setups and for the Default.

#### Meeting row and list toolbar (concept D, D2-1)

- **M1 Row.** A row shows time, title (tags tappable as today), source, the prep/review status icon (read-only), the notebook (one tap: open or create the meeting page, as today) and the clip only when a file is linked (tap opens it). The row no longer has **+clip** (arming) or the **M** toggle; 2-line rows keep the read-only M.
- **M2 Selecting.** Tapping the title, or the status icon, selects the meeting: black bar, and Quick Add loads it for editing, as today.
- **M3 Toolbar.** Every meeting list that has Quick Add shows one toolbar row between the list header and the rows: Daily (Today/Tomorrow), Week and Month day panels, a Project's or Area's meetings, Inbox meetings. It acts on the selected meeting. With nothing selected it stays in place, greyed, with "Tap a meeting", so the list doesn't shift.
- **M4 Toolbar slots,** shown only when they apply:
  1. **Prepped** before the meeting / **Reviewed** after it — a tick, when the setup tracks that phase;
  2. **Reflect ›** / **Reflection ›** once the meeting is over;
  3. **Link file** where a Files pane is there to pick from (Project/Area page, Inbox).
  - **M** stays in Quick Add's edit form, where it already is.
- **M5 Same in both layouts** (D2-1): 1-line and 2-line lists use the same toolbar.
- **M6 Lists without Quick Add** (focus mode's "Coming up", Review close-out, thread overview, Engage) get no toolbar; their rows follow M1.
- **M7 State tags are not title text.** Quick Add's edit form doesn't show `#prepped`/`#reviewed` in the title (like `#monthly`), and Save keeps the meeting's current state. A tick in the toolbar while the edit is open is never undone by Save.

### Out of scope (parked)

- A prep page per meeting (the model allows it as one more page kind).
- Agreement pages in a thread notebook.
- The same toolbar for todo rows (worth considering once this has been used).
- Statistics on reflections.


## Part B — Technical design: Meeting reflection page and the meeting-list toolbar

Status: **approved** (Tilman, 2026-10-21; Default Reflection page: heading only; release number set at release time). Requirements: Part A (R1-R11, M1-M7).
Release: the next feature release after what is in flight (proposal: the one after the Kept GTD rename), branch `feature/meeting-reflection`. On implementation this goes to `docs/dev/history/technical-design-meeting-reflection.md` with an "As built" section.

Design goals:

- **Files stay the truth.** Whether a meeting has a reflection is read from its note (a keyword on a page after the meeting's page). Nothing new is stored in project files or settings except the Default's Reflection page layout.
- **Reuse the page machinery.** Page layouts, `populatePage`, keywords, headings, the status-slot confirm and the timeline order are used as they are. The only new placement rule is "directly after an item's pages".
- **One toolbar component** for every meeting list, wired once through `MeetingList`.
- Decisions live in `src/domain/` and are tested.

### 1. Current state (0.18.x)

| Concern | Where | Today |
|---|---|---|
| Page kinds | `domain/pageLayout.ts` `PageKind = 'meeting' \| 'todo' \| 'first' \| 'home'` | `PIECE_PAGES`, `DEFAULT_PIECE_TYPES` per kind |
| Setup pages | `domain/noteSetups.ts` `pageKindsOf`, `layoutFor`, `seedNoteSetupDefaults` | Thread: meeting, todo. Loop: + first. Default: + home |
| Meeting page | `storage/meetingNoteContent.ts` `openOrCreateMeetingNote` → `storage/itemNotePlan.ts` `resolveItemNote` | Plans, confirms (`NoteCreateConfirm`), creates/links, fills, **opens** |
| New page position | `domain/pageOrder.ts` `pageMarks` + `timelineInsertIndex`; `storage/sharedNotePages.ts` `insertItemPage` | A page with a bare date keyword (or a pre-0.13 date-leading anchor) starts an item; others are continuation pages |
| Page → entry | `domain/notePageEntry.ts` `notePageCandidates`, `sharedPageHit`; `storage/noteOwnerOf.ts` | Own note: any page = the entry. Shared: the page's keyword = the entry's keyword |
| Row | `ui/MeetingRow.tsx` | Tappable tracking box, note icon, clip/+clip (`file.onArm`), M (`highlight: 'toggle'` in Week/Month), title tap = `onPress` (edit) |
| List | `ui/MeetingList.tsx` → `ui/PagedSection.tsx` | Header + layout switch; `ui/DayMeetingsPanel.tsx` wraps it for Daily/Week/Month |
| Callers | Daily (`renderMeetingEntry`), Week/Month (`usePlanningScreen.dayRowProps`), Project (`screens/projectData/MeetingsSection.tsx`), Inbox (`InboxScreen.tsx`), focus "Coming up", Review close-out (selector only), WeekPlanner/MonthView day panels | Each screen owns its handlers (`handleToggleMeetingTracking`, `armLinkTarget`, `startMeetingEdit`) |
| Edit form | `ui/quickAdd/editFields.ts` `loadEditFields`; `storage/itemMutations.ts` `applyMeetingEdit` | `#monthly` is stripped and re-applied through the M toggle; `#prepped`/`#reviewed` stay in the title text, so a tick saved while the edit is open is lost on Save |

### 2. Design

#### 2.1 Page kind `review` (R1, R4, R11)

`domain/pageLayout.ts`:

- `PageKind` gains `'review'`; the label in `PAGE_KIND_LABELS` is **"Reflection page"**.
- `PIECE_PAGES`: `title`, `date`, `time`, `text`, `link`, `dateTitle` also offer `'review'`. `related`, `sinceLast`, `scope`, `goals` don't.
- `DEFAULT_PIECE_TYPES.review = ['dateTitle']` (a heading, as on meeting pages).

`domain/noteSetups.ts`:

- `pageKindsOf('thread') = ['meeting', 'todo', 'review']`, `pageKindsOf('loop') = ['meeting', 'todo', 'first', 'review']`; the Default lists `review` too.
- `createDefaultReviewPage()` = `withDefaultPieces(emptyPageLayout(), 'review')`; `seedNoteSetupDefaults` adds it.
- **Existing installs:** the settings migration that already fills the Default's notebook once (`domain/noteSetupMigration.ts`) adds `defaults.pages.review` when it's missing. Upgrade note in the CHANGELOG.

#### 2.2 The reflection keyword and placement (R3, R5) — `domain/reflection.ts` (new), `domain/pageOrder.ts`

```ts
export const REFLECTION_KEYWORD_PREFIX = 'reflection ';
/** `reflection 2026-10-14 Sparring Mieke`, fitted (fitKeyword); never starts with a date, so the page stays a continuation page. */
export function reflectionKeyword(meeting: Pick<Meeting, 'date' | 'title'>): string;
export function isReflectionKeyword(keyword: string): boolean;
/** The reflection page among the continuation pages of the item that starts at `itemPage`, or null. */
export function reflectionPageOf(keywords: readonly PageKeyword[], marks: readonly PageMark[], itemPage: number): {page: number; keyword: string} | null;
```

- Built from `meetingDisplayTitle` like `meetingPageKeyword`, so state tags never appear.
- `reflectionPageOf` scans `itemPage + 1 …` up to the next page that starts an item or is pinned, and returns the first page with a reflection keyword. This survives a renamed meeting: the page is found by position and prefix, not by the exact text.

`domain/pageOrder.ts`:

```ts
/** The index right after the item starting at `itemPage` and its continuation pages. */
export function afterItemIndex(marks: readonly PageMark[], itemPage: number): number;
```

- A *continuation page* is every page without a date keyword: pages the user inserted by hand after the meeting's page (no keywords at all), and an existing reflection page. `afterItemIndex` returns the index of the first page after `itemPage` that starts an item (a meeting's or a todo's page: bare date keyword, or a pre-0.13 date-leading anchor) or is pinned, else the page count. So the reflection goes after all hand-added pages of the meeting and before the next meeting's or todo's page (R3).

#### 2.3 Storage — `storage/reflectionPage.ts` (new)

```ts
export type ReflectionState = {kind: 'none'} | {kind: 'exists'; absolutePath: string; page: number};
/** Reads only. 'none' when the meeting has no page yet, or no reflection after it. */
export async function findReflectionPage(meeting: Meeting, itemPath: string): Promise<ReflectionState>;
/** Opens the reflection, creating it (and the meeting's page first, if needed) after one confirmation. */
export async function openOrCreateReflectionPage(
  meeting: Meeting, itemPath: string, settings: GtdParaSettings, inbox: MeetingNoteInboxInput | null,
  options: OpenOrCreateNoteOptions,
): Promise<{meeting: Meeting; changed: boolean; cancelled: boolean}>;
```

- **find:** resolve the meeting's note (`resolveNotePath` / `parseSharedNoteAnchor`). The meeting page is the keyword page (`findKeywordPage` with the stored or current keyword), or page 0 for an own note. Then one `readAllKeywords` + `pageMarks` + `reflectionPageOf`.
- **create:**
  1. No meeting page yet → `ensureMeetingNote` (below) with the confirm's reflection wording.
  2. Otherwise confirm with plan kind `new-reflection`.
  3. `insertPageAt(filePath, afterItemIndex(...), reflectionKeyword(meeting), backgroundOf(layout))`.
  4. Fill with `populatePage(…, layoutFor(setup, 'review', defaults), …)`, then the tag keywords (`planPageKeywords` with `date: null`) and the headings.
  5. `openPath(file, page)`.
- **open:** if the found keyword differs from the current `reflectionKeyword`, `renameKeywordAt` (lazy, like meeting pages); then `openPath`.
- **Refactor** in `storage/meetingNoteContent.ts`: split `openOrCreateMeetingNote` into `ensureMeetingNote` (plan, confirm, create, fill; returns the anchor and the updated meeting) and the opening step. Every existing caller keeps calling `openOrCreateMeetingNote`, which keeps its behaviour.
- **Refactor** in `storage/sharedNotePages.ts`: `insertItemPage` becomes `insertPageAt(filePath, index, keyword, template)` plus the existing position step, so both use the same keyword check (`assertKeywordFits`), logging and debug-log entry.
- `domain/noteCreationPlan.ts`: plan kind `'new-reflection'` with an optional `withMeetingPage: true`; texts in `domain/fileChangeText.ts`, in the existing pattern: "Sparring: reflection page in Meetings/sparring mieke 2026.note, after the meeting's page" · **Add page**; with the meeting page: "Sparring: pages for the meeting and its reflection in …" · **Add pages**.

#### 2.4 The reflection page is part of the meeting (R10)

- `domain/notePageEntry.ts` `sharedPageHit`: a meeting candidate also matches when the page carries its `reflectionKeyword` (current or by prefix + date + title). Own notes already map every page to the meeting.
- So `noteOwnerOf` returns rule `meetingNote` with the meeting on a reflection page: Engage opens on Agreed, and Marks/lasso provenance comes out as the meeting with no further change. Test this in `notePageEntry.test.ts`.

#### 2.5 State tags out of the edit title (M7)

- `domain/meetingTracking.ts`: `stripTrackingTags(title)` and `withTrackingTagsOf(title, stored)` (re-applies `#prepped`/`#reviewed` as the stored meeting has them).
- `ui/quickAdd/editFields.ts` `loadEditFields`: title = `stripTrackingTags(setHighlight(title, false))`.
- `storage/itemMutations.ts` `applyMeetingEdit(meeting, fields, linkedFile)`: title = `withTrackingTagsOf(fields.title, meeting)`. Every caller already passes the **current** stored copy inside its mutator (`meetings[entry.meetingIndex]`), except the Refile/move path in Daily (`entry.meeting`), which is changed to read the current copy.

#### 2.6 Toolbar — `domain/meetingToolbar.ts` (new), `ui/MeetingToolbar.tsx` (new)

```ts
export type ToolbarSlot =
  | {kind: 'checkpoint'; tracking: MeetingTrackingKind; done: boolean; label: 'Prepped' | 'Reviewed'}
  | {kind: 'reflection'; label: 'Reflect ›' | 'Reflection ›'; pending: boolean}
  | {kind: 'link'; label: 'Link file'};
export function meetingToolbarSlots(input: {
  meeting: Meeting | null; setups: NoteSetupConfig; nowMs: number;
  reflection: 'unknown' | 'none' | 'exists'; canLink: boolean;
}): ToolbarSlot[];
export const TOOLBAR_EMPTY_HINT = 'Tap a meeting';
```

- checkpoint = `resolveMeetingTracking` (null → no slot); reflection only when `nowMs > meetingAutoUpdateCutoffMs(meeting)` and not cancelled. While the lookup runs (`'unknown'`) it shows "Reflect ›" disabled. Link file when `canLink`.
- `ui/MeetingToolbar.tsx`: one row, fixed height `MEETING_TOOLBAR_HEIGHT = 44` (box 40 + 4 margin), ghost buttons (`FONT.small`, the Quick Add button style), the meeting's name right-aligned in `FONT.small`. With no meeting: greyed buttons for the slots that the list can ever show and `TOOLBAR_EMPTY_HINT`. It calls `requestEinkRefresh()` after an action, like the row icon does today.
- `ui/useMeetingToolbar.ts`: given the selected `{meeting, itemPath, forceOwn}` and the screen's callbacks (`onToggle(kind)`, `onArmLink?`, `persistMeeting(updated)`), it runs `findReflectionPage` when the selection changes (cancelled when it changes again), and `openOrCreateReflectionPage` on tap (persisting a changed `notePath` through `persistMeeting`). It returns the `<MeetingToolbar>` element.

#### 2.7 List and row changes (M1-M6)

- `ui/PagedSection.tsx`: optional `subHeader?: React.ReactNode` rendered between the header line and the rows. The viewport is self-measured, so the row budget follows.
- `ui/MeetingList.tsx`: optional `toolbar?: React.ReactNode` passed as `subHeader`. `ui/DayMeetingsPanel.tsx` passes its own `toolbar` prop through.
- `ui/MeetingRow.tsx`:
  - `tracking` becomes display-only: `MeetingTrackingConfig.onToggle` is removed. The icon sits inside the row's main `Pressable`, so tapping it selects (`onPress`).
  - `file.onArm` is removed; the clip shows only for a linked file.
  - `highlight: 'toggle'` and `onToggleHighlight` are removed; `'mark'` stays (2-line).
  - Sizing (`MEETING_ROW_HEIGHT`) is unchanged.
- Callers:

| Screen | Toolbar | Selected meeting | canLink |
|---|---|---|---|
| Daily (`DailyView.tsx`) | `DayMeetingsPanel toolbar` | `editingMeetingEntry` | no |
| Week/Month (`usePlanningScreen.ts`, `WeekPlanner.tsx`, `MonthView.tsx`) | `DayMeetingsPanel toolbar`; `dayRowProps` loses `highlight: 'toggle'` | `editingKey` | no |
| Project/Area (`MeetingsSection.tsx`) | `MeetingList toolbar` | the edited meeting | yes (`onArmLink`) |
| Inbox (`InboxScreen.tsx`) | `MeetingList toolbar` | `editingMeetingIndex` | yes (`armLinkTarget`), `forceOwn` |
| focus "Coming up", Review close-out, thread overview, Engage | none (M6) | — | — |

- Each screen's existing `handleToggleMeetingTracking` becomes the toolbar's `onToggle`; nothing else in the write path changes.

#### 2.8 Other entry points (R9)

- **Review close-out** (`MeetingsCloseOutStep.tsx`): a third pill. Its label comes from `findReflectionPage` for the selected entry; the tap calls `openOrCreateReflectionPage` (with `confirmCreate`) and persists a changed `notePath` through the step's existing `saveMeetings` path.
- **Thread overview** (`screens/thread/PastMeetingPanel.tsx`): a pill next to Open note, through `useEntryActions` (new `reflection(entry)` action beside `meetingNote`).
- **Engage** (`screens/engage/ReflectLine.tsx`, new): shown on the options/ownerEmpty screens when `state.pageMeeting` is set, that meeting is over, and the page shown isn't already its reflection. Placed above `GoToLine`. On success the panel closes, like `openNote`.

#### 2.9 Budget (A5 X)

- Toolbar: 44 dp per list. In Daily's calendar column this costs one 1-line row (37 dp) or less than one 2-line row (57 dp) per page. Week/Month day panels and the Project page get the same.
- `docs/dev/design-device-rendering.md` §3/§5 gets the toolbar height.
- No new screen; no input moves below the upper two thirds.

### 3. Files

**New:**
- `src/domain/reflection.ts`, `src/domain/meetingToolbar.ts`
- `src/storage/reflectionPage.ts`
- `src/ui/MeetingToolbar.tsx`, `src/ui/useMeetingToolbar.ts`, `src/screens/engage/ReflectLine.tsx`
- tests: `__tests__/domain/reflection.test.ts`, `meetingToolbar.test.ts`; scenario tests in `__tests__/scenarios/` from §5

**Changed:**

| File | Change |
|---|---|
| `domain/pageLayout.ts`, `domain/noteSetups.ts`, `domain/noteSetupMigration.ts` | `review` page kind, seed, migration |
| `domain/pageOrder.ts` | `afterItemIndex` |
| `domain/notePageEntry.ts` | reflection keyword matches the meeting |
| `domain/meetingTracking.ts` | `stripTrackingTags`, `withTrackingTagsOf` |
| `domain/noteCreationPlan.ts`, `domain/fileChangeText.ts` | `new-reflection` plan + texts |
| `storage/meetingNoteContent.ts` | `ensureMeetingNote` split |
| `storage/sharedNotePages.ts` | `insertPageAt` split |
| `storage/itemMutations.ts`, `ui/quickAdd/editFields.ts` | state tags out of the edit title |
| `ui/PagedSection.tsx`, `ui/MeetingList.tsx`, `ui/DayMeetingsPanel.tsx`, `ui/MeetingRow.tsx` | toolbar slot, quieter row |
| `screens/DailyView.tsx`, `screens/usePlanningScreen.ts`, `screens/WeekPlanner.tsx`, `screens/MonthView.tsx`, `screens/projectData/MeetingsSection.tsx`, `screens/InboxScreen.tsx` | toolbar wiring, row props |
| `screens/review/steps/MeetingsCloseOutStep.tsx`, `screens/thread/PastMeetingPanel.tsx`, `ui/useEntryActions.ts`, `screens/engage/EngageOverlay.tsx` | entry points |
| `screens/settings/noteSetups/PageRows.tsx` (labels via `PAGE_KIND_LABELS`) | Reflection page row |
| `docs/user/meetings.md`, `note-setups.md`, `review.md`, `engage.md`, `threads.md`, `daily.md`, `week-and-month.md`, `projects-and-areas.md`, `CHANGELOG.md` (New, Changed: M and +clip moved, Upgrade note), `docs/dev/design-overview.md`, `docs/dev/design-device-rendering.md` | docs |

### 4. Implementation steps

Each step ends with `npm run check` green and is its own commit on `feature/meeting-reflection`.

- **S0 Harness:** H1-H4 from Part C (page content in the fake SDK, page helpers, `openEngage`, setup builder).
- **T0 Device check (Tilman, current release, no code):** in a notebook with pages of two meetings, open the note of an *older* third meeting of the same setup, so the timeline puts its page in the middle (this uses the same `insertNotePage` mid-file path the reflection needs). Then add a page by hand after it and check that the next item's page and the Integrity Check are fine. **If this fails, stop.**
- **S1 Domain:** `review` page kind, `reflection.ts`, `afterItemIndex`, `meetingToolbarSlots`, tracking-tag helpers; tests.
- **S2 Edit form (M7):** `loadEditFields` / `applyMeetingEdit`, Daily's move path; tests. Ships value on its own (fixes a lost tick).
- **S3 Storage:** `insertPageAt`, `ensureMeetingNote`, `reflectionPage.ts`, plan kind + texts, migration of the Default.
- **S4 Settings:** the Reflection page row in Note setups (setup and Default).
- **S5 Toolbar + quieter row:** `PagedSection.subHeader`, `MeetingList`/`DayMeetingsPanel` toolbar, `MeetingToolbar`, `useMeetingToolbar`, `MeetingRow` changes, all six screens. **Checkpoint: device test 1-4.**
- **S6 Entry points:** close-out pill, thread overview pill, Engage line; `notePageEntry` reflection match.
- Each step adds its scenarios from Part C as soon as they can pass; all eight are green before S7.
- **S7 Docs:** help pages, CHANGELOG, design-overview, device-rendering, "As built". **Device test 5-9.**

### 5. Test plan

**Jest (pure):**
- `reflectionKeyword`: date and title; state tags stripped; fitted to 43 characters; never date-leading.
- `afterItemIndex`: after a one-page item; after an item with two continuation pages; at the end; before the next item; ignores pinned pages before.
- `reflectionPageOf`: found after the meeting; not found beyond the next item; found by prefix after the meeting was renamed.
- `pageMarks` with a reflection page: it stays a continuation page, so a later meeting's timeline insert goes after it.
- `meetingToolbarSlots`: before (Prepped only when tracked), after (Reviewed + Reflect), cancelled (none), untracked over (Reflect only), `canLink`, `unknown` → disabled Reflect, `exists` → "Reflection ›".
- `stripTrackingTags` / `withTrackingTagsOf`: round trip; a tick added on disk after loading survives Save; `#monthly` still handled by the M toggle.
- `sharedPageHit`: a reflection page maps to its meeting.

**Scenario tests:** eight scenarios in `__tests__/scenarios/meetingReflection.test.tsx`, spelled out with their coverage, fixed texts and the harness additions they need in Part C.

**Smoke render:** `MeetingToolbar` empty / before / after / with link; `MeetingRow` without +clip and M toggle in both layouts.

**Device (A5 X, demo space with a sparring thread):**
1. Daily: tap a meeting → black bar, Quick Add in edit, toolbar names it; tap the status icon → same.
2. Toolbar: Reviewed ticks and unticks; the row icon follows; Save in the open edit keeps the tick.
3. Week and Month day panels: same toolbar; M toggles in Quick Add's edit form; the row shows the read-only M.
4. Project page and Inbox: Link file arms the Files pane; the clip opens the linked file.
5. Reflect on a past sparring → one confirm → page right after the meeting's page in `sparring … 2026.note`, heading and questions from the setup, keyword `reflection …`. The toolbar now says "Reflection ›" and opens it.
6. A meeting without a page → one confirm, meeting page and reflection page in that order.
7. Capture a todo with lasso on the reflection page → its provenance is the meeting; Engage there opens on Agreed.
8. Close-out pill, thread overview pill, Engage line all open the same page.
9. Regression: notebook icon open/create, Refile, New from this, the 1-line/2-line switch, paging in Daily's calendar column.

### 6. Open points

- Release number (before or after the Kept GTD rename): decided when the branch is merged. Until then CHANGELOG lines go under `## [Unreleased]`.


## Part C — Meeting reflection — scenario tests

Status: **draft with the technical design** (Part B §5). These scenarios become `__tests__/scenarios/meetingReflection.test.tsx` and appear in `docs/dev/test-scenarios.md` through `npm run scenarios`. They fix the labels and confirm texts the implementation must use.

### Scenarios as the catalog will read them

#### Reflect on a sparring session: the page comes after the meeting's page and the pages added to it by hand

- **Given** area "Coaching" has a sparring session three days ago and a check-in since; in "sparring mieke <year>.note" the session's page is followed by two pages added by hand, then the check-in's page
- **When** I open Coaching and tap the sparring session
- **Then** the toolbar acts on it and offers "Reflect ›" and "☐ Reviewed"
- **When** I tap "Reflect ›" and confirm the new page
- **Then** the reflection page comes after both hand-added pages, not straight after the session's page, and before the check-in's page
- **And** the reflection page has no date keyword of its own, so it stays part of the meeting
- **And** it carries the setup's heading and guiding question
- **And** it was opened, and the toolbar now says "Reflection ›"
- **And** the meeting is not ticked reviewed and its line is unchanged

#### Reflect on a meeting that has no page yet: one question, then meeting page and reflection in order

- **Given** area "Coaching" has a sparring session three days ago without a note, and no sparring notebook exists
- **When** I tap the session, tap "Reflect ›" and confirm
- **Then** the notebook exists with the meeting's page first and the reflection second
- **And** the meeting links its page, and the reflection is what opened

#### A renamed meeting finds its reflection again

- **Given** the sparring session has a reflection page, and its title was changed to "Sparring Mieke roles" since
- **When** I tap the session
- **Then** the toolbar says "Reflection ›"
- **When** I tap it
- **Then** the same page opens, now with the keyword of the new title

#### The toolbar follows the selected meeting

- **Given** area "Coaching" has a sparring session three days ago and one in two days, both tracked by the Sparring setup
- **When** I open Coaching without tapping a meeting
- **Then** the toolbar is there but says "Tap a meeting"
- **When** I tap the session in two days
- **Then** it offers "☐ Prepped" and "Link file", but no reflection yet
- **When** I tap the session three days ago
- **Then** it offers "☐ Reviewed", "Reflect ›" and "Link file"

#### Tick reviewed in the toolbar while editing the meeting: Save keeps the tick

- **Given** the sparring session three days ago was ticked prepped before it took place
- **When** I tap the session to edit it
- **Then** the title field shows the title without #prepped
- **When** I change the title, tick "☐ Reviewed" in the toolbar and then tap Save
- **Then** the meeting has the new title and keeps both #prepped and #reviewed

#### Daily: tomorrow's tracked meeting offers Prepped, and Daily has no Link file

- **Given** area "Coaching" has a sparring session tomorrow
- **When** I open Daily, switch to Tomorrow and tap the session
- **Then** the toolbar offers "☐ Prepped" and nothing else

#### Reflect from Review's "Meetings to close out" without ticking it reviewed

- **Given** the sparring session three days ago is tracked for review and not reviewed yet; its page is followed by two pages added by hand, then the check-in's page
- **When** I open Review, the step "Meetings to close out", tap the session and "Reflect ›", and confirm
- **Then** the reflection page comes after the two hand-added pages and before the check-in's page
- **And** the meeting is still not reviewed

#### Engage on the meeting's page offers the reflection; on the reflection page it opens on what was agreed

- **Given** the todo "Send Mieke the role canvas" was agreed in the sparring session three days ago; in the notebook the session's page is followed by a page added by hand, then the page of the todo "Prepare the workshop"
- **When** I open Engage on the meeting's page
- **Then** it offers "Reflect on this meeting ›"
- **When** I tap it and confirm
- **Then** the reflection page comes after the hand-added page and before the todo's page, and opens
- **When** I open Engage on the reflection page
- **Then** it opens on "Agreed 1" from the sparring session, with the agreed todo
- **And** it doesn't offer to reflect again

### Coverage

| Requirement | Scenario |
|---|---|
| R2 offered once over; M4 slots by phase | toolbar follows; Daily tomorrow |
| R3 placement after the meeting's page **and every page added to it by hand**, before the next page that starts an item (a meeting's or a todo's) | sparring session (two hand-added pages, next item a meeting); close-out (same); Engage (one hand-added page, next item a todo) |
| R3 meeting page first when missing | no page yet |
| R4 layout from the setup (heading, question) | sparring session |
| R5 keyword, no date keyword, fitted to 43 | sparring session (`reflection <date> Sparring Mieke`, tag left out) |
| R5 found again after a rename, lazy keyword rename | renamed meeting |
| R6 one confirm, wording | sparring session; no page yet |
| R7 not reviewed | sparring session; close-out |
| R8 labels Reflect › / Reflection › | sparring session; renamed meeting |
| R9 toolbar, close-out, Engage | sparring session; close-out; Engage |
| R10 reflection page = meeting's page in Engage | Engage |
| M3 toolbar with nothing selected | toolbar follows |
| M4 Link file only where a Files pane exists | toolbar follows (Area page: yes); Daily (no) |
| M7 state tags out of the edit title | tick reviewed while editing |

Not covered here (device test, §5 of the design): the thread-overview pill, Week/Month day panels and M in the edit form, row look (no +clip, no M toggle), paging with the toolbar, real page content and headings on the device, lasso provenance on a reflection page.

### Fixed texts (the implementation uses exactly these)

| Where | Text |
|---|---|
| Toolbar, nothing selected | `Tap a meeting` |
| Toolbar checkpoint | `☐ Prepped` / `✓ Prepped`, `☐ Reviewed` / `✓ Reviewed` |
| Toolbar, close-out pill | `Reflect ›` / `Reflection ›` |
| Toolbar | `Link file` |
| Engage | `Reflect on this meeting ›` |
| Confirm, meeting page exists (plan `new-reflection`) | `<Setup>: reflection page in <file>, after the meeting's page` · button `Add page` |
| Confirm, no meeting page yet (`withMeetingPage`) | `<Setup>: pages for the meeting and its reflection in <file>` · button `Add pages` |
| Keyword | `reflection <YYYY-MM-DD> <display title>`, fitted with `fitKeyword` |

The confirm texts follow the existing pattern in `domain/fileChangeText.ts` ("Sparring: new page in …"). Without a matching setup the prefix is left out, as today.

### Harness additions (step S0, before the scenarios)

- **H1 Page content in the fake SDK** (`test-helpers/fakeDevice/fakeSdk.ts`): model the element writes `populatePage` makes (`insertElements`, `getElements` returning what was written, the title elements of `applyPieceHeadings`) and give the textbox measurement a simple fake size. Today these calls are "not available" in the fake, so no scenario can create a note page with pieces. Recorded per page as `{type, text}`.
- **H2 File helpers** (`test-helpers/scenario/files.ts`): `pageKeywords(notePath, page)` and `pageTexts(notePath, page)` (the texts of H1's elements and titles on that page).
- **H3 Engage entry** (`test-helpers/scenario/app.tsx`): `openEngage({fromNote, page, settings?})` mounts the app the way `index.js` does for `ENGAGE_BUTTON_ID`, with `sdk.currentFile`/`currentPage` set.
- **H4 Setups** (`test-helpers/scenario/setups.ts`, new): `sparringSettings()` = a Thread setup "Sparring" on `#sparring`, notebook `{tag} {subtag} {year}` in `Meetings`, tracking prep + review, an own Reflection page = `createDefaultReviewPage()` plus one text piece "What did I notice?"; the seeded Default (`seedNoteSetupDefaults()`); `noteSetupsMigrated: true`.

### Draft test file

Taps go by visible text; while writing, `describeScreen()` confirms the exact row texts on the Area page (a title with tags may render as several text parts).

```tsx
import {isoDateOffset} from '../../src/domain/meetingTime';
import {meetingKey} from '../../src/domain/provenance';
import {device} from '../../test-helpers/fakeDevice/device';
import {expectNotShows, expectShows, fieldValue, openApp, openEngage, tap, tapTab, type} from '../../test-helpers/scenario/app';
import {areaDir, areaFile, dataFile, fileText, pageKeywords, pageTexts, putFile, sectionLines} from '../../test-helpers/scenario/files';
import {and, given, scenario, then, when} from '../../test-helpers/scenario/scenario';
import {sparringSettings} from '../../test-helpers/scenario/setups';

// Dates relative to today, so "over" and "ahead" hold whenever the suite runs.
const d1 = isoDateOffset(-3); // the sparring session we reflect on
const d2 = isoDateOffset(-1); // a later meeting in the same notebook
const ahead = isoDateOffset(2);
const year = d1.slice(0, 4);

const NOTEBOOK_REL = `Meetings/sparring mieke ${year}.note`;
const NOTEBOOK = `${areaDir('Coaching')}/${NOTEBOOK_REL}`;
const MEETING_KW = `${d1} Sparring Mieke #sparring/mieke`;
const CHECKIN_KW = `${d2} Check-in Mieke #sparring/mieke`;
// 52 characters with the tag, so the keyword leaves the tag out (keyword limit 43).
const REFLECTION_KW = `reflection ${d1} Sparring Mieke`;

const sparringLine = (extra = '', withNote = true) =>
  `- ${d1} 10:00-11:00 Sparring Mieke #sparring/mieke${extra}${withNote ? ` → [[${NOTEBOOK_REL}#${MEETING_KW}]]` : ''}`;
const checkinLine = `- ${d2} 09:00-09:30 Check-in Mieke #sparring/mieke → [[${NOTEBOOK_REL}#${CHECKIN_KW}]]`;

/** Area "Coaching" with the given meeting lines (and todos). */
function coaching(meetings: string[], tasks: string[] = []): void {
  putFile(areaFile('Coaching'), dataFile('area', {Scope: [], Tasks: tasks, Meetings: meetings}, ['abbrev: Co']));
}

/**
 * The sparring notebook: the session's page, two pages Tilman inserted by hand after it (no
 * keywords - they belong to the session), then the check-in's page, which starts the next item.
 */
function sparringNotebook(): void {
  device().sdk.putNote(NOTEBOOK, [{keywords: [d1, MEETING_KW]}, {keywords: []}, {keywords: []}, {keywords: [d2, CHECKIN_KW]}]);
}

async function openCoaching(): Promise<void> {
  await openApp({settings: sparringSettings()});
  await tapTab('Areas');
  await tap(/^Coaching/);
}

scenario('Reflect on a sparring session: the page comes after the meeting\'s page and the pages added to it by hand', {feature: 'Meetings', design: 'technical-design-meeting-reflection.md'}, () => {
  given('area "Coaching" has a sparring session three days ago and a check-in since; in "sparring mieke <year>.note" the session\'s page is followed by two pages added by hand, then the check-in\'s page', () => {
    coaching([sparringLine(), checkinLine]);
    sparringNotebook();
  });
  when('I open Coaching and tap the sparring session', async () => {
    await openCoaching();
    await tap(/^Sparring Mieke/);
  });
  then('the toolbar acts on it and offers "Reflect ›" and "☐ Reviewed"', () => {
    expectShows('Reflect ›');
    expectShows('☐ Reviewed');
  });
  when('I tap "Reflect ›" and confirm the new page', async () => {
    await tap('Reflect ›');
    expectShows(new RegExp(`^Sparring: reflection page in Meetings/sparring mieke ${year}\\.note, after the meeting's page`));
    await tap('Add page');
  });
  then('the reflection page comes after both hand-added pages, not straight after the session\'s page, and before the check-in\'s page', () => {
    const pages = device().sdk.note(NOTEBOOK)!.pages;
    expect(pages).toHaveLength(5);
    expect(pages[0].keywords).toContain(MEETING_KW);
    expect(pages[1].keywords).toEqual([]);
    expect(pages[2].keywords).toEqual([]);
    expect(pageKeywords(NOTEBOOK, 3)).toContain(REFLECTION_KW);
    expect(pages[4].keywords).toContain(CHECKIN_KW);
  });
  and('the reflection page has no date keyword of its own, so it stays part of the meeting', () => {
    expect(pageKeywords(NOTEBOOK, 3)).not.toContain(d1);
  });
  and('it carries the setup\'s heading and guiding question', () => {
    expect(pageTexts(NOTEBOOK, 3)).toEqual(expect.arrayContaining([expect.stringContaining('Sparring Mieke'), 'What did I notice?']));
  });
  and('it was opened, and the toolbar now says "Reflection ›"', () => {
    expect(device().sdk.opened.at(-1)).toEqual({path: NOTEBOOK, page: 3});
    expectShows('Reflection ›');
  });
  and('the meeting is not ticked reviewed and its line is unchanged', () => {
    expect(sectionLines(areaFile('Coaching'), 'Meetings')).toEqual([sparringLine(), checkinLine]);
  });
});

scenario('Reflect on a meeting that has no page yet: one question, then meeting page and reflection in order', {feature: 'Meetings', design: 'technical-design-meeting-reflection.md'}, () => {
  given('area "Coaching" has a sparring session three days ago without a note, and no sparring notebook exists', () => {
    coaching([sparringLine('', false)]);
  });
  when('I tap the session, tap "Reflect ›" and confirm', async () => {
    await openCoaching();
    await tap(/^Sparring Mieke/);
    await tap('Reflect ›');
    expectShows(new RegExp(`^Sparring: pages for the meeting and its reflection in Meetings/sparring mieke ${year}\\.note`));
    await tap('Add pages');
  });
  then('the notebook exists with the meeting\'s page first and the reflection second', () => {
    expect(device().sdk.note(NOTEBOOK)!.pages).toHaveLength(2);
    expect(pageKeywords(NOTEBOOK, 0)).toEqual(expect.arrayContaining([d1, MEETING_KW]));
    expect(pageKeywords(NOTEBOOK, 1)).toContain(REFLECTION_KW);
  });
  and('the meeting links its page, and the reflection is what opened', () => {
    expect(sectionLines(areaFile('Coaching'), 'Meetings')).toEqual([sparringLine()]);
    expect(device().sdk.opened.at(-1)).toEqual({path: NOTEBOOK, page: 1});
  });
});

scenario('A renamed meeting finds its reflection again', {feature: 'Meetings', design: 'technical-design-meeting-reflection.md'}, () => {
  given('the sparring session has a reflection page, and its title was changed to "Sparring Mieke roles" since', () => {
    coaching([`- ${d1} 10:00-11:00 Sparring Mieke roles #sparring/mieke → [[${NOTEBOOK_REL}#${MEETING_KW}]]`]);
    device().sdk.putNote(NOTEBOOK, [{keywords: [d1, MEETING_KW]}, {keywords: [REFLECTION_KW]}]);
  });
  when('I tap the session', async () => {
    await openCoaching();
    await tap(/^Sparring Mieke roles/);
  });
  then('the toolbar says "Reflection ›"', () => expectShows('Reflection ›'));
  when('I tap it', () => tap('Reflection ›'));
  then('the same page opens, now with the keyword of the new title', () => {
    expect(device().sdk.opened.at(-1)).toEqual({path: NOTEBOOK, page: 1});
    expect(pageKeywords(NOTEBOOK, 1)).toEqual([`reflection ${d1} Sparring Mieke roles`]);
    expect(device().sdk.note(NOTEBOOK)!.pages).toHaveLength(2);
  });
});

scenario('The toolbar follows the selected meeting', {feature: 'Meetings', design: 'technical-design-meeting-reflection.md'}, () => {
  given('area "Coaching" has a sparring session three days ago and one in two days, both tracked by the Sparring setup', () => {
    coaching([sparringLine(), `- ${ahead} 10:00-11:00 Next sparring Mieke #sparring/mieke`]);
    sparringNotebook();
  });
  when('I open Coaching without tapping a meeting', openCoaching);
  then('the toolbar is there but says "Tap a meeting"', () => expectShows('Tap a meeting'));
  when('I tap the session in two days', () => tap(/^Next sparring Mieke/));
  then('it offers "☐ Prepped" and "Link file", but no reflection yet', () => {
    expectShows('☐ Prepped');
    expectShows('Link file');
    expectNotShows('Reflect ›');
    expectNotShows('☐ Reviewed');
  });
  when('I tap the session three days ago', () => tap(/^Sparring Mieke/));
  then('it offers "☐ Reviewed", "Reflect ›" and "Link file"', () => {
    expectShows('☐ Reviewed');
    expectShows('Reflect ›');
    expectShows('Link file');
    expectNotShows('☐ Prepped');
  });
});

scenario('Tick reviewed in the toolbar while editing the meeting: Save keeps the tick', {feature: 'Meetings', design: 'technical-design-meeting-reflection.md'}, () => {
  given('the sparring session three days ago was ticked prepped before it took place', () => {
    coaching([sparringLine(' #prepped')]);
    sparringNotebook();
  });
  when('I tap the session to edit it', async () => {
    await openCoaching();
    await tap(/^Sparring Mieke/);
  });
  then('the title field shows the title without #prepped', () => {
    expect(fieldValue('New meeting title')).toBe('Sparring Mieke #sparring/mieke');
  });
  when('I change the title, tick "☐ Reviewed" in the toolbar and then tap Save', async () => {
    await type('New meeting title', 'Sparring Mieke roles #sparring/mieke');
    await tap('☐ Reviewed');
    expectShows('✓ Reviewed');
    await tap('Save');
  });
  then('the meeting has the new title and keeps both #prepped and #reviewed', () => {
    const [line] = sectionLines(areaFile('Coaching'), 'Meetings');
    expect(line).toMatch(new RegExp(`^- ${d1} 10:00-11:00 Sparring Mieke roles #sparring/mieke`));
    expect(line).toContain('#prepped');
    expect(line).toContain('#reviewed');
  });
});

scenario('Daily: tomorrow\'s tracked meeting offers Prepped, and Daily has no Link file', {feature: 'Daily', design: 'technical-design-meeting-reflection.md'}, () => {
  given('area "Coaching" has a sparring session tomorrow', () => {
    coaching([`- ${isoDateOffset(1)} 10:00-11:00 Sparring Mieke #sparring/mieke`]);
  });
  when('I open Daily, switch to Tomorrow and tap the session', async () => {
    await openApp({settings: sparringSettings()});
    await tapTab('Daily');
    await tap('Tomorrow');
    await tap(/^Sparring Mieke/);
  });
  then('the toolbar offers "☐ Prepped" and nothing else', () => {
    expectShows('☐ Prepped');
    expectNotShows('Link file');
    expectNotShows('Reflect ›');
  });
});

scenario('Reflect from Review\'s "Meetings to close out" without ticking it reviewed', {feature: 'Weekly Review', design: 'technical-design-meeting-reflection.md'}, () => {
  given('the sparring session three days ago is tracked for review and not reviewed yet; its page is followed by two pages added by hand, then the check-in\'s page', () => {
    coaching([sparringLine(), checkinLine]);
    sparringNotebook();
  });
  when('I open Review, the step "Meetings to close out", tap the session and "Reflect ›", and confirm', async () => {
    await openApp({settings: sparringSettings()});
    await tapTab('Review');
    await tap('Meetings to close out');
    await tap(/^Sparring Mieke/);
    await tap('Reflect ›');
    await tap('Add page');
  });
  then('the reflection page comes after the two hand-added pages and before the check-in\'s page', () => {
    expect(pageKeywords(NOTEBOOK, 3)).toContain(REFLECTION_KW);
    expect(pageKeywords(NOTEBOOK, 4)).toContain(CHECKIN_KW);
    expect(device().sdk.opened.at(-1)).toEqual({path: NOTEBOOK, page: 3});
  });
  and('the meeting is still not reviewed', () => {
    expect(fileText(areaFile('Coaching'))).not.toContain('#reviewed');
    expectShows('Mark reviewed');
  });
});

scenario('Engage on the meeting\'s page offers the reflection; on the reflection page it opens on what was agreed', {feature: 'Engage', design: 'technical-design-meeting-reflection.md'}, () => {
  given('the todo "Send Mieke the role canvas" was agreed in the sparring session three days ago; in the notebook the session\'s page is followed by a page added by hand, then the page of the todo "Prepare the workshop"', () => {
    const key = meetingKey({date: d1, title: 'Sparring Mieke #sparring/mieke'});
    coaching(
      [sparringLine()],
      [`- [ ] Send Mieke the role canvas #next [meeting:: ${key}]`, `- [ ] Prepare the workshop #sparring/mieke [created:: ${d2}] → [[${NOTEBOOK_REL}#Prepare the workshop #sparring/mieke]]`],
    );
    device().sdk.putNote(NOTEBOOK, [{keywords: [d1, MEETING_KW]}, {keywords: []}, {keywords: [d2, 'Prepare the workshop #sparring/mieke']}]);
  });
  when('I open Engage on the meeting\'s page', () => openEngage({fromNote: NOTEBOOK, page: 0, settings: sparringSettings()}));
  then('it offers "Reflect on this meeting ›"', () => expectShows('Reflect on this meeting ›'));
  when('I tap it and confirm', async () => {
    await tap('Reflect on this meeting ›');
    await tap('Add page');
  });
  then('the reflection page comes after the hand-added page and before the todo\'s page, and opens', () => {
    expect(pageKeywords(NOTEBOOK, 2)).toContain(REFLECTION_KW);
    expect(pageKeywords(NOTEBOOK, 3)).toContain('Prepare the workshop #sparring/mieke');
    expect(device().sdk.opened.at(-1)).toEqual({path: NOTEBOOK, page: 2});
  });
  when('I open Engage on the reflection page', () => openEngage({fromNote: NOTEBOOK, page: 2}));
  then('it opens on "Agreed 1" from the sparring session, with the agreed todo', () => {
    expectShows('Agreed 1');
    expectShows(/^Agreed in Sparring Mieke · /);
    expectShows('Send Mieke the role canvas');
  });
  and('it doesn\'t offer to reflect again', () => expectNotShows('Reflect on this meeting ›'));
});
```

## As built

Built on `feature/meeting-reflection` in the steps of Part B §4 (S0-S7), each its own commit with
`npm run check` green. All eight scenarios of Part C are in
`__tests__/scenarios/meetingReflection.test.tsx`. The device test (Part B §5, items 1-9) is the
last step and was still open when this section was written.

### What was built, by step

- **S0 Harness.** The fake SDK keeps the elements the plugin writes per page (textboxes, links,
  title elements, numbered from 1, deletable by number), reports title elements through
  `getTitles`, and `NativeModules.TextboxMetrics` gets a simple fake measurement. New helpers:
  `pageKeywords`, `pageTexts`, `pageHeadings` (`test-helpers/scenario/files.ts`), `openEngage`
  (`test-helpers/scenario/app.tsx`), `sparringSettings` and `reflectionPageWith`
  (`test-helpers/scenario/setups.ts`). Unit test: `__tests__/fakeDevice/fakeSdk.test.ts`.
- **S1 Domain.** Page kind `review` ("Reflection page", default pieces Date & title),
  `domain/reflection.ts`, `pageOrder.afterItemIndex`, `domain/meetingToolbar.ts`,
  `stripTrackingTags`/`withTrackingTagsOf`, with the Jest tests of Part B §5.
- **S2 Edit form (M7).** As designed, plus `itemMutations.currentEntryMeeting` (see deviations).
- **S3 Storage.** `insertPageAt`, `ensureMeetingNote`, `storage/reflectionPage.ts`, plan kind
  `new-reflection` with the fixed texts, `noteTargets.setupForLink`, the Default's Reflection page
  (seed, and `completeDefaultPages` in the migration, next to the Home page). Upgrade note in the
  CHANGELOG.
- **S4 Settings.** `pageKindsOf` and `defaultPageKinds` list `review`; the settings screens are
  generic over page kinds and needed no change. Help page `note-setups.md`.
- **S5 Toolbar.** `ui/MeetingToolbar.tsx`, `ui/useMeetingToolbar.ts`, the `toolbar` prop on
  `MeetingList`/`DayMeetingsPanel` (PagedSection already had `subHeader`), the quieter
  `MeetingRow`, wiring in Daily, Week/Month (`usePlanningScreen.toolbarOptions`), Project/Area,
  Inbox, Review's Inbox step and the thread/loop overviews' Ahead.
- **S6 Entry points.** Close-out pill, Looking back pill (`useEntryActions.reflection`),
  `screens/engage/ReflectLine.tsx`, the reflection keyword in `sharedPageHit`; the shared lookup
  `ui/useReflectionLookup.ts`.
- **S7 Docs.** Help pages (`meetings.md`, `note-setups.md`, `review.md`, `engage.md`,
  `threads.md`, `loops.md`, `daily.md`, `week-and-month.md`, `projects-and-areas.md`,
  `quick-add.md`), README feature list, CHANGELOG, `design-overview.md`,
  `design-device-rendering.md`, `docs/dev/test-scenarios.md`.

### Deviations from the design

1. **A new Thread notebook starts with an empty page.** `createNote` makes a note with one page,
   and `ensureSharedNoteFile` leaves it empty, so the meeting's page of a new notebook is page 1,
   not page 0 (current behaviour, unchanged). The scenario "Reflect on a meeting that has no page
   yet" therefore checks the order - empty page(s), meeting page, reflection right after it, last
   page opened - instead of fixed page numbers.
2. **Engage scenario, agreed todo.** The Agreed row draws the title and its `#next` label as one
   text, so the check matches the title at its start (`/^Send Mieke the role canvas/`).
3. **`insertPageAt(filePath, indexOf, keyword, template)`** takes a function that picks the index
   from the file's keywords, so the position comes from the same keyword read as the insert.
4. **Every quick-file move path reads the current copy**, not only Daily's: Week/Month and the
   thread/loop overview built the edited meeting from a render-time entry too.
   `currentEntryMeeting` reads the Inbox or the cache.
5. **Two more lists get the toolbar.** Review's Inbox step and the Ahead list of the thread and
   loop overviews have Quick Add and used the row's tick and +clip, so by M3 they get the toolbar.
   Ahead is a mixed list with a fixed viewport: the toolbar shows there only while one of its
   meetings is edited, and the row box shrinks by its height.
6. **The selected meeting** is the edited one, or on the Project/Area page, the Inbox and the
   Review's Inbox step the armed one while a file is being linked.
7. **Empty toolbar.** With nothing selected it shows greyed **Reflect ›** (and **Link file** where
   the list can link) and "Tap a meeting"; no greyed checkpoint, since whether it would be Prepped
   or Reviewed depends on the meeting.
8. **A meeting whose page is missing for another reason** (its notebook page or file was deleted,
   or a page with its keyword exists) gets the meeting plan's own question (recreate / link) and the
   reflection follows without a second one; only first-time plans get the "pages for the meeting
   and its reflection" wording.
9. **Labels in one place.** `reflectionPillText` and `REFLECT_ON_MEETING_TEXT` live in
   `domain/reflection.ts`, `toolbarSlotText` in `domain/meetingToolbar.ts`.
10. **Help pages and CHANGELOG lines for the toolbar** came with S7, as the step plan said, not in
    the S5 commit.
