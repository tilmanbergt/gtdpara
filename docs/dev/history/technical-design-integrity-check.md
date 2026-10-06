# Technical Design: Integrity Check

2026-09-23. Grew directly out of [[bugfix_shared_note_content_missing]]:
after fixing two rounds of the same `#`-in-notePath collision, Tilman hit
the practical problem of finding any *pre-existing* corrupted notePath left
over from before the fix shipped - the Supernote connects to Windows as an
MTP device, not a drive-lettered folder, so a plain Node script couldn't
read its files directly without a manual copy-out step first. Tilman's
suggestion: let the app itself do the scan, since it already has native
access to the whole `Note` tree.

## 1. Goal

A "Run Integrity Check" action in Settings → Folders that scans every
Project/Area/Archive/Inbox data file for known notePath problems and writes
a single report to the debug log folder, with a quick on-screen summary
after it runs.

## 2. Scope of scanning

- Projects (`settings.projectsFolder`)
- Areas (`settings.areasFolder`)
- Archive (`settings.archiveFolder`) - included deliberately, unlike
  `storage/dataCache.ts`'s cache, which explicitly skips Resources/Archive
  ("hidden from Home for now"). Once something's archived, "there's no
  restore/browse-Archive UI... nothing in the app reads the item back"
  (`storage/archive.ts`'s own doc comment) - Archive is exactly the place a
  stale corrupted notePath could otherwise sit forever with no other way to
  find it.
- Inbox (the single `Inbox.txt` at the base root)
- Resources is NOT scanned - it holds linked/attached files only, no
  Task/Meeting/notePath data structurally.

Archive folders aren't kind-tagged the way the Projects/Areas roots are -
`archiveItem` moves either a Project or an Area folder into the same flat
`Archive/` root - so `detectArchivedItemKind` (storage/integrityCheck.ts)
tells them apart by which data file (`project.txt` vs `area.txt`) is
actually present in each Archive subfolder.

Runs its own independent read pass rather than depending on
`storage/dataCache.ts`'s in-memory cache - the cache's Resources/Archive
exclusion would otherwise silently narrow this check's coverage, and this
way a check doesn't require the cache to have been freshly rebuilt first.
Each Project/Area/Archive/Inbox data file is read via the existing
`loadProjectFile(kind, path)` (`storage/projectFile.ts`), so notePath
extraction reuses the exact same parsing the app already trusts - no
reimplementing text parsing.

## 3. Check architecture (extensible registry, now two shapes)

Built as a small registry from the start (Tilman: "right now just hash, but
should be setup to easily integrate further checks"). A round of new checks
(2026-09-23, from Tilman finding a real duplicated-heading area.txt and
asking what else would be worth checking) needed more than the original
per-item shape could offer, so a second shape was added alongside it:

```ts
// domain/integrityCheck.ts - pure decision logic, but a check MAY need to
// ask "does this file/folder actually exist?" (see §4) - device I/O for
// that is injected via IntegrityCheckIO rather than imported directly,
// keeping this file free of RN/SDK imports (design-overview.md §3).
interface IntegrityFinding {
  checkId: string;
  itemKind: GtdParaKind;
  itemPath: string;
  entityKind: 'task' | 'meeting' | 'item';
  entityLabel: string;
  notePath: string; // '' for findings that aren't about a specific notePath
  message: string;
}

// Shape 1: PER-ITEM - runs once for each scanned item, given that item's
// own parsed state. Everything through v1 (hashNotePath) fit here; the
// round-3/4 additions needed the input widened with more of that state.
interface IntegrityCheckInput {
  itemKind: GtdParaKind;
  itemPath: string;
  tasks: Task[];
  meetings: Meeting[];
  rawContent: string;       // the file's raw text - for structural checks
  basePath: string;         // ResolvedParaPaths.base - for linkedFile resolution
  resourcesPath: string;    // ResolvedParaPaths.resources - for defaultResourceFolder resolution
  defaultResourceFolder: string | null;
}
interface IntegrityCheckIO {
  fileExists(absolutePath: string): Promise<boolean>;
  folderExists(absolutePath: string): Promise<boolean>; // added round 4, for defaultResourceFolder
}
type IntegrityCheck = (input: IntegrityCheckInput, io: IntegrityCheckIO) => Promise<IntegrityFinding[]>;
const INTEGRITY_CHECKS: Record<string, IntegrityCheck> = {
  hashNotePath: checkHashNotePath,
  duplicateHeadings: checkDuplicateHeadingsAsync,
  linkedFileMissing: checkLinkedFileMissing,
  defaultResourceFolderMissing: checkDefaultResourceFolderMissing,
};

// Shape 2: WHOLE-RUN (new, round 4) - runs ONCE per scan, given every
// scanned item's summary at once. For checks that are inherently
// cross-item (does this Project's area: match any real Area? do two items
// share an abbrev?) rather than about one item in isolation. No IO
// parameter - by the time this runs, every item has already been read, so
// there's no device I/O left to do; purely synchronous.
interface ScannedItemSummary {
  itemKind: GtdParaKind;
  itemPath: string;
  itemName: string;   // the item's own folder name, for human-readable messages
  inArchive: boolean;
  area: string | null;
  abbrev: string | null;
}
type WholeRunCheck = (items: ScannedItemSummary[]) => IntegrityFinding[];
const WHOLE_RUN_CHECKS: Record<string, WholeRunCheck> = {
  orphanedAreaAssignment: checkOrphanedAreaAssignment,
  duplicateAbbrev: checkDuplicateAbbrev,
};
```

`storage/integrityCheck.ts`'s `runIntegrityCheck` walks every item folder,
constructs one `IntegrityCheckIO` (`{fileExists, folderExists}`, from
`supernote/fileSystem.ts`), runs every registered per-item check against
each item via `runRegisteredChecks(input, io)` while also collecting each
successfully-loaded item's `ScannedItemSummary`, then runs
`runWholeRunChecks(summaries)` once at the end and merges both sets of
findings before writing the report. Adding a further per-item check means
writing one more function and registering it in `INTEGRITY_CHECKS`; adding
a further cross-item check means the same for `WHOLE_RUN_CHECKS` - neither
requires restructuring the walk/report machinery, and a per-item check only
needs the `io` parameter if it actually needs device I/O.

## 4. The `hashNotePath` check: v1, then a round-3 rewrite

**v1** (as originally shipped) mirrored `scripts/find-hash-notepaths.js`'s
heuristic: any Task/Meeting `notePath` containing `#` got run through
`parseSharedNoteAnchor`; if the recovered `filePath` half ended in a space
or contained a second `#`, it was flagged as a corrupted own-note path
rather than a genuine shared anchor - reasoning that both halves are
guaranteed `#`-free going forward by `sanitizeFileNameComponent`
(`storage/noteLinks.ts`), so either symptom meant the notePath predated
that fix.

**Round 3 (2026-09-23) rewrite**, from real on-device findings: Tilman ran
v1 and found it flagging pre-fix own-note files whose real, on-disk
filename legitimately contains `#` (a context tag kept in the file name,
e.g. `"...von #demand aufsetzen #daily.note"`) - files that were never
corrupted and open fine. His diagnosis, confirmed by tracing the code:
"once a name fits an existing file it will not be changed by the current
code," so the check should verify against the *actual filename on disk*
rather than guessing from the string's shape.

Tracing further surfaced a second, more serious problem this raised: those
same "fine" files were not actually fine to open going forward, because
`storage/noteLinks.ts`'s `resolveNotePath` is target-agnostic and purely
string-shape-based - it runs `parseSharedNoteAnchor` on *every* `notePath`
unconditionally, own or shared, so a real own-note file with `#` in its
name was misdetected as a shared anchor and truncated on every reopen. Per
Tilman ("let's go with both, otherwise its lots of manual fixing work"),
both were fixed together:

1. **`resolveNotePath` made self-healing** (`storage/noteLinks.ts`, now
   `async`): when `parseSharedNoteAnchor` finds a `#`, the anchor guess is
   verified against the real filesystem (`fileExists`, new in
   `supernote/fileSystem.ts`) before being trusted. If the guessed anchor
   file doesn't exist, it falls back to treating the whole string as a
   literal own-note path instead - the same file classic own-note files
   with `#` in their name always were.
2. **`checkHashNotePath` rewritten** to use the same existence-based
   classification, via the new `IntegrityCheckIO` injection (§3): for a
   `notePath` containing `#`, it checks whether the `parseSharedNoteAnchor`
   anchor candidate exists on disk (genuine shared anchor - no finding),
   then whether the literal own-note path exists (real pre-fix own-note
   file, which `resolveNotePath`'s fallback now opens correctly - no
   finding), and only flags it if *neither* resolves - a genuinely orphaned
   or stale notePath that needs a person to re-link or clear by hand.

`joinNotePath(itemPath, target)` (`domain/sharedNotePages.ts`) was pulled
out as a shared pure helper so `resolveNotePath` and `checkHashNotePath`
build candidate paths the exact same way instead of two copies drifting
apart.

`scripts/find-hash-notepaths.js` (the earlier off-device stopgap) was not
updated to match - it's superseded by this feature for on-device use and is
no longer the primary way to find these issues.

## 4a. Round 4 (2026-09-23): four more checks

Requirements clarified via two short AskUserQuestion rounds after Tilman
asked what else would be worth checking, prompted by finding a real
area.txt with a duplicated section heading (from manual editing):

**`duplicateHeadings`** (per-item) - addresses that exact case. Derived
directly from how `domain/markdown.ts`'s `getSpan`/`getFrontMatterSpan`
actually read a file, not a generic "looks odd" heuristic:
- A second `## Scope`/`## Tasks`/`## Meetings`/`## Weekly Goals` line isn't
  a parse error - the file loads fine - but `getSpan` only ever reads the
  *first* occurrence and stops at the *next* `##` line, so everything under
  a later occurrence is invisible to the app (never shown, never editable)
  and frozen in place on every future save (`setSpan`'s `after` starts
  exactly at that second heading).
- A file that doesn't open with `---`, or whose frontmatter block never
  closes with a second `---`, is likewise not a parse error -
  `parseFrontMatter` just silently falls back to `status: 'active'` and
  every other field unset - but that means a corrupted frontmatter block is
  otherwise invisible.
- Skips entirely for an empty file (`loadProjectFile`'s own "a missing file
  just parses as empty" contract) - that's normal, not corruption.

**`linkedFileMissing`** (per-item) - the same idea as `hashNotePath`, but
for `Task.linkedFile`/`Meeting.linkedFile` (technical-design-linked-
files.md) instead of `notePath`. Much simpler: no anchor-parsing ambiguity,
just "does this file exist?" - resolved against `basePath`, since
`linkedFile` is always stored base-root-relative
(`storage/linkedFiles.ts`'s own convention), never item-relative like
`notePath`.

**`defaultResourceFolderMissing`** (per-item) - a Project/Area's
`defaultResourceFolder:` (technical-design-linked-files.md §3.1) naming a
Resources subfolder that no longer exists. Same shape as
`linkedFileMissing`, but checks a *folder* (`io.folderExists`, new
alongside `io.fileExists`) resolved against `resourcesPath` rather than
`basePath`.

**`orphanedAreaAssignment`** (whole-run) - a Project's `area:` field
(technical-design-project-area-assignment.md §2) naming an Area that
doesn't match any Area-kind item this same scan found. Deliberately checks
against Areas **and** Archive together (Tilman's explicit choice): archiving
an Area cascade-archives its Done Projects alongside it
(`storage/archive.ts`) without ever clearing their `area:` field, so a Done
Project sitting in Archive still pointing at its (also-archived) Area is
normal, expected state - only a name matching *neither* live Areas *nor*
Archive means the Area folder is genuinely gone.

**`duplicateAbbrev`** (whole-run) - two different Projects/Areas sharing the
exact same `abbrev:` value case-insensitively, the same uniqueness rule
`domain/abbrev.ts`'s `validateAbbrev` already enforces when saving through
the app's own UI, checked here for anything hand-edited directly where
nothing enforces it. Deliberately **excludes Archive** (Tilman's explicit
choice: "live items only") - an archived item's abbrev is no longer shown
or used anywhere, so a collision there isn't worth surfacing.

All four verified via a standalone `npx tsx` script (18/18 checks, covering
every branch above including the two deliberate false-positive-avoidance
cases: cascade-archived area assignments, and archived abbrev collisions)
and the same full-project `tsc --noEmit --strict` pass (identical
6-pre-existing-error baseline - zero new errors).

## 5. Fix behavior

Report-only - no auto-fix (Tilman, 2026-09-23: explicitly chose this over
an automatic rename+relink option). Findings are informational; fixing a
flagged item still means renaming the file by hand and correcting its
`→ [[...]]` line, same as `find-hash-notepaths.js`'s own instructions.

## 6. Output

One summary file per run, `_gtdpara_debug_log/integrity-check-<ISO
timestamp>.txt` (`supernote/fileSystem.ts`'s `writeIntegrityCheckReport`,
reusing the same `DEBUG_LOG_FOLDER` the existing diagnostic logging
writes to) - a run timestamp, items-scanned count, findings count, then one
block per finding (item path/kind, the offending notePath, a plain-language
explanation), or "No issues found." Deliberately ONE file per run rather
than the existing one-file-per-event convention `recordDebugLogEntry` uses
for hot-path device-call diagnostics - a bulk report reads better as a
single document, and unlike that function this one throws instead of
swallowing errors, since a failed report write should surface to whoever
just tapped the button.

A single item's load failure (a corrupted or unreadable data file) doesn't
abort the whole run - it becomes its own finding (`checkId: 'loadError'`)
instead, since a file that can't even be read is itself exactly the kind of
thing this check should surface.

## 7. UI

"Run Integrity Check" button in Settings → Folders, styled like the
existing "Paste from clipboard" buttons already in this screen
(`styles.pasteButton`/`pasteButtonText`), with the existing
`ActivityIndicator` pattern while it runs. Runs against the current
(possibly unsaved) draft settings values, matching this tab's existing
folder-path previews, which already do the same - scanning is read-only,
so there's no reason to force a save first. On completion, `Alert.alert`
shows the finding count and the report's filename (matches an existing
`Alert.alert` usage already in the codebase, `ui/ItemStatusPanel.tsx` - no
new UI pattern needed).

## 8. Out of scope / deferred

- No auto-fix action.
- No progress indicator beyond a single spinner (item-by-item progress
  wasn't asked for and would add meaningful complexity for a manual,
  infrequent action).
- No check yet for: duplicate keyword pages within a shared-note file
  (`[[feature_shared_note_pages]]`'s own hardening reduces new duplicates
  going forward but doesn't retroactively detect old ones); recurring
  meetings' `occurrences[].page` referencing an out-of-range/duplicate
  page; malformed dates. Noted as ideas, not requested yet.
