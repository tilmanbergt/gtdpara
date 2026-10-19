# Technical design: Quality hardening (safe writes, scenario tests)

> Historical document: a plan of four small quality slices (Q1-Q4) that fit between feature
> releases, with the design of each. Requirements as decided, current state, design, steps, test
> plan and open points; each slice gets its own "As built" section when it is done.

Status: **design, waiting for approval** (decisions D1-D4 in §7 are open).

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
| Q1 | Safe writes | yes ("Fixed") | a patch (0.18.1), or inside 0.18.0 if time allows |
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

### 3.2 Write conflict guard

One helper in `storage/projectFile.ts`, `writeDataFile(kind, itemPath, next)`, replaces the
direct `writeTextFile` in every `save…`:

1. `statFiles([path])` and compare with the stamp the cache recorded when it read the file
   (`dataCache.ts`, exposed as `recordedStamp(path)`; the Inbox has its own).
2. Same stamp, or no stamp recorded (file not yet cached): write, then record the new stamp.
3. Different stamp: **do not write**. Re-read the file into the cache (`applyItemRawContent` /
   `applyInboxRawContent`, which notify the screens), and throw `FileChangedError`. The screen's
   existing error path shows it in the status slot: `"Website" was changed outside gtdpara and
   has been reloaded. Please make the change again.` (text in `domain/fileChangeText.ts`).

Refusing is simpler and safer than merging: the user sees the new content and repeats one tap.
External edits during a plugin session are rare, so the cost is low (decision D3).

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

1. Native atomic write + Integrity Check finding for leftovers.
2. `writeDataFile` with the stamp guard; all `save…` in `projectFile.ts` use it; unit tests with
   a stubbed `statFiles`.
3. Verify the settings-fallback failure (§2), then the fix; tests.
4. silent-catch and layer-imports rules with tests in `scripts/test-code-health.mjs`; fix the
   findings.
5. CHANGELOG ("Fixed": files are saved safely if the device switches off mid-save; changes made
   outside gtdpara are no longer overwritten), troubleshooting page, policy §3/§5 lines.

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

## 5. Q3 "Interruptions and messy files"

Uses the harness's fault injection; every failure found is fixed in this slice.

- **Crash at every step**: for close-out/archive (operation journal), `entryMove` (todo with
  note, meeting with note), inbox filing and profile switch: run the flow with
  `crashAfter(n)` for every n, then `closeAndReopen()` and run it again. Expect: nothing lost;
  duplicates only where the design allows them ("moves append first"); the journal finishes.
- **Messy-file corpus**: `__tests__/fixtures/files/` with real-world shapes - every older
  format version, hand edits, CRLF, BOM, empty sections, duplicate headings, very long lines.
  Each file goes through every `save…` and the parser round-trip; user lines must survive.
- **External input**: `domain/icsParser.ts` gets unit tests (folded lines, time zones, all-day,
  recurrence ignored, broken input never throws).

## 6. Q4 "Quick Add split" and what waits

**Q4**: with scenarios 1-6 as the safety net, `QuickAddWidget.tsx` splits into one hook per draft
(`useTaskDraft`, `useMeetingDraft`, `useNoteDraft`), the edit mode takes one
`editTarget: {kind: 'task' | 'meeting' | 'loop', …}` instead of three props, and the capture
variant becomes its own thin shell. Every file ≤ 600 lines; its baseline entry is removed;
the `exhaustive-deps` suppressions in it are resolved, not moved.

**Not in this plan** (to the backlog): splitting DailyView, InboxScreen, ItemDetail,
FileBrowserPane and `supernote/fileSystem.ts`; a section registry for data-file sections; one
`createStore` helper for the 14 hand-written stores; Prettier (adopt or remove the config);
trimming comments that cite history documents; coverage floors; driving the real device over
adb.

## 7. Open points (decisions for Tilman)

- **D1 CI.** The 0.9.0 decision was "no CI". A GitHub Actions job running `npm run check` on
  every push would also check branches that cloud sessions push. Recommendation: add it in Q2
  (free for a public repository, one small workflow file).
- **D2** `@testing-library/react-native` as a dev dependency for the driver (not in the plugin
  bundle). Recommendation: yes; the alternative is a home-made query layer over
  `react-test-renderer`.
- **D3** On a write conflict: refuse and reload (recommended, §3.2) or merge the span into the
  new file content.
- **D4** Temp file next to the target for atomic writes, as a written exception to the
  private-folder rule (recommended, §3.1).

## 8. Test plan

- Q1: unit tests for `writeDataFile` (same stamp, changed stamp, no stamp), settings fallback,
  code-health rule tests. Device: save while the plugin is killed from the task switcher (file
  intact); edit `project.txt` from a computer while the plugin is open, then save in the plugin
  (message, nothing lost); one normal save on each main tab.
- Q2: `npm run check` with the scenario step; the scenario list reviewed by Tilman.
- Q3: the crash and corpus tests themselves; device: one close-out on the demo space.
- Q4: scenarios 1-6 unchanged and green; device: Quick Add on Daily, Inbox, Project, capture.
