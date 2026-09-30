# Privacy and data

gtdpara is a local plugin. There is no account, no server and no telemetry.

## What it reads and writes

- **Your PARA folders** (by default `Note/1 Projects`, `2 Areas`, `3 Resources`, `4 Archive` and
  the Inbox file). Todos and meetings are stored as plain text in files inside those
  folders, so you can read and edit them without gtdpara.
- **Notes it creates for you** (linked notes, meeting notes, standalone notes), in the same folders.
- **Plugin settings**, stored in the plugin's own storage on the device (Android AsyncStorage).

Permissions requested: file read, file write, internet.

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
lines are kept in memory while the plugin runs. Nothing is uploaded.

- **Debug logging** (Settings → About, off by default) also writes these lines to
  `EXPORT/gtdpara/debug/gtdpara-log.txt` (at most two files of about 1 MB each).
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
