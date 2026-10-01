# Git, build and release workflow

> **About this document.** The current git, build and release workflow, step by step, plus the
> guide Claude gives after every change (§8). Present tense, no history. Update it in the same
> change that alters a script, a branch rule or a release step.

How code gets from an idea to a release: branches, commits, builds, releases and what comes
after. Rules for *what* a change must contain are in `DEVELOPMENT-POLICY.md`; this document is
about *how* it moves. Design of the release scripts: `technical-design-versioning-release.md`.

All commands are PowerShell, run in the repository root.

## 1. One-time setup

```powershell
winget install GitHub.cli        # then open a new PowerShell window
gh auth login                    # GitHub.com, HTTPS, log in with the browser
git config user.email "50413979+tilmanbergt@users.noreply.github.com"   # repo-local, public address
git config user.name "Tilman Bergt"
```

Commits must only ever carry the noreply address - the repository is public.

## 2. Branches

- **`main` is always releasable.** Everything on `main` builds, passes the checks and has been
  tried on the device (or is behind an Experimental switch). Releases are only made from `main`
  (`release.ps1` refuses anything else).
- **Small changes** - a bug fix, a doc correction, a one-session change - are committed directly
  on `main`.
- **Features and anything risky or spanning several sessions** get a branch:
  `feature/<short-name>` (or `fix/<issue-number>-<short-name>` for a larger bug fix).
  Unfinished work never lands on `main`, so a hotfix can always be released from `main`.
- No long-lived branches besides `main`. Merge or delete a branch within days, not months.

Start a branch:

```powershell
git switch main
git pull
git switch -c feature/<short-name>
```

Finish it (after the Definition of Done in `DEVELOPMENT-POLICY.md` §8 is met):

```powershell
git switch main
git pull
git merge --no-ff feature/<short-name> -m "Merge feature/<short-name>: <what it adds>"
npm test                                     # once more on main after the merge
git push
git branch -d feature/<short-name>
git push origin --delete feature/<short-name> # only if the branch was pushed
```

## 3. Commits

- **One logical change per commit**: code, its tests, its help page change and its CHANGELOG
  line together. Don't mix unrelated changes.
- **Message**: short imperative subject (max ~70 characters), e.g.
  `Fix clipped badge row on Daily`, then an empty line and details if useful. Reference issues
  with `Fixes #12` - GitHub closes the issue when it reaches `main`.
- **Never commit**: `build/`, `src/generated/`, `*.snplg`, `node_modules/`, logs, debug bundles,
  personal data or secrets. `.gitignore` covers the usual ones - still look at
  `git status --short` before every commit.
- **Push `main` regularly** (it's also the backup). Feature branches may be pushed for backup too.

```powershell
git status --short          # look: only what belongs to this change?
git add -A
git commit -m "<subject>"
git push
```

## 4. Test builds (every day)

```powershell
./buildPlugin.ps1
```

- The build stamps version and changelog into the app, bundles, compiles the native modules and
  writes `build\outputs\gtdpara.snplg` plus a labelled copy `gtdpara-<version>+dev.<commit>.snplg`.
- **Commit before building** a build you will test seriously: then the label names the exact
  commit. `-dirty` in the label means the build contains uncommitted changes.
- Install the `.snplg` on the Supernote **over** the existing plugin. If the "old version still
  loaded" message appears, tap **Restart**.
- After changing `CHANGELOG.md` or `docs/user/` without building, `npm run gen` refreshes
  `src/generated/` for tests and type checks.

## 5. Releases

### When

- **Patch** (`0.1.0 → 0.1.1`): only fixes. Release soon after a fix users are waiting for.
- **Minor** (`0.1.x → 0.2.0`): new features or changed behavior. Release when a set of features
  is done and tested - no fixed schedule.
- Not every merge needs a release. Releases are moments when the Unreleased section of the
  CHANGELOG tells a coherent story.

### Steps

1. **Prepare** - on `main`, clean tree, everything pushed:
   ```powershell
   git switch main
   git pull
   git status --short           # must be empty
   npx tsc --noEmit
   npm test
   npm run test:scripts
   ```
2. **Check** the release checklist in `DEVELOPMENT-POLICY.md` §9 (CHANGELOG read as a user, help
   pages, README, PRIVACY, Experimental, logging).
3. **Dry run** - shows the new version and what would happen, changes nothing:
   ```powershell
   ./scripts/release.ps1 -Bump patch -DryRun     # or -Bump minor
   ```
4. **Release**:
   ```powershell
   ./scripts/release.ps1 -Bump patch             # or -Bump minor
   ```
   The script sets the version in `package.json` and `PluginConfig.json`, turns `[Unreleased]`
   into `[x.y.z] - date` in the CHANGELOG, commits `Release x.y.z`, tags `vx.y.z` and builds
   `build\outputs\gtdpara-x.y.z.snplg`. Then it **pauses**.
5. **Device check** while the script waits (§6 below), then answer `y` to publish. The script
   pushes `main` with the tag and creates the GitHub release with the `.snplg` and the
   changelog section as text.
   - Answer `N` if anything is wrong: the commit and tag exist only locally, and the script
     prints the two commands to undo them. Fix, commit, start again at step 1.
6. **After publishing** (§7).

### Hotfix

Because `main` holds no unfinished work (§2), a hotfix is just a fix on `main` (with its
CHANGELOG line under Fixed) followed by `./scripts/release.ps1 -Bump patch`.

## 6. Device check before publishing

- [ ] Install `build\outputs\gtdpara-x.y.z.snplg` **over the previous release** (not a clean
      install). If the "old version still loaded" warning appears, tap Restart.
- [ ] Settings → About shows `x.y.z` (no `+dev`); "What's new" shows the new notes.
- [ ] Settings are still there; Projects and Areas load.
- [ ] Daily, Week, Month and a project's Current tab open and look right.
- [ ] Quick Add: add a todo, edit it, delete it.
- [ ] Review hub opens; Help (**?**) opens on the right page.
- [ ] What this release changed works (the CHANGELOG is the checklist).

## 7. After a release

- Check the release page on GitHub: text and `.snplg` attached.
- If it matters to users: update the InkHub listing with the same `.snplg`, post in the Reddit
  thread (one announcement per minor release; patch releases only if users waited for the fix).
  InkHub runs on the Supernote: copy the `.snplg` (and new screenshots, if screens changed) to
  `EXPORT/gtdpara/inkhub/`, then InkHub → Upload Item with the values in
  `docs/dev/inkhub-listing.md`. If permissions changed, update the description's permission
  paragraph and `docs/inkhub-review.md` first.
- The next work starts with an empty `## [Unreleased]` section - the script leaves it ready.
- Triage new issues: `needs-info` (version or log missing), `confirmed` (reproduced, ideally in
  the demo space), `experimental` (Google Calendar / Gmail). Fixes reference the issue
  (`Fixes #12`).

## 8. Step-by-step guides from Claude

Most changes are made by Claude, but git, builds, installs and releases run on Tilman's computer
and device. So **at the end of every change Claude gives a short, numbered, copy-paste-ready
guide** for what to do next to keep the code base consistent. It covers, as far as relevant:

1. **Where we are**: which branch, what changed, what was verified off-device and what still
   needs the device.
2. **Commit**: `git status --short` to look at, then `git add` / `git commit` with a ready
   message (and on which branch).
3. **Build and test**: whether a build is needed now, the command, what exactly to check on the
   device.
4. **Push / merge**: whether to push, whether the feature branch is ready to merge (with the
   commands from §2), or what is still missing.
5. **Release**: whether a release is advisable now (patch or minor) or should wait - and when it
   is due, the full sequence from §5 with the actual version number.

The guide is short and specific to the situation - never a copy of this whole document. If
something on Tilman's side could break integrity (uncommitted work on the wrong branch, a dirty
release build, an un-pushed `main`), the guide says so first.
