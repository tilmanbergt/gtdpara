# Technical design: 0.9.0 "Solid ground" (bugs and technical debt)

> Historical document: written for release 0.9.0. Requirements as decided, current state, design,
> steps, test plan and open points; gets an "As built" section when the release is done.

Status: **design, waiting for approval**. Implementation starts after 0.8.0 "Lasso" is released
and merged, on a branch `feature/quality-0.9` taken from that `main`.

## 1. Goal and decisions

After two feature releases (0.7.0, 0.8.0), 0.9.0 makes the code base easier to change: smaller
files, one implementation per concept, no dead code, docs that describe what is, and local checks
that keep it that way. Users see almost nothing: one bug fix, one date format everywhere, and the
cleaned-up Focus reset step.

Decisions (Tilman, 2026-10-06):

| # | Decision |
|---|---|
| D1 | Scope: all of A (bugs), B (de-duplication), C (split ReviewScreen and Settings), D (dead code, simplification), E (documentation), F (guardrails). QuickAddWidget and DailyView are not split in 0.9.0. |
| D2 | A: the only known bug is the Integrity Check missing interrupted close-outs in `4 Archive/<year>/…`. Anything the 0.8.0 test turns up is added. |
| D3 | Drop the one-time 0.1.0 Inbox move. 0.1.0 was announced as a pre-release; direct upgrades 0.1.0 → 0.9.0 are no longer supported (Upgrade note). |
| D4 | Rename `NoteCreationDefinition` → `TagRule` now, including the settings key, with a migration. |
| D5 | One date format everywhere: day and month without leading zeros, 24-hour time: `6.10.`, `6.10. 14:05`. All formatting goes through one module, so a user-defined format can be added later. |
| D6 | No CI. Checks run on Tilman's computer through local scripts. Builds name the release they belong to: `0.9.0-alpha`, `0.9.0-beta`. |

## 2. Current state (measured 2026-10-06 on `main` with 0.8.0 built)

- 227 source files, ~50,600 non-empty lines; **30 % are comment lines**, 629 lines carry a date
  (history narrated in comments).
- Large files: `ReviewScreen.tsx` 4,629 lines (main component lines 528-3038, 62 `useState`),
  `Settings.tsx` 2,597 (30 `useState`; Tag Rules editor is most of it), `QuickAddWidget.tsx`
  2,413, `DailyView.tsx` 1,881, `fileSystem.ts` 1,296, `ProjectDataPanel.tsx` 1,283.
- `tsc`: 0 errors. Jest: 349 tests. ESLint: **17 errors, 1,132 warnings** (1,026 of them `curly`).
- `e instanceof Error ? e.message : String(e)`: 170 copies; `errorMessage()` used in 11 files.
- Move write: `moveEntryWithNote` is shared, but the append-then-remove around it is written out
  at 9 call sites (Inbox ×2, Review ×2, Daily ×2, ProjectDataPanel ×4, usePlanningScreen ×1) next
  to the shared versions in `storage/itemMove.ts` and `storage/inboxFiling.ts`.
- Edit/arm state (`editTarget`, `armTarget`, `startEditTarget`, `cancelEditTarget`, `armLink…`,
  `armFile…`, `cancelArming`, with `useEditFlush`) is written out in InboxScreen,
  ProjectDataPanel and ReviewScreen; simpler copies in DailyView and usePlanningScreen.
- Review's Focus reset step uses its own `PeriodFocusKindSection` (inline expand picker) while
  Week and Month use `ui/PeriodFocusPanel.tsx` (arm-and-pick).
- Six frozen review steps each repeat snapshot state + freeze effect + reset on step change +
  reset on reload (ReviewScreen lines ~827-905).
- Dates are shown as `5.10.` (taskLabels, WeekGrid, meetingDatePrefix), `09/28` (dateLabel),
  `Mon 9/28` (reviewSteps), `Tuesday, Oct 6th` (formatFullDate - also written into meeting
  notes), `May 15th-16th 2026` (Google Calendar range), `2026-10-05` (About, marks column).
- Integrity Check scans `4 Archive/` one level deep; close-out archives to
  `4 Archive/<year>/[<Area>/]<Project>/`, so archived items and an interrupted close-out after the
  folder move are not found.
- Inbox migration (`storage/inboxMigration.ts` 13 KB, `domain/inboxMigration.ts` 6 KB) mixes the
  one-time move with things that stay: the hidden Inbox folder under Areas, renaming the Inbox
  folder from Settings, and the "old Inbox left at the root" finding of the Integrity Check.
- Unused exports: `HIGHLIGHT_MARK_ROW_WIDTH_PX`, `getFeatures`, `getActiveProfileId`, `hasFocus`,
  `clearPlan`, `savePlanAt`, `ELEMENT_TYPE_TITLE`, `INVALID_FILE_NAME_CHARS_LABEL`, `allEntries`,
  `isWinAnsi`, `perfIsEnabled`, `perfAsync` (no use in `src`, tests or scripts).
- `.github/_github/ISSUE_TEMPLATE/bug_report.yml` duplicates `.github/ISSUE_TEMPLATE/`.
- Docs: `design-overview.md` is 240 KB (191 KB in §2); 61 historical `technical-design-*.md` sit
  next to the 6 living documents; code comments reference design docs 877 times, some with the
  old path `docs/technical-design-…`.
- Builds are labelled with the **last** release: work towards 0.9.0 shows as `0.8.0+dev.a310024`.

## 3. Design

### 3.1 Local checks and build labels (F, D6)

**`npm run check`** (new `scripts/check.mjs`, Node, so it runs the same on Windows and in a
Claude session) runs in order and stops at the first failure:

1. `gen` (refresh `src/generated/`)
2. `tsc --noEmit`, must be 0 errors
3. `eslint src App.tsx index.js __tests__ scripts`, must be 0 errors; warnings are counted
   (`--max-warnings 0` from step S13 on)
4. `jest`
5. `test:scripts`
6. `scripts/code-health.mjs` (below)

`-Quick` / `--quick` skips jest for a fast loop. `release.ps1` runs `npm run check` instead of its
own `tsc` call; `buildPlugin.ps1 -Check` runs it before building (off by default, so a quick
device build stays quick).

**`scripts/code-health.mjs`**: pure rules in `scripts/lib/codeHealth.mjs` (tested in
`test:scripts`), each printing file:line:

| Rule | Limit |
|---|---|
| File length | New files ≤ 1,000 lines. Files already longer (QuickAddWidget, DailyView, fileSystem, ProjectDataPanel, InboxScreen, App.tsx) are listed in `scripts/code-health-baseline.json` with their size; they may shrink, not grow (ratchet - the baseline is lowered when they shrink). |
| Error text | No `instanceof Error ?` outside `utils/errorMessage.ts`. |
| History in comments | No date (`20YY-MM-DD`) and no "used to / previously / old … / replaces the old / was … before" in comments under `src/` and `App.tsx`. |
| Logging and messages | No `console.` outside `utils/log.ts`/`logSink.ts`; no `Alert.alert` (policy §4, §5). |
| Doc references | Every `technical-design-*.md` / `design-*.md` named in code or docs exists at that path. |

Until step S13 the rules only report (`--report`), so the clean-up steps can bring the counts
down; S13 makes them fail.

**ESLint config**: `curly` becomes `['warn', 'multi-line']` - the code base consistently uses
one-line `if (x) return y;`, which the default rule flags 1,026 times. Remaining warnings (quotes,
trailing spaces: `--fix`; unused disables; inline styles) are fixed in S2/S9/S10.

**Build labels**: `package.json` gets `"nextVersion": "0.9.0"` - the release the work is for. Set
with `npm run next-version -- 0.9.0` (new `--set-next` in `gen-bundled-content.mjs`; must be
higher than `version`). `buildPlugin.ps1 -Stage alpha|beta` (default `alpha`) passes the stage
on. `buildLabel()` becomes:

| Situation | Label | File |
|---|---|---|
| Release build (HEAD tagged `v0.9.0`, clean) | `0.9.0` | `gtdpara-0.9.0.snplg` |
| `nextVersion` > `version` | `0.9.0-alpha+a310024` (`.dirty` appended when uncommitted) | `gtdpara-0.9.0-alpha+a310024.snplg` |
| no `nextVersion` above `version` | `0.8.0+dev.a310024` (as today) plus a warning "set the next version" | as today |

- **alpha**: spikes and work in progress; **beta**: the release is feature-complete and in its
  final device test. The stage is a label only; nothing in the app behaves differently.
- `BUILD_INFO` gains `stage` and `nextVersion`; About shows the label as today; the in-app "What's
  new" heads the Unreleased section `0.9.0 (in progress)` instead of "Not yet released".
- The packaged `PluginConfig.json` keeps `versionName = version` (the host shows it; open point
  O3), `versionCode` unchanged (minutes since 2026-01-01).
- `release.ps1` without `-Bump`/`-Version` uses `nextVersion`; with `-Bump`, it stops if the result
  differs from `nextVersion`. After a release `nextVersion` equals `version`, so labels fall back
  until the next `npm run next-version`.
- `RELEASING.md` §4/§5 and `docs/dev/README.md` "Building" describe the stage and
  `next-version`; the step-by-step guides name the stage to build.

### 3.2 Integrity Check finds archived items in year folders (A)

`storage/integrityCheck.ts` replaces the one-level Archive listing with a bounded walk:
`collectArchiveTargets(list, archiveRoot, maxDepth = 3)` - every folder holding `project.txt` or
`area.txt` is a target (`inArchive: true`); the walk continues into its sub-folders too (an
archived Area at `Archive/<year>/<Area>/` holds archived projects). Folders without a data file
(`<year>/`, an Area's folder that only groups projects) are walked through, not reported. The walk
is pure logic over an injected `list(path)` (`domain/closeOut/archiveScan.ts`), so it is tested
with a fake tree: legacy flat `Archive/<name>/`, `Archive/2026/<Project>/`,
`Archive/2026/<Area>/<Project>/`, an archived Area with projects inside, a PDF next to a folder,
depth limit. `checkCloseOutInterrupted` then sees interrupted runs after the folder move;
`checkDuplicateAbbrev` already ignores archived items. CHANGELOG: Fixed.

### 3.3 Dead code, lint errors, stray files (D)

- Delete the 12 unused exports listed in §2 (and what only they used).
- Fix the 17 lint errors (12 unused variables incl. `isDarkMode` copies, 5 hook dependencies -
  each checked, not silenced) and the 12 unused `eslint-disable` comments; review the other 40
  disables (keep only with a reason on the same line).
- Remove the 18 `any` where a real type exists (SDK results get the types in
  `supernote/sdkElements.ts`).
- Delete `.github/_github/`.
- `.gitignore`: make sure `Claude outputs/` and `build/` stay ignored (they are).

### 3.4 One way to turn an error into text (B)

`errorMessage(e)` (`utils/errorMessage.ts`) replaces all 170 copies. `useActionError` replaces the
remaining local try/catch/set-error wrappers: ReviewScreen's ~30 inline copies (including
`PeriodFocusKindSection`, which goes away in S9 anyway), DailyView's own `actionError` handlers,
`ItemStatusPanel`, `PeriodFocusPanel`, `QuickAddWidget`. Mechanical; behaviour unchanged (same
log text, same status-slot message).

### 3.5 One date format (D5)

New `src/domain/dateFormat.ts` - the only place that turns a date or time into display text:

| Function | Example | Rule |
|---|---|---|
| `formatDate(iso, today)` | `6.10.` / `6.10.2027` | day.month., year only when not the current year |
| `formatTime(hhmm)` | `9:05`, `14:05` | 24 h, no leading zero on the hour (O1) |
| `formatDateTime(iso, hhmm, today)` | `6.10. 14:05` | |
| `formatDayHeader(iso, today)` | `Tue 6.10.` | weekday short name + date (headers that today say `Tuesday, Oct 6th`) |
| `formatDateRange(a, b, today)` | `15.5.–16.5.` | |
| `formatMonth(key)` | `October 2026` | months stay names - they are periods, not dates |

Relative words stay where they are today ("today", "yesterday", "3 days ago" in the Review hub,
"next week" after Quick Add); their fallback switches from `9/28` to `28.9.`. Week keys stay `W41`.

Callers switched: `taskLabels.shortDate`, `WeekGrid.shortDate`, `meetingDatePrefix`,
`dateLabel.describeAddedDate`, `reviewSteps.formatReviewedAt`, `formatFullDate` (Daily day panel,
Settings preview, **meeting note text** - only notes created after the update), 
`formatDateRangeHeader` (Google Calendar), `formatGmailFetchedAt`, marks column date/time, About
release date, close-out PDF dates. The step starts with a full inventory (grep for date fields
rendered in `ui/`, `screens/`, note and PDF text) recorded in "As built"; `code-health` then
flags new `padStart(2, '0')` date building outside `domain/dateFormat.ts` and `domain/weekDate.ts`.

Not changed: files (ISO `YYYY-MM-DD`, `HH:mm` - file format), the date input fields (still
`YYYY-MM-DD`, O2), log lines. The format lives in one place so a later setting can choose it;
no setting in 0.9.0. CHANGELOG: Changed. Help pages that show example dates are updated.

### 3.6 Drop the 0.1.0 Inbox move (D3)

- Delete `migrateInboxIfNeeded`, the plan (`planInboxMigration`, ops, link rewriting), the
  outcome map, the startup notice (`takeInboxMigrationNotice` in App.tsx), the debug-bundle line,
  `effectiveInboxFolder(For)` (the Inbox is always the configured folder) and
  `ResolvedParaPaths.legacyInboxFolder`.
- What stays moves to **`storage/inboxFolder.ts`**: `hiddenAreaFolderFor` (now simply the
  configured Inbox folder) and `renameInboxFolderForSave`. `domain/inboxMigration.ts` shrinks to
  `legacyInboxLeftovers` + `INBOX_NOTE_FOLDERS`, moved into `domain/integrityCheck.ts`: someone
  who skips releases still gets an Integrity Check finding "Inbox.txt left at the root" and can
  move it by hand.
- Tests: the migration tests go; the leftovers and rename tests stay.
- CHANGELOG Upgrade note: "Upgrading from 0.1.0: install 0.8.x first (it moves the Inbox), or
  move `Inbox.txt` and its Todos/Meetings folders into `Areas/0 Inbox` yourself; the Integrity
  Check points them out."
- Same step, same rule: settings migrations for states that only existed before 0.1.0 are
  removed - `migrateReviewSteps` (legacy keys from before the Review hub) and
  `migrateLegacyTextPieces` (text pieces before rule texts), each after checking the 0.1.0 tag
  that no 0.1.0 install can still hold that state. `migrateExperimentalFlags` and
  `migrateNoteTemplateDefaults` stay (they serve current installs).

### 3.7 `TagRule` (D4)

- Types and functions: `NoteCreationDefinition` → `TagRule` (81 uses), `noteCreationDefinitions`
  → `tagRules` (42), `nextNoteDefinitionId` → `nextTagRuleId`; related names
  (`createDefaultMeetingDefinition`, `definitionTexts`, `draftDef`, …) follow the same word.
  24 files.
- Settings: new keys in `DEFAULT_SETTINGS`; `migrateTagRuleKeys(merged, raw)` in
  `domain/noteTemplate.ts` (renamed `domain/tagRules.ts` in the same step - it is the Tag Rules
  module) copies the old keys when the new ones are missing, then deletes the old ones; same
  "return the same object when nothing changes" contract, run in `settingsStorage.ts` before
  `migrateNoteTemplateDefaults`.
- Profiles: `sanitizeProfileSettings` accepts the old key in profile files written by ≤ 0.8 and
  maps it; profile files are written with the new key. Classification unchanged (per profile).
- Tests: migration (old only, new only, both, neither), profile import of an old file, round trip.
- CHANGELOG Upgrade note: "Tag Rules are stored under a new name; this happens automatically on
  first start. Profile files from earlier versions still import."

### 3.8 One move (B)

`storage/entryMove.ts` gets the one write every move uses:

```ts
moveTask(source: EntrySource, index: number, updated: Task, target: MoveTarget, ui: EntryMoveUi): Promise<Task | null>
moveMeeting(source: EntrySource, index: number, updated: Meeting, target: MoveTarget, ui: EntryMoveUi): Promise<Meeting | null>
type EntrySource = {kind: GtdParaKind | 'inbox'; path: string};
```

Inside: `moveEntryWithNote` (note step, confirm) → append to the target (item or Inbox) → remove
from the source with `mutateEntryTasks/Meetings` (file first, then cache, then
`notifyCacheChanged`). Append before remove: a failure leaves a duplicate, never a loss (as now).
`storage/itemMove.ts`'s `moveTaskTo/moveMeetingTo` and `inboxFiling.ts`'s `fileInboxTask/Meeting`
become thin calls or disappear; all 9 screen copies call `moveTask/moveMeeting`.

Screens no longer write their own state after a move; they update from the cache like after any
other mutation. Inbox and Review already read the Inbox through `useCachedInbox`; DailyView and
usePlanningScreen through the cache. **ProjectDataPanel** keeps a local `state` copy today: it
switches to reading its item from the cache (`useCachedItems` + path), and `withTasks`/
`withMeetings` become `mutateEntryTasks/Meetings`. This is the riskiest part of B (refresh
behaviour of the Current tab); its own commit, own device test.

Tests: `entryMove.test.ts` extended - item → item, item → Inbox, Inbox → item, failure after
append (duplicate, nothing lost), cancel in the note confirm (nothing written).

### 3.9 One edit/arm state (B)

`ui/useEditTarget.ts`:

```ts
const edit = useEditTarget<EditRef, ArmIntent>({arming: true});
// edit.target, edit.arm, edit.start(ref), edit.cancel(), edit.armFor(ref, intent), edit.cancelArm(),
// edit.flushEditRef  (pass to QuickAddWidget - wraps useEditFlush: save-then-switch)
```

`start` saves the open edit first (`useEditFlush.afterSave`), `cancel` also clears an open arm -
exactly today's behaviour, now written once. Used by InboxScreen, ProjectDataPanel, ReviewScreen
(Inbox-to-zero), DailyView and usePlanningScreen (`arming: false`). Test with
react-test-renderer: start → start other (flush called, switch only after save ok), save fails
(no switch), cancel clears arm.

### 3.10 ReviewScreen in pieces (C)

New folder `src/screens/review/`:

| File | Content |
|---|---|
| `ReviewScreen.tsx` | the shell: hub vs. walk-through, step navigation, aggregate loading, status; < 600 lines |
| `useReviewData.ts` | aggregate, Inbox, Gmail cache, reload |
| `useFrozenStepList.ts` | snapshot + acted-on set + freeze on entry + reset on step change/reload, once for all six frozen steps |
| `steps/WeekAheadStep.tsx` (existing `ReviewWeekAhead.tsx` moves here) | |
| `steps/MeetingsCloseOutStep.tsx` | with `MeetingCloseOutDetail`, `CloseOutMeetingRow` |
| `steps/GmailStep.tsx` | `GmailDetailPanel`, rows, refresh label |
| `steps/InboxStep.tsx` | Inbox to zero with Quick Add (`useEditTarget`, `moveTask`) |
| `steps/ItemListStep.tsx` | the master-detail steps Stalled, Done, On hold, Neglected (one component, step-specific detail via props: `ReviewItemDetail`, `DoneOnHoldDetail`) |
| `steps/UnfocusedNextStep.tsx` | rows, heights, detail |
| `steps/FocusResetStep.tsx` | `PeriodFocusPanel` (see below) |
| `reviewLayout.ts` | the px constants and viewport budget |

Steps get what they need as props from the shell (data, `onActed`, `onOpenItem`); no new context.
The step list and titles stay in `domain/reviewSteps.ts`. `useFrozenStepList` gets a hook test.

**Focus reset step**: `PeriodFocusKindSection` (inline expand picker, review-only) is deleted. The
step shows a `Week | Month` mini-tab and one `PeriodFocusPanel` for that scope - the same panel
as the Week and Month tabs (arm-and-pick, slots, goals). User-visible: the step looks like the
Focus panel elsewhere (O4). Help page `review.md` updated.

Behaviour otherwise unchanged; each extracted step is its own commit so a regression points at
one step. Device test walks all 10 steps.

### 3.11 Settings in pieces (C)

`src/screens/settings/` (already holds About, Advanced, Profiles):

| File | Content |
|---|---|
| `Settings.tsx` (moves here) | tabs, stored vs. draft settings, save/discard, status; < 500 lines |
| `useSettingsDraft.ts` | load, draft, dirty, save (incl. Inbox rename), reload |
| `FoldersTab.tsx`, `FocusTab.tsx`, `CalendarTab.tsx`, `GmailTab.tsx` | one per tab |
| `tagRules/TagRulesTab.tsx` | list of rules |
| `tagRules/TagRuleEditor.tsx` | one rule: tags, context, target, split by tag, tracking |
| `tagRules/TemplateEditor.tsx`, `tagRules/PieceEditor.tsx`, `tagRules/AddPieceList.tsx` | the three sub-views |
| `tagRules/useTagRuleDraft.ts` | draft rule, pieces, texts, validation |

App.tsx imports Settings from the new path. No behaviour change; smoke render test of every tab.

### 3.12 Comments say why, not when (E)

Rule (DEVELOPMENT-POLICY §6, new paragraph): code comments describe what the code does and why,
now. History - dates, "used to", "replaces the old …", who reported what - lives in git and in
the technical design; a comment may point to the design doc for the why.

The sweep removes the 629 dated lines and the history around them, file by file, keeping the
reasons. Files split in S9/S10 are cleaned as they are split. The `code-health` rule then keeps
it clean. Expected: comment share drops from 30 % to ~20 %, no information about the current
code is lost (reviewed per file in the diff).

### 3.13 Documents (E)

1. **History folder**: all historical documents (`technical-design-*.md`, `spike-*.md`,
   `requirements-*.md`, `design-meeting-lists.md`, `public-release-guide.md`,
   `device-test-*.md`) move to `docs/dev/history/` (`git mv`). A script rewrites the 877
   references in code, tests, scripts and docs (also fixing the old `docs/technical-design-…`
   form); the `code-health` doc-reference rule proves none is broken. `docs/dev/` then holds
   only the living documents.
2. **design-overview.md** (living-docs step 2): rewritten by subsystem, present tense, checked
   against the code: §2 from 41 feature-by-feature subsections to ~12 subsystem sections (screens
   and navigation, data model and file format, cache, Quick Add and editing, moves and filing,
   notes and Tag Rules, review, planning, close-out and archive, lasso and marks, integrations,
   settings and profiles, diagnostics); §3 rules; §4 "Outstanding scope" removed (backlog); §5
   becomes "Why it is built this way" in present tense. Target < 80 KB.
3. **design-device-rendering.md** (step 3): dp vs. px throughout, measured paging via
   `usePagedByHeight`, `includeFontPadding` on the row components, no screenshot-dated notes.
4. **DEVELOPMENT-POLICY.md**: §6 comment rule; §7 `npm run check` replaces the single commands;
   §8/§9 checklists use it; file-size rule in §3 (≤ 1,000 lines for new files, ratchet for old).
   **RELEASING.md**: stages, `next-version`, `-Check`. **README (dev)**: code tour gains
   `screens/review/`, `screens/settings/`, history folder. **CLAUDE.md**: `npm run check`.

## 4. Steps

One commit per step (or per numbered sub-step), each ends with `npm run check` green (from S0 on).
Delivered like 0.5.0: built and committed in a Claude session on a local copy, handed over as
patch files plus an apply script that checks the baseline hashes.

| Step | What | User-visible | Device test |
|---|---|---|---|
| S0 | `check`, `code-health` (report mode), ESLint `curly`, `nextVersion` + `-Stage` labels, release.ps1 | build label | build shows `0.9.0-alpha+…`, About, What's new heading |
| S1 | Integrity Check archive walk | Fixed | run Integrity Check with an archived project (demo space: close out + archive one) |
| S2 | dead code, lint errors, `any`, disables, `.github/_github` | - | smoke: main tabs |
| S3 | `errorMessage` / `useActionError` everywhere | - | trigger one error (e.g. invalid meeting time) on Daily, Review, Current |
| S4 | `dateFormat.ts` + all callers | Changed | every screen with dates: Daily, Week, Month, Current, Inbox, Review hub, marks, Google Calendar, About, new meeting note |
| S5 | Inbox move removed, pre-0.1.0 migrations removed | Upgrade note | start with existing data: Inbox there, rename Inbox folder in Settings |
| S6 | `TagRule` rename + migration | Upgrade note | update over 0.8: Tag Rules still there; import an old profile file |
| S7 | one move (S7a shared function + 8 call sites, S7b ProjectDataPanel on cache) | - | move todo/meeting: Inbox → project, project → project, project → Inbox, Daily quick-file, with and without note; Current tab refresh after edits |
| S8 | `useEditTarget` | - | edit, switch rows (save-then-switch), arm link/refile, cancel - on Inbox, Current, Review Inbox step, Daily, Week |
| S9 | ReviewScreen split (one commit per step file), Focus reset on `PeriodFocusPanel` | Changed (Focus reset) | full review walk-through, all 10 steps, hub counts |
| S10 | Settings split | - | every Settings tab, edit and save a Tag Rule, template, piece; folders save incl. Inbox rename |
| S11 | comment sweep | - | none (comments only; `check` + diff review) |
| S12 | docs: history folder + reference rewrite, design-overview, device-rendering, policy, releasing, README, CLAUDE.md | - | none |
| S13 | `code-health` and `--max-warnings 0` switched to failing; baseline file finalised | - | none |

Order: S0 first (tools for everything else). S1-S6 are independent and small. S7/S8 before S9,
so the split moves already-shared code instead of copies. S11 after S9/S10. S12 last but one,
because every earlier step changes what the docs must say; S13 closes the door.

Beta: after S10 a full device round as `0.9.0-beta`; S11-S13 don't change behaviour, a final
`check` and a short smoke test before release.

## 5. Test plan

**Automated (every step)**: `npm run check` green. New tests: archive walk (S1), `dateFormat`
incl. year boundary and invalid input (S4), Tag Rule key migration and old profile import (S6),
move cases (S7), `useEditTarget` (S8), `useFrozenStepList` (S9), smoke renders of every Review
step and Settings tab (S9/S10), `codeHealth` rules and `buildLabel`/`--set-next` (S0,
`test:scripts`). Existing tests keep passing unchanged except where a test covered removed code
(Inbox migration).

**Device (0.9.0-beta, demo space)**, in addition to the per-step column above and RELEASING §6:

- [ ] Update over 0.8.x: settings, Tag Rules, profiles, Inbox all still there; no migration notice.
- [ ] Dates: every date on Daily, Week, Month, Current, Inbox, Review (hub + steps), marks,
      About, a new meeting note, a close-out PDF reads `D.M.` / `D.M. H:mm`.
- [ ] Review: walk all steps; Focus reset sets weekly and monthly focus; counts on the hub right.
- [ ] Moves from every place that can move; Current tab shows changes immediately.
- [ ] Settings: every tab; Tag Rule edit and save; Inbox folder rename.
- [ ] Integrity Check: archived project found; interrupted close-out after folder move found.
- [ ] No noticeable slowdown on tab switches (perf tracing on, compare with 0.8.0).

## 6. Files (overview)

New: `scripts/check.mjs`, `scripts/code-health.mjs`, `scripts/lib/codeHealth.mjs`,
`scripts/code-health-baseline.json`, `src/domain/dateFormat.ts`,
`src/domain/closeOut/archiveScan.ts`, `src/storage/inboxFolder.ts`, `src/ui/useEditTarget.ts`,
`src/screens/review/**`, `src/screens/settings/{Settings,useSettingsDraft,FoldersTab,FocusTab,CalendarTab,GmailTab}.tsx`,
`src/screens/settings/tagRules/**`, `docs/dev/history/` (moved files).

Removed: `src/screens/ReviewScreen.tsx`, `src/screens/ReviewWeekAhead.tsx`,
`src/screens/Settings.tsx` (moved), `src/storage/inboxMigration.ts`,
`src/domain/inboxMigration.ts`, migration tests, `.github/_github/`.

Changed (main ones): `scripts/lib/versioning.mjs`, `scripts/gen-bundled-content.mjs`,
`scripts/release.ps1`, `buildPlugin.ps1` (`-Stage`, `-Check`), `package.json` (`nextVersion`,
scripts), `.eslintrc.js`, `storage/integrityCheck.ts`, `storage/entryMove.ts`,
`storage/itemMove.ts`, `storage/inboxFiling.ts`, `storage/settingsStorage.ts`,
`domain/settings.ts`, `domain/profiles.ts`, `domain/noteTemplate.ts` → `domain/tagRules.ts`,
the screens using moves/edit state, every file with date display, `App.tsx`, CHANGELOG, help
pages `review.md` and pages with example dates, living dev docs, CLAUDE.md.

## 7. Risks

- **ProjectDataPanel on the cache (S7b)**: the Current tab could show stale data or re-render
  more. Own commit, own device test, perf trace compared with 0.8.0.
- **ReviewScreen split (S9)**: many small state links between steps. One commit per step,
  smoke render per step, full walk-through on the device.
- **Reference rewrite (S12)**: mechanical, proven by the doc-reference rule.
- **Removing the Inbox move (S5)**: a 0.1.0 user who jumps straight to 0.9.0 sees an empty Inbox
  until they move the file - mitigated by the Upgrade note and the Integrity Check finding.
- **Size**: 14 steps; the release can be cut after S10 if needed - S11-S13 are docs and tooling.

## 8. Open points

- **O1** Hours without leading zero (`9:05`), as D5 implies for day and month? Proposed: yes.
- **O2** Date input fields stay `YYYY-MM-DD` in 0.9.0 (typing `6.10.` would need a parser and
  year guessing). Proposed: keep, revisit with the user-defined format.
- **O3** Should the packaged `versionName` carry the stage (`0.9.0-alpha`), so the Supernote's
  plugin list shows it? Needs one device check that the host accepts a non-numeric versionName.
  Proposed: try in S0; keep `0.9.0` if the host complains.
- **O4** Focus reset step with a `Week | Month` mini-tab instead of two stacked lists - fine?
- **O5** Meeting note headers (written into new notes) also switch to `Tue 6.10.`? Proposed: yes,
  for consistency; existing notes are not touched.
