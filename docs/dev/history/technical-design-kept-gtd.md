# Technical design: rename gtdpara → Kept GTD (0.20.0)

Status: **design, for review**. Requirements decided 2026-10-18 (transition plan, project doc
`claude/feature-rename-kept-gtd.md`); retargeted to **0.20.0** after 0.19.0 shipped.
Branch: `feature/kept-gtd`. No feature changes in this release.

## 1. Requirements as decided

- **R1 Name** Kept GTD; "Kept" after the first mention in running text.
- **R2 Slogan** *Kept GTD – for those who write, where they write.*
- **R3 Refrain** (README, InkHub, About): your promises, kept · your todos, kept safe · your
  files, kept yours.
- **R4 Description** "GTD for the Supernote: todos, meetings and next actions, joined to the
  notes you write."
- **R5 Icons** (thick round strokes, black on transparent, 48 × 48 px like today): app = folder
  with a check; Engage = ring closing into a check; Mark for later = bookmark with a check.
  Drafts are in `docs/dev/history/kept-gtd-assets/` (SVG sources + PNGs).
- **R6 Wordmark** "Kept GTD" in Literata SemiBold (SIL OFL), as an image, **only on the About
  screen** (plus README and InkHub). The UI keeps the system font.
- **R7 Display rename only.** Everything that identifies the plugin to the host or is already
  written into users' files and storage stays (§3.1). Installing 0.20.0 over 0.19.x needs no
  migration of settings, marks, note links or note blocks.
- **R8 Folders** get the new name: `EXPORT/kept-gtd` (debug, profiles) and `Note/kept-gtd-demo`.
  Nothing is moved or deleted; saved profiles are **copied** once (§3.3).
- **R9 "Formerly gtdpara"** in README, InkHub description and About for a few releases.
- **R10 Repository** renamed to `tilmanbergt/kept-gtd` right after the release.

## 2. Current state (0.19.0)

- `PluginConfig.json`: `name` "GtdPara", old `desc`, `pluginID` `ndx27q77pojfqh6l`,
  `pluginKey` `gtdpara`.
- `app.json`: `name` and `displayName` "gtdpara". `index.js`: sidebar button `name: 'gtdpara'`;
  the lasso button "Capture Todo/Meeting" also uses `assets/icon.png`.
- `screens/settings/AboutTab.tsx`: title `gtdpara {version}`, `PROJECT_URL`
  `github.com/tilmanbergt/gtdpara`.
- Export root `EXPORT/gtdpara` (`supernote/fileSystem.ts`, `DEBUG_LOG_FOLDER_PATH`, profiles
  folder), log file `gtdpara-log.txt` (`utils/logSink.ts`), debug bundle `gtdpara-debug-…`
  (`storage/debugBundle.ts`), demo root `Note/gtdpara-demo` (`domain/demoSpace.ts`), close-out
  PDF "Created by gtdpara" (`domain/closeOut/archiveDocument.ts`).
- Help pages, README, PRIVACY, CONTRIBUTING, CLAUDE.md, DEVELOPMENT-POLICY (§3 "Everything
  gtdpara exports goes under `EXPORT/gtdpara/`"), RELEASING, inkhub-listing, release scripts.
- The full list comes from step S0's inventory (§6); this section names the known places.

## 3. Design

### 3.1 Keep (never renamed; pinned by a test)

| What | Where |
|---|---|
| `pluginID` `ndx27q77pojfqh6l`, `pluginKey` `gtdpara` | PluginConfig.json |
| `app.json` `name` `gtdpara` (= AppRegistry name = `pluginKey`) | app.json, index.js |
| AsyncStorage keys `gtdpara:settings:v1`, `gtdpara:profileSecrets:v1`, `gtdpara:captureDestinations:v1` and every other `gtdpara:` storage key | storage/ |
| userData markers `gtdpara:mark:`, `gtdpara:note-heading:v1`, `gtdpara:note-piece:`, `gtdpara:meeting-note-block:v1`, `gtdpara:meeting-note-link:v1` and any other `gtdpara:` marker written into notes | domain/ |
| Profile format id `gtdpara-profile` | domain/profiles.ts |
| Temp suffix `.gtdpara-tmp` of the atomic write | storage/ |
| Android package `eu.embodyagile.gtdpara`, native modules `GtdParaFile`, `GtdParaRuntime`, TS names like `GtdParaSettings` | android/, src/ |
| `docs/dev/history/*`, CHANGELOG entries before 0.20.0 | docs |

### 3.2 Change (user-visible)

| What | New |
|---|---|
| PluginConfig `name`, `desc` | "Kept GTD", R4 |
| app.json `displayName` | "Kept GTD" |
| Sidebar button name (index.js) | "Kept GTD" (fallback "Kept" if the label breaks badly on the device, §7) |
| `assets/icon.png`, `assets/engage.png`, `assets/mark.png` | R5 drafts |
| About: title, wordmark, slogan, "Formerly gtdpara", `PROJECT_URL` | wordmark image above `Kept GTD {version}`; slogan line; muted "Formerly gtdpara"; `github.com/tilmanbergt/kept-gtd` |
| Close-out PDF footer | "Created by Kept GTD" |
| Debug bundle file / header | `kept-gtd-debug-<stamp>.txt`, "Kept GTD debug bundle" |
| Log file | `kept-gtd-log.txt`, header names Kept GTD |
| Export root | `EXPORT/kept-gtd` (`debug/`, `profiles/`) |
| Demo root | `Note/kept-gtd-demo` |
| Any other UI text, status line or error that says "gtdpara" | "Kept GTD" / "Kept" |
| Release artefact | `kept-gtd-<version>.snplg`, release title "Kept GTD <version>" |
| Help pages, README, PRIVACY, CONTRIBUTING, CHANGELOG header, CLAUDE.md, living dev docs, inkhub-listing | new name; README and help name the new folders |
| `ui/KeptTab.tsx` | `ui/KeepAliveTab.tsx` (avoids a clash with the new name) |

### 3.3 Folders and the one-time profile copy

- **Debug** starts fresh in `EXPORT/kept-gtd/debug`. **Demo** is created fresh in
  `Note/kept-gtd-demo` the next time it is switched on.
- **Profiles** are the user's own data. On start, after settings load:
  - Rule (pure, `domain/profileCopy.ts`): `profilesToCopy(newNames, oldNames, demoName)` returns
    the old profile files to copy **only if the new folder has no profile file at all**; the demo
    profile is never copied (it is regenerated).
  - Storage (`storage/profiles.ts`): list both folders, copy each file (read + write, through the
    existing write path for profile files), never delete or change the old folder. Logged:
    `log('profiles: copied from old export folder', 'count=' + n)`; a failed copy is logged with
    `logError` and the remaining files are still tried.
  - Message (status slot, text in `domain/fileChangeText.ts`):
    "Copied 2 profiles from EXPORT/gtdpara - you can delete that folder." (singular "1 profile").
  - Runs at most once in effect: the second start finds files in the new folder and copies
    nothing. No flag in settings is needed.
- **Demo active while upgrading**: the demo profile still points at `Note/gtdpara-demo`. Not
  migrated; the Upgrade note says to switch to the own profile and back.
- The old folder path is kept as one constant (`LEGACY_EXPORT_ROOT = 'EXPORT/gtdpara'`), used
  only by the copy.

### 3.4 Assets

- PNGs 48 × 48, RGBA, pure black strokes 4.5 px with round caps/joins (SVG sources beside them).
- Wordmark `assets/wordmark.png` (611 × 152, transparent), shown on About at ~280 dp wide,
  `resizeMode="contain"`. README uses the same file; credit "Wordmark set in Literata, SIL Open
  Font License 1.1" in the README.

### 3.5 Guard against a later "finish the rename"

- `__tests__/keptGtdKeepList.test.ts` pins every §3.1 value that lives in code (storage keys,
  userData prefixes, profile format id, temp suffix, `pluginID`/`pluginKey`/app.json `name`).
- A visible-name check (in `scripts/code-health` or a Jest test): no string literal in `src/`
  contains "gtdpara" (case-insensitive) except an explicit allowlist (the §3.1 values,
  `LEGACY_EXPORT_ROOT`, "Formerly gtdpara", native module names).

## 4. Files

Changed: `PluginConfig.json`, `app.json`, `index.js`, `assets/*.png` (+ new `assets/wordmark.png`),
`screens/settings/AboutTab.tsx`, `domain/closeOut/archiveDocument.ts`, `storage/debugBundle.ts`,
`utils/logSink.ts`, `supernote/fileSystem.ts`, `domain/demoSpace.ts`, `storage/profiles.ts`,
`domain/fileChangeText.ts`, `ui/KeptTab.tsx` → `ui/KeepAliveTab.tsx` (+ imports), every other
S0 hit in the Change class, `scripts/release.ps1`, `buildPlugin.ps1`,
`scripts/gen-bundled-content.mjs`, docs listed in §3.2.
New: `domain/profileCopy.ts`, `__tests__/keptGtdKeepList.test.ts`, the profile-copy unit test,
scenario tests in `__tests__/scenarios/keptGtd.test.tsx`.

## 5. Test scenarios

- **K1 Profiles copied once.** Given `EXPORT/gtdpara/profiles` holds `Work.json`, `Home.json`
  and the demo profile, and `EXPORT/kept-gtd/profiles` doesn't exist. When Kept GTD starts.
  Then `Work.json` and `Home.json` are in `EXPORT/kept-gtd/profiles` with the same content, the
  demo profile is not, the old folder is unchanged, and the status slot says "Copied 2 profiles
  from EXPORT/gtdpara - you can delete that folder."
- **K2 Second start copies nothing.** Given K1 happened. When Kept GTD starts again. Then no
  file is written to the profiles folder and no copy message appears.
- **K3 New folder already used.** Given `EXPORT/kept-gtd/profiles` holds `Work.json` and the old
  folder holds `Home.json`. When Kept GTD starts. Then nothing is copied.
- **K4 Fresh install.** Given neither folder exists. When Kept GTD starts. Then nothing is copied
  and no message appears.
- **K5 Debug bundle.** When the user taps Export debug bundle on About. Then a file
  `EXPORT/kept-gtd/debug/kept-gtd-debug-<stamp>.txt` is written and the status slot names it.
- **K6 Demo space.** When the user switches the demo space on. Then its folders are created under
  `Note/kept-gtd-demo` and nothing is written under `Note/gtdpara-demo`.
- **K7 About.** When Settings → About opens. Then it shows "Kept GTD 0.20.0", the slogan,
  "Formerly gtdpara" and `github.com/tilmanbergt/kept-gtd`.
- **K8 Close-out PDF.** When a close-out PDF is built. Then its footer says "Created by Kept GTD".
- **K9 Existing data still read.** Given settings stored under `gtdpara:settings:v1` and a note
  page carrying a `gtdpara:mark:` element. When Kept GTD starts and the marks are listed. Then the
  settings are the stored ones and the mark is listed. (Unit level: the Keep-list test.)

## 6. Test plan

- `npm run check` green after every step; K1-K8 as scenario tests, K9 and the copy rule as unit
  tests; the visible-name check.
- **Device** (`./buildPlugin.ps1 -Stage beta`, installed **over 0.19.0**):
  1. One plugin, not two; sidebar shows "Kept GTD" and Engage with the new icons; lasso toolbar
     shows Capture and Mark for later with the new icons. Note how "Kept GTD" wraps.
  2. Settings, focus, Note setups and Engage's current todo are as before.
  3. An existing mark is still listed and can be closed; Engage on an existing meeting note finds
     its block; the reflection page of a 0.19.0 meeting still counts as the meeting's page.
  4. About: wordmark, "Kept GTD 0.20.0", slogan, "Formerly gtdpara". Export debug bundle → file in
     `EXPORT/kept-gtd/debug` with the new name. Debug logging on → `kept-gtd-log.txt`.
  5. Profiles copied once to `EXPORT/kept-gtd/profiles`, message shown; old folder untouched;
     restart → no message.
  6. Demo space on → `Note/kept-gtd-demo`; off → own data back.
  7. Close-out PDF says "Created by Kept GTD".
  8. Help pages show the new name and folders.

## 7. Open points

- **O1 Sidebar label.** If "Kept GTD" wraps badly or is cut, use "Kept" on the button only
  (PluginConfig and About keep the full name).
- **O2 Icons at real size.** If a stroke looks grey or thin on the A5 X, raise the stroke to 5 px
  or threshold the PNGs to pure black.
- **O3 Host caching.** If the host shows the old name/icon after the install-over, check whether
  it needs a restart; if it treats the build as a new plugin, stop and investigate before release.
