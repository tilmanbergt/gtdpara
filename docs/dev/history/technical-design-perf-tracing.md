# Technical design: performance tracing (measurement only)

Status: IMPLEMENTED 2026-09-30 (approved same day; not yet device-tested) - see §11 for as-built notes. Scope is **measurement only**; no optimization is designed here.

## 1. Goal

Find out where the time goes when a tab is displayed, so we can decide on optimizations from data instead of guesses.

- **Primary scenario: tab switch** to Daily, Week, Month and Current (the annoying one, ~1-2 s perceived).
- Secondary: cold start (plugin opened from a note) - accepted as slow, measured for completeness since it is free.
- Build under test: whatever `buildPlugin.ps1` produces. It bundles with `--dev false`, i.e. a release JS bundle - so the numbers are representative, and React's `<Profiler>` is NOT available (it's a no-op in release). Everything below uses manual marks for that reason.

Data context (from Tilman): ~8 active Projects + ~8 Areas, several with 50+ meetings/todos, most of them past or done.

## 2. What we already know from the code (facts, not conclusions)

- `App.tsx` renders tabs conditionally (`activeTab === 'daily' && <DailyView/>`), so **every tab switch unmounts the old screen and mounts the new one from scratch**.
- On each mount, DailyView and Week/Month (`usePlanningScreen`) run `load()`: `loadSettings()` (AsyncStorage), `getCachedData()` (in memory, rebuilt only if missing), then `loadProjectFile('inbox')` (a real file read through the native bridge), then several `setState` calls.
- After loading, screens derive their lists from the full cache (all tasks/meetings of all items, incl. past/done ones), then `PagedSection` measures itself via `onLayout` and may re-render once the real height is known.
- Then `useEinkRefreshOnLoad` asks the e-ink panel to redraw.

The trace must show how the 1-2 s splits across exactly these phases.

## 3. New module: `src/utils/perf.ts`

Pure TS, no RN imports except `InteractionManager` for the flush. All calls are no-ops unless tracing is enabled.

```ts
perfEnable(on: boolean): void
perfBegin(kind: 'tab' | 'cold' | 'reopen', label: string, meta?: object): void   // starts a new trace (ends any running one)
perfMark(label: string, meta?: object): void                                    // instant event
perfSpan<T>(label: string, fn: () => Promise<T> | T, meta?: object): Promise<T> | T // start+end, duration
perfCount(label: string, n = 1): void                                          // cheap counter (e.g. rows rendered)
usePerfRender(screen: string): void   // hook: marks 'render:<screen>' in body, 'commit:<screen>' in useLayoutEffect, 'effects:<screen>' in useEffect
```

- Time source: `performance.now()` (falls back to `Date.now()`); stored relative to the trace start, rounded to 0.1 ms.
- Storage: one array of small tuples per trace; counters in a map. No string formatting, no `console.log`, no I/O while a trace is running.
- **Trace end:** 1500 ms after the last event (nothing changed on screen), with a hard cap of 15 s. The last `commit` before the quiet period = "fully rendered" from JS's point of view.
- **Flush:** after the trace ends, via `InteractionManager.runAfterInteractions`, serialize and write one file. If a new trace has started meanwhile, the flush is deferred until that one ends too (the write never overlaps a measured tab switch). A trace that is interrupted by a new `perfBegin` is kept and marked `interrupted`.

## 4. Output file

- Folder: `/storage/emulated/0/Note/_gtdpara_debug_log/perf/` (same fixed debug folder as the createNote log, via `GtdParaFile.ensureFolder` + `writeTextFile`).
- One file per trace: `<sessionId>-<seq>-<kind>-<label>.jsonl` (e.g. `k3f9-004-tab-daily.jsonl`). No growing files.
- Format: JSON Lines. First line is a header, then one line per event:

```jsonl
{"type":"trace","kind":"tab","label":"daily","from":"week","session":"k3f9","seq":4,"startedAt":"2026-10-01T08:12:03.120Z","totalMs":1432.5,"interrupted":false,"counters":{"row:task":38,"row:meeting":12},"meta":{"items":16,"tasks":412,"meetings":388}}
{"t":0.0,"ev":"mark","label":"tab:press"}
{"t":3.1,"ev":"span","label":"load:settings","dur":41.2}
{"t":46.0,"ev":"span","label":"load:inboxFile","dur":180.4,"meta":{"bytes":5210}}
{"t":231.9,"ev":"mark","label":"render:DailyView"}
...
```

### 4.1 Data statistics in every trace header

So timings can be related to data volume, the header carries a `stats` block, computed **after** the trace ends (at flush time, from the in-memory cache - so it costs nothing during the measured switch):

```json
{
  "stats": {
    "items": {"projects": 8, "areas": 8, "byStatus": {"active": 14, "onHold": 2}},
    "tasks":    {"total": 412, "open": 97, "done": 290, "cancelled": 25, "overdue": 6, "dueToday": 3},
    "meetings": {"total": 388, "past": 351, "today": 2, "future": 35},
    "inbox":    {"tasks": 7, "meetings": 1},
    "files":    {"projectFiles": 16, "projectFileBytes": 183400, "largestFile": {"name": "...", "bytes": 42100}, "linkedNotes": 64},
    "shown":    {"rowsTask": 38, "rowsMeeting": 12, "pages": 2}
  }
}
```

- `tasks`/`meetings`/`items`/`inbox`/`files` describe the whole data set (the same for every tab), `shown` describes what this particular screen actually rendered (from the row counters and PagedSection).
- The gap between e.g. `meetings.total` and `shown.rowsMeeting` shows directly how much past/done data is scanned but never displayed.
- `files.linkedNotes` counts tasks/meetings with a linked note/file; the file sizes come from `rawContent.length` already in the cache (no extra file reads).

## 5. Instrumentation points

| Where | What | Why |
|---|---|---|
| `App.tsx` `handleSelectTab` | `perfBegin('tab', tab, {from})` + `mark tab:press` | trace start = the tap |
| `index.js` top / `App.tsx` mount / `reorient()` | `perfBegin('cold' / 'reopen')` | secondary scenarios |
| `settingsStorage.loadSettings` | span `load:settings` | AsyncStorage cost per switch |
| `projectFile.loadProjectFile` | span `load:projectFile:<name>` + bytes | inbox file read per switch |
| `fileSystem.readTextFile` | span `io:read` + bytes | raw bridge/native cost vs. parse cost |
| `dataCache.rebuildCache` | span, plus per-item read/parse spans | cold start only (and 🔄) |
| `googleCalendarCache` load | span | if touched on Daily/Week/Month |
| aggregate builders (`dailyAggregate`, `weeklyAggregate`, `monthlyAggregate`, `buildNowEntries`, Current's `ensureItemCached`) | span each + in/out counts (e.g. 412 tasks in -> 38 shown) | cost of scanning all past/done items |
| DailyView, WeekView, MonthView, ProjectDataPanel | `usePerfRender(name)` | number of render passes, time to first/last commit |
| `PagedSection` / `useMeasuredHeight` | mark `layout:<id>` with measured height + page count | does self-measuring cause an extra render round? |
| `TaskRow`, `MeetingRow` | `perfCount('row:task' / 'row:meeting')` | how many row components render (incl. re-renders) |
| `useEinkRefreshOnLoad` / `requestEinkRefresh` | mark `eink:refresh` | last JS-visible step before the panel redraws |
| `log()` / `logError()` in `utils/log.ts` | `perfCount('console')` | how many bridge-crossing log calls happen per switch |

The exact spots inside each file get decided during implementation; the list above is the contract.

## 6. Switch

- New setting `perfTracing: boolean` (default `false`) in `GtdParaSettings`, toggled in Settings (Diagnostics section, next to the existing debug-log related entries).
- App reads it at startup and calls `perfEnable()`. Off = every perf call returns after one boolean check.
- The instrumentation stays in the code permanently, so every later optimization can be measured before/after the same way.

## 7. Overhead budget

- Per event: one array push (~µs). Expected ~100-300 events per trace -> well under 1 ms total.
- Serialize + write: happens only after 1.5 s of quiet, deferred past interactions, never during a measured trace.
- The `onLayout`/render hooks add no extra renders (they only read time and push).

## 8. Analysis

- A small Node script (`scripts/perf-report.js`, run by Claude in the cloud workspace on the collected files) produces per tab: median and max of total time, a phase breakdown (load / compute / first commit / layout re-render / last commit / e-ink refresh), render-pass counts and row counts, plus one example timeline per tab.
- Optional, once: a phone video of a tab switch next to its trace, to see how much time the e-ink redraw adds after the last JS event (not measurable from JS).

## 9. Measurement protocol (for Tilman)

1. Build + install, enable "Performance tracing" in Settings.
2. Tab switches: cycle Projects -> Daily -> Week -> Month -> Current -> Projects, 5 rounds, waiting until each screen is fully drawn (≥2 s) before the next tap.
3. Cold start: close the plugin fully and open it from a note, 3x.
4. Copy `Note/_gtdpara_debug_log/perf/` to the PC (or tell Claude, who stages it from the device folder).
5. Disable tracing again.

## 10. Out of scope

Any optimization (caching, keeping tabs mounted, filtering past/done items earlier, deferring parts of the screen, ...). Those are decided in a follow-up based on the report.

## 11. As-built (2026-09-30)

API as implemented in `src/utils/perf.ts` (small deviations from §3):

- `perfStart()` / `perfEnd(label, token, meta?)` for straight-line code (token = start time, `-1` when no trace is open), in addition to `perfTime` (sync) and `perfAsync` (async). `perfAccum(label, token)` adds elapsed ms to a counter (used for `console:ms`).
- A 4th trace kind `nav` for `openItem` (switching to Current from a list/row), next to `cold`, `reopen`, `tab`.
- Spans are written when they END, so events in a file are not sorted by start time; `activeMs` in the header is the latest event end. A span that began before the trace started (e.g. a background cache rebuild) is clipped to the trace start and carries `startedBeforeTrace: true`.
- The file writer and the stats provider are injected (`perfConfigure` in `App.tsx`), so `perf.ts` has no storage/supernote imports (and `utils/log.ts` can import it without a cycle).
- Flush uses `InteractionManager.runAfterInteractions`; a trace that starts while a file is still being written carries `meta.flushInProgress: true`.
- Stats (`storage/perfStats.ts`): items by kind/status, tasks (open/done/cancelled/overdue/due today/with note/with linked file), meetings (recurring/past/today/future/cancelled/occurrences/with note/with linked file), data-file sizes incl. a per-item list, cache age. Inbox counts come from the `load:projectFile` span meta (`kind: 'inbox'`).

Instrumentation points (all no-ops when off):

| File | Event(s) |
|---|---|
| `App.tsx` | cold `perfBegin` at module load; `reopen` on sidebar button; `tab` + `tab:press` in `handleSelectTab`; `nav` in `openItem`; `reorient:settingsLoaded`; `usePerfRender('AppShell')` |
| `supernote/fileSystem.ts` | `io:read` (path, chars), `io:list` (path, entries); new `writePerfTraceFile` |
| `supernote/pluginPermissions.ts` | `io:permission` per permission check |
| `storage/settingsStorage.ts` | `load:settings` |
| `storage/projectFile.ts` | `load:projectFile` (whole) + `parse:projectFile` (kind, path, chars, tasks, meetings) |
| `storage/dataCache.ts` | `cache:rebuild`, `cache:loadItems`, `cache:replaced`, `cache:rebuildJoined`, `cache:notify` (listeners), `cache:itemHit` |
| `storage/dailyAggregate.ts`, `weeklyAggregate.ts`, `monthlyAggregate.ts` | `agg:daily`, `agg:nowEntries`, `agg:focusCandidates`, `agg:groupDailyTasks`, `agg:weekly`, `agg:monthly`, `agg:meetingsOnDay` (exported functions wrapped; logic moved unchanged into `...Impl`) |
| `screens/DailyView.tsx`, `screens/usePlanningScreen.ts` | `screen:load` |
| DailyView, WeekView, WeekPlanner, MonthView, ItemDetail, ProjectDataPanel, QuickAddWidget, GoogleCalendarPanel, PeriodFocusPanel, DailyFocusPanel, ItemStatusPanel, TabBar | `usePerfRender` -> `render:`/`commit:`/`effects:<name>` |
| TaskRow, MeetingRow, MeetingChip, PagedSection | counters `row:task`, `row:meeting`, `row:meetingChip`, `render:PagedSection` |
| `ui/PagedSection.tsx`, `ui/useMeasuredHeight.ts` | `layout:PagedSection` (header, height, rows), `layout:measured` |
| `utils/screenRefresh.ts` | `eink:requested`, `eink:flush` |
| `utils/log.ts` | counters `console:log`, `console:error`, `console:ms` |
| `screens/Settings.tsx` | "Performance tracing: ON/OFF" button (Folders tab), saves immediately |
| `domain/settings.ts` | `perfTracing: boolean`, default `false` |

Verification: `tsc --noEmit` over App.tsx + src shows no new errors (the 3 pre-existing ones in ReviewScreen/MeetingRow/TaskRow are unchanged); `perf.ts`'s trace lifecycle (buffer before enable, interrupt, quiet-period end, flush, disable) and `scripts/perf-report.js` were exercised in Node with simulated events. Not yet run on the device.

## 12. First measurement - baseline (2026-09-30, session h7t0, 28 traces)

Data volume: 13 projects + 21 areas (24 active, 10 on hold), 120 tasks (51 open), 100 meetings (83 past, 0 recurring), 34 data files, 16k chars in total. Small - the data size is not the problem.

Medians per tab switch (ms after the tap; "flush" = the final e-ink refresh):

| Tab | data load (settings + Inbox read + parse) | aggregates per render | render passes of the screen | QuickAddWidget renders | last commit | e-ink flush |
|---|---:|---:|---:|---:|---:|---:|
| Daily | ~130 | 5 | 8 | 5 | 2395 | 3844 |
| Week | ~115 | ~5 | 8 | 5 | 3319 | 3734 |
| Month | ~165 | 15 | 8 | 5 | 3416 | 3535 |
| Current | ~100 (cache hit) | - | 4-7 per panel | 7 | 2313 | 4302 |
| Areas (for comparison) | - | - | - | - | 249 | - (~840 active) |

Findings:

1. **Data/IO is not the bottleneck** on tab switches: ~100-170 ms, done within the first ~200 ms. Aggregates cost 5-17 ms each. Past/done items are cheap at this data size.
2. **JS render work dominates, mostly QuickAddWidget**: one render of its subtree takes ~150-380 ms (it renders the Task, Meeting and Note forms at once, two hidden via `display: none`, plus clipboard overlays and tag-chip rows). It renders 5-7 times per switch -> roughly 1-1.3 s of JS time.
3. **Why so many re-renders**: (a) the screen's `onRefreshingChange`/`onRegisterRefresh` effects set state in AppShell -> the whole tree (TabBar + screen + all panels) renders again (~300 ms); (b) the screen's own sequential state updates after load; (c) QuickAddWidget's own mount work (`getRecentTags` -> setState) and its tag-row `onLayout` measurements (`useTagRowBudget`, up to 3 setStates, each also calling `requestEinkRefresh`); (d) self-measuring PagedSections: each measured height sets state in the screen, which re-renders everything incl. QuickAddWidget again. Nothing in the tree is memoized.
4. **Layout cascade tail**: measurement rounds arrive one after another (Current: 1732, 2349, 2722, 2964 ms), each triggering another render round.
5. **E-ink flush comes late**: `eink:requested` fires 3-6 times per switch (each resets the 150 ms debounce); the final flush lands 0.3-1.1 s after the last recorded JS event. That last gap has no JS events - native layout/mount, or unmeasured work; not distinguishable yet.
6. **Reopen from sidebar** rebuilds the whole cache every time (34 parallel file reads, 1.1-1.6 s wall time, ~150 console.log calls) while the landing screen renders.
7. `load:settings`/`io:list` spans of ~1 s on the Current tab are waiting time, not work: their promises resolve only once the busy JS thread is free.

## 13. Tracer v2: frame probe + waiting for the e-ink flush (2026-09-30)

The first re-measure (see `technical-design-render-perf-ab.md` §7) showed 1-2.5 s after the last JS commit with no JS events at all; on Week/Month the trace even ended (1.5 s quiet window) before the final e-ink flush. Two additions:

- **Frame probe**: while a trace is open, one `requestAnimationFrame` callback per frame. A gap > 100 ms between two frames is recorded as a `frame:gap` span and counts as activity. The report splits gaps into *JS busy* (a JS event falls inside the gap) and *native busy* (JS idle, frames still not produced - view creation/layout on the Android side). Counter `frames` = frames seen.
- **Wait for the flush**: a trace does not end while an `eink:requested` has no later `eink:flush` (still capped at 15 s).
- Cost: one JS callback per frame, only while tracing is on and a trace is open. It may keep the frame pipeline a bit busier than without tracing - numbers with tracing on are a slight overestimate, never an underestimate.
