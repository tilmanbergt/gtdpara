# Technical design: About page, debug tools, Experimental switches

> **Paths changed 2026-09-30:** all debug output now goes to `EXPORT/gtdpara/debug` instead of
> `Note/_gtdpara_debug_log` (Tilman: exports must not fill the Note folder) - see
> `technical-design-profiles-demo-space.md`. The paths below are the original ones.

Status: **implemented 2026-09-30** (approved with P1-P3; P3 refined, see §3.6). Not yet device-tested (checklist: `device-test-0.1.0.md`). Implements Phases 5.1–5.3 of `public-release-guide.md`
(steps 3 and 4 of the launch sequence). Builds on `technical-design-versioning-release.md`.

## 1. Requirements (decided in chat, 2026-09-30)

1. **Settings gets two new tabs: About and Advanced.** Folders becomes folders only.
   - About: version/build, what's new (bundled changelog), debug tools.
   - Advanced: Experimental switches, plus the tools that today sit at the bottom of Folders
     (Integrity Check, Performance tracing, Keep tabs in memory).
2. **Logs**: an in-memory buffer of the last ~1000 log lines, always on. A **Debug logging**
   switch (default off) additionally appends every line to a rotating file (~1 MB), so logs survive
   a crash.
3. **Privacy**: debug info contains counts and yes/no facts, never names. The Gmail app password,
   the ICS link and email addresses are removed from everything exported. Log lines keep file paths
   (needed for debugging); the export screen says to look before sharing.
4. **Delivery**: one **Export debug bundle** button writes a single `.txt` (debug info + recent
   log) to `Note/_gtdpara_debug_log/`; the user copies it off the device and attaches it to the issue.
5. **Experimental = the whole Google Calendar integration and the whole Gmail integration**
   (they depend on external services and are not performance-optimized). Everything else is
   treated as normal beta functionality.

### Proposals for the points left open (veto any of them)

- P1 **Keep tabs in memory** stays a normal switch (default ON), moved to Advanced.
- P2 **Upgrade**: an existing install that already has a Calendar ICS link / Gmail address
  configured gets the matching switch **ON** after the update; everyone else starts with both OFF.
  So nothing disappears for you, and new users see a lean app.
- P3 **What's new notice**: after a *release* version is opened for the first time, one quiet
  `info` line in the status slot: "Updated to 0.2.0" with a **What's new** button (opens About) and
  ✕. No popup, never for dev builds, never on a fresh install.

## 2. Current state (checked)

- `screens/Settings.tsx` (116 KB): `SettingsTab = 'folders' | 'focus' | 'calendar' | 'gmail' | 'templates'`,
  static `SETTINGS_TABS`; the three tools are rendered at the end of the Folders tab
  (`handleRunIntegrityCheck`, `handleTogglePerfTracing`, `handleToggleKeepTabsAlive`).
- Google Calendar entry points: Daily (`DayMeetingsPanel` tabs Today | Tomorrow | Google),
  Month (`LEFT_TABS` Month | Google, plus a Google tab in the day panel), `WeekPlanner` (Week tab
  and Review's Week-ahead step), Settings → Calendar.
- Gmail entry points: Review step `gmailInbox` (`domain/reviewSteps.ts` `REVIEW_STEPS`, used by
  ReviewHub, ReviewScreen, next/previous step and the overdue check), Settings → Gmail.
- `utils/log.ts`: `log`/`logError` → `console` only (logcat).
- Debug files: `supernote/fileSystem.ts` `DEBUG_LOG_FOLDER = /storage/emulated/0/Note/_gtdpara_debug_log`
  (perf traces in `perf/`, integrity reports). Native `GtdParaFile` can write/overwrite a text file
  but **cannot append**.
- Native `GtdParaRuntime.getRuntimeDiagnostics()` gives host build id, versionCode, process age,
  stale builds.
- `storage/perfStats.ts` `collectPerfStats()` already produces the data counts (projects, areas by
  status, tasks, meetings, …) from the cache, without I/O.
- `generated/buildInfo.ts` + `generated/changelog.ts` exist since the versioning work.

## 3. Design

### 3.1 Settings (`domain/settings.ts`)

New fields in `GtdParaSettings`:

| Field | Default | Meaning |
|---|---|---|
| `experimentalGoogleCalendar` | `false` | Google Calendar integration visible |
| `experimentalGmail` | `false` | Gmail integration visible |
| `debugLogging` | `false` | also write log lines to a file |
| `lastSeenVersion` | `''` | last release version the user has opened (P3) |

Migration `migrateExperimentalFlags(merged, parsedRaw)` (pure, in `domain/`), run in
`storage/settingsStorage.ts` `readSettings` next to the existing two migrations, same
"same object = no-op, write back once" contract:

- raw blob exists but has no `experimentalGoogleCalendar` key → set it to
  `googleCalendarIcsUrl.trim() !== ''`; same for Gmail with `gmailEmail` (P2).
- raw blob exists but has no `lastSeenVersion` key → leave `''` (so an existing install gets the
  notice once, P3). No raw blob at all (fresh install) → `lastSeenVersion = BUILD_INFO.version`
  is set by App on first start (3.6), so no notice.

A small pure helper `features(settings)` returns `{googleCalendar: boolean, gmail: boolean}` so
screens don't read the raw flags directly.

### 3.2 Experimental gating

Switching a flag off **hides entry points only**; it never deletes settings (ICS link, Gmail
credentials, handled-email cache stay stored, so switching back on restores everything).

| Place | When `googleCalendar` off | When `gmail` off |
|---|---|---|
| Settings tabs | no **Calendar** tab | no **Gmail** tab |
| Daily | day panel tabs Today \| Tomorrow (no Google) | – |
| Month | left tabs: no Google; day panel: no Google tab | – |
| Week / Review Week-ahead (`WeekPlanner`) | no Google toggle/tab | – |
| Review | – | step `gmailInbox` not listed, not counted, skipped by next/previous, ignored by the overdue check |

Implementation notes:

- The tab lists become small functions of `features` (e.g. `calendarTabsFor(features)`), kept
  next to the existing constants. If the active tab disappears (flag switched off while it was
  selected), the screen falls back to its first tab.
- Review: `domain/reviewSteps.ts` gets `activeReviewSteps(features)`; `nextStepId`,
  `previousStepId`, `isReviewOverdue` and the hub list take the active list instead of
  `REVIEW_STEPS`. Stored per-step records for a hidden step are kept untouched.
- Screens already load settings; they pass `features(settings)` down. No new global store.

### 3.3 Log buffer and file (`utils/log.ts`, `utils/logSink.ts`)

- Every `log`/`logError` call (and a new `logWarn`) also pushes one formatted line into an
  in-memory ring buffer: `HH:MM:SS.mmm E|W|I message`. Arguments are stringified cheaply: strings
  as-is, `Error` → message, other values → `JSON.stringify` capped at 300 chars. Cap: 1000 lines.
  Still calls `console` as today.
- `utils/logSink.ts` (new) owns the buffer and the optional file sink:
  - `getRecentLogLines()`, `getRecentErrors(n)`.
  - `setFileLogging(on)`: when on, lines are queued and flushed every 5 s (or at 200 lines) with a
    new native **`appendTextFile`** into `_gtdpara_debug_log/gtdpara-log.txt`. At > 1 MB the file is
    moved to `gtdpara-log.1.txt` (overwriting the old `.1`) and a new file started. The very first
    flush writes a header line with `BUILD_INFO.label`.
  - Writing uses the raw native module like `recordDebugLogEntry`, never `log()` (no recursion);
    a failed flush disables the sink for the session and records one line in the buffer.
- `utils/log.ts` must stay import-light (perf.ts depends on it). The file sink is injected at
  startup by `App.tsx` (same pattern as `perfConfigure`), so `log.ts` doesn't import `fileSystem.ts`.

Native (`GtdParaFileModule.kt`): `appendTextFile(path, content)` (creates the file if missing,
UTF-8, `FileOutputStream(file, true)`), plus `fileSize(path)` for rotation. Needs a native rebuild
(the normal build does that).

### 3.4 Debug info and export (`storage/debugBundle.ts`, `domain/redact.ts`)

`buildDebugInfo()` returns plain text lines:

```
gtdpara 0.2.0 (build 392417) commit a1b2c3d  built 2026-11-02T10:12:00Z  release
sn-plugin-lib 0.1.19 · device A5 X · Android 8.1.0 · display <Build.DISPLAY>
host build app_1790… · process age 12 min · stale builds 0
time 2026-11-03 09:14 (UTC+01:00) · launched from .note
settings: folders default · focus 3/2 3/2 2/1 · calendar configured, ON · gmail not configured, OFF
          keepTabs ON · perfTracing OFF · debugLogging ON · tagRules 7 · focusMode OFF
data: projects 8 (active 6, onHold 1, done 1) · areas 8 · tasks 412 (open 87) · meetings 230 (recurring 12) · inbox 5
recent errors (last 10):
  09:13:58.201 E reorient failed: …
```

Sources: `BUILD_INFO` (+ new `snPluginLib` field from the generator), `getRuntimeDiagnostics()`
extended with `model`, `display` (`Build.DISPLAY`, usually the firmware string), `androidRelease`,
settings summary (folders only "default"/"custom", never the names), `collectPerfStats()` counts,
inbox count, last errors from the buffer, launch file **extension** only.

`domain/redact.ts` (pure, unit-tested) is applied to the whole bundle: replaces the configured
Gmail password and Gmail address literally, any e-mail address (regex) → `[email]`, any
`https?://…ical…`/`.ics` URL and the configured ICS link → `[ics-url]`.

**Export debug bundle** (About) writes
`_gtdpara_debug_log/gtdpara-debug-<YYYYMMDD-HHMMSS>.txt` = debug info + a separator + the
redacted recent log (buffer), and shows the path in the status slot:
"Saved Note/_gtdpara_debug_log/gtdpara-debug-….txt – check it before sharing."

### 3.5 About tab (`screens/settings/AboutTab.tsx`)

Two columns like the other Settings tabs:

- **Left** – a card: `gtdpara 0.2.0` (large), `build 392417 · 2026-11-02`, `commit a1b2c3d`
  (plus "development build" / "uncommitted changes" when not a release); device line;
  `github.com/tilmanbergt/gtdpara` as plain text. Below: **Debug logging** switch (with one line
  of explanation and the log file path), **Export debug bundle** button + the privacy hint.
- **Right** – **What's new**: a list of the bundled releases (version + date; "Unreleased" on dev
  builds) and the selected release's notes rendered with a small markdown renderer
  (`ui/MarkdownBlocks.tsx`: `###` headings, `-` bullets incl. one nesting level, paragraphs,
  `**bold**`, `` `code` ``). Paged with the existing `PagedSection` (one row per block, height from
  `textLineEstimator`) – no scrolling. The same renderer is reused by the in-app Help later.

Settings.tsx itself only gains the two tab entries and renders `<AboutTab/>` / `<AdvancedTab/>`;
the new UI lives in `screens/settings/` to stop Settings.tsx from growing further. The global
Save/Reset footer is hidden on both tabs (their switches save immediately, like Keep tabs does today).

### 3.6 Advanced tab (`screens/settings/AdvancedTab.tsx`) and What's-new notice

- **Experimental**: two switches, each with one explanatory line:
  "Google Calendar (experimental) – shows your calendar via its private ICS link in Daily, Week,
  Month and Review. Depends on Google; may be slow or break." / same for Gmail. Turning one on
  immediately shows its Settings tab, so configuration is one tap away.
- **Tools**: Integrity Check, Performance tracing, Keep tabs in memory – moved unchanged from
  Folders (same handlers, moved into this component).
- **What's new notice (P3)**: in `App.tsx` after settings load: if `lastSeenVersion === ''` and
  this is a fresh install → store `BUILD_INFO.version` silently. If `BUILD_INFO.release` and
  `lastSeenVersion !== BUILD_INFO.version` → publish a global `info` status "Updated to x.y.z" with
  **What's new** (opens Settings → About) and ✕; both store `lastSeenVersion`.

### 3.7 Files

New: `domain/redact.ts`, `domain/features.ts` (flags helper + migration), `utils/logSink.ts`,
`storage/debugBundle.ts`, `ui/MarkdownBlocks.tsx`, `screens/settings/AboutTab.tsx`,
`screens/settings/AdvancedTab.tsx`.
Changed: `domain/settings.ts`, `storage/settingsStorage.ts`, `domain/reviewSteps.ts`,
`ui/ReviewHub.tsx`, `screens/ReviewScreen.tsx`, `screens/DailyView.tsx`, `screens/MonthView.tsx`,
`screens/WeekPlanner.tsx`, `screens/Settings.tsx`, `utils/log.ts`, `App.tsx`,
`supernote/pluginRuntime.ts`, `GtdParaFileModule.kt`, `GtdParaRuntimeModule.kt`,
`scripts/lib/versioning.mjs` (+ `snPluginLib`), `CHANGELOG.md`, `docs/dev/design-overview.md`.

## 4. Implementation order

1. Pure parts + tests: `redact.ts`, `features.ts` (flags + migration), `activeReviewSteps`,
   markdown block parser (the parser half of `MarkdownBlocks`).
2. Log buffer + sink + native `appendTextFile`/`fileSize` + runtime device fields.
3. Experimental gating in Settings / Daily / Month / WeekPlanner / Review.
4. Advanced tab (move tools, switches).
5. About tab (version card, export bundle, debug switch, What's new) + What's-new notice.
6. `tsc` (no new errors vs. baseline), Jest smoke render of `<App/>`, commit + md5 verify.

## 5. Step 4: device test pass (after implementing)

A checklist file `docs/dev/history/device-test-0.1.0.md` covering: install over the current build;
both switches ON/OFF (entry points appear/disappear, credentials kept); Review step count and
next/previous with Gmail off; About shows correct label/build; What's new pages through; Debug
logging creates and rotates the file; Export debug bundle file contents (no password/ICS/email);
the notice appears once after a release update; plus a short smoke of the main tabs.

## 6. Out of scope

In-app Help viewer (reuses `MarkdownBlocks` later), user docs, settings schema versioning beyond
the key-presence migrations used here.

## 7. As built (2026-09-30)

New files: `domain/features.ts` (Features, `featuresOf`, `migrateExperimentalFlags`,
`shouldShowWhatsNew`), `domain/redact.ts`, `domain/markdownBlocks.ts`, `ui/featureStore.ts`
(`useFeatures`/`setFeatures` + `visibleTabs` helper), `ui/MarkdownBlocks.tsx` (renderer + `MarkdownPager`),
`utils/logSink.ts`, `storage/debugBundle.ts`, `screens/settings/AboutTab.tsx`,
`screens/settings/AdvancedTab.tsx`, and Jest tests in `__tests__/domain/*` and `__tests__/utils/logSink.test.ts`.

Deviations from §3:

- **Feature store instead of passing settings down** (§3.2 said "screens pass `features(settings)` down"):
  kept-alive tabs hold their own settings copy and would not see a switch change until they reload,
  so the flags live in `ui/featureStore.ts` (same pattern as `keepAliveStore.ts`). App sets them after
  loading settings, Settings → Advanced on every tap; screens call `useFeatures()`.
- **Google tab gating** also covers two places §3.2 missed: the Meetings | Google tabs in the
  **Inbox** tab and a Project/Area's **Current** tab (`InboxScreen`, `ProjectDataPanel`).
  `DayMeetingsPanel.googlePanel` is now nullable; null drops the Google tab.
- **Native**: one method `appendTextFile(path, content, maxBytes)` that rotates itself
  (`gtdpara-log.txt` → `gtdpara-log.1.txt`) instead of a separate `fileSize`.
  `getRuntimeDiagnostics` additionally returns `manufacturer`.
- `BUILD_INFO.snPluginLib` added by the build-info generator (installed `sn-plugin-lib` version).
- New `settingsStorage.patchSettings(patch)` for immediate single-field saves (shares the write chain
  with `updateReviewSteps`). Settings' global Save keeps the stored `lastSeenVersion`.
- `log.ts` gained `logWarn`. Debug-bundle "data" line is the JSON of `collectPerfStats()` (counts only).
- Review: `activeReviewSteps(features)`; `nextReviewStepId`, `prevReviewStepId`, `applyEmptyStamps`,
  `oldestRelevantReview`, `isReviewOverdue` take the active list (default: all steps). A kept-alive
  Review standing on the Gmail step goes back to the overview when Gmail is switched off.

Verified off-device: `tsc --noEmit` over the whole project (no new errors; the 3 known ones remain),
25 Jest tests (features/migration, redaction, markdown parsing, review step walking, log buffer and
file sink), and a Jest smoke render of `<App/>`, `<Settings initialTab="about"/>`, AboutTab and
AdvancedTab. The Kotlin changes could not be compiled here; they are built by the normal
`buildPlugin.ps1` run.
