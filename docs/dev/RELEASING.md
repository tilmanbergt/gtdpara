# Releasing gtdpara

Design: `technical-design-versioning-release.md`.

## One-time setup

```powershell
winget install GitHub.cli     # then open a new PowerShell window
gh auth login                 # GitHub.com, HTTPS, log in with the browser
```

Without `gh` the release script still works; it just tells you how to create the GitHub release
by hand at the end.

## Every day

- Every change that users would notice gets a line under `## [Unreleased]` in `CHANGELOG.md`,
  in the same commit. Sections: New, Changed, Fixed, Experimental, Removed, Upgrade notes.
- Add **Upgrade notes** whenever settings or the project/area file format change.
- `buildPlugin.ps1` builds are labelled `x.y.z+dev.<commit>` (plus `-dirty` with uncommitted
  changes). Only builds made by the release script are labelled plain `x.y.z`.

## Making a release

1. Read `## [Unreleased]` in `CHANGELOG.md` once more as a user would. It becomes the GitHub
   release text and the "What's new" in the app.
2. Optional: `./scripts/release.ps1 -Bump minor -DryRun` shows what would happen.
3. Run `./scripts/release.ps1 -Bump patch` (fixes only) or `-Bump minor` (new features or changed
   behavior). For the very first release: `./scripts/release.ps1 -Version 0.1.0`.
4. When it pauses, test on the device (below), then answer `y` to publish or `N` to stop. After
   `N`, the release commit and tag exist only locally; the script prints how to undo them.

### Device checklist

- [ ] Install `build\outputs\gtdpara-x.y.z.snplg` **over the previous release** (not a clean
      install). If the "old version still loaded" warning appears, tap Restart.
- [ ] Settings are still there; Projects/Areas load.
- [ ] Daily, Week, Month and a Project's Current tab open and look right.
- [ ] Quick Add: add a todo, edit it, delete it.
- [ ] Review hub opens.
- [ ] Logcat (optional) shows `App: gtdpara x.y.z build …` without `+dev`.

### After publishing

- Check the release page on GitHub: text and `.snplg` attached.
- If it matters to users: post in the Reddit thread, update the InkHub listing with the same `.snplg`.
