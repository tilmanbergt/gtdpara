# Technical design: files changed elsewhere (0.6.0)

Status: **designed, waiting for Tilman's approval** - 2026-10-04.
Branch: `feature/files-0.6`. Scope agreed in chat on 2026-10-03/04 (backlog proposal "0.6.0
files changed elsewhere").

The theme: gtdpara's data lives in plain files that are also edited elsewhere (on the computer,
in Obsidian via Supernote Cloud Sync). 0.6.0 makes picking up those edits cheaper and quieter,
cleans up old file names that break Obsidian links, and fixes the one place where gtdpara itself
breaks a link (moving an item with a note). Plus a few small debts and checks.

## 1. Requirements as decided

| # | Item | Decision (Tilman, 2026-10-04) |
|---|---|---|
| R1 | Reload only what changed | Checked **when gtdpara is reopened** (plugin opened / sidebar button), not on every tab switch. |
| R2 | Inbox in the shared cache | Prerequisite for R1, so the Inbox follows the same rule. |
| R3 | Old file names with `# [ ] ^` | Integrity Check reports them; **fix all at once** after one confirmation. Links (`→ [[...]]`) are rewritten. |
| R4 | Moving an item with a linked note | **Confirm first.** An own note moves with the item. A page in a **shared note is not moved**; the message says so, and the item keeps linking to the old shared file. |
| R5 | Interrupted close-out | Integrity Check finding. |
| R6 | Recurring meetings | **Remove the code** (model fields, types); hand-written lines keep surviving as unknown lines. |
| Q | Quick wins | Obsidian principle in design-philosophy; Reload all files keeps unsaved Settings edits; two-line meeting rows with dates; Files-pane device check; report to Ratta. |

Out of scope: Inbox special cases, removing the 0.2.0 Inbox move code, ReviewScreen refactors,
`TagRule` rename, new features.

## 2. Current state (code check, 2026-10-04, on 0.5.0)

- **Reopen = full rebuild.** `App.tsx`'s `reorient()` runs on every open and sidebar press and
  calls `rebuildCache(settings)` in the background: it lists Projects and Areas and re-reads
  **every** `project.txt`/`area.txt`, then always calls `notifyCacheChanged()`. So outside edits
  *are* picked up today on reopen, but at full cost every time, and every subscribed screen
  re-renders even when nothing changed (render-perf round F).
- **The Inbox is not in the cache.** Daily, Week/Month (`usePlanningScreen`), Inbox and Review each
  load `Inbox.txt` themselves (`loadProjectFile('inbox', …)`) and keep it in local state
  (`setInbox`: Daily 6×, Inbox 5×, Review 21×, planning 5×). Daily and planning also re-read it on
  every tab show (`useOnScreenShow` "quiet reload"). Storage code (`itemMove`, close-out,
  `googleCalendarCopy`, Capture) reads it directly as well.
- **No modification times.** The native `GtdParaFile.listFolderEntries` returns `name`, `path`,
  `isFolder` only; there is no stat call. `moveFile(from, to)` exists (rejects an existing target,
  creates the parent folder).
- **Integrity Check** (`domain/integrityCheck.ts` + `storage/integrityCheck.ts`) is a registry of
  per-item checks (`IntegrityCheck`, with an `IntegrityCheckIO` capability for disk checks) and
  whole-run checks; report-only, writes a report to `EXPORT/gtdpara/debug`. It already has
  `hashNotePath` for `#` in note paths.
- **Moves.** One todo/meeting changes file in 9 places: Inbox filing (`fileInboxTask/Meeting` in
  Inbox and Review), quick-file on edit (Inbox, Review, Daily, Week/Month, Current), Current's
  Refile (`ProjectDataPanel`), and close-out's checklist (`itemMove.moveTaskTo/moveMeetingTo`).
  All append to the target first, then remove from the source. **None touches `notePath`**: an own
  note (`Todos/x.note`, relative to the item folder) then points into the new folder, where the
  file doesn't exist; a shared anchor (`Meetings/Coaching 2026.note#kw`) points to a file that
  doesn't exist there either. Absolute links (lasso source notes, starting with `/`) and linked
  files (`+[[…]]`, relative to the base root) are unaffected.
- **Close-out journal.** `domain/closeOut/plan.ts` journals each archive op (`move-pdf`,
  `move-folder`, `stamp`, …); `archiveStarted(plan)` = any journal entry. A run is complete when
  `stamp` is done.
- **Recurrence.** `Meeting.recurrence` is always `null` and `occurrences` always `[]`: the parser
  never fills them (indented occurrence lines and anything unparsed already go to `extraLines`).
  Left: the types in `domain/types.ts`, 3 literal assignments, `perfStats` counters, comments,
  and a design-overview §4 bullet.
- **Reload all files** (0.5.0) calls Settings' `loadAll()`, which also resets the form values -
  unsaved Folders/Focus edits are lost.

## 3. Design

### 3.1 Native: `statFiles` (R1)

`GtdParaFileModule.kt` gets one method:

```kotlin
@ReactMethod fun statFiles(paths: ReadableArray, promise: Promise)
// -> [{path, exists, lastModified (ms, 0 if missing), size (bytes, -1 if missing)}]
```

One bridge call for all data files (50+ files cost one round trip). Permission: file read
(`ensureFileReadPermission` in the JS wrapper `supernote/fileSystem.ts` `statFiles(paths)`), same
as listing. No other native change.

### 3.2 Cache: incremental refresh (R1)

- `CachedItem` gets `stamp: FileStamp | null` with `FileStamp = {lastModified, size}` of its data
  file at load time. Both values are compared (a sync may set an older `lastModified`; size
  catches most of those). Equality, not "newer than".
- `rebuildCache` (full) is unchanged in behavior, plus one `statFiles` call to record stamps.
- New `refreshCache(settings)` (`storage/dataCache.ts`), de-duplicated like `rebuildCache`:
  1. No cache yet, or the configured paths differ from `cache.paths` → `rebuildCache`.
  2. List Projects and Areas (2 calls, as today) → folders added / removed.
  3. `statFiles` for every item's data file **and** the Inbox file.
  4. Re-read only items whose stamp differs, plus new folders (with `assignDefaultAbbrevIfMissing`);
     drop removed ones; re-read the Inbox if its stamp differs (§3.3).
  5. `notifyCacheChanged()` **only if something changed**; log `refreshCache: n changed, a added,
     r removed, inbox changed yes/no` and a perf mark.
- `App.tsx` `reorient()` calls `refreshCache` instead of `rebuildCache`. Settings → Advanced →
  "Reload all files" stays a full rebuild (the explicit "trust nothing" button).
- gtdpara's own writes leave the cached stamp behind the file, so the next refresh re-reads that
  file once. Accepted: one extra read per edited file, no special bookkeeping.
- Screens need no change for items: kept tabs already re-render on cache notifications
  (`useCachedItems`), and now only when something actually changed.

Living docs: design-overview §2.3 (cache) and the cache module comment.

### 3.3 Inbox in the cache (R2)

- `DataCache` gets `inbox: ProjectFileState | null` and `inboxStamp`. Loaded by `rebuildCache`
  and `refreshCache`.
- `storage/dataCache.ts`: `getCachedInbox()`, `setCachedInbox(state)` (write-through + notify,
  same contract as `updateItemTasks`).
- `ui/useCachedInbox.ts`: like `useCachedItems` - subscribes, returns the current Inbox state.
- Screens: Daily, `usePlanningScreen`, Inbox, Review read the Inbox from `useCachedInbox()`; their
  `setInbox(next)` becomes `setCachedInbox(next)`. The quiet Inbox re-read on tab show in Daily
  and `usePlanningScreen` goes (the reopen refresh covers it). `itemMutations`' `InboxContext`
  keeps its shape (it already returns `nextInbox`); callers pass it to `setCachedInbox`.
- Storage readers (`itemMove`, close-out `context`/`execute`, `googleCalendarCopy`, Capture,
  `GoogleCalendarPanel`) keep reading the file directly for now - correct, just not cached. They
  get a `setCachedInbox` after they **write** it, so screens see the change.
- Review's step snapshots stay frozen as today; only its live Inbox copy moves to the cache.

Living docs: design-overview §2.29 (observable cache, removes the "Inbox outside the cache"
point in §4).

### 3.4 Moving an item with its note (R4)

One shared move function replaces the 9 hand-written append-then-remove sequences:

```ts
// storage/entryMove.ts
moveEntry({
  entryKind: 'task' | 'meeting',
  source: {kind: 'inbox'} | {kind: 'item', path},
  index, entry,              // entry = the (possibly edited) Task/Meeting to write
  target: {kind: 'inbox'} | ({kind: 'item'} & InboxFilingTarget),
  paths,
  confirm: (text: ConfirmText) => Promise<boolean>,
}): Promise<{moved: boolean; entry: Task | Meeting; noteMovedTo: string | null}>
```

Steps:

1. **Plan the note** - pure `domain/noteRelocation.ts`
   `planNoteRelocation(notePath, sourceFolder, targetFolder, subfolder)`:
   - `none`: no `notePath`, or an absolute one (lasso source note) → nothing to do.
   - `own`: relative path without anchor → move the file to
     `<target>/<Todos|Meetings>/<same name>` (collision-free name, `storage/fileNaming.ts`).
   - `shared`: relative anchor `file#keyword` → the page stays; the new `notePath` is the same
     anchor with the **absolute** file path (`/storage/…/Coaching/Meetings/Coaching 2026.note#kw`).
     Absolute paths are already supported by `joinNotePath`/`classifyNotePath`.
   - If the own note file doesn't exist (deleted), nothing is moved and `notePath` stays; the note
     icon offers "recreate" in the new place as today.
2. **Confirm** (only for `own` and `shared`), through the status slot, texts in
   `domain/fileChangeText.ts`:
   - own: "Move "Kickoff" to Acme? Its note **2026-10-07 - Kickoff.note** moves to Acme/Meetings."
     Action **Move**, ✕ cancels the whole move (nothing changes).
   - shared: "Move "Session" to Acme? Its page stays in the shared note **Coaching sabina 2026**
     (in Coaching/Meetings); the meeting keeps its link to that page." Action **Move**.
   The confirm hook is generalized: `ui/useStatusConfirm.ts` (`useNoteCreateConfirm` becomes a thin
   wrapper), same one-at-a-time / ✕-on-hide rules.
3. **Write**: move the note file (`moveFile`) → append the entry with the new `notePath` to the
   target → remove it from the source. Order keeps today's rule (a failure leaves a duplicate,
   never a loss); a failed note move stops before any data file is written.
4. **Report** in the status slot: "Moved "Kickoff" to Acme, with its note." (file changes are
   visible, InkHub design §3.8).

Call sites switch to `moveEntry` and apply its result to their own state:
InboxScreen (file + quick-file), ReviewScreen (Inbox-to-zero file + quick-file), DailyView and
`usePlanningScreen` (quick-file), ProjectDataPanel (Refile + quick-file - keeps updating its own
panel state from the returned values, so its refresh doesn't change), CloseOutWizard (via
`itemMove.moveTaskTo/moveMeetingTo`, which become thin wrappers over `moveEntry`). Adding a *new*
item to a destination (no `notePath`) keeps using `appendTaskToTarget/appendMeetingToTarget`.

Living docs: design-overview §2.x (filing/refile) and §4 "Moving items: one helper" point removed.
Help: `quick-add.md` / `projects-and-areas.md` (Refile) - a sentence on what happens to notes.

### 3.5 Old file names: report and fix all at once (R3)

**Which files** - only notes gtdpara manages and links from active data:
- referenced by a relative `notePath` (own note, or the file part of a shared anchor) from a
  Project, Area or the Inbox, and
- whose name contains a character of `domain/fileName.ts`'s rule (`invalidFileNameChars`).

Report-only (no rename), listed in the report with the reason: absolute links (lasso source notes
are the user's own notebooks), linked files `+[[…]]` (the user's files), Project/Area folder names
(renaming changes the item's identity: `area:` references, focus, abbreviations), and archived
items (left as they are, like the 0.2.0 Inbox move).

**Domain** (`domain/fileNameFix.ts`, pure, tested):
`planFileNameFixes(refs: NoteRef[]) → {fixes: FileFix[]; reportOnly: Finding[]}` -
`NoteRef = {itemPath, itemKind, entityKind, index, notePath, absoluteFile}`; groups references by
file (a shared file has many), new name = `sanitizeFileNameComponent(stem) + ext`, and the
rewritten `notePath` for every reference (keyword part of an anchor unchanged).

**Integrity Check**: new per-run check `unsafeFileName` (findings for both kinds). The summary
line gets "**Fix file names (n)**" when there are fixable ones.

**Fix** (`storage/fileNameFix.ts`), from that action:
1. Confirm, all at once: "Rename n files so links work in Obsidian? Their links in your projects
   and areas are updated." `detail`: up to 8 "old → new" lines, then "and k more". Action **Rename**.
2. Per file: collision-free target name in the same folder → `moveFile` → rewrite every
   referencing `notePath` (span-scoped saves through the existing write-through: `saveTasks` /
   `saveMeetings` + `updateItem*` / `setCachedInbox`), item by item.
3. Result line: "Renamed n files and updated m links." plus a failure count; every failure logged
   with the file. A failure on one file doesn't stop the rest.
4. A crash between rename and link rewrite leaves a link to a missing file; the existing
   Integrity Check findings catch it, and the report lists the rename (old → new) so it can be
   fixed by hand. No journal (accepted: one file at a time, seconds).

Risk / device check: links **inside notes** (Supernote link elements) that point to a renamed
note are not updated by a plain rename. gtdpara's own notes link to linked files, not to each
other, so this should be rare; the device test checks it (§5).

Help: `troubleshooting.md` (Integrity Check) and `files-and-folders.md` (file names).

### 3.6 Interrupted close-out (R5)

`domain/closeOut/plan.ts`: `closeOutInterrupted(plan) = archiveStarted(plan) &&
!isJournalDone(plan, 'stamp')`. New per-item Integrity Check `closeOutInterrupted` for Projects
and Archive entries: "Close-out of <name> was interrupted - open its close-out to finish it."
No change to the Review hint.

### 3.7 Remove recurrence (R6)

Delete `Recurrence`, `RecurrenceKind`, `MeetingOccurrence`, and `Meeting.recurrence` /
`Meeting.occurrences`; the three literals that set them; the `perfStats` counters
(`occurrences`, `recurring`); stale comments. The parser keeps sending indented and unparsed
lines to `extraLines` - add a round-trip test with a hand-written series line and an indented
occurrence line to prove they survive. design-overview §4 "Recurring meetings" bullet becomes a
present-tense rule in §3 (file format: "series lines written by hand are kept as they are; the
plugin doesn't create or read series").

### 3.8 Quick wins

- **Q1 Obsidian principle**: design-philosophy gets a short section "The files are the
  interface" (outside edits are normal, unknown lines survive, the cache trusts the disk, names
  safe for Obsidian, layout readable from outside); `docs/user/philosophy.md` one sentence.
- **Q2 Reload keeps unsaved Settings edits**: `handleReloadAllFiles` reloads only the MyStyle
  listing (`loadMyStyle()`, split out of `loadAll`), not the form values.
- **Q3 Two-line meeting rows**: check on the device with a two-digit day; if the time is cut,
  `TIME_COLUMN_DP.dateTime.twoLine` 96 → 104. (Device check first, change only if needed.)
- **Q4 Files pane**: device check that a Quick Add note appears at once (fixed in 0.3.0, never
  confirmed). Close the backlog item or reopen as a bug.
- **Q5 Report to Ratta**: draft text (createNote blocked when opened from a PDF/EPUB; NOTE vs. DOC
  finding) - in the claude.ai project, not the repo; Tilman sends it.

## 4. Steps and commits

Each step one commit (`RELEASING.md` §3), checks green after each. Order = low risk first, so
`main` could take the branch at any step.

| Step | Content | User-visible / CHANGELOG |
|---|---|---|
| S1 | R6 remove recurrence + round-trip test | no |
| S2 | Q2 Reload keeps Settings edits | Fixed |
| S3 | R5 interrupted close-out check + tests | Changed (Integrity Check) |
| S4 | Q1 Obsidian principle (docs) | no |
| S5 | §3.1 native `statFiles` + JS wrapper | no (needs build) |
| S6 | §3.3 Inbox in the cache (+ `useCachedInbox`, screens) | no (behavior same) |
| S7 | §3.2 `refreshCache` on reopen | Changed: "Reopening gtdpara only reads files that changed - faster, and screens no longer redraw when nothing changed." |
| S8 | §3.4 `useStatusConfirm`, `noteRelocation`, `moveEntry`, 9 call sites | Fixed: "Moving a todo or meeting to another project moves its note with it (after asking). A page in a shared note stays where it is and stays linked." |
| S9 | §3.5 file name check + fix all | New: "Integrity Check finds old file names that break Obsidian links and renames them all at once, updating their links." |
| S10 | Q3 (only if needed) | Fixed |
| S11 | design doc As built | no |

Help pages and living docs go into the step that changes the behavior. Version: **0.6.0**.

## 5. Test plan

Off-device, every step: `npx tsc --noEmit`, `npm test`, `npm run test:scripts`. New tests:
`domain/noteRelocation` (none/own/shared/absolute/missing), `domain/fileNameFix` (grouping,
shared file with several references, keyword untouched, absolute/archived report-only),
`closeOutInterrupted`, meetings round trip with series lines, `refreshCache` with a mocked
`fileSystem` (unchanged → no notify; one changed → only that file read; added/removed folder;
paths changed → full rebuild; Inbox changed), `moveEntry` (✕ writes nothing; own note moved then
data files; shared → absolute anchor; note move fails → no data write), `useStatusConfirm`.

On the device (demo space):

1. **Reopen**: edit one `project.txt` on the computer, reopen gtdpara → only that change appears;
   logcat shows `refreshCache: 1 changed`. Reopen without changes → `0 changed`, no redraw.
   Add and delete a project folder outside → appears / disappears. Edit `Inbox.txt` outside →
   Daily and Inbox show it after reopen.
2. **Move with own note**: Refile a todo with a note from project A to B → confirm names the note;
   ✕ changes nothing; Move → note is in `B/Todos`, the note icon opens it. Same via quick-file on
   Daily and via Inbox filing.
3. **Move with shared page**: meeting on a shared-note rule → confirm says the page stays;
   after Move the note icon opens the page in the old file.
4. **Close-out**: checklist "move to another project" for a todo with a note → same confirm.
5. **File names**: create (in 0.4.0 style) a note named `Call #marco.note` linked from a todo, run
   Integrity Check → "Fix file names (1)" → confirm → renamed, todo opens its note, Obsidian link
   works. A note linked from two meetings (shared file with `[x]`) → both links updated.
   Check whether a Supernote link element inside another note to a renamed file still works.
6. **Interrupted close-out**: stop an archive run midway (e.g. leave the plugin during the run) →
   Integrity Check reports it.
7. **Settings**: change a folder name without saving, Reload all files → the edit is still there.
8. **Two-line rows / Files pane**: Q3, Q4.
9. Release checklist (`RELEASING.md` §6).

## 6. Open points

- O1: `statFiles` on a few hundred files - one call, expected well below 100 ms; measured with perf
  tracing on the device (S7).
- O2: Supernote Cloud Sync and `lastModified`: if a synced file keeps its old time *and* size,
  the change is missed until "Reload all files". Accepted; the help says so.
- O3: Links inside notes to a renamed note (§3.5) - device check decides whether the fix needs a
  warning line.
