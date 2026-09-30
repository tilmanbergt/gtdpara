# gtdpara — developer notes

Everything here is for people working on the code. End-user documentation lives in
`docs/user/` (start page: `index.md`).

## Building

Prerequisites (Windows is the tested setup):

- Node.js 18 or newer, `npm install` in the repo root
- Android SDK + JDK as required by React Native 0.79 (Android Studio is the easiest way to get both)
- A Supernote with plugin support to test on

Build the plugin package:

```powershell
./buildPlugin.ps1
```

The script first stamps the build info (`scripts/gen-bundled-content.mjs --build`: version from
`package.json`, build number, git commit, changelog → `src/generated/`, not committed), then
bundles the JavaScript (`npx react-native bundle`), compiles the native Android modules
(`gradlew buildCustomApkDebug`), and packs everything into `build/outputs/gtdpara.snplg`, plus a
copy named after the build label, e.g. `gtdpara-0.1.0+dev.a1b2c3d.snplg`.

The build number (`versionCode`) is the number of minutes since 2026-01-01 UTC, so every build
counts as a new version for the Supernote host (see `technical-design-host-update-crash.md`). It
is written only into the packaged copy of `PluginConfig.json`; the root file isn't changed by
builds. Details: `technical-design-versioning-release.md`. `buildPlugin.sh` is not maintained.

Copy the `.snplg` to the device and install it over the existing plugin. Logcat shows the running
build right at startup: `App: gtdpara <label> build <number>`.

`npm install` also generates `src/generated/` (via `postinstall`); after pulling changes to
`CHANGELOG.md` you can refresh it with `npm run gen`.

Releases: see `RELEASING.md`.

## Checking your changes

- Type check: `npx tsc --noEmit`
- Release/versioning scripts: `npm run test:scripts`
- Tests: `npm test` (Jest). A useful smoke test mounts `<App />` with `react-test-renderer`.
  `tsc` alone cannot catch a broken default export of `App.tsx`, because `index.js` isn't type
  checked. See `design-overview.md` for the mocks this needs (`sn-plugin-lib`, AsyncStorage,
  Clipboard).
- Device logs: `adb logcat -c`, reproduce, then
  `adb logcat -d -s ReactNativeJS:V GtdParaFile:V` (JS logs carry the `[GtdPara]` prefix).

## Writing user docs

The pages in `docs/user/` are read on GitHub and shown in the plugin's help ("?" in the tab bar,
`ui/HelpOverlay.tsx`; design: `technical-design-in-app-help.md`). The build bundles them into
`src/generated/userDocs.ts`; the help's page list follows the groups and order of `index.md`, so a
new page must be linked there. The app renders them with the same renderer as "What's new"
(`domain/markdownBlocks.ts` → `ui/MarkdownBlocks.tsx`), which knows only a small subset, so the
pages stick to it:

- headings, paragraphs, `-` and `1.` lists with at most one nested level, `>` quotes
- `**bold**`, `` `code` ``, links to other pages in the folder (shown as plain text on the device)
- fenced code blocks (shown in monospace, long ones continue on the next page)
- no tables, images, HTML (not even `<name>` placeholders) or horizontal rules

Write labels exactly as the app shows them, and check a behaviour in the code before describing
it. `__tests__/docs/userDocs.test.ts` fails on anything outside the subset and on links to pages
that don't exist, so `npm test` catches most slips.

## Code tour

| Folder | What lives there |
|---|---|
| `src/domain/` | Pure TypeScript logic: parsing, dates, tags, rules. **No React Native or `sn-plugin-lib` imports**, so it stays testable with plain Node. |
| `src/storage/` | Reading/writing project files, cache, settings, integrations (I/O) |
| `src/supernote/` | Thin wrappers around `sn-plugin-lib` and the native modules |
| `src/screens/` | One component per tab/screen (Daily, Week, Month, Review, Settings, …) |
| `src/ui/` | Shared components (QuickAddWidget, PagedSection, MeetingRow, …) and styles |
| `src/utils/` | Logging, performance tracing, e-ink refresh helpers |
| `android/…/eu/embodyagile/gtdpara/` | Native modules: file access, Gmail IMAP, PDF, text measurement, runtime guard |

## Design documents

- `design-overview.md`: the living architecture document. **Start here.** §2 describes what is
  built, §4 what is still open, §5 the decisions made along the way.
- `design-philosophy.md`: why the app works the way it does (integrity, spaciousness, rest).
- `design-device-rendering.md`: real screen dimensions and space budgets for the A5 X.
- `technical-design-*.md`: one document per feature, each with requirements, design and an
  "as built" section. They record the history of decisions, including quotes from the chats in
  which they were made.
- `requirements-*.md`, `spike-*.md`: requirement notes and experiments.
- `public-release-guide.md`: the plan for publishing, versioning and releases.

Workflow used for this project: clarify requirements first, then write a technical design, then
implement. For bugs: pin down the exact failure, find the root cause, then fix.
