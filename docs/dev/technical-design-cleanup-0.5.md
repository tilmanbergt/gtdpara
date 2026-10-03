# Technical design: cleanup release (0.5.0)

Status: **designed, waiting for Tilman's decisions (§2) and approval** - 2026-10-03.
Branch: `feature/cleanup-0.5`. Source: the twelve backlog items picked on 2026-10-03.

This is a bundle of small cleanups, not one feature. Each step is one commit
(`RELEASING.md` §3) with its own tests, help-page changes and CHANGELOG line. The steps are
independent, so any of them can be dropped or moved to a later release without touching the
others.

## 1. Where the twelve items stand (code check, 2026-10-03)

Everything below was checked against the code on the device as of 0.4.0, with a fresh
`npm install`, `npx tsc --noEmit` and `npm test` run in a clean copy.

| # | Item | Finding | Plan |
|---|---|---|---|
| 1 | Review Done/On hold: MeetingRow props | All three read-only `MeetingRow`s in `ReviewScreen.tsx` (~474, ~3171, ~3346) pass every required prop; `tsc` is clean. | **Device check only**, then close |
| 2 | Week ahead ignores multi-day meetings | The step itself is fine (it is `WeekPlanner`, which uses `entriesInRange`). The **hub count** is wrong: `buildReviewAggregate` counts meetings whose *start date* is in today..today+6. That misses multi-day meetings that started earlier, skips Inbox meetings, and on Fri-Sun counts a different week from the one the step shows. | **Step S2** |
| 3 | One shared filename rule | `storage/noteLinks.ts` (`\ / : * ? " < > \| #`) and `domain/emailNote.ts` (`\ / : * ? " < > \|` + control chars, no `#`) differ. `createItem` only rejects `/` and `\`. | **Steps S3a, S3b** |
| 4 | Unused selection button | **Already gone from the code** (`index.js`, `buttonIds.ts`). Only `design-overview.md` §4 still describes it. | **Step S1** (doc only) |
| 5 | Leftover tsc errors | **0 errors** on 0.4.0 (in the clean copy). | **Check locally**, then close |
| 6 | Shared action-error wrapper | 9 local wrappers (`runTaskAction`, `runMeetingAction`, `runWidgetSave`) in Inbox, Daily, Current (`ProjectDataPanel`) and `usePlanningScreen`, plus ~200 copies of `e instanceof Error ? e.message : String(e)` across `src/`. | **Step S4** |
| 7 | Missing tests for pure logic | No tests for `buildReviewAggregate`/`buildReviewStepCounts`, frontmatter `status` round trip, `destinationCandidates`, `groupDailyTasksByItem`, `groupTasksByFlowState`. `isReviewOverdue` is already partly covered. | **Step S5** |
| 8 | Move 🔄 from the TabBar into Settings | The help tells users to tap 🔄 after editing files outside gtdpara (`files-and-folders.md`, `projects-and-areas.md`, `troubleshooting.md`, `getting-started.md`). Without "reload only when something changed" (render-perf round F), moving it makes the Obsidian/external-edit case worse. | **Decision D3** - proposed: defer |
| 9 | Clipboard and date-nudge strip styles | The floating strip is defined three times, byte-identical: `ClipboardTextInput.overlay/button`, `DateInput.strip/stripButton`, `QuickAddWidget.clipboardOverlay/clipboardButton`. | **Step S6** |
| 10 | Keywords on own notes | `createLinkedNote` creates the note without keywords; shared pages and Quick Add Note notes get them. | **Step S7** |
| 11 | CHANGELOG `[Unreleased]` wording | **Already done**: `[Unreleased]` is empty in 0.4.0. | Close |
| 12 | "Settings Folders" screenshot | Manual. The image is `docs/user/images/20260930_Settings Folders.png`. | **Tilman** (§4) |

Also found:

- **Help page error.** `docs/user/note-templates.md` "Finding notes again" uses
  `2026-10-04 - Site visit with Marco #marco` as an own-note file name. File names haven't
  contained `#` since 2026-09-23; the real name is `... Marco marco`. Fixed in S3a.
- **The Inbox move code can't be removed yet.** The backlog says "only builds before 0.2.0
  (never public) need it", but 0.1.0 was public (2026-09-30) and its Inbox lived in `Note/`. The
  backlog entry gets corrected; removal waits until a release where dropping 0.1.0 upgrades is
  acceptable.

## 2. Decisions needed from Tilman

| | Question | Proposal |
|---|---|---|
| D1 | Should the shared filename rule also replace Obsidian's link breakers `[` `]` `^` (`\|` is already in)? Only affects **new** file names. | **Yes**: one rule, Obsidian-safe. |
| D2 | A new Project/Area name with a forbidden character: reject it with a message, or create it under a cleaned-up name? | **Reject**, naming the characters. The folder name is what the user typed; silently changing it would surprise them. |
| D3 | 🔄 to Settings (item 8) | **Defer** until reopening reloads changed files on its own (render-perf F). Stays on the backlog. |
| D4 | Which keyword does an own note get? (a) the same keyword a shared page gets (meeting: `date + title`, todo: text with free tags), or (b) one keyword per tag | **(a)**: one rule for both kinds, so a keyword search finds own notes and shared pages alike. Set once at creation; a later title change doesn't update it (as with the file name). |
| D5 | Version | **0.5.0** (minor): S7 is new and S3 changes behavior. Alternative: 0.4.1 with S1, S2, S4-S6 only, then S3/S7 in 0.5.0. |

## 3. Steps

Order = commit order. The no-risk steps come first, so the branch is always mergeable up to the
last finished step.

### S1 - Docs: remove the stale selection-button note (item 4)

- `docs/dev/design-overview.md` §4: delete the "Selection button" bullet.
- No CHANGELOG line (not user-visible).
- Commit: `Remove stale selection-button note from design overview`

### S2 - Fix the Review hub's Week ahead count (item 2)

- Move `initialWeekAheadOffset(now)` from `screens/ReviewWeekAhead.tsx` to
  `domain/weekDate.ts` as `weekAheadOffset(now)` (pure). `ReviewWeekAhead.tsx` imports it.
- `storage/reviewAggregate.ts`: `weekMeetings` = **one entry per meeting** (not per covered
  day) that overlaps the week the step opens on:
  `weekRangeIso(shiftWeeks(now, weekAheadOffset(now)))`, using
  `domain/meetingSpan.ts`'s `entriesInRange` (keep the first entry per meeting).
  Cancelled meetings stay out.
- **Inbox meetings**: `buildReviewStepCounts` gets a `weekAheadInboxCount` argument (same
  pattern as `inboxOpenCount`). ReviewScreen computes it from its Inbox copy with the same
  helper, so the hub and the step agree.
- Shared helper in the domain: `countMeetingsInRange(meetings, start, end)` in
  `domain/meetingSpan.ts`, used by both.
- Tests (`__tests__/domain/weekAhead.test.ts`): offset on Mon..Sun; a 3-day meeting starting
  the day before the range is counted once; a meeting on the last day of the range counts, the
  day after doesn't; cancelled ones don't count.
- CHANGELOG `### Fixed`: "The Review's Week ahead count now matches the week the step shows,
  including multi-day meetings and meetings in the Inbox."
- Help: `docs/user/review.md` already says "this week's meetings ...; from Friday to Sunday the
  coming week" - the count now matches that text, no change needed.
- Commit: `Fix Review hub Week ahead count for multi-day and Inbox meetings`

### S3a - One filename rule (item 3, Obsidian part a)

- New pure module `src/domain/fileName.ts`:
  - `INVALID_FILE_NAME_CHARS` = `\ / : * ? " < > | #`, control characters, plus `[ ] ^` (D1).
  - `sanitizeFileNameComponent(input, fallback = 'Untitled')` - same behavior as today.
  - `invalidFileNameChars(input): string[]` - the forbidden characters in a string, for S3b.
- `storage/noteLinks.ts` re-exports `sanitizeFileNameComponent` from the domain module (no
  call site changes; its long doc comment moves with it).
- `domain/emailNote.ts`: `sanitizeSubject` uses the shared character set (keeps its 80-character
  cut and "No subject" fallback).
- Tests (`__tests__/domain/fileName.test.ts`): every forbidden character, control characters,
  whitespace collapse, empty → fallback, emoji kept, email subject with `#`/`[`.
- Help: fix the `note-templates.md` example; mention in `files-and-folders.md` that gtdpara
  leaves out `# [ ] ^ |` from file names it creates, so links work in Obsidian.
- CHANGELOG `### Changed`: "File names gtdpara creates no longer contain `#`, `[`, `]` or `^`
  (also for notes from Gmail), so links to them work in Obsidian. Existing files keep their
  names."
- Commit: `Use one Obsidian-safe file name rule for every created file`

### S3b - Validate new Project/Area names (item 3, rest of part a)

- `storage/createItem.ts`: after the `/`/`\` check, use `invalidFileNameChars(trimmed)`; if
  any are found, throw `Name can't contain <chars>.` (D2). The message goes through the
  existing status-slot error path of `ItemsList.tsx` - check that during implementation.
- No change for existing items (folders aren't renamed).
- Help: `projects-and-areas.md` - one sentence on which characters can't be used.
- CHANGELOG `### Changed`: "New project and area names can't contain `# [ ] ^` and the other
  characters file names can't hold; the message says which."
- Commit: `Reject Obsidian-breaking characters in new Project/Area names`

### S4 - `errorMessage()` and `useActionError()` (item 6)

- `src/utils/errorMessage.ts`: `errorMessage(e: unknown): string`. Replace the pattern
  file by file in the four screens touched below only; the other ~150 copies stay (backlog
  item "use errorMessage everywhere", mechanical, low value).
- `src/ui/useActionError.ts`:
  ```ts
  useActionError(statusName: string, logPrefix: string): {
    error: string | null;
    clear: () => void;
    run: (fn: () => Promise<void>) => Promise<void>;      // replaces runTaskAction / runMeetingAction
    runSave: (fn: () => Promise<void>) => Promise<boolean>; // replaces runWidgetSave
  }
  ```
  It holds the `useState`, calls `useErrorStatus(statusName, error, clear)` and logs with
  `logError(logPrefix, message)`. Status names and log prefixes stay exactly as today, so the
  logs and status slot don't change.
- Adopted in `InboxScreen`, `DailyView`, `ProjectDataPanel` (`widgetError`) and
  `usePlanningScreen` (`widgetError`, `meetingsActionError`, still returned to Week/Month).
  `runWidgetAction` becomes `(fn) => runSave(fn).then(() => undefined)` from the hook.
- **Not in this step**: ReviewScreen's ~30 inlined copies and the edit/arming state machine
  (backlog, own step later).
- Tests (`__tests__/ui/useActionError.test.tsx`): success clears the error, failure sets it and
  logs, `runSave` returns true/false.
- No CHANGELOG line (no behavior change).
- Commit: `Extract useActionError hook for screen action errors`

### S5 - Tests for pure logic (item 7)

New test files, no source changes (if a test finds a bug, it becomes its own fix commit):

- `__tests__/storage/reviewAggregate.test.ts`: stalled / done / on hold / neglected
  membership; `buildReviewStepCounts` returns a count for every `ReviewStepId`.
- `__tests__/domain/frontMatterStatus.test.ts`: `parseFrontMatter` /
  `writeFrontMatterIntoContent` round trip for each status, unknown frontmatter lines survive,
  a file without `status` reads as active.
- `__tests__/domain/destination.test.ts`: only Active items; focused first; order otherwise
  kept.
- `__tests__/domain/flowState.test.ts`: `groupTasksByFlowState` order, empty groups left out,
  cancelled tasks hidden, `index` points into the original array.
- `__tests__/storage/dailyGrouping.test.ts`: `groupDailyTasksByItem`.
- Commit: `Add tests for review aggregate, status frontmatter and task grouping`

### S6 - One floating strip style (item 9)

- `ui/commonStyles.ts`: `floatingStrip`, `floatingStripButton`, `floatingStripButtonText`
  (the existing values, unchanged).
- `ClipboardTextInput.tsx`, `DateInput.tsx`, `QuickAddWidget.tsx` use them and drop their
  copies. Pixel-identical by construction.
- No CHANGELOG line.
- Commit: `Share the floating clipboard/date strip style`

### S7 - Keywords on own notes (item 10)

- `storage/noteLinks.ts` `createLinkedNote` gets a `keyword: string` parameter; after
  `createNote`, `insertKeyWord(absolutePath, 0, keyword)`. A failed keyword insert is logged
  (`logWarn`) and doesn't fail note creation - the note exists and works without it.
- `storage/meetingNoteContent.ts` passes `meetingPageKeyword(meeting)` /
  `todoPageKeyword(task)` - the same keyword a shared page would get (D4).
- Only new notes. Existing own notes are not touched.
- Tests: extend `__tests__/storage/noteCreationPlan.test.ts` (it already mocks
  `fileSystem`; add `insertKeyWord` to that mock): an own-note create calls `insertKeyWord`
  once with the expected keyword on page 0; a rejecting `insertKeyWord` still returns the
  note path.
- Help: `note-templates.md` "Finding notes again" - own notes get the same keyword as a shared
  page.
- CHANGELOG `### New`: "A todo's or meeting's own note gets a keyword too (its date and title,
  or the todo's text), so the Supernote's keyword search finds own notes and shared pages
  alike."
- **Device test**: the keyword appears in the note's keyword list; keyword search finds it.
- Commit: `Add a keyword to new own notes for todos and meetings`

## 4. Test plan

Off-device, after every step: `npx tsc --noEmit` (0 errors), `npm test`,
`npm run test:scripts` (S3a and S7 change `docs/user/`).

On the device (demo space, Settings → Advanced → Profiles), after building the branch:

1. **S2**: create a 3-day meeting starting yesterday and one in the Inbox for this week. The Review
   hub's Week ahead count includes both, and on Fri-Sun it counts next week (the week the step
   opens on).
2. **S3a**: Quick Add a meeting titled `Plan [v2] #x` and create its note: the file is named
   `... Plan v2 x.note`. Gmail (if on): link an email whose subject contains `#`.
3. **S3b**: Create Project `A#B` → error naming `#`; `AB` works.
4. **S4**: force an error (e.g. edit a todo in a file that has been deleted outside gtdpara) on
   Inbox, Daily and Current - the error appears in the status line as before.
5. **S6**: the strip above a todo field (Copy/Paste) and above a date field (-1/Today/+1/+7)
   looks as before.
6. **S7**: create an own note for a todo and a meeting; the keyword is on page 1; keyword search
   finds it.
7. Release checklist (`RELEASING.md` §6).

## 5. Out of scope (stays on the backlog)

- 🔄 to Settings (D3), Inbox move code removal (see §1), ReviewScreen's error copies and the
  edit/arming hook, `errorMessage` everywhere, the one-time rename tool for existing `#` files
  (Obsidian part a, "Open").
