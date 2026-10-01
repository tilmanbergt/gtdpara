# Technical design: InkHub submission and permission compliance

Status: **draft, waiting for approval** (2026-10-01). Target version: probably **0.3.0** (not final yet).

Goal: submit gtdpara to Ratta's InkHub. It should get through review on the first try, meet Ratta's
published review rules and still follow our own principles. Ratta's rules come from the
r/Supernote_dev post "Plugin Review Process & Publishing Requirements" and from
`docs.supernote.com/en/plugin-base/permission`.

## 1. Requirements as decided

1. **Permissions match what the plugin does.** We declare `FILE:READ`, `FILE:WRITE`, `INTERNET` and
   now also `FILE:DELETE`. Each one is requested at runtime, right before the operation that
   needs it, with a description the user can understand.
2. **No delete without an explicit user decision.** Every file or folder delete in shared storage
   first shows a confirmation that names exactly what will be deleted. Only after that does the
   app request `FILE:DELETE`. If the user says no, nothing is deleted and the operation either
   completes without the delete or stops cleanly.
3. **No empty folders left behind** after a move the user started. The empty source folder is
   removed, under rule 2.
4. **Our own temporary files** (rendered PDF pages) go to the plugin's private folder, which is
   exempt from all permissions, never to the user's `Note` folder.
5. **The debug log rotates without deleting** (the files are overwritten instead).
6. **The automatic Inbox move from 0.2.0 stays as it is.** It only ever affects users of builds
   before 0.2.0, which were never public. The submission note explains it, and the code can be
   removed in a later version.
7. **The Google Calendar and Gmail integrations stay in the InkHub build**, off by default
   (Experimental switches). The InkHub build is identical to the GitHub release.
8. **Every network or file call checks its permission first**, including folder listing and the
   optional debug and perf files.
9. **Submission package**: listing text, permission explanation, reviewer note, screenshots and the
   source link, kept in `docs/dev/inkhub-listing.md`.
10. **Transparency for every file change** (Tilman, 2026-10-01): whenever gtdpara changes files,
    the user knows what is going on. Concretely, see §3.8.

## 2. Current state (audit 2026-10-01, version 0.2.0)

Ratta's docs say the host enforces permissions for everything: sn-plugin-lib, Android/RN file and
network APIs, and C/C++. So our native `java.io` access (`GtdParaFileModule.kt`, `PdfModule.kt`) is
**not** a way around the permissions. It runs under them. The flip side: any delete we make
without `FILE:DELETE` fails on hosts that enforce it.

| Place | What it does | Problem |
|---|---|---|
| `GtdParaFileModule.deleteTempTree` | deletes `Note/.gtdpara_tmp/<job>` recursively | delete in shared storage; temp files in the user's folder |
| `GtdParaFileModule.appendTextFile` | log rotation deletes `*.1.txt` (and the main file if the rename fails) | delete |
| `GtdParaFileModule.moveFolderMerge` | `source.delete()` of the now-empty folder after a merge | delete, without asking |
| `PdfModule.buildPdf` | deletes `.part`, and the existing PDF when `overwrite` is set (close-out "Create PDF" again) | delete; overwrite without asking |
| `moveFolder` / `moveFile` (`renameTo`) | archive, close-out moves, Inbox folder rename, Inbox move | **unknown** whether the host counts a rename as DELETE of the source → spike §3.0 |
| `listFolderEntries`, `fileExists`, `folderExists` | native listing | no `ensureFileReadPermission()` → a missing grant shows up as an unclear error instead of a prompt |
| `recordDebugLogEntry`, `appendDebugLogFile`, perf trace files | raw native writes to `EXPORT/gtdpara/debug` | no write check (opt-in only, still inconsistent) |
| `ensurePluginPermission` | `has > 0` / `requested > 0` | matches the docs (1 = once, 2 = always, 0/-1 = denied) - OK |
| Network | Calendar `fetch`, Gmail IMAP; both call `ensureInternetPermission()` first, both opt-in | OK; the description text only mentions the Calendar → make it generic |

## 3. Design

### 3.0 Assumption: a rename/move is a WRITE, not a DELETE

Decided 2026-10-01 (Tilman): we treat `renameTo` (move/rename of files and folders) as a write.
No separate spike. It is checked along the way in the device test plan (§5, item 9): if logcat
shows a "has no … DELETE permission" message for a move, the moves get the same
confirm-then-request flow as §3.4. Independent of the permission, every move is already announced
to the user (§3.8).

### 3.1 Permissions (`PluginConfig.json`, `supernote/pluginPermissions.ts`)

- Add `"plugin.permission.FILE:DELETE"` to `uses-permissions`.
- New `ensureFileDeletePermission(description)` that takes a description of the actual delete,
  e.g. "Delete the empty folder 2 Areas/Health after moving it to the Archive."
- Make `ensureInternetPermission()` generic: "Allow GtdPara to connect to Google Calendar or Gmail
  - only when you tap Load or Refresh." (Or one text per integration, via a parameter.)

### 3.2 Private folder for temporary files

- Native: new `GtdParaFile.getPrivateDir()`. It returns the plugin's private folder
  (`/data/data/com.ratta.supernote.pluginhost/files/plugins/<pluginID>`, worked out from
  `reactApplicationContext.filesDir` + `PluginRuntimeGuard.pluginId`; checked with `isDirectory`,
  logged).
- `storage/pdfExport.ts`: `tempDir = <privateDir>/tmp/<jobId>` instead of `<base>/.gtdpara_tmp/<jobId>`.
  The `baseRoot` option is no longer needed for this.
- `deleteTempTree`: the guard changes from "path contains `/.gtdpara_tmp/`" to "path is under
  `<privateDir>/tmp/`". So it can never reach shared storage, and it needs no permission.
- Startup clean-up (once): delete `<privateDir>/tmp` (leftovers from crashes).
- Old `Note/.gtdpara_tmp` folders from earlier versions: **not deleted automatically**.
  The Integrity Check reports them ("leftover temp folder, can be deleted in the file manager").
  It's rare, and doing it this way keeps rule 2 without an extra prompt.

### 3.3 Log rotation without deleting (`appendTextFile`)

When the size limit is reached: **overwrite** `gtdpara-log.1.txt` with the content of
`gtdpara-log.txt` (write, truncate), then **truncate** `gtdpara-log.txt` and write the new line.
Writes only, no `delete()`, no `renameTo`. It's slower than a rename, but the files are only about
1 MB and this only runs when debug logging is on.

### 3.4 Deletes after an explicit confirmation

A shared helper `confirmAndDelete` in `storage/` (UI part in `ui/`):

1. Shows a confirmation through the existing **status slot** (UI rule §4: no `Alert.alert`) with
   the exact list of what will be deleted and two buttons: **Delete** / **Keep**.
   → Open point O1: does the status slot already support action buttons? If not, we add a small
   confirm type there (reusable), not a one-off dialog.
2. Only after **Delete**: `ensureFileDeletePermission(<text naming the items>)`.
3. Only once that's granted: the native delete (new `GtdParaFile.deleteEmptyFolder(path)`, which
   **only deletes empty folders** and refuses anything with content, so a bug can never delete a
   user file).
4. **Keep** or permission denied: the operation counts as done, the empty folder stays, and the
   status slot says so ("Moved. The empty folder 2 Areas/Health was kept."). This is logged.

Where it applies:

| Flow | Change |
|---|---|
| `moveFolderMerge` (archive an Area into an existing `Archive/<year>/<Area>`; Inbox move) | native: merge children only, **no** `source.delete()`; JS calls `confirmAndDelete([source])` afterwards. For the close-out wizard the delete is **announced up front in the Archive step** ("The empty folder … will then be deleted") and confirmed once with the wizard's own button, so no second prompt. |
| Inbox move (0.2.0, automatic) | rare case: if a merge leaves an empty folder, **no** prompt during startup; the folder stays and the Integrity Check reports it. (Keeps decision 1.6 without asking anything at startup.) |
| `PdfModule.buildPdf` | `.part` file goes to `<privateDir>/tmp`; when finished it is **copied** into the target (stream, truncate) - no delete, no cross-filesystem rename. |
| Close-out "Create PDF" when the PDF already exists | confirmation "Replace the existing *Project X.pdf*?" (status slot or wizard step). Replacing = overwriting (WRITE), **not** a delete. On "Keep": stop, nothing is written. |
| `moveFolder` / `moveFile` | permission unchanged (WRITE, §3.0); announced per §3.8. |

### 3.5 Permission checks everywhere

- `listFolderEntries` (and so `fileExists`/`folderExists`): `ensureFileReadPermission()` first.
  It's cheap: `pending`/`hasPermission` is cached per call. → Check whether the per-call
  `hasPermission` round trip hurts performance (perf trace `io:permission`). If it does, cache
  "granted" for the session; if not, leave it.
- Debug/perf writes: `ensureFileWritePermission()` when the sink is switched on (not on every line).
  If it isn't granted, the switch turns itself off and says why in the status slot.

### 3.6 Submission package (`docs/dev/inkhub-listing.md`)

- Listing text: name, short and long description, category, screenshots (we have them from 0.1.0;
  refresh them if screens changed), "Source, docs & issues: github.com/tilmanbergt/gtdpara".
- **Permission explanation** (one line per permission, the same text as in PRIVACY.md).
- **Reviewer note**: native modules and why (sn-plugin-lib has no folder listing or plain text/binary
  file I/O), all deletes and when they happen, network only through opt-in integrations,
  credentials local and unencrypted (documented), the one-time Inbox move from 0.2.0, how to test
  (Settings → Advanced → Profiles → demo space).
- Process (confirmed 2026-10-01 from Tilman's screenshots): submission happens **on the device**,
  InkHub → "Upload Item". Fields: Title*, Description (handwriting or keyboard), Category* =
  Plugins, Subcategory* (Writing / Drawing / Reading / Utility / Game / Other), License* (Standard
  InkHub License, MIT, CC0, CC BY-NC-ND 4.0, CC BY-NC-SA 4.0), Package* (the `.snplg`), Thumbnail
  (up to 6 images), "Open Source" checkbox. **There is no field for permissions or a reviewer
  note**, so the permission explanation goes into the description (short), and the full reviewer
  note sits in a public file the description links to (§3.7: `docs/inkhub-review.md`).
- Values: Title `gtdpara`; Subcategory **Utility**; License **MIT** (same as the repository);
  Open Source **checked**; Package = the release `.snplg` from GitHub; 6 thumbnails from
  `docs/user/images/` (copied onto the device, e.g. into `EXPORT/gtdpara/inkhub/`).
- Getting the text onto the device: type it with the keyboard tab of the description field, or
  copy it from a text file on the device (`EXPORT/gtdpara/inkhub/description.txt`) if the field
  supports paste.

### 3.7 Docs (same change, DEVELOPMENT-POLICY §6)

- **PRIVACY.md**: add `FILE:DELETE` and when it's used; temp files are in the plugin's private
  folder; describe the log rotation.
- **docs/user/troubleshooting.md**: the permission prompts (Read/Write/Delete/Internet) - what
  happens with "Allow once", "Always allow", "Don't allow", and where to change it afterwards
  (system settings).
- **docs/user/settings.md / close-out.md**: the delete confirmation in the Archive step and when
  replacing a PDF.
- **README**: Install section "or from InkHub" (once it's live).
- **New public `docs/inkhub-review.md`**: the reviewer note (native modules, every permission and
  when it is requested, every delete/move/overwrite and how the user confirms it, network, the
  0.2.0 Inbox move, demo space for testing). Linked from the InkHub description and from PRIVACY.md.
- **DEVELOPMENT-POLICY §3**: new rule "**File changes are visible**" (§3.8) and new rule "**Deletes**: only after a confirmation that names what is
  deleted, then `FILE:DELETE`; temp files only in the private folder; native delete helpers only
  delete empty folders or private temp." Also update `design-overview.md` §3.
- **RELEASING §7**: describe the InkHub update step concretely (once the process is known).
- **CHANGELOG [Unreleased]**: Changed (delete confirmations, temp files no longer in Note), Fixed
  (permission prompt on first folder load), Upgrade note (new permission `FILE:DELETE`; leftover
  `Note/.gtdpara_tmp` can be deleted by hand).

### 3.8 Transparency for file changes

Rule (also goes into DEVELOPMENT-POLICY §3): **every change to the user's files is visible**.
What that means in practice depends on the kind of change:

| Kind of change | Before | After |
|---|---|---|
| Edits the user just made in the UI (todo, meeting, focus, status) written to `project.txt`/`area.txt`/`Inbox.txt` | - (the action itself is the announcement) | nothing extra |
| Creating a note/file the user asked for (linked note, standalone note, PDF, attachment, profile, debug bundle) | - | status slot names the file and folder |
| **Moves and renames** (archive, close-out results, Inbox folder rename, refile with note) | list of what moves where, in the wizard step or the confirmation | status slot: "Moved N items to …" |
| **Overwrite** of an existing file (PDF again, profile save over an existing one) | confirmation naming the file | status slot |
| **Delete** | confirmation naming every item (§3.4), then permission | status slot, including what was kept |
| **Automatic changes without a tap** (the 0.2.0 Inbox move, link updates in other files) | - | a message on next screen naming what moved and which files had links updated; logged |

Audit step during implementation: go through every call of `writeTextFile`, `writeBinaryFile`,
`moveFile`, `moveFolder`, `moveFolderMerge`, `buildPdf`, `createNote`, `insertNotePage`,
`insertElements`/`deleteElements`, `insertKeyWord`/`deleteKeyWord` and record which row of the
table it falls under and whether it already does that. Gaps are fixed in this change if they are
small; larger ones go to the backlog and are named in the reviewer note.

## 4. Files

- `PluginConfig.json`
- `android/.../GtdParaFileModule.kt` (getPrivateDir, deleteTempTree guard, appendTextFile rotation,
  moveFolderMerge without delete, new deleteEmptyFolder)
- `android/.../PdfModule.kt` (.part in private temp, copy instead of delete+rename)
- `src/supernote/pluginPermissions.ts`, `src/supernote/fileSystem.ts`, `src/supernote/pdfNative.ts`
- `src/storage/pdfExport.ts`, `src/storage/archive.ts`, `src/storage/inboxMigration.ts`,
  `src/storage/closeOut/pdf.ts`, `src/storage/closeOut/execute.ts`, `src/storage/integrityCheck.ts`
  (+ `domain/integrityCheck.ts`: leftover temp/empty folders)
- `src/ui/status/*` (confirm type, O1), `src/ui/closeOut/ArchiveStep.tsx`, `PdfStep.tsx`
- `utils/logSink.ts` (switch off if no permission)
- Docs per §3.7, `docs/dev/inkhub-listing.md`, new public `docs/inkhub-review.md`
- Transparency gaps found by the §3.8 audit (list filled in during implementation)
- Tests: `__tests__/` for the confirmation lists (pure part in `domain/`), integrity-check items,
  pdfExport temp path

## 5. Test plan (device, demo space)

1. Clean install of the 0.3.0 candidate (uninstall first) → first start: Read prompt appears when
   folders are first loaded (no unclear error).
2. "Don't allow" on Read → clear message in the status slot, no crash; after allowing, everything loads.
3. Close-out with PDF: temp files **not** in `Note` (file manager), PDF created; "Create PDF" again →
   replace confirmation; "Keep" writes nothing.
4. Archive an Area into an existing Archive year folder with projects already in it → wizard announces
   the folder delete; Delete permission prompt; empty folder gone. Repeat with "Don't allow" →
   folder stays, message shown.
5. Debug logging on, write past 1 MB (or lower the limit in a test build) → two files, no
   delete error in logcat.
6. Calendar/Gmail switched off → no INTERNET prompt anywhere. Switched on + Load → prompt, then data.
7. Update install over 0.2.0 → settings kept, old `Note/.gtdpara_tmp` (if any) shows up in the Integrity Check.
8. Logcat: no "has no … permission" messages in normal flows.
9. Archive a project (folder move) and a close-out with results moved to Resources, **with DELETE
   not granted** → moves work (confirms §3.0); every move announced before and after (§3.8).
10. InkHub upload form on the device: description fits, thumbnails accepted, `.snplg` accepted.

## 6. Open points

- **O1** Does the status slot already support action buttons (Delete/Keep)? Check during
  implementation; if not, add a reusable confirm type.
- ~~O2~~ Decided: rename = WRITE (§3.0), verified in test step 9.
- ~~O3~~ Decided: form fields known (§3.6). Still open: maximum description length (unknown -
  the draft is kept short) and whether the description field supports paste.
- **O4** Version 0.3.0 or later - decided at release time.
- **O5** Remove the Inbox move code (0.2.0) in a later version → backlog.
