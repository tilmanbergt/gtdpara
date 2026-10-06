# Privacy and data

gtdpara is a local plugin. There is no account, no server and no telemetry.

## What it reads and writes

- **Your PARA folders** (by default `Note/1 Projects`, `2 Areas`, `3 Resources`, `4 Archive` and
  the Inbox folder `2 Areas/0 Inbox`). Todos and meetings are stored as plain text in files inside those
  folders, so you can read and edit them without gtdpara.
- **Notes it creates for you** (linked notes, meeting notes, standalone notes), in the same folders.
- **Plugin settings**, stored in the plugin's own storage on the device (Android AsyncStorage).
- **Lasso marks** ("Mark for later"): a picture and the handwriting strokes of each marked
  selection, plus the text once it is recognized, in the plugin's own private folder on the device -
  not in your folders. They are deleted when the mark is processed or discarded. Recognition runs
  on the device.
- **Temporary files** while a close-out PDF is made (page images and the unfinished PDF), in the
  plugin's own private folder on the device - not in your folders. They are removed when the PDF
  is done, and on the next start if gtdpara was interrupted.

## Permissions

Each permission is requested right before the first action that needs it:

- **File read / file write**: your PARA folders and `EXPORT/gtdpara`.
- **File delete**: only after you confirmed a delete that names what is deleted - in practice the
  empty folder left behind when an area is archived into an Archive folder that already exists.
  gtdpara never deletes notes or files.
- **Internet**: only for the two optional integrations below.

## Changes to your files

gtdpara tells you whenever it changes files: your own edits are saved where you made them; new
notes, PDFs and exports are named with their folder when they are created; moves, overwrites and
deletes are shown before they happen and confirmed afterwards. The one automatic change is the
one-time Inbox move in 0.2.0 (for users of earlier builds), which is announced when it happens.

**Mark for later** adds a small bookmark icon to the note it marks; processing the mark turns it
into a check mark, discarding it removes the icon. gtdpara changes only its own icons, never your
handwriting. In a PDF, or where an icon can't be identified safely, it is left as it is.

## Network access

gtdpara only goes online for the two optional integrations, and only when you tap Load/Refresh:

| Integration | Connects to | What is sent |
|---|---|---|
| Google Calendar | the private ICS link you entered | a normal HTTPS download of your calendar file |
| Gmail | `imap.gmail.com` (or the IMAP host you set) | your email address and app password, to read your inbox and archive messages you choose |

If neither is configured, gtdpara makes no network connections.

## Credentials

The Google Calendar ICS link and the Gmail app password are stored **unencrypted** in the plugin
settings on your device. Anyone with access to the unlocked device (or a device backup) could
read them. Use a Gmail **app password** (never your main password); you can revoke it at any
time in your Google account. The ICS link can be reset in Google Calendar settings.

## Logs and debug info

Diagnostic output goes to the Android system log (`logcat`) on your device, and the last ~1000
lines are kept in memory while the plugin runs. Nothing is uploaded, and nothing is written to a
file unless you switch it on.

- **Debug logging** (Settings → About, off by default) also writes these lines to
  `EXPORT/gtdpara/debug/gtdpara-log.txt`. When it reaches about 1 MB its content is copied over
  `gtdpara-log.1.txt` and it starts again, so there are at most two files.
- **Run Integrity Check** (Settings → Advanced) saves its report there too.
- **Export debug bundle** (Settings → About) saves one text file to the same folder: version,
  device, a settings summary without names, counts, and the recent log. The Gmail app password,
  calendar links and e-mail addresses are removed from it. File paths stay in it, because they
  are needed for debugging, and they can contain your project names.
- Optional performance tracing (Settings → Advanced, off by default) writes timing files there too.

## Profiles

Profiles (Settings → Advanced) are saved as JSON files in `EXPORT/gtdpara/profiles`. They contain
your folder names, focus counts, Tag Rules, review dates, experimental switches and your Gmail
address, but never the Gmail app password or the calendar link - those stay inside the plugin.

Please look through these files before attaching them to a bug report.
