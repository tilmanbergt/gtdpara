# InkHub listing

Ready-to-use values for InkHub → **Upload Item** on the Supernote. The InkHub build is always the
same `.snplg` as the GitHub release. Design and decisions: `technical-design-inkhub-submission.md`.

Status: **draft** - fill in the version once the release exists. The field order below matches
the form on the device.

## Title*

gtdpara

## Description (Keyboard tab)

Plain text, no markdown (the field doesn't render it). Keep it this short - the maximum length is
unknown.

```
A calm GTD + PARA workspace for the Supernote. Every Project and Area is a folder in Note; its todos and meetings live in a small plain-text file inside it. You can read and edit everything without the plugin - no lock-in, no internal database.

- Daily, Week and Month views
- Focus mode (#now): only what you are doing right now
- Quick Add for todos, meetings and notes; lasso capture
- Projects & Areas with status, linked notes and files
- Weekly Review, one step at a time
- Note templates with pre-filled context
- Project close-out with an optional PDF, then archive
- Built-in help (? in the tab bar)
- Experimental, off by default: Google Calendar and Gmail

Permissions: file read/write for your PARA folders and EXPORT/gtdpara. File delete only after you confirm it, and the prompt names what will be deleted (e.g. an empty folder left after archiving). Internet only for the optional Calendar/Gmail integrations, when you tap Load. No telemetry.

Hobby project, open source (MIT). Docs, issues, privacy and notes for reviewers:
github.com/tilmanbergt/gtdpara
```

## Category*

Plugins

## Subcategory*

Utility

(Alternative: Writing. Utility fits a planning/organizing tool better.)

## License*

MIT License - the same as the repository's `LICENSE`.

## Package*

`gtdpara-x.y.z.snplg` from the GitHub release (`build\outputs\` after `release.ps1`). Copy it to the
Supernote first, e.g. to `EXPORT/gtdpara/inkhub/`.

## Thumbnail (up to 6)

From `docs/user/images/` (demo space, A5 X portrait), in this order:

1. `20260930_Daily.png`
2. `20260930_Week.png`
3. `20260930_Current Project.png`
4. `20260930_Inbox Quick Add.png`
5. `20260930_Review.png`
6. `20260930_Help Settings.png`

Refresh any screenshot whose screen changed noticeably (see backlog: Settings Folders). Copy them to
`EXPORT/gtdpara/inkhub/` on the device for the upload.

## Open Source

Checked.

## Notes for reviewers

The form has no field for this. The full note is public in `docs/inkhub-review.md` and linked
from the description via the repository. Summary:

- Source: github.com/tilmanbergt/gtdpara, tag `vX.Y.Z` = this build.
- Native modules (Kotlin): `GtdParaFile` (folder listing, plain-text/binary read/write, moves -
  sn-plugin-lib has no API for these), `Pdf` (close-out PDF), `GmailImap` (IMAP, only when Gmail
  is switched on), `TextboxMetrics` (text measurement). All of it runs under the host's
  permissions; each permission is requested right before use.
- Deletes: temp files only in the plugin's private folder; in shared storage, only empty folders
  after a move, and only after a confirmation that names them.
- Every move, overwrite and delete is announced to the user.
- One-time data move for users of builds before 0.2.0 (never public): `Note/Inbox.txt` with its
  `Todos`/`Meetings` folders → `Note/2 Areas/0 Inbox`. Nothing is deleted, and the user is told
  what moved. It doesn't happen on a fresh install.
- Quick test without own data: Settings → Advanced → Profiles → demo space.
- Credentials for the optional integrations are stored on the device only, never in files or logs.

## Updating the listing

See `RELEASING.md` §7: new `.snplg`, description if features changed, thumbnails if screens
changed.
