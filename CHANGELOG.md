# Changelog

All notable changes to gtdpara are listed here, newest first.
Versions follow [Semantic Versioning](https://semver.org/) (`0.MINOR.PATCH` until 1.0):
MINOR = new features or behavior changes, PATCH = bug fixes only.

Each release has up to six sections: **New**, **Changed**, **Fixed**, **Experimental**,
**Removed** and **Upgrade notes**. Upgrade notes appear whenever a release changes how settings
or your project/area files are stored.

## [Unreleased]

### New
- **Nested tags** like `#coaching/sabina`. A Tag Rule on `coaching` also applies to every
  `#coaching/...` tag.
- **Shared files split by tag and date.** The Tag Rule's "Shared file name" understands
  `{subtag}`, `{year}`, `{quarter}` and `{month}` - for example `Coaching {subtag} {year}` collects
  each client's sessions in their own file per year. Tap a placeholder to insert it.

### Changed
- **The note icon asks before creating a note.** The status line says which file or page will be
  created (and by which Tag Rule), so a misspelt tag can be fixed first. It also asks before
  recreating a deleted note or page, and before linking to a page that already exists.
- Once a page in a shared file exists, it stays in that file, even if the rule's file name is
  changed later.
- A deleted own note can be created again from the note icon, instead of showing an error.
- Removing a tag chip in Quick Add no longer cuts that tag out of a longer tag (`#team` out of
  `#team-jf`).

### Upgrade notes
- Text like `#foo/bar` used to carry the tag `foo` followed by plain text `/bar`; it now carries the
  nested tag `foo/bar`. Tag Rules on `foo` still apply. A Daily filter on `#foo` no longer shows
  these items - tap `#foo/bar` instead.

## [0.3.0] — 2026-10-01

### Changed
- **gtdpara now tells you about every change to your files.** Moves, overwrites and deletes are
  shown before they happen and confirmed afterwards. Archiving an area from the Weekly Review now
  asks first, like it does on the area's Current tab.
- **Deleting only after you confirm it.** When an area is archived into an Archive folder that
  already exists, the confirmation names the area's then-empty folder; it is deleted only if you
  also allow it in the Supernote's permission prompt. Otherwise it stays, and gtdpara says so.
- **Create again** in the close-out's PDF step asks before replacing the existing PDF.
- Temporary files of a close-out PDF are kept in gtdpara's private folder instead of a hidden
  folder in `Note`.
- Diagnostic notes about Supernote calls are no longer written as separate files to
  `EXPORT/gtdpara/debug`; they go into the log, which is written to a file only while
  **Debug logging** is on.
- Clearer permission prompts for Google Calendar and Gmail.

### Fixed
- A note created with Quick Add (and any file gtdpara creates or moves) now appears in the Files
  pane right away, without navigating away and back.
- A missing file-read permission now shows the Supernote's permission prompt when folders are
  first listed, instead of an unclear error.

### Upgrade notes
- gtdpara now declares the **Delete files** permission. It is only requested after you confirmed a
  delete; see Help → Troubleshooting → Permission prompts.
- Many small files named like `abc123-001-openPath-OK.txt` in `EXPORT/gtdpara/debug` come from
  earlier versions and can be deleted. So can a hidden `.gtdpara_tmp` folder in `Note`, if an
  earlier PDF export was interrupted.

## [0.2.0] — 2026-10-01

### Changed
- **The Inbox now has its own folder inside Areas** (`2 Areas/0 Inbox`), so your `Note` folder
  only holds the PARA folders. Everything about the Inbox works as before; it is not shown as an
  area. The folder name can be changed in **Settings → Folders** (renaming it there moves the
  folder).
- The Integrity Check also reports Inbox files left in `Note` by an unfinished move.

### Upgrade notes
- On the first start, gtdpara moves `Note/Inbox.txt` and the `Todos` and `Meetings` folders next to
  it into `Note/2 Areas/0 Inbox` once, and shows a short message. Links to notes in those folders
  are updated in the Inbox and in all active projects and areas (not in archived ones).
- If an area named `0 Inbox` already exists, or a file would be overwritten, nothing is moved and
  the Inbox keeps working from `Note`. Choose another Inbox folder name in Settings → Folders; the
  move is tried again.
- New setting **Inbox folder** (default `0 Inbox`); it switches with the profile.

## [0.1.0] — 2026-09-30

First public release.

### New
- **PARA folders as the source of truth.** Projects, Areas, Resources and Archive are plain
  folders in your Supernote `Note` directory. Each Project/Area keeps its todos and meetings in a
  human-readable plain-text file (`project.txt` / `area.txt`) you can open in any text editor.
- **Daily** view: today's and tomorrow's meetings, due/overdue and `#next` todos from your
  focused Projects/Areas, grouped by Project/Area; context-tag filter.
- **Focus mode** (`#now`): mark the few todos you are on the hook for right now and work only
  on those, with nothing else on screen.
- **Week** and **Month** tabs: meeting grid per day, weekly/monthly focus and goals, monthly
  meeting highlights.
- **Quick Add** everywhere: todos, meetings (with time and length) and standalone
  notes; tags, due dates, refile to another Project/Area, quick-file via Project/Area
  abbreviations (e.g. `#AT`).
- **Projects & Areas**: create, status (Active / On Hold, and Done for projects), archive, scope
  description, short abbreviation, optional Area assignment for Projects, linked files.
- **Project close-out**: a short wizard before archiving a project - checklist, where results go,
  an optional PDF of all its notes with a table of contents; "Quick archive" skips the PDF.
- **Inbox** and **lasso capture**: turn handwriting into a todo or meeting and file it.
- **Tags**: `#next`, waiting-for, someday/maybe, due dates, free context tags (people, topics).
- **Weekly Review** hub: Inbox to zero, stalled/neglected/on-hold projects, week ahead,
  meetings to close out, unfocused next actions; each step with its own count and last-reviewed date.
- **Note templates ("Tag Rules")**: new linked notes get a background and pre-filled content
  (title, date, related todos, static texts, linked file) based on context and tags.
- **Meeting prep/review tracking**: optional "prepare before" / "review after" marks per meeting.
- **Integrity check**: finds broken links, duplicate headings and similar file problems.
- **Settings → About**: version and build, device, and "What's new" (these release notes).
  After an update, a short notice points to it once.
- **Reporting problems**: "Debug logging" writes the plugin's log to a file, and "Export debug
  bundle" saves one text file (version, device, settings summary without names, recent log) to
  `EXPORT/gtdpara/debug` for attaching to a GitHub issue. Passwords, calendar links and
  e-mail addresses are removed from it.
- **Settings → Advanced**: Experimental switches plus the tools (Integrity Check, performance
  tracing, keep tabs in memory).
- **Profiles**: switch between complete configurations (folders, Tag Rules, review state,
  integrations), stored as files in `EXPORT/gtdpara/profiles` that you can copy and share.
  A marker in the tab bar shows when a profile other than Production is active.
- **Demo space**: one tap creates a small fictional setup in `Note/gtdpara-demo` with its own
  profile - for trying gtdpara out, testing, or reproducing a problem without your real data.
- **Help**: tap **?** in the tab bar for the user guide, starting at the page for the current
  tab; the screen behind stays as it was. The same pages are in `docs/user/` on GitHub.

### Experimental
Switch on in Settings → Advanced. They depend on outside services and may be slow or break:
- **Google Calendar**: shows your calendar via its private ICS link in Daily, Week, Month, Inbox,
  a project's or area's Current tab and the Review; copy events into meetings.
- **Gmail**: a Gmail inbox step in the Weekly Review (IMAP with an app password): create todos
  from emails, archive, save email text as a note.
