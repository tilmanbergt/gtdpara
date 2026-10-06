# Technical design: fewer and cheaper renders on tab switches (perf round 1, "A + B")

Status: IMPLEMENTED 2026-09-30 (not yet device-tested). Baseline and measurement method: `docs/dev/history/technical-design-perf-tracing.md` §12.

## 1. Goal and scope

Cut the JS render work of a tab switch to Daily, Week, Month and Current, which the baseline shows is the dominant cost (data loading is ~0.1-0.2 s, the last JS commit lands at 2.3-3.4 s).

- **A** - make QuickAddWidget re-render less often (it costs ~150-380 ms per render and renders 5-7 times per switch).
- **B** - stop the needless re-render cascades around it (app shell, screen load, heavy panels).

Out of scope for this round (decided 2026-09-30): remembering PagedSection heights (C - largely covered by E later), keeping tabs mounted (E), reload-only-on-change on reopen (F), e-ink flush timing (D), and rendering QuickAddWidget's hidden Meeting/Note forms lazily (would reintroduce the 2026-09-09 tab-switch flicker the always-mounted forms fix; revisit only if the re-measure still shows QuickAddWidget's first render as the bottleneck).

No visible behavior change is intended anywhere.

## 2. Why things re-render today (from the traces)

| Trigger | Effect |
|---|---|
| Screen registers its refresh handle / loading flag (`onRegisterRefresh`, `onRefreshingChange` -> `setState` in AppShell) | AppShell re-renders -> TabBar + the whole screen + all panels render again (~300 ms), 2x per switch |
| Screen `load()`: `setSettings` after the first await, then Inbox + paths + loading after the second | 2 separate render rounds of the full screen |
| Parent screen re-renders for any reason | QuickAddWidget, DailyFocusPanel, PeriodFocusPanel render again - nothing is memoized, and every callback prop is a new function each render |
| QuickAddWidget mount: `getRecentTags()` resolves -> `setRecentTags` | 1 extra QuickAddWidget render (~170 ms) |
| QuickAddWidget tag-row width measurement (`useTagRowBudget`: row + lead measured separately) | 1-2 extra QuickAddWidget renders, each also re-requesting the e-ink refresh |
| Aggregates (`buildDailyAggregate`, `buildWeeklyAggregate`, `buildMonthlyAggregate`) recomputed in every render | 5-17 ms each time, and new `focusCards` arrays every render |

## 3. Changes

### B1 - Refresh handle + loading flag out of AppShell state

New `src/ui/refreshStore.ts`: a tiny module-level store (same subscribe pattern as `dataCache.ts`) holding the active screen's `RefreshHandle` and its `refreshing` flag.

- `registerRefresh(handle | null)` and `setRefreshing(boolean)` are stable module functions. App.tsx passes them as the existing `onRegisterRefresh` / `onRefreshingChange` props - **screens are not changed**.
- TabBar reads both through a `useRefreshState()` hook, so only TabBar re-renders when they change. Its `onRefresh`/`refreshing` props are removed; App.tsx drops its `refreshHandle`/`refreshing` state.

### B2 - Stable callbacks + memoized heavy components

- New `src/ui/useStableCallback.ts`: returns a function with a stable identity that always calls the latest version of the given function (latest-ref pattern; the ref is assigned during render, so even a child's own effects in the same commit see the latest version).
- **Safety rule**: only used for callback props that the child calls from event handlers or effects, never to compute what it renders. Verified for every prop it's applied to (QuickAddWidget: `onAddTask`, `onAddMeeting`, `onSaveEdit*`, `onCancelEdit`, `onDeleteEdit`, `onRefile`, `onQuickFile`, `onAddNote`, `isMeetingDateVisible` - the latter only read in the add handler; DailyFocusPanel/PeriodFocusPanel: `onOpenItem`, `onToggle`, `onSaveGoal`).
- Where a callback's **presence** matters (e.g. `onQuickFile={editTarget ? … : undefined}` decides whether a button shows), the condition is kept at the call site; only the function itself is stabilized.
- `React.memo` on **QuickAddWidget**, **DailyFocusPanel**, **PeriodFocusPanel**, with the default shallow comparison. Props that were new objects each render are made stable at the call site (`editingTask` in Daily/Current via `useMemo`, ProjectDataPanel's `fixedDestination` via `useMemo`, `focusCards` via the memoized aggregate below). A prop that is still unstable somewhere (e.g. Review screen call sites, not touched) only means memo doesn't skip there - never a stale render.
- App.tsx's `openItem` (the one navigation callback that reaches a memoized panel, as `onOpenItem`) is stabilized via a ref, since it is defined after AppShell's loading early-return where no hook can live.
- QuickAddWidget read the cache during render (`getCachedData()` for abbreviation matching and tag uppercasing) and relied on its parent re-rendering on cache changes. Being memoized, it now subscribes itself via `useCachedItems()`.

### B3 - One render round for the screen load

`DailyView.load` and `usePlanningScreen.load`: set `settings`, `inbox`, `basePath`, `paths` and `loading=false` together after all awaits (React batches synchronous updates in one tick), instead of `setSettings` after the first await.

### B4 - Memoized aggregates

`useMemo` around `buildDailyAggregate` (both calls), `buildWeeklyAggregate`, `buildMonthlyAggregate` and `meetingsOnDay`, keyed on their real inputs (`items`, `inbox`, `basePath`, the period's start/end/key, context tag, and today's date string so a screen left open over midnight still recomputes).

### A1 - Recent tags without an extra render

`storage/tagUsage.ts` keeps the last loaded list in memory (`getRecentTagsSync()`); QuickAddWidget initializes `recentTags` from it and, after the async refresh, only calls `setRecentTags` if the list actually changed. Only the very first widget of a session pays the extra render.

### A2 - Tag-row widths remembered per screen

- New optional QuickAddWidget prop `layoutKey` (e.g. `'daily'`, `'week'`, `'month'`, `'current'`). `useTagRowBudget(hasAttachment, cacheKey)` seeds its widths from a module-level map keyed by `layoutKey + ':task' | ':meeting' | ':note'` and writes every measurement back.
- On a revisit the measured widths equal the seed -> no `setState`, no extra render, no extra e-ink request. Without a `layoutKey` (screens not touched) behavior is exactly as before.

## 4. Expected effect (to be checked by re-measuring)

Per tab switch: QuickAddWidget renders drop from 5-7 to 1-2 on revisits; the AppShell/TabBar/screen double pass disappears; screen render rounds drop from ~8 to ~4. Estimate: last JS commit ~1-1.5 s earlier.

## 5. Verification

- `tsc --noEmit` over App.tsx + src: no new errors.
- Re-run the same device protocol with tracing on; compare with the §12 baseline via `scripts/perf-report.js`.
- Manual checks on device: TabBar 🔄 still works and spins per screen; Quick Add add/edit/save/cancel/delete/refile/quick-file/New-from-this on Daily, Week, Month, Current; Daily focus panel arm + toggle; Week/Month focus toggles and goal saving; tag chips still page correctly.

## 6. As-built notes (2026-09-30)

- Files: new `ui/refreshStore.ts`, `ui/useStableCallback.ts`; changed `App.tsx`, `ui/TabBar.tsx`, `ui/QuickAddWidget.tsx`, `ui/DailyFocusPanel.tsx`, `ui/PeriodFocusPanel.tsx`, `ui/tagChipLayout.ts`, `storage/tagUsage.ts`, `screens/DailyView.tsx`, `screens/usePlanningScreen.ts`, `screens/WeekPlanner.tsx`, `screens/MonthView.tsx`, `screens/ProjectDataPanel.tsx`.
- `layoutKey` values: `daily` (Daily's main widget; the focus-mode widget has none), `week`, `month`, `current`. Inbox and Review widgets are unchanged (no key, unstabilized callbacks - memo simply doesn't skip there).
- `usePlanningScreen` returns stabilized `handleAddTask`, `handleAddMeeting`, `cancelEditTarget`, `commitMeetingEdit`, `handleCancelMeeting`, `handleQuickFileEdit` (serves both Week and Month).
- Verification: `tsc` shows no new errors. A Jest smoke test (react-test-renderer, mocked sn-plugin-lib and a fake file module with 2 projects, 1 area and an Inbox) renders the app, lands on Daily with data, switches Week -> Month -> Daily -> Inbox -> Projects, opens a project (Current), uses the shared refresh, adds a todo via Quick Add on Daily (lands in Inbox.txt) and on Current (lands in project.txt), and switches away and back - no React errors. Not yet run on the device.

## 7. Result of the re-measure (2026-09-30, session 4j57, 24 traces vs. baseline h7t0)

Medians, ms after the tap:

| Tab | last JS commit (before -> after) | QuickAddWidget renders | screen render passes | final e-ink flush |
|---|---|---|---|---|
| Daily | 2395 -> 944 | 5 -> 3 | 8 -> 6 | 3844 -> ~3500-3900 |
| Week | 3319 -> 1374 | 5 -> 3 | 8 -> 6 | 3734 -> not captured (trace ended first) |
| Month | 3416 -> 1347 | 5 -> 3 | 8 -> 6 | 3535 -> not always captured |
| Current (tab / via list) | 2313 -> 1290 / 2201 -> 1320 | 7 -> 2 | 7 -> 7 | 4302 -> 3606 / 3517 -> 3036 |

- JS render work roughly halved; AppShell renders once per switch (was 2-3); e-ink requests dropped from 3-7 to 1 on Daily/Week/Month.
- **The final e-ink flush did not move much.** After the last commit there are 1-2.5 s with no JS events, then layout measurements arrive and the flush (debounce + two animation frames) lands late. The JS thread is idle, so this is the native side creating and laying out the new screen's Android views (every tab switch mounts the whole screen, incl. QuickAddWidget's always-mounted hidden Meeting/Note forms). On Week/Month the gap exceeded the tracer's 1.5 s quiet window, so the trace ended before the flush.
- **New small cost on reopen**: QuickAddWidget now subscribes to the cache itself (needed for correctness once memoized), so the background cache rebuild on reopen re-renders it twice (~130 ms each), where previously nothing on the Current tab re-rendered. FIXED same day: new `ui/useAbbrevItems.ts` re-renders only when a Project/Area's kind/path/name/abbrev/status changes.
- Implication: remaining time is dominated by native view creation per mount - the main target of keeping tabs mounted (E) and of mounting the hidden forms lazily.
