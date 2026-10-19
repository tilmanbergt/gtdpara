# Technical design: Engage in context (threads, agreements, meetings)

Status: **approved** (Tilman, 2026-10-19). Requirements, decisions D1-D8, E1-E14 and the UI draft: Appendix A (from the requirements doc).
Release **0.18.0** (before the Kept GTD rename, which moves to 0.19.0), branch `feature/engage-in-context`. On implementation this goes to `docs/dev/history/technical-design-engage-in-context.md` with an "As built" section.

Design goals:

- **One definition of membership.** The thread and loop overviews, the "Since last time" piece and Engage all ask the same pure functions.
- **No new write paths.** Every write goes through `useEntryActions` / `mutateEntryTasks`.
- **No new list or pager implementations.**
- Decisions live in `src/domain/`, fully tested.

## 1. Current state (0.17.0)

| Concern | Where | Today |
|---|---|---|
| Thread lens | `storage/threadAggregate.ts` `threadLensContext` (pure, but typed over `CachedItem`) | `inLens`, `provenanceOf`, `relationOf` → waiting / owe / relevant |
| Overview lists | `buildThreadOverview` → `ahead.{meetings, owe, waiting, relevant}`, `since`, `past` | Someday/Maybe included in owe/relevant |
| Piece | `storage/sinceLast.ts` | Uses the overview's `ahead.*`, plus "Agreed last time" |
| Loop overview | `storage/loopAggregate.ts` | `keep` = loop tag, or agreed in a **past** loop meeting |
| Engage membership | `domain/engageOwner.ts` `belongsToOwner` | Thread: `belongsToThread` only; loop: `belongsToLoop` only; item: not in an active loop |
| Engage options | `domain/engageOptions.ts` `optionsOf` → `{next, plan, ownerEmpty}` | File order; meetings only for `ownerEmpty` |
| Note context | `storage/noteOwnerOf.ts` | A meeting page gives an owner, but the meeting itself is not passed on |
| Owner of a todo | `ownerOfTodo` | Loop, else item |
| Quick Add extras line | `QuickAddWidget` prop `provenance` → `ui/quickAdd/ProvenanceLine.tsx` | One part, one ✕ |
| Review | `domain/reviewSteps.ts` | No Someday/Maybe step; no way to open a step from outside the Review screen (`reviewVisit.ts` remembers the view only) |
| Leaving Engage | `App.tsx` `onOpenGtdpara={() => setMode('tabs')}` | Only "Open gtdpara"; `useAppOverlays` drops overview requests made outside the tab shell |

## 2. Design

### 2.1 Pure lens in the domain (`domain/threadLens.ts`, refactor)

Move `threadLensContext`, `ThreadRelation`, `ThreadLensContext` and the source types from `storage/threadAggregate.ts` into a new `domain/threadLens.ts`:

```ts
export interface LensItemRef { kind: 'project' | 'area' | 'inbox'; name: string; path: string; abbrev: string | null }
export interface LensSource { ref: LensItemRef; tasks: readonly Task[]; meetings: readonly Meeting[] }
export function threadLensContext(
  scopeItems: readonly ScopeItem[], sources: readonly LensSource[], inboxPath: string | null,
  tag: string, requestedLens: ThreadLens, ownerPath: string | null,
): ThreadLensContext | null;
```

`storage/threadAggregate.ts` keeps its exported names (`ThreadItemRef = LensItemRef`, `ThreadSource = LensSource`) and a thin `threadLensContext(items, inbox, …)` wrapper, so no caller changes. There is no behaviour change, and the existing tests stay green.

### 2.2 Loop membership (`domain/loops.ts`)

```ts
/** How a todo of `item` belongs to the loop `loopTag` (E2): agreed in one of its meetings (past or ahead), tagged, or not. */
export function loopRelation(item: {path: string; tasks: readonly Task[]; meetings: readonly Meeting[]}, loopTag: string, task: Task): 'agreed' | 'tagged' | null;
export function isLoopMember(item, loopTag, task): boolean; // loopRelation !== null
```

- "Agreed" means `resolveProvenance(task, [{path: item.path, meetings: item.meetings}], [item.path])` hits a meeting that `belongsToLoop`.
- `storage/loopAggregate.ts`'s `keep` uses `isLoopMember`.
- **Small behaviour change:** a todo agreed in a loop meeting that's still running now counts in the loop overview as well. Noted in the CHANGELOG.

### 2.3 Someday out of the overview lists (E10, E11)

- `buildThreadOverview`: open todos with `flowState` someday/maybe go to a new `ahead.someday` instead of `owe`/`relevant`. Waiting is unaffected (one flow state per todo).
- `buildLoopOverview` filters `ahead.someday` with `keep`, like the other lists.
- `sinceLast.ts` needs no change. Its I owe/Relevant blocks read `overview.ahead.owe/relevant` (E11), and "Agreed last time" is built from provenance and stays complete. Add a test.
- `screens/thread/AheadSection.tsx`: after the last section, a final row `{kind: 'someday'}` with the label `somedayLinkText(n)` = "1 someday ›" (`domain/threadText.ts`). It's countable and quiet (sub-head style). It calls `onOpenSomeday(entries)`. ThreadOverview and LoopOverview pass `entries => requestReviewStep('somedayMaybe', somedayFilterOf(label, entries))`, and App switches to the Review tab (§2.9).

### 2.4 Engage membership and order (`domain/engageOwner.ts`)

`EngageSource` gains the Inbox, needed for E9 and for the lens's provenance sources:

```ts
export interface EngageSource {
  items: readonly EngageItem[];
  inbox: {path: string; tasks: readonly Task[]; meetings: readonly Meeting[]} | null; // replaces inboxPath
  loopKinds: readonly string[];
  threadTypes: readonly string[];
}
```

`EngageTodoRef` gains two fields:

```ts
export type EngageRelation = 'owe' | 'waiting' | 'relevant';
export interface EngageTodoRef { item; taskIndex; task; relation: EngageRelation; agreedIn: MeetingRef | null }
export interface MeetingRef { itemPath: string; meetingIndex: number }
```

`ownerTodos(owner, source)` becomes one function per kind, each returning open todos in item and file order:

- **thread:** `ctx = threadLensContext(items, lensSourcesOf(source), inbox.path, owner.tag, 'thread', owner.scopeOwnerPath)`. Keep `ctx.inScope` todos with `ctx.relationOf(task, match) !== null` (E1), where relation = that result and `agreedIn` = the provenance match when it's in the lens. The Inbox is in scope only when it's the owner (unchanged).
- **loop:** `loopRelation`; `'agreed'` → `owe`, a waiting flow → `waiting`, else `relevant` (E2).
- **item:** todos not `isLoopMember` of any active loop (E3); relation `waiting` for a waiting flow, else `relevant`; `agreedIn` = the provenance match in the item.

The lens context is built once per `ownerTodos` call. `focusOwnerLines` calls it for every line. If profiling on the demo space shows a cost, memoize per `(source, ownerKey)` with a `WeakMap` keyed on `source`. Measure first, as the render-performance work did.

`ownerMeetings(owner, source)` uses `ctx.inLens(meeting.tags)` for threads (leaf-tagged meetings count, like the overview's Ahead) and `belongsToLoop` for loops. Items are unchanged.

`ownerOfTodo` follows E4: active loop (by `isLoopMember`), else `threadOfTodo(item, task, source)`, else item.

```ts
/** The todo's thread: its own thread tag (a Thread setup's type), else the thread of the meeting it was agreed in (in the item's scope). */
export function threadOfTodo(itemPath: string, task: Task, source: EngageSource): EngageOwner | null;
```

`focusOwnerLines`' `ownersOf` uses `threadOfTodo` instead of `threadOfTags` (the tended filter stays). So a thread with only agreed todos also gets a line.

### 2.5 Options (`domain/engageOptions.ts`)

```ts
export interface EngageOptions {
  next: EngageTodoRef[];       // #next/#now, owe before relevant, file order inside (E5)
  plan: EngageTodoRef[];       // no flow state, same order
  agreed: AgreedList | null;   // E6; null = no tab
  alsoHere: {waiting: number; someday: number};   // E7 (someday = someday + maybe)
  nextMeeting: MeetingEntryRef | null;            // E8
  ownerEmpty: boolean;         // unchanged rule
}
export interface AgreedList { meeting: MeetingEntryRef; rows: EngageTodoRef[] }
export interface MeetingEntryRef { item: EngageItemRef; meetingIndex: number; meeting: Meeting }

export function optionsOf(owner, source, nowMs, current: EngageTodoKey | null = null, pageMeeting: MeetingRef | null = null): EngageOptions;
export function todayNextMeeting(source: EngageSource, nowMs: number): MeetingEntryRef | null; // E9
```

- **Order (E5):** a stable sort by `relation === 'owe' ? 0 : 1` for thread and loop owners only.
- **Agreed (E6):**
  - Rows are the owner's open todos with `agreedIn` equal to the reference meeting. Someday/Maybe and the current todo are excluded.
  - Reference meeting = `pageMeeting` if it has rows; otherwise, for a thread or loop owner, the latest `ownerMeetings` entry with `meetingEndMs <= nowMs` (no age limit, D8), if it has rows; otherwise `null`.
- **Also here (E7):** counts over `ownerTodos` with flow `waiting-for` or someday/maybe.
- **nextMeeting (E8):** `ownerMeetings` with `meetingEndMs > nowMs`, earliest start.
- **todayNextMeeting (E9):** all items' and the Inbox's meetings that aren't cancelled, have a time, have today as their date, and `meetingEndMs > nowMs`; earliest start. Uses `meetingStartMs` from `domain/meetingTime.ts`, added there if missing.
- `nextPromptOf` (R5) is unchanged in shape; it gets the new `ownerOfTodo`.

### 2.6 Flow (`domain/engageFlow.ts`)

- `EngageTab = 'agreed' | 'next' | 'plan'`.
- `EngageState.pageMeeting: MeetingRef | null` is set by `open`. `ownerChosen` and `goBack` clear it, because the page meeting belongs to the note's owner only.
- `dataChanged` gets `agreedRows: number`. The tab rule in `onDataChanged`:
  - first data after open (`tab === null`): `'agreed'` when `pageMeeting && agreedRows > 0`, else the existing Next/Plan rule;
  - `tab === 'agreed' && agreedRows === 0` → the Next/Plan rule;
  - otherwise unchanged.
- `open` carries `pageMeeting` from the opening (§2.7).

All transitions are table-tested like the existing ones.

### 2.7 Note context (`storage/noteOwnerOf.ts`, `decideOpening`)

- `NoteContext` gains `meeting: MeetingRef | null`, filled for rule `meetingNote`.
- `decideOpening` passes `pageMeeting` through in `EngageOpening`, only for the note owner; "Engage ›" from an owner page has none.
- `useEngageFlow` dispatches it with `open`.

### 2.8 UI (`screens/engage/`)

| File | Change |
|---|---|
| `OptionTabs.tsx` | Third tab "Agreed n" first, shown only when `agreed` isn't null. Its list starts with a caption row `agreedCaption(meeting, today)`. Rows go through `OptionRow` by state: #next → tap picks it, plan → **#next**, waiting → label "· waiting" + **Done** (`act(todo,'done')`). |
| `MeetingLine.tsx` (new) | One line with two variants: `next` (tappable, "Next here: … ›", optional "· next today") and `today` (quiet, no tap). |
| `AlsoHereLine.tsx` (new) | `alsoHereText(waiting, someday)`. "someday" → `onExit({kind:'someday', owner})`; "Overview ›" → `onExit({kind:'overview', owner})`. Hidden when both counts are 0. |
| `EngageOverlay.tsx` | Under the header: `MeetingLine next` (options and ownerEmpty screens). After the tabs: `AlsoHereLine`. Above the footer: `MeetingLine today` unless merged. Next here tap → `actions.meetingNote(entry)`, then `onClose()` on success, like `openNote`. New prop `onExit(target: EngageExit)`. |
| `useEngageView.ts` | Passes `pageMeeting`; exposes `todayNext`. |
| `domain/engageText.ts` | `tabLabel('agreed', n)`, `agreedCaption`, `alsoHereText`, `nextHereText(meeting, today, alsoToday)`, `todayNextText(meeting, nowMs)` (relative only when under 3 h), `waitingRowLabel`. |

**Line budget** (A5 X, `design-device-rendering.md`):
- Next here, Also here and Today next add up to three one-line rows (about 3 × 44 px); the Now box, the 5-row list and Quick Add are unchanged.
- Expected panel height on S4 with every line is about 1,500 px of 1,872, still inside the existing `minHeight`-never-shrinks rule.
- If it overflows on the device, Today next moves into the footer row, left of Close.

### 2.9 Leaving Engage to a place (`EngageExit`)

```ts
// domain/engageFlow.ts
export type EngageExit =
  | {kind: 'overview'; owner: EngageOwner}   // thread/loop → overview; item → its Project/Area page
  | {kind: 'someday'; owner: EngageOwner};   // Review → Someday / Maybe, filtered to the owner
```

`App.tsx`'s `openFromEngage(exit)` always calls `setMode('tabs')`, then:

- **overview:** stores the request in a ref and calls `openOverview({tag, ownerPath, lens: 'thread'})` in an effect once `mode === 'tabs'`, because `useAppOverlays` drops requests made outside the tab shell. For a loop, `ownerPath` = the loop's item, so the existing loop/thread decision applies.
- **item:** `setCurrentItem(item)` + `setActiveTab('current')`, the same path as opening a Project/Area today.
- **someday:** `requestReviewStep('somedayMaybe', somedayFilterOf(ownerTitle, ownerSomedayKeys))` + `setActiveTab('review')`.

### 2.10 Review step "Someday / Maybe" (E12)

- `domain/reviewSteps.ts`:
  - id `'somedayMaybe'`, `{title: 'Someday / Maybe', kind: 'ritual'}` between `unfocusedNext` and `weeklyFocus`;
  - recap counter `somedayActivated` in `ReviewSummaryCounts`, defaulting to 0 in `ZERO_REVIEW_SUMMARY`; older stored records read as 0.
- `storage/reviewAggregate.ts`: `somedayItems: {item: ReviewItemRef; tasks: ReviewNextTaskEntry[]}[]` over active and on-hold Projects/Areas; count `n` = number of todos.
- `screens/review/steps/SomedayStep.tsx`:
  - built like `UnfocusedNextStep` (`ReviewMasterDetail`, `useFrozenStepList`);
  - actions through `engageFlowText` / `withTaskDone` / `withTaskCancelled` and the step's existing save path;
  - **#next** bumps `somedayActivated`.
- **Filter and opening from outside:** new `screens/review/reviewNav.ts`, a module store like `overviewStore`:

  ```ts
  export interface ReviewStepFilter { label: string; keys: readonly string[] }   // entry keys `path#taskIndex`
  export function requestReviewStep(id: ReviewStepId, filter: ReviewStepFilter | null): void;
  export function takeReviewStepRequest(): {id; filter} | null;   // consumed once
  ```

  - `ReviewScreen` consumes the request on mount and when it changes, and calls its own `enterStep(id)`, so the visit tally starts as usual.
  - `SomedayStep` reads the filter: it shows "Only <label> · Show all" and lists only matching keys.
  - Leaving the step clears it.
  - Keys are taken at request time (the frozen-list posture). A todo edited elsewhere in between simply drops out.

### 2.11 Quick Add preset tag (E13)

- `QuickAddProvenance` becomes `QuickAddAdds = Array<{key: string; label: string; onClear: () => void}>` (at most 2). `ProvenanceLine` renders the parts in one line, each with its own ✕. The existing single-provenance callers pass a one-element array.
- New `ui/quickAdd/usePresetTag.ts`, the same shape as `useProvenance`: `{part, apply(line), added()}`. `apply` = `withLoopTag(line, tag)` from `domain/loopEdit.ts`, which already avoids duplicates. Rename it `withOwnerTag` in passing, keeping a re-export.
- `ThreadOverview`: the tag is `overview.thread.tag` in the thread lens, else the counterpart leaf. Uses `onAddTask = (line, dest) => actions.addTask(preset.apply(origin.apply(line)), dest).then(() => { origin.added(); preset.added(); })`. Todo tab only.

## 3. Files

**New:**
- `src/domain/threadLens.ts`
- `src/screens/engage/MeetingLine.tsx`, `src/screens/engage/AlsoHereLine.tsx`
- `src/screens/review/steps/SomedayStep.tsx`, `src/screens/review/reviewNav.ts`
- `src/ui/quickAdd/usePresetTag.ts`
- tests: `__tests__/domain/threadLens.test.ts` (moved cases), `engageMembership.test.ts`, `someday.test.ts`

**Changed:**

| File | Change |
|---|---|
| `storage/threadAggregate.ts` | wrapper over `domain/threadLens.ts`; `ahead.someday` |
| `storage/loopAggregate.ts` | `isLoopMember`; `ahead.someday` |
| `domain/loops.ts` | `loopRelation`, `isLoopMember` |
| `domain/engageOwner.ts` | `EngageSource.inbox`, `relation`, `agreedIn`, per-kind `ownerTodos`, `ownerMeetings`, `ownerOfTodo`, `threadOfTodo` |
| `domain/engageOptions.ts` | order, `agreed`, `alsoHere`, `nextMeeting`, `todayNextMeeting`, `ownersOf` |
| `domain/engageFlow.ts` | `'agreed'` tab, `pageMeeting`, `agreedRows`, `EngageExit` |
| `domain/engageText.ts`, `domain/threadText.ts` | labels |
| `storage/engageAggregate.ts`, `storage/noteOwnerOf.ts`, `screens/engage/useEngageFlow.ts`, `useEngageView.ts`, `OptionTabs.tsx`, `OptionRow.tsx`, `EngageOverlay.tsx` | wiring |
| `screens/thread/AheadSection.tsx`, `ThreadOverview.tsx`, `screens/loop/LoopOverview.tsx` | someday row, preset tag |
| `ui/QuickAddWidget.tsx`, `ui/quickAdd/ProvenanceLine.tsx`, `ui/quickAdd/useProvenance.ts` | multi-part line |
| `domain/reviewSteps.ts`, `storage/reviewAggregate.ts`, `screens/review/ReviewScreen.tsx` | new step, request consumption |
| `App.tsx` | `openFromEngage` |
| `domain/meetingTime.ts` | `meetingStartMs` if missing |
| `docs/user/engage.md`, `docs/user/threads.md` (or wherever the overview help lives), `docs/user/review.md`, `CHANGELOG.md`, `docs/dev/design-overview.md` (§2 Engage, §2 Review steps) | docs |

## 4. Implementation steps

Each step ends with `npm run check` green and is its own commit on `feature/engage-in-context`.

- **S1 Refactor:** `domain/threadLens.ts`; `threadAggregate.ts` as a wrapper. No behaviour change.
- **S2 Loop membership:** `loopRelation`/`isLoopMember`; `loopAggregate` uses them (running-meeting change + test).
- **S3 Someday out of the overviews:** `ahead.someday`, the AheadSection row (temporarily without a target), and the piece test (E11).
- **S4 Review step:** `somedayMaybe`, `reviewNav.ts`, `SomedayStep`; wire the overview rows to it.
- **S5 Quick Add preset tag** in the thread overview (multi-part line).
- **S6 Engage domain:** membership, order, `ownerOfTodo`, Agreed, Also here, meetings; tests.
- **S7 Engage flow + note context:** `'agreed'` tab, `pageMeeting`; table tests.
- **S8 Engage UI:** tabs, the three lines, `EngageExit` in App. **Checkpoint: device test.**
- **S9 Docs:** help pages, CHANGELOG (incl. the loop running-meeting change), design-overview, "As built".

## 5. Test plan

**Jest (pure):**
- `threadLensContext`: the existing overview tests, unchanged, against the domain module.
- Thread `ownerTodos`:
  - tagged, leaf, agreed (untagged), `#owe/cp`, `#wf/cp` are all members;
  - a todo of another counterpart is not;
  - the Inbox only as the owner.
- Loop `ownerTodos`: tagged; agreed in a past meeting; agreed in a running meeting; a leaf-only todo is not a member. The Area/Project owner excludes all three members.
- Order: owe before relevant within Next and Plan, file order inside; Areas and Projects unchanged.
- Agreed:
  - page meeting with rows → its rows;
  - page meeting without rows → latest past meeting;
  - none → null;
  - someday and the current todo excluded;
  - waiting included.
- `alsoHere`: counts, with someday + maybe together.
- `nextMeeting` / `todayNextMeeting`:
  - cancelled, over, untimed and other-day meetings excluded;
  - a running meeting counts until its end;
  - Inbox meetings count for today.
- `ownerOfTodo`: loop > own thread tag > meeting's thread > item.
- `engageFlow`: open on a meeting page with agreed rows → `agreed`; Agreed emptied → Next/Plan rule; `ownerChosen`/`goBack` clear `pageMeeting`.
- Overview: someday/maybe go to `ahead.someday`, not owe/relevant. The piece's I owe/Relevant are without someday, and Agreed last time still includes it.
- Review: `somedayItems` covers active + on hold, not archived; the filter keys restrict the list.

**Smoke render:** EngageOverlay with all three tabs and all lines; SomedayStep with and without a filter; AheadSection with the someday row.

**Device (A5 X, demo space with a sparring thread and a loop):**
1. In a sparring note, during or after the meeting: capture two todos → Engage opens on **Agreed 2** with the meeting named; #next on one → it moves to Next as well; Undo works.
2. On a note elsewhere with the same thread owner: Next lists the agreed (owe) todos before the `#mieke`-tagged ones.
3. The "Also here" counts match the overview's Waiting for and the someday row; "someday" opens Review → Someday / Maybe filtered; Show all lists everything; #next there brings the todo back into Engage.
4. "Overview ›" opens the thread overview (and the loop overview for a loop, the Project page for an item owner).
5. Next here shows the next sparring and opens its note; Today next shows a later meeting today with "in … min" and hides when it's the same meeting.
6. Loop: a todo captured from a running loop meeting shows in Engage and in the loop overview.
7. Thread overview Quick Add: the tag line is preset; ✕ drops it for one todo; the counterpart lens presets `#mieke`.
8. A "Since last time" piece written after the update has no someday in I owe/Relevant; Agreed last time is complete.
9. Regression: focus screens, owner empty, R5 prompt, marks line, Go to notebook, Continue with….

## 6. Open points

- None blocking. The labels are in `engageText.ts` / `threadText.ts`, so a wording change after the device test is one file.

## Appendix A. Requirements and UI draft (decided 2026-10-19)

Status: **requirements decided** (Tilman, 2026-10-19). Technical design: `claude/technical-design-engage-in-context.md`.
Release: **0.18.0**, before the Kept GTD rename (which moves to 0.19.0), branch `feature/engage-in-context`.
Builds on Engage (0.16.0) and Home notebooks (0.17.0).

### 1. Why

On a thread's note page, the overview and the "Since last time" piece show todos that the Engage panel doesn't offer. The biggest gaps:

- **Agreed todos.** Capture and Quick Add from a meeting page write only `[meeting:: …]`, without the thread tag. The overview and the piece show them under "I owe" / "Agreed last time"; Engage files them under the Area.
- **Leaf tags and `#owe/<counterpart>`.** These count in the overview but not in Engage.
- **Loops have the same agreed-todo gap.** Agreed in a loop meeting counts in the loop overview but not in Engage.
- **No meetings.** Engage reads meetings only to decide whether an owner is empty.

Analysis (2026-10-19, against the 0.17 code):

| Todo kind (thread `#sparring/mieke`) | Thread overview, Ahead | "Since last time" piece | Engage 0.17 |
|---|---|---|---|
| Tagged `#sparring/mieke` (or deeper) | Relevant | Relevant | ✓ |
| Plain leaf `#mieke` | Relevant | Relevant | ✗ |
| Agreed in a thread meeting (`[meeting::]`, no tag) | I owe | Agreed last time / I owe | ✗ (under the Area) |
| `#owe/mieke` | I owe | I owe | ✗ |
| `#wf/mieke`, or a bare `#wf` that's agreed or tagged | Waiting for | Waiting for | ✗ (by rule) |
| Someday/Maybe of any of the above | listed | listed | ✗ (by rule) |
| Done since the last meeting | Since | Done since then | ✗ (history) |
| Meetings ahead | Next meetings | – | not shown |
| Freshness | live | snapshot from when the note was written | live |

### 2. The question Engage answers

**"What do I do next, here?"** "Here" means the owner of the note you're in: a thread, loop, Project or Area. Every element on the panel either answers that question or helps you finish it, and every action on it is one tap away. Whatever is left out is named in one short line, and that line says where to find it.

#### GTD view (why the shape is right)

- **Threads are GTD Agendas with history.** An Agenda is a list per person or standing meeting, looked at just before and during the conversation. So the thread lens and "Next here" belong in Engage.
- **Choosing in the moment uses the four criteria.**
  - Context: the note you're in, which is the owner.
  - Time available: the "Today next" line.
  - Energy: stays with you.
  - Priority: your focus, which "Select next focus" already uses.
- **Agreements are open loops to clarify.** The Agreed tab lets you clarify them in place: #next, Someday, Done.
- **Someday/Maybe belongs to the Weekly Review**, not to the doing view. Engage and the overviews only count it and link to Review.

### 3. Decisions (2026-10-19)

| # | Decision |
|---|---|
| D1 | Engage uses the overview's thread lens fully. Loops use the loop overview's rule: tagged, or agreed in one of the loop's meetings. No leaf matching for loops. |
| D2 | In Next and Plan, "I owe" comes before "Relevant" (agreed before the rest for loops), each in file order. |
| D3 | One short "Also here" line names what's left out and links to it. |
| D4 | "Next here" always (the owner's next meeting at any distance). "Today next" only when it's today, gtdpara meetings only, quiet at the bottom. The two merge when they're the same meeting. |
| D5 | Quick Add in the thread overview presets the thread tag, which you can remove. In the "all of the counterpart" view it presets the leaf `#mieke`. |
| D6 | A new **Agreed** tab. An agreed todo that is also #next shows in Agreed and in Next. That overlap is accepted, because Agreed shows where something came from and Next/Plan show its state. |
| D7 | No Someday tab. Someday/Maybe is hidden by default in the thread and loop overviews and in Engage, shown only as a count that opens a new Review step "Someday / Maybe", filtered to where you came from. |
| D8 | No time limit on "the latest past meeting" for the Agreed tab. |

### 4. Requirements

#### Who belongs to an owner

- **E1 Thread.** A thread owner's todos are the overview's (thread lens, same scope): tagged with the thread or deeper, the plain leaf, agreed in a meeting of the lens, or `#owe/<counterpart>`. Waiting For counts by the overview's rule.
- **E2 Loop.** A loop owner's todos are tagged with the loop, or agreed in one of the loop's meetings, past or ahead (so todos captured during a running meeting count). The loop overview uses the same rule.
- **E3 Area/Project.** An Area/Project owner leaves out every todo of its active loops by E2's rule, so a loop step never shows twice. Thread todos stay as they are today.
- **E4 The owner of a todo** (Engage on a todo's page, the R5 prompt, focus lines) is chosen in this order:
  1. its active loop;
  2. its thread: the todo's own thread tag, else the thread of the meeting it was agreed in;
  3. its Area/Project.

#### What the panel shows

- **E5 Order.** In Next and Plan, rows go "I owe" first, then "Relevant", each in file order (D2). For loops, agreed rows come first. Areas and Projects keep plain file order.
- **E6 Agreed tab.**
  - Lists the open todos agreed in the **reference meeting**, in file order, without Someday/Maybe and without the current todo. Waiting For rows are shown as waiting.
  - Actions per row:
    - a #next row: tap to work on it;
    - a plan row: **#next**;
    - a waiting row: **Done**.
  - **Reference meeting:** the meeting whose page you're on, if it has agreed rows. Otherwise, for a thread or loop owner, its latest meeting that's over (D8).
  - The tab shows only when the reference meeting has rows. Its first line names the meeting: "Agreed in Sparring Mieke · Tue 14 Oct".
  - Opened on a meeting page that has agreed rows, the panel starts on Agreed. Otherwise the existing Next/Plan rule applies.
- **E7 "Also here" line.** "Also here: 2 waiting · 1 someday   Overview ›", where each part shows only when it isn't zero and the whole line hides when nothing is left out.
  - "someday" counts Someday and Maybe, and opens Review's Someday / Maybe step filtered to the owner.
  - "Overview ›" opens the thread or loop overview, or the Project/Area page for an item owner.
- **E8 "Next here".** The owner's next meeting that isn't over (any date), as one line under the header: "Next here: Thu 23 Oct 10:00 Sparring Mieke ›". Tapping it opens the meeting's note (or creates it, with the usual confirmation), and the panel closes. Hidden when there's none.
- **E9 "Today next".** The next timed gtdpara meeting today that isn't over (all Projects, Areas and the Inbox). It's a quiet line above the footer, "Today next: 14:00 Retro demand · in 40 min"; the relative part shows only when the meeting is under 3 hours away. It's information only, not tappable, and computed when the panel opens or its data changes, never as a timer. If it's the same meeting as Next here, the line hides and Next here gets "· next today".

#### Overviews, Review and Quick Add

- **E10 Overviews hide Someday/Maybe.** The thread and loop overviews leave Someday/Maybe out of "I owe" and "Relevant". The last row of Ahead is a quiet "1 someday ›", which opens Review's Someday / Maybe step filtered to these todos.
- **E11 The "Since last time" piece follows E10.** Its I owe and Relevant blocks leave Someday/Maybe out, because they are the overview's lists. "Agreed last time" stays complete, since it's the record of that meeting.
- **E12 Review step "Someday / Maybe".**
  - A new step after "Unfocused next items", before "Focus reset", kind *ritual*.
  - Content: open Someday and Maybe todos of active and on-hold Projects/Areas, grouped by item, in a left list with detail on the right, like "Unfocused next items".
  - Actions per todo: **#next**, **To plan** (removes Someday/Maybe), **Done**, **Cancel**.
  - Opened from Engage or an overview, it shows "Only <name> · Show all" and lists only those todos. Leaving the step clears the filter.
- **E13 Quick Add preset in the thread overview.** New todos get the thread tag (thread lens) or the leaf `#<counterpart>` (counterpart lens; also for `wf`/`owe` overviews). It's shown in Quick Add's grey line with its own ✕, next to the meeting provenance: "↳ from Sparring · 14 Oct ✕   #sparring/mieke ✕". ✕ drops it for the next todo only. This applies to the Todo tab only.

#### Unchanged

- **E14.** Focus screens, the owner-empty and all-done screens, Undo, R5, the marks line, Go to notebook and Continue with… all stay as they are, now over the E1-E4 membership.

### 5. UI draft

#### A. Engage on today's sparring page, after the session (opens on Agreed)

```
┌───────────────────────────────────────────────────────────────┐
│ [Thread]  #sparring/mieke · Coaching                        ✕ │
│ Next here: Thu 6 Nov 10:00 Sparring Mieke ›                   │
│ ┌ Working on ───────────────────────────────────────────────┐ │
│ │ Send Mieke the role canvas                                │ │
│ │ Agreed in Sparring Mieke · Tue 14 Oct                     │ │
│ │ [ Done ]  [ Remove #next ]                       Note ›   │ │
│ └───────────────────────────────────────────────────────────┘ │
│   Agreed 3  ·  Next 2  ·  Plan 4                          ‹ › │
│   Agreed in Sparring Mieke · today                            │
│   ○ Draft feedback for the team lead               [ #next ]  │
│   ● Book follow-up with HR                                    │
│   ◌ Org chart from Mieke · waiting                 [ Done ]   │
│ Also here: 2 waiting · 1 someday   Overview ›                 │
│ Go to Sparring Mieke 2026 ›                                   │
│ ┄┄ + Quick Add ┄┄                                             │
│ Today next: 14:00 Retro demand · in 40 min                    │
│ Open gtdpara                                         Close   │
└───────────────────────────────────────────────────────────────┘
 ● #next (tap = work on it)   ○ plan   ◌ waiting
```

#### B. The same thread from a note elsewhere (Next tab, "I owe" first)

```
│ [Thread]  #sparring/mieke · Coaching                        ✕ │
│ Next here: Thu 6 Nov 10:00 Sparring Mieke · next today ›      │
│   Pick your next action below.                                │
│   Agreed 3  ·  Next 2  ·  Plan 4                              │
│   ● Book follow-up with HR                  [ Remove #next ]  │   ← I owe
│   ● Read Mieke's article #mieke             [ Remove #next ]  │   ← Relevant
│ Also here: 2 waiting · 1 someday   Overview ›                 │
│ ┄┄ + Quick Add ┄┄                                             │
│ Open gtdpara                                         Close   │
```

(Today next is hidden here because it's the same meeting as Next here.)

#### C. Thread overview: Ahead and Quick Add

```
 Ahead   + Next sparring                 │ ┌ Quick Add ─────────────────────────┐
 Next meetings                           │ │ New task                           │
   Thu 6 Nov 10:00 Sparring Mieke        │ │ ↳ from Sparring · 14 Oct ✕          │
 I owe                                   │ │   #sparring/mieke ✕                │
   ○ Draft feedback for the team lead    │ │ …                        [ + Add ] │
 Waiting for                             │ └────────────────────────────────────┘
   ◌ Org chart from Mieke                │
 Relevant                                │
   ● Read Mieke's article                │
 1 someday ›                             │
```

#### D. Review → Someday / Maybe (opened from Engage)

```
 Someday / Maybe                    Only #sparring/mieke · Show all
 ┌ Coaching ───────────────────┐  ┌──────────────────────────────────────┐
 │ ○ Invite Mieke to the forum │  │ Invite Mieke to the forum            │
 │                             │  │ Someday · created 2 Oct              │
 │                             │  │ [ #next ] [ To plan ] [ Done ] [ Cancel ] │
 └─────────────────────────────┘  └──────────────────────────────────────┘
                                         ‹ Back    Skip ›    Reviewed ›
```

## As built

Steps S1-S4 on `feature/engage-in-context`; every step ended with `npm run check` green.

Choices where the design left a detail open, and deviations:

- **S1.** `domain/threadLens.ts` also exports `meetingStartKey`, which the overview sorts by. `storage/threadAggregate.ts` keeps `ThreadItemRef`, `ThreadSource`, `ThreadLensContext`, `ThreadRelation` and `threadLensContext(items, inbox, …)` as aliases and a wrapper.
- **S2.** `loopRelation(item, loopTag, task)` reads only `item.path` and `item.meetings`; a cancelled loop meeting never makes a todo "agreed", the rule the loop's Looking back already followed.
- **S3.** `isSomedayMaybe(task)` lives in `domain/flowState.ts`. A counterpart's close-out (`ui/CounterpartCloseOut.tsx`) still offers its Someday/Maybe todos, as a fourth group "Someday / Maybe", so setting a counterpart inactive leaves nothing open behind; the roster's "owe" count no longer counts Someday/Maybe.
- **S4.**
  - The hub counts the step in tasks ("3 tasks"); the recap line is "n someday todos made #next".
  - A request that arrives while another step is open leaves that step first, with Skip semantics, then enters the requested one.
  - The filter's label is the overview's title: `#<thread>` in the thread lens, "All <counterpart>" in the counterpart lens, `#<kind>/<name>` for a loop.
  - App's part is one hook, `screens/useReviewStepNav.ts`: it closes the overlays and shows the Review tab. Stray blank lines in `App.tsx`'s JSX were removed to keep the file under 1,000 lines.
  - `somedayItems` covers Projects and Areas only, as specified; an overview whose owner is the Inbox opens an empty filtered list.
