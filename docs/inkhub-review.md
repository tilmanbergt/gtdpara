# Notes for InkHub reviewers

gtdpara is an open-source (MIT) GTD + PARA plugin for the Supernote. This page explains what it
does with files, permissions and the network, so the review can check it quickly. Source: this
repository; the release tag `vX.Y.Z` is exactly the submitted `.snplg`.

## Permissions

Each permission is requested right before the first action that needs it, never at start-up.

- **FILE:READ / FILE:WRITE** - the user's PARA folders (default `Note/1 Projects`, `2 Areas`,
  `3 Resources`, `4 Archive`; the Inbox in `2 Areas/0 Inbox`) and `EXPORT/gtdpara` (profiles,
  debug files the user exports). Todos and meetings are plain-text files (`project.txt`,
  `area.txt`, `Inbox.txt`) inside those folders.
- **FILE:DELETE** - only after a confirmation in the plugin that names what will be deleted. In
  practice the one case is the empty folder left behind when the user archives an area into an
  Archive folder that already exists. If the user says no, the empty folder stays.
- **INTERNET** - only for two optional integrations (Google Calendar via the user's private ICS
  link, Gmail via IMAP with an app password). Both are off by default (Settings → Advanced) and
  connect only when the user taps Load or Refresh. No telemetry, no server of our own.

## What changes files, and how the user is told

- The user's own edits (todos, meetings, status, focus) are written to the item's text file.
  Changes are span-scoped: lines the plugin doesn't understand are kept.
- New notes, PDFs and exports the user asked for are created and named in a status message.
- **Moves** (archive, project close-out): shown in a confirmation or the close-out wizard's
  step list before they happen, reported afterwards. Moves are renames within shared storage.
- **Overwrites**: replacing an existing close-out PDF asks first.
- **Deletes**: see FILE:DELETE above. The native delete helper refuses anything that is not an
  empty folder.
- **One automatic change**: users of builds before 0.2.0 (never public) get their `Note/Inbox.txt`
  and its `Todos`/`Meetings` folders moved into `Note/2 Areas/0 Inbox` once, on first start,
  with links to those notes updated. Nothing is deleted, and a message names what moved. A fresh
  install never does this.
- Temporary files (rendered PDF pages, the unfinished PDF) live in the plugin's private folder
  and are removed when done.
- Diagnostics are written to files only when the user switches on Debug logging or exports a
  debug bundle. Secrets are never written to files or logs.

## Native code

Kotlin modules in `android/app/src/main/java/eu/embodyagile/gtdpara/`:

- `GtdParaFileModule` - folder listing, plain-text and binary read/write, moves, empty-folder
  delete, private temp folder. sn-plugin-lib has no API for these.
- `PdfModule` - writes the close-out PDF (text pages, rendered note pages, table of contents).
- `GmailImapModule` - IMAP access, only when Gmail is switched on.
- `TextboxMetricsModule` - text measurement for note templates.
- `PluginRuntimeGuard` / `GtdParaRuntimeModule` - diagnostics for the host's in-process update.

All of them run under the host's permission checks.

## Testing quickly

Settings → Advanced → Profiles → **Create demo space**, then switch to the Demo profile. It
writes a small example PARA tree to `Note/gtdpara-demo` and never touches the user's real folders.
Help is built in (**?** in the tab bar).

More: [PRIVACY.md](../PRIVACY.md), [user guide](user/index.md).
