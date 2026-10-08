# gtdpara — Architecture & Design Reference

> **About this document.** This is the living architecture document of gtdpara: the vision, how
> the app is built (§2, one section per subsystem), the binding rules for every change (§3) and
> the reasons behind the main decisions (§4). It describes the code as it is now, in present
> tense: no history, no dates, no open work. Open work lives in the maintainers' internal backlog;
> how a feature came about is in its historical design under `docs/dev/history/` and in git.
> Update the affected section in the same change that alters the architecture or a rule
> (`DEVELOPMENT-POLICY.md` §6). Companions: `design-philosophy.md` (why the product behaves as it
> does), `design-device-rendering.md` (screen size, row heights, element budget).

---

## 1. Vision

gtdpara is a small Supernote plugin that organizes work with PARA (Projects, Areas, Resources,
Archive) for filing and GTD conventions for doing. The **files themselves are the source of
truth**, not a plugin database: every Project, Area and the Inbox is a folder with one plain-text
data file that reads well in any text editor or in Obsidian, with or without the plugin. Notes
stay ordinary Supernote `.note` files next to their data. The plugin is a fast, e-ink-friendly
layer for capturing, filing, planning (day, week, month) and reviewing on top of those files.

Calendar sync (CalDAV) is out of scope because it cannot be file-native. Google Calendar and
Gmail exist only as optional, read-and-copy integrations (§2.11). gtdpara is built independently
from SNFolio (informed by it, not forked from it).

---

## 2. How it is built

The code is layered: `src/domain/` (pure TypeScript), `src/storage/` (file I/O, cache, all
writes), `src/supernote/` (device and native APIs), `src/ui/` (shared components and hooks),
`src/screens/` (one folder or file per screen) and `App.tsx` (shell and navigation). §3 states
the rules that keep these layers apart.

### 2.1 Screens and navigation

**Shell.** `App.tsx` renders a `StatusProvider` (§2.13), an always-mounted `StaleBuildBanner`,
and `AppShell`. `AppShell` is keyed by a profile epoch, so switching profiles remounts the whole
shell with no state carried over (§2.12). A "Mark for later" result screen
(`ui/MarkOutcomeScreen.tsx`) can be drawn on top of everything (§2.10).

**Mode and tabs.** Navigation is three independent pieces of state, with no back stack:

- `mode`: `'loading' | 'tabs' | 'capture' | 'focus'`. `capture` shows `CaptureScreen` (§2.10)
  instead of the tab shell; `focus` shows Daily's one-column focus mode (§2.7) without a TabBar.
- `activeTab`: one of the nine tabs in `ui/TabBar.tsx` — **Projects, Areas, Daily, Week,
  Month, Inbox, Current, Review, Settings**.
- `currentItem`: the Project or Area the **Current** tab shows. Tab switches leave it alone;
  opening an item from any screen (`openItem`) sets it and switches to Current.

`TabBar` also carries the help button (in-app help, `ui/HelpOverlay.tsx`, pages generated from
`docs/user/` into `src/generated/userDocs.ts`), a profile marker for any non-default profile, the
Review tab's overdue dot (§2.8) and the one "✕ Close plugin" action. Screens have no heading, no
back button and no reload button of their own; reloading is Settings → Advanced → "Reload all
files".

**Overlays.** `screens/useAppOverlays.tsx` draws at most one overlay over the tab body, inside
`StatusFrame` (the TabBar and the status slot stay, the tab screens stay mounted underneath):
the help (`ui/HelpOverlay.tsx`) or the **thread overview** (`screens/thread/ThreadOverview.tsx`).
Opening one closes the other; a tab tap, leaving the tab shell and the overlay's own close
(help: ✕ Close; overview: "‹ <tab name>") close it, and closing requests an e-ink refresh. The
overview is opened from any row through the module store `ui/threadOverlayStore.ts`
(`openThreadOverview({tag, ownerPath, lens})`), so no list threads props for it.

**Screens.**

- **Projects / Areas** — `screens/ItemsList.tsx` (one component, `kind` prop): Active on the
  left (focused items first, marked ★, abbreviation after the name), On Hold and (Projects only)
  "Done — awaiting review" on the right, each a fixed-height `PagedSection`. A "Create
  Project/Area" row creates the folder and its data file (`storage/createItem.ts`). Resources and
  Archive are neither listed nor scanned.
- **Daily, Week, Month** — the planning screens (§2.7).
- **Inbox** — `screens/InboxScreen.tsx`: Files pane on the left (Resources and Browse), Tasks
  above Meetings on the right, everything unfiltered.
- **Current** — `screens/ItemDetail.tsx`: left pane `ui/ItemFocusPanel.tsx` (Scope, focus
  checkboxes, goals) on top, the Files pane (`ui/FileBrowserPane.tsx`) in the middle and
  `ui/ItemStatusPanel.tsx` (status, close-out/archive, Assign to Area) at the bottom; right pane
  `screens/ProjectDataPanel.tsx` with Quick Add, Todos and Meetings. The header shows the kind and
  the editable abbreviation pill.
- **Review** — `screens/review/ReviewScreen.tsx` (§2.8). While a close-out is open, the Review
  tab shows `screens/CloseOutWizard.tsx` instead (§2.9).
- **Settings** — `screens/settings/Settings.tsx` (§2.12).
- **Thread overview** (an overlay, not a tab) — `screens/thread/`: everything around one nested
  tag `type/counterpart` inside the owner's scope (domain/threads.ts: the owner's Area plus its
  Projects; a Project without Area and the Inbox are their own scope). Header: back, tag, owner,
  lens switch (thread | all of the counterpart). Left: `AheadSection` (one paged list: next
  meetings, I owe, Waiting for, with "+ Next <type>" in its header) above `LookingBackSection`
  (one two-line row per past meeting with agreed/done/open counts). Right: Quick Add, then
  `PastMeetingPanel` (the selected past meeting, the latest by default, and its agreed todos).
  Data: `storage/threadAggregate.ts`'s `buildThreadOverview`; actions: `useThreadActions.ts`
  (the same write paths as Daily). Detail: `docs/dev/history/technical-design-tending-threads.md`.

**Kept tabs.** With "Keep tabs in memory" on (`settings.keepTabsAlive`, default on), Daily,
Week, Month, Current, Projects and Areas stay mounted after their first visit, hidden with
`display: 'none'` (`ui/KeptTab.tsx`); Inbox, Review and Settings mount only while visible.
`ui/screenActivity.ts` tells a kept screen whether it is showing (`useScreenActivity`,
`useOnScreenShow`, `useOnScreenHide`). Leaving a kept tab saves and closes an open Quick Add edit,
dismisses the keyboard and withdraws its screen-scoped status messages; drafts and view state
stay. Coming back, cache subscriptions catch up (they pause while hidden), settings are re-read
and one e-ink refresh is requested. "Reload all files" drops all kept tabs
(`ui/keepAliveStore.ts`'s `dropKeptTabs`). Design detail:
`docs/dev/history/technical-design-keep-tabs-alive.md`.

**Opening and reopening (`reorient`).** The sidebar button (`SIDEBAR_BUTTON_ID`) opens the
plugin on any open note or document. The JS instance stays alive while the plugin is hidden, so
`reorient()` runs on mount *and* on every sidebar press. It loads settings, starts the
incremental cache refresh (§2.3, not awaited) and asks the pure `domain/returnContext.ts`'s
`decideLanding` where to land, in this order:

1. **focus mode** when `settings.focusModeActive` is set;
2. **resume** when the open note is the one gtdpara itself opened last (recorded by
   `supernote/fileSystem.ts`'s `openPath` into the memory-only `storage/returnRecord.ts`, valid
   for 12 hours): the tab shell stays exactly as it was; Current is pointed at the note's item
   unless Current is on screen;
3. the open note's **enclosing Project/Area** (`domain/settings.ts`'s `findEnclosingItem`, which
   walks up through subfolders such as `Meetings/`): Current;
4. otherwise **Daily**.

A record that no longer matches is cleared. Detail:
`docs/dev/history/technical-design-return-to-origin.md`.

**Lasso buttons.** `index.js` registers the lasso-toolbar buttons "Capture Todo/Meeting"
(`LASSO_BUTTON_ID`) and "Mark for later" (`MARK_BUTTON_ID`, handled in `index.js` itself without
showing the plugin, §2.10). App's button listener switches to `mode: 'capture'` for the capture
button. `sn-plugin-lib` replays the last button event to a newly registered listener, so on a cold
start the capture event can arrive while `reorient()` is still awaiting; the listener is
registered before `reorient()` and sets `routedByLassoButtonRef` synchronously, and `reorient()`
checks that ref before changing `mode` or `activeTab`. A `captureNonce` state value is
`CaptureScreen`'s `key`, so every capture remounts the screen and reads the new selection.

### 2.2 Data model and file format

**Folders and identity.** Under the base root (default `/storage/emulated/0/Note`) live the four
PARA folders (default `1 Projects`, `2 Areas`, `3 Resources`, `4 Archive`). Each Project or Area
is a folder holding one data file, `project.txt` or `area.txt`. The folder *is* the identity: no
synthetic ids, renaming the folder renames the item. The Inbox is a folder under Areas (default
`2 Areas/0 Inbox`, setting `inboxFolder`) holding `Inbox.txt`; it is never listed or scanned as an
Area. `domain/settings.ts`'s `resolvePaths` turns settings into `ResolvedParaPaths`
(`base`, `projects`, `areas`, `resources`, `archive`, `inboxFolder`, `inbox`). The extension is
`.txt`, not `.md`, so nothing treats it as a specific Markdown dialect; the content is
Obsidian-flavored Markdown, and a rename to `.md` would make Obsidian pick it up fully.

**One file, several spans.** Parsing and serializing live in `domain/markdown.ts` (pure). A file
is frontmatter plus `## ` sections, each read and written on its own (`getSpan`/`setSpan`): a save
replaces only the lines between its heading and the next `## ` heading, and appends the section
if it is missing. Everything else in the file passes through untouched.

```
---
kind: project
status: active
dailyFocus: true
area: Coaching
abbrev: AT
---

## Scope
Ship the tender by end of quarter.

## Tasks
- [ ] Draft outreach email #next #alice [created:: 2026-10-28]
- [ ] Pay invoice [created:: 2026-10-28] [due:: 2026-11-05]
- [ ] Signed offer back #wf/alice [due:: 2026-11-06]
- [x] Kickoff call → [[Todos/Kickoff call.note]] [created:: 2026-10-20] [completion:: 2026-11-03]
- [-] Cancelled idea

## Meetings
- 2026-11-03 10:00-11:30 Kickoff Call #prepped → [[Meetings/2026-11-03 - Kickoff Call.note]]
- 2026-11-07 3d Offsite (Off) #monthly
- 2026-11-10 1d Planning day +[[3 Resources/Templates/plan.pdf]]

## Weekly Goals
- 2026-W45: Ship the technical design doc

## Monthly Goals
- 2026-11: Finish module 2 outline
```

| Section | Content | Parsed by |
|---|---|---|
| frontmatter | `status`, `dailyFocus`/`weeklyFocus`/`monthlyFocus`, `defaultResourceFolder`, `area`, `abbrev`; `kind`, `doneAt`, `archivedAt` and any hand-written key kept as extra lines | `parseFrontMatter` / `writeFrontMatterIntoContent` |
| `## Scope` | free text, the whole span is the value | `parseScopeSpan` / `writeScopeIntoContent` |
| `## Tasks` | one task per line | `parseTasksSpan` / `writeTasksIntoContent` |
| `## Meetings` | one meeting per line | `parseMeetingsSpan` / `writeMeetingsIntoContent` |
| `## Weekly Goals`, `## Monthly Goals` | `- 2026-W45: text`, `- 2026-11: text` | `parse*GoalsSpan` / `setGoalForWeek` / `setGoalForMonth` |
| `## Marks` | open "Mark for later" lines (§2.10) | `parseMarksSpan`, `domain/marks.ts` |
| `## Close-out` | the close-out plan (§2.9) | `domain/closeOut/plan.ts` via `readSectionLines` |

`ensureSkeleton` writes a new file as frontmatter (`kind`, `status: active`) plus empty
`## Scope`, `## Tasks` and `## Meetings`; other sections appear the first time they are written.
Focus flags are written only when true; `status` is always written and reads as `active` when
missing or unknown. Frontmatter is written as its extra lines first, then the recognized fields.
Every frontmatter save takes one `FrontMatterFields` object built as
`{...frontMatterOf(item), <change>}` (`storage/dataCache.ts`), so a save can never clear a field
it did not mean to touch. `domain/lifecycleDates.ts` reads and writes `doneAt`/`archivedAt`.

**Tasks.** `- [ ] text`, with `[x]` done and `[-]` cancelled. Cancelling is the only delete: the
line stays in the file and is hidden. The grammar of a task line:

```
- [x] <text with #tags> → [[note]] +[[file]] [meeting:: …] [created:: …] [due:: …] [completion:: …]
```

`Task = {text, done, cancelled, tags, dueDate, flowState, waitingOn, now, notePath, linkedFile,
fields}`. `text` holds the typed text with its tags and never a field. `fields` (`TaskFields =
{due, created, completion, meeting, extra}`) are the trailing fields (`domain/taskLine.ts`).
`tags`, `flowState`, `waitingOn` and `now` are derived from `text`; `dueDate` is `fields.due`, or
an older `#due:` tag in `text` when there is no due field. A new todo gets `created` (today);
checking it done writes `completion` (today), unchecking removes it; created and completion dates
are never invented for older todos. `meeting` is the todo's **provenance**, the meeting it was
agreed in: `<date> <display title>` (`domain/provenance.ts`'s `meetingKey`, the shared-page
keyword without `#`, `[` and `]`: Obsidian would read a `#tag` in a field as a tag of the todo), written only where Quick Add shows it first (§2.4) and resolved at read
time (exact key in the todo's scope, then anywhere, then date plus a shared thread tag). Only
`domain/taskEdit.ts` builds or changes a Task (`newTask`, `withTaskText`, `withTaskDue`,
`withTaskDone`, `withTaskCancelled`, `applyTaskInput`), so the derived fields always match `text`
and `fields`; `deriveTaskFields` is used only inside `domain/`.

**Meetings.** `- [-]? YYYY-MM-DD <slot> title`, every meeting a one-off (no recurrence). The slot
is always written: `HH:mm`, `HH:mm-HH:mm` or `Nd` (a date-only meeting spanning N days, `1d` for
one day); a line without a slot still reads as one day. `Meeting = {title, date, time, endTime,
days, tags, cancelled, notePath, linkedFile}`, `tags` from `deriveMeetingFields(title)`. A
hand-written series line and its indented lines are kept as unknown lines.

**Trailing tokens.** In this order: ` → [[notePath]]` (the item's note, §2.6), then
` +[[linkedFile]]` (an attached existing file), then, on task lines only, the fields. Parsing
strips right to left, writing appends left to right. `notePath` is relative to the item's folder (`Todos/x.note`), absolute when it
starts with `/`, a shared-note anchor `Meetings/Coaching 2026.note#<keyword>`, or a page link
`<note>#page=N`. `linkedFile` is relative to the base root (it can point into Resources) and may
also carry `#page=N`.

**Fields.** A field is a Dataview inline field `[key:: value]` (key `[a-z][\w-]*`), the format the
Obsidian Tasks plugin reads with its "Task Format" set to Dataview. Only fields at the very end of
a line count; a field in the middle of the text is text. Known keys are written in the fixed order
`meeting`, `created`, `due`, `completion` (Tasks reads its fields from the end of the line), as
`[key:: value]`, then unknown fields verbatim in file order, so fields added in Obsidian survive. A
repeated known key or one without a value is kept as an unknown field. Dates are `YYYY-MM-DD`.

**Tags — one mechanism.** Every `#tag` in a task's text or a meeting's title is extracted
(`TAG_RE`, lowercased); `text` itself is never rewritten by parsing. What a tag means:

- **flow state** (`domain/flowState.ts`): `#next`, `#someday`, `#maybe`, and Waiting For as
  `#wf/<slug>` (the counterpart; deeper segments are ignored for the name) or bare `#wf`;
  exclusive by UI convention, first match wins when a file has several. The older
  `#waiting-for` / `#waiting-for:<slug>` are read as Waiting For; `setFlowStateTag` strips every
  form and writes `#wf/<slug>` or `#wf`. `wf` is reserved: never a context tag, never an
  abbreviation.
- **due date** is the `[due:: YYYY-MM-DD]` field, not a tag (`setDueInLine` on a composed line,
  `withTaskDue` on a Task); for a Waiting For task it is the follow-up date. An older
  `#due:YYYY-MM-DD` tag is still read; a Quick Add edit or `withTaskDue` removes it.
- **bare state tags** (`RESERVED_BARE_TAGS`): `#now` (focus mode), `#prepped`/`#reviewed`
  (meeting tracking, §2.6), `#monthly` (Month highlight, §2.7).
- **context tags**: everything else (`isContextTag`), including nested tags `#coaching/sabina`
  (segments after `/`) and Project/Area abbreviations such as `#AT`. A nested tag is also a
  **thread** (`domain/threads.ts`): type `coaching`, counterpart `sabina`; the plain leaf
  `#sabina` belongs to the counterpart, a plain parent `#coaching` to no thread. Matching is
  read-time only.

Helpers that edit text for a tag (`setFlowStateTag`, `setBareTag`,
`insertTagAtPosition`, `removeTagFromText`) strip and re-append; whole-tag guards treat `/`, `-`
and `:` as part of the tag. `stripSpaceAfterHash` removes the space handwriting recognition often
inserts after `#`.

**Abbreviations.** Every Project/Area has a short, user-editable, case-insensitively unique
`abbrev` (`domain/abbrev.ts`): generated on creation (`assignDefaultAbbrevIfMissing`) and filled in
for items without one at the end of every full rebuild (`migrateMissingAbbrevs`). Typed as a tag,
it is a soft reference: it filters Daily (§2.7) and drives quick-file (§2.5); nothing moves on
its own.

**Unknown lines.** A line a span's parser doesn't understand is kept verbatim but written back
*after* the recognized lines of its section on the next save; content survives, its position
relative to recognized lines does not.

### 2.3 The cache

`storage/dataCache.ts` holds one module-level `DataCache {scannedAt, paths, items}` with one
`CachedItem` per Project/Area folder: the raw file text plus every parsed span and frontmatter
field as flat fields (`tasks`, `meetings`, `scope`, `weeklyGoals`, `monthlyGoals`, `marks`,
`status`, focus flags, `area`, `abbrev`, `defaultResourceFolder`, their extra lines and an
optional `loadError`). It is disposable: a full rebuild always reproduces it from the files.

**Shared Inbox.** `Inbox.txt` is not an item, but the cache keeps it next to them:
`getCachedInbox`, `setCachedInbox(next | updater)`, `subscribeInbox`, `reloadCachedInbox`.
Screens read it through `ui/useCachedInbox.ts`; a write anywhere is seen everywhere.

**How it stays current.**

1. **Full rebuild** (`rebuildCache`): lists the Projects and Areas folders (skipping the Inbox
   folder), stats every data file plus `Inbox.txt` (`statFiles`, one native call), reads them in
   parallel and replaces the cache. One failing file sets that item's `loadError` instead of
   failing the rebuild. Runs on "Reload all files", when a screen finds no cache (Settings → Save
   clears it), and when the incremental refresh cannot work.
2. **Incremental refresh** (`refreshCache`): what `reorient()` runs on every open. Lists the
   folders, stats every data file and `Inbox.txt`, and re-reads only files whose stamp
   (`exists`, `lastModified`, `size`) differs from the recorded one, plus new folders; removed
   folders drop out. A re-read whose text equals the cached text keeps the old object, so
   subscribers hear only about real changes. Falls back to a full rebuild when there is no cache,
   the configured folders differ from `cache.paths`, or the native `statFiles` is missing.
   Requests are de-duplicated. A sync tool that keeps both time and size the same is missed
   until "Reload all files".
3. **Write-through** (`updateItemTasks`, `updateItemMeetings`, `updateItemFrontMatter`,
   `updateItemScope`, `updateItemWeeklyGoals`, `updateItemMonthlyGoals`, `updateItemRawContent`,
   `removeCachedItem`): every plugin save writes the file first, then updates the cache entry.
4. **Change notification**: write-through mutates items in place, so every mutation calls
   `notifyCacheChanged()`, which bumps a version and notifies `subscribeCache` listeners.
   `ui/useCachedItems.ts` turns that into a re-render and a new array identity per change (plain
   `useState` + `useEffect`, paused while a kept tab is hidden).

`ensureItemCached(kind, name, path)` loads one item on demand when it is not cached yet;
`findCachedItem(path)` reads one. Cross-project views are pure, synchronous transforms over the
warm cache (`storage/dailyAggregate.ts`, `weeklyAggregate.ts`, `monthlyAggregate.ts`,
`reviewAggregate.ts`, `periodFocusCards.ts`, `threadAggregate.ts`), never their own filesystem
scans.

What gtdpara does not cache: the Files pane lists folders live on every visit, and Google
Calendar and Gmail have their own caches (§2.11). Detail:
`docs/dev/history/technical-design-cache-subscription-and-shared-add-path.md`,
`docs/dev/history/technical-design-files-0.6.md`.

### 2.4 Quick Add and editing

**One widget.** `ui/QuickAddWidget.tsx` is every screen's single add-and-edit surface. Mini-tabs
Todo | Meeting (plus Note where the screen passes `onAddNote`) on row 1; text and date on row 2
(dates are `ui/DateInput.tsx` with a -1 / Today / +1 / +7 strip, arithmetic in
`domain/dateNudge.ts`); flow chips, time/length, tag chips and the attachment on row 3; actions on
row 4. Create mode adds to the screen's `fixedDestination`; edit mode shows Delete (soft cancel),
Refile (where the screen passes `onRefile`), Cancel and Save, and for meetings "New from this"
(a new meeting pre-filled from the edited one). The widget is long-lived per screen (no `key`
remounts): the todo and meeting drafts survive tab flips and edits elsewhere. `variant="capture"`
is the lasso-capture layout (§2.10). The Note tab creates a standalone `.note` in the Files
pane's current folder (`storage/standaloneNotes.ts`), its `#tags` becoming page keywords.

**Tags in the widget.** `ui/TagChips.tsx` shows recently used tags (`storage/tagUsage.ts`,
per profile) as a paged, controlled chip row; a tag naming an Active/On Hold item's abbreviation
shows uppercase. Typing a recognized abbreviation tag turns "+ Add" into "+ Add to `<Name>`" and
Refile into "File: `<Name>`" (§2.5). When a just-added meeting is not visible on the current
screen, the status message says where it went (`domain/dateLabel.ts`'s `describeAddedDate`, via
the `isMeetingDateVisible` prop).

**Requests from the screen** (`ui/quickAdd/`). `prefill` appends text to a draft (Gmail);
`meetingSeed` replaces the meeting draft ("+ Next <type>", `domain/nextMeeting.ts`'s
`nextMeetingSeed`; it waits until an open edit has closed); both act once per nonce
(`useDraftRequests.ts`). `provenance` shows one grey line above the actions in create mode on the
Todo tab (`ProvenanceLine.tsx`, `↳ from <meeting> · <day> · adds #<tags>`, ✕ drops it for one
todo). The widget only shows it; the screen writes it through `useProvenance.ts`, which applies
`domain/provenance.ts`'s `applyProvenance` to the composed line (missing thread tags appended,
`[meeting:: <key>]` set) before `buildTask`. Review's "Meetings to close out", the thread
overview and capture from a meeting's note page use it.

**One edit and one arm per screen.** `ui/useEditTarget.ts` holds a screen's edit target (the
row open in the widget) and, where the screen has a Files pane, its arm (a row waiting for a
Files-pane pick: link a file, refile). `start(t)` first runs **save-then-switch**
(`ui/useEditFlush.ts`): the widget saves the open row's changes if anything changed, and only a
successful save switches; a failed save keeps the edit open with its error. `cancel()` ends the
edit and any arm started from it; `armFor`/`cancelArm` leave the edit open. Leaving the tab saves
too; drafts of new items are never saved implicitly. Inbox, Current, Daily, Week/Month
(`screens/usePlanningScreen.ts`) and Review's Inbox step use this hook.
`ui/useActionError.ts` gives a screen one error slot for its actions (`run`, and `runSave`, which
resolves `false` on failure for save-then-switch).

**One write path.** `storage/itemMutations.ts` is the only code that builds and places tasks and
meetings: `buildTask`/`buildMeeting`, `applyTaskEdit`/`applyMeetingEdit`, `addTaskToDestination`/
`addMeetingToDestination`, and `mutateEntryTasks`/`mutateEntryMeetings` (re-read the entry's
source, check the index still matches, apply, save, write through). A function that may write
the Inbox takes an `InboxContext {inbox, inboxPath}` and returns `{nextInbox}` for the caller to
put into the shared Inbox. An index that no longer matches throws a "changed on disk" message.
Quick Add hands over a todo as one composed line (`domain/quickAddCompose.ts`'s `composeTaskText`:
text, flow tag, `[due:: …]`); `buildTask` splits it and adds `created`, and `applyTaskEdit` takes
the text and the due date from it (a line without `[due:: …]` clears the due date) and keeps
`created`, `meeting`, `completion` and unknown fields. Done toggles, cancels and due changes on
the screens go through `domain/taskEdit.ts`.

**Rows.** `ui/TaskRow.tsx` and `ui/MeetingRow.tsx` are the only row components. A task row shows
labels after its title (`domain/taskLabels.ts`, `ui/TaskLabels.tsx`, layout in
`ui/taskRowLayout.ts`: `#next`/`#now`, `#w/f Name`, `#due 5.10.`, overdue `!`), wrapped and
clamped together with the title; a double tap on the `#next`/`#now` label toggles `#now`. Tags in
a row's title go through `ui/TaggableText.tsx`: a nested context tag always opens the thread
overview with the row's item as owner (rows get `ownerPath`; Inbox lists pass the Inbox folder),
a plain context tag is tappable only where the screen passes a handler (Daily's context filter);
the `#w/f Name` label opens the overview of `wf/<name>`. Meeting
rows have two fixed heights (one line 37 dp, two lines 57 dp); every list has a 1-line/2-line
switch remembered per list for the session (`ui/listLayout.ts`). Every action (note, file, prep/
review, highlight, source) is an optional prop, so a list enables features by props, never by
its own row. Detail: `docs/dev/history/technical-design-unified-quickadd.md`,
`docs/dev/history/technical-design-meeting-lists.md`.

### 2.5 Moving and filing

**One move.** Every move of a todo or meeting to another Project, Area or the Inbox — Inbox
filing, Refile, abbreviation quick-file, close-out's "→ Area"/"→ Inbox" — calls
`storage/entryMove.ts`'s `moveTask`/`moveMeeting(source, index, updated, target, ui)`. It appends
to the target first, then removes from the source (a failure in between leaves a duplicate, never
a loss), updating files, cache and shared Inbox, so screens only re-render. The write runs inside
`moveEntryWithNote`, which takes care of the note:

1. `classifyNotePath` (§2.6) and `domain/noteRelocation.ts` plan it: `none` (no note, or an
   absolute link), `missing`, `own` or `shared`.
2. When a note file is affected, the status slot asks for confirmation (`ui/useEntryMoveUi.ts`,
   texts from `domain/fileChangeText.ts`); ✕ writes nothing.
3. An own note moves first, to the same relative place in the target with a collision-free name;
   a failed note move stops before any data file is written.
4. A shared page stays in its file; the entry's anchor becomes absolute.

Linked files are not moved. Closing one entry from outside its own screen (close-out's
Done/Cancel) goes through `storage/itemMove.ts`.

**Where moving starts.**

- **Refile** — in Quick Add's edit mode on screens with a Files pane: Inbox, Current and Review's
  Inbox step. It arms the pane's **Browse** root; picking a Project or Area moves the row.
  `storage/inboxFiling.ts`'s `resolveFilingPick` turns the pick into a target. Refile never
  offers the Inbox, only Active items; picking the item's own location does nothing.
- **Quick-file** — typing a recognized abbreviation tag (`domain/abbrev.ts`'s
  `resolveAbbrevFileTarget`, Active or On Hold items, the first matching tag in the text, never the
  item's own location) shows "File: `<Name>`" in edit mode (Daily, Week, Month, Inbox, Current,
  Review's Inbox step) and "+ Add to `<Name>`" in create mode. The tag is removed from the saved
  text. Daily, Week and Month pass `editingItemPath`, because their `fixedDestination` is always
  the Inbox while the edited row can live anywhere.
- **Capture** files to a chosen Project/Area or the Inbox directly (§2.10).

**The Files pane.** `ui/FileBrowserPane.tsx` is one folder browser with several roots as
mini-tabs, each listed live and sorted alphabetically. A `LinkTarget` puts it into `locating`
(jump to and highlight a linked file's row) or `arming` (a tap picks: a file for a link, or with
`pickKind: 'folder'` a Project/Area); the pick message is a modal in the status slot with Cancel.
Roots never appear or disappear while arming; roots that cannot take the pick render `disabled`.
The **Browse** root (`sources`) shows "Projects" and "Areas", then the Active items of that kind:
a tap there jumps to the item (`onNavigateToItem`), picks it while refile-arming, or drills in
while link-arming. `startAt` lets an arm open directly in one source (Assign to Area). Roots per
screen:

- Inbox and Review's Inbox step: Resources, Browse.
- Current, Project: Project Files, Resources, Area Files (once assigned), Browse.
- Current, Area: Area Files, Resources, Project Files (its assigned Projects), Browse.

The Resources root can pin a per-item default subfolder (`defaultResourceFolder`).

### 2.6 Notes, linked files and Tag Rules

**Linked notes.** Each todo or meeting can have one note. The note icon on every row calls
`storage/meetingNoteContent.ts`'s `openOrCreateMeetingNote`/`openOrCreateTodoNote`. When the item
has a link, it always reopens in the linked file. Otherwise the plan (`planItemNote`, read-only,
`domain/noteCreationPlan.ts`) is one of `new-own-file`, `new-page`, `new-shared-file`,
`link-page`, `recreate-page`, `recreate-shared-file`, `recreate-own-file`; every screen passes
`confirmCreate` (`ui/useNoteCreateConfirm.ts`), which shows the plan in the status slot, and ✕
writes and opens nothing. Own notes live in the item's `Todos/` or `Meetings/` subfolder
(`storage/noteLinks.ts`'s `createLinkedNote`; meeting notes are named
`<date> - <title>.note`, collisions get ` (2)`, file names pass `domain/fileName.ts`'s rule).
Inbox items always get own notes. Absolute links (a lasso source note) are never recreated.

`classifyNotePath` reads a stored `notePath` against the file system: a page link, a shared
anchor whose file exists, a literal own-note path (older own notes may contain `#` in their
name), or, when nothing exists, an anchor with a `.note` file part (shared, missing) versus an
own note (missing).

**Linked files.** `linkedFile` attaches one existing file to a todo or meeting
(`storage/linkedFiles.ts`): a paperclip on the row opens it (`openLinkedFile`, at its page when it
carries `#page=N`); edit mode shows it with ⚠ when missing and ✕ to remove it; a new link is set
by arming the Files pane from the row and tapping a file. `locateLinkedFile` finds the root and
folder for auto-locate. Gmail email notes and attachments become linked files under Resources
(§2.11). Detail: `docs/dev/history/technical-design-linked-files.md`.

**Tag Rules.** `domain/tagRules.ts` defines `TagRule`s (stored in `settings.tagRules`, edited in
Settings → Tag Rules, `screens/settings/tagRules/`): a context (Project, Area, Todo, Meeting), an
optional tag, a MyStyle background template, and positioned content pieces (`title`, `date`,
`time`, `text` from the rule's own reusable texts, `related` open todos, `link` to the item's
linked file). `resolveNoteTemplate` picks the rule for an item; a rule tag matches itself and
every nested tag under it (`tagMatchesRuleTag`). A fresh install gets a "Meeting (default)" rule.

- **Content.** `populateNoteFromRule` writes one textbox element per piece; pieces are always
  regenerated, never merged. Each textbox is sized by on-device text measurement
  (`storage/notePieceMetrics.ts` → native `TextboxMetrics`) and capped at the piece's
  `maxWidthPx`. Re-population on reopen stops once the meeting is over or the todo is done or
  cancelled (`isMeetingAutoUpdateFrozen`, `isTodoAutoUpdateFrozen`); creation always populates.
- **Shared notes.** A Todo/Meeting rule can target one shared `.note` instead of a file per item
  (`noteTarget: 'shared'`): each item gets a page located by keyword (meeting: `<date> <title>`;
  todo: its text without functional tags), inserted chronologically (`storage/sharedNotePages.ts`
  is the page engine, decisions in `domain/sharedNotePages.ts`). The shared file name is a
  template (`renderSharedFileName`: `{tag}`, `{subtag}`, `{year}`, `{quarter}`, `{month}`), so one
  rule can split into one file per type, client and year; `ruleTypeTag` gives the rule tag the
  item matched, `ruleSubtag` the nested part after it.
- **Meeting tracking.** A Meeting rule can switch on *Prepare before* and/or *Review after*.
  State is `#prepped`/`#reviewed` on the meeting line; every meeting row shows one small P/R
  icon (check when done), toggled through `domain/meetingTracking.ts`'s
  `toggleMeetingTrackingAt`. The phase switches at the real end of the meeting (`meetingEndMs`).
  Review's "Meetings to close out" lists outstanding reviews of the last
  `REVIEW_LOOKBACK_DAYS` (7) days.

Detail: `docs/dev/history/technical-design-note-templates.md`,
`docs/dev/history/technical-design-shared-note-pages.md`,
`docs/dev/history/technical-design-split-by-tag.md`,
`docs/dev/history/technical-design-meeting-tracking.md`,
`docs/dev/history/technical-design-textbox-metrics.md`.

### 2.7 Daily, Week and Month

**Focus.** Each Project/Area can be in daily, weekly and monthly focus (frontmatter flags).
`storage/focusSlots.ts` is table-driven (`FOCUS_SCOPES`): limits per kind and scope from
settings (defaults daily 3/2, weekly 5/3, monthly 2/3 Projects/Areas), `focusBlockedReason`
blocks only adding, and `setItemFocus`/`toggleItemFocus` write through. Only Active items can be
focused; a status change away from Active clears all flags (§2.9). `domain/destination.ts`'s
`isFocused` (any of the three) decides "focused" everywhere. Goals for a week or month are
read and written through `storage/periodGoals.ts`; `domain/period.ts`'s `canEditPeriod` allows
the current period plus the next week from Friday and the next month in its last 7 days.

**Daily** (`screens/DailyView.tsx`, aggregate `storage/dailyAggregate.ts`). Left column: the day
panel (`ui/DayMeetingsPanel.tsx`, Today | Tomorrow | Google) and below it `ui/DailyFocusPanel.tsx`
(Focus | Projects | Areas; an empty focus slot arms the matching list as a picker). Right column:
Quick Add (always to the Inbox) above the Open tasks, grouped by source item, focused items
first. A task shows when it is open and

- due today, tomorrow or overdue (`dueDate <= tomorrow`), or
- `#next` in a focused item (any scope) or in the Inbox, or
- Waiting For with no date or a date today or earlier (any item, focused or not).

Someday and Maybe never show; Waiting For sorts last in its group. Meetings: today and
tomorrow, multi-day meetings on every covered day (`domain/meetingSpan.ts`). Tapping a saved tag
sets a **context filter**: only tasks and meetings with that tag show (any flow state except
Maybe), and when the tag is a Project/Area abbreviation, also everything belonging to that item.

**Focus mode** (`mode: 'focus'`, `settings.focusModeActive`): Daily in a one-column, no-TabBar
layout around the `#now` tasks; reopening the plugin lands back in it until it is left. Detail:
`docs/dev/history/technical-design-now-focus-mode.md`.

**Week and Month** share `screens/usePlanningScreen.ts` (loading and every meeting, focus and
goal action). Both have Quick Add (to the Inbox) on the right, then either the shared day panel
(after tapping a day) or the period focus panel (`ui/PeriodFocusPanel.tsx`, editable periods) or
the goal history (`ui/PeriodGoalsHistoryPanel.tsx`).

- **Week** (`screens/WeekView.tsx` header and navigation, body `screens/WeekPlanner.tsx`): left a
  chip grid (`ui/WeekGrid.tsx`, 4 × 2 chips per weekday, 2 × 2 per weekend day) or Google.
  Review's "Week ahead" step shows the same `WeekPlanner`.
- **Month** (`screens/MonthView.tsx`): left one row per day (`ui/MonthDaysColumn.tsx`) with only
  the hand-picked **highlights**, meetings tagged `#monthly` (the M toggle, shown as an M mark on
  two-line rows); a trailing bracket in the title is its short form (`domain/monthHighlight.ts`).
  Meetings copied from Google on the Month view become highlights. Aggregate:
  `storage/monthlyAggregate.ts`.

Week and month offsets are plain state: every visit starts on the current period. Detail:
`docs/dev/history/technical-design-daily-todo-filter.md`,
`docs/dev/history/technical-design-weekly-view.md`,
`docs/dev/history/technical-design-monthly-view.md`.

### 2.8 Weekly Review

`screens/review/ReviewScreen.tsx` is a shell: a **hub** (`ui/ReviewHub.tsx`) listing every step
with its count and last-reviewed date, and the steps themselves, one component each in
`screens/review/steps/`. The step list, order and titles live only in `domain/reviewSteps.ts`
(`REVIEW_STEPS`, stable string ids):

| Step | Kind | Component |
|---|---|---|
| Week ahead | ritual | `WeekAheadStep` (the Week screen, next week from Friday) |
| Meetings to close out | backlog | `MeetingsCloseOutStep` |
| Gmail inbox (experimental) | backlog | `GmailStep` |
| Inbox to zero | backlog | `InboxStep` (Files pane, Refile, quick-file, marks card) |
| Stalled projects, Done awaiting review, On Hold reconsideration, Neglected areas | backlog | `ItemListStep` + `ItemDetails` (master/detail, `ui/ReviewMasterDetail.tsx`) |
| Unfocused next items | backlog | `UnfocusedNextStep` |
| Focus reset | ritual | `FocusResetStep` (monthly and weekly slots) |

`storage/reviewAggregate.ts` builds the lists from the cache: stalled projects and neglected
areas are Active items with no actionable open task (Someday/Maybe don't count; Waiting For does),
with shelved tasks offered for promotion; unfocused next items are Active items in no focus at all
with an open `#next` task that has no due date; meetings to close out come from
`isReviewOutstanding`.

- **Data** (`useReviewData.ts`): settings, live items, shared Inbox, paths, and an aggregate
  snapshot rebuilt only on load.
- **Frozen lists** (`useFrozenStepList.ts`): a step's list is captured when it is entered and
  kept until it is left; rows acted on stay with a checkmark. Rows themselves read live data.
- **Visit and resume** (`reviewVisit.ts`): which page is shown and the visit's recap tally are
  module-level, so they survive tab switches and reopening from a note; a relaunch starts on the
  hub.
- **Record per step.** "Reviewed ›" stamps the step's `reviewedAt`; "Skip ›", "‹ Back" and
  "Overview" do not. Each visit stores the step's recap counts (`ReviewSummaryCounts`) in
  `settings.reviewSteps[id]` (`storage/settingsStorage.ts`'s `updateReviewSteps`). Backlog steps
  that are empty count as reviewed (`emptyAt`). The Review tab's dot (`isReviewOverdue`) shows
  when any active step was last reviewed or seen empty more than 7 days ago; the Gmail step
  counts only while the Gmail integration is switched on (`activeReviewSteps`).

Adding a step means one id, one `REVIEW_STEPS` entry, one count in `buildReviewStepCounts` and
one step component. Detail: `docs/dev/history/technical-design-review-hub.md`,
`docs/dev/history/technical-design-review-master-detail.md`.

### 2.9 Status, close-out and archive

**Status.** `ItemStatus = 'active' | 'on-hold' | 'done' | 'archived'`. Projects offer Active /
On Hold / Done, Areas Active / On Hold; the parser accepts any value for either kind.
`storage/statusControl.ts`'s `setItemStatus` writes the plain statuses: leaving Active clears all
focus flags; Done stamps `doneAt` (cleared again on Active; editable with `setDoneDate`); an Area
going On Hold puts its Active assigned Projects on hold too (one direction only). `'archived'` is
written only by archiving.

**Area assignment.** A Project can support one Area (`area:` frontmatter, the Area's folder
name; `storage/areaAssignment.ts`). It is a reference, not a folder move. "Assign to Area…" in
the status panel arms Browse directly in its Areas list.

**Archive.** `storage/archive.ts`'s `archiveItem` moves the folder first, then stamps
`status: archived` and `archivedAt` at the new place, then drops the item from the cache.
Targets (`archiveTargetsFor`): a Project goes to `Archive/<doneAt year>/[<Area>/]<name>/`, an
Area merges into `Archive/<year>/<name>/` (`moveFolderMerge` checks every collision before
moving). An Area cannot be archived while an assigned Project is Active or On Hold
(`describeAreaArchiveBlock`, checked before the confirmation); assigned Done Projects are archived
first. Open marks move to the Inbox before archiving (§2.10). A merge that leaves an empty source
folder asks before deleting it. Archive is a one-way door: nothing in the app reads Archive back
(the Integrity Check is the only scanner); restoring means moving the folder by hand.

**Close-out.** A Project is archived through `screens/CloseOutWizard.tsx`, shown in the Review
tab. Full close-out has five steps (`ui/closeOut/`): Checklist, Contents, Outcomes, PDF, Archive;
quick archive runs Checklist and Archive only. Entry points: Review's "Done awaiting review"
(Close out… / Quick archive…), the Archive actions in other Review steps (quick), and "Close
out…" in the status panel.

- **Readiness** (`domain/closeOut/readiness.ts`): blockers (open todos, future meetings, a name
  collision at the target), warnings (meetings not closed out, week/month references, incoming
  links, open marks) and notices (unreadable notes, plugin opened from inside the project).
- **Plan** (`domain/closeOut/plan.ts`, `storage/closeOut/planStore.ts`): a `## Close-out`
  section in `project.txt` with the step, mode, deviations from defaults, PDF status and a
  journal. Leaving and coming back resumes; any change to contents or outcomes clears the "I
  checked the PDF" tick.
- **Layers**: `domain/closeOut/` (inventory, readiness, archive document, operation list, paths;
  pure) and `storage/closeOut/` (scan, context, PDF, execute). `execute.ts` runs the ordered
  operations (`archiveOps.ts`) one at a time, journaled and idempotent: outcome moves and link
  rewrites, then the PDF, the folder, and the `archivedAt` stamp. A failure stops without
  rollback; running again resumes.
- **Result**: the folder in the archive plus one long-term `<Project>.pdf` next to it (cover,
  linked contents, bookmarks, the project record, included note pages, an index of the rest).

Detail: `docs/dev/history/technical-design-project-close-out.md`,
`docs/dev/history/technical-design-status-archive.md`,
`docs/dev/history/technical-design-project-area-assignment.md`.

### 2.10 Lasso capture and marks

**Capture** (`screens/CaptureScreen.tsx`, `mode: 'capture'`). Opened from the lasso button
(`CaptureRequest {source: 'lasso'}`) or from a "marks to process" card (`source: 'marks'`, with a
scope and where to return). Left: `ui/capture/MarksColumn.tsx` (open marks grouped by note,
hidden when empty). Right: the picture, then `QuickAddWidget variant="capture"`: split rows
(✂ Split at cursor, `domain/captureText.ts`), a "File to" short list
(`domain/captureFileTo.ts` plus recent destinations from `storage/destinationUsage.ts`), and Save
buttons. "Link to this page" stores `<note>#page=N` as the item's `linkedFile`. When the source
page is a meeting's (`storage/threadProvenance.ts`'s `meetingForNotePage`: its own note, a page
link, or its page in a shared note - one `getKeyWords` call for that page), a saved todo gets
that meeting as provenance (§2.4).

**Recognition** (`supernote/lassoRead.ts`, `supernote/strokeRecognition.ts`). The lasso's strokes
are read once, rebuilt as new elements shifted to the top-left (`domain/marks.ts`'s
`shiftStrokes`) and recognized with the page size: the A5 X reports stroke points in a larger EMR
range than the page size implies, and unshifted strokes low on the page fail or come back
partial. One recognition runs at a time. `ui/capture/useRecognitionQueue.ts` recognizes the
selected mark plus three ahead; recognized text triggers an e-ink refresh.

**Mark for later** (`storage/marks.ts`'s `createMarkFromLasso`, run from `index.js` with
`showType: 0`, so the plugin view stays closed and the cache may not exist). A mark is one line
in the `## Marks` section of the file that owns the note (`markOwner`: the enclosing
Project/Area, else the Inbox):
`- 2026-11-05 10:42 [[Offsite prep.note]] p3 optional text ^m-20261105-104212-351`.
`storage/markStore.ts` writes these lines on one serial queue from a fresh disk read and applies
the result to the cache. Picture, strokes and recognized text live in the plugin's private data
folder (`storage/markData.ts`, `marks/<id>/`), deleted when the mark is processed; orphans are
cleaned up. A bookmark icon is drawn on the page (`supernote/markIcons.ts`, userData
`gtdpara:mark:<id>`), turned into a check on save and removed on discard; when the element is not
unique the change is kept in a pending list and retried. Only a problem shows
`ui/MarkOutcomeScreen.tsx`.

**Entry points.** `ui/MarksCard.tsx` ("n marks to process") under Quick Add on Inbox, Current
(this item's marks) and Review's Inbox step; it opens the capture screen through `ui/marksNav.ts`.
Close returns to the tabs as they were. Close-out reports open marks as a warning, and archiving
moves remaining mark lines into `Inbox.txt` first. The Integrity Check reports marks whose note is
missing. Detail: `docs/dev/history/technical-design-lasso-0.8.md`.

### 2.11 Integrations

Both integrations are **experimental switches** (Settings → Advanced, `domain/features.ts`,
read through `ui/featureStore.ts`). Off hides every entry point (Google tabs, the Gmail step and
Settings tabs); configuration stays stored. Both need the INTERNET permission, requested on first
use only.

**Google Calendar (ICS link).** `settings.googleCalendarIcsUrl` (a secret, §2.12).
`storage/googleCalendarCache.ts` fetches today plus 30 days (https only, `webcal://` upgraded),
parses with `domain/icsParser.ts` (unfolding, all-day, `TZID` via `Intl`, RRULE expansion,
`EXDATE`, `RECURRENCE-ID`), and keeps the last successful result in memory and in AsyncStorage
per profile; `fetchedAt` moves only on success, and a failed refresh keeps showing the cached
events. `ui/GoogleCalendarPanel.tsx` shows the events per surface with its own window (Daily 2
days, Week/Month their period, Current and Inbox 30) and copies one into a Project/Area or the
Inbox as a plain one-off meeting (`storage/googleCalendarCopy.ts`, end time and day count
included). Already-copied events are recognized by title, date and time and shown with ✓. Detail:
`docs/dev/history/technical-design-google-calendar.md`.

**Gmail (IMAP).** Review's "Gmail inbox" step (`screens/review/steps/GmailStep.tsx`) lists the
inbox, shows a selected email (`ui/GmailBodyPane.tsx`) and turns it into a todo or meeting: the
email text as a multi-page `.note` in `Resources/Gmail/` (`storage/gmailEmailNote.ts`,
`storage/textNote.ts`, `domain/textPagination.ts`) or an attachment saved into
`Resources/Gmail attachments/<subject>/` (`storage/gmailAttachments.ts`), attached as
`linkedFile`. IMAP runs in the native `GmailImapModule`
(`storage/gmailImapNative.ts`). `storage/gmailInboxCache.ts` keeps the list in memory and fetches
only on an explicit Refresh; bodies load on demand. Archive is optimistic: the email leaves the
list at once and the IMAP call runs in a serial background queue; on failure the email comes back
at its old place with an error. Credentials: `gmailEmail`, `gmailAppPassword` (secret),
`gmailImapHost`. Detail: `docs/dev/history/technical-design-review-gmail-inbox.md`,
`docs/dev/history/technical-design-gmail-email-note.md`.

### 2.12 Settings, profiles and diagnostics

**Settings screen** (`screens/settings/`): mini-tabs Folders, Focus, Calendar, Gmail (the last
two only while switched on), Tag Rules, Advanced, About. Folders, Focus, Calendar and Gmail edit
one draft (`useSettingsDraft.ts`) that only Save writes; every Save clears the cache (the next
screen builds it again) and the Gmail list, and a changed Inbox folder name moves the folder first (`storage/inboxFolder.ts`, refused
when the target exists, not moved when Base or Areas change in the same save). Tag Rules save
per rule; the switches on Advanced and About write immediately. Advanced holds Profiles, the
experimental switches, "Reload all files", "Run Integrity Check", "Keep tabs in memory" and
"Performance tracing". About shows version and build, the changelog ("What's new", also offered
once after an update), Debug logging and "Export debug bundle".

**Persistence.** `GtdParaSettings` (`domain/settings.ts`, defaults in `DEFAULT_SETTINGS`) is one
JSON blob in AsyncStorage (`storage/settingsStorage.ts`); load fills missing fields from the
defaults and runs idempotent migrations (Tag Rule key names, the default meeting rule,
experimental-switch defaults). Recent tags, recent capture destinations and the Google Calendar
cache are AsyncStorage entries per profile (`storage/profileKeys.ts`'s `profileScopedKey`). PARA
content never goes into AsyncStorage.

**Profiles** (`domain/profiles.ts`, `storage/profiles.ts`). A profile is a named configuration;
its file is `EXPORT/gtdpara/profiles/<id>.json`. Every setting is classified: per profile,
device-wide (`perfTracing`, `keepTabsAlive`, `debugLogging`, `lastSeenVersion`,
`activeProfileId`) or secret (`gmailAppPassword`, `googleCalendarIcsUrl` — per profile, but only
in AsyncStorage, never in a file). Switching writes the profile being left, reads the new one,
clears the caches and the return record, and remounts the shell. "Create demo space" writes demo
folders under `Note/gtdpara-demo` and a demo profile, never overwriting (`storage/demoSpace.ts`).
Detail: `docs/dev/history/technical-design-profiles-demo-space.md`.

**Diagnostics.** Everything gtdpara exports lives under `EXPORT/gtdpara/` and is written only
when asked for:

- **Logging** (`utils/log.ts`: `log`, `logWarn`, `logError`) goes to logcat and to an in-memory
  buffer (`utils/logSink.ts`); with Debug logging on, also to a rotating file in
  `EXPORT/gtdpara/debug/`.
- **Debug bundle** (`storage/debugBundle.ts`): version, device, a settings summary as yes/no and
  counts, data counts, recent errors and the recent log, run through `domain/redact.ts` so no
  password, calendar link or e-mail address leaves the device.
- **Integrity Check** (`storage/integrityCheck.ts`, checks in `domain/integrityCheck.ts`): walks
  Projects, Areas, Archive and the Inbox and writes one report. Checks include load errors, `#`
  in note paths, missing linked files and default Resources folders, duplicate headings and
  abbreviations, orphaned Area assignments, interrupted close-outs, missing mark notes, Inbox
  leftovers at the base root and unsafe file names. For unsafe note names it plans fixes
  (`domain/fileNameFix.ts`); "Fix file names (n)" renames after one confirm and rewrites the
  links (`storage/fileNameFix.ts`). Everything else is report-only.
- **Performance tracing** (`utils/perf.ts`, switch `perfTracing`): one trace per tab tap,
  navigation, reopen and cold start, ending after 1.5 s of quiet (15 s at most), written as JSONL
  to `EXPORT/gtdpara/debug/perf/` with data-volume stats (`storage/perfStats.ts`). Off costs one
  check per call. Analysis: `node scripts/perf-report.js`.
- **Stale build**: after an update the host can keep an older build loaded;
  `supernote/pluginRuntime.ts` detects it and `StaleBuildBanner` offers a restart of the host
  process.

**Dates and errors.** All date and time text shown to the user comes from
`domain/dateFormat.ts` (`6.10.`, `6.10. 14:05`, year only when not the current one); files keep
ISO. `domain/dateLabel.ts` and `formatReviewedAt` build relative labels on top of it. The text of
a caught error comes from `utils/errorMessage.ts`'s `errorMessage(e)`.

### 2.13 Platform and UI foundations

**Device layer** (`src/supernote/`). `fileSystem.ts` wraps the native `GtdParaFile` module and
`sn-plugin-lib`'s file APIs (list, stat, read, write, move, merge, note pages and keywords,
`openPath`); `lasso.ts`/`lassoRead.ts`/`strokeRecognition.ts` the lasso; `noteElements.ts` and
`sdkElements.ts` note elements; `pdfNative.ts` the native PDF writer (`GtdParaPdf`);
`textboxMetrics.ts` native text measurement; `pluginRuntime.ts` the runtime guard. Other native
modules: `GmailImapModule` (§2.11).

**Permissions and deletes** (`supernote/pluginPermissions.ts`). Declared: FILE:READ, FILE:WRITE,
FILE:DELETE, INTERNET (`PluginConfig.json`). Every file or network call checks its permission
right before use, through a wrapper with an 8-second timeout (the host's permission bridge can
hang without answering). FILE:DELETE is requested only after a confirmation that names what is
deleted (`ensureFileDeletePermission(description)`). The only deletes are `deleteEmptyFolder`
(native: empty folders only), `deleteTempTree` (only inside the private temp folder,
`getPrivateTempDir`, cleaned once per start) and the private data folder for marks
(`getPrivateDataDir`).

**Host limits.** Linked and shared notes are created with `PluginFileAPI.createNote` and a fixed
template name (`style_white`, or a MyStyle file); a template reference from
`getNoteSystemTemplates()` does not resolve there. Creating notes works only when the plugin was
opened from a note. The e-ink panel does not always flush a change that arrives without a tap:
`utils/screenRefresh.ts`'s `requestEinkRefresh()` (debounced app-wide, two animation frames
before the native `invalidatePluginView`) and `useEinkRefreshOnLoad()` do that explicitly.

**PDF pipeline.** `domain/pdf/` (`pdfDocument.ts`, `pdfLayout.ts`, `helveticaMetrics.ts`,
`pdfSpec.ts`) lays out an abstract document (headings, paragraphs, linked rows, images, anchors
resolved in passes for the table of contents). `storage/pdfExport.ts`'s `startPdfExport` renders
note pages to PNG (`generateNotePng`, template background included) in the private temp folder,
reports progress, can be cancelled, and has the native writer (PDF 1.4, grayscale Flate images,
Helvetica, link annotations, outlines) write a `.part` file that is renamed when done. Existing
PDFs are listed, not merged.

**Styling.** `ui/theme.ts` holds `FONT` (large 22, medium 17, small 15 — the only font sizes),
`COLORS` (grayscale; `accent` is black and used only for fills and borders), `SPACING`, `RADII`
and `useThemeColors()` for light/dark pairs; `ui/commonStyles.ts` holds shared styles. Color never
carries meaning: weight, underline, borders and icons (`ui/icons.tsx`, SVG) do.

**Pagination.** No list scrolls. `ui/PagedSection.tsx` is the fixed-height list box (header,
`‹`/`›` only when there is somewhere to go, a `+N` hidden count) and measures its own viewport;
`ui/pagination.ts`'s `usePagedByHeight` fills a page greedily by each row's real height, keeps the
current page across data changes, and supports `resetKey` and `jumpTo`. `PAGE_SIZE` anchors are
tuned on the device. Sizes and the element budget: `design-device-rendering.md`.

**Central status slot** (`ui/status/`). One 36 px strip, always reserved, under the TabBar and at
the top of capture and focus mode (`StatusFrame`). Publishers use `useStatus(id, msg)`,
`useErrorStatus(name, error, onDismiss)` or `useStatusApi()`; kinds by priority confirm > modal >
error > warning > success > info; one message shows, `‹ n/m ›` pages through the rest.
Screen-scoped messages clear on unmount or when a kept tab hides; `scope: 'global'` ones stay. No
auto-hide; ✕ dismisses; a long text expands over the content for 3 s. Picks are modals with
Cancel, confirms carry one action plus ✕ (`ui/useStatusConfirm.ts`). `MarkWrap`
(`ui/status/StatusMark.tsx`) puts a small ⚠/✓ on the control concerned without changing layout.
Load errors that replace a pane's content stay in place (`ui/LoadErrorNotice.tsx`). Detail:
`docs/dev/history/technical-design-status-slot.md`.

**Shared building blocks.** `ui/MiniTabs.tsx` (segmented tabs with `disabled`),
`ui/wizard/WizardFrame.tsx` + `StepIndicator.tsx` (multi-step flows), `ui/ReviewMasterDetail.tsx`
(list/detail), `ui/PillButton.tsx`, `ui/ProgressBar.tsx`, `ui/StatusMarkRow.tsx`,
`ui/ClipboardTextInput.tsx` (text field with its own Select All/Copy/Cut/Paste strip, because the
native selection toolbar does not work in the plugin host), `ui/useStableCallback.ts` (stable
callbacks for memoized panels).

---

## 3. Architectural rules

These rules are binding for every change. A deliberate exception says why in a comment at the
place it happens.

**Layers and purity**

- `src/domain/` stays free of React Native, `sn-plugin-lib` and I/O — no exceptions. I/O and all
  writes live in `src/storage/`, device and native calls in `src/supernote/`, UI in `src/ui/` and
  `src/screens/`. `storage/` never imports from `ui/`.
- A screen holds layout and handlers; logic that more than one screen needs goes into a hook
  (`ui/`) or a module (`storage/`, `domain/`), never into a second copy.

**Files and data**

- **Files are the single source of truth.** Task, Meeting, focus, goal, scope and mark content
  lives in the data files; AsyncStorage holds configuration and per-profile UI conveniences only.
- **Identity is the folder.** No synthetic ids; a Project/Area is referenced by its folder name
  (`area:`) or path. The data files stay `.txt` with Obsidian-flavored Markdown content.
- **One tag mechanism, one field mechanism.** Typed meanings are `#tags` in the text: flow
  state, waiting-on, `#now`, meeting tracking, highlights, context and abbreviations. A new typed
  meaning is a new reserved word or a nested `type/…` form (and an entry in `RESERVED_BARE_TAGS`
  or `isContextTag`). Data gtdpara records about an entry (due, created, completion, provenance)
  are trailing `[key:: value]` fields, parsed like links. Never a second syntax for the same
  meaning. Derived fields are recomputed from the text and fields (`domain/taskEdit.ts`,
  `deriveMeetingFields`), never edited on their own.
- **Span-scoped writes.** New file content is its own `## ` section (or frontmatter key) read and
  written with `getSpan`/`setSpan` (`readSectionLines`/`writeSectionLines` for a section a feature
  parses itself). Never parse and regenerate a whole file.
- **Frontmatter saves** take one `FrontMatterFields` built from `frontMatterOf(item)` plus the
  change, so no save clears a field it did not mean to change.
- **Format changes** need a parser change, a serializer change and a round-trip test; must read
  files written by every older version; and need an Upgrade note in the CHANGELOG.
- Unknown lines survive but move to the end of their section; never design a feature that depends
  on their position.
- **Secrets** (passwords, private calendar links) never go into a file, a log, a debug bundle or a
  profile file. Every new setting gets a default in `DEFAULT_SETTINGS` and a classification in
  `domain/profiles.ts`.
- **File changes are visible.** Moves, overwrites and deletes are confirmed before and reported
  after (`domain/fileChangeText.ts`). A delete needs a confirmation naming it, then FILE:DELETE,
  then `deleteEmptyFolder`. Temporary files only in the private temp folder. Everything gtdpara
  exports goes under `EXPORT/gtdpara/`.

**Cache and write paths**

- The cache must be reproducible from a rebuild: a new `CachedItem` field is derived from the file
  alone.
- **Write-through is not optional.** Write the file first, then the cache, in the same operation,
  so a failed write never leaves the cache claiming a change. Every cache mutation calls
  `notifyCacheChanged()`.
- **Screens never poll or refresh the cache by hand.** They read items through `useCachedItems()`
  and the Inbox through `useCachedInbox()`; they never `setItems(cache.items)` (the cache mutates
  in place, so that is a no-op).
- **Create and change tasks and meetings only through `storage/itemMutations.ts`.** No Task or
  Meeting literal, no "Inbox or item?" branch in a screen.
- Reads prefer the cache (`findCachedItem`, `ensureItemCached`, `getCachedData`). A screen that
  needs cross-project data reads the cache and builds it only when none exists; it never scans
  the file system per item. Live folder listings (the Files pane) are the exception.
- **Address the Inbox through `paths.inboxFolder`** of the cache's or `resolvePaths`' paths, never
  `paths.base`.

**Editing and moving**

- **One move path.** Every move of a task or meeting to another Project, Area or the Inbox goes
  through `storage/entryMove.ts`'s `moveTask`/`moveMeeting`, which also moves or re-points the
  note. Closing an entry from outside its own screen goes through `storage/itemMove.ts`.
- **One task change path.** A Task is built or changed only through `domain/taskEdit.ts` (and
  `storage/itemMutations.ts`'s `buildTask`/`applyTaskEdit` on top of it), never by spreading
  derived fields or toggling `done` by hand; `npm run code-health` reports `deriveTaskFields`
  outside `src/domain/`.
- **One edit and arm state.** A screen's edit target and Files-pane arm come from
  `ui/useEditTarget.ts`; every handler that switches or ends the edit goes through it, so
  save-then-switch applies everywhere. Close an edit on confirmed success, never on "the call
  finished".
- **Index safety.** When a list is filtered for display, compute each row's index against the full
  array first and filter afterwards; every mutation indexes into the full array.
- Filing targets come from the Files pane's Browse root or an abbreviation match; Resources is
  never a filing target.

**Styling**

- All font sizes come from `FONT` in `ui/theme.ts`; no literal `fontSize`. A new size needs a
  reason against the three-size rule. Shared colors, spacing and radii come from `ui/theme.ts`.
- Grayscale only: color never carries meaning.
- No scrolling lists: use `PagedSection`. Rows that can wrap account for their real height.
- Check a fixed-width field or chip against the target device (`design-device-rendering.md`) and
  the *longest* real value it must show in full.
- Keep every `TextInput`, and what the user needs while typing (its Save/Cancel, a validation
  mark), in the upper two thirds of the screen, above the keyboard/handwriting panel. Quick Add
  sits above the list it adds to.
- A `ScrollView` that holds a `TextInput` next to other `Pressable`s needs
  `keyboardShouldPersistTaps="handled"`, or the first tap on a button only blurs the field.
- Content that appears without a direct tap calls `requestEinkRefresh()` or
  `useEinkRefreshOnLoad()`.

**User-facing messages**

- Every error, warning, confirmation, pick state and success message goes through the central
  status slot (`useStatus`/`useErrorStatus`/`useStatusApi`). No new inline "⚠ …" line, no
  `Alert.alert`. The only exception is a load error that replaces a pane's content
  (`LoadErrorNotice`).
- Mark the control concerned with `MarkWrap` (⚠ or ✓) when there is one; the text belongs in the
  slot.
- Every publisher has a stable id (`'<screen>.<purpose>'`); a component that can be mounted twice
  needs a per-instance suffix (`useErrorStatus` adds one).
- Dates and times shown to the user come only from `domain/dateFormat.ts`; files keep ISO.
- The text of a caught error comes only from `utils/errorMessage.ts`'s `errorMessage(e)`.
- Log only through `utils/log.ts`; never `console.*`.

**Navigation and lifecycle**

- Navigation is the tab model in `App.tsx`. A new persistent screen is a new `AppTab`, not its
  own header or back button; "✕ Close plugin" lives only in `TabBar`. Full-screen modes are
  `capture` and `focus`; overlays (help, thread overview, mark outcome) leave the screen behind as
  it is.
- `reorient()` is the one place that decides where the plugin lands when it opens or comes back,
  and the one place that starts the cache refresh.
- A kept screen does its "on show" and "on hide" work through `ui/screenActivity.ts`, not
  through mount and unmount.

**Reusable building blocks**

- Anything that produces a PDF builds a `domain/pdf` `PdfDocument` and goes through
  `storage/pdfExport.ts`. No second renderer, no direct call to the native writer.
- Multi-step flows use `ui/wizard/WizardFrame` + `StepIndicator` and keep their state in a
  span-scoped section of the item's own file (as `## Close-out` does), so they survive leaving
  the plugin.
- File moves that can fail halfway go through an operation list with a journal (the
  `archiveOps.ts`/`execute.ts` pattern): shown before running, idempotent, resumable.
- Lists use `PagedSection`, messages the status slot, rows `TaskRow`/`MeetingRow`, adding and
  editing `QuickAddWidget`, picking a file or item the Files pane's arming.

**Code and verification**

- Comments say what the code does and why, never when or what it replaced: no dates, no "used
  to", "previously", "no longer" (`scripts/code-health.mjs` reports them). History lives in git
  and `docs/dev/history/`.
- A new source file stays at or below 1,000 lines. Longer existing files are listed in
  `scripts/code-health-baseline.json` and may only shrink (`--update-baseline` ratchets them
  down).
- Pure logic gets Jest tests in `__tests__/`. Run `npm run check` (generated content, tsc, eslint,
  Jest, script tests, code health) before committing.

---

## 4. Why it is built this way

**Files as the source of truth.** The user's data must outlive the plugin and stay readable in
Obsidian or any editor. That is why every piece of PARA content, including focus flags, goals,
scope, marks and the close-out plan, lives in the data files rather than in AsyncStorage, and
why the identity of an item is its folder. Renaming an Area does not update Projects that name
it; that is accepted, because there is no hidden id to reconcile.

**Span-scoped, forgiving parsing.** Users edit the files by hand. The parser therefore never
throws on messy input (several flow tags, unknown status values, extra lines), and a save
touches only its own section, so a hand-written paragraph or a foreign section survives every
plugin write.

**You type tags, gtdpara writes fields.** A second syntax for the same meaning would fragment
what users type and what Obsidian shows. What users type or tap is a plain Obsidian tag (nesting
with `/`); the cost is accepted lossiness (a waiting-on name becomes a slug). What gtdpara records
on its own (dates) is a Dataview field at the end of the line, which the Obsidian Tasks plugin
(Task Format: Dataview) and Dataview read, and which stays out of the typed text.

**A cache, kept honest.** Reading every data file on every screen open is too slow on the device
once there are dozens of items. The cache trades a small window of staleness against external
edits for responsiveness; the stamp-based refresh on every open closes most of that window, and
"Reload all files" closes the rest. In-place mutation plus a change notification keeps memory and
work low while making re-renders reliable.

**One path for each kind of change.** Copies of "add a task", "move an entry" or "edit state"
drifted apart in the past and produced real data bugs (fields lost on save, notes left behind on
a move, wrong rows edited under a filter). `itemMutations.ts`, `entryMove.ts`, `useEditTarget.ts`
and `FrontMatterFields` exist so a fix lands once and applies everywhere.

**Moves append first.** A duplicate is visible and easy to clean; a lost item is not. Every
move, filing and close-out operation is ordered so an interruption errs towards duplication and
can simply be run again.

**E-ink first.** Scrolling, animation and moving layouts cost full refreshes and attention on
e-ink. Lists page instead of scroll and keep a fixed height; one status strip with a fixed place
replaces dialogs and inline warnings; color never carries meaning; inputs stay above the
handwriting panel; refreshes are requested explicitly when content changes without a tap.

**Few, deliberate choices.** Every entry is a conscious choice (`design-philosophy.md`): no
recurring meetings, no automatic filing, abbreviation tags only *offer* a destination, focus
slots are capped, and Done is a status someone sets. Focus filters what Daily shows to `#next`
tasks of focused items, so a busy project cannot flood the day; what falls out resurfaces in the
Review instead of disappearing.

**Review as a walk, not a report.** The Weekly Review fixes things where they are found. Lists
freeze while a step is open, so rows don't vanish under the user; each step keeps its own record,
so a partial review still counts, and empty backlog steps count as done.

**Archive as a one-way door.** Archiving moves the folder and stamps the status together, so
the app never shows an "archived" item in Projects. Nothing reads Archive back, which keeps scans
small and the active lists clean; the close-out PDF is the long-term, device-independent record of
a finished project.

**Integrations stay optional and one-way.** Google Calendar and Gmail depend on outside
services, so they sit behind experimental switches, fetch only on request, and copy into
gtdpara's own format. A copied meeting or email becomes ordinary file content with no link back;
deduplication by title, date and time avoids a schema change for event ids.

**Secrets and exports stay contained.** Debug bundles go to public issues, so they carry counts
and yes/no facts, pass through redaction, and never include secrets. Profiles are shareable files
for the same reason: secrets stay in the app's own storage.

**Native code only where the host has no API.** Moving and merging folders, statting files in
bulk, measuring text, writing PDFs and talking IMAP are native modules because `sn-plugin-lib`
offers nothing for them; everything else uses the SDK, so the plugin keeps working across host
updates.
