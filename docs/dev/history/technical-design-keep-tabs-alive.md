# Technical design: keep tabs alive ("E")

Status: IMPLEMENTED 2026-09-30 (E1-E3 in one delivery, not yet device-tested) - see §11 for as-built deviations. Requirements and risk inventory: `docs/dev/history/requirements-keep-tabs-alive.md`. Measurements: `technical-design-perf-tracing.md` §12-13, `technical-design-render-perf-ab.md` §7.

## 1. Why (latest data, perf-3, tracer v2)

On a tab switch the last JS commit now lands at ~1.0-1.4 s, but the final e-ink refresh only at ~3.0-3.8 s. The frame probe shows why: after the last commit there are 1-2 s without frames and without JS work (the Android side creating and laying out the freshly mounted screen), then a round of layout measurements, then the refresh. All of this is the cost of mounting the screen again. Keeping a visited screen mounted and only hiding it removes it for every revisit.

## 2. Decisions (Tilman, 2026-09-30)

| # | Decision |
|---|---|
| D1 | Kept alive: **Daily, Week, Month, Current, Projects, Areas**. Inbox, Review, Settings keep today's behavior (mounted only while visible). |
| D2 | Leaving a tab with an open Quick Add **edit**: save and close it, as today. |
| D3 | A half-typed **new** todo/meeting/note (draft) is kept when you come back. |
| D4 | New Settings switch **"Keep tabs in memory"**, default **ON** (changed from OFF, Tilman 2026-09-30); kept only as a safety net for the test phase, to be removed once stable (E5). OFF = exactly the previous behavior. |
| D5 | Moving 🔄 to Settings and F (reload only changed files on reopen) are separate, later work. |
| D6 (confirmed) | All other view state is kept too, like a browser tab: Week/Month offset, selected day panel, Daily's Today/Tomorrow tab and context filter, list page, Files-pane folder. Only edits (D2) and armed picks (§4.3) end when you leave. |

## 3. Architecture

### 3.1 Switch
- `GtdParaSettings.keepTabsAlive: boolean` (default `false`); Settings -> Folders tab, a button next to "Performance tracing", saved immediately (same pattern).
- `src/ui/keepAliveStore.ts`: module flag + subscribe (same shape as `refreshStore`). Set by `App.tsx` reorient after loading settings and by the Settings button. App subscribes, so switching takes effect without restart. Turning it OFF unmounts the kept screens (their normal unmount behavior runs, incl. Quick Add's save-on-unmount).

### 3.2 Rendering in App.tsx
- Switch OFF: the current conditional rendering, unchanged.
- Switch ON: for each kept tab, once visited, render `<KeptTab tab="daily" active={activeTab === 'daily'}>…screen…</KeptTab>`; non-kept tabs render conditionally as today, next to them.
- `ui/KeptTab.tsx` (React.memo): a `View` with `flex: 1` when active, `display: 'none'` when hidden, plus the `ScreenActivityContext` provider (§3.3). Emits `perfMark('tab:shown', {kept: true, firstVisit})`.
- **Hidden screens must not re-render when AppShell re-renders** (every tab tap re-renders AppShell): the screen elements are created in a `useMemo` keyed on their real inputs (stable callbacks, `currentItem`), so React sees the same element and skips them. All App callbacks passed to kept screens (`openInbox`, `openSettingsCalendar`, `onEnterFocusMode`, `handleArchived`, `openCloseOut`, …) get the same ref-based stable identity `openItem` already has.
- **Current**: `ItemDetail` gets `key={currentItem.path}` when kept, so opening a different item gives a fresh ItemDetail - identical to today, where arriving from another tab always meant a fresh mount.
- Capture mode and focus mode render outside the tab shell as today; entering them unmounts the tab shell (kept screens included) - same as today, no new states.

### 3.3 Screen activity context
`src/ui/screenActivity.ts`:
- `ScreenActivityContext` (boolean, **default `true`** - so every screen not wrapped in a KeptTab, and everything with the switch OFF, behaves as always-active; no code path changes there).
- `useScreenActive(): boolean`
- `useOnScreenHide(fn)`, `useOnScreenShow(fn)`: run `fn` on the transition only (never on mount/unmount).

### 3.4 🔄 button per tab
`refreshStore` keeps one handle + refreshing flag **per tab** and exposes the active tab's to TabBar. App passes each kept screen stable per-tab `onRegisterRefresh`/`onRefreshingChange` functions (created once). Non-kept screens register under their tab as today.

### 3.5 E-ink refresh on show
Showing a kept screen has no "loading finished" edge, so App calls `requestEinkRefresh()` in an effect after the commit that made a kept tab visible (only for kept, already-visited tabs; first visits keep today's load-edge refresh).

## 4. Behavior when leaving a tab (hide)

### 4.1 Quick Add edit (D2)
`QuickAddWidget` uses `useOnScreenHide`: if an edit is open, it runs the same save it runs on unmount today (only if something changed), then calls `onCancelEdit` to close it. If the save fails (e.g. invalid time, file changed on disk), the edit stays open and its error is shown when you return - nothing is lost. `Keyboard.dismiss()` on hide. Drafts are untouched (D3).

### 4.2 Status messages
`useStatus` (ui/status/StatusProvider.tsx) reads the activity context. When its screen becomes hidden, a screen-scoped message is withdrawn from the strip, and: if it has `onCancel` it is called (this is how every armed pick is published - Files-pane link/refile pick, Daily/Week/Month focus-panel arm - so they end exactly as they do today); otherwise, if it has `onDismiss` (errors), it is called, so the error clears as it does today on unmount. Global messages (`scope: 'global'`) are untouched. A message set while hidden is held back and shows when the screen is shown.

### 4.3 Armed picks
Covered by 4.2 (all arm states publish a status message with `onCancel`). Verified sources: `DailyFocusPanel`, `PeriodFocusPanel`, `FileBrowserPane` via ProjectDataPanel/ItemDetail.

## 5. Behavior when coming back (show)

### 5.1 Project/Area data (shared cache)
`useCachedItems` and `useAbbrevItems` read the activity context: while hidden they do not re-render on cache changes; on show they compare the cache version and re-render once if anything changed. This removes the cost of hidden screens re-rendering while you work on another tab.

### 5.2 Inbox file and settings (per-screen copies)
Daily and Week/Month (`usePlanningScreen`) get a **quiet reload** on show: read settings + Inbox.txt without setting `loading` (no spinner, no content unmount); `setInbox`/`setSettings` only if the file text / settings JSON actually differ. ~50-100 ms, normally no re-render.

### 5.3 Current tab
`ProjectDataPanel`, `ItemStatusPanel` and `ItemDetail` hold a local copy derived from the cache at load. On show, if the cache version changed since hide, they re-derive **quietly** (a new `quiet` flag on their existing load/re-derive path - no `loading` toggle).

### 5.4 Measurements while hidden
`useMeasuredHeight` ignores `0` heights (a hidden `display: 'none'` view reports 0). The last real height is kept, so a shown screen paginates correctly at once. (0 is never a meaningful list viewport, so this is safe with the switch OFF too.)

### 5.5 Date rollover
The context change on show re-renders the screen once; Daily/Week/Month compute "today" per render and their memoized aggregates depend on the date string, so a tab kept overnight shows the new day on return.

## 6. What is NOT changed
No data file format, no storage path, no domain logic. The only persisted addition is one settings key, which older builds ignore - every rollback is data-safe.

## 7. Implementation plan (each step = its own commit, deliverable and revertable)

| Step | Content | Device test |
|---|---|---|
| E0 | Rollback preparation on your side (§8) | - |
| E1 | Switch + store + Settings button; `screenActivity`; `KeptTab`; App rendering (ON path) with memoized screen elements and stable callbacks; per-tab `refreshStore`; e-ink on show; `useMeasuredHeight` 0-guard; perf mark | Switch OFF: everything as before. Switch ON: tabs show instantly on revisit (data may be stale until E3) |
| E2 | Leaving a tab: Quick Add save-and-close on hide, Keyboard dismiss; status withdraw/cancel/dismiss on hide | Edit open -> switch -> saved & closed; armed pick -> switch -> cancelled; error -> switch -> gone |
| E3 | Coming back: pause/catch-up of cache subscriptions; quiet Inbox/settings reload; quiet re-derive on Current | Add in one tab, see it in the other; change settings, see it |
| E4 | Re-measure (switch OFF vs ON, same build), full checklist (§9); decide whether ON becomes the default | Trace round |

Switch ON is only meant for real use after E3. E1 and E2 are safe to install with the switch OFF.

Verification before each delivery: `tsc` (no new errors); the Jest smoke test extended to run the whole scenario twice (switch OFF and ON), plus new scenarios: edit open -> switch -> saved and closed; Inbox add on Week -> visible on Daily; hidden screen not re-rendering on a cache change; 🔄 refreshes the visible tab only; opening a different item on Current gives a fresh screen.

## 8. Rollback preparation (your side, before E1)

I can't run git from here, so these are the steps in PowerShell in `C:\Users\tilma\AndroidStudioProjects\gtdpara`:

1. **See what's uncommitted**: `git status` and `git branch --show-current` (note the branch name - below called `main`).
2. **Keep logs and perf data out of git** (they are large: repro logs ~40 MB). Add to `.gitignore` if not there yet:
   ```
   crash-log.txt
   newlog.txt
   gtdpara_*log*.txt
   perf/
   perf-*/
   Claude outputs/
   ```
3. **Checkpoint the current, tested state**:
   `git add -A` -> check `git status` once more -> `git commit -m "Perf round 1: tracing, render optimizations, tracer v2"` -> `git tag perf-before-keepalive`
4. **Work on a branch**: `git switch -c keep-tabs-alive`. Your `main` stays at the checkpoint.
5. **Keep a known-good plugin file**: build the checkpoint once more (`buildPlugin.ps1`), then copy the `.snplg` file from `build\outputs\` to a folder outside `build\` (the build cleans it), e.g. `known-good\gtdpara-before-keepalive.snplg`. Reinstalling this needs no build at all.
6. **After each step I deliver**: `git status` (should list exactly the files I name - also a guard against the occasional silent revert), then `git add -A` and `git commit -m "E1: …"`. One commit per step.

Rollback levels, from lightest to heaviest:

| Level | When | How | Rebuild? |
|---|---|---|---|
| L0 | Something odd with keep-alive in daily use | Settings -> "Keep tabs in memory" OFF | No |
| L1 | One step is bad | `git revert <hash of that step>` | Yes |
| L2 | Abandon E entirely | `git switch main` (branch stays for later) | Yes |
| L3 | Need a working plugin right now | Install `known-good\gtdpara-before-keepalive.snplg` | No |

Because E changes no data formats (§6), none of these levels can leave your Projects/Areas/Inbox files in a state an older build can't read.

## 9. Device checklist (E4)
Switch OFF: quick pass over all tabs - identical to before. Switch ON: revisit speed on Daily/Week/Month/Current/Projects/Areas; first visit unchanged; 🔄 per tab; Quick Add edit -> switch -> saved & closed; draft kept; armed focus/file pick -> switch -> cancelled; error message -> switch -> gone; add in Week/Inbox -> visible on Daily; status/focus change on Current -> visible on Projects/Daily; open another project -> Current shows it fresh; Settings change (e.g. focus counts) -> visible on Daily/Week; reopen from a note (resume and non-resume); lasso capture and focus mode in and out; leave plugin open overnight -> "today" correct; switch OFF at runtime -> app keeps working.

## 10. Risks that remain
- **Memory**: six screens and their native views stay alive. Not measurable from JS; watch for slowdowns or the host killing the plugin. L0 is the answer.
- **Unknown host behavior with hidden views** (e.g. the e-ink refresh of a region that changes from hidden to visible). E1's device test is where this shows; L0 again.
- **Something that depends on "unmount" I didn't find**: the inventory (requirements doc §2) came from reading the code; the checklist exercises each item on the device.
- React 19.2's `<Activity>` would provide much of this natively (hidden trees without effects/updates), but the plugin host ships React 19.0 - not an option now.

## 11. As-built (2026-09-30)

Deviations from §3-§7:

- **E1-E3 delivered together**: with the switch defaulting to ON (D4), shipping E1 alone would have meant stale Inbox/settings in real use. One delivery, one commit; L0 (switch off) remains the fine-grained fallback.
- **Activity is a store, not a boolean context** (`ui/screenActivity.ts`: `isActive()` + `subscribe()`, one store per `KeptTab`). A boolean context would re-render every consuming screen on hide and show - the hidden screen would re-render at the very moment of the switch. Now hiding re-renders nothing; showing re-renders only where data (cache version, Inbox text, settings, date) changed.
- **Date rollover**: Daily and `usePlanningScreen` keep a "shown day" state set on show (same value = no re-render), instead of relying on a context re-render.
- **ItemsList** (Projects/Areas) holds a snapshot of the cache object from mount; it refreshes that snapshot on show when the cache version moved (added to the inventory - not in the requirements doc).
- **OFF path in App.tsx** keeps the previous JSX verbatim (only the 🔄 plumbing moved to per-tab handlers), so switching OFF really is the old behavior. The ON path renders `KeptTab`s for visited kept tabs plus the non-kept tabs (Inbox/Review/Settings) as before.

Files: new `ui/screenActivity.ts`, `ui/KeptTab.tsx`, `ui/keepAliveStore.ts`; changed `App.tsx`, `domain/settings.ts` (`keepTabsAlive`, default true), `screens/Settings.tsx` (switch), `ui/refreshStore.ts` (per tab), `ui/status/StatusProvider.tsx` (withdraw/cancel/dismiss on hide, re-publish on show), `ui/QuickAddWidget.tsx` (save & close edit + keyboard dismiss on hide), `ui/useCachedItems.ts` + `ui/useAbbrevItems.ts` (paused while hidden, catch-up on show), `ui/useMeasuredHeight.ts` (ignore 0), `screens/DailyView.tsx` + `screens/usePlanningScreen.ts` (quiet Inbox/settings reload + date check on show), `screens/ProjectDataPanel.tsx`, `ui/ItemStatusPanel.tsx`, `screens/ItemDetail.tsx` (quiet re-derive on show), `screens/ItemsList.tsx` (snapshot refresh on show).

Verification: `tsc` - no new errors. Jest smoke tests (fake file module, test renderer): (a) switch OFF - the full previous scenario (all tabs, open project, refresh, Quick Add on Daily and Current, abbreviation quick-file); (b) switch ON - a half-typed draft survives a tab switch (Daily stayed mounted), only the active screen is visible, a cache write while Daily is hidden shows up when Daily is shown, an open edit on Current is saved and closed when leaving the tab, a changed Inbox.txt appears on Week when shown, opening another project gives Current that project, 🔄 works on the visible tab, and switching OFF at runtime keeps the app working. No React errors in either.
