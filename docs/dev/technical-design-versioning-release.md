# Technical design: versioning, build info and release script

Status: **implemented 2026-09-30** (approved as drafted; as-built notes in §6). Implements Phase 3
of `public-release-guide.md`. Not yet run on the real machine/device.

## 1. Goal

- One place to set the version (`package.json`).
- Every build knows exactly what it is: version, build number, git commit, whether it was built
  from uncommitted changes, and the build date. Available inside the app (for the About page and
  debug info, Phase 5) and visible in bug reports.
- The changelog is bundled into the app so About can show "What's new".
- One command produces a release: version bump, changelog stamp, build, tag, GitHub release.
- Low maintenance: no CI, no extra services, works on Tilman's Windows machine with PowerShell +
  Node (v25 installed; the scripts only need Node ≥ 18).

## 2. Current state (checked 2026-09-30)

- `package.json` `"version": "0.0.1"`; root `PluginConfig.json` `versionName "0.0.1"`,
  `versionCode "15"`.
- `buildPlugin.ps1` flow: step 1 prepare `build/generated` → **step 2 bundle JS** → **step 3 bump
  `versionCode` in the root `PluginConfig.json`** → step 6 copy it to `build/generated` → steps 7–13
  native build → step 14 zip to `build/outputs/gtdpara.snplg`.
- The `versionCode` bump exists because the host only treats an install as a new version when the
  number changes (`technical-design-host-update-crash.md` §2.3). It must stay strictly increasing.
- The native `GtdParaRuntime` module already reports the host's `buildId` (`app_<ms>`) and the
  installed `versionCode` at runtime (`supernote/pluginRuntime.ts`). Useful for debug info later,
  but it can't provide the git commit or changelog.

Two problems with the current flow for this feature:

1. The JS bundle (step 2) is built **before** the `versionCode` bump (step 3), so anything baked
   into the bundle would carry the previous number.
2. The bump rewrites the tracked root `PluginConfig.json` on every build, so the working tree is
   always "dirty" after a build, and a release commit could never contain the build number of
   its own build.

## 3. Design

### 3.1 Sources of truth

| Fact | Source | Written by |
|---|---|---|
| Version (`0.1.0`) | `package.json` `version` | `release.ps1` (or by hand) |
| `versionName` in the package | copied from `package.json` at build time | build |
| `versionCode` / build number | computed at build time (3.2) | build |
| Commit, dirty flag, tag | `git` at build time | build |
| Release notes | `CHANGELOG.md` | you, per change; `release.ps1` stamps the heading |

The root `PluginConfig.json` is **no longer modified by builds**. It keeps `pluginID`, `pluginKey`,
name, permissions etc. Its `versionName` is kept equal to `package.json` by `release.ps1`; its
`versionCode` becomes a fixed placeholder (`"0"`), with the real value patched only into the copy
in `build/generated/`. Result: a build leaves the git working tree clean.

### 3.2 versionCode = minutes since 2026-01-01 UTC

`versionCode = floor((now − 2026-01-01T00:00Z) / 60 000)`, and at least `last + 1`, where `last`
is kept in `build/last-version-code` (untracked, `build/` is ignored).

- Strictly increasing with no state to lose: even after a fresh clone or a deleted `build/`, the
  clock keeps it above every earlier build.
- Today it is about 390 000, far above the current 15, so the first new build is a normal upgrade.
  It grows by about 525 000 per year, so it fits comfortably in a 32-bit int for millennia.
- Shown to users as "build 392417". It also tells you roughly *when* a build was made.
- Needs one device check: that the host accepts a jump from 15 to ~390 000 as an upgrade (it
  should; it only needs "different/larger").

(Alternative, not chosen: keep a counter in a tracked file, which brings back the dirty-tree
problem, or in an untracked file, which can go backwards after a fresh clone.)

### 3.3 `scripts/gen-bundled-content.mjs`

A single Node script, no dependencies. Modes:

- `node scripts/gen-bundled-content.mjs` (default, "dev"): writes `src/generated/*` with
  `versionCode: 0` and the current git info. Runs from `npm install` (`postinstall`) so a fresh
  clone type-checks, and can be run any time with `npm run gen`.
- `node scripts/gen-bundled-content.mjs --build`: additionally computes `versionCode` (3.2),
  updates `build/last-version-code`, and writes `build/build-info.json`.
- `node scripts/gen-bundled-content.mjs --patch-config <path>`: writes `versionName` and
  `versionCode` from `build/build-info.json` into the given `PluginConfig.json` copy (keeps its
  formatting, UTF-8 without BOM).
- `node scripts/gen-bundled-content.mjs --release-notes <version> <outfile>`: extracts that
  version's section from `CHANGELOG.md` (used for the GitHub release text).

Git info (every command fails soft to `"unknown"`, e.g. when built from a downloaded zip):

- `commit`: `git rev-parse --short=7 HEAD`
- `dirty`: `git status --porcelain` is non-empty (ignored files don't count, so `src/generated/`,
  `build/` and logs don't make it dirty)
- `tagged`: `git describe --tags --exact-match HEAD` equals `v<version>`

Display label, computed once in the script:

| Situation | `label` |
|---|---|
| Release build (tagged `v0.1.0`, clean) | `0.1.0` |
| Anything else | `0.1.0+dev.a1b2c3d` |
| … with uncommitted changes | `0.1.0+dev.a1b2c3d-dirty` |

So a bug report saying "0.1.0" means exactly the published package; anything with `+dev` is a
self-built or in-between build.

### 3.4 Generated files (`src/generated/`, gitignored)

`src/generated/buildInfo.ts`

```ts
// GENERATED by scripts/gen-bundled-content.mjs - do not edit.
export const BUILD_INFO = {
  version: '0.1.0',
  versionCode: 392417,          // 0 in dev mode (npm run gen)
  label: '0.1.0+dev.a1b2c3d',
  commit: 'a1b2c3d',
  dirty: false,
  release: false,               // tagged v<version> and clean
  builtAt: '2026-10-12T14:03:00Z',
} as const;
```

`src/generated/changelog.ts`

```ts
export interface ChangelogRelease { version: string; date: string | null; markdown: string }
export const CHANGELOG: ChangelogRelease[] = [
  {version: 'Unreleased', date: null, markdown: '### New\n- …'},   // only if non-empty
  {version: '0.1.0', date: '2026-10-12', markdown: '…'},
  // newest first, at most 5 released versions
];
```

Parsing rule: a release starts at a line `## [x.y.z] — YYYY-MM-DD` (also accepts `-` instead of
`—`) or `## [Unreleased]`; its markdown runs until the next `## ` line. The intro text above the
first `## ` is skipped. Unreleased is included in dev builds only (so a release build never shows
"Unreleased").

Consumers: none yet. The About page (Phase 5) imports `BUILD_INFO` and `CHANGELOG`. As a small
immediate benefit, `App.tsx` logs `BUILD_INFO.label` once at startup, so logcat shows what's running.

### 3.5 Changes to `buildPlugin.ps1`

Minimal and additive:

1. **New step 0** (before bundling): `node scripts/gen-bundled-content.mjs --build`. Abort the
   build if it fails. Print the label and versionCode.
2. **Step 3**: remove the in-place `versionCode` bump of the root `PluginConfig.json` (replaced by 3.2).
3. **After step 6** (copy to `build/generated`): `node scripts/gen-bundled-content.mjs --patch-config build\generated\PluginConfig.json`.
4. **After step 14**: also copy `build\outputs\gtdpara.snplg` to
   `build\outputs\gtdpara-<label>.snplg`, so older builds aren't overwritten and the file name
   says what it is. (Release: `gtdpara-0.1.0.snplg`.)
5. Warn (don't fail) if `package.json` `version` ≠ root `PluginConfig.json` `versionName`.

`buildPlugin.sh` stays unmaintained (already noted in `docs/dev/README.md`).

### 3.6 `scripts/release.ps1`

Usage: `./scripts/release.ps1 -Bump patch|minor|major` (or `-Version 0.1.0` for the very first
release); add `-DryRun` to only print what it would do. Steps; the script stops at the first failure and says how to undo what it did so far.

1. **Checks**: on `main`; working tree clean; `CHANGELOG.md` `[Unreleased]` section not empty;
   tag `v<new>` doesn't exist yet. `gh` installed and logged in (`gh auth status`); if not, it
   continues but skips step 8 and prints manual upload instructions.
2. **Version**: compute the new version from `package.json`; write it to `package.json` and to
   root `PluginConfig.json` `versionName`.
3. **Changelog**: rename `## [Unreleased]` → `## [x.y.z] — YYYY-MM-DD` and insert a fresh empty
   `## [Unreleased]` above it.
4. **Checks on the code**: `npx tsc --noEmit` and `npm test`. Because the codebase has known
   pre-existing tsc errors (`technical_debt.md` #7), failures are shown with their count and the
   script asks "Continue anyway? (y/N)" instead of stopping hard.
5. **Commit + tag**: `git commit -am "Release x.y.z"`, `git tag -a vx.y.z -m "gtdpara x.y.z"`.
6. **Build**: `./buildPlugin.ps1`. Now HEAD is the tagged release commit and the tree is clean,
   so the label is exactly `x.y.z`. The script verifies that `build/build-info.json` says
   `release: true`; otherwise it stops.
7. **Pause for the device test**: "Install build\outputs\gtdpara-x.y.z.snplg over the previous
   release and run the checklist (docs/dev/RELEASING.md). Publish? (y/N)". **No** leaves the local
   commit + tag in place and prints how to undo (`git tag -d vx.y.z; git reset --hard HEAD~1`).
8. **Publish**: `git push origin main --follow-tags`, then
   `gh release create vx.y.z build\outputs\gtdpara-x.y.z.snplg --title "gtdpara x.y.z" --notes-file <extracted notes>`.
   Prints the release URL.

Undo after publishing isn't automated (rare; done by hand on GitHub).

### 3.7 Supporting changes

- `.gitignore`: add `src/generated/`.
- `package.json`: `"version": "0.1.0"` is set by the first release, not now; add scripts
  `"gen": "node scripts/gen-bundled-content.mjs"` and `"postinstall": "node scripts/gen-bundled-content.mjs"`.
- Root `PluginConfig.json`: `versionCode` → `"0"` (placeholder, see 3.1).
- New `docs/dev/RELEASING.md`: the checklist from the guide §3.8, plus the one-time setup
  (`winget install GitHub.cli`, `gh auth login`).
- `docs/dev/README.md` "Building": mention `npm run gen` and the build label.

### 3.8 Order relative to the fresh start

Implement and try this on the current history first (dev builds get `+dev` labels). Then do the
fresh start (single commit), then run `release.ps1 -Version 0.1.0` for the first real release.

## 4. Test plan

- `gen-bundled-content.mjs`: a small Node test script (plain `node`, like the `domain/` checks)
  for changelog parsing (Unreleased empty/non-empty, em-dash vs hyphen, intro text, 5-release
  cap), label rules, versionCode monotonicity with a faked clock and `last` file, and
  `--patch-config` keeping the JSON formatting.
- Build once on the machine: `build/generated/PluginConfig.json` has the new numbers; root
  `PluginConfig.json` unchanged; `git status` clean after the build; logcat shows the label at startup.
- **Device**: install over the currently installed build (versionCode 15 → ~390 000) and check
  that the host treats it as an upgrade and settings survive.
- `release.ps1`: dry run on a throwaway branch with `-DryRun` (does everything up to step 7 except
  commit/tag, and prints the commands it would run).

## 5. Out of scope

- The About page, debug info, log export (Phase 5): they only consume what this produces.
- A settings schema version / migrations (guide §3.5): separate, small, can come with Phase 5.
- CI (GitHub Actions).

## 6. As built (2026-09-30)

Files:

- `scripts/lib/versioning.mjs`: pure helpers (bump, versionCode, label, changelog parse/select/stamp,
  JSON field edit, TS rendering). No I/O.
- `scripts/gen-bundled-content.mjs`: the CLI. Besides the modes in 3.3 it has four small helpers
  used by `release.ps1`, so all version/changelog logic lives in one tested Node module instead of
  PowerShell: `--next-version <bump>`, `--check-release <x.y.z>`, `--set-version <x.y.z>`,
  `--stamp-changelog <x.y.z> <date>`.
- `scripts/test-versioning.mjs`: plain-node checks (`npm run test:scripts`), 9 groups.
- `scripts/release.ps1`: as 3.6. ASCII-only (Windows PowerShell 5.1 reads BOM-less files as ANSI).
  Also runs `test-versioning.mjs`; Jest runs with `--passWithNoTests`.
- `buildPlugin.ps1`: step 1b (stamp), step 3 bump removed, step 6b (patch the packaged
  `PluginConfig.json`), labeled `.snplg` copy after step 14.
- `App.tsx`: logs `App: gtdpara <label> build <n> built <date>` once on mount.
- `package.json`: scripts `gen`, `postinstall`, `test:scripts`; the unused `ios` script removed.
- `PluginConfig.json`: `versionCode` "0" (placeholder). `.gitignore`: `src/generated/`.
- `docs/dev/RELEASING.md`, `docs/dev/README.md` (Building).
- `CHANGELOG.md`: Unreleased intro changed to "First public release." (it becomes the 0.1.0 text).

Details:

- `buildInfo.ts` is rewritten in dev mode only when something other than `builtAt` changed, so
  `npm run gen` doesn't cause needless file changes.
- The "dirty" check is `git status --porcelain`, so untracked, not-ignored files also count.
- The 0.1.0 section keeps the release's section text; `--release-notes` extracts exactly that.

Verified off-device: unit checks; an end-to-end run in a scratch git repo (dev generate → two
`--build` runs with increasing codes 392448 → 392449 → patch config → `git status` clean →
`release.ps1 -DryRun` changes nothing → real `release.ps1 -Version 0.1.0` with a fake build and a
local bare remote: commit, tag, `release: true` label `0.1.0`, push with tag, manual-publish
instructions without `gh` → second run stops on the empty Unreleased section); both `.ps1` files
parse without errors in PowerShell 7.4; the generated TS type-checks under `--strict`.

Still to verify on the real setup: a full `buildPlugin.ps1` run on Windows PowerShell 5.1, and on
the device that the jump from versionCode 15 to ~392 000 installs as an upgrade with settings kept.
