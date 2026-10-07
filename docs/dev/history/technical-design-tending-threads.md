# Technical design: Tending threads (and the file format it needs)

Status: **design approved (all decisions in §4).** Requirements were clarified in conversation (October
2026); the UX draft is a design canvas outside the repository. Nothing here is implemented yet.

This document covers one feature delivered in three releases:

| Release | Name | Content |
|---|---|---|
| 0.10.0 | Plain files | `.md` data files, Obsidian-compatible syntax (`#wf/…`, `[due:: …]`, `[created:: …]`, `[completion:: …]`), one confirmed migration pass, a small raw view/edit of a data file |
| 0.11.0 | Threads | provenance (`[meeting:: …]`), the thread overview, tap rules for nested tags, "+ Next" meeting, `{tag}` in shared file names |
| 0.12.0 | Tending | `## Threads` section, Threads tab on the Current page, Review step "Tending threads", close-out when a counterpart goes inactive, "Since last time" note piece |

Each release is useful on its own and ships separately. 0.10.0 touches every data file once,
which is why it comes first.

## 1. Requirements as decided

### 1.1 Intent

An overview of everything around a person, team or meeting series: open todos, what I wait
for from them, upcoming meetings, what was agreed in past meetings, what moved since the last
one. The main use is **tending**: in the Weekly Review, take care of ongoing relationships and
series as a matter of keeping one's word (next meeting set up? agreements followed up? anything
waiting too long?). Preparing a meeting and routing its outcomes benefit too. It is
qualitative care: no scores, streaks, alarms or rankings.

Persons and series are **not** model entities. They live in nested tags.

### 1.2 One nested tag, three meanings

```
#retro/alpha
 └─┬─┘ └─┬─┘
  type   counterpart
```

- **Type**: the first segment (`retro`, `review`, `coaching`, `onboarding`, `wf`). Usually the
  tag of a Tag Rule (template, tracking, shared note).
- **Counterpart**: the second segment (a person, team, group or process). The UI never calls it
  "person".
- **Thread**: the full two-segment tag (`#retro/alpha`).

Matching is read-time only; nothing is ever written into a line automatically:

- an item tagged `#retro/alpha` belongs to that thread and to counterpart `alpha`;
- an item tagged with the plain leaf (`#alpha`) belongs to the counterpart and shows up in every
  thread of that counterpart;
- `#wf/alpha` is Waiting For, from counterpart `alpha` (Waiting For is just another type);
- a plain parent tag (`#retro`) does **not** reach down into every retro thread;
- deeper nesting (`#coaching/client-a/2026`) belongs to thread `coaching/client-a`.

Lenses: **thread** ("how are retros with alpha going?") and **counterpart** ("how is alpha
overall?"). A type lens ("all retros") is out of scope.

**Both lenses are scoped to one place** (§1.3): `#retro/alpha` in one Area is a different thread
from `#retro/alpha` in another Area.

### 1.3 Counterparts live per Area/Project file

- A counterpart is owned by the Area/Project file whose todos or meetings use it. The same leaf
  can live independently in several files.
- **Scope.** Every overview has an owner: the Project/Area (or the Inbox, which is treated like
  any Area) of the row whose tag was tapped, or the page/roster entry it was opened from. Its
  **scope** is the owner's Area together with the Projects assigned to that Area: an owner Project
  with an assigned Area widens to that Area; a Project without one is its own scope; the Inbox is
  its own scope. Both lenses only show meetings and todos inside the scope, including plain-leaf
  items.
- Status lives on the counterpart, not on threads: `active` or `inactive` only. Threads under a
  counterpart are derived from use.
- New counterparts are **confirmed**, never written silently: Review and the Threads tab offer
  "Tend" (writes `active`) or "Not" (writes `inactive`).
- Setting a counterpart inactive with open items runs a short close-out (Done / Cancel / Keep per
  item). Inactive counterparts leave the Review roster and the tag suggestions; their overview
  and history keep working.
- An archived Project takes its counterparts along.
- The Inbox is an owner like any Area (no special case); it can have counterparts too.

### 1.4 File format (decided)

- **You type tags, gtdpara writes fields.** Typed/tapped meanings are plain Obsidian tags (ASCII,
  no `:`, nesting with `/`). Data gtdpara records are trailing **Dataview inline fields**
  `[key:: value]`, the format the Obsidian Tasks plugin reads when its "Task Format" setting is
  Dataview, and Dataview itself reads.
- Waiting For: `#wf/<counterpart>`, bare `#wf` without one (was `#waiting-for:<slug>`).
- Due: `[due:: YYYY-MM-DD]` (was `#due:YYYY-MM-DD`).
- Created: `[created:: YYYY-MM-DD]` on **every new todo**.
- Done: `[completion:: YYYY-MM-DD]` when a todo is checked.
- Provenance: `[meeting:: YYYY-MM-DD <title>]` (§3.4).
- Data files become `project.md`, `area.md`, `Inbox.md`. Reason: Supernote Cloud Sync carries
  Obsidian's `.md` back to the device, and Obsidian (with Tasks/Dataview) indexes only `.md`.
  Opening the data file from the Supernote file browser is replaced by a small raw view/edit in
  gtdpara.

### 1.5 UX (decided; see the UX draft)

- Tapping a **nested** tag opens the overview in the thread lens. A **plain** tag keeps Daily's
  context filter. The overview has no "filter Daily" button.
- Overview: left column "Ahead" (next meetings with "+ Next <type>", I owe, Waiting for) above
  "Looking back" (one row per past meeting: agreed / done / open). Right column: Quick Add, then
  the selected past meeting as a todo list (open, then done with date) and "Open note".
  Default selection: the latest past meeting. A lens switch: thread | all of the counterpart.
- Quick Add shows **one** grey line when gtdpara adds context in the background:
  `↳ from Retro alpha · Tue 30.9. · adds #retro/alpha`, with ✕ to drop it. Nothing else is
  explained (the "+ Next" prefill speaks for itself).
- Current page, Files area: tabs become Project Files | Resources | Area Files | **Threads**
  (Area page: Area Files | Resources | Project Files | **Threads**). Browse merges into
  Project Files and appears only while it is needed (§3.9.4).
- Threads tab: New (Tend / Not), Active (expandable into threads with next date and "+ next";
  `wf/<counterpart>` listed as a thread), Inactive (folded). Tapping a counterpart filters the
  right side; › opens its overview.
- Review "Tending threads": master-detail; left the New block and active counterparts per
  Area/Project (two lines: last · next meeting / I owe · oldest Waiting For); right a compact
  panel with "Open overview" and "Set inactive".
- "+ Next <type>" copies the latest meeting of the thread (title, tags, time, length) to the
  next date: last date + last interval, stepped forward past today.

## 2. Current state (what exists and is reused)

- `domain/markdown.ts`: `TAG_RE` already accepts nested tags; trailing tokens `→ [[note]]` and
  `+[[file]]` are stripped right to left on parse and appended on write. Task text keeps its
  tags; `deriveTaskFields(text)` derives `tags`, `dueDate` (from `#due:`), `flowState`,
  `waitingOn`, `now`, and is spread by about a dozen call sites after a text change.
- `domain/flowState.ts`: `#waiting-for[:slug]`, `setFlowStateTag`, `isContextTag`.
- `domain/taskLabels.ts` / `ui/TaskLabels.tsx`: the `#w/f Name` and `#due 5.10.` labels.
- `domain/quickAddCompose.ts`'s `composeTaskText` builds a todo's saved text (flow tag, due tag)
  for Quick Add and capture.
- `storage/itemMutations.ts`: the one write path (`buildTask`, `buildMeeting`,
  `applyMeetingEdit`, `mutateEntryTasks`…). Done toggles are written by hand in four screens
  (`{...t, done: !t.done}`).
- `storage/projectFile.ts`'s `dataFileName`/`dataFilePath` is the one place that names a data
  file; the cache stats and reads through it; `createItem`, `markStore`, `marks` use it too.
- `ui/TaskRow.tsx` and `ui/MeetingRow.tsx` each have a copy of `renderTaggableText`: tags are
  tappable only when the screen passes `onToggleContext` (Daily).
- `ui/QuickAddWidget.tsx`: `prefill`, "New from this" (sets the meeting draft from a meeting),
  task-only mode.
- `storage/meetingNoteAggregate.ts`'s `relatedItemsFor` and the `related` note piece.
- Shared note pages: page keyword `<date> <display title>` (`meetingPageKeyword`), resolvable
  from a page via `getKeyWords`.
- `ui/FileBrowserPane.tsx`: roots as MiniTabs, arming, the Browse root.
- Review: `domain/reviewSteps.ts` registry, `ReviewMasterDetail`, frozen lists.
- `App.tsx`: the help overlay pattern (drawn over the tab content, closed by any tab tap).

## 3. Design

### 3.1 Release 0.10.0 — the file format

#### 3.1.1 Task line grammar

```
- [x] <text with #tags> → [[note]] +[[file]] [meeting:: …] [created:: …] [due:: …] [completion:: …]
```

Order of trailing tokens (parse strips right to left, write appends left to right): note link,
linked file, then **fields**. Fields are written in a fixed order: `meeting`, `created`, `due`,
`completion`, then unknown fields as found. Rationale: the Tasks plugin is believed to read its
fields from the end of the line and stop at the first token it does not know; putting our own
`meeting` field before the Tasks fields keeps theirs readable. **This is verified on a real
vault in slice 0.10-1 before anything else is built on it** (test plan T0).

A field token is `\[([a-z][\w-]*)::\s*([^\]]*)\]`, only at the end of the line (a field in the
middle of the text is text, as in Tasks). Unknown keys are kept verbatim in `fields.extra`, so
fields added in Obsidian survive.

#### 3.1.2 Types

```ts
// domain/types.ts
export interface TaskFields {
  due: string | null;        // YYYY-MM-DD
  created: string | null;    // YYYY-MM-DD
  completion: string | null; // YYYY-MM-DD
  meeting: string | null;    // provenance key, §3.4 (written from 0.11.0)
  extra: string[];           // unknown "[k:: v]" tokens, verbatim, in file order
}

export interface Task {
  text: string;              // without links and fields, tags inline as today
  done: boolean;
  cancelled: boolean;
  tags: string[];
  dueDate: string | null;    // fields.due ?? legacy "#due:" tag in text
  flowState: FlowState;
  waitingOn: string | null;
  now: boolean;
  notePath: string;
  linkedFile: string;
  fields: TaskFields;
}
```

`dueDate` stays as a derived convenience (many readers); it is never set on its own.

**One way to change a task.** New pure helpers in `domain/taskEdit.ts`, the only code that
produces a changed Task:

- `withTaskText(task, text)`: new text, re-derives tags/flow/now, recomputes `dueDate` from
  `fields.due` or a legacy tag.
- `withTaskDue(task, date | null)`: sets `fields.due`, strips a legacy `#due:` from the text.
- `withTaskDone(task, done, today)`: sets `done`, writes or clears `fields.completion`.
- `withTaskCancelled(task, cancelled)`.
- `parseTaskInput(lineText)`: splits a composed line (text plus trailing fields, as
  `composeTaskText` returns it) into `{text, fields}`. Used by `buildTask` and by
  `applyTaskEdit` so Quick Add can keep returning one string.

`storage/itemMutations.ts` gains `applyTaskEdit(stored, composedText, linkedFile)` (the task
twin of `applyMeetingEdit`: fields present in the composed text replace stored ones, all
others — `created`, `meeting`, `completion`, `extra` — are kept). All screen-level spreads of
`deriveTaskFields(...)` and the hand-written done toggles (DailyView ×4, InboxScreen ×2,
ProjectDataPanel ×3, ItemListStep, itemMove) are replaced by these helpers. `deriveTaskFields`
stays internal to `domain/`; `npm run code-health` gets a rule that reports it outside
`src/domain/`.

`buildTask(lineText, opts)` sets `fields.created = today` unless the input carries one.
Capture's split items and every Quick Add get it through `buildTask`; nothing else creates
tasks.

#### 3.1.3 Waiting For

- `deriveFlowState`: `wf` or `wf/…` (and the legacy `waiting-for`, `waiting-for:…`) →
  `'waiting-for'`.
- `deriveWaitingOn`: the segment after `wf/` (legacy: after `waiting-for:`). Deeper segments
  are ignored for the name.
- `setFlowStateTag` strips every legacy and new form and writes `#wf/<slug>` or `#wf`.
- `isContextTag`: `wf` and `wf/…` are not context tags (as `waiting-for` today).
- `RESERVED`: `wf` becomes a reserved type word; an abbreviation `WF` is refused
  (`validateAbbrev`).
- Labels are unchanged: `#w/f Name`. In 0.11.0 the label becomes the tap target for the
  `wf/<name>` overview (§3.7).

#### 3.1.4 Due in Quick Add

`composeTaskText` writes `[due:: …]` instead of `#due:…` at the end of the composed text.
Quick Add's edit mode already reads `editingTask.dueDate`; nothing else in the widget changes.
`setDueTag` is renamed `setDueInLine` and works on the trailing field (it still strips a legacy
tag). `displayTaskText` strips a legacy `#due:` tag as today; fields are never in `text`.

#### 3.1.5 `.md` data files and the migration pass

**Resolution.** `domain/types.ts` keeps both names: `DATA_FILE_NAMES = {project: {current:
'project.md', legacy: 'project.txt'}, …}`. The cache rebuild/refresh stats both candidates per
folder in its one `statFiles` call and records the existing one as `CachedItem.dataFile`
(`.md` wins when both exist). `dataFilePath(kind, folder)` is replaced by
`itemDataFile(item)` for cached items and by `resolveDataFile(kind, folder)` (one stat call)
where no cache entry exists (`markStore`, `marks` from the lasso button, `createItem`).
`createItem` and the demo space always write `.md`. Archive scanners (`archiveScan`,
Integrity Check) accept both names; archived folders are never migrated.

**Until the migration ran**, gtdpara reads and writes each item in the file it found, so a
mixed state is safe. Old syntax keeps being read forever; new writes always use the new syntax,
so a line moves to the new form the next time its span is saved.

**The migration pass** (`storage/formatMigration.ts`, pure planning in
`domain/formatMigration.ts`):

1. After the first cache build in 0.10.0, if any live Project/Area/Inbox still has a `.txt`
   file, a **persistent status-slot notice** offers: "34 data files use the old format. Convert
   to .md (Obsidian-ready)? · Convert · Later". "Later" hides it for the session; the notice
   returns on the next start. Settings → Advanced gets a "Convert data files to .md" button for
   the same action.
2. Before running it shows the plan (count of renames, count of lines rewritten) as one
   confirmation, per `domain/fileChangeText.ts`.
3. Per file, as journaled operations (the `archiveOps`/`execute` pattern; journal in the private
   data folder, so an interrupted run resumes):
   1. `moveFile(<folder>/project.txt → <folder>/project.md)` (refused when `.md` exists: that
      file is reported, not touched);
   2. rewrite the Tasks span with the new syntax (`#waiting-for:x` → `#wf/x`, `#due:` →
      `[due:: ]`); meetings, goals, marks and frontmatter are not touched;
   3. read back and compare the parse result (same tasks, same states, same due dates) — a
      mismatch stops the run and reports the file.
4. The cache is rebuilt; the result is reported ("Converted 34 files. 1 skipped: both
   project.txt and project.md exist in <folder>").

No `created` date is invented for existing todos (age shows only where known; provenance gives
a date for agreed items).

**Integrity Check** gets one check: "both `.txt` and `.md` exist" (report only).

**Upgrade note**: data files become `.md`; nothing is lost; old syntax is still read; Obsidian
users can switch Tasks to the Dataview format.

#### 3.1.6 Raw view/edit of a data file

`screens/RawFileView.tsx`, opened from a "View file" action in `ui/ItemStatusPanel.tsx`
(Current) and from the Inbox tab's header row. It is a mode of the Current/Inbox screen (the
right pane is replaced), not a new tab.

- **View**: the whole file paginated with `domain/textPagination.ts`, page arrows, no scrolling.
- **Edit**: "Edit this page" turns the visible page's lines into one multiline input (inside the
  upper two thirds); Save splices those lines back into the file text, guarded by the 0.6
  "changed elsewhere" stamp check (`docs/dev/history/technical-design-files-0.6.md`), then writes through the
  cache (`updateItemRawContent`), which re-parses everything.
- Cancel discards. No syntax help, no highlighting.

#### 3.1.7 Rules that change

The design-overview and the development policy change in the same release:

- §3 "Identity is the folder… data files stay `.txt`" → data files are `.md`.
- §3 "One tag mechanism" becomes: *typed meanings are `#tags` (a new meaning is a new reserved
  word or a nested `type/…` form); data gtdpara records about an entry are trailing
  `[key:: value]` fields, parsed like links. Never a second syntax for the same meaning.*
- §2.2 file format section, the table of trailing tokens, and the example file.
- DEVELOPMENT-POLICY §3 names `project.md` / `area.md` / `Inbox.md`.

### 3.2 Thread model (domain, 0.11.0)

`domain/threads.ts`, pure:

```ts
export interface ThreadRef { type: string; counterpart: string; tag: string } // tag = "type/counterpart"
export function threadOf(tag: string): ThreadRef | null;          // null for tags without "/"
export function threadsOfTags(tags: string[]): ThreadRef[];       // de-duplicated, in order
export function belongsToThread(tags: string[], thread: ThreadRef): boolean;      // tag === thread.tag or startsWith(thread.tag + '/')
export function belongsToCounterpart(tags: string[], counterpart: string, types: string[]): boolean; // any "<type>/<cp>[/…]" for a known type, or the plain leaf
```

`isContextTag` stays as it is; thread tags are context tags (except `wf/…`).

**Owner and scope** (decision D9): the overview is always opened with an owner, the item of
the row whose tag was tapped (rows get an `ownerPath`; every list already knows its entries'
items), the Current page, or the Review roster entry. The Inbox owns its own entries.
`scopeOf(owner, items)` returns the owner's Area plus every Project assigned to it (`area:`
frontmatter); a Project without an Area, and the Inbox, are their own scope. Both lenses filter
to entries inside the scope. Only when no owner is known at all (a defensive fallback, not a
planned path) the owner is the item holding the latest meeting of the thread.
The counterpart lens uses the types used for that counterpart inside the scope plus the plain
leaf.

### 3.3 Aggregate (storage, 0.11.0)

`storage/threadAggregate.ts`, a pure synchronous transform over the warm cache plus the shared
Inbox (the `dailyAggregate.ts` posture, no file scans):

```ts
export interface ThreadOverview {
  lens: 'thread' | 'counterpart';
  thread: ThreadRef;
  owner: {kind: 'project' | 'area'; name: string; path: string} | null;
  types: string[];                         // counterpart lens: the owner's types for this counterpart
  ahead: {meetings: MeetingEntry[]; owe: TaskEntry[]; waiting: TaskEntry[]};
  past: PastMeeting[];                     // newest first
}
export interface PastMeeting {
  entry: MeetingEntry;                     // item ref + index + meeting (index against the full array)
  key: string;                             // provenance key
  agreed: TaskEntry[];                     // tasks whose fields.meeting === key
  counts: {agreed: number; done: number; open: number; oldestOpenDays: number | null};
}
export function buildThreadOverview(items, inbox, tag, lens, ownerPath, today): ThreadOverview;
```

- Everything below is limited to the scope of the owner (§3.2).
- Ahead meetings: not cancelled, end date ≥ today, matching the lens. Owe: open, not cancelled
  tasks matching the lens, flow state not Waiting For (Someday/Maybe included and labelled).
  Waiting: open Waiting For tasks (`#wf/<cp>`, or a thread/leaf tag plus bare `#wf`).
- Past: meetings that have ended, newest first; agreed items via provenance; age = today −
  (`created` ?? meeting date).
- Entries carry item refs and full-array indexes (the index-safety rule), so every row is
  editable through `mutateEntryTasks`/`mutateEntryMeetings`.

### 3.4 Provenance (0.11.0)

**Key.** `meetingKey(meeting) = meetingPageKeyword(meeting)` (`<date> <display title>`, the
same string shared note pages use). Written as `[meeting:: <key>]`.

**Resolution** (`resolveProvenance(task, items)`): exact key match among the meetings of the
task's own scope, then of all items; if none matches (the meeting was renamed), a match on date
plus a shared thread tag; else unresolved (shown as plain text "from <key>"). No cross-file
rewriting when a meeting is renamed.

**Who writes it** (always visible before saving, through Quick Add's provenance line):

| Place | Meeting | Adds tags |
|---|---|---|
| Review "Meetings to close out" Quick Add | the selected meeting | its thread tags |
| Overview Quick Add | the selected past meeting | its thread tags |
| Capture (lasso) and processing marks | the meeting whose note page the selection came from | its thread tags |

"Adds tags": the meeting's thread tags (`threadsOfTags(meeting.tags)`) not yet in the text are
appended. ✕ on the line drops both the field and the added tags for this one item.

**Capture source → meeting** (`storage/threadProvenance.ts`'s `meetingForNotePage(absPath,
page)`): own note (a meeting whose resolved `notePath` is that file), page link
(`<note>#page=N`), or shared page (read the page's keywords with `getKeyWords(absPath, [page])`,
match `meetingPageKeyword`). One device call at most, only when the capture screen opens.

**Quick Add API** (one new optional prop, create mode, Todo tab only):

```ts
provenance?: {label: string; onClear: () => void} | null;
```

renders one 34 dp line between the chips row and the actions row. The screen decides what to
write; the widget only shows the line. `onAddTask(text, destination)` is unchanged; the screen
appends tags and passes `{meeting: key}` to `buildTask`.

### 3.5 The overview (0.11.0)

#### 3.5.1 Navigation: an overlay, not a tab

The overview is drawn **over the tab content**, like the help overlay: the TabBar stays,
the screen behind stays mounted and unchanged, "‹ Back" or any tab tap closes it. This keeps
the architecture rule "a new persistent screen is a new tab; overlays leave the screen behind
as it is". §3 "Navigation and lifecycle" gets the thread overview added to the list of
overlays.

- `ui/threadOverlayStore.ts`: a tiny module store (`openThreadOverview({tag, ownerPath, lens?})`,
  `closeThreadOverview()`, `useThreadOverview()`), so rows anywhere can open it without prop
  plumbing.
- `App.tsx` renders `<ThreadOverview />` in the same place as `HelpOverlay`; `handleSelectTab`
  closes it; opening help closes it and vice versa.
- On close: `requestEinkRefresh()` (the screen behind reappears without a tap).
- Back label: "‹ <tab name>" of the tab underneath.

#### 3.5.2 Layout and budget (A5 X, 994 × 1325 dp; content height after TabBar ≈ 1226 dp)

| Part | Height (dp) |
|---|---|
| Header: Back, tag, owner, lens switch | 48 + 8 |
| **Left**: "Ahead" section, fixed `PagedSection` | 560 |
| — sub-heads Next meetings / I owe / Waiting for (30 each) | 90 |
| — meeting rows 37, todo rows 45+ (wrapping accounted) | ≈ 470 |
| gap | 18 |
| **Left**: "Looking back", `PagedSection` of 57 dp two-line rows | ≈ 590 (≈ 9 rows + header) |
| **Right**: Quick Add (+ 34 provenance line) | 210 |
| **Right**: selected meeting header (title, date, counts, "Open note") | 56 |
| **Right**: Open / Done lists, one `PagedSection` | rest ≈ 900 |

"Ahead" is one paged list with sub-head rows (meetings first, then I owe, then Waiting for),
so it never clips; when everything fits, no pager shows.

#### 3.5.3 Components

- `screens/thread/ThreadOverview.tsx`: the overlay frame, data (`useCachedItems`,
  `useCachedInbox`, `buildThreadOverview`), selection, `useEditTarget`, Quick Add.
- `screens/thread/AheadSection.tsx`, `screens/thread/LookingBackSection.tsx`,
  `screens/thread/PastMeetingPanel.tsx`: rows are `TaskRow` / `MeetingRow` with the normal
  actions (note, file, tracking).
- Edits and done toggles go through `mutateEntryTasks`/`mutateEntryMeetings` and the new
  `withTaskDone`, exactly as Daily does.
- Quick Add's `fixedDestination`: the selected past meeting's item while the provenance line is
  on; otherwise the owner (Inbox when there is none).

### 3.6 "+ Next <type>" (0.11.0)

`domain/nextMeeting.ts`:

```ts
export function nextMeetingSeed(threadMeetings: Meeting[], today: string): MeetingInput | null;
```

- base = the latest meeting of the thread (future ones included, so "+ Next" always goes past
  the last planned one); `null` when there is none;
- interval = days between the two latest meetings; one meeting only → 7 days;
- date = base date + interval, stepped forward by the interval until ≥ today;
- title = `meetingDisplayTitle(base)` (no `#prepped`, `#reviewed`, `#monthly`), time, end time,
  days copied; note and linked file are not.

Quick Add gets `meetingSeed?: {fields: MeetingInput; nonce: number} | null`: switches to the
Meeting tab and replaces the meeting draft (the same code path "New from this" uses). The
destination is the base meeting's item. Offered in the overview's Ahead header (thread lens:
"+ Next retro"; counterpart lens: one per type), in the Review panel and on Threads tab rows.

### 3.7 Tap routing (0.11.0)

The two copies of `renderTaggableText` become one `ui/TaggableText.tsx`:

- a tag with `/` that is a context tag → always tappable, opens the overview (thread lens) with
  the row's item as owner (`TaskRow`/`MeetingRow` get an `ownerPath` prop; lists pass their
  entry's item path, Inbox lists the Inbox folder);
- a plain context tag → tappable only when the screen passes `onToggleContext` (Daily's filter,
  unchanged);
- `#w/f Name` labels (`ui/TaskLabels.tsx`) open the overview for `wf/<name>`;
- Daily's filter stays a toggle on plain tags only. A nested tag on Daily no longer filters
  (decided).

### 3.8 `{tag}` in shared file names (0.11.0)

`renderSharedFileName` gets `{tag}`: the rule tag the item matched (`ruleTypeTag(itemTags,
ruleTags)` next to `ruleSubtag`). One rule for `sparring` and `retro`, file name
`{tag} {subtag} {year}` → `sparring max 2026.note`, `retro alpha 2026.note`. The Tag Rule
editor offers `{tag}` as a tappable placeholder like the others.

### 3.9 Counterparts in the files (0.12.0)

#### 3.9.1 `## Threads` section

```
## Threads
- client-a: active
- client-b: inactive
```

- One line per counterpart: `- <leaf>: active|inactive`, lowercase. Room for later columns
  after a comma (`- client-a: active, ~3w`), ignored until a feature reads them.
- Parsed by `domain/threadsSection.ts` (`parseThreadsSpan` / `writeThreadsIntoContent`,
  span-scoped, unknown lines kept). `CachedItem.threads` / `threadsExtraLines`, write-through
  `updateItemThreads` in `storage/dataCache.ts`.
- Writes only through `storage/counterparts.ts`: `setCounterpartStatus(itemPath, leaf,
  status)`.

#### 3.9.2 Which counterparts exist

`counterpartsOf(item, ruleTypes)` (pure): every counterpart of a nested tag whose type is in
`ruleTypes` (Tag Rule tags plus `wf`) in the item's tasks and meetings (not cancelled, done included), plus every line of its `## Threads` section. Each
gets `status: 'active' | 'inactive' | 'new'` (new = in use, no line yet) and its types.

**Decision D2 (decided):** only nested tags whose type is a Tag Rule tag (any enabled rule, any context) or `wf` make counterparts. Other nested tags (`#tax/2026`) stay plain context tags: no confirmation, no Threads line. They still open the overview when tapped (thread lens only).

**Decision D3 (decided):** "reactivate on reuse" is asked where counterparts are tended, not
while saving: an inactive counterpart that gets a new future meeting appears in Review's and the
Threads tab's New block as "back in use: client-b · Tend / Not". This avoids a prompt after
every save on six screens.

#### 3.9.3 Close-out when setting inactive

`ui/CounterpartCloseOut.tsx` (used by Review and the Threads tab): lists the counterpart's open
todos and Waiting Fors in this owner file (`buildThreadOverview` counterpart lens, filtered to the
owner) with Done / Cancel / Keep per item (Keep is the default). "Set inactive" applies them
through `storage/itemMove.ts`'s `closeTask` (extended to use `withTaskDone`), then writes the
status line. No open items → a single confirmation.

#### 3.9.4 Threads tab on the Current page

- `FileBrowserPane` gets `extraTabs?: {key: string; label: string; render: (viewportHeight:
  number) => React.ReactNode}[]`, shown after the roots in the same MiniTabs row. Arming never
  switches to an extra tab; an arm that starts while one is shown switches to its root as today.
- **Browse merges into "Project Files"** (decision D4, decided): the Browse root object is no
  longer a fifth tab. While an arm targets Browse (refile, assign Area) the Project Files slot
  shows Browse with the label "Browse" and switches back when the arm ends. While link-arming,
  the top of the Project Files list shows a row "Other Projects/Areas ›" that opens Browse in
  the same slot. Outside arming, Browse is not offered (opening another item works from the
  Projects/Areas tabs).
- `screens/thread/ThreadsTab.tsx` (in the Files area's viewport, paged with `PagedSection`):
  New (Tend / Not), Active (row: leaf, "last · next", "n open · w/f nd"; ▾ expands threads with
  next date and "+ next"; › opens the counterpart overview), Inactive (folded, one row "n
  inactive ▸").
- Tapping a counterpart sets a filter in `ItemDetail` that `ProjectDataPanel` receives as
  `counterpartFilter?: {leaf: string; types: string[]} | null`: Todos and Meetings show only
  matching entries (indexes computed against the full arrays first), with a "<leaf> ✕" pill
  above Quick Add. The filter is view state only.

### 3.10 Review step "Tending threads" (0.12.0)

- `domain/reviewSteps.ts`: `{id: 'tendingThreads', title: 'Tending threads', kind: 'ritual'}`,
  placed after "Meetings to close out". Count = new + active counterparts.
- `storage/threadAggregate.ts`'s `buildTendingRoster(items, inbox, today)`: per Project/Area
  (Active and On Hold), its new and active counterparts with signals: last meeting date, next
  meeting date or none, open I-owe count, oldest Waiting For age. No sorting by urgency: groups in
  the Projects/Areas order, counterparts alphabetically.
- `screens/review/steps/TendingThreadsStep.tsx` with `ReviewMasterDetail`: left the roster
  (frozen list as in other steps; New block on top), right `screens/thread/ThreadSummary.tsx`
  (next meetings or "+ Next <type>", I owe, Waiting for, the last 3 past meetings, "Open
  overview ›", "Set inactive"). "Open overview" opens the overlay over Review; Back returns to the
  step as it was.
- Recap counts: confirmed, set inactive, next meetings added.

### 3.11 "Since last time" note piece (0.12.0)

- New `PieceType` `'sinceLast'`, meeting context only, default off.
- `storage/threadAggregate.ts`'s `buildSinceLast(meeting, items, inbox)`: thread = the
  meeting's first thread tag; previous = the latest meeting of that thread before this one.
  Returns, for "For this <type>": done since (completion ≥ previous date, thread match or agreed
  in previous), still open from previous (provenance), open Waiting For of the counterpart; for
  "Also open with <counterpart>": open items of the counterpart's other threads and the plain
  leaf.
- `renderPieceText` formats it as in the UX draft; at most **6 lines per block**, then
  "… +N more" (decision D10, decided). Empty blocks are omitted; no previous meeting → the
  piece renders nothing.
- It is written when the note is created and on re-population until the meeting is over (the
  existing freeze rule), never afterwards.

## 4. Decisions to confirm

| # | Decision | Proposal |
|---|---|---|
| D1 | Overview as an overlay over the tab content | **decided:** yes, for a start (§3.5.1) |
| D2 | Which nested tags make counterparts | **decided:** Tag Rule types plus `wf` (§3.9.2) |
| D3 | Reactivation | **decided:** asked in Review/Threads tab, not at save (§3.9.2) |
| D4 | Browse merge | **decided:** Browse replaces Project Files while arming; "Other Projects/Areas ›" during link-arming (§3.9.4) |
| D5 | Migration | **decided:** confirmed pass, journaled; mixed state readable meanwhile; Archive stays `.txt` (§3.1.5) |
| D6 | Raw edit | **decided:** view paginated, edit one page of lines at a time; entry in the status panel and Inbox header (§3.1.6) |
| D7 | Release split | **decided:** 0.10.0 / 0.11.0 / 0.12.0 as in the table above |
| D8 | Created/completion dates | **decided:** from 0.10.0 on, never invented for existing todos |
| D9 | Owner and scope | **decided:** owner = item of the tapped row (Inbox included, no exception); scope = its Area plus the Area's Projects; both lenses scoped (§1.3, §3.2) |
| D10 | "Since last time" length | **decided:** 6 lines per block, then "… +N more" |
| D11 | Renamed meetings | **decided:** provenance falls back to date + shared thread tag; no rewriting of other files (§3.4) |

## 5. Files

### 0.10.0

- New: `domain/taskEdit.ts`, `domain/formatMigration.ts`, `storage/formatMigration.ts`,
  `screens/RawFileView.tsx`; tests `__tests__/domain/taskLine.test.ts`,
  `taskEdit.test.ts`, `formatMigration.test.ts`, `flowStateWf.test.ts`.
- Changed: `domain/types.ts` (TaskFields, file names), `domain/markdown.ts` (fields parse/write,
  `setDueInLine`), `domain/flowState.ts` (wf), `domain/taskLabels.ts`, `domain/quickAddCompose.ts`,
  `domain/abbrev.ts` (reserved `wf`), `domain/integrityCheck.ts`, `domain/closeOut/archiveScan.ts`,
  `domain/demoSpace.ts`, `storage/projectFile.ts`, `storage/dataCache.ts` (`dataFile`, double
  stat), `storage/itemMutations.ts` (`applyTaskEdit`, `buildTask` created), `storage/itemMove.ts`,
  `storage/createItem.ts`, `storage/markStore.ts`, `storage/marks.ts`, `screens/DailyView.tsx`,
  `screens/InboxScreen.tsx`, `screens/ProjectDataPanel.tsx`, `screens/review/steps/ItemListStep.tsx`,
  `ui/ItemStatusPanel.tsx`, `screens/settings/AdvancedTab.tsx`, `scripts/code-health.mjs`
  (`deriveTaskFields` outside domain).
- Docs: design-overview §2.2/§3, DEVELOPMENT-POLICY §3, `docs/user` pages on todos/Waiting
  For/Obsidian, CHANGELOG (Changed + Upgrade note), README (Obsidian line).

### 0.11.0

- New: `domain/threads.ts`, `domain/nextMeeting.ts`, `storage/threadAggregate.ts`,
  `storage/threadProvenance.ts`, `ui/threadOverlayStore.ts`, `ui/TaggableText.tsx`,
  `screens/thread/ThreadOverview.tsx`, `AheadSection.tsx`, `LookingBackSection.tsx`,
  `PastMeetingPanel.tsx`; tests for threads, nextMeeting, threadAggregate, provenance.
- Changed: `App.tsx` (overlay), `ui/TaskRow.tsx`, `ui/MeetingRow.tsx`, `ui/TaskLabels.tsx`,
  `ui/QuickAddWidget.tsx` (`provenance`, `meetingSeed`), `screens/review/steps/MeetingsCloseOutStep.tsx`,
  `screens/CaptureScreen.tsx`, `domain/sharedNotePages.ts` (`{tag}`), `domain/tagRules.ts`
  (`ruleTypeTag`), Tag Rule editor placeholder chips.
- Docs: new help page "Threads", design-overview §2.1 (overlay), §2.4, §2.6, CHANGELOG.

### 0.12.0

- New: `domain/threadsSection.ts`, `storage/counterparts.ts`, `screens/thread/ThreadsTab.tsx`,
  `screens/thread/ThreadSummary.tsx`, `ui/CounterpartCloseOut.tsx`,
  `screens/review/steps/TendingThreadsStep.tsx`; tests for the section, roster, sinceLast.
- Changed: `storage/projectFile.ts`, `storage/dataCache.ts` (`threads`), `ui/FileBrowserPane.tsx`
  (`extraTabs`, Browse merge), `screens/ItemDetail.tsx`, `screens/ProjectDataPanel.tsx`
  (`counterpartFilter`), `domain/reviewSteps.ts`, `screens/review/ReviewScreen.tsx`,
  `domain/tagRules.ts` (`sinceLast` piece), `storage/meetingNoteContent.ts`,
  `storage/tagUsage.ts`/`ui/TagChips.tsx` (inactive counterparts hidden), `storage/debugBundle.ts`
  (counterpart counts).
- Docs: help pages Review, Current page, Tag Rules; design-overview §2.5/§2.6/§2.8; CHANGELOG.

All new files stay under 1,000 lines; `QuickAddWidget.tsx` and `DailyView.tsx` are in the
code-health baseline and must not grow: the provenance line and seed logic go into a small
`ui/quickAdd/ProvenanceLine.tsx` and a hook.

## 6. Test plan

### Automated (`npm run check`, every slice)

- **Round trips**: every task line form (legacy `#due:`, `#waiting-for:x`, new fields, unknown
  fields, links + fields, cancelled) parses and writes back byte-identical when unchanged; new
  writes use the new order.
- **Migration**: planner on sample files (both extensions present, Inbox, mixed syntax);
  conversion keeps every parsed task equal except syntax.
- `withTaskText` keeps `fields`; `withTaskDone` sets/clears completion; `applyTaskEdit` keeps
  created/meeting.
- `wf`: derive, set, strip, labels, `isContextTag`, abbreviation refusal.
- Threads: `threadOf`, matching (leaf, nested, deeper nesting, no parent reach-down), owner.
- `nextMeetingSeed`: two meetings, one meeting, base in the future, stepping past today,
  multi-day meetings.
- Aggregates: overview lists, counts, ages; roster signals; sinceLast blocks and limits.
- Provenance resolution: exact, renamed (fallback), unresolved.
- Smoke render: App with the overlay open; ThreadsTab; TendingThreadsStep.

### On the device (checklist per release)

- **T0 (before 0.10 slice 2)**: in Obsidian with Tasks set to Dataview format, a line
  `- [ ] x #wf/a → [[n.note]] [meeting:: 2026-10-01 Retro] [created:: 2026-10-01] [due:: 2026-10-09]`
  shows due and created in Tasks queries. If not, change the field order before continuing.
- 0.10.0: install over 0.9; notice appears; convert in the demo space; files are `.md`; Cloud
  Sync shows them in Obsidian; add/edit/done/due/Waiting For work; raw view pages; raw edit of a
  page saves; edit the same file in Obsidian meanwhile → "changed elsewhere" message.
- 0.11.0: tap a nested tag in Daily, Current, Week day panel, Review → overlay; Back and tab tap
  close it; edit a todo in the overlay; close-out Quick Add shows the provenance line and writes
  the field; capture from a meeting note page gets provenance; "+ Next" in the overlay; `{tag}`
  file names.
- 0.12.0: New counterpart → Tend writes the line; Not writes inactive; Threads tab filter and ✕;
  Browse while refiling and linking; Review step with roster, summary, "Open overview" and back;
  set inactive with open items; "Since last time" on a new meeting note.

## 7. Open points

- Whether the Tasks plugin accepts our field order (T0). If not, `meeting` moves after the Tasks
  fields or becomes a tag-free text marker; the rest of the design is unaffected.
- How Supernote Cloud Sync handles the rename (`.txt` deleted + `.md` created in the vault, or a
  leftover `.txt`). Tested in the demo space before converting real data; the release notes say
  what to expect.
- Rhythm/cadence per counterpart (later; the `## Threads` line format leaves room).
- Tag renames once history accumulates (later).
