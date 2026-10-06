# Requirements draft: keep tabs alive ("E") - risks and rollback

Status: decisions taken 2026-09-30 (see `technical-design-keep-tabs-alive.md` §2 - scope widened to also keep Projects and Areas); nothing implemented yet. Context: `technical-design-render-perf-ab.md` §7 (after round 1, the remaining time per tab switch is dominated by the Android side creating and laying out the whole screen again).

## 1. Idea

Today `App.tsx` unmounts the old tab's screen and mounts the new one on every switch (`activeTab === 'daily' && <DailyView/>`). E keeps a visited screen mounted and only hides it (`display: 'none'`), so returning to it needs no rebuild of JS state and no re-creation of native views.

Expected gain: a revisit becomes a show/hide plus one e-ink refresh instead of a full mount (today ~3-4 s to the final refresh). The first visit of a tab per session stays as it is.

## 2. What in the app relies on "switching tabs unmounts the screen" today

Found in the code (every item is a behavior that silently changes under E and must be handled explicitly):

| # | Behavior today | Where | What happens under E if not handled |
|---|---|---|---|
| 1 | The 🔄 button refreshes "the active screen": each screen registers on mount, unregisters on unmount | `ui/refreshStore.ts`, every screen | All kept screens register; 🔄 would refresh whichever registered last, not the visible one |
| 2 | A Quick Add edit is saved when you leave the tab (widget unmount) | `QuickAddWidget` unmount effect, `ui/useEditFlush.ts` | An open edit stays open in the hidden tab; unsaved changes are not saved on leaving |
| 3 | Arming (Files-pane link/refile pick, Daily/Week/Month focus-panel arm) is cancelled by leaving the tab | `DailyFocusPanel` doc comment, `FileBrowserPane`, `PeriodFocusPanel` | An armed pick stays armed in a hidden tab, and its status-bar message ("pick a …") may stay visible on other tabs |
| 4 | Screen-scoped status messages clear on tab switch | `ui/status/StatusProvider.tsx` (clears on unmount) | Errors/hints from a hidden tab stay in the status strip |
| 5 | Each screen loads Settings and the **Inbox file** once, on mount | DailyView, `usePlanningScreen`, ItemDetail, ProjectDataPanel, InboxScreen | Hidden screens keep an old Inbox copy / old settings: e.g. add a meeting to Inbox on Week, go back to Daily -> not shown until a manual refresh. Project/Area data is NOT affected (shared cache, already live) |
| 6 | Content change -> e-ink refresh via "loading finished" | `useEinkRefreshOnLoad` | Showing a kept screen has no loading edge -> the e-ink panel may not redraw (the old "content only appears after swiping the top menu" bug class) |
| 7 | Self-measured lists (PagedSection) measure on mount | `ui/PagedSection.tsx`, `useMeasuredHeight` | Hidden views report height 0 -> a list may paginate to 1 row, then correct itself when shown (extra pass, possible flicker) |
| 8 | Only one screen reacts to data changes | `useCachedItems` subscribers | Every kept screen re-renders on each cache change (e.g. adding a todo on Current re-renders hidden Daily/Week/Month) - costs time on the visible tab |
| 9 | Settings opens on the sub-tab passed at mount (e.g. Calendar from a Google link) | `Settings` `initialTab` | A kept Settings screen would ignore the requested sub-tab |
| 10 | "Current" shows the item that was opened | `ItemDetail` props | Must switch item when another is opened (props change) - OK, but its per-item UI state (Files pane folder, open edit) must reset like today |
| 11 | Time-based content ("today") recalculated on mount | Daily/Week/Month | A tab kept overnight shows yesterday until something re-renders it |
| 12 | Memory: only one screen's state + native views exist | all | 4+ screens and their native views stay in memory; ReviewScreen (200 KB source) is the largest |
| 13 | Lasso capture / focus mode / "resume" landing assume the tab shell's current state | `App.tsx` reorient | Need to verify they still land and refresh correctly with hidden screens around |

## 3. Proposed scope to keep the risk small

- **Only the four most-used tabs are kept alive**: Daily, Week, Month, Current. Projects, Areas, Inbox, Review, Settings keep today's behavior (mounted only while visible). This avoids #9 and most of #12.
- **Lazy**: a tab is mounted on its first visit, then kept.
- **Explicit "tab became visible / hidden" signal** to each kept screen (context or prop `active`), used for: 🔄 registration (#1), save-and-close of an open Quick Add edit and cancelling arm states on hide (#2, #3 - same user-visible behavior as today), clearing screen-scoped status messages (#4), refreshing Inbox/settings on show (#5, cheap - ~50-100 ms), requesting one e-ink refresh on show (#6), ignoring 0-height measurements while hidden (#7), re-reading "today" on show (#11).
- **Hidden screens don't re-render on cache changes** while hidden; they catch up once on show (#8).

## 4. Rollback and safety

1. **Git checkpoint before starting** (your side, since I can't run git from here): commit the current state and tag it, e.g. `git commit -am "perf round 1 + tracer v2"` and `git tag perf-before-keepalive`. Also keep a copy of the current working `.snplg` from the build output as a known-good install.
2. **Settings switch "Keep tabs in memory"** (default OFF in the first build). When OFF, `App.tsx` renders exactly as today (conditional mount), so every E code path is dormant. Turning it ON/OFF needs no rebuild - the instant rollback if anything behaves oddly in daily use.
3. **Small, separate steps**, each committed and device-tested on its own: (E1) the App-level keep-alive behind the switch + visibility signal + 🔄/e-ink/status handling; (E2) edit/arm save-and-cancel on hide; (E3) Inbox/settings refresh on show; (E4) pause re-renders while hidden. Each step can be reverted alone.
4. **Automated check** before every commit: the Jest smoke test (renders the app, switches tabs, adds todos, refreshes) run with the switch OFF and ON.
5. **Device checklist** per step, plus a perf trace comparison with the switch OFF vs ON on the same build.
6. Removing E later = deleting the switch branch in App.tsx and the visibility hooks; the screens keep working unmounted as today.

## 5. Open questions (for Tilman)

1. Keep only Daily, Week, Month, Current alive (recommended), or all tabs?
2. Leaving a tab with an open Quick Add edit: keep today's behavior (save and close the edit), or keep the edit open when you come back?
3. Same for a half-typed new todo/meeting (a draft, not an edit): today it is lost on tab switch - keep it (natural with E) or clear it as today?
4. Settings switch for rollback, default OFF for the first test build - OK?
5. Include "move 🔄 to Settings" and F (reload only changed files on reopen) in this round, or separately after E?
