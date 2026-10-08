# Technical design: Tending threads (and the file format it needs)

Status: **design approved (all decisions in §4).** Requirements were clarified in conversation (October
2026); the UX draft is a design canvas outside the repository. 0.10.0 is implemented on
`feature/plain-files` (steps 1–3 of §3.1, As built §8); 0.11.0 on `feature/threads` (As built §9);
0.12.0 is not started.

**Revision (device test of 0.10.0):** the data files stay `.txt`. Supernote Cloud accepts `.md`
files uploaded by the device and lets Obsidian download them, but refuses `.md` uploads from
anywhere else ("This file cannot be uploaded"), so edits made in Obsidian could never reach the
device. The `.md` switch, the conversion pass and the raw view/edit were built, tested in the demo
space and removed again; §3.1.5 records what was learned.

**Revision (review of 0.11.0 before its device test, decisions D12–D15):** a todo relates to a
thread in up to three ways, each with its own source. *Agreed in* comes from provenance
(`[meeting:: …]`) and makes **I owe**; *Waiting for* comes from `#wf/<counterpart>` or from bare
`#wf` on an agreed todo; *Relevant* comes from the thread tag or the plain leaf. Provenance
therefore no longer adds the meeting's thread tags to a todo: where a todo was agreed and where
it is to be acted on are different facts (agreed in the 1:1 with Mieke, to be raised in the 1:1
with Sven). `#owe/<counterpart>` records a promise made outside a meeting. Looking back gets a
"Since <date>" row for todos done since the latest past meeting. §1.2, §1.4, §1.5, §3.2–§3.4,
§3.5.2, §3.7, §3.9.2, §3.10, §3.11 and §6 are updated; §9 records what was built before this
revision.

This document covers one feature delivered in three releases:

| Release | Name | Content |
|---|---|---|
| 0.10.0 | Plain syntax | Obsidian-compatible syntax in the existing `.txt` files (`#wf/…`, `[due:: …]`, `[created:: …]`, `[completion:: …]`); every todo change through shared helpers |
| 0.11.0 | Threads | provenance (`[meeting:: …]`), the thread overview, tap rules for nested tags, "+ Next" meeting, `{tag}` in shared file names |
| 0.12.0 | Tending | `## Threads` section, Threads tab on the Current page, Review step "Tending threads", close-out when a counterpart goes inactive, "Since last time" note piece |

Each release is useful on its own and ships separately. 0.10.0 comes first because 0.11.0 and
0.12.0 build on its fields.

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
- `#owe/alpha` is a promise to counterpart `alpha` made outside a meeting (decision D13);
- a plain parent tag (`#retro`) does **not** reach down into every retro thread;
- deeper nesting (`#coaching/client-a/2026`) belongs to thread `coaching/client-a`.

#### 1.2.1 How a todo relates to a thread (decision D12)

A todo can relate to a thread in three ways. Each has its own source, and each source means one
thing only:

| Relation | Source | Overview section |
|---|---|---|
| **Agreed in** the thread: a commitment made there | `[meeting:: …]` resolves to a meeting of the thread | **I owe** |
| **Promised** to the counterpart outside a meeting | `#owe/<counterpart>` | **I owe** |
| **Waiting for** the counterpart | `#wf/<counterpart>`; or bare `#wf` on a todo agreed in the thread; or bare `#wf` plus the thread tag or plain leaf | **Waiting for** |
| **Relevant** for the thread: to be raised or acted on there | the thread tag (`#101/sven`) or the plain leaf (`#sven`) | **Relevant** |

- Precedence: Waiting for, then I owe, then Relevant. A todo shows once, in the first section
  that applies (agreed in the retro *and* tagged `#retro/alpha` is I owe).
- Example: agreed in the 1:1 with Mieke to raise something with Sven. The line is
  `- [ ] Raise budget question #101/sven [meeting:: 2026-09-30 1:1 Mieke 101/mieke]`. Mieke's
  thread shows it under I owe and under her meeting of 30.9. in Looking back; Sven's thread
  shows it under Relevant.
- Provenance never writes tags; tags are only ever set by the user.
- Todos from before 0.11.0 carry no provenance and appear only through their tags (Relevant,
  Waiting for) until the user adds `#owe/<counterpart>`.

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
- Promise outside a meeting: `#owe/<counterpart>` (from 0.11.0). Not a flow state: an owed todo
  is still my own action and combines with `#next`, a due date and so on. A bare `#owe` has no
  meaning and stays a plain tag.
- Due: `[due:: YYYY-MM-DD]` (was `#due:YYYY-MM-DD`).
- Created: `[created:: YYYY-MM-DD]` on **every new todo**.
- Done: `[completion:: YYYY-MM-DD]` when a todo is checked.
- Provenance: `[meeting:: YYYY-MM-DD <title>]` (§3.4); it records where a todo was agreed and
  adds no tags.
- Data files stay `project.txt`, `area.txt`, `Inbox.txt` (see the revision note at the top and
  §3.1.5). Old lines are not converted: every old form keeps being read, and a line gets the new
  syntax the next time gtdpara writes its span. Obsidian's Tasks and Dataview only index `.md`, so
  they read these fields once something on the Obsidian side presents the files as Markdown;
  that is outside gtdpara.

### 1.5 UX (decided; see the UX draft)

- Tapping a **nested** tag opens the overview in the thread lens. A **plain** tag keeps Daily's
  context filter. The overview has no "filter Daily" button.
- Overview: left column "Ahead" (next meetings with "+ Next <type>", I owe, Waiting for,
  Relevant; §1.2.1) above "Looking back" (on top a "Since <date>" row for todos done since the
  latest past meeting, then one row per past meeting: agreed / done / open). Right column: Quick
  Add, then the selected row's todos (a meeting: its agreed todos, open then done; the "Since"
  row: the done todos) and, for a meeting, "Open note". Default selection: the latest past
  meeting. A lens switch: thread | all of the counterpart.
- Quick Add shows **one** grey line when gtdpara links a new todo to a meeting in the
  background: `↳ from Retro alpha · Tue 30.9.`, with ✕ to drop the link. Nothing else is
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

#### 3.1.5 Rejected: `.md` data files, conversion pass, raw view/edit

Built on `feature/plain-files` (commits `decb612` … `e9a8013`, kept on a local backup branch) and
removed before release, because of what the demo-space test with Supernote Cloud Sync showed:

| Direction | `.txt` | `.md` |
|---|---|---|
| device → Supernote Cloud | works | works |
| Supernote Cloud → Obsidian vault (download) | works | works |
| Obsidian vault → Supernote Cloud (upload) | works | refused: "This file cannot be uploaded" |

The Supernote Cloud web upload refuses `.md` the same way. With `.md` data files every change
made in Obsidian would stay in the vault, which defeats the reason for the switch. Learned on
the way, useful for later work:

- The Cloud Sync plugin's mirrored folders are one-way (cloud → vault); only its single Paired
  folder syncs both ways and stops completely when either inventory is incomplete. Editing
  gtdpara files from Obsidian works only inside the Paired folder (help page).
- A save must keep writing to the file it was read from (the per-folder memory the
  implementation used), should a second data file name ever come back.
- A conversion should rewrite only the lines it changes, in place, rather than re-saving the
  whole span (blank lines, unknown-line positions).

Making Obsidian treat `project.txt` as Markdown (for example an extension mapping in the sync
plugin) is outside gtdpara.

#### 3.1.7 Rules that change

The design-overview and the development policy change in the same release:

- §3 "One tag mechanism" becomes: *typed meanings are `#tags` (a new meaning is a new reserved
  word or a nested `type/…` form); data gtdpara records about an entry are trailing
  `[key:: value]` fields, parsed like links. Never a second syntax for the same meaning.*
- §2.2 file format section, the table of trailing tokens, and the example file.

### 3.2 Thread model (domain, 0.11.0)

`domain/threads.ts`, pure:

```ts
export interface ThreadRef { type: string; counterpart: string; tag: string } // tag = "type/counterpart"
export function threadOf(tag: string): ThreadRef | null;          // null for tags without "/"
export function threadsOfTags(tags: string[]): ThreadRef[];       // de-duplicated, in order
export function belongsToThread(tags: string[], thread: ThreadRef): boolean;      // tag === thread.tag or startsWith(thread.tag + '/')
export function belongsToCounterpart(tags: string[], counterpart: string, types: string[]): boolean; // any "<type>/<cp>[/…]" for a known type, or the plain leaf
```

`isContextTag` stays as it is; thread tags are context tags (except `wf/…`). `owe` is a reserved
type like `wf`: `OWE` can't be an abbreviation, and `owe/<cp>` tags never make a thread of their
own (they are never offered for "+ Next" and have no thread lens; §3.7).

**Owner and scope** (decision D9): the overview is always opened with an owner, the item of
the row whose tag was tapped (rows get an `ownerPath`; every list already knows its entries'
items), the Current page, or the Review roster entry. The Inbox owns its own entries.
`scopeOf(owner, items)` returns the owner's Area plus every Project assigned to it (`area:`
frontmatter); a Project without an Area, and the Inbox, are their own scope. Both lenses filter
to entries inside the scope. Only when no owner is known at all (a defensive fallback, not a
planned path) the owner is the item holding the latest meeting of the thread.
The counterpart lens uses the types used for that counterpart inside the scope plus the plain
leaf.

Scope applies to where a todo is filed, for all sections (decision D15): an agreed todo filed in
the Inbox does not appear in its meeting's thread until it is filed into the scope. Close-out,
the overview's Quick Add and capture already file into the meeting's own Project/Area, so this
only affects todos the user sends to the Inbox.

### 3.3 Aggregate (storage, 0.11.0)

`storage/threadAggregate.ts`, a pure synchronous transform over the warm cache plus the shared
Inbox (the `dailyAggregate.ts` posture, no file scans):

```ts
export interface ThreadOverview {
  lens: 'thread' | 'counterpart';
  thread: ThreadRef;
  owner: {kind: 'project' | 'area'; name: string; path: string} | null;
  types: string[];                         // counterpart lens: the owner's types for this counterpart
  ahead: {meetings: MeetingEntry[]; owe: TaskEntry[]; waiting: TaskEntry[]; relevant: TaskEntry[]};
  since: {from: string | null; done: TaskEntry[]};  // from = latest past meeting's date
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

- Everything below is limited to the scope of the owner (§3.2), by where the todo is filed.
- Ahead meetings: not cancelled, not ended, carrying the thread tag (thread lens) or a thread of
  the counterpart or the plain leaf (counterpart lens). Unchanged by D12.
- Todos (open, not cancelled) are classified once, in this order (§1.2.1):
  1. **waiting**: flow state Waiting For and (`#wf/<cp>` for the lens's counterpart, or agreed
     in a meeting of the lens, or the thread tag / a thread of the counterpart / the plain leaf);
  2. **owe**: agreed in a meeting of the lens (provenance resolves, §3.4), or `#owe/<cp>` for the
     lens's counterpart; Someday/Maybe included and labelled;
  3. **relevant**: the thread tag (thread lens), a thread of the counterpart (counterpart lens),
     or the plain leaf.
  "A meeting of the lens" is a meeting with the thread tag (thread lens) or with any thread of
  the counterpart (counterpart lens), anywhere in the scope, past or ahead.
- **since**: done todos with `fields.completion` ≥ `from` that belong to the lens in any of the
  three ways (relevant included). `from` = the date of the latest past meeting; no past meeting
  → `from: null` and no row. Only todos ticked from 0.10.0 on have a completion date; others
  never appear here.
- Past: meetings that have ended, newest first; agreed items via provenance; age = today −
  (`created` ?? meeting date).
- Entries carry item refs and full-array indexes (the index-safety rule), so every row is
  editable through `mutateEntryTasks`/`mutateEntryMeetings`.

### 3.4 Provenance (0.11.0)

**Key.** `meetingKey(meeting) = meetingPageKeyword(meeting)` (`<date> <display title>`, the
same string shared note pages use) without `#`, `[` and `]`: Obsidian reads a `#tag` inside an
inline field as a tag of the task. The tag text stays, so two meetings with the same title on one
day but different thread tags keep different keys (`2026-10-08 1:1 Mieke mh 101/mieke`). Written
as `[meeting:: <key>]`; a stored key is normalized the same way before matching.

**Resolution** (`resolveProvenance(task, items)`): exact key match among the meetings of the
task's own scope, then of all items; if none matches (the meeting was renamed), a meeting on the
key's date whose thread tags (without `#`) appear as words in the key (decision D14; the todo's
own tags are not consulted, since provenance no longer adds them); else unresolved (shown as
plain text "from <key>"). No cross-file rewriting when a meeting is renamed.

**Who writes it** (always visible before saving, through Quick Add's provenance line):

| Place | Meeting |
|---|---|
| Review "Meetings to close out" Quick Add | the selected meeting |
| Overview Quick Add | the selected past meeting |
| Capture (lasso) and processing marks | the meeting whose note page the selection came from |

Only `[meeting:: key]` is written; no tags are added (D12). ✕ on the line drops the link for
this one todo. The user adds a thread tag or `#owe/…` by typing it, as anywhere else.

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
sets `[meeting:: key]` on the composed line (`applyProvenance`) and hands it to the add path.

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
| — sub-heads Next meetings / I owe / Waiting for / Relevant (30 each, empty ones left out) | ≤ 120 |
| — meeting rows 37, todo rows 45+ (wrapping accounted) | ≈ 440 |
| gap | 18 |
| **Left**: "Looking back", `PagedSection` of 57 dp two-line rows, the "Since <date> · n done" row first | ≈ 590 (≈ 9 rows + header) |
| **Right**: Quick Add (+ 34 provenance line) | 210 |
| **Right**: selected meeting header (title, date, counts, "Open note") | 56 |
| **Right**: Open / Done lists, one `PagedSection` | rest ≈ 900 |

"Ahead" is one paged list with sub-head rows (meetings first, then I owe, then Waiting for,
then Relevant), so it never clips; when everything fits, no pager shows. An empty section shows
no sub-head. Selecting the "Since" row shows its done todos in the right column (grouped by done
date, as the meeting panel does) with no "Open note" and no provenance line in Quick Add.

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
- `#w/f Name` labels (`ui/TaskLabels.tsx`) and `#owe/<name>` tags open the overview in the
  **counterpart lens** for `<name>` (decision D13): these tags name a counterpart, not a thread.
  The `wf/<name>` thread lens from the first 0.11.0 build goes away;
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
`ruleTypes` (Tag Rule tags plus `wf` and `owe`) in the item's tasks and meetings (not cancelled, done included), plus every line of its `## Threads` section. Each
gets `status: 'active' | 'inactive' | 'new'` (new = in use, no line yet) and its types.

**Decision D2 (decided, extended by D13):** only nested tags whose type is a Tag Rule tag (any enabled rule, any context), `wf` or `owe` make counterparts. Other nested tags (`#tax/2026`) stay plain context tags: no confirmation, no Threads line. They still open the overview when tapped (thread lens only).

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
  meeting date or none, open I-owe count (§1.2.1: agreed or `#owe`), oldest Waiting For age. No sorting by urgency: groups in
  the Projects/Areas order, counterparts alphabetically.
- `screens/review/steps/TendingThreadsStep.tsx` with `ReviewMasterDetail`: left the roster
  (frozen list as in other steps; New block on top), right `screens/thread/ThreadSummary.tsx`
  (next meetings or "+ Next <type>", I owe, Waiting for, Relevant, the last 3 past meetings,
  "Open overview ›", "Set inactive"). "Open overview" opens the overlay over Review; Back returns to the
  step as it was.
- Recap counts: confirmed, set inactive, next meetings added.

### 3.11 "Since last time" note piece (0.12.0)

- New `PieceType` `'sinceLast'`, meeting context only, default off.
- `storage/threadAggregate.ts`'s `buildSinceLast(meeting, items, inbox)`: a printed snapshot of
  the overview (§3.3) for the meeting's first thread tag, thread lens, owner = the meeting's
  item, as of the moment the note is written. Blocks: "Agreed last time" (todos agreed in the
  previous meeting of the thread, open first, then done), "I owe" (other open I-owe todos),
  "Waiting for", "Relevant", "Done since <date>". Previous = the latest meeting of the thread
  before this one.
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
| D5 | Migration | **withdrawn:** data files stay `.txt`, no conversion pass (§3.1.5) |
| D6 | Raw edit | **withdrawn:** not needed while the files stay `.txt` (§3.1.5) |
| D7 | Release split | **decided:** 0.10.0 / 0.11.0 / 0.12.0 as in the table above |
| D8 | Created/completion dates | **decided:** from 0.10.0 on, never invented for existing todos |
| D9 | Owner and scope | **decided:** owner = item of the tapped row (Inbox included, no exception); scope = its Area plus the Area's Projects; both lenses scoped (§1.3, §3.2) |
| D10 | "Since last time" length | **decided:** 6 lines per block, then "… +N more" |
| D11 | Renamed meetings | **decided:** provenance falls back to date + thread tags; no rewriting of other files (§3.4); refined by D14 |
| D12 | What provenance and tags mean | **decided:** `[meeting::]` = agreed in (→ I owe, with bare `#wf` → Waiting for); thread tag / leaf = relevant; provenance adds no tags; precedence Waiting for > I owe > Relevant (§1.2.1, §3.3) |
| D13 | Promises outside meetings | **decided:** `#owe/<counterpart>` → I owe; reserved like `wf`; `#wf/x` and `#owe/x` open the counterpart lens (§1.4, §3.2, §3.7) |
| D14 | Renamed-meeting fallback | **decided:** date + the meeting's thread tags found in the key, not the todo's tags (§3.4) |
| D15 | Scope of agreed todos | **decided:** by where the todo is filed, like everything else; an agreed todo in the Inbox shows once it is filed (§3.2) |

## 5. Files

### 0.10.0

- New: `domain/taskEdit.ts`; tests for the task line, task helpers and `#wf`.
- Changed: `domain/types.ts` (TaskFields), `domain/markdown.ts` (fields parse/write,
  `setDueInLine`), `domain/flowState.ts` (wf), `domain/taskLabels.ts`, `domain/quickAddCompose.ts`,
  `domain/abbrev.ts` (reserved `wf`), `storage/itemMutations.ts` (`applyTaskEdit`, `buildTask`
  created), `storage/itemMove.ts`, `screens/DailyView.tsx`, `screens/InboxScreen.tsx`,
  `screens/ProjectDataPanel.tsx`, `screens/review/steps/ItemListStep.tsx`,
  `scripts/code-health.mjs` (`deriveTaskFields` outside domain).
- Docs: design-overview §2.2/§3 (field rule), `docs/user` pages on todos and Waiting For, a short
  Obsidian note, CHANGELOG (Changed + Upgrade note).

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
- `withTaskText` keeps `fields`; `withTaskDone` sets/clears completion; `applyTaskEdit` keeps
  created/meeting.
- `wf`: derive, set, strip, labels, `isContextTag`, abbreviation refusal.
- Threads: `threadOf`, matching (leaf, nested, deeper nesting, no parent reach-down), owner.
- `nextMeetingSeed`: two meetings, one meeting, base in the future, stepping past today,
  multi-day meetings.
- Aggregates: overview lists, counts, ages; roster signals; sinceLast blocks and limits.
- Provenance resolution: exact, renamed (fallback via the key's thread tags), unresolved;
  applyProvenance adds no tags.
- Classification (§1.2.1): agreed only → I owe; `#owe/cp` only → I owe; tag only → Relevant;
  agreed + same thread tag → I owe once; agreed in Mieke's thread + `#101/sven` → I owe for Mieke,
  Relevant for Sven; `#wf/cp` → Waiting for; bare `#wf` + agreed → Waiting for; counterpart lens
  collects all threads of the counterpart; "Since" row (completion ≥ latest past meeting, none
  before 0.10 data, no row without a past meeting).
- Smoke render: App with the overlay open; ThreadsTab; TendingThreadsStep.

### On the device (checklist per release)

- **T0 (before 0.10 slice 2)**: in Obsidian with Tasks set to Dataview format, a line
  `- [ ] x #wf/a → [[n.note]] [meeting:: 2026-10-01 Retro] [created:: 2026-10-01] [due:: 2026-10-09]`
  shows due and created in Tasks queries. If not, change the field order before continuing.
- 0.10.0: install over 0.9; old lines show as before (due labels, `#w/f Name`); a new todo
  ends in `[created:: …]`; done adds `[completion:: …]`, undone removes it; setting a due date
  writes `[due:: …]` and removes an old `#due:` tag; Waiting For with a name writes `#wf/name`;
  editing a todo keeps its created date; Daily, Inbox, Current, Week, Month and Review show the
  same todos as in 0.9; a `.txt` edited in Obsidian's Paired folder still syncs to the device.
- 0.11.0: tap a nested tag in Daily, Current, Week day panel, Review → overlay; Back and tab tap
  close it; edit a todo in the overlay; close-out Quick Add shows the provenance line
  ("↳ from …", no "adds") and writes only the field; capture from a meeting note page gets
  provenance; a todo agreed with Mieke and tagged `#101/sven` shows under I owe for Mieke and
  Relevant for Sven; `#owe/x` shows under I owe; tapping `#w/f X` or `#owe/x` opens the
  counterpart lens; the "Since" row lists todos ticked since the last meeting; "+ Next" in the
  overlay; `{tag}` file names.
- 0.12.0: New counterpart → Tend writes the line; Not writes inactive; Threads tab filter and ✕;
  Browse while refiling and linking; Review step with roster, summary, "Open overview" and back;
  set inactive with open items; "Since last time" on a new meeting note.

## 7. Open points

- T0 passed (Obsidian Tasks with "Task Format: Dataview"): the full line, and variants with
  `[created::]`, `[meeting::]`, `→ [[note]]` or `#wf/…` before `[due::]`, all show their due date.
  With the default emoji format Tasks ignores the fields, so the help page for Obsidian tells
  users to switch that setting.
- Obsidian-side Markdown view of the `.txt` files (outside gtdpara; see §3.1.5).
- Rhythm/cadence per counterpart (later; the `## Threads` line format leaves room).
- Tag renames once history accumulates (later).

## 8. As built (0.10.0)

0.10.0 "Plain syntax" is §3.1.1–3.1.4 and §3.1.7, on `feature/plain-files`; every commit ends
with `npm run check` green. 0.11.0 and 0.12.0 are not started.

- `685b12f` Read and write task fields, `#wf` and `[due::]`: `domain/taskLine.ts` (parse and
  write the trailing fields), `TaskFields` on `Task`, `domain/taskEdit.ts`, `#wf` in
  `domain/flowState.ts`, `setDueInLine`, `composeTaskText` writing `[due:: …]`, `WF` refused as
  an abbreviation; tests for the line, the helpers and `#wf`.
- `28521ca` Change todos only through the task helpers: every screen edit, done toggle and cancel
  (Daily, Inbox, Current, Review's Inbox, item list and unfocused-next steps, `itemMove`) goes
  through `applyTaskEdit` and `domain/taskEdit.ts`; `buildTask` records `created`; the
  code-health rule `task-edit` reports `deriveTaskFields` outside `src/domain/`.
- `cbecc2f` Write the demo space in the task field syntax: the check against this design found
  `domain/demoSpace.ts` still writing `#due:` and `#waiting-for:` into new demo files.
- `51009ea` Comments in `domain/types.ts` and `ui/QuickAddWidget.tsx` that still described
  `setDueTag` and spreading `deriveTaskFields`.
- `784a7f2`, `b3b4d01` design-overview §2.2 (line grammar, fields, `#wf`, example file), §2.4
  (`applyTaskEdit`), §3 ("One tag mechanism, one field mechanism", "One task change path"), §4;
  DEVELOPMENT-POLICY §3 (file format, one way to change a todo).
- `7bd927b` Help pages Tags, Your files and folders (with an Obsidian section), Quick Add,
  Note templates. `c0f3c29` CHANGELOG Changed and Upgrade notes.

Deviations from §3.1:

- **Due date in a Quick Add edit.** `applyTaskEdit(stored, composedText, linkedFile)` is
  `domain/taskEdit.ts`'s pure `applyTaskInput` plus the linked file. It takes the text and the
  due date from Quick Add's composed line, not "fields present replace, others kept": Quick Add
  always composes the due date, so a line without `[due:: …]` means the user removed it, and
  removing the due date in Quick Add clears it. `created`, `meeting` and `completion` are kept
  unless the line carries them; unknown fields in the line replace the stored ones, otherwise the
  stored ones are kept.
- `domain/taskEdit.ts` also has `newTask` (used by `buildTask`); `deriveTaskFields(text,
  fieldDue)` takes the due field as a second argument and uses it only when it is a
  `YYYY-MM-DD` date, else the legacy tag.
- A repeated known key, or a known key without a value, is kept verbatim in `fields.extra`, so a
  second parse of a written line gives the same result.
- Known fields are written in a canonical form (`[key:: value]`, the fixed order). A hand-written
  `[due::2026-10-09]` or a different order of known fields reads correctly but is rewritten in
  that form the next time the file's Tasks span is saved. Unknown fields stay verbatim. Keys are
  `[a-z][\w-]*` as designed, so `[Priority:: high]` stays part of the text.
- `wf` is reserved through `isWaitingForTag`/`isContextTag` (which `validateAbbrev` uses), not a
  separate list. `withTaskDone(task, true, today)` keeps a completion date the task already has.
- Legacy lines are not converted: a `#due:` tag is removed by a Quick Add edit or `withTaskDue`,
  `#waiting-for:` is rewritten by `setFlowStateTag` (every Quick Add edit); a done toggle leaves
  the text as it is.

The `.md` data files, the conversion pass and the raw view/edit were built on this branch and
removed before the release (D5, D6 withdrawn); what was learned is in §3.1.5.

Off-device: `npm run check` (tsc, ESLint, 440 Jest tests, script, help-page and code-health
tests, code health). T0 passed (§7). The device checklist of §6 "0.10.0" is still open.

## 9. As built (0.11.0)

0.11.0 "Threads" is §3.2–§3.8 on `feature/threads`; every commit ends with `npm run check` green.
The commits below were built before the revision D12–D15 (top of this document); where this
section says provenance adds thread tags, or that I owe / Waiting for are tag-based, the
revision replaces it. The rework is recorded at the end of this section.

- `dc60999` Preparation, behaviour unchanged: the overlay hosting moved out of `App.tsx` (now
  `screens/useAppOverlays.tsx`, so `App.tsx` fell below 1,000 lines and out of the code-health
  baseline) and one `ui/TaggableText.tsx` replaced the two `renderTaggableText` copies.
- `d2648a1` `domain/threads.ts` (`threadOf`, `threadsOfTags`, `belongsToThread`,
  `belongsToCounterpart`, `inThreadLens`, `typesForCounterpart`, `scopeOf`) and
  `domain/nextMeeting.ts` (`nextMeetingSeed`), with tests.
- `d23f852` `domain/provenance.ts` (`meetingKey`, `provenanceOf`, `applyProvenance`,
  `provenanceLabel`, `resolveProvenance`) and `storage/threadAggregate.ts`
  (`buildThreadOverview`, both lenses, scoped), with tests.
- `95b6ab9` Quick Add's `provenance` and `meetingSeed` (`ui/quickAdd/ProvenanceLine.tsx`,
  `useDraftRequests.ts`, `useProvenance.ts`), `storage/threadProvenance.ts`
  (`meetingForNotePage`), provenance written from "Meetings to close out" and from capture/marks.
- `ab0399a` The overlay (`ui/threadOverlayStore.ts`, `screens/thread/*`), tap routing
  (`ownerPath` on `TaskRow`/`MeetingRow` in every list, `#w/f Name` label), App smoke test.
- `6918894` `{tag}` (`ruleTypeTag`, the placeholder chip, help page Note templates).
- `69ec06f` Help pages Threads and Using gtdpara with Obsidian, the pages that changed, CHANGELOG,
  README, design-overview, dev README.

Choices where §3 left a detail open, and deviations:

- **Overlay host.** `App.tsx` calls `useAppOverlays(inTabs, activeTab)` instead of rendering the
  overview itself; the hook lives in `screens/` because it imports a screen (`ui/` never imports
  from `screens/`). An overview requested outside the tab shell (a nested tag tapped in focus
  mode) is dropped, so focus mode never shows it.
- **Writing provenance.** The screens do not pass `{meeting: key}` to `buildTask`; they run
  Quick Add's composed line through `applyProvenance` (missing thread tags appended to the text,
  `[meeting:: key]` set) and hand that line to the unchanged add path. One mechanism for all
  three writers, and Review's shared `onAddTask` needs no new parameter. The key leaves out `#`,
  `[` and `]` (§3.4): brackets would break the field, and Obsidian would count the meeting's
  tags as the todo's.
- **Past and ahead.** "Past" is a meeting that has ended (`meetingEndMs <= now`), "ahead" one that
  hasn't, so a meeting earlier today that is over is already in Looking back and can be
  selected for its follow-ups. `buildThreadOverview` therefore takes `now: Date`, not `today`.
  Cancelled meetings are in neither list.
- **Overview shape.** `owner` can be the Inbox (`kind: 'inbox'`); `scope` (the paths) is part of the
  result; `types` lists the thread's own type first. Agreed todos are found with
  `resolveProvenance` (D11 fallback included), not only by exact key; cancelled ones are left out.
- **Waiting for** in the thread lens also lists `#wf/<counterpart>` todos without the thread tag
  (what I wait for from alpha matters in every alpha thread).
- **Rows.** Ahead and the meeting panel use the flat `TaskRow` (Someday/Maybe keep their tag in
  the title as their label); done todos in the panel are grouped under "Done · Tue 6.10." heads
  instead of a date per row; Looking back uses the two-line `MeetingRow` with the counts in its
  second line (`3 agreed · 1 done · 2 open, oldest 12 d`). The panel's button is "Open note", or
  "+ Note" (open-or-create with the usual confirmation) when the meeting has none.
- **Quick Add in the overview.** Destination: the "+ Next" base meeting's item until a meeting is
  added, else the selected past meeting's item while the provenance line is on, else the owner
  (Inbox without one). Quick-file works in edit mode; there is no Refile (no Files pane).
- **"+ Next".** Offered only for types with a meeting in the overview (`wf` never). A seed that
  arrives while an edit is open waits until the edit has closed (`useDraftRequests`); a
  `prefill` keeps being dropped as before. `useDraftRequests` took over the prefill effect, so
  `QuickAddWidget.tsx` got shorter. No info line after "+ Next".
- **Provenance line** sits directly above the actions row in both variants (in capture above the
  Save buttons), only in create mode on the Todo tab.
- **Capture.** The source page's meeting is resolved once per source page and kept for the
  screen's lifetime: once for the lasso, once per marked page when marks are processed (so more
  than one keyword read when marks from several shared-note pages are processed).
- **Tap routing.** Nested context tags are tappable in every `TaskRow`/`MeetingRow`, also where the
  row's own tap selects (Review's close-out list). Tags in rows are shown as typed
  (`TextSegment.raw`), no longer lowercased. The tappable `#w/f Name` label is underlined; a tap
  on it opens the overview instead of starting an edit.
- **Header.** Owner as "in <item name>" (the item tapped in, not the widened Area); lens switch
  labels `#retro/alpha` | `All alpha`.
- No `domain/helpTopics.ts` mapping (the overview is not a tab; "?" closes it and opens the tab's
  page) and no debug-bundle line (the overview keeps no state beyond the session).

Off-device: `npm run check` (tsc, ESLint, 502 Jest tests including the App smoke test with the
overview open, script, help-page and code-health tests, code health). The device checklist of §6
"0.11.0" and the steps of the help page "Using gtdpara with Obsidian" are still open.


### Rework D12–D15

The revision at the top of this document, on `feature/threads`; every commit ends with
`npm run check` green.

- `b972f16` Write provenance as the meeting field only: `applyProvenance(line, key)` sets
  `[meeting:: key]` and leaves the text as typed (`provenanceOf`, `provenanceTags` and the
  `Provenance` type are gone); `provenanceLabel` is `↳ from <title> · <day>`. All three writers
  go through `ui/quickAdd/useProvenance.ts`, unchanged otherwise. `resolveProvenance` takes only
  the todo's fields: the fallback (D14) is a meeting on the key's date with one of its thread tags
  among the key's words. Tests: provenance cases, `useProvenance` (no "adds", ✕ for one todo).
- `67e8a27` Classify thread todos as waiting, owed or relevant: `buildThreadOverview` per §3.3
  (`ahead.relevant`, `since`), `OWE_TYPE`, `isCounterpartType` and `owedTo` in
  `domain/threads.ts`, `OWE` refused in `validateAbbrev`, the "Relevant" sub-list in
  `AheadSection`; help pages Threads and Tags, design-overview. Tests: §6 "Classification" with
  the Mieke/Sven example.
- `1058322` Show what was done since the latest meeting in Looking back: the "Since" row
  (`LookingBackSection`), `PastMeetingPanel` taking a `PanelSelection` (meeting or since),
  `sinceRowLabel`; App smoke test selects the row.
- `42135dd` Open the counterpart lens from `#w/f` labels and `#owe` tags: `openThreadOverview`
  forces the counterpart lens for `wf`/`owe`; the header shows "All <name>" without the switch.
- `b42f25c` The help pages Lasso and Review still said a todo from a meeting gets its thread tag;
  Threads names where a todo counts (D15); README.

Choices where the design left a detail open, and deviations:

- **A meeting of the lens** is one the overview lists: the lens's tags, so in the thread lens
  also a meeting with only the plain leaf (`#mieke`), and in the counterpart lens any thread of
  the counterpart or the leaf, inside the scope, past, ahead or cancelled. §3.3 says "thread tag /
  any thread of the counterpart"; including the leaf keeps every open todo counted under a
  meeting in Looking back also in I owe or Waiting for.
- **Waiting for** takes the user's wording of §1.2.1 literally: `#wf/<counterpart>`, or a *bare*
  `#wf` with the agreement or the lens's tags. A todo agreed with Mieke and tagged `#wf/sven` is
  Waiting for in Sven's threads and I owe in Mieke's (§3.3's looser list would have made it
  Waiting for in both).
- **The lens's tags** in the counterpart lens are the counterpart's thread types without `wf` and
  `owe`: `#wf/<cp>` and `#owe/<cp>` have their own meaning, so a bare `#wf` next to `#owe/mieke`
  stays I owe in both lenses.
- **`#owe/<cp>`** stays a context tag (tag chips, note keywords, tappable); only the bare `owe` is
  refused as an abbreviation, by `validateAbbrev`, since `isContextTag('owe')` stays true (a bare
  `#owe` is a plain tag). `wf`/`owe` overviews are forced to the counterpart lens in
  `openThreadOverview` and again in `buildThreadOverview`, so no caller can open a `wf` thread lens.
- **Display order** in Ahead is §3.5.2's (Next meetings, I owe, Waiting for, Relevant); the
  precedence Waiting for > I owe > Relevant decides only where a todo goes.
- **Since** lists done, not cancelled todos with `completion ≥` the latest past meeting's date,
  latest first; the panel groups them under the same "Done · <day>" heads as a meeting's done
  todos, its header reads "Since <day>" / "n done since the latest meeting". The row is drawn at
  the two-line meeting row's height (57 dp), so the list pages by one height.
- Point 7 of the rework brief (an Obsidian help page change) carried no content and was left out;
  `docs/user/obsidian.md` is unchanged.

Off-device: `npm run check` (tsc, ESLint, 526 Jest tests including the App smoke test with the
overview open, the "Since" row selected and a `#wf/…` overview, script, help-page and
code-health tests, code health). The device checklist of §6 "0.11.0" is still open.
