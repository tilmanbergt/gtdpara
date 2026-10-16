# Technical design: Engage (next action in context)

Status: **approved, ready for implementation** (Tilman, 2026-10-15). Release **0.16.0**, branch `feature/engage`.
Requirements as decided: §1 and Appendix A (screens S1-S11, from the approved UI draft). Names and labels: §3.12.
On implementation this document goes to `docs/dev/history/technical-design-engage.md` and gets an "As built" section.

Scope: **stage 1** (requirements R1-R5, R8). Stage 2 (focus on loops and threads, daily focus that can add) gets its own design; §3.9 only keeps the door open for it.

Design goals, in order: **reuse** what exists (one write path, one action hook, one row, one pager, one status slot), **small pure core** (all decisions in `src/domain/`, fully unit-tested), **thin UI** (one file per screen part, none near 1,000 lines), **no second way** of doing anything the app already does.

---

## 1. Requirements as decided (summary)

- A second sidebar button **Engage** opens a small panel over the note: the current owner's next options, nothing else (D4, D10, D14).
- Owner = Project, Area, loop or thread. Context: "Engage ›" on an owner page > owner of the current todo > owner of the open note > none (R2).
- `#next` todos first; only when none is left, the plan (untagged, file order, ≤ 5 per page, Someday per row) (D16).
- Now box: Done + Remove #next (current todo has `#next`) or Done + Someday (it hasn't) (D11). Undo of the last action while the panel is open.
- Picking: becomes current (app state, D7), untagged gets `#next` (D8), its note opens (or nothing for a todo without one).
- Owner empty: Close loop… / + Add todo / marks line / Select next focus (S8). Focus screens list owners only (S9, S11). All done in today's focus: celebration + Select new focus (S10).
- Collapsed Quick Add on every screen (D12). Status slot for every message.
- Candidate prompt in the status slot when a todo is checked off elsewhere in gtdpara and it was the owner's last `#next` (R5).
- Focus mode (`#now`) is untouched (D6).
- The open note or page includes a todo's or meeting's page in a **shared notebook** (D19, §3.4).
- Policy wording (D20, §3.11) and names (D18, §3.12) are decided.
- The D-numbers refer to the requirements decisions D1-D20; the ones that shape code are restated where they apply.

## 2. Current state (what we build on)

| Need | Existing building block |
|---|---|
| Full-screen modes outside the tab shell | `App.tsx` `Mode = 'loading' \| 'capture' \| 'tabs' \| 'focus'`, rendered inside `StatusFrame` |
| Button routing | `index.js` `registerButton`, ids in `domain/buttonIds.ts`; App's `registerButtonListener` (lasso branch with `routedByLassoButtonRef`) |
| Landing decision | pure `domain/returnContext.ts` `decideLanding`, called only by `reorient()` |
| Module stores for cross-screen requests | `ui/overviewStore.ts`, `ui/marksNav.ts`, `ui/loopLinkStore.ts` |
| Todo actions with the one write path | `screens/thread/useThreadActions.ts` (add, edit, done, cancel, notes, linked files; `mutateEntryTasks`, `domain/taskEdit.ts`) |
| Flow-state tags | `domain/flowState.ts` `setFlowStateTag`, `deriveFlowState` |
| Opening/creating a todo's note (own, notebook, loop note, page jump) | `storage/meetingNoteContent.ts` `openOrCreateTodoNote` + `ui/useNoteCreateConfirm.ts` |
| Loops: membership, blockers, close | `domain/loops.ts` (`loopMembers`, `closeBlockers`), `ui/useCloseLoop.ts` |
| Threads and scopes | `domain/threads.ts` (`threadOf`, `belongsToThread`, `scopeOf`), `domain/counterparts.ts` |
| Focus flags | frontmatter `dailyFocus`/`weeklyFocus`; `DailyItemRef`; `domain/destination.ts` |
| Note → owner | `domain/settings.ts` `findEnclosingItem`; `storage/threadProvenance.ts` `notePageCandidates` (meeting by note path/page) |
| Marks | `ui/useOpenMarks.ts`, `domain/marks.ts` `MarkScope`, `ui/marksNav.ts` `openMarks` |
| Rows, paging, Quick Add | `ui/TaskLabels.tsx`, `ui/PagedSection.tsx` (fixed `viewportHeight`), `ui/QuickAddWidget.tsx` (`fixedDestination`, used by LoopOverview with `withLoopTag`) |
| Messages, errors | `ui/status/*`, `ui/useActionError.ts`, `utils/errorMessage.ts` |
| Persisted UI state per profile | `GtdParaSettings` (precedent: `focusModeActive`), classified in `domain/profiles.ts` |

Not available in `sn-plugin-lib`: a call to size the plugin view. The panel is drawn inside the normal full-screen plugin view; whether the note shows behind it depends on the host honouring a transparent root (step S0).

## 3. Design

### 3.1 Shape of the solution

```
index.js ── registerButton(1, NOTE/DOC, ENGAGE_BUTTON_ID)
App.tsx  ── mode 'engage'  ──>  screens/engage/EngageOverlay.tsx
                                  │  state: useEngageFlow()  (reducer over domain/engageFlow.ts)
                                  │  data:  useEngageView()  (storage/engageAggregate.ts → domain/engageOptions.ts)
                                  │  writes: useThreadActions() (+ setTaskFlow), useCloseLoop(), openOrCreateTodoNote
                                  └─ parts: EngageHeader, NowBox, AckLine, OptionList, OwnerList,
                                            Celebration, MarksLine, CollapsedQuickAdd, EngageFooter
ui/engageStore.ts ── requestEngage(owner)   ← "Engage" on ItemDetail / LoopOverview / ThreadOverview
storage/engageCurrent.ts ── current todo + owner in settings (per profile)
```

Three layers, each testable on its own:

1. **Pure domain** (`domain/engageOwner.ts`, `domain/engageOptions.ts`, `domain/engageFlow.ts`): what an owner is, which options it has, which screen follows which event.
2. **Storage adapters** (`storage/engageAggregate.ts`, `storage/engageCurrent.ts`, `storage/noteOwnerOf.ts`): read the warm cache, resolve paths, persist the current todo.
3. **UI** (`screens/engage/*`, `ui/engageStore.ts`, `ui/CollapsedQuickAdd.tsx`): layout and wiring only.

### 3.2 Domain: owners and options (`domain/engageOwner.ts`, `domain/engageOptions.ts`)

```ts
/** What the overlay is about. Identity by folder path and tag, like everything else (design-overview §3). */
export type EngageOwner =
  | {kind: 'item'; itemPath: string}                       // a Project or Area, its loose todos
  | {kind: 'loop'; itemPath: string; tag: string}          // tag = kind/name
  | {kind: 'thread'; scopeOwnerPath: string; tag: string}; // tag = type/counterpart

export function ownerKey(owner: EngageOwner): string;           // stable string for React keys and equality
export function ownerTodos(owner, source): EngageTodoRef[];       // open todos of the owner, file order
```

- **item**: the item's todos that belong to none of its *active* loops (same split as `groupTodosByLoop`), so a loop's steps never show twice. Requirement D/Q11 (Area: `#next` first, plan only when none) falls out of the general rule.
- **loop**: `loopMembers(item, tag).tasks`, open only.
- **thread**: open todos of every item in `scopeOf(scopeOwnerPath, …)` with `belongsToThread(tags, thread)`; the Inbox is not part of a scope (as in the tending design).
- `EngageTodoRef = {itemPath, itemKind, taskIndex, task}` — the same shape as `ThreadTaskEntry`, so `useThreadActions` takes it unchanged (§3.6).

```ts
export interface EngageOptions {
  next: EngageTodoRef[];   // open, flowState 'next', file order
  plan: EngageTodoRef[];   // open, no flow state, not waiting-for, file order
  ownerEmpty: boolean;   // no open todo AND no upcoming meeting (loops: closeBlockers; others: same rule over the owner's meetings)
}
export function optionsOf(owner: EngageOwner, source: EngageSource, nowMs: number): EngageOptions;
```

Rules (all pure, all tested):

- Waiting For, Someday and Maybe never appear (they are not choosable now).
- `#now` counts as `#next` (it is layered on top, never instead).
- The current todo is excluded from `next` (it is in the Now box).

**Owner lines for S9/S11** (`domain/engageOptions.ts`):

```ts
export interface OwnerLine { owner: EngageOwner; label: string; kindLabel: 'Project'|'Area'|'Loop'|'Thread'; nextCount: number; pickNext: boolean }
export function focusOwnerLines(ring: 'daily' | 'weekly', current: EngageOwner | null, source: EngageSource): OwnerLine[];
```

- Order inside a list = the ring order of the requirements: same counterpart (threads), same Area/Project, then the rest of the focus, each block in the focus panel's existing order.
- Stage 1 focus units are Projects and Areas (frontmatter flags). Within a focused Area/Project, its active loops and its tended threads with open todos become their own lines (D2's "an Area in focus includes everything in it"), followed by the item itself when it has loose todos. Lines with `nextCount === 0 && !pickNext` are left out.
- `effectiveFocus(source)` = daily set if any item has `dailyFocus`, else weekly. Stage 2 replaces only this function and the line builder's input (§3.9).

### 3.3 Domain: the flow (`domain/engageFlow.ts`)

One reducer decides which screen shows. No screen decides its own successor.

```ts
export type EngageScreen =
  | {kind: 'options'}                           // S2/S4/S5/S6: owner's next, or its plan when next is empty
  | {kind: 'ownerEmpty'}                        // S8
  | {kind: 'selectFocus'; ring: 'daily' | 'weekly'}   // S9 / S11
  | {kind: 'focusDone'}                         // S10
  | {kind: 'quickAdd'};                         // S7 (Quick Add expanded)

export interface EngageState {
  owner: EngageOwner | null;
  current: EngageTodoKey | null;    // §3.5
  screen: EngageScreen;
  ack: {kind: 'done' | 'someday' | 'unnext'; text: string; undo: UndoRecord} | null;
  planPage: number;
}

export type EngageEvent =
  | {type: 'open'; owner: EngageOwner | null; current: EngageTodoKey | null}
  | {type: 'picked'; key: EngageTodoKey}            // closes the panel when a note opens (UI effect)
  | {type: 'acted'; ack: EngageState['ack']}   // Done / Someday / Remove #next / plan Someday
  | {type: 'undone'}
  | {type: 'selectFocus'} | {type: 'selectNewFocus'} | {type: 'back'}
  | {type: 'ownerChosen'; owner: EngageOwner}
  | {type: 'expandQuickAdd'} | {type: 'collapseQuickAdd'}
  | {type: 'dataChanged'; options: EngageOptions; dailyLeft: number; weeklyLeft: number};

export function engageFlow(state: EngageState, event: EngageEvent): EngageState;
```

- `dataChanged` is dispatched by the hook whenever the cache changes. It moves `options` → `ownerEmpty` when the owner ran empty, and `ownerEmpty`/`selectFocus(daily)` → `focusDone` when nothing is left in today's focus. This is the only place those transitions live.
- `open` with `owner === null` starts at `selectFocus(daily)` (or `weekly` without a daily focus), as R2 says.
- "Select next focus" (S8) → `selectFocus(effective ring)`; "Select new focus" (S10) → `selectFocus('weekly')`. `back` returns to the owner's screen.
- Nothing in the reducer suggests another owner by itself: owner changes only through `ownerChosen` (D14).

### 3.4 Note → owner (`storage/noteOwnerOf.ts`)

Used by R2 (the Engage button in a note) and by R3 (that note's todo becomes current).

```ts
export async function noteContextOf(absPath: string, page: number | null): Promise<{owner: EngageOwner | null; todo: EngageTodoKey | null}>;
```

Order, first hit wins:

1. **The entry whose page this is** - a todo or a meeting, by its own note, a page link (`<file>#page=N`) or **its page in a shared notebook** (keyword anchor). One function answers this for both kinds: `entryForNotePage(absPath, page)` (below). A todo → that todo becomes current, its owner is its loop if it is in one, else the item. A meeting → no current todo; the owner is the meeting's thread if its tags name one, else its loop, else its item.
2. **A loop note's first page** or a loop note page no entry claims (`storage/loopNotes.ts` `loopNoteOf(ownerPath, tag)` for the item's active loops): that loop.
3. **Inside a Project/Area folder** (`findEnclosingItem`): the item.
4. Otherwise `null`.

**One page → entry lookup for todos and meetings.** Today `storage/threadProvenance.ts` has `notePageCandidates` (pure) and `meetingForNotePage` (one `getKeyWords` call for the page, only when the file is a shared target) for meetings only, used by Capture's provenance. Shared notebooks are central to how Tilman works (sparring and coaching notebooks), so stage 1 resolves them, and it does so by generalising that code instead of writing a second lookup:

- Pure part → `domain/notePageEntry.ts`: `notePageCandidates(absPath, page, sources)` over tasks *and* meetings, returning `{direct: PageEntry | null; shared: Array<PageEntry & {keyword}>}` with `PageEntry = {kind: 'task'; item; taskIndex; task} | {kind: 'meeting'; item; meetingIndex; meeting}`. Same matching rules as today (literal own-note path first, then page link, then shared anchor); a todo's anchor keyword is the one `openOrCreateTodoNote` writes (`todoPageKeyword`), a meeting's as today.
- I/O part → `storage/notePageEntry.ts`: `entryForNotePage(absPath, page, sources)` - the direct hit, else one `getKeyWords(absPath, page)` call when there are shared candidates, first candidate whose keyword is on the page. A failing keyword read is logged and reads as "no entry", as today.
- `meetingForNotePage` keeps its signature and becomes a three-line wrapper (`entryForNotePage` filtered to meetings), so Capture's provenance is unchanged and covered by its existing tests. The moved tests move with the code; new cases for todos are added.

### 3.5 The current todo (`storage/engageCurrent.ts`)

- Stored in `GtdParaSettings.engageCurrent: {itemPath: string; taskText: string; taskIndex: number; owner: EngageOwner} | null`, default `null`, classified **per profile** in `domain/profiles.ts` (same precedent as `focusModeActive`).
- `EngageTodoKey = {itemPath, taskText, taskIndex}`. Resolution (pure, `domain/engageOwner.ts` `resolveTodoKey`): the task at `taskIndex` if its text matches; else the first open task of the item with that exact text; else `null`. A `null` result clears the setting silently (D7).
- Written only by `setEngageCurrent(owner, key | null)`; read by the overlay hook. No other module touches the field.

### 3.6 Writes: one action hook

The overlay writes nothing itself. It uses:

- **`useThreadActions`**, renamed to **`ui/useEntryActions.ts`** in a separate first step (S1) with no behavior change: it is already the generic "actions on an entry by full-array index" hook for the thread and loop overviews; a third user makes the thread name wrong. `screens/thread/useThreadActions.ts` re-exports it during the move so the diff stays small, and is then removed in the same step.
- One new action in it: **`setTaskFlow(entry, flow: 'next' | null | 'someday')`** = `applyTaskEdit(task, setFlowStateTag(task.text, flow), task.linkedFile)` through `mutateEntryTasks`. Used for D8 (pick → `#next`), Remove #next and Someday. It returns the previous task for Undo.
- **Undo** writes the previous task back at the same index via the same `mutateEntryTasks` call, after checking the index still holds the changed text (otherwise the status slot says the entry changed and nothing is written). Done uses the hook's existing done toggle; undo of Done is its toggle again.
- **Close loop…**: `useCloseLoop('engage')` unchanged.
- **Notes**: the hook's existing todo-note action (`openOrCreateTodoNote` + `useNoteCreateConfirm`). After a successful open the overlay calls `PluginManager.closePluginView()` (the note is now in front), and `setEngageCurrent`.

### 3.7 UI (`screens/engage/`)

Every file has one job; none is expected above ~250 lines.

| File | Job |
|---|---|
| `EngageOverlay.tsx` | Frame: backdrop, panel position, picks the body by `state.screen.kind`; wires hooks to parts |
| `useEngageFlow.ts` | `useReducer(engageFlow)`, the `open` event from App/engageStore, `dataChanged` from the cache (`useCachedItems`, `useCachedInbox`) |
| `useEngageView.ts` | Memoized `optionsOf` / `focusOwnerLines` over the cache for the current state |
| `EngageHeader.tsx` | Kind pill, name, parent, ✕ (or ‹ back on S9/S11) |
| `NowBox.tsx` | "Working on", title, Done + Remove #next / Someday |
| `AckLine.tsx` | "Done: ~~text~~ · Undo" |
| `OptionList.tsx` | S2/S4/S5 `#next` list, S6 plan list with page arrows and Someday buttons; one `PagedSection` with `viewportHeight = 5 × ENGAGE_ROW_H` |
| `OptionRow.tsx` | One tappable row: dashed or solid circle, text via `TaskLabels`, optional small action button |
| `OwnerList.tsx` | S9/S11 owner lines ("Kind · Name · n next ›") |
| `OwnerEmpty.tsx` | S8 body |
| `Celebration.tsx` | S10 body |
| `MarksLine.tsx` | "n marks to process in this loop ›", hidden when 0; `useOpenMarks(scope)` + `openMarks(scope, 'engage')` |
| `EngageFooter.tsx` | Open gtdpara · Close (or Select … focus › on S8/S10) |
| `engageStyles.ts` | Shared styles from `ui/theme.ts` only (`FONT`, `COLORS`, `SPACING`, `RADII`) |

Shared, outside `screens/engage/`:

- **`ui/CollapsedQuickAdd.tsx`** — a dashed one-line button that expands into `QuickAddWidget` with `fixedDestination` and, for a loop owner, `withLoopTag` (the same pattern as `LoopOverview`). General enough for any later screen that wants a collapsed Quick Add; no Quick Add logic is copied.
- **`ui/engageStore.ts`** — `requestEngage(owner)`, `useEngageRequest()`; a module store like `overviewStore`, so "Engage" can be placed in ItemDetail, LoopOverview and ThreadOverview without props through kept screens.
- **`ui/EngageButton.tsx`** — the one "Engage ›" button the three owner pages render.

Layout (A5 X, `design-device-rendering.md` budget): panel width 82 % of the screen (≈ 1150 px), top at ≈ 12 % of the height, so the Now box, the list and Quick Add's text field stay in the upper two thirds (UI rule §4). Rows are `ENGAGE_ROW_H` = the two-line row height of the budget table; at most five per page (D16, spaciousness). No new font sizes.

**Backdrop.** `EngageOverlay` draws its panel on a root whose background is `transparent` when `ENGAGE_BACKDROP_TRANSPARENT` (a constant in `engageStyles.ts`) is true, else white. S0 decides the constant on the device; nothing else depends on it.

### 3.8 App integration

- `domain/buttonIds.ts`: `ENGAGE_BUTTON_ID = 400`.
- `index.js`: `registerButton(1, ['NOTE', 'DOC'], {id: ENGAGE_BUTTON_ID, name: 'Engage', icon: …/engage.png, showType: 1})`. New asset `assets/engage.png` (grayscale).
- `App.tsx`:
  - `Mode` gains `'engage'`; rendered like `focus`: `<StatusFrame><EngageOverlay … /></StatusFrame>`, no TabBar.
  - The button listener gets a third branch: `ENGAGE_BUTTON_ID` sets `routedByEngageButtonRef` (same race guard as the lasso branch, so a cold-start `reorient()` doesn't overwrite it), reads `getCurrentNotePath()` + page, resolves `noteContextOf`, dispatches `open`, `setMode('engage')`.
  - `useEngageRequest()` (from "Engage"): `open` with that owner, `setMode('engage')`.
  - `onOpenGtdpara`: `setMode('tabs')` (landing stays wherever the tabs were). `onClose`: `PluginManager.closePluginView()`; the next sidebar press runs `reorient()` as today.
  - `decideLanding` is unchanged: the Engage button never goes through `reorient()`, and the gtdpara button never lands in the overlay.
- `ui/marksNav.ts`: `MarksReturnTo` gains `'engage'`; App's `exitCapture` returns to `mode 'engage'` for it.
- Help: `domain/helpTopics.ts` maps the overlay to a new page `docs/user/engage.md`; the overlay has no "?" of its own (no TabBar) — the help is reached through Open gtdpara.

**R5 (candidate prompt inside gtdpara)** — `ui/useEngagePrompt.ts`, one hook with one function `afterDone(entry)`, called from the three places that tick a todo done today: Daily's own done handler (`screens/DailyView.tsx`), the Current tab's (`screens/ProjectDataPanel.tsx` / `projectData/TodosSection.tsx`) and `useEntryActions` (thread and loop overviews). Check the exact handlers with a grep for `withTaskDone` first. After a successful Done, if `optionsOf(owner).next` is empty and `plan` is not, it publishes a status message `"<owner> has no next action. Pick one:"` with up to three plan todos as actions plus "Later". A pick runs `setTaskFlow(entry, 'next')`. Screen-scoped, cleared on hide like every screen message.

### 3.9 Stage 2 hooks (not built now)

- Focus on loops/threads needs a stored flag per loop line and per counterpart line (`## Loops`, `## Threads`), i.e. a file-format change with parser, serializer, round-trip test and an Upgrade note — its own design.
- In this design only `effectiveFocus` and `focusOwnerLines`' input change; the overlay, the flow and the options are unaffected.

### 3.10 Logging and debug bundle

- `log('EngageOverlay: opened', 'owner=' + owner.kind, 'via=' + (button|nextHere|focus))` — kinds and counts only, never todo text.
- `log('EngageOverlay: action', kind)` for done/someday/unnext/pick/undo; failures through `useActionError` (`logError` + status slot).
- `noteContextOf` logs which rule hit (`todoNote|loopNote|meetingNote|item|none`).
- Debug bundle (`storage/debugBundle.ts`): `engage: current todo set yes/no`.

### 3.11 Philosophy and policy wording

`DEVELOPMENT-POLICY.md` §2 says "No notifications, timers, streaks or auto-suggestions of 'the next thing'", and design-philosophy §5 "Never auto-suggest or auto-select the next set". The overlay shows next options only when asked (the Engage button, "Engage", Select … focus) and keeps one owner's options in front after Done. R5 publishes a prompt after a Done. Proposed wording for both documents, to be confirmed by Tilman in the implementation change:

> Nothing is suggested unasked: next options appear only when you ask for them, or right after you finish something, and only from what you already chose (the same owner, your focus). Nothing is chosen for you.

**Decided (Tilman, 2026-10-15):** this wording goes into `DEVELOPMENT-POLICY.md` §2 (replacing "auto-suggestions of 'the next thing'") and design-philosophy §5 (next to "Never auto-suggest or auto-select the next set", which stays true for focus mode's sets), in step S8.

### 3.12 Names and labels

**Decided (Tilman, 2026-10-15): "Engage"** - GTD's fifth step, the move from organising to doing. Code names use `engage` throughout (`mode 'engage'`, `screens/engage/`, `ENGAGE_BUTTON_ID`). All user-visible strings of the mode live in one pure module, `domain/engageText.ts`, so a later wording change is one file:

| Where | Label |
|---|---|
| Sidebar button (`registerButton` name) | **Engage** |
| Owner-page button (Project, Area, loop, thread) | **Engage ›** |
| Panel header line above the list (S2/S4/S5) | **Engage next** |
| Plan list intro (S6) | No next action left. Pick one from the plan: |
| Focus pick buttons (S8 / S10) | Select next focus › / Select new focus › |
| Signals | Nothing left in *X*. / All done in today's focus. |
| Help page | `docs/user/engage.md`, title "Engage" |

"Engage next" is the panel's own heading, so the combination Tilman suggested names what the panel does without a second button name.

## 4. Files

**New**

| File | Layer |
|---|---|
| `src/domain/engageOwner.ts` | owner type, `ownerTodos`, `todoForNotePath`, `resolveTodoKey` |
| `src/domain/engageOptions.ts` | `optionsOf`, `focusOwnerLines`, `effectiveFocus` |
| `src/domain/engageFlow.ts` | screens, events, reducer |
| `src/storage/engageAggregate.ts` | builds `EngageSource` from the cache + inbox |
| `src/storage/noteOwnerOf.ts` | `noteContextOf` |
| `src/domain/notePageEntry.ts`, `src/storage/notePageEntry.ts` | page → todo or meeting (moved and generalised from `storage/threadProvenance.ts`, §3.4) |
| `src/domain/engageText.ts` | every label of the mode (§3.12) |
| `src/storage/engageCurrent.ts` | `getEngageCurrent`, `setEngageCurrent` |
| `src/screens/engage/*` | the files in §3.7 |
| `src/ui/CollapsedQuickAdd.tsx`, `src/ui/engageStore.ts`, `src/ui/EngageButton.tsx`, `src/ui/useEngagePrompt.ts` | shared UI |
| `assets/engage.png` | button icon |
| `docs/user/engage.md` | help page |
| `__tests__/domain/engageOwner.test.ts`, `engageOptions.test.ts`, `engageFlow.test.ts` | tests |

**Changed**

| File | Change |
|---|---|
| `screens/thread/useThreadActions.ts` → `ui/useEntryActions.ts` | move (S1), then `setTaskFlow` + undo helper (S3) |
| `screens/thread/*`, `screens/loop/LoopOverview.tsx` | import path only (S1); `EngageButton` in their headers (S6) |
| `screens/ItemDetail.tsx` | `EngageButton` in the header (S6) |
| `domain/buttonIds.ts`, `index.js`, `App.tsx` | §3.8 |
| `domain/settings.ts`, `domain/profiles.ts` | `engageCurrent` default + classification |
| `ui/marksNav.ts` | `'engage'` return target |
| `storage/threadProvenance.ts` | `meetingForNotePage` becomes a wrapper of `entryForNotePage`; `notePageCandidates` moves to `domain/notePageEntry.ts` (S3a) |
| `domain/helpTopics.ts`, `docs/user/index.md` | help mapping and link |
| `storage/debugBundle.ts` | one line |
| `docs/dev/design-overview.md` | §2.1 modes and buttons, §2.7 next to focus mode, §3 navigation rule ("Full-screen modes are capture, focus and engage") |
| `docs/dev/design-philosophy.md`, `docs/dev/DEVELOPMENT-POLICY.md` | §3.11 wording |
| `CHANGELOG.md`, `README.md` | New: Engage button; feature list |

## 5. Implementation steps

Each step ends with `npm run check` green and is its own commit on `feature/engage`.

- **S0 Device spike (no merge):** register the Engage button; on press `setMode('engage')` with a placeholder panel on a transparent root. Check on the A5 X: button shows, note visible behind the panel (yes → `ENGAGE_BACKDROP_TRANSPARENT = true`), `getCurrentNotePath` + current page available, `closePluginView` from the panel returns to the note. **Checkpoint with Tilman.**
- **S1 Refactor:** `useThreadActions` → `ui/useEntryActions.ts`, no behavior change. Smoke render of thread and loop overview.
- **S2 Domain:** `engageOwner.ts`, `engageOptions.ts`, `engageFlow.ts` with tests (owner kinds, `#next`-first/plan rule, Area rule, waiting/someday exclusion, current exclusion, owner empty incl. upcoming meetings, ring order of owner lines, effective focus, every reducer transition incl. `dataChanged`).
- **S3a Page lookup:** `notePageEntry` (domain + storage), `meetingForNotePage` as a wrapper; existing provenance tests unchanged and green, new todo cases.
- **S3 Storage:** `engageAggregate.ts`, `noteOwnerOf.ts`, `engageCurrent.ts` + settings/profile classification; `setTaskFlow` and undo in `useEntryActions`.
- **S4 UI parts:** `screens/engage/*`, `CollapsedQuickAdd`, smoke render of every screen kind with fixture data.
- **S5 App wiring:** mode, button branch, engageStore, marks return, Open gtdpara / Close. **Checkpoint: device test of S2-S11 flows.**
- **S6 Entry points:** `EngageButton` on ItemDetail, LoopOverview, ThreadOverview.
- **S7 R5:** `useEngagePrompt` after Done in gtdpara.
- **S8 Docs:** help page, CHANGELOG, README, design-overview, philosophy/policy wording (§3.11), debug bundle line. Then the "As built" section.

## 6. Test plan

**Jest (pure):**
- `optionsOf`: loop with `#next` + untagged → only `next`; all `#next` done → `plan` in file order; waiting-for/someday/maybe never; `#now` counts as next; current todo excluded; Area excludes todos of its active loops; thread collects across its scope and not from the Inbox.
- `ownerEmpty`: open todo → false; none but a meeting ahead → false; none → true.
- `focusOwnerLines`: daily before weekly; same counterpart before same Area before the rest; lines without next and without plan left out; `pickNext` when only plan.
- `engageFlow`: every event from every screen (table-driven), especially `dataChanged` → `ownerEmpty` → `focusDone`; `open(null)` → `selectFocus(daily|weekly)`; owner changes only via `ownerChosen`.
- `notePageCandidates`: todo own note, todo page link, todo in a shared notebook (anchor keyword), meeting cases unchanged; `resolveTodoKey`: renamed task (dropped), moved index with same text (found).

**Smoke render:** `EngageOverlay` for each `EngageScreen` kind; App with `mode 'engage'`.

**Device (A5 X, demo space):**
1. Engage button in a todo's note → S4 with that todo in the Now box.
2. Done → ack line + the owner's other `#next`; Undo restores it.
3. Remove #next → todo drops to the plan; it is no longer on Daily.
4. Last `#next` done → S6 plan list, five per page, page arrows; Someday on a row parks it.
5. Pick a plan todo with a note setup → note opens (own / loop note page), panel gone; reopen Engage → it is the current todo with `#next`.
6. Loop with nothing left → S8; Close loop… asks Done/Dropped; marks line opens Process marks and Close comes back to the overlay.
7. Select next focus → S9 lists today's focus in order; choosing one shows its options.
8. Everything in today's focus done → S10; Select new focus → S11 with the week's focus.
9. Quick Add from the panel adds to the owner (loop tag included) and the list updates.
10. "Engage" on an Area, a loop overview, a thread overview → panel with that owner.
11. Engage button in a note outside any Project/Area → S9 (or S11).
12. Edit the current todo's text on the PC, reopen Engage → no Now box, no error.
13. Daily: checking off an owner's last `#next` shows the R5 prompt; picking adds `#next`.
14. Focus mode still works as before.
15. **Shared notebook**: in a sparring notebook, on a todo's page → Engage shows that todo in the Now box and its thread/loop as owner; on a meeting's page → its thread as owner, no Now box. Capture from a meeting's notebook page still records the meeting as provenance.

## 7. Clean-code notes

- Decisions live in three pure modules; the UI never computes "what comes next".
- One write path (`useEntryActions` → `mutateEntryTasks` → `domain/taskEdit.ts`); `setFlowStateTag` is the only way flow tags change.
- No new list, row or pager implementation: `PagedSection` with a fixed viewport, `TaskLabels` for labels.
- Module stores follow the existing pattern (`overviewStore`, `marksNav`), so no prop threading through kept screens.
- No literal font sizes or colors; messages only through the status slot; errors through `useActionError`.
- New files stay far below 1,000 lines; `App.tsx` gains one mode branch and one listener branch, nothing else.

## 8. Open points

- **S0 results**: transparency of the plugin view, current page detection, a second sidebar button.
- Stage 2 (focus on loops/threads, daily focus that can add): its own design after living with stage 1.

## Appendix A. Screens S1-S11 (approved UI draft)
1. **Owner page, "Engage ›"** (Project, Area, loop, thread page): opens Engage with that owner as current owner.
2. **Engage next**: header (kind, name, area, ✕), the owner's `#next` todos only, collapsed Quick Add, footer (Open gtdpara · Close).
3. **Working in the note**: picking a todo opens its note (or jumps to its page in a loop/shared note) and the panel disappears; a todo without a note simply becomes current.
4. **Tap Engage**: "Working on" box with Done + Remove #next (or Someday, D11), below it the owner's other `#next` todos.
5. **After Done**: "Done: ~~todo~~ · Undo" line, then the owner's remaining `#next` todos.
6. **No next action left**: "No next action left. Pick one from the plan:" up to five untagged todos with Someday buttons, page arrows; the marks line ("*N* marks to process in this loop ›") when the owner has open marks.
7. **Quick Add opened**: text, File to (owner preset / Inbox / More…), tags with nothing preselected, Cancel / Add.
8. **Loop finished** (no open todo, no upcoming meeting): "Nothing left in *X*.", Close loop… (loops only) and + Add todo, the marks line, **Select next focus ›**, Close as main action.
9. **Select next focus**: back arrow to the owner, today's focus as owner lines ("Kind · Name · 2 next ›" or "· pick next ›"), in ring order; tap = that owner becomes current, screen 2/6 for it.
10. **All done in today's focus**: check mark, "All done in today's focus.", the finished owners in one line, **Select new focus ›**, Close as main action.
11. **Select new focus**: this week's focus as owner lines, one quiet line "Anything beyond this week's focus: Open gtdpara."
