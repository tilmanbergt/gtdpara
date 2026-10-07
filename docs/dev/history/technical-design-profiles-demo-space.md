# Technical design: profiles and demo space

Status: **implemented 2026-09-30** (approved; file location changed, see §1.6). Not yet device-tested
(checklist: `device-test-0.1.0.md`, section Profiles).

## 1. Requirements (decided in chat, 2026-09-30)

1. **Profiles, stored as files.** Named configurations (e.g. "Production", "Demo") are JSON files
   the user can see, copy and share. One is active at a time; switching is a tap in
   Settings → Advanced. Export/Import come from the files themselves.
2. **What switches with a profile:** folders and focus counts, Tag Rules (incl. static texts),
   review state (per-step dates and stats) and focus mode, Google Calendar and Gmail
   configuration, and the Experimental switches.
3. **Device-wide (never switch):** Keep tabs in memory, Performance tracing, Debug logging,
   the What's-new marker (`lastSeenVersion`), and which profile is active.
4. **Safety:** while a profile other than the default is active, a small permanent marker with the
   profile name is shown in the TabBar.
5. **Timing:** before 0.1.0, so the demo space is ready for the device test pass and screenshots.
6. **Location (Tilman):** everything gtdpara exports goes under the device's `EXPORT` folder, not under
   `Note`, so it doesn't fill the space used for working material: `EXPORT/gtdpara/profiles` and, as a
   sister folder, `EXPORT/gtdpara/debug` (logs, debug bundles, integrity reports, perf traces - moved
   from `Note/_gtdpara_debug_log`). The demo space itself stays under `Note/gtdpara-demo`, because it is
   working material like any PARA folder.

## 2. Current state (checked)

- Settings: one JSON blob in AsyncStorage `gtdpara:settings:v1` (`storage/settingsStorage.ts`),
  with migrations on load.
- Other persisted state per install: `gtdpara:googleCalendarCache:v1` (calendar events of the
  configured ICS link) and `gtdpara:tagUsage:v1` (recently used tags, for Quick Add suggestions).
  Both belong to a data set, so both must switch with the profile.
- In-memory state tied to a data set: `storage/dataCache.ts` (all Projects/Areas),
  `gmailInboxCache`, `googleCalendarCache`, `returnRecord`, plus the React state of kept-alive tabs.
- Focus and goals live in the project/area files themselves, so they follow the folders automatically.

## 3. Design

### 3.1 Files

```
EXPORT/gtdpara/profiles/
  production.json
  demo.json
```

```json
{
  "format": "gtdpara-profile",
  "formatVersion": 1,
  "name": "Demo",
  "savedAt": "2026-10-02T09:14:00Z",
  "savedBy": "0.1.0",
  "settings": { "baseRoot": "/storage/emulated/0/Note/gtdpara-demo", "projectsFolder": "1 Projects", "...": "..." }
}
```

- The profile **id** is the file name without `.json` (lowercase, `a-z0-9-`); the display name is
  `name`. `production` is the default profile.
- `settings` holds only the per-profile fields (§1.2), **without secrets**: the Gmail app password
  and the Google Calendar ICS link never go into a file. They are kept per profile in AsyncStorage
  (`gtdpara:profileSecrets:v1` = `{[profileId]: {gmailAppPassword, googleCalendarIcsUrl}}`).
  The Gmail address stays in the file (not a secret, needed to show "configured").
- Import = put a `.json` file into the folder (USB, Supernote Cloud) and tap Refresh in the profile
  list. Export = the file is already there. Unknown keys are ignored, missing ones fall back to
  defaults, so hand-edited or older files still load.

### 3.2 Active settings stay where they are

The app keeps reading and writing the active settings in AsyncStorage exactly as today (no change
for any screen). Profile files are **snapshots**:

- **Switch A → B**:
  1. write A: current settings (per-profile part) → `A.json`, secrets → secrets map;
  2. read `B.json` (+ B's secrets) and build the new active settings =
     `DEFAULT_SETTINGS` + B's per-profile fields + current device-wide fields + `activeProfileId = B`;
     run the normal settings migrations on it; save;
  3. switch the per-profile AsyncStorage keys (3.3);
  4. reset the in-memory state (3.4).
- **Save** (button "Save to profile file"): step 1 only - useful before copying a profile to
  another device or into the repo.
- **First use**: if no `production.json` exists when the Profiles section is opened, it is written
  from the current settings once, so the user's real setup is safely on file before any switch.

A device-wide `activeProfileId` field (default `'production'`) is added to `GtdParaSettings`.

### 3.3 Per-profile AsyncStorage keys

`tagUsage` and `googleCalendarCache` get the profile id appended to their key
(`gtdpara:tagUsage:v1:demo`). For `production` the old key without suffix is used, so nothing
has to be migrated. A tiny `storage/profileKeys.ts` provides `profileKey(base)` from the active id.

### 3.4 Clean switch

After the switch the app must not show or write anything from the old data set:

- clear `dataCache`, the Gmail and Google Calendar in-memory caches, the return record;
- **remount the whole tab shell** (a `key={profileEpoch}` on the part of `App.tsx` below the status
  provider), which drops every kept-alive tab and its drafts; then the normal start path runs
  (load settings → rebuild cache → land on Daily);
- an open Quick Add edit is saved first, same as when leaving a tab today.

Fallback if something turns out to survive the remount on the device: the existing controlled
host restart (`restartPluginHost`), which guarantees a clean process. Decided during implementation.

### 3.5 Demo space, generated by the app

"Create demo space" (Settings → Advanced → Profiles) writes, if they don't exist yet:

- `Note/gtdpara-demo/` with `1 Projects`, `2 Areas`, `3 Resources`, `4 Archive` and `Inbox.txt`;
- 3-4 fictional projects and 3 areas with todos (next, waiting-for, someday, due dates, context tags
  with fictional people), meetings (one recurring, past and upcoming, prep/review tracking),
  scope texts, abbreviations, focus and weekly/monthly goals, dates relative to today so the demo
  always looks current;
- `EXPORT/gtdpara/profiles/demo.json` pointing at it, with two Tag Rules and both Experimental
  switches off.

The content lives in one TypeScript module (`storage/demoSpace.ts`, text templates only, no .note
files), versioned with the code. It never overwrites existing files. The same generator is used
for screenshots, for reproducing bug reports, and by other testers.

### 3.6 UI

Settings → Advanced gets a **Profiles** section at the top:

```
Profiles                                  active: Demo
  ● Demo          saved 2026-10-02        [Save]
  ○ Production    saved 2026-10-01        [Switch]
  [Create demo space]   [Refresh list]
  Profile files: EXPORT/gtdpara/profiles - copy .json files there to import.
```

- Switching asks once in the status slot ("Switch to Production? Unsaved drafts in open tabs are
  kept only if saved.") with a confirm button.
- **TabBar marker:** while `activeProfileId !== 'production'`, the profile name (e.g. `DEMO`) is
  shown in the TabBar as a small bordered label, left of the close button.
- The debug bundle gains one line: `profile: demo (2 profiles on file)`.

### 3.7 Files

New: `domain/profiles.ts` (pure: split settings into per-profile / device-wide / secret parts,
build active settings, parse + validate a profile file, id rules), `storage/profiles.ts` (list,
read, write, switch), `storage/profileKeys.ts`, `storage/demoSpace.ts`, `ui/ProfileMarker.tsx`,
tests in `__tests__/domain/profiles.test.ts`.
Changed: `domain/settings.ts` (`activeProfileId`), `storage/tagUsage.ts`,
`storage/googleCalendarCache.ts`, `screens/settings/AdvancedTab.tsx`, `screens/Settings.tsx`,
`ui/TabBar.tsx`, `App.tsx` (profileEpoch remount), `storage/debugBundle.ts`, CHANGELOG, user docs.

## 4. Test plan

- Unit: splitting/merging (device-wide fields never change on switch; secrets never in the file;
  unknown keys ignored; missing keys default), id rules, demo generator output parses with the
  real project-file parser.
- Device: create demo space → switch to Demo → marker shows, Daily shows demo data only, Quick Add
  writes into the demo folders → edit a Tag Rule → switch back to Production → everything as before,
  Tag Rule change only in Demo, recent tags and calendar cache separate → switch again → demo edits kept.

## 5. Open points

1. Remount vs. host restart for a clean switch (§3.4) - start with remount.
2. Should switching also be possible from the TabBar marker (tap → Advanced)? Proposed: yes, tap
   opens Settings → Advanced.

## 6. As built (2026-09-30)

- Folders: `supernote/fileSystem.ts` `GTDPARA_EXPORT_ROOT = /storage/emulated/0/EXPORT/gtdpara`,
  `DEBUG_LOG_FOLDER = …/debug`, `PROFILES_FOLDER_PATH = …/profiles`, `displayPath()` for UI text.
  The old `Note/_gtdpara_debug_log` folder is no longer written to and can be deleted by hand.
- `domain/profiles.ts`: key classification (`PROFILE_KEYS` / `DEVICE_WIDE_KEYS` / `SECRET_KEYS`,
  a test checks every setting is in exactly one), `sanitizeProfileSettings` (only known per-profile
  keys with the right value kind), `buildActiveSettings`, `serializeProfile` / `parseProfile`
  (rejects other JSON and newer format versions), `profileIdFromName`.
- `storage/profiles.ts`: `listProfiles`, `writeProfile`, `saveActiveProfile`,
  `ensureDefaultProfileFile` (runs when the Profiles section opens), `switchProfile`
  (save current → build target → store → reload through the normal migrations).
  Secrets: AsyncStorage `gtdpara:profileSecrets:v1`.
- `storage/profileKeys.ts`: active id + `profileScopedKey()`; `tagUsage` and `googleCalendarCache`
  use it and reset their in-memory copy on a change (calendar re-hydrates the new profile's cache).
- `domain/demoSpace.ts` (content, pure, tested against the real project-file parser) +
  `storage/demoSpace.ts` (writes missing files only, adds `demo.json` if absent). Content: 5 projects
  (one on hold, one done), 3 areas, Inbox; next/waiting-for/someday/maybe, due today/soon/overdue,
  weekly series as individual meeting lines (the file format has no recurrence), a 2-day
  monthly highlight, `#1on1` meetings tracked by a second Tag Rule, weekly and monthly goals.
- UI: `screens/settings/ProfilesSection.tsx` at the top of Advanced; switch confirm in the status slot;
  TabBar `profileLabel` (the profile id in capitals) → tap opens Settings → Advanced.
- Clean switch: `App.tsx` `AppRoot` holds an `epoch` key on `AppShell`; `switchToProfile` clears the
  data, Gmail and return-record caches, sets the active profile id and features, then bumps the key.
  Host restart was not needed as a fallback so far (to be confirmed on the device).
- Debug bundle: `settings: profile <id> · …`.
- Also fixed on the way: CHANGELOG no longer claims meeting recurrence (not supported by the file format).

Verified off-device: tsc (no new errors), 36 Jest tests (incl. profiles and demo space), smoke renders
of App/Settings (About, Advanced with Profiles), and an end-to-end switch test against an in-memory
file system: production file without secrets, demo creation idempotent, Production → Demo → Production
→ Demo keeps each side's folders, Tag Rules, secrets and edits, device-wide fields untouched.
