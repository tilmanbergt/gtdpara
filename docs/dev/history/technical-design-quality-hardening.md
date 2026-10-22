# Technical design: Quality hardening (safe writes, scenario tests)

> Historical document: a plan of four small quality slices (Q1-Q4) that fit between feature
> releases, with the design of each. Requirements as decided, current state, design, steps, test
> plan and open points; each slice gets its own "As built" section when it is done.

Status: **Q1 built** on `feature/safe-writes` (§3.7) for 0.18.2, waiting for its device test;
**Q2 built** on `feature/scenario-tests` (§4.9), taken from `feature/safe-writes`; **Q3 built** on
`feature/interruptions` (§5.6) for 0.18.3; Q4 designed.
Decisions D1-D4 in §7.

## 1. Goal and decisions

An outside review of 0.17.0 found the architecture sound and the code clean (tsc strict, 0.5 %
duplication, low bug rate), but saw an imbalance: the automated rules guard *style* (comment
wording, date text, file length), while what matters most for a "your files" product - files that
survive crashes, external edits and failures, and flows that are tested end to end - rests on
convention and on Tilman testing by hand while working.

This plan covers the most important ~30 % of the review's findings, in four slices small enough
to sit between feature releases:

| Slice | Name | User-visible | Ships as |
|---|---|---|---|
| Q1 | Safe writes | yes ("Fixed") | 0.18.2 (0.18.0 and the 0.18.1 hotfix were released before Q1 was device-tested) |
| Q2 | Scenario tests | no | merges to `main` when done, rides along with the next release |
| Q3 | Interruptions and messy files | only fixes it finds | the release after Q2; fixes as "Fixed" lines |
| Q4 | Quick Add split | no | merges to `main` when done, rides along |

Decided with Tilman:

- Design documents stay as they are: detailed requirements, UI drafts and technical designs are
  what keeps implementation accurate. They gain one section, "Test scenarios" (§4.5).
- Tilman's testing role moves from "test while working" to **reviewing the scenario list** and a
  short device checklist of what automation cannot see (§4.6).
- Breadth over depth: the slices fix the riskiest things and build the safety net; the rest of
  the review's findings wait (§6).

## 2. Current state (0.17.0)

- **Writes are not atomic.** `GtdParaFileModule.writeTextFile` calls `File.writeText`, which
  truncates and then writes. A plugin kill or power loss in between leaves `project.txt` empty
  or half-written.
- **External edits can be overwritten.** `storage/projectFile.ts`'s `saveTasks`/`saveMeetings`/
  `save…` build the whole file from the cached `rawContent` and write it without checking the
  file on disk. The cache already records a `FileStamp` (exists, modified time, size) per data
  file, but no write compares it. A change from Obsidian or a sync that arrived since the last
  refresh is lost.
- **Settings load failure is silent.** `storage/settingsStorage.ts`'s `loadSettings` returns
  `DEFAULT_SETTINGS` on any read or parse error without a log line. `updateReviewSteps` and
  `patchSettings` already refuse to write after a failed read; the full save from the Settings
  screen does not know it is holding defaults. To verify in Q1 step 3: whether a Settings save
  in that state writes the defaults (including folder paths) over the stored settings.
- **Silent catches.** About 39 of 232 catch sites neither log, rethrow nor show a status
  (policy §5 says every caught error is logged); code-health does not check it.
- **Layer rule not enforced.** `domain/meetingNoteBlock.ts` imports `ui/textLineEstimator.ts`;
  nothing reports it.
- **Tests skip the risky paths.** ~1,000 Jest tests, ~55 % line coverage of loaded files, but
  close-out `execute.ts`/`scan.ts`/`context.ts`, `archive.ts`, `pdfExport.ts`, storage
  `integrityCheck.ts` and `profiles.ts` are at 0-8 %, `domain/icsParser.ts` at 0 %,
  `supernote/fileSystem.ts` at 7 %.
- **UI tests mock everything themselves.** 32 test files each mock `sn-plugin-lib`; most replace
  the whole `supernote/fileSystem.ts`, so storage never runs under a UI test and no test checks
  the files a tap produces.
- **QuickAddWidget** is 2,138 lines: ~37 props, 28 `useState`, six modes (create task, meeting or
  note; edit task, meeting or loop; the capture variant). 49 `exhaustive-deps` suppressions
  across the code base, 3 here and 7 in `FileBrowserPane.tsx`.

## 3. Q1 "Safe writes"

### 3.1 Atomic data-file writes (native)

`writeTextFile` writes to `<dir>/.<name>.gtdpara-tmp` in the **same folder**, flushes
(`FileOutputStream.fd.sync()`), then `renameTo(target)`. A rename on the same file system is
atomic; across file systems it is not, so the temp file cannot live in the private folder.
This is a deliberate exception to "temporary files live only in the private temp folder"
(DEVELOPMENT-POLICY §3); the policy line gets it written in. A leftover `.gtdpara-tmp` (crash
between write and rename) is overwritten by the next write of that file, and the Integrity Check
lists any it finds. `appendTextFile` (logs) stays as it is.

Why not the private folder: it is the app's own storage (`/data/user/0/<host>/…`), a different
file system from the user's folders (`/storage/emulated/0/…`). `renameTo` cannot cross file
systems; it returns `false`, and the only way left is copy-then-delete. Copying onto the target
truncates and rewrites it, which is exactly the unsafe write this replaces. Only a temp file on
the same file system as the target gives an atomic replace.

If `renameTo` over the existing file fails on a device (to be checked on each firmware in the
device test), the write falls back to the direct write it replaces and logs a warning, so it
is never worse than today.

### 3.2 Write conflict guard

Decision D3: when both sides changed the same thing, the user decides what wins. When they
changed different parts of the file, nothing is lost by keeping both, so nobody is asked.

One helper in `storage/projectFile.ts`, `writeDataFile(kind, itemPath, change)`, replaces the
direct `writeTextFile` in every `save…`. `change` is `{section, apply}`: the span the save
writes (`## Tasks`, `## Meetings`, …, or the frontmatter) and a pure `apply(raw) => next` that
writes it into any version of the file (the `write…IntoContent` functions already are this).

1. `statFiles([path])` and compare with the stamp the cache recorded when it read the file
   (`dataCache.ts`, exposed as `recordedStamp(path)`; the Inbox has its own).
2. Same stamp, or no stamp recorded (file not yet cached): write `apply(cachedRaw)`, record the
   new stamp. This is today's path.
3. Different stamp: read the file as it is now (`freshRaw`) and compare the save's section in
   `cachedRaw` and `freshRaw`.
   - **Section unchanged outside** (the outside edit was elsewhere): write `apply(freshRaw)`.
     Both changes are kept, nothing to ask. Logged as a count, not content.
   - **Section changed on both sides**: write nothing yet. Load `freshRaw` into the cache
     (`applyItemRawContent` / `applyInboxRawContent`, which notify the screens), keep the
     pending change in a small store (`storage/writeConflicts.ts`, one entry per file) and throw
     `FileConflictError`. An App-level publisher shows it in the status slot (texts in
     `domain/fileChangeText.ts`):
     `"Website" was also changed outside gtdpara (Todos).` with two actions, neither preselected:
     - **Use mine**: write `apply(freshRaw)` with the stamp check again. The outside change to
       this section is replaced; outside changes elsewhere in the file stay.
     - **Use the file**: drop the pending change. The file stays as the outside edit left it.
     Dismissing the message, leaving the screen or a profile switch counts as "Use the file":
     the safe choice that writes nothing.
4. The screen treats `FileConflictError` like a failed save: an open edit stays open with the
   typed text, so after "Use the file" the user can still save it again on purpose.

Multi-file operations (moves, filing, close-out) hit the guard per file. Because moves append
first, a conflict on the second file leaves at worst a visible duplicate, never a lost entry;
the message names the file, so the user sees where.

### 3.3 Settings load failure

`loadSettings` logs the error (`logError('settingsStorage: load failed, using defaults', …)`)
and returns the defaults with a non-enumerable marker. The Settings screen's full save refuses
while the marker is set and shows `Settings could not be read - not saved, so your stored
settings stay untouched. See Troubleshooting.` A line in `docs/user/troubleshooting.md`.

### 3.4 Guardrails (code-health)

- **silent-catch**: a `catch` block (or `.catch(` handler) must call `log`/`logWarn`/`logError`,
  rethrow, or carry a comment `// silent: <reason>`. The existing 39 sites get one of these.
- **layer-imports**: ESLint `no-restricted-imports` overrides: `src/domain/**` may import only
  from `src/domain/**` and `src/generated/**`; `src/storage/**` never from `src/ui/**` or
  `src/screens/**`. `textLineEstimator.ts` moves to `domain/` (it is pure).

### 3.5 Q1 steps

Each step is its own commit, so one that does not hold up on the device can be reverted alone.

1. Native atomic write with fallback + Integrity Check finding for leftovers.
2. `writeDataFile` with the stamp guard and the "section unchanged outside" case; all `save…` in
   `projectFile.ts` use it; unit tests with a stubbed `statFiles`/`readTextFile`.
3. The conflict case: `storage/writeConflicts.ts`, the App-level status with "Use mine" / "Use
   the file", the screens' failed-save path; tests.
4. Verify the settings-fallback failure (§2), then the fix; tests.
5. silent-catch and layer-imports rules with tests in `scripts/test-code-health.mjs`; fix the
   findings.
6. CHANGELOG ("Fixed": files are saved safely if the device switches off mid-save; a change
   made outside gtdpara is kept, and when both changed the same list you choose which wins),
   help pages (`files-and-folders.md`, `troubleshooting.md`), policy §3/§5 lines, CI workflow
   (D1, `.github/workflows/check.yml` running `npm run check`).

### 3.6 Branch and release

Q1 is built on `feature/safe-writes`, taken from `main` (0.17.0), independent of
`feature/engage-in-context`. It is device-tested with its own beta build. When it holds up, it
merges into `main` before 0.18.0 is released and ships with it; when it does not, 0.18.0 is
released without it and Q1 follows as 0.18.1. Either way nothing in 0.18.0's own work depends
on it. The CI workflow does not depend on the rest and can be merged on its own at any time.

### 3.7 As built (Q1)

Built in six commits on `feature/safe-writes` (from the 0.17.0 release commit), each revertable
on its own: atomic write, conflict guard, the choice, settings, checks, docs and CI.

Where it differs from §3.1-3.4:

- **Content, not stamps.** `storage/dataFileWrite.ts`'s `writeDataFile` re-reads the file on
  every save and compares it with `base`, the text the change was made on. The cache's stamps
  stay what `refreshCache` uses; comparing them before a write could miss an outside edit with
  the same size inside the file system's time granularity. The extra read is a few KB per save.
- **The decision is pure**: `domain/writeGuard.ts`'s `decideWrite` with
  `domain/markdown.ts`'s `dataFilePartText` (a part is `FRONT_MATTER_PART` or a `## ` heading,
  `DATA_FILE_HEADINGS`). Callers pass `{parts, apply}`; the eight `save…` in
  `storage/projectFile.ts`, the two multi-part writes in `storage/loops.ts` and the close-out plan
  (`storage/closeOut/planStore.ts`) go through it. `storage/markStore.ts` and the close-out
  journal already read the file fresh before writing and stay as they are.
- **The save waits for the answer** instead of storing a pending change and throwing:
  `storage/writeConflicts.ts` queues the question, `ui/useWriteConflicts.ts` shows it
  (`confirm`, global, neither action primary, ✕ = "Use the file"). "Use mine" re-reads the file
  and writes the save's parts into it, so the save completes like any other; "Use the file"
  rejects with `FileConflictError` (`Not saved: "Website" keeps the version changed outside
  gtdpara.`). Without the UI installed and on a profile switch the answer is "Use the file".
- **A file that is gone** (deleted or moved outside) is never recreated: the save fails with
  `dataFileGoneText`; found while fixing the existing tests, whose fake file systems returned
  nothing and would otherwise have produced a skeleton with only the saved part.
- **Saves of one file run one after another** (per-path promise chain), so two saves never
  start from the same text.
- **Merged writes and the cache.** A write that kept an outside edit remembers its content
  (`takeMergedWrite`); the cache's write-through (`updateItem…`, `updateItemRawContent`,
  `setCachedInbox`) parses such text in full, so fields of the other parts are not left stale.
  On a conflict the outside version goes into the cache through a listener `dataCache.ts`
  registers (`setDataFileReloadListener`), so `dataFileWrite.ts` does not import the cache.
- **Settings** (§3.3): the root cause is confirmed - `loadSettings` fell back to the defaults
  silently, and five paths then saved full settings built on them (Settings screen, the Inbox and
  Project hide-done toggles, focus mode, profile switch; the switch also wrote them into the
  profile file). Now `storage/settingsUnreadable.ts` holds why the load failed; `saveSettings` and
  `writeProfile` refuse while it is set; `ui/useSettingsUnreadableNotice.ts` shows it with
  **Start over**; Settings → Advanced → Profiles shows **Restore** on the active profile, which
  switches to it and replaces the unreadable settings (`replaceUnreadableSettings`). The debug
  bundle has a `settings readable` line.
- **Checks** (§3.4): `silent-catch` in `scripts/lib/codeHealth.mjs` accepts a catch that logs,
  rethrows, carries the text on with `errorMessage(e)`, or says `// silent: <reason>` (on the
  catch, its line or the line before). 37 sites were fixed: 6 now log, the others give their
  reason. Errors shown in the status slot are logged by `StatusProvider`. Layer rules are
  ESLint `no-restricted-imports` overrides in `.eslintrc.js`; `textLineEstimator.ts` moved from
  `ui/` to `domain/`.
- **App.tsx** stood at the 1,000-line limit; the "What's new" notice moved to
  `ui/useWhatsNewNotice.ts` to make room for the two new App-level hooks.
- **CI**: `.github/workflows/check.yml` runs `npm ci` and `npm run check` on Node 22.

Tests: `__tests__/domain/writeGuard.test.ts`, `writeLeftovers.test.ts`;
`__tests__/storage/dataFileWrite.test.ts`, `writeConflicts.test.ts`, `outsideEdits.test.ts`,
`settingsUnreadable.test.ts`, `profilesUnreadable.test.ts`; code-health rule tests. The Kotlin
change is not compiled or tested off the device.

## 4. Q2 "Scenario tests"

### 4.1 Idea

Run the real app - `App.tsx`, screens, storage, parsing, writing - against a **fake Supernote**:
an in-memory file system behind the native `GtdParaFile` module and a fake `sn-plugin-lib`.
Each scenario starts from a few real data files, taps through the UI, and checks the **files**
afterwards. The boundary is the native module, so `supernote/fileSystem.ts` and everything above
it run unchanged.

### 4.2 The fake device (`test-helpers/fakeDevice/`)

- `fakeFs.ts`: a `Map` of path → `{content, mtime, size}` plus folders. Implements the 15
  `GtdParaFile` methods (`readTextFile`, `writeTextFile`, `appendTextFile`, `writeBinaryFile`,
  `statFiles`, `listFolderEntries`, `ensureFolder`, `moveFile`, `moveFolder`, `moveFolderMerge`,
  `deleteEmptyFolder`, `getPrivateTempDir`, `deleteTempTree`, `getPrivateDataDir`,
  `deletePrivateDataTree`) with the native rules: `deleteEmptyFolder` refuses a non-empty folder,
  the private deletes refuse paths outside their folder.
  - Fault injection: `fs.failNext(method, pathPattern?)`, `fs.crashAfter(n)` (the n-th write
    throws `SimulatedCrash` and the file system freezes, as after a kill), `fs.editExternally(path,
    fn)` (changes content and bumps `mtime`).
  - `fs.snapshot()` / `fs.tree()` for assertions and readable failure output.
- `fakeSdk.ts`: `sn-plugin-lib` with notes as plain objects (pages, keywords, titles, links),
  current file path and page, button presses (sidebar, lasso, engage), `closePluginView` spy.
  Lasso, stroke recognition and PNG generation are out of scope (device only).
- `setup.ts`: installs both before any import (`NativeModules.GtdParaFile = fakeFs`), plus the
  AsyncStorage mock and a log capture that fails the scenario on an unexpected `logError`.
- Its own Jest config `jest.scenarios.config.js` (`testMatch: __tests__/scenarios/**`,
  `setupFiles: [fakeDevice/setup]`), so unit tests stay as fast as they are.

### 4.3 The driver

`openApp({files, settings, launchFrom})` mounts `App` and returns a driver:
`tapTab('Inbox')`, `tap('Refile')`, `type('New task', 'Call Anna #next')`, `pressButton('sidebar')`,
`pickInFiles('Website')`, `closeAndReopen()` (unmount, keep the file system, mount again, as the
host does). Queries go through `@testing-library/react-native` (decision D2) by visible text and
accessibility label, so scenarios use the labels the user sees.

Assertions: `expectFile(path).toContainLine(…)`, `.not.toContainLine(…)`, `.toEqualFixture(…)`,
`expectFolder(path).toHave([...])`, `expectStatus(/Moved .* to Website/)`.

### 4.4 Scenarios as readable text

Each scenario is written with `scenario(title, {feature, design})` and `given/when/then` steps
whose text is plain English; the step text is what the reviewer reads, the code under it is what
runs:

```ts
scenario('Refile a todo with its note from the Inbox', {feature: 'Inbox', design: 'technical-design-filing-unification.md'}, () => {
  given('Inbox.txt has "- [ ] Call Anna #next" linked to Anna.note', () => …);
  when('I open Inbox, tap "Call Anna", tap Refile and pick "Website"', async () => …);
  then('Website/project.txt has the todo and Inbox.txt no longer does', () => …);
  then('Anna.note is in the Website folder', () => …);
});
```

`npm run scenarios` runs them and writes `docs/dev/test-scenarios.md`: every scenario's steps,
grouped by feature. The file is generated and committed; `npm run check` fails when it is out of
date (like `src/generated/`). So **the diff of that one file shows exactly which tested behavior a
change adds or alters** - that diff is what Tilman reviews. `npm run check` runs the scenarios too.

### 4.5 Process

- Every technical design gets a section **"Test scenarios"**: the Given/When/Then lines in plain
  English, reviewed with the design. Implementation writes them as scenarios.
- Every bug fix starts with a scenario (or unit test) that fails for the bug.
- DEVELOPMENT-POLICY §7 and §8 say both; `docs/dev/README.md` gets a "Writing scenarios" part.

### 4.6 The device checklist

What the harness cannot see stays on the device: rendering and e-ink refresh, the A5 X layout
budget, lasso and recognition, real notes and the real SDK, firmware differences, speed. Each
design's device test plan lists only those points, and RELEASING.md's release device checklist
shrinks to them. Target: about ten minutes per release.

### 4.7 First scenarios (the riskiest flows)

1. Quick Add a todo in a Project: line in `project.txt`, other sections untouched.
2. Edit a todo, then tap another row (save-then-switch): both saved, nothing else changed.
3. Refile a todo with its linked note from the Inbox.
4. Abbreviation quick-file while editing (`#WEB` → "File: Website").
5. Mark a todo done: completion field written; Daily no longer shows it.
6. Add a meeting dated next week from Daily: written, status names where it went.
7. Weekly Review, Inbox-to-zero step: file two items, the step counts as done.
8. Close-out a Project end to end: archive folder, status stamped, PDF requested.
9. Profile switch to the demo space and back: each sees only its own files and settings.
10. A hand-edited file (unknown lines, a foreign section, old-format fields) survives a save.
11. Changed outside gtdpara between open and save: refused, reloaded, message shown (Q1).
12. Settings unreadable: app runs on defaults, a Settings save writes nothing (Q1).

### 4.8 Q2 steps

1. `fakeFs` + `fakeSdk` + setup, with their own unit tests (the fake must behave like the native
   module; its rules are copied from the Kotlin code and named there).
2. Driver and assertions; scenario 1 green.
3. `scenario()` reporter, `npm run scenarios`, generated `docs/dev/test-scenarios.md`, check step.
4. Scenarios 2-12.
5. Policy, README, design-doc template section; move two of the existing hand-mocked UI tests to
   the harness as examples.

### 4.9 As built (Q2)

Built on `feature/scenario-tests`, branched from `feature/safe-writes` because scenarios 11 and 12
test Q1; it merges after Q1.

- **Fake device** as in §4.2, plus `FakePdf` for `GtdParaPdf` (the "PDF" is the spec as JSON) and a
  fixed `GtdParaRuntime` answer. `device()` and `resetDevice()` (`test-helpers/fakeDevice/device.ts`)
  hold the current one; `forwarding()` proxies let modules that captured a native module at import
  time follow a reset. The fake's own rules are tested in `__tests__/fakeDevice/fakeFs.test.ts`.
- **Jest projects**: `jest.config.js` has `unit` (as before) and `scenarios`
  (`__tests__/scenarios/`, setup file `test-helpers/fakeDevice/setup.ts`). Both run in
  `npm run check`; the 13 scenarios take about 5 s.
- **Driver** (`test-helpers/scenario/app.tsx`) on `@testing-library/react-native` 13.3.3 (D2):
  queries skip hidden elements, so kept tabs don't leak into a scenario; every view that asks
  for its size gets one tall page (nothing measures in Jest), so paged lists show their rows - row
  heights stay a device check.
- **Catalog**: the step texts are read from the source (`scripts/lib/scenarioCatalog.mjs`), not
  collected at run time, so `npm run check` can compare `docs/dev/test-scenarios.md` without
  running anything twice. Pass/fail is not in it: the check only passes when all scenarios pass.
- **Scenarios** (§4.7): all twelve, plus "an outside edit to another part is kept" as its own
  scenario. Scenario 11 found a bug: Quick Add on a project's page took a failed add for a
  success (the screen's `runWidgetAction` swallowed the error), cleared the text and said "Added
  todo". Fixed on `feature/safe-writes` for 0.18.2.
- **Not done** from §4.8 step 5: moving two of the hand-mocked UI tests to the harness. The new
  scenarios serve as the examples; the old tests stay as they are.

## 5. Q3 "Interruptions and messy files"

### 5.1 Scope, as decided

Tilman (2026-10-20): the Supernote is stable and the environment clean, so this is not a
transaction system. The bar is: **an interruption or an odd file never loses anything silently,
and the user can always finish or repair what was interrupted** - with the smallest change that
gets there. No journals, locks or rollbacks beyond what exists; a visible duplicate or a clear
Integrity Check line is an acceptable outcome.

### 5.2 Findings

Probed with the fake device (§4): each flow stopped after every single file write, then gtdpara
reopened; every data-file save run on unusual files; the calendar parser fed odd input.

| # | Where | What happens | Loss? |
|---|---|---|---|
| F1 | Moving a todo or meeting with its note (refile, quick-file, close-out checklist) | Stopped after the note moved but before the target file was written: the entry stays in the source, its link points where the note was; the note sits unlinked in the target's `Todos/`/`Meetings/`. Stopped one write later: the designed duplicate, but the source copy's link is broken. | No - the note is intact, only unlinked |
| F2 | Close-out, "Archive now" | Stopped after the PDF moved into the archive (and before the folder move): on reopening, the checklist shows a blocker (the PDF already sits at the target name) and **Archive now** stays blocked. The close-out cannot be finished in the app. | No - but stuck |
| F3 | Close-out, "Archive now" | Stopped right after the folder move: the project is in the archive with `status: active`; it is gone from Projects (Archive is never read), so it cannot be finished in the app. The Integrity Check finds it, but its message sends the user to "Review → Done projects", where it isn't. | No - everything is archived |
| F4 | Any data file saved with Windows line endings (CRLF: Notepad, some sync tools) | Not one todo, meeting or field is recognized: the screen shows the project as empty. The lines survive (kept as unknown lines); a save converts the file to `\n` but leaves the `\r` in the kept lines. | No - but the project looks empty |
| F5 | Other odd files | A BOM, no frontmatter, a heading with trailing spaces, a `###` sub heading, indented sub todos, an empty or unstructured file: nothing lost on any save. A second `## Tasks` heading: its todos are kept but not shown. | No |
| F6 | Calendar parser (`domain/icsParser.ts`) | Never throws on garbage, broken dates or unclosed events; folded lines, time zones, all-day and recurring events parse right. It has no tests. | - |
| - | Interruptions before the PDF move (close-out), before the note move (refile), and the profile switch (each step writes one file; the old profile stays active until the last one) | Resume or stay as they were. | No |

### 5.3 Fixes (the smallest that meets §5.1)

- **F1 - say where the note is.** The Integrity Check's broken-note-link finding, when a note
  with the same file name exists in the `Todos/` or `Meetings/` folder of another Project, Area
  or the Inbox, names it: "…not found - a note with this name is in Website/Todos." The user
  relinks with the existing note link action, or deletes the duplicate entry. No reordering of
  the move, no automatic relinking.
- **F2 - the archive step accepts its own work.** The "name is free at the target" check does
  not count the PDF the close-out itself already moved (the plan's journal says so), so **Archive
  now** runs the remaining steps, as the journal was designed to.
- **F3 - an honest message.** The Integrity Check's interrupted-close-out finding gives the
  step that is left: still in Projects - "open Close out… on its page and tap Archive now";
  already in the archive - "it is fully archived; only `status:` in its project.txt still says
  active, which you can change by hand or leave". No new repair action.
- **F4 - read CRLF files.** `loadProjectFile` (and the outside-edit re-read in
  `storage/dataFileWrite.ts`) turn `\r\n` into `\n` before parsing. Saves write `\n`, as
  every gtdpara file already has. A one-line change plus a test.
- **F5, F6 - tests only.** The odd files of F5 become a small fixture set that every `save…`
  runs over (nothing lost); the calendar inputs of F6 become unit tests.

### 5.4 Tests

- **Crash tests** (scenario project, `__tests__/scenarios/interruptions.test.tsx`): refile with a
  note and close-out, each stopped after every write (`crashAfter(n)` for every n), reopened and
  - for close-out - finished. Assertion: no entry and no file is lost; afterwards either the
  flow is complete or the Integrity Check names what is left. These pin F1-F3 and keep them
  fixed.
- **Scenarios** (in the catalog): "A project file saved with Windows line endings shows its
  todos" (F4), "An interrupted close-out can be finished" (F2).
- **Unit tests**: the F5 fixture set over every `save…`; the F6 calendar inputs.

### 5.5 Release

All "Fixed" lines (F2, F3, F4; F1 is an Integrity Check improvement): a patch, 0.18.3, or with
the next feature release, whichever comes first.

### 5.6 As built (Q3)

Approved by Tilman ("go"), built on `feature/interruptions` from `main` with the scenario tests.

- **F1**: there was no general missing-note finding at all - the Integrity Check only reported
  links containing `#`. The new check `noteMissing` (`domain/integrityCheck.ts`) reports an own
  note (a link without `#`) that is not there; `storage/integrityCheck.ts` lists the `Todos/` and
  `Meetings/` folders of every scanned item once and passes `notesByName`, so the message names
  where a note of that name is.
- **F2**: `storage/closeOut/context.ts` does not count the target PDF as a collision when the
  plan's journal has `move-pdf` and the project folder no longer holds the PDF. The archive
  steps themselves were already safe to repeat.
- **F3**: `IntegrityCheckInput.inArchive` picks the message.
- **F4**: `domain/markdown.ts`'s `normalizeLineEndings`, applied where data files are read:
  `loadProjectFile`, the re-reads in `storage/dataFileWrite.ts` and `storage/markStore.ts`.
- **Tests**: `__tests__/scenarios/interruptions.test.tsx` - refile with a note and close-out,
  each stopped after every write (`freshDevice()` per round, `crashAfter(n)`), then reopened and
  finished or checked with the Integrity Check; both fail without the fixes. The Windows-line-
  endings scenario. `__tests__/storage/oddFiles.test.ts` (nine odd files × six kinds of save),
  `__tests__/domain/noteMissing.test.ts`, `icsParser.test.ts`, close-out message tests.
- The driver gained `runIntegrityCheck()`; scenarios run with a 120 s timeout because a crash
  scenario opens the app once per stopping point (about 10 s each).

## 6. Q4 "Quick Add split" and what waits

**Q4**: with scenarios 1-6 as the safety net, `QuickAddWidget.tsx` splits into one hook per draft
(`useTaskDraft`, `useMeetingDraft`, `useNoteDraft`), the edit mode takes one
`editTarget: {kind: 'task' | 'meeting' | 'loop', …}` instead of three props, and the capture
variant becomes its own thin shell. Every file ≤ 600 lines; its baseline entry is removed;
the `exhaustive-deps` suppressions in it are resolved, not moved.

### 6.1 As built (Q4)

Built on `feature/quickadd-split` from `main`, with two additions agreed for the item card
(the item-card design, §2): the box as row slots, and a `mode` on the edit target.

- **Parts** (`src/ui/quickAdd/`): `types.ts` (drafts, `QuickAddEditTarget`, `editTargetFor`,
  `sameEditTarget`, the capture seed), `useQuickAddCore.ts` (tab, edit-fields slot, pending, error,
  recent tags, abbreviation items), `useTaskDraft.ts`, `useMeetingDraft.ts`, `useNoteDraft.ts`,
  `useEditSession.ts`, `useQuickAddStatus.ts`, `QuickAddFrame.tsx` (`QUICK_ADD_ROWS` = 22/36/32/32,
  gap 6 - unchanged), `TabsRow.tsx`, `TaskRows.tsx`, `MeetingRows.tsx`, `NoteRows.tsx`,
  `styles.ts`; the capture panel `CaptureQuickAdd.tsx` with `useCapture.ts`.
  `ui/QuickAddWidget.tsx` composes them (394 lines; the largest part is 306). The baseline entry
  is gone.
- **Edit target**: `editTarget: {kind: 'task' | 'loop' | 'meeting', mode: 'edit', key, task |
  meeting}` replaces `editingTask`, `editingMeeting`, `editingLoop` and `editTargetKey` on all
  eight screens. React.memo compares it by kind, mode, key and item identity, so a fresh wrapper
  costs no render that the old props did not.
- **Suppressions**: the capture seed is applied through a stable callback keyed on the seed's
  signature; focus on a fresh edit is an explicit request set when the fields load (so a switch
  between targets still never moves focus); the flush is a stable callback, registered in
  `flushEditRef` by an effect and run on unmount by another.
- **Tests**: unchanged scenarios and Quick Add tests green. New
  `__tests__/ui/quickAddEditSession.test.tsx` (edit target helpers, loading versus a fresh
  object, the draft through an edit detour, focus only on a fresh edit, flush only on a change and
  on a failed save, save on unmount). `engageOverlay.test.tsx` finds the widget non-deep: the
  memo with a prop check is a node of its own in the test renderer.

**Not in this plan** (to the backlog): splitting DailyView, InboxScreen, ItemDetail,
FileBrowserPane and `supernote/fileSystem.ts`; a section registry for data-file sections; one
`createStore` helper for the 14 hand-written stores; Prettier (adopt or remove the config);
trimming comments that cite history documents; coverage floors; driving the real device over
adb.

## 7. Decisions

Decided with Tilman (2026-10-19):

- **D1 CI: yes.** A GitHub Actions job runs `npm run check` on every push and pull request,
  which also checks branches that cloud sessions push. This replaces the 0.9.0 decision "no CI".
  It comes with Q1 (§3.5 step 6).
- **D2 `@testing-library/react-native`: yes**, as a dev dependency for the Q2 driver (not in
  the plugin bundle).
- **D3 Write conflict: the user decides what wins** (§3.2). Changes to different parts of the
  file are both kept without asking.
- **D4 Temp file next to the target** (§3.1), as a written exception to the private-folder
  rule. Tilman asked why not the private folder; the answer is in §3.1 (a rename cannot cross
  file systems, and copying is the unsafe write again). Confirmed.

## 8. Test plan

- Q1: unit tests for `writeDataFile` (same stamp; no stamp; changed elsewhere, kept both;
  changed in the same section, "Use mine" and "Use the file"), settings fallback, code-health
  rule tests. Device, on the demo space:
  - [ ] Normal saves on Daily, Inbox, a Project and in Review work as before; no
        `.gtdpara-tmp` files are left in the folders.
  - [ ] The log shows the atomic rename succeeding, not the fallback.
  - [ ] With the plugin open, edit the Scope of a Project's `project.txt` in another app, then
        add a todo in gtdpara: both changes are in the file, no question asked.
  - [ ] With the plugin open, change a todo's line in another app, then edit a todo of the same
        Project in gtdpara: the message appears; "Use the file" keeps the outside version,
        "Use mine" (on a second try) keeps gtdpara's.
  - [ ] Save while killing the plugin from the task switcher: the file is intact.
- Q2: `npm run check` with the scenario step; the scenario list reviewed by Tilman.
- Q3: the crash and corpus tests themselves; device: one close-out on the demo space.
- Q4: scenarios 1-6 unchanged and green; device: Quick Add on Daily, Inbox, Project, capture.
