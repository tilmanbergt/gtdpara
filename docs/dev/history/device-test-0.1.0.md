# Device test checklist before 0.1.0

For the About / debug tools / Experimental switches work
(`technical-design-about-debug-experimental.md`) plus a short smoke of the main screens.
Tick what works, note what doesn't (with a photo or the debug bundle).

## Build and install
- [ ] `npm run gen`, then `./buildPlugin.ps1` builds without errors (it compiles the changed Kotlin).
- [ ] Install over the current build. If "old version still loaded" appears: Restart.
- [ ] All settings still there (folders, focus counts, Tag Rules, calendar link, Gmail).

## Experimental switches (Settings → Advanced)
- [ ] After the update, Google Calendar is **ON** if you had an ICS link, Gmail **ON** if you had
      a Gmail address (P2). Otherwise OFF.
- [ ] Google Calendar OFF: no Google tab in Daily (Today | Tomorrow only), Week (left tabs and day
      panel), Month (left tabs and day panel), Inbox, a Project's Current tab, Review → Week ahead;
      no Calendar tab in Settings.
- [ ] Google Calendar ON again: all of them are back, the ICS link is still there, events load.
- [ ] Switch while Daily/Week/Month are kept in memory: the change shows without reopening the plugin.
- [ ] Gmail OFF: the Review overview has no Gmail step, "Step n of m" counts one less, Back/Skip
      jump over it, the Review badge ignores it; no Gmail tab in Settings.
- [ ] Gmail ON again: step back, credentials kept, inbox loads.
- [ ] Integrity Check, Keep tabs in memory and Performance tracing work as before (now on Advanced).
- [ ] Folders tab shows only the folder fields; Save / Reset to defaults are not shown on Advanced/About.

## About
- [ ] Shows `gtdpara 0.0.1`, build number, date, commit and "development build".
- [ ] Device line shows the model and a firmware-like string (note what it shows: ________).
- [ ] What's new: "Unreleased" notes render (headings, bullets, **bold**), page with ‹ › and no scrolling.

## Debug logging and bundle
- [ ] Debug logging ON → after a few seconds `EXPORT/gtdpara/debug/gtdpara-log.txt` exists and
      starts with the `=== gtdpara … session …` line followed by the startup lines.
- [ ] Keeps growing while you use the app; switching OFF stops it.
- [ ] Setting survives a plugin restart (ON → file continues after reopening).
- [ ] Export debug bundle → status line shows the file name; file exists.
- [ ] Bundle contents: version, device, settings summary, data counts, recent errors, log.
      **No** Gmail password, ICS link or e-mail address anywhere (search for "@" and "ical").

## Profiles and demo space (Settings → Advanced)
- [ ] Opening Advanced creates `EXPORT/gtdpara/profiles/production.json` (check it has your folders and
      Tag Rules but no calendar link and no Gmail password).
- [ ] "Create demo space" → status line reports the files; `Note/gtdpara-demo` exists with
      5 projects, 3 areas and `Inbox.txt`; profile "Demo" appears in the list.
- [ ] Tap it again → "demo files already there", nothing overwritten.
- [ ] Switch to Demo (confirm in the status line) → app reloads, lands on Daily with demo data only;
      `DEMO` marker in the tab bar; tapping it opens Advanced.
- [ ] Demo: Daily/Week/Month/Review look plausible (todos due today/overdue, meetings this week,
      a 2-day offsite in the month, one on-hold and one done project in Review).
- [ ] Demo: Quick Add writes into `Note/gtdpara-demo`; recent tags are the demo ones; Calendar and
      Gmail are off.
- [ ] Change a Tag Rule in Demo → switch back to Production → your own Tag Rules, folders, calendar
      link, Gmail login and experimental switches are exactly as before; no marker.
- [ ] Switch to Demo again → the changed Tag Rule is still there.
- [ ] Debug logging / Keep tabs / Performance tracing stay the same across switches.

## What's-new notice (needs a release build, i.e. after the fresh start + `release.ps1 -Version 0.1.0`)
- [ ] First start of 0.1.0: "Updated to gtdpara 0.1.0." with What's new and ✕ (after any stale-build Restart).
- [ ] Closing the plugin without tapping either → the notice shows again on the next start.
- [ ] What's new → opens Settings → About; notice gone for good. (Or ✕ → gone for good.)

## Smoke of the main screens
- [ ] Daily, Week, Month, Current, Projects, Areas, Inbox, Review open and look normal.
- [ ] Quick Add: add, edit, delete a todo; add a meeting.
