# Host crash after installing a new build: diagnostics, cleanup, controlled restart

Status: implemented 2026-09-29, not yet device-tested.

## 1. Failure picture (crash-log.txt, 2026-09-29)

- Two native crashes (SIGSEGV, null pointer dereference) in `com.ratta.supernote.pluginhost`, both on
  thread `mqt_ndx27q77poj` = gtdpara's React Native native-modules thread (`mqt_ndx27q77pojfqh6l_native_modules`).
- The stacks are entirely inside ART (Android's runtime): a native-module call dispatched via reflection lands
  on a null method. The second tombstone crashed inside ART's own fault handler. A bug in our Kotlin code would
  show up as a Java exception, not as this.
- Timing: build `app_1790684200487` installed 14:16:40, crash 14:17:45. Build `app_1790688024888` installed 15:20:24,
  crash 15:22:25.
- In the crashing process, ART still referred to the old build's (deleted) npk while the new build's odex
  was loaded, so two gtdpara builds were loaded in one process.
- A fresh host process (after the crash) loads only the newest build and runs stably.

Working hypothesis: the host installs a new build into the running process instead of restarting it, and
old-build code is later reached through stale references. This is a host (Ratta) problem; gtdpara can only
detect it, reduce its own leftovers and offer a clean restart.

## 2. Decisions (Tilman, 2026-09-29)

1. On detection: show a banner with a **Restart** button (controlled host-process restart). No automatic kill.
2. Logging: lifecycle logging plus a one-line trail for every native call.
3. `buildPlugin.ps1` bumps `versionCode` on every build (experiment: does the host handle a real version change better?).

## 3. Design

### 3.1 `PluginRuntimeGuard.kt` (Kotlin `object`)
Loaded once per class loader, i.e. once per build alive in the process.
- `buildId`: `app_<ms>` parsed from its own class loader's npk path. Also `loaderId` (identity hash), `pluginId`,
  and `versionCode` from the installed `PluginConfig.json` next to the npk (if the host keeps it there; otherwise `?`).
- Registry: appends `build@loader@loadedAtMs` to the System property `eu.embodyagile.gtdpara.loadedBuilds`.
  System is loaded by the boot class loader, so all builds share it. Lock: `System::class.java`. This is history
  only; it is logged but doesn't decide anything.
- `scanMappedBuilds()`: reads `/proc/self/maps`, collects every mapped `app_<ms>.{npk,odex,vdex,art}` under
  `/plugins/<pluginId>/` (including the ` (deleted)` marker). Any build other than this one = **stale build still
  loaded**. This is the decisive signal, and it also catches old builds that predate this code.
- `trace(call)`: `call <Module.method> build=… loader=… thread=…` at the start of every `@ReactMethod`.
- `onModuleCreated`/`onModuleInvalidated`: lifecycle lines.
- `killHostProcess(reason)`: logs, then `Process.killProcess(myPid())`.

Logcat tag: `GtdParaRuntime`.

### 3.2 `GtdParaRuntimeModule.kt` (bridge name `GtdParaRuntime`)
- `getRuntimeDiagnostics()` → `{buildId, versionCode, loaderId, pid, processAgeMs, npkPath, staleBuilds[], mappedFiles[], registry[], scanError}`.
- `restartPluginHost(reason)`: resolves, then kills the host process after 400 ms (main looper).

### 3.3 Cleanup in the existing modules
- All four modules log creation/`invalidate()` and trace every `@ReactMethod`.
- `GmailImapModule`: `invalidate()` now calls `executor.shutdownNow()`. Before, its single-thread executor was
  never shut down, so every React instance left one idle thread behind.
- `PdfModule`: `invalidate()` sets the cancel flag of every running `buildPdf` job.

### 3.4 JS
- `src/supernote/pluginRuntime.ts`: wrappers that never throw and log the diagnostics.
- `src/ui/StaleBuildBanner.tsx`: checks once on mount. Each install creates a new React instance, so this
  covers every install. If `staleBuilds` is non-empty it shows the banner and a Restart button; otherwise it
  renders nothing. Placed in `App.tsx` between TabBar and body (tabs mode only; focus/capture modes are unchanged).

### 3.5 Build script
`buildPlugin.ps1` step 3 increments `"versionCode": "N"` in the root `PluginConfig.json` (regex edit, UTF-8
without BOM) before it's copied to `build/generated`. `buildPlugin.sh` is not changed.

## 4. What to look for in the next log
`adb logcat -d -s GtdParaRuntime:V ReactNativeJS:V AndroidRuntime:V DEBUG:V libc:V`
- After an install: does `build loaded` appear for the new build with `processAgeMs` large (same old process)?
  Is `STALE BUILD(S) STILL LOADED` logged, and are the old files marked `(deleted)`?
- Is `module invalidated` ever logged for the old build? If not, the host never tears down the old React instance.
- The last `call …` line before a SIGSEGV shows which native call crashed and which build made it.
- With the versionCode bump: does the stale-build situation or the crash still occur?

## 5. Device test 2026-09-29
- The banner appeared and Restart worked. The host still shows its own "not updated" dialog once, and the next tap opens normally.
  No SIGSEGV since the controlled restart. The new build (`app_1790690214111`, versionCode 2) runs cleanly in the fresh process.
- The logcat ring buffer lost the install/detection/restart part: the `W/ResourceType` flood (thousands of lines per
  plugin load) pushes older lines out. Next time: enlarge the buffer or stream the log live (see chat).
- Experiment: the Restart button now also calls `PluginManager.closePluginView()` right after scheduling the kill,
  to see whether a normal close first avoids the host dialog.

## 5b. Full install cycle, streamed log (2026-09-29, 16:06-16:07)
- 16:06:28 install from Settings (`isUpgrade=true`, versionCode 2 -> 3), done at 16:06:39, all inside the RUNNING host process (pid 15481, 533 s old).
- 16:06:39 the host cleanly `invalidate()`s all five modules of the old build: the host does tear down the old React instance.
- 16:06:40 the new build loads in the same process. The old build's npk/odex/vdex are deleted on disk but still mapped. The old class loader
  is never unloaded, so the stale-build warning is correct. The versionCode bump changes nothing here.
- 16:06:56 Restart: host killed. ActivityManager treats it as a crashed service and restarts it 1 s later. The NOTE/DOC apps log
  `PluginClient onServiceDisconnected`, which is the likely source of the host's dialog.
- 16:07:06 next tap: fresh process, only the new build, no stale builds, works.
- Conclusion: every in-place upgrade leaves the old build's code loaded, and there's nothing gtdpara can do about that. The controlled restart
  is the workaround; the real fix (restart the host process on upgrade, or never reuse it) is Ratta's.

## 6. Open
- If the crash still occurs, report it to Ratta with the tombstone and these logs.
