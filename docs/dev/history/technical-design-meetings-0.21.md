# Technical design: Meetings, kept - 0.21.0 (In the moment + Agreements)

Status: **design, for review** (2026-10-24). Release **0.21.0**, branch `feature/meetings-moment`.
Requirements: project doc `claude/feature-meetings-0.21.md` (§1-§9) and the decisions of
2026-10-24 below. UI: Design canvas "Kept GTD 0.21 – Meetings UI" (9 screens).
On implementation this goes to `docs/dev/history/technical-design-meetings-0.21.md` with an
"As built" section.

Design goals:
- **One membership rule per owner**, shared by Engage, the overviews, the Review step and the
  piece - the same seam 0.18 built (`domain/engageOwner.ts`, `domain/threadLens.ts`).
- **One write path for agreements** (`storage/agreements.ts`), like `storage/counterparts.ts`
  and `storage/loops.ts`.
- **No new list or pager**: every list is a `PagedSection`; every new row reuses `OptionRow`
  or the overview row components.
- Decisions live in `src/domain/`, pure and tested.

---

# Part A - Requirements as decided

## A1 The moment (Engage on a meeting's page)

- **R1** On a meeting's page (and its reflection page), Engage shows a **meeting line**: the
  meeting's title, date and time, and a switch **Before · During · After**.
- **R2** Time preselects the moment: **Before** until the start, **During** from the start until
  the planned end, **After** from the end until `REVIEW_LOOKBACK_DAYS` (7) days later. No grace
  period. A date-only meeting: before its date, on its date, after it. Older than the window:
  no meeting line.
- **R3** A tap on another moment switches it. The choice is kept per meeting while the plugin
  runs; never written to a file.
- **R4** One **button row** under the meeting line, the first three that apply:
  - Before: **Mark prepped** (a matching setup tracks prep, not yet `#prepped`) ·
    **Note from last meeting ›** (the owner's previous meeting has a note).
  - During: **+ Next <type>** (the thread/loop has no meeting after this one).
  - After: **Reflect ›** (or **Reflection ›** when it exists; hidden on the reflection page) ·
    **Mark reviewed** (a setup tracks review, not yet `#reviewed`) · **+ Next <type>**.
  An empty row is not drawn ("nothing needed here").
- **R5** Today's "Reflect on this meeting ›" line goes; the strip's **Reflect ›** replaces it.
- **R6** "Next here" hides while it names the page's meeting.
- **R7** During and After, Engage's Quick Add carries the meeting (`↳ from <meeting> ✕`) and the
  owner's tag (`#<tag> ✕`), each droppable for one item. Before, only the tag (as today).
- **R8** No counts line (no "Ask about", "Raise here", "Agreed last time").

## A2 Engage's tabs

- **R9** Tabs, each shown only when it has rows (Next and Plan as today):
  **From Thread** (loop owner: **From Loop**; Project/Area owner: **From meetings**) ·
  **Next** · **Plan** · **Waiting** · **Agreements**.
- **R10 From Thread** lists what came out of the owner's meetings that have started, grouped by
  meeting, newest first, one caption per meeting ("Tue 14.10. · Sparring Mieke"):
  - open todos agreed in that meeting (any flow state except Someday/Maybe; the current todo
    left out), file order;
  - active agreements made in that meeting (◇);
  - **done** todos only for the **reference meetings**: Before = the previous meeting; During =
    the previous meeting and this one; After = this one; off a meeting page = the latest meeting
    that is over. Done rows come last in their group, struck through, no action.
  - A Project/Area owner gets the tab only on a meeting's page, with that meeting's group (and
    the previous one's done items Before/During).
- **R11 Waiting** lists the owner's open Waiting For todos (for a thread: `#wf/<counterpart>`, and
  a bare `#wf` agreed in the thread or tagged with it - the overview's rule), file order. Each row
  shows where it came from when it was agreed in a meeting ("from 14.10."), and has **Done**.
  "Also here" no longer counts waiting ones.
- **R12 Agreements** lists the owner's active agreements in file order (thread: thread tag and the
  plain counterpart tag), with "since <date>" and "till <date>" ("– over" when past). A tap shows
  **Change** and **End** in the row; a second tap hides them.
- **R13** Row actions: `#next` → tap to work on it (as today); plan → **#next**; waiting →
  **Done**; agreement → Change / End; done → none.
- **R14** First tab after opening on a meeting's page: **From Thread** when it has rows; else the
  existing Next/Plan rule. An emptied From/Waiting/Agreements tab gives way like Agreed does today.

## A3 Engage elsewhere

- **R15** The Now box gets **w/f <Counterpart>** (sets Waiting For on the owner thread's
  counterpart; **w/f** without one) and **Do someday**, next to **Remove #next** (when `#next`),
  **Note ›** and the file. The meeting the todo was agreed in ("From Sparring Mieke · 14.10. ›")
  opens that meeting's note.
- **R16** A loop owner gets one line under the header: "Loop since 2.10. · 3 open" plus
  "next: <meeting> ›", or **+ Next <kind>** when no meeting is ahead.

## A4 Agreements

- **R17** An agreement is a plain bullet in a `## Agreements` section:
  `- <text> #tags [meeting:: <date> <title>] [created:: <date>] [valid:: <date>] [ended:: <date>]`.
  No checkbox (Obsidian Tasks ignores it). Active = no `ended`. Over = `valid` before today.
- **R18** Scope by tag, like todos. Stored in the file that owns the scope:
  - thread → the scope owner's file (where its `## Threads` line lives: the Area's, or a Project's
    without an Area);
  - loop → the loop's item file (where its `## Loops` line lives);
  - Project/Area → its own file. Never `Inbox.txt`.
- **R19** Membership: thread = agreements in its scope whose tags are in the thread lens (thread
  tag or deeper, or the plain counterpart tag); counterpart lens = any type with that counterpart;
  loop = the loop's item file, tagged with the loop; Project/Area = its own file, tagged with no
  active loop and no thread.
- **R20** Capture: Quick Add's **Agreement** tab (where an owner is known: Engage, thread and loop
  overview, Project/Area page) and lasso capture / mark processing with **Agreement** as a third
  kind. From a meeting's page it records `[meeting::]`.
- **R21** **Valid till** is a field like the date field; focusing it shows the hovering strip
  **none · +1 m · +3 m · end of year · ✕**. Quick Add's row 3 holds tags.
- **R22** Lifecycle: **Edit** (wording, tags, valid till; the same agreement), **Change** (ends the
  old one with `[ended:: today]` and adds the new one - only when the new one is added; Cancel
  leaves the old untouched), **End** (asks once, `[ended:: today]`), **Keep** in Review (new valid
  till or none). Nothing is ever deleted.
- **R23** The agreement card (in Quick Add's place, like the todo card): text, tags, since,
  valid till, made in (opens the meeting's thread overview), **Edit**, **Change**, **End**, where
  it lives.
- **R24** Shown in: Engage (R10, R12); thread and loop overview (block "Agreements" after Waiting
  for; "n agreements ended ›" in Looking back; "Agreements made" in a past meeting's panel);
  Project/Area page ("◇ Agreements n ›" at the end of the todo list, opening the list in that
  column with "‹ Todos"); the "Since last time" piece (block "Agreements made last time").
- **R25** Review step **Agreements** (after Tending threads): active agreements past valid till,
  of an inactive counterpart, of a loop that is not active, or of a Project/Area that is done or
  on hold. **Keep**, **Change**, **End**. Hidden when empty.
- **R26** Tending threads panel lists the counterpart's active agreements (read only). Counterpart
  close-out gets a group **Agreements** (Keep / End, End all). Project close-out's checklist warns
  "n active agreements" with **End all** (not a blocker).
- **R27** Feature module (later): agreements belong to "threads & loops"; the moment strip's prep,
  review and reflect actions to "meeting management". No switches in 0.21.0.

---

# Part B - Technical design

## 1. Current state (0.20.0)

| Concern | Where | Today |
|---|---|---|
| Engage options | `domain/engageOptions.ts` `optionsOf` → `{next, plan, agreed, alsoHere, nextMeeting, ownerEmpty}` | Agreed = page meeting's or latest past meeting's open agreed todos |
| Tabs | `domain/engageFlow.ts` `EngageTab = 'agreed' \| 'next' \| 'plan'`; `screens/engage/OptionTabs.tsx` | tab rule in `onDataChanged` |
| Page meeting | `storage/noteOwnerOf.ts` → `NoteContext.meeting`; `EngageState.pageMeeting` | reflection page counts as the meeting's page (0.19) |
| Reflect | `screens/engage/ReflectLine.tsx`, `domain/reflection.ts` `reflectionOffered` | quiet line |
| Tracking | `domain/meetingTracking.ts` `resolveMeetingTracking` (phase by time), `toggleMeetingTracking*`; action `useEntryActions().tracking` | |
| Engage Quick Add | `ui/CollapsedQuickAdd.tsx` (`ownerTag`) | no meeting provenance |
| Quick Add | `ui/QuickAddWidget.tsx`, `ui/quickAdd/*`; tabs `QuickAddType = 'task' \| 'meeting' \| 'note'`; date strip `ui/DateInput.tsx` + `DateNudgeStrip` hovering over R1 | |
| Sections | `domain/statusSection.ts` (Threads, Loops); `storage/projectFile.ts` `saveThreads/saveLoops`; `storage/dataCache.ts` `updateItemThreads/Loops`; writes through `storage/dataFileWrite.ts` | |
| Provenance | `domain/provenance.ts` `resolveProvenance(task, sources, scope)`, `meetingKey`, `applyProvenance` | |
| Overviews | `storage/threadAggregate.ts` `buildThreadOverview` (`ahead.{meetings,owe,waiting,relevant,someday}`, `since`, `past`); `storage/loopAggregate.ts` | |
| Review | `domain/reviewSteps.ts` (ids, order), `storage/reviewAggregate.ts`, `screens/review/steps/*` | |
| Piece | `storage/sinceLast.ts` blocks | |

## 2. Agreements: data

### 2.1 `domain/agreements.ts` (new, pure)

```ts
export const AGREEMENTS_HEADING = '## Agreements';

export interface AgreementFields {
  meeting: string | null;   // `<date> <title>`, as found
  created: string | null;   // YYYY-MM-DD
  valid: string | null;     // YYYY-MM-DD
  ended: string | null;     // YYYY-MM-DD
  extra: string[];          // unknown `[k:: v]`, verbatim, file order
}
export interface Agreement {
  text: string;             // without the fields; tags inline
  tags: string[];           // deriveMeetingFields-style tag extraction (lowercased)
  fields: AgreementFields;
  raw: string | null;       // the line as read; written back unchanged while nothing changed
}
export function parseAgreementsSpan(content: string): {agreements: Agreement[]; extraLines: string[]};
export function writeAgreementsIntoContent(content: string, agreements: readonly Agreement[], extraLines?: readonly string[]): string;
export function serializeAgreementLine(a: Agreement): string;   // `- text [meeting::] [created::] [valid::] [ended::] extra…`
export function buildAgreement(text: string, opts: {today: string; valid: string | null; meeting: string | null}): Agreement;
export function isActiveAgreement(a: Agreement): boolean;           // !fields.ended
export function isOverAgreement(a: Agreement, today: string): boolean; // active && valid !== null && valid < today
export function withAgreementEdit(a: Agreement, text: string, valid: string | null): Agreement; // keeps created, meeting, extra
export function endedAgreement(a: Agreement, today: string): Agreement;
export function keptAgreement(a: Agreement, valid: string | null): Agreement;
export type ValidPreset = 'none' | '1m' | '3m' | 'eoy';
export function validTillOf(preset: ValidPreset, today: string): string | null; // +1 m clamps to month end
```

- Line parsing: a line `- …` (no `[ ]`/`[x]`) in the section; the trailing fields are split with
  `domain/taskLine.ts`'s splitter, `valid`/`ended` taken from its `extra` (the known keys of tasks
  stay as they are). Lines that don't parse are kept as `extraLines`, written after the
  agreements, like every other section.
- `resolveProvenance` widens its parameter to `{fields: {meeting: string | null}}` so it takes
  agreements (todos still fit).
- Round-trip: a file with hand-written lines, unknown fields and a blank line in between reads and
  writes back byte-identical when nothing changed.

### 2.2 Membership (`domain/agreementOwner.ts`, new, pure)

```ts
export interface AgreementRef { itemPath: string; index: number; agreement: Agreement }
export interface AgreementSourceItem { path: string; agreements: readonly Agreement[] }  // EngageItem gains `agreements`
export function ownerAgreements(owner: EngageOwner, source: EngageSource): AgreementRef[];   // active only, file order (R19)
export function lensAgreements(ctx: ThreadLensContext, items, lens): {active: AgreementRef[]; ended: AgreementRef[]}; // overviews
export function agreementMadeIn(ref: AgreementRef, source): MeetingRef | null;  // via resolveProvenance in the item's scope
export function agreementTargetPath(owner: EngageOwner, source): string | null;  // R18: where a new one is written
```

- Thread: `ctx.inScope` files, `ctx.inLens(tags)`. Loop: its item, `belongsToLoop(tags, tag)`.
  Item: its own file, no active loop tag (`belongsToLoop`) and `threadOfTags(tags)` null.
- `EngageItem` and `CachedItem` gain `agreements` (and `agreementsExtraLines` in the cache).

### 2.3 Storage

- `storage/projectFile.ts`: `ProjectFileState.agreements/agreementsExtraLines` from
  `parseAgreementsSpan`; `saveAgreements(kind, itemPath, base, agreements, extraLines)` through
  `writeDataFile` owning the part `AGREEMENTS_HEADING` (added to `DATA_FILE_HEADINGS`).
- `storage/dataCache.ts`: the fields on `CachedItem`, `updateItemAgreements(path, raw, list, extra)`.
- `storage/agreements.ts` (new, the one write path):
  ```ts
  addAgreement(targetPath: string, agreement: Agreement): Promise<void>;
  editAgreement(ref: AgreementRef, text: string, valid: string | null): Promise<void>;
  changeAgreement(ref: AgreementRef, text: string, valid: string | null, meeting: string | null): Promise<void>; // one write: end + add
  endAgreement(ref: AgreementRef): Promise<void>;
  keepAgreement(ref: AgreementRef, valid: string | null): Promise<void>;
  ```
  Each re-finds the line by index and text (like `resolveTodoKey`) before writing; a vanished
  line throws "That agreement changed in the file - look again". Write-through, logged
  (`agreements: added|edited|changed|ended|kept`, kind only, never text). Inbox target → throws
  (the UI never offers it).
- Status texts in `domain/fileChangeText.ts`: "Agreement added to Coaching", "Changed the
  agreement - the old one is ended", "Ended the agreement".
- Debug bundle: one line `agreements: active=n ended=m files=k`.

## 3. The moment

### 3.1 `domain/meetingMoment.ts` (new, pure)

```ts
export type MeetingMoment = 'before' | 'during' | 'after';
export function momentByTime(meeting: MeetingEndInput & Pick<Meeting,'cancelled'>, nowMs: number): MeetingMoment | null; // R2
export function previousMeeting(meetings: MeetingEntryRef[], of: MeetingEntryRef): MeetingEntryRef | null;   // latest start before `of`
export function hasMeetingAfter(meetings: MeetingEntryRef[], of: MeetingEntryRef): boolean;

export type StripAction = 'markPrepped' | 'lastNote' | 'nextMeeting' | 'reflect' | 'markReviewed';
export function stripActions(moment: MeetingMoment, input: {
  tracksPrep: boolean; prepped: boolean; tracksReview: boolean; reviewed: boolean;
  lastHasNote: boolean; nextNeeded: boolean; onReflectionPage: boolean;
}): StripAction[];   // R4 order, at most 3
```

- `meetingTracking.ts` gains `tracksCheckpoint(meeting, config, kind)` and
  `isCheckpointTicked(meeting, kind)` (the pieces `resolveMeetingTracking` already computes), so
  the strip asks per moment instead of by time.

### 3.2 `ui/meetingMomentStore.ts` (new)

A module-level `Map<string, MeetingMoment>` keyed `${itemPath}|${meetingKey(meeting)}`;
`momentChoice(key)`, `chooseMoment(key, moment)`, logged `meetingMoment: chosen <moment>`. Lost on
plugin restart (R3). A choice equal to the time's moment is removed.

## 4. Engage

### 4.1 Options (`domain/engageOptions.ts`)

```ts
export type EngageTab = 'from' | 'next' | 'plan' | 'waiting' | 'agreements';
export interface FromGroup { meeting: MeetingEntryRef; rows: FromRow[] }
export type FromRow =
  | {kind: 'todo'; todo: OwnerTodoRef}            // open or done
  | {kind: 'agreement'; agreement: AgreementRef};
export interface EngageOptions {
  next; plan;                                     // unchanged
  from: FromGroup[];                              // R10; [] = no tab
  waiting: OwnerTodoRef[];                        // R11
  agreements: AgreementRef[];                     // R12
  alsoHere: {someday: number};                    // waiting moved to its tab
  nextMeeting; ownerEmpty;                        // unchanged
}
export function optionsOf(owner, source, nowMs, current = null, page: {meeting: MeetingRef; moment: MeetingMoment} | null = null): EngageOptions;
```

- `ownerTodos` stays open-only; `from` reads done todos separately through a new
  `ownerAgreedTodos(owner, source, meetingRefs)` (open and done, `agreedIn` in the given meetings).
- Reference meetings for done rows (R10) from `page.moment`, `previousMeeting`, or the latest
  meeting that is over.
- `agreed`/`AgreedList` and `agreedOf` are removed (the From tab replaces them); `sinceLast` keeps
  its own "Agreed last time" logic (unchanged).
- Waiting order: file order; `agreedIn` gives the "from 14.10." detail (text in `engageText.ts`).

### 4.2 Flow (`domain/engageFlow.ts`)

- `EngageTab` as above; `dataChanged` carries `{nextRows, fromRows, waitingRows, agreementRows}`.
- Tab rule (R14): first data → `'from'` when `pageMeeting && fromRows > 0`, else Next/Plan; a
  selected `from`/`waiting`/`agreements` that empties → Next/Plan rule; others unchanged.
- `EngageState` gains nothing for the moment: it lives in the store (§3.2) and is read by the view.
- Table tests for every transition, as today.

### 4.3 UI (`screens/engage/`)

| File | Change |
|---|---|
| `MomentLine.tsx` (new) | title · date/time on the left, `Before · During · After` segmented (three small pills, the chosen one filled black) on the right; one row (~36 dp). |
| `MomentStrip.tsx` (new) | `stripActions(...)` as `PillButton`s; empty → nothing. Mark prepped/reviewed → `actions.tracking(entry, kind)`; Note from last meeting → `actions.meetingNote(prev)` then close; Reflect → `actions.reflection(entry)` then close; + Next → `dispatch(expandQuickAdd)` with a meeting seed (§4.4). Uses `useReflectionLookup` for Reflect/Reflection and "on the reflection page". |
| `ReflectLine.tsx` | removed. |
| `OptionTabs.tsx` | five tabs; `From` renders group captions as rows (height 28) through `PagedSection`'s `rowHeight`; agreement rows via new `AgreementOptionRow.tsx` (◇, "since/till", tap toggles Change/End); done rows struck, no action; Waiting rows with "from …" detail and **Done**. |
| `AlsoHereLine.tsx` | someday only; hidden at 0. |
| `NowBox.tsx` | buttons: **w/f <Counterpart>** (or **w/f**), **Do someday**, **Remove #next** (when `#next`), **Note ›**, file; the details line's meeting part is a link to that meeting's note. w/f → `actions.setTaskFlow(todo,'waiting-for', slug)` (extend `EngageFlowChoice` with `'waiting'`, Undo as for every Engage action). |
| `LoopLine.tsx` (new) | R16 for loop owners. |
| `EngageOverlay.tsx` | wiring: MomentLine + MomentStrip under the header when the page meeting has a moment; hides "Next here" when it is the page meeting; passes the Quick Add parts (§4.4). |
| `useEngageView.ts` | computes the moment (store choice ?? `momentByTime`) and passes `page` to `optionsOf`. |

Line budget (A5 X, `design-device-rendering.md`): + MomentLine (~36) + strip (~44) − Reflect
line (~30) − Next here when merged (~30). The From tab's captions cost 28 each inside the
5-row viewport (`ENGAGE_LIST_VIEWPORT` stays 320; fewer rows per page when there are captions).

### 4.4 Engage's Quick Add

- `CollapsedQuickAdd` gains `provenance?: QuickAddAdds | null`, `onAddAgreement?` and
  `meetingSeed?` (title + tag for "+ Next", same seed the overview's `nextMeetingOffers` builds;
  move that seed builder into `domain/threadText.ts` or `domain/nextMeeting.ts` so both use it).
- During/After on a meeting page: parts = `useProvenance(pageMeeting)` + `usePresetTag(owner tag)`;
  Before: preset tag only. Agreement adds get `[meeting::]` from the provenance part when present.
- Agreements are written to `agreementTargetPath(owner)`.

## 5. Quick Add: Agreement tab

- `QuickAddType` gains `'agreement'`; `TabsRow` renders it only when `onAddAgreement` is passed
  (like Note).
- `ui/quickAdd/useAgreementDraft.ts` (`{text, valid}`) and `ui/quickAdd/AgreementRows.tsx`: R2 =
  the text field (`ClipboardTextInput`) + `ValidTillInput`; R3-R4 = the tag chips (shared with
  the Todo tab); R4 = the grey line when parts are given.
- `ui/ValidTillInput.tsx` (new): a read-only field showing "till 31.12." / "valid till"; focus
  shows `ValidTillStrip` hovering over R1 like `DateNudgeStrip` (none · +1 m · +3 m · end of year
  · ✕; `…` opens the normal `DateInput`). Values from `validTillOf`.
- Edit target `{kind: 'agreement'; mode; key; agreement: AgreementRef}`; **Save** →
  `editAgreement`. Change: `{kind: 'agreementChange'; replaces: AgreementRef}` → prefilled,
  the grey line "↳ replaces '…' ✕" (✕ = Cancel), **+ Add** → `changeAgreement`.
- `onAddAgreement(text, valid, meeting | null)`: the screen decides the target path.
- QuickAddWidget is in the code-health baseline: the agreement parts live in their own files;
  the widget only routes.

## 6. Agreement card

`ui/itemCard/AgreementCard.tsx` + `useAgreementCard.ts`, the same frame as `TodoCard`:
row 1 "Agreement · since 14.10." · "↳ <meeting> ›" · **Edit** · ✕; row 2 text + tags; row 3
"valid till …" · **Change** · **End** (End asks through `useStatusConfirm`); row 4 "in <item> ›".
`useEditTarget` learns the agreement kind (select → card, second tap → edit).

## 7. Lasso capture and marks

- `CaptureQuickAdd` gains the kind **Agreement** when the page has an owner
  (`noteContextOf(...).owner` non-null; the capture screen already reads the page). Split lines
  is off for agreements (one per capture). Fields: text, valid till, tags, **For** chips: the page
  meeting's owner (thread/loop) first, then the note's item, **More…** = `DestinationPicker`
  limited to Projects/Areas (an item owner). `[meeting::]` from the page meeting, droppable.
- The marks screen offers the same kind; a mark's page gives the owner the same way.
- Save → `addAgreement(target)`; Save & next / view / close as today.

## 8. Overviews and pages

- `storage/threadAggregate.ts`: `ahead.agreements: AgreementRef[]` (lens), `endedAgreements`,
  and per past meeting `agreements: AgreementRef[]` (made in it). Same in `loopAggregate.ts`.
- `screens/thread/AheadSection.tsx`: block "Agreements" after "Waiting for" (◇ rows; tap → card);
  `LookingBackSection.tsx`: row "n agreements ended ›" → right panel lists them with their ended
  date; `PastMeetingPanel.tsx`: block "Agreements made".
- Thread and loop overview Quick Add: `onAddAgreement` (target = `agreementTargetPath`), preset tag
  as for todos.
- Project/Area page: `screens/projectData/TodosSection.tsx` ends with "◇ Agreements n ›" (item
  owner's agreements, only when n > 0); it switches the column to `AgreementsList.tsx` with
  "‹ Todos". Quick Add there gets the Agreement tab.

## 9. Review and close-outs

- `domain/reviewSteps.ts`: id `'agreements'`, `{title: 'Agreements', kind: 'backlog'}` after
  `tendingThreads`; recap counters `agreementsKept`, `agreementsEnded` (0 for older records).
- `storage/reviewAggregate.ts`: `agreementsToReview` with a reason per row
  (`over` | `counterpartInactive` | `loopClosed` | `itemDone` | `itemOnHold`), grouped by item.
- `screens/review/steps/AgreementsStep.tsx` (`ReviewMasterDetail`, `useFrozenStepList`): detail
  with **Keep** (opens the valid-till choices), **Change** (the agreement form inline - the same
  `AgreementRows` in a small frame), **End**.
- `TendingThreadsStep`: the counterpart's active agreements as a quiet list.
- `ui/CounterpartCloseOut.tsx`: group "Agreements" (Keep / End, End all).
- `domain/closeOut/readiness.ts`: warning `activeAgreements` ("2 active agreements", "they stay in
  the archived file as they are") with **End all** in `ChecklistStep`.
- `storage/sinceLast.ts`: block "Agreements made last time" after "Agreed last time".

## 10. Files

**New:** `domain/agreements.ts`, `domain/agreementOwner.ts`, `domain/meetingMoment.ts`,
`storage/agreements.ts`, `ui/meetingMomentStore.ts`, `ui/ValidTillInput.tsx`,
`ui/quickAdd/useAgreementDraft.ts`, `ui/quickAdd/AgreementRows.tsx`,
`ui/itemCard/AgreementCard.tsx`, `ui/itemCard/useAgreementCard.ts`,
`screens/engage/MomentLine.tsx`, `MomentStrip.tsx`, `AgreementOptionRow.tsx`, `LoopLine.tsx`,
`screens/projectData/AgreementsList.tsx`, `screens/review/steps/AgreementsStep.tsx`, tests.

**Changed:** `domain/{engageOptions,engageFlow,engageOwner,engageText,threadText,meetingTracking,provenance,reviewSteps,fileChangeText,markdown(DATA_FILE_HEADINGS),closeOut/readiness}.ts`,
`storage/{projectFile,dataCache,engageAggregate,threadAggregate,loopAggregate,reviewAggregate,sinceLast,debugBundle}.ts`,
`screens/engage/{EngageOverlay,OptionTabs,NowBox,AlsoHereLine,useEngageView,useEngageFlow}.tsx`,
`screens/engage/ReflectLine.tsx` (removed), `ui/{CollapsedQuickAdd,QuickAddWidget,useEditTarget,CounterpartCloseOut}.tsx`,
`ui/quickAdd/{types,TabsRow,CaptureQuickAdd}.ts(x)`, `screens/CaptureScreen.tsx`,
`screens/thread/{AheadSection,LookingBackSection,PastMeetingPanel,ThreadOverview}.tsx`,
`screens/loop/LoopOverview.tsx`, `screens/projectData/TodosSection.tsx`, `ui/closeOut/ChecklistStep.tsx`,
`screens/review/steps/TendingThreadsStep.tsx`, `screens/review/ReviewScreen.tsx`.

**Docs:** `docs/user/engage.md`, `meetings.md`, `threads.md`, `loops.md`, `quick-add.md`,
`lasso.md`, `review.md`, `close-out.md`, `projects-and-areas.md`, `obsidian.md` (the section), new
`docs/user/agreements.md`; `CHANGELOG.md` (New, Changed: Agreed → From Thread, Reflect line →
strip, Waiting tab; **Upgrade note**: a new `## Agreements` section appears in a file the first
time an agreement is added; older versions keep it as unknown lines); `docs/dev/design-overview.md`
(§2 Engage, file format, review steps), `docs/dev/design-device-rendering.md` (Engage budget).

## 11. Test scenarios (Given / When / Then)

Demo-like data: Area **Coaching** with `## Threads - mieke: active`, Thread setup `sparring`
(tracks prep and review); meetings "Sparring Mieke" on Tue 14.10. 10:00-11:00 and today
10:00-11:00 (`#sparring/mieke`); todos agreed on 14.10.: "Draft feedback" (plan), "Org chart from
Mieke" (`#wf/mieke`), "Send role canvas" (done 20.10.).

1. **Before, preselected.** Given it is 09:30 and the note open is today's meeting page. When
   Engage opens. Then the meeting line shows "Sparring Mieke · today 10:00–11:00" with
   **Before** chosen, the row shows **Mark prepped** and **Note from last meeting ›**, the tab is
   **From Thread** with the group "Tue 14.10. · Sparring Mieke": Draft feedback, Org chart (waiting,
   Done), Send role canvas (struck).
2. **Mark prepped.** Given scenario 1. When **Mark prepped** is tapped. Then the meeting line in
   `area.txt` carries `#prepped` and the button is gone.
3. **During: capture with provenance.** Given it is 10:20. When Quick Add is opened and "Book
   follow-up with HR" is added. Then the todo line ends with `[meeting:: <today> Sparring Mieke]`
   and has `#sparring/mieke`; From Thread shows a group "today · Sparring Mieke" with it on top.
4. **Agreement during the meeting.** Given it is 10:30. When on the Agreement tab "Feedback only
   in our 1:1s" is added with valid till **end of year**. Then `area.txt` has under
   `## Agreements` `- Feedback only in our 1:1s #sparring/mieke [meeting:: <today> Sparring Mieke] [created:: <today>] [valid:: <yyyy>-12-31]`,
   the Agreements tab lists it, and From Thread lists it in today's group.
5. **Ended early.** Given it is 10:40 (During by time). When **After** is tapped. Then the row shows
   **Reflect ›**, **Mark reviewed**; closing and reopening Engage on the page keeps **After**.
6. **After by time, no grace.** Given it is 11:01. Then the moment is **After** without a tap.
7. **Done rows by moment.** Given "Send role canvas" (done, from 14.10.) and "Book follow-up"
   (done today, agreed today). Before: only 14.10.'s done row shows; During: both; After: only
   today's.
8. **Waiting tab.** Given `#wf/mieke` "Org chart" (agreed 14.10.) and "Budget numbers #wf/mieke"
   (not from a meeting). Then the **Waiting** tab lists both, the first with "from 14.10.";
   **Done** on one ticks it; "Also here" shows no waiting count.
9. **+ Next only when needed.** Given no sparring after today. During: the row shows **+ Next
   sparring**; tapping opens Quick Add's Meeting tab with the seed. Given a sparring on 6.11.:
   no **+ Next**.
10. **Change an agreement.** Given the agreement from 4. When **Change** is tapped in the
    Agreements tab, the text edited to "Feedback only in our 1:1s, except urgent" and added. Then
    the old line gets `[ended:: <today>]`, a new line is added with `[created:: <today>]`, and
    the tab lists only the new one. **Cancel** instead leaves the file unchanged.
11. **End.** When **End** is confirmed. Then the line gets `[ended:: <today>]`; the overview shows
    "1 agreement ended ›" in Looking back.
12. **Overview block.** Given an agreement tagged `#mieke` in `Coaching/area.txt` and one tagged
    `#sparring/sven`. Then Mieke's thread overview lists the first under "Agreements", not the
    second; **All mieke** lists the first too.
13. **Project page.** Given Project "Leadership program" with one untagged agreement and one
    tagged `#sparring/mieke` in its `project.txt`. Then the page shows "Agreements 1 ›"; the
    tagged one shows in Mieke's thread overview (its scope) and not on the page.
14. **Lasso.** Given a lasso on today's meeting page. When **Agreement** is chosen and saved. Then
    the agreement is written to `Coaching/area.txt` with `[meeting::]`; Split lines is not shown.
15. **Review step.** Given an agreement with `[valid::]` yesterday and Mieke set inactive with
    another active agreement. Then the step lists both with "till … – over" and "thread
    inactive"; **Keep** with "+3 m" sets `[valid::]` three months ahead; **End** ends.
16. **Todo page.** Given the page of "Send Mieke the role canvas #next" (thread Mieke). When
    **w/f Mieke** is tapped. Then the line carries `#wf/mieke` instead of `#next`, the ack offers
    Undo, and it shows on the Waiting tab.
17. **Round-trip.** Given a hand-edited `## Agreements` with an unknown field `[who:: both]`, a
    comment line and a blank line. When one agreement is ended in the app. Then only that line
    changes; everything else is byte-identical.
18. **Inbox never.** Given Engage on an Inbox meeting's page (owner = Inbox item). Then the
    Agreement tab is not offered.

## 12. Unit tests (Jest, pure)

- `agreements`: parse/serialize round-trip (raw kept), field order, unknown fields, extra lines,
  `validTillOf` (31.1. + 1 m = 28./29.2.; eoy), lifecycle helpers.
- `agreementOwner`: membership per owner kind (R19), target path (R18), made-in.
- `meetingMoment`: windows incl. date-only and multi-day, `stripActions` per moment and limit 3,
  `previousMeeting`, `hasMeetingAfter`.
- `engageOptions`: From groups (order, done rows per moment, Project/Area only on its page),
  waiting, agreements, alsoHere.
- `engageFlow`: tab rules (R14) as tables.
- `reviewAggregate`: reasons; `readiness`: the warning; `sinceLast`: the new block.

## 13. Implementation steps (each: `npm run check` green, one commit, push)

- **S0 Agreements domain:** `agreements.ts`, `agreementOwner.ts`, `provenance` widening, tests.
- **S1 Agreements storage:** projectFile, dataCache, `storage/agreements.ts`, fileChangeText,
  debug bundle, CHANGELOG Upgrade note.
- **S2 Quick Add + card:** Agreement tab, `ValidTillInput`, card, Change flow; wired in the thread
  and loop overview (with the Ahead block, Looking back, past meeting panel) and the Project/Area
  page. Scenarios 10-13, 17, 18.
- **S3 Engage domain:** `meetingMoment`, options (from/waiting/agreements), flow, tests.
- **S4 Engage UI:** MomentLine, strip, tabs, Quick Add parts, NowBox, LoopLine; ReflectLine out.
  Scenarios 1-9, 16. **Checkpoint A** (device: Engage before/during/after on a sparring page,
  agreements captured and changed, overview).
- **S5 Lasso + marks:** Agreement kind. Scenario 14.
- **S6 Review and close-outs:** step, tending panel, counterpart close-out, project close-out
  warning, since-last block. Scenario 15.
- **S7 Docs and As built:** help pages, CHANGELOG, design-overview, device-rendering,
  `npm run scenarios`, "As built". **Checkpoint B** (full device test, `-Stage beta`).

## 14. Device test (A5 X)

1. A sparring tomorrow and today: Engage on today's page at three times (or with the switch):
   rows, tabs, Next here hidden. The switch survives closing Engage, not a plugin restart.
2. Mark prepped / reviewed from the strip; Reflect opens or creates the page; on the reflection
   page the strip shows Reflection › only when not on it.
3. Quick Add during: todo and agreement get the meeting; ✕ drops it for one item.
4. Valid-till strip hovers over the tabs and doesn't cover **+ Add**; ✕ puts it away.
5. Agreements tab: Change / End in the row; card in the overview; Project page line and list.
6. Lasso on a meeting page → Agreement; mark processing → Agreement.
7. Review step Agreements; counterpart set inactive → close-out group; project close-out warning.
8. Obsidian: the `## Agreements` section reads as plain bullets; Tasks shows none of them.
9. Regression: Next/Plan, R5 prompt, focus screens, marks line, Go to notebook, Continue with….

## 15. Open points

- **O1** The After window is `REVIEW_LOOKBACK_DAYS` (7 days), not the 14 days the requirements
  draft named, so the strip and Review's close-out agree. Change the constant only together.
- **O2** "Next with <Counterpart>" from the todo-page canvas is not built: "Next here" already
  names the thread's next meeting there.
- **O3** The close-out archive PDF's project record does not list agreements yet (they stay in the
  archived file). A later close-out item if wanted.
- **O4** Integrity Check gets no agreement findings in this release.
