# gtdpara — Public Release Guide

> **Historical.** The plan for the first public release (0.1.0, published 2026-09-30), kept as a
> record. The current release process is `RELEASING.md`.

Status: plan / design guide (2026-09-30). Goal: publish gtdpara as a community project on
<https://github.com/tilmanbergt/gtdpara>, with downloadable releases, good user documentation,
a clear update path, and in-app About / Help / Debug support — at a level that is *easy for one
person to maintain*, not a professional product.

---

## 0. Decisions so far

| Topic | Decision |
|---|---|
| License | MIT |
| Git history | **Fresh start** (scan 2026-09-30: gitleaks clean, only 5 commits) — one initial commit `gtdpara 0.1.0` |
| Commit email | GitHub noreply address (repo-local `git config user.email`) |
| Dev docs content | Published as-is (quotes and decision history stay) |
| Versioning | SemVer `0.x`, stable releases only, no beta channel |
| Build | Local script + checklist (extend `buildPlugin.ps1`), upload with `gh release create` |
| User docs | `README.md` + `docs/user/*.md` in the repo, English only |
| Internal design docs | Move to `docs/dev/` and publish as developer notes |
| Contributions | Issues and ideas welcome; PRs only after agreeing in an issue first |
| Bug reporting | GitHub issue form + "Copy debug info" + "Export log" + debug-logging toggle |
| About page | Version + build info, What's new (changelog), debug tools |
| In-app Help | New: show README + feature help pages inline on the device |
| Untested features | Ship, but label **Experimental** (docs + optional Settings switch, off by default) |
| Screenshots | 5–8 key screens, made with a demo data set |

Guiding principles for everything below:

1. **One source of truth per fact.** Version lives in one file; changelog lives in one file;
   help text lives in one set of markdown files that feed both GitHub and the device.
2. **Automate the boring, error-prone parts** (version sync, build info, bundling docs), keep the
   rest a short manual checklist.
3. **Every bug report should arrive with version, device, firmware and a log** — without the
   user needing to understand anything technical.
4. **Nothing personal or secret ever leaves the device or the repo by accident.**

---

## Phase 1 — Repo safety & cleanup (before anything becomes public)

### 1.1 Freeze a private backup
- Push the current state (all branches, all tags) to a **private** repo, e.g. `gtdpara-private`,
  or keep a local bare clone: `git clone --mirror . ../gtdpara-archive.git`.
- This keeps the full history (with the ~60 design iterations and debug logs) for you, whatever
  happens to the public repo.

### 1.2 Scan for secrets and personal data (decides the history question)
Run on the full history, not just the working tree:

```powershell
# option A: gitleaks (single exe)
gitleaks detect --source . --log-opts="--all" --report-path gitleaks-report.json
# option B: list every file that ever existed, to eyeball
git log --all --pretty=format: --name-only | sort -u
```

Check specifically for:
- log files that may have been committed before `.gitignore` covered them:
  `crash-log.txt`, `newlog.txt`, `gtdpara_*log*.txt` (up to 13 MB — they likely contain real
  note titles, project names, email subjects), `perf-*/`, `Claude outputs/`
- Google Calendar **ICS secret URLs** or Gmail **app passwords** in test fixtures, docs or logs
- personal names, email addresses, project/area names in design docs and test data
- `App-1.tsx` and other stray copies
- `local.properties`, keystores, signing configs

Decision rule:
- **Scan clean (or only trivially fixable)** → keep history, fix forward.
- **Anything sensitive in past commits** → **fresh start**: new orphan branch with the cleaned
  tree, one commit "gtdpara 0.1.0 — initial public release", force-push as `main` to the public
  repo. (Rewriting history with `git filter-repo` is possible but more work and easy to get
  wrong; a fresh start is simpler and the private archive keeps the old history.)

**Result (2026-09-30):** gitleaks 8.30.1 over all 5 commits → no leaks. Text search → only the
`appPassword` parameter names in `GmailImapModule.kt` and ordinary prose; the author email is the only
personal data in metadata. None of the large repro/crash logs, `perf-*/` or `Claude outputs/` were
ever committed. Stray committed files: `App-1.tsx`, `src/supernote/fileSystem-1.ts`,
`gtdpara_log.txt`, `ios/`. `android/app/debug.keystore` is RN's public debug key (harmless).
→ Decision: **fresh start**.

### 1.2b Fresh-start procedure
```powershell
# 1. backup of the full old history (outside the repo)
git clone --mirror . ..\gtdpara-archive.git

# 2. public identity for this repo only (address from GitHub → Settings → Emails)
git config user.email "<id>+tilmanbergt@users.noreply.github.com"
git config user.name  "Tilman Bergt"

# 3. do the cleanup of 1.3 / 1.4 on the current branch (normal commits are fine, they get discarded)

# 4. new history with a single commit
git checkout --orphan release-root
git add -A
git commit -m "gtdpara 0.1.0 - initial public release"
git branch -D main 2>$null            # old local main, if any
git branch -m release-root main
git tag v0.1.0                         # only once the release build is done (Phase 3)

# 5. remote: see note below, then
git push -u origin main --force
```
Note on the remote: if the old commits were already pushed to `github.com/tilmanbergt/gtdpara`,
delete the old remote branches too (`git push origin --delete keep-tabs-alive …`) — or, simpler
and cleaner while the repo is still private, delete the GitHub repo and recreate it empty, then
push. Local feature branches from before the fresh start cannot be merged into the new `main`
(no shared history); finish or abandon them first.

### 1.3 Clean the working tree
- Delete from the repo: `App-1.tsx`, root-level log files, `perf-*/`, `Claude outputs/`,
  `build/` output, the unused `ios/` folder (gtdpara only targets Supernote/Android), and
  whichever of `buildPlugin.sh` / `buildPlugin.ps1` you don't maintain (or mark `.sh` as
  unmaintained).
- Replace the React-Native boilerplate `README.md` (see Phase 4).
- Extend `.gitignore`: `*.snplg` (releases go to GitHub Releases, not into git),
  `src/generated/` if you choose to generate files at build time (see 3.3),
  `gitleaks-report.json`.
- Move `docs/dev/technical-design-*.md`, `docs/dev/design-*.md`, `docs/dev/spike-*.md`,
  `docs/dev/requirements-*.md` → `docs/dev/`. Fix relative links between them.
- `docs/dev/` is published as-is (decided 2026-09-30).
- Delete `gitleaks-report.json` (or add it to `.gitignore`).

### 1.4 Add the basic public files
- `LICENSE` (MIT, "Copyright (c) 2026 Tilman Bergt")
- `CHANGELOG.md` (see 3.4)
- `CONTRIBUTING.md` (see 6.3)
- `.github/ISSUE_TEMPLATE/*` (see 6.1)
- `PRIVACY.md` or a README section: what the plugin reads/writes, what network access it uses
  (only ICS fetch + Gmail IMAP, only when configured), that no telemetry exists.

---

## Phase 2 — Target repository layout

```
gtdpara/
├─ README.md                  landing page: what, why (philosophy), install, screenshots, links
├─ CHANGELOG.md               single source of release notes (also bundled into the app)
├─ LICENSE                    MIT
├─ CONTRIBUTING.md            "open an issue first", how to build, how to report bugs
├─ PRIVACY.md                 data/network statement
├─ PluginConfig.json          versionName/versionCode written by the release script
├─ package.json               "version" = THE source of truth
├─ docs/
│  ├─ user/                   end-user docs (also shown in the in-app Help)
│  │  ├─ index.md             table of contents
│  │  ├─ getting-started.md
│  │  ├─ philosophy.md
│  │  ├─ folders-and-files.md   PARA folders, project.md/area.md format
│  │  ├─ daily.md  week.md  month.md
│  │  ├─ projects-and-areas.md  status, scope, abbreviations, assignment
│  │  ├─ quick-add.md           todos, meetings, notes, tags, refile, quick-file
│  │  ├─ tags.md                #next/#waiting/…, context tags, #now/focus
│  │  ├─ meetings.md            recurring meetings, prep/review tracking, shared note pages
│  │  ├─ note-templates.md      Tag Rules, pieces, backgrounds
│  │  ├─ review.md              review hub, steps, Gmail, calendar
│  │  ├─ integrations.md        Google Calendar (ICS), Gmail (IMAP app password)
│  │  ├─ settings.md
│  │  ├─ experimental.md        list + status of experimental features
│  │  ├─ troubleshooting.md     known issues, how to report a bug, debug info, logs
│  │  └─ images/                screenshots (GitHub only, not bundled)
│  └─ dev/                    architecture + all technical designs (moved from docs/)
│     ├─ README.md            how to navigate the dev docs; build instructions
│     ├─ design-overview.md
│     └─ technical-design-*.md
├─ scripts/
│  ├─ release.ps1             version bump → generate → build → tag → GitHub release
│  └─ gen-bundled-content.mjs builds src/generated/* from package.json, CHANGELOG, docs/user
├─ src/ …                     unchanged
└─ .github/
   ├─ ISSUE_TEMPLATE/bug_report.yml
   ├─ ISSUE_TEMPLATE/feature_request.yml
   ├─ ISSUE_TEMPLATE/config.yml
   └─ pull_request_template.md
```

---

## Phase 3 — Versioning, update path and release mechanics

### 3.1 Version rules (SemVer 0.x)
- Start public at **0.1.0**.
- `0.MINOR.0` — new features or behavior changes; also any change to file formats or settings
  that needs a migration.
- `0.MINOR.PATCH` — bug fixes only.
- `1.0.0` later, when you consider the file format and core workflow stable.
- **Never change** `pluginID` (`ndx27q77pojfqh6l`) or `pluginKey` (`gtdpara`) — otherwise
  users get a second plugin next to the old one and lose their settings.

### 3.2 Single source of truth
- `package.json` → `"version": "0.1.0"` is the only place you edit.
- The release script writes `versionName` = `"0.1.0"` into `PluginConfig.json`.
- `versionCode` stays a **build counter**: `buildPlugin.ps1` already increments it on every build,
  because the host only treats an install as a new version when it changes
  (`technical-design-host-update-crash.md`). So it is not derived from the version; it's shown
  as "build N" in About and bug reports. (Corrected 2026-09-30 — an earlier draft derived it
  from MAJOR/MINOR/PATCH, which would break dev builds between releases.)
- **Verify once on the device** that installing a higher `versionCode` over an existing
  installation keeps the plugin's settings (AsyncStorage). Document the result in
  `docs/user/getting-started.md` ("Updating").

### 3.3 Build info bundled into the app
`scripts/gen-bundled-content.mjs` runs before every build (called from `buildPlugin.ps1`) and
writes `src/generated/buildInfo.ts`:

```ts
export const BUILD_INFO = {
  version: '0.1.0',
  versionCode: 42,              // build counter from PluginConfig.json
  commit: 'a1b2c3d',        // git rev-parse --short HEAD
  dirty: false,             // uncommitted changes at build time → shows "-dirty"
  buildDate: '2026-10-12',
} as const;
```

A `-dirty` or non-tagged build immediately tells you (in a bug report) that someone runs a
self-built or dev version. Decide whether `src/generated/` is committed (simpler for people who
clone and build) or gitignored (cleaner diffs) — recommendation: **commit it**, the script
simply overwrites it.

### 3.4 CHANGELOG.md format
Use "Keep a Changelog" style, written for users, not developers:

```markdown
# Changelog

## [Unreleased]

## [0.2.0] — 2026-11-02
### New
- Month tab: handpicked meeting highlights and monthly goals.
### Changed
- Daily view groups tasks by project.
### Fixed
- Archiving an email in Review now really removes it from the Gmail inbox.
### Experimental
- Shared note pages for recurring meetings (enable in Settings → Experimental).
### Upgrade notes
- Settings are migrated automatically. No changes to your project files.
```

Rules:
- Add a line under `[Unreleased]` **in the same commit** as the change (habit, not a chore at
  release time).
- Every release that touches the on-device file format (`project.md`, `area.md`, Inbox) or
  settings gets an **Upgrade notes** section — this is the "clear update path".
- The same file is bundled into the app for the About page (3.3 script parses it into
  `src/generated/changelog.ts`, keeping the last ~5 releases).

### 3.5 Data and settings compatibility
Part of a trustworthy update path:
- Add `settingsSchemaVersion` to the stored settings and a small `migrateSettings(from, to)`
  step on startup (pure function in `domain/`, unit-testable).
- State the promise in the docs: *"Your project/area files stay plain markdown. gtdpara never
  rewrites them in a way that loses information; format changes are listed under Upgrade notes."*
- Before any format-changing release: test the upgrade path from the previous release on real
  data (copy of your own folders).

### 3.6 Branching
Solo-friendly and simple:
- `main` = always releasable; each release is a tag `v0.1.0` on `main`.
- Work happens on short-lived branches (`feature/…`, `fix/…`) merged into `main`.
- Hotfix for an old release: not supported — fixes go into the next patch release on `main`.

### 3.7 Release script (`scripts/release.ps1`)
One command: `./scripts/release.ps1 -Bump minor` (or `patch`). Steps:

1. Abort if working tree is dirty or not on `main`.
2. Bump `package.json` version; compute versionCode; write `PluginConfig.json`.
3. In `CHANGELOG.md`, rename `[Unreleased]` → `[x.y.z] — date`, insert a fresh `[Unreleased]`.
   Abort if the Unreleased section is empty.
4. Run `gen-bundled-content.mjs` (build info, changelog, help docs).
5. Run the type-check (`npx tsc --noEmit`) and the Jest smoke test (App renders).
6. Run `buildPlugin.ps1` → `gtdpara-x.y.z.snplg`.
7. `git commit -am "Release x.y.z"`, `git tag vx.y.z`, `git push --follow-tags`.
8. `gh release create vx.y.z gtdpara-x.y.z.snplg --title "gtdpara x.y.z" --notes <section of CHANGELOG>`.

### 3.8 Manual release checklist (keep in `docs/dev/RELEASING.md`)
- [ ] Install the built `.snplg` on the device **over the previous release** (not a clean
      install) — settings kept? data intact?
- [ ] Smoke test: Daily, Week, Month, Current project, QuickAdd add/edit, Review hub opens
- [ ] About page shows the new version, no `-dirty`
- [ ] Changelog reads well for a non-developer
- [ ] Run the release script
- [ ] Post/update: InkHub listing, Reddit thread (short "what's new" + link)

### 3.9 Release assets and InkHub
- Each GitHub release contains: `gtdpara-x.y.z.snplg` + the changelog section. Nothing else.
- The README's "Install" section links to **Latest release**
  (`https://github.com/tilmanbergt/gtdpara/releases/latest`), so the link never changes.
- InkHub (plugins currently only via beta — check the r/Supernote_beta thread for the current
  submission process): prepare a reusable listing text in `docs/dev/inkhub-listing.md`
  (title, 2–3 sentence description, category, "Full docs & issues: github.com/tilmanbergt/gtdpara").
  Upload the same `.snplg` as on GitHub, so both channels always carry identical builds.

---

## Phase 4 — Documentation

### 4.1 README.md (landing page, ~1–2 screens)
1. Name + one-sentence pitch (reuse PluginConfig `desc`).
2. 2–3 screenshots (Daily, Project, Review).
3. **Philosophy** (short, links to `docs/user/philosophy.md`):
   - filesystem-first: your data is plain markdown in your own PARA folders, readable in any
     editor or Obsidian; no hidden database, no lock-in
   - GTD + PARA, adapted to handwriting on e-ink
   - integrity/authenticity: say what you'll do, see what you said (`#now`, focus)
   - calm by design: no scrolling, paged e-ink-friendly views, rest and non-doing count too
4. Features at a glance (bullets linking to `docs/user/*`), experimental ones marked.
5. Install & update (link to latest release; InkHub once available; requirements: devices,
   minimum firmware, tested models).
6. Getting help / reporting bugs (link to issue form, "Copy debug info" hint).
7. Project status: "hobby project by one person; issues and ideas welcome; response times vary".
8. License, credits (sn-plugin-lib, React Native).

### 4.2 docs/user pages
- One page per feature area (list in Phase 2), each with: *What it's for* → *How to use it*
  (numbered steps) → *Tips* → *Limitations/known issues*.
- Source material: the `feature_*` requirement notes and `design-overview.md §2 (as-built)` —
  rewrite from the user's perspective; don't copy technical designs.
- Write in a **restricted markdown subset** so the same files render on the device (4.4):
  headings `#`–`###`, paragraphs, `-` and `1.` lists, `**bold**`, `*italic*`, `` `code` ``,
  `>` notes, links. No tables, no HTML, no nested lists deeper than 2. Images only as separate
  lines (`![…](images/…)`) — skipped on the device.
- Put `Experimental` in a `> **Experimental:** …` note at the top of affected pages.

### 4.3 Screenshots and demo data
- Create a demo PARA folder set (e.g. "Garden renovation", "Learn Spanish", Area "Health",
  some meetings with fictional people) — commit it as `docs/dev/demo-data/` so screenshots can
  be recreated after UI changes and testers can reproduce issues on neutral data.
- Take screenshots on the device, crop, store in `docs/user/images/`, keep them small (PNG,
  grayscale).

### 4.4 In-app Help
- `gen-bundled-content.mjs` turns `README.md` + `docs/user/*.md` into
  `src/generated/helpDocs.ts` (`{ id, title, markdown }[]`, images stripped).
- New Help screen (Settings → Help, and maybe a `?` in the TabBar): left list of pages, right
  pane renders the selected page with a **small own markdown renderer** for the subset above
  (≈150 lines, no dependency), using the existing theme styles.
- Paging: either the existing `PagedSection` by height, or — like the Gmail body pane — an
  explicit scroll exception. To decide in the technical design.
- Result: docs are written once, shown on GitHub *and* on the device, always matching the
  installed version.

### 4.5 docs/dev
- `docs/dev/README.md`: how to build (Node/Android Studio/sn-plugin-lib versions,
  `buildPlugin.ps1`), repo tour (`src/domain` pure TS, `storage`, `screens`, `ui`), how the
  design docs are organized, the verification recipe (tsc + Jest smoke test).
- Keep `design-overview.md` as the living architecture doc.

---

## Phase 5 — In-app About, Help and Debug tools (feature to specify next)

Following the project workflow, this becomes its own requirements → technical design →
implementation cycle. Proposed scope:

### 5.1 Settings → About
- `gtdpara 0.2.0 (build 42) · 2026-11-02 · a1b2c3d` (+ `-dirty` marker)
- Device model + firmware (if the SDK exposes it), sn-plugin-lib version
- "What's new": the bundled changelog, current release expanded, older ones collapsed/paged
- Project URL as plain text (short: `github.com/tilmanbergt/gtdpara`) — optionally a QR code
  (`react-native-svg` is already a dependency)

### 5.2 Debug tools (in About)
- **Debug logging** toggle (default off). When on: verbose `log()` calls are recorded;
  when off: only warnings/errors.
- Logging core: in-memory **ring buffer** (e.g. last 2 000 lines) + periodic append to a log
  file in a fixed, user-visible folder (e.g. `Document/gtdpara/logs/gtdpara-log.txt`, rotated at
  ~1 MB). Builds on the existing file logging used for the perf/crash investigations.
- **Copy debug info**: copies a text block to the clipboard and writes it to
  `…/logs/debug-info.txt` (the user might need to transfer it via USB/Supernote Cloud):

  ```
  gtdpara 0.2.0 (build 42) a1b2c3d  built 2026-11-02
  Device: A5 X · Firmware: Chauvet 3.xx · sn-plugin-lib 0.1.19
  Settings: rootFolders=[custom], keepTabsAlive=on, experimental=[sharedNotePages]
            calendar=configured, gmail=configured, tagRules=7
  Data: projects=8 areas=8 inboxItems=12
  Last errors (5): …
  ```
- **Export log**: writes the current buffer + debug info into one timestamped file and tells the
  user the path.
- **Redaction is mandatory**: never include the Gmail app password, the ICS URL (it contains a
  secret token), email addresses, email subjects/bodies, or task/meeting texts. Project/area names
  replaced with counts or hashes unless the user opts in. Implement redaction as a pure
  `domain/redact.ts` with unit tests.

### 5.3 Settings → Experimental
- One switch per experimental feature, default off, with a one-line warning.
- Candidates (confirm after a device test pass): Gmail email→note, shared note pages,
  return-to-origin, keep-tabs-alive (currently default *on* as a performance feature — decide),
  linked-file piece, standalone note in QuickAdd.
- Experimental list is shown in debug info so you know what a reporter had enabled.

### 5.4 Help
See 4.4.

---

## Phase 6 — Community processes (low effort by design)

### 6.1 Issue forms
`bug_report.yml` fields: gtdpara version (required, "see Settings → About"), device model
(dropdown), firmware, what you did (steps), what you expected, what happened, debug info (paste),
log file (attach), experimental features enabled (checkboxes).
`feature_request.yml`: the problem you want solved, how you work today, idea (optional).
`config.yml`: `blank_issues_enabled: false`, contact link to GitHub Discussions (Q&A) and the
Reddit thread.

### 6.2 Labels and triage
Labels: `bug`, `enhancement`, `question`, `experimental`, `needs-info`, `confirmed`,
`wontfix`, `good first issue`. Triage routine (weekly or whenever you like):
1. Missing version/log → `needs-info` with a canned reply (saved reply in GitHub).
2. Reproduce with demo data → `confirmed`.
3. Fix on a branch, reference the issue in the commit (`Fixes #12`), add a CHANGELOG line.
   Issue closes on merge, ships with the next release.

### 6.3 CONTRIBUTING.md (short)
- "This is a hobby project maintained by one person in spare time."
- Bugs and ideas: open an issue.
- Code: please open an issue first and wait for a go before a PR — keeps the product coherent.
- How to build locally (link to `docs/dev/README.md`).
- Also say the philosophy is a filter: features should respect filesystem-first, no lock-in,
  e-ink-calm.

### 6.4 Where the community talks
- GitHub Issues = bugs/feature requests (structured). GitHub Discussions = questions, show & tell.
- One Reddit announcement thread per minor release (r/Supernote, r/Supernote_beta), always
  pointing back to GitHub for bugs, so reports don't scatter.

---

## Phase 7 — Launch sequence

1. Phase 1 (backup, scan, decide history, cleanup, move docs, LICENSE).
2. Versioning plumbing: `gen-bundled-content.mjs`, `release.ps1`, `CHANGELOG.md` with a first
   `0.1.0` entry summarizing the current feature set.
3. Implement About + debug tools (Phase 5.1–5.3) — the minimum for supportable bug reports.
4. Device test pass; move anything shaky behind Experimental.
5. Write README + the core user pages (getting-started, philosophy, daily, quick-add,
   projects-and-areas, review, troubleshooting). Other pages can follow in 0.1.x.
6. Demo data + screenshots.
7. Issue forms, CONTRIBUTING, PRIVACY, enable Discussions, set repo description/topics
   (`supernote`, `gtd`, `para`, `e-ink`, `plugin`).
8. In-app Help viewer (can also ship in 0.2.0 if you want to launch earlier).
9. Release 0.1.0 via script → install over your own current build → verify.
10. Make the repo public, post on Reddit, submit to InkHub.

---

## Phase 8 — Maintenance routine after launch

- **Per change**: CHANGELOG line in the same commit; user doc updated if behavior changed
  (the in-app help ships with the same release, so docs can't drift from the installed version).
- **Per bug report**: debug info → version/commit tells you the exact code; reproduce with demo
  data; fix; `Fixes #n`.
- **Per release**: `release.ps1` + checklist, ~15–30 min.
- **Cadence**: release when there's something worth it — no fixed schedule; patch releases for
  annoying bugs within a few days if possible.

---

## Open points / next decisions
1. ~~Git history~~ — decided: fresh start (1.2b). Open: is the old history already on GitHub?
2. Minimum firmware / supported devices to state in README (which models have you tested?).
3. Keep-tabs-alive: experimental (off) or regular feature (on)?
4. Help viewer: paging vs. scroll exception.
5. InkHub plugin submission details (from the beta Reddit thread).
6. Requirements round for the About/Help/Debug feature (Phase 5) → technical design.
