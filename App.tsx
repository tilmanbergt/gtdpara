/**
 * GtdPara
 *
 * @format
 */

import React, {useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore} from 'react';
import {ActivityIndicator, StyleSheet, Text, View} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
import TabBar, {AppTab} from './src/ui/TabBar';
import {getKeptTabsGeneration, setKeepTabsAlive, useKeepTabsAlive} from './src/ui/keepAliveStore';
import KeptTab from './src/ui/KeptTab';
import ItemsList from './src/screens/ItemsList';
import Settings, {SettingsTab} from './src/screens/Settings';
import ItemDetail from './src/screens/ItemDetail';
import DailyView from './src/screens/DailyView';
import WeekView from './src/screens/WeekView';
import MonthView from './src/screens/MonthView';
import InboxScreen from './src/screens/InboxScreen';
import ReviewScreen from './src/screens/ReviewScreen';
import CloseOutWizard from './src/screens/CloseOutWizard';
import CaptureScreen from './src/screens/CaptureScreen';
import StaleBuildBanner from './src/ui/StaleBuildBanner';
import MarkOutcomeScreen from './src/ui/MarkOutcomeScreen';
import {getMarkOutcome, outcomeNeedsScreen, subscribeMarkOutcome} from './src/storage/marks';
import HelpOverlay from './src/ui/HelpOverlay';
import {helpStartPage, LastHelpPage} from './src/domain/helpTopics';
import {USER_DOCS} from './src/generated/userDocs';
import {StatusProvider} from './src/ui/status/StatusProvider';
import StatusFrame from './src/ui/status/StatusFrame';
import {LASSO_BUTTON_ID, SIDEBAR_BUTTON_ID} from './src/domain/buttonIds';
import {activeReviewSteps, isReviewOverdue} from './src/domain/reviewSteps';
import {featuresOf, shouldShowWhatsNew} from './src/domain/features';
import {setFeatures, useFeatures} from './src/ui/featureStore';
import {useStatus} from './src/ui/status/StatusProvider';
import {configureLogFileSink, setFileLogging} from './src/utils/logSink';
import {GtdParaSettings, resolvePaths} from './src/domain/settings';
import {decideLanding} from './src/domain/returnContext';
import {clearCachedData, refreshCache, subscribeCache} from './src/storage/dataCache';
import {InboxMigrationNotice, takeInboxMigrationNotice} from './src/storage/inboxMigration';
import {clearCachedGmailInbox} from './src/storage/gmailInboxCache';
import {setActiveProfileId} from './src/storage/profileKeys';
import {switchProfile} from './src/storage/profiles';
import {DEFAULT_PROFILE_ID} from './src/domain/profiles';
import {clearReturnRecord, getReturnRecord, recordPluginOpen} from './src/storage/returnRecord';
import {loadSettings, patchSettings, saveSettings} from './src/storage/settingsStorage';
import {
  FolderEntry,
  getCurrentNotePath,
  rememberLaunchNotePath,
  appendDebugLogFile,
  deleteTempTree,
  getPrivateTempDir,
  setOpenPathObserver,
  writePerfTraceFile,
} from './src/supernote/fileSystem';
import {log, logError} from './src/utils/log';
import {BUILD_INFO} from './src/generated/buildInfo';
import {perfBegin, perfConfigure, perfEnable, perfMark, usePerfRender} from './src/utils/perf';
import {collectPerfStats} from './src/storage/perfStats';
import {requestEinkRefresh, useEinkRefreshOnLoad} from './src/utils/screenRefresh';
import {FONT, useThemeColors} from './src/ui/theme';

// Performance tracing (docs/dev/technical-design-perf-tracing.md). Wired once at
// module load: the cold-start trace starts here, as early as App's own code
// runs, and is buffered until reorient() knows whether tracing is on
// (settings.perfTracing) - perfEnable(false) then simply drops it.
perfConfigure({
  writeFile: writePerfTraceFile,
  collectStats: collectPerfStats,
  onError: message => logError('perf: writing trace file failed', message),
});
perfBegin('cold', 'app');

// Optional debug-log file (docs/dev/technical-design-about-debug-experimental.md
// §3.3): the writer is injected here so utils/log.ts stays import-free; the
// file sink itself is only switched on by settings.debugLogging (reorient()).
configureLogFileSink(
  appendDebugLogFile,
  `=== gtdpara ${BUILD_INFO.label} build ${BUILD_INFO.versionCode} - session ${new Date().toISOString()} ===`,
);

// Tabs whose screens stay mounted (hidden) after their first visit while
// "Keep tabs in memory" is on (docs/dev/technical-design-keep-tabs-alive.md
// §2 D1). Inbox, Review and Settings keep the mount-while-visible behavior.
const KEPT_TABS: AppTab[] = ['daily', 'week', 'month', 'current', 'projects', 'areas'];

// The Project/Area currently shown on the "Current" tab - set whenever one
// is opened (from Projects/Areas/Daily, from a Lasso-capture save, or by
// reorient() below), and left alone by everything else, including tab
// switches. There is no back stack any more: navigation is purely "which
// tab is active" (`activeTab`) plus "what does the Current tab show right
// now" (`currentItem`), and the two are independent - switching to another
// tab and back to "Current" still shows the same item.
interface CurrentItem {
  kind: 'project' | 'area';
  name: string;
  path: string;
}

// Whether we're still resolving where to land on launch, showing the
// full-screen Lasso-capture overlay, showing the tab shell, or showing
// Daily's focus mode. Deliberately separate from `activeTab`/`currentItem`
// (which persist regardless of mode) - both the capture overlay and focus
// mode sit on top of the tab shell rather than being one of its tabs, same
// as the old {kind: 'capture'} screen used to stand apart from
// {kind: 'home'|'daily'|'item'|'settings'}. 'focus' (docs/dev/technical-design-
// now-focus-mode.md §4) reuses that exact "full-screen, no TabBar" shape -
// same DailyView instance as 'tabs'-mode Daily, just rendered with its
// focusMode prop on instead of a separate screen component.
type Mode = 'loading' | 'capture' | 'tabs' | 'focus';

// The central status slot (docs/dev/technical-design-status-slot.md) needs its
// provider above every mode, so App itself is only the provider + the
// always-mounted StaleBuildBanner publisher; the real shell is AppShell.
// Keep this `export default` - index.js is untyped JS, so tsc can't catch
// a missing default export here (see the project's App.tsx crash notes).
export default function App(): React.JSX.Element {
  return (
    <StatusProvider>
      <StaleBuildBanner />
      <AppRoot />
    </StatusProvider>
  );
}

// Switching profiles (docs/dev/technical-design-profiles-demo-space.md §3.4)
// remounts the whole shell via this key, so no kept-alive tab, draft or
// screen state from the previous data set survives; the normal start path
// (reorient) then runs against the new profile's settings.
//
// "Mark for later" (docs/dev/technical-design-lasso-0.8.md §3.6) runs from
// index.js without this view; when it needs to say something it stores an
// outcome and opens the view - drawn here on top of whatever the shell shows,
// so the shell (and its kept tabs) stays as it was.
function AppRoot(): React.JSX.Element {
  const [epoch, setEpoch] = useState(0);
  const markOutcome = useSyncExternalStore(subscribeMarkOutcome, getMarkOutcome);
  return (
    <>
      <AppShell key={epoch} onProfileSwitched={() => setEpoch(e => e + 1)} />
      {markOutcome && outcomeNeedsScreen(markOutcome) ? (
        <View style={StyleSheet.absoluteFill}>
          <MarkOutcomeScreen outcome={markOutcome} />
        </View>
      ) : null}
    </>
  );
}

function AppShell({onProfileSwitched}: {onProfileSwitched: () => void}): React.JSX.Element {
  usePerfRender('AppShell');
  const {isDarkMode, textColor} = useThemeColors();

  const [mode, setMode] = useState<Mode>('loading');
  // Explicit e-ink refresh once the initial reorient() below actually lands
  // on a tab - see src/utils/screenRefresh.ts's module doc comment for why
  // this needs to happen at all (the host doesn't reliably flush an async
  // content swap on its own).
  useEinkRefreshOnLoad(mode === 'loading');
  const [activeTab, setActiveTab] = useState<AppTab>('projects');
  const [currentItem, setCurrentItem] = useState<CurrentItem | null>(null);
  // The open project close-out (docs/dev/technical-design-project-close-out.md
  // §8.3): while set, the Review tab shows the close-out wizard instead of
  // ReviewScreen. Kept when switching tabs, so coming back to Review (or
  // back from checking the PDF) continues the same close-out.
  const [closeOut, setCloseOut] = useState<{path: string; mode: 'full' | 'quick'} | null>(null);
  // Feeds TabBar's Review-tab badge (domain/reviewSteps.ts's isReviewOverdue
  // against settings.reviewSteps) - loaded alongside everything else in
  // reorient() below, and re-loaded via refreshSettings() whenever
  // ReviewScreen records a step visit (or stamps an empty step), so the badge
  // clears without needing a full reorient()/tab switch.
  const [settings, setSettings] = useState<GtdParaSettings | null>(null);

  // Stable identity for openItem (defined further below, after the loading
  // early-return, so it can't be a hook there): screens pass it on to
  // React.memo'd panels (DailyFocusPanel, PeriodFocusPanel), which must not
  // re-render just because this shell did (render-perf-ab §3 B2). Always
  // calls the latest openItem via the ref, assigned during render below.
  const openItemRef = useRef<(kind: 'project' | 'area', entry: FolderEntry) => void>(() => {});
  const stableOpenItem = useCallback(
    (kind: 'project' | 'area', entry: FolderEntry) => openItemRef.current(kind, entry),
    [],
  );

  // Which Settings sub-tab to land on next time Settings mounts (docs/
  // technical-design-google-calendar.md §9) - normally 'folders' (the
  // default every direct TabBar tap resets it back to, in handleSelectTab
  // below), but openSettingsCalendar sets it to 'calendar' right before
  // switching tabs so a Google mini-tab's "Open Calendar Settings" link
  // (DailyView/WeekView/ProjectDataPanel/InboxScreen/ReviewScreen, all
  // threaded to openSettingsCalendar below) lands straight there. Settings
  // itself only reads this once, via its own initialTab prop's useState
  // initializer - see that screen's module doc comment for why a watched
  // effect isn't needed (a tab switch away always unmounts it first).
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('folders');

  // In-app help (docs/dev/technical-design-in-app-help.md §3.3): the page
  // shown in the overlay, or null while it's closed. The last page read per
  // tab is remembered for this session only.
  const [helpPage, setHelpPage] = useState<string | null>(null);
  const lastHelpRef = useRef<LastHelpPage | null>(null);
  // Capture and focus mode have no TabBar - leaving 'tabs' closes the help;
  // so does any change of tab (TabBar tap, profile marker, reopening the
  // plugin from a note that lands on another tab).
  useEffect(() => {
    if (mode !== 'tabs') setHelpPage(null);
  }, [mode]);
  useEffect(() => {
    setHelpPage(null);
  }, [activeTab]);
  // Leftovers of an interrupted PDF export live only in the plugin's private
  // temp folder (docs/dev/technical-design-inkhub-submission.md §3.2) - clear
  // them once per start. Best-effort: older native builds lack the call.
  useEffect(() => {
    getPrivateTempDir()
      .then(dir => deleteTempTree(dir))
      .catch(e => log('App: private temp clean-up skipped', e instanceof Error ? e.message : String(e)));
  }, []);

  // Re-checks the current note's Project/Area and jumps straight there - on
  // initial mount, AND every time our own sidebar button is pressed again.
  // The Activity/JS instance stays alive while the plugin is hidden (the
  // user switched to a different note without tapping the "✕" close
  // button), so a mount-only effect only ever ran this once and left the
  // plugin stuck showing whatever it had open before - it never noticed a
  // different note was now current. registerButtonListener's event fires on
  // every press, whether that press launches a fresh instance or brings an
  // already-running one back to the foreground, which is exactly the signal
  // needed here. The button that opens this plugin only appears while a
  // NOTE/DOC is open, so there's always *a* current note; the only question
  // is whether it happens to live inside a Project/Area folder (possibly
  // nested, e.g. its own Meetings/Todos subfolder - findEnclosingItem walks
  // up to the top-level item either way). A hit switches to the "Current"
  // tab and updates `currentItem`; a miss switches to the "Daily" tab
  // instead (the closest still-useful landing spot now that there's no
  // "Home" tab) without touching whatever `currentItem` already held.
  // Exception (docs/dev/technical-design-return-to-origin.md): if the note open
  // now is the one this plugin itself last opened (openPath), neither jump
  // happens - the plugin resumes exactly where it was left.
  //
  // Same spot also kicks off a background cache refresh (design-overview.md
  // §2.3; since 0.6.0 only files changed on disk are read again, the first
  // open builds the cache in full) - fire-and-forget, not
  // awaited, so a slow scan never delays landing on a tab. By the time the
  // user actually taps into something, storage/dataCache.ts is usually
  // already warm; if it isn't yet, each screen's own cache-miss fallback
  // (ensureItemCached, or DailyView's build-if-missing) covers the gap.
  // Set synchronously (before any await) by the Lasso button branch below,
  // and cleared by the sidebar-button branch, so a reorient() already in
  // flight knows not to clobber a capture screen a button event just routed
  // us to - see the race explained just above registerButtonListener below.
  const routedByLassoButtonRef = useRef(false);

  // Whether we've landed on *something* (tabs or capture) at least once.
  // Only relevant to the reorient() catch block below: a failed *first*
  // attempt still needs to leave `mode: 'loading'` somehow, while a failed
  // *later* attempt (already showing tabs or capture) should be left alone
  // rather than yanking the user away on a transient error. Using a ref
  // instead of inspecting `mode` directly sidesteps the stale-closure trap
  // `reorient` would otherwise fall into (it's created once, in the mount
  // effect below, and would otherwise always see whatever `mode` was at
  // that first render).
  const hasLandedRef = useRef(false);

  // Bumped on every Lasso-button press and used as CaptureScreen's `key`
  // below, forcing a full unmount+remount on each press rather than
  // re-rendering the same instance. Without this, a *second* capture while
  // the app's JS instance is still alive from the first one (Save & Close
  // and Cancel both leave `mode` as 'capture' - closePluginView() only
  // hides the native view, per this file's own note above about the
  // instance staying alive) re-sets mode to the exact same 'capture' value.
  // React re-renders CaptureScreen in place rather than remounting it, so
  // its mount-only `useEffect(load, [load])` never re-fires - `load` is a
  // stable useCallback identity, so nothing tells it a *new* lasso
  // selection is waiting to be read. The text field then just keeps
  // showing whatever the previous capture left in it (its old recognized
  // text, or whatever was typed/cleared before saving) instead of the new
  // selection's recognition - this is what surfaced on-device as
  // "recognition did not appear in text field" on a second capture. Forcing
  // a remount via `key` resets every piece of CaptureScreen's local state
  // (text, kind, destination, linkToSource, warnings) and re-runs `load()`
  // against whatever is actually lassoed right now.
  //
  // Real useState, not useRef (docs/dev/technical-design-filing-unification.md
  // §9 - fixes a since-found regression in the mechanism described above):
  // a plain ref mutation doesn't itself trigger a re-render, so the fix
  // relied entirely on the *following* `setMode('capture')` call to force
  // one. That's fine on the very first capture (mode is genuinely
  // transitioning away from 'loading'/'tabs'), but on a *second* Lasso press
  // after Cancel/Save & Close - both of which leave `mode` already at
  // 'capture', per the note above - `setMode('capture')` is a same-value
  // call, and React's Object.is bailout on identical primitive state means
  // it re-renders nothing at all: the `key={captureNonce}` JSX line below
  // never re-evaluates, and the stale CaptureScreen instance (old
  // recognized text, old kind, old destination) stays mounted exactly as it
  // was. This is the precise mechanism behind the reported "recognizes
  // correctly the first time, then always shows the previous capture's text
  // after that" regression. `setCaptureNonce(n => n + 1)`'s functional
  // updater always produces a genuinely new value regardless of what `mode`
  // does, so the remount no longer depends on `setMode`'s own bailout
  // behavior.
  const [captureNonce, setCaptureNonce] = useState(0);

  // Mirror of `activeTab` for reorient() below, which is created once in the
  // mount effect and would otherwise only ever see the first render's value
  // (same stale-closure reason hasLandedRef is a ref). Read only by the
  // "resume" landing, to avoid re-pointing the Current tab while it's the
  // one on screen.
  const activeTabRef = useRef<AppTab>(activeTab);
  activeTabRef.current = activeTab;

  useEffect(() => {
    let cancelled = false;
    // Which build is running - first thing to look for in a log
    // (docs/dev/technical-design-versioning-release.md 3.4).
    log('App: gtdpara', BUILD_INFO.label, 'build', BUILD_INFO.versionCode, 'built', BUILD_INFO.builtAt);

    // Every file the plugin opens itself goes through fileSystem.ts's
    // openPath, which tells this observer right before the host call
    // (docs/dev/technical-design-return-to-origin.md §6) - that's what lets
    // reorient() below recognize "the open note is the one we sent the user
    // to". Returns recordPluginOpen's undo function so a failed open leaves
    // any earlier record intact.
    setOpenPathObserver({onOpening: path => recordPluginOpen(path)});

    const reorient = async () => {
      try {
        const [loadedSettings, currentPath] = await Promise.all([loadSettings(), getCurrentNotePath()]);
        perfEnable(loadedSettings.perfTracing === true);
        // Experimental switches + debug-log file (docs/dev/technical-design-about-debug-experimental.md).
        setFeatures(featuresOf(loadedSettings));
        setActiveProfileId(loadedSettings.activeProfileId);
        setFileLogging(loadedSettings.debugLogging === true);
        setKeepTabsAlive(loadedSettings.keepTabsAlive !== false);
        perfMark('reorient:settingsLoaded');
        // Cheap: just caches what was already fetched above, no extra call.
        // Runs on cold start AND on every sidebar-button press (this whole
        // reorient() is re-invoked from the onButtonPress handler below),
        // i.e. every time the plugin is (re)opened - see
        // rememberLaunchNotePath's own doc comment in fileSystem.ts.
        rememberLaunchNotePath(currentPath);
        if (cancelled || routedByLassoButtonRef.current) return;

        setSettings(loadedSettings);
        // Only files changed outside gtdpara are read again (technical-design-files-0.6.md §3.2).
        refreshCache(loadedSettings).catch(e =>
          logError('App: background cache refresh failed', e instanceof Error ? e.message : String(e)),
        );

        // Where to land is one pure decision (domain/returnContext.ts's
        // decideLanding, docs/dev/technical-design-return-to-origin.md), in this
        // priority: focus mode > resume > the note's Project/Area > Daily.
        const returnRecord = getReturnRecord();
        const landing = decideLanding({
          focusModeActive: loadedSettings.focusModeActive,
          currentPath,
          record: returnRecord,
          paths: resolvePaths(loadedSettings),
          nowMs: Date.now(),
        });
        // Both raw path spellings on purpose: whether getCurrentFilePath
        // reports the same form we passed to openFile is the one thing about
        // the resume rule that can only be confirmed on a real device.
        log(
          'App: reorient landing',
          landing.kind,
          'current=' + String(currentPath),
          'recorded=' + String(returnRecord?.path ?? null),
        );

        // Focus mode overrides the normal reorient entirely (docs/technical-
        // design-now-focus-mode.md §4): while it's on, reopening the plugin
        // must always land back on it, never on the current note's
        // Project/Area - "sessions are held lightly", but staying put is the
        // one thing this flag guarantees. The return record is left alone.
        if (landing.kind === 'focus') {
          log('App: reorienting to focus mode (focusModeActive)');
          hasLandedRef.current = true;
          setMode('focus');
          return;
        }

        // Resume: the note that's open now is the one this plugin itself
        // opened last, so the user is just back from a quick look/jotting -
        // leave activeTab and every mounted screen exactly as they were
        // (the JS instance stays alive while hidden, so all state, including
        // Files-pane drill-down and unsent quick-add text, is still there).
        // Only `mode` is normalized: it may still be 'capture' if the user
        // left via a Lasso Save & Close. The Current tab is pointed at the
        // note's own Project/Area (when it has one) - but never while the
        // Current tab is the one on screen, since swapping what's displayed
        // would defeat the point of resuming. The record is deliberately kept
        // (sticky): pressing the button again from the same note keeps
        // resuming until the user leaves that note.
        if (landing.kind === 'resume') {
          if (landing.enclosing && activeTabRef.current !== 'current') {
            setCurrentItem({
              kind: landing.enclosing.kind,
              name: landing.enclosing.name,
              path: landing.enclosing.path,
            });
          }
          hasLandedRef.current = true;
          setMode('tabs');
          return;
        }

        // A record that no longer matches (a different note is open, or it
        // expired) means the user moved on - drop it, so returning to the
        // old note by hand later can't resurrect it.
        if (landing.clearRecord) clearReturnRecord();

        if (landing.kind === 'item') {
          const enclosing = landing.item;
          log('App: reorienting to current note\'s item', enclosing.kind, enclosing.path);
          setCurrentItem({kind: enclosing.kind, name: enclosing.name, path: enclosing.path});
          setActiveTab('current');
        } else {
          setActiveTab('daily');
        }
        hasLandedRef.current = true;
        setMode('tabs');
      } catch (e) {
        log('App: reorient failed', e instanceof Error ? e.message : String(e));
        // A failed *first* attempt still needs to leave loading somehow;
        // a failed later attempt (already showing something) is left alone
        // rather than yanking the user back to Daily on a transient error.
        if (!cancelled && !routedByLassoButtonRef.current && !hasLandedRef.current) {
          hasLandedRef.current = true;
          setActiveTab('daily');
          setMode('tabs');
        }
      }
    };

    reorient();

    // Registered *before* reorient()'s own awaits can resolve, and the
    // Lasso branch below flips routedByLassoButtonRef synchronously - so on
    // a cold start where the plugin was launched by a Lasso-toolbar press,
    // PluginManager's own "replay the last button event to a newly
    // registered listener" behavior (see sn-plugin-lib's
    // registerButtonListener) fires this callback and sets the ref *before*
    // reorient()'s in-flight promise chain resumes, and reorient() then
    // sees the ref and skips its own setMode/setActiveTab instead of
    // overwriting the capture screen with the tab shell. Without this
    // ordering + guard, reorient() finishing after the button event would
    // silently stomp the capture screen the user just asked for.
    const subscription = PluginManager.registerButtonListener({
      // sn-plugin-lib doesn't export its ButtonEvent type from the package
      // root (only PluginManager.ts sees it internally), so this is typed
      // by hand from its actual shape - pressEvent is logged only, not yet
      // relied on for routing (unverified on-device whether a lasso-toolbar
      // press really reports pressEvent === 3; id is what's authoritative
      // here since it's assigned by us in index.js).
      onButtonPress: (event: {id?: number; pressEvent?: number}) => {
        log('App: button pressed', String(event?.id), 'pressEvent=' + String(event?.pressEvent));
        if (event?.id === SIDEBAR_BUTTON_ID) {
          perfBegin('reopen', 'sidebar');
          log('App: sidebar button pressed - reorienting');
          routedByLassoButtonRef.current = false;
          reorient();
        } else if (event?.id === LASSO_BUTTON_ID) {
          log('App: lasso button pressed - opening capture screen');
          routedByLassoButtonRef.current = true;
          setCaptureNonce(n => n + 1);
          hasLandedRef.current = true;
          setMode('capture');
        }
      },
    });

    return () => {
      cancelled = true;
      subscription.remove();
      setOpenPathObserver(null);
    };
  }, []);

  // ---- Keep tabs alive (docs/dev/technical-design-keep-tabs-alive.md) ----
  const keepTabsAlive = useKeepTabsAlive();
  const features = useFeatures();
  // Stable identities for App callbacks passed to kept screens (they are
  // defined below the loading early-return, where no hook can live); each
  // call runs the latest version via navRef, assigned further below.
  const navRef = useRef<{
    openInbox: () => void;
    openSettingsCalendar: () => void;
    onEnterFocusMode: () => void;
    handleArchived: (kind: 'project' | 'area') => void;
    openCloseOut: (path: string, closeOutMode: 'full' | 'quick') => void;
  } | null>(null);
  const stableNav = useMemo(
    () => ({
      openInbox: () => navRef.current?.openInbox(),
      openSettingsCalendar: () => navRef.current?.openSettingsCalendar(),
      onEnterFocusMode: () => navRef.current?.onEnterFocusMode(),
      handleArchived: (kind: 'project' | 'area') => navRef.current?.handleArchived(kind),
      startCloseOutFull: (path: string) => navRef.current?.openCloseOut(path, 'full'),
    }),
    [],
  );
  // Which kept tabs have been visited (mounted) - a kept screen is mounted on
  // its first visit and then stays. Reset when the switch is turned off, and
  // when Settings → Advanced → "Reload all files" drops the kept tabs
  // (ui/keepAliveStore.ts's dropKeptTabs) so each loads again on its next visit.
  const visitedRef = useRef<Set<AppTab>>(new Set());
  const shownBeforeRef = useRef<Set<AppTab>>(new Set());
  const keptGenerationRef = useRef(getKeptTabsGeneration());
  if (keptGenerationRef.current !== getKeptTabsGeneration()) {
    keptGenerationRef.current = getKeptTabsGeneration();
    visitedRef.current.clear();
    shownBeforeRef.current.clear();
  }
  if (!keepTabsAlive) visitedRef.current.clear();
  else if (KEPT_TABS.includes(activeTab)) visitedRef.current.add(activeTab);
  // Showing an already-mounted kept screen has no "loading finished" edge to
  // trigger the e-ink refresh (src/utils/screenRefresh.ts) - request it here.
  useEffect(() => {
    if (!keepTabsAlive) {
      shownBeforeRef.current.clear();
      return;
    }
    if (!KEPT_TABS.includes(activeTab)) return;
    if (shownBeforeRef.current.has(activeTab)) requestEinkRefresh();
    shownBeforeRef.current.add(activeTab);
  }, [activeTab, keepTabsAlive]);
  // The kept screens' elements, created once (and for Current once per
  // item): the same element object on every App render lets React skip a
  // hidden screen entirely when App re-renders on a tab tap.
  const keptScreens = useMemo(
    () => ({
      projects: <ItemsList kind="project" onOpenItem={stableOpenItem} />,
      areas: <ItemsList kind="area" onOpenItem={stableOpenItem} />,
      daily: (
        <DailyView
          onOpenItem={stableOpenItem}
          onOpenInbox={stableNav.openInbox}
         
          onOpenCalendarSettings={stableNav.openSettingsCalendar}
          onEnterFocusMode={stableNav.onEnterFocusMode}
        />
      ),
      week: (
        <WeekView
          onOpenItem={stableOpenItem}
          onOpenInbox={stableNav.openInbox}
         
          onOpenCalendarSettings={stableNav.openSettingsCalendar}
        />
      ),
      month: (
        <MonthView
          onOpenItem={stableOpenItem}
         
          onOpenCalendarSettings={stableNav.openSettingsCalendar}
        />
      ),
      // Keyed by path: opening a different item gives a fresh screen, as it
      // always did when arriving from another tab.
      current: currentItem ? (
        <ItemDetail
          key={currentItem.path}
          kind={currentItem.kind}
          name={currentItem.name}
          path={currentItem.path}
          onArchived={stableNav.handleArchived}
         
          onOpenCalendarSettings={stableNav.openSettingsCalendar}
          onOpenItem={stableOpenItem}
          onStartCloseOut={stableNav.startCloseOutFull}
        />
      ) : (
        <View style={styles.emptyCurrent}>
          <Text style={[styles.emptyCurrentText, {color: textColor}]}>
            No Project or Area selected yet - open one from Projects or Areas.
          </Text>
        </View>
      ),
    }),
    [currentItem, stableOpenItem, stableNav, textColor],
  );

  // "Updated to x.y.z" notice (docs/dev/technical-design-about-debug-experimental.md
  // §3.6, P3). Only a tap on "What's new" or ✕ stores lastSeenVersion - not
  // merely showing it - because after an update the first start is often cut
  // short by the stale-build restart (StaleBuildBanner, which also wins the
  // status slot: warning outranks info), so the notice must survive to the
  // next start.
  const [whatsNewAcknowledged, setWhatsNewAcknowledged] = useState(false);
  const acknowledgeWhatsNew = () => {
    setWhatsNewAcknowledged(true);
    patchSettings({lastSeenVersion: BUILD_INFO.version})
      .then(setSettings)
      .catch(e => logError('App: storing lastSeenVersion failed', e instanceof Error ? e.message : String(e)));
  };
  const openSettingsAbout = () => {
    setSettingsTab('about');
    setActiveTab('settings');
    setMode('tabs');
  };
  const openSettingsAdvanced = () => {
    setSettingsTab('advanced');
    setActiveTab('settings');
    setMode('tabs');
  };

  // Profile switch (docs/dev/technical-design-profiles-demo-space.md §3.2-3.4):
  // save + load the profile files, drop every in-memory copy of the old data
  // set, then remount the shell (AppRoot's key). Quick Add edits were already
  // saved when the user left their tab for Settings.
  const switchToProfile = async (id: string) => {
    const next = await switchProfile(id);
    clearCachedData();
    clearCachedGmailInbox();
    clearReturnRecord();
    setActiveProfileId(next.activeProfileId);
    setFeatures(featuresOf(next));
    log('App: switched to profile', next.activeProfileId);
    onProfileSwitched();
  };
  // One-time Inbox move (docs/dev/technical-design-inbox-as-area.md §3.3):
  // the cache rebuild runs it, and its outcome is shown here once.
  const [inboxNotice, setInboxNotice] = useState<InboxMigrationNotice | null>(null);
  useEffect(() => {
    const check = () => {
      const notice = takeInboxMigrationNotice();
      if (notice) setInboxNotice(notice);
    };
    check(); // a rebuild may have finished before this subscribed
    return subscribeCache(check);
  }, []);
  useStatus(
    'app.inboxMigration',
    inboxNotice ? {kind: inboxNotice.kind, scope: 'global', text: inboxNotice.text, onDismiss: () => setInboxNotice(null)} : null,
  );
  const showWhatsNew =
    settings !== null && !whatsNewAcknowledged && shouldShowWhatsNew(settings.lastSeenVersion, BUILD_INFO);
  useStatus(
    'app.whatsNew',
    showWhatsNew
      ? {
          kind: 'info',
          scope: 'global',
          text: `Updated to gtdpara ${BUILD_INFO.version}.`,
          actions: [
            {
              label: "What's new",
              primary: true,
              onPress: () => {
                acknowledgeWhatsNew();
                openSettingsAbout();
              },
            },
          ],
          onDismiss: acknowledgeWhatsNew,
        }
      : null,
  );

  if (mode === 'loading') {
    return (
      <View style={styles.loading}>
        <ActivityIndicator />
      </View>
    );
  }

  // Shared by Projects/Areas/Daily's "open this Project/Area" action,
  // CaptureScreen's "Save & View", screens/ReviewScreen.tsx's own cards, and
  // (2026-09-09) every Files pane's Browse tab (screens/InboxScreen.tsx,
  // screens/ItemDetail.tsx) - all just want to land on the "Current" tab
  // showing this item.
  const openItem = (kind: 'project' | 'area', entry: FolderEntry) => {
    perfBegin('nav', 'current', {from: activeTab, via: 'openItem'});
    setCurrentItem({kind, name: entry.name, path: entry.path});
    setActiveTab('current');
    setMode('tabs');
  };
  openItemRef.current = openItem;

  const openDaily = () => {
    setActiveTab('daily');
    setMode('tabs');
  };

  // Daily's "Focus mode" button (focusMode=false) calls this to switch into
  // focus mode (docs/dev/technical-design-now-focus-mode.md §4.1). Entering
  // never itself marks anything #now - if some tasks already carry it from
  // earlier, the filtered view already reflects that the instant it renders;
  // otherwise focus mode's own Picker state is what's shown. Persists the
  // flag first so a reopen mid-transition still resolves correctly.
  const onEnterFocusMode = () => {
    if (!settings) return;
    const next = {...settings, focusModeActive: true};
    setSettings(next);
    saveSettings(next).catch(e =>
      logError('App: saving focusModeActive=true failed', e instanceof Error ? e.message : String(e)),
    );
    setMode('focus');
  };

  // Focus mode's own exit mark calls this (§4.2). Always ends the session
  // outright - it does not itself clear any #now tags (docs/technical-
  // design-now-focus-mode.md §5 - the flag plus whatever's still #now *is*
  // the entire state; nothing else needs resetting). Lands back on normal
  // Daily specifically, not just "whatever tabs mode was" - activeTab was
  // never touched while in 'focus' mode, but setting it explicitly here is
  // cheap and removes any doubt.
  const onExitFocusMode = () => {
    if (settings) {
      const next = {...settings, focusModeActive: false};
      setSettings(next);
      saveSettings(next).catch(e =>
        logError('App: saving focusModeActive=false failed', e instanceof Error ? e.message : String(e)),
      );
    }
    setActiveTab('daily');
    setMode('tabs');
  };

  // DailyView's/WeekView's Inbox-sourced rows use this to jump here (their
  // group header/source subtext) instead of onOpenItem, since there's no
  // Project/Area to open for those (docs/dev/technical-design-inbox-tab.md §3).
  const openInbox = () => {
    setActiveTab('inbox');
    setMode('tabs');
  };

  // Every calendar-showing surface's Google mini-tab (ui/GoogleCalendarPanel.tsx)
  // empty state calls this when no ICS URL is configured yet (docs/
  // technical-design-google-calendar.md §9) - lands on Settings' Calendar
  // sub-tab specifically, not just Settings in general.
  const openSettingsCalendar = () => {
    setSettingsTab('calendar');
    setActiveTab('settings');
    setMode('tabs');
  };

  // TabBar's own tab taps go through this rather than setActiveTab directly,
  // so a direct tap on the Settings tab always resets settingsTab back to
  // its normal default - otherwise a leftover 'calendar' from an earlier
  // openSettingsCalendar() jump would keep winning on every future visit,
  // even ones that had nothing to do with Calendar settings.
  const openCloseOut = (path: string, closeOutMode: 'full' | 'quick') => {
    setCloseOut({path, mode: closeOutMode});
    setActiveTab('review');
    setMode('tabs');
  };

  // Leaving the wizard. After a successful archive the project folder is
  // gone - if the Current tab was showing it, clear it (same as
  // handleArchived does for ItemStatusPanel's direct archive).
  const handleCloseOutExit = (archived: boolean) => {
    if (archived && closeOut && currentItem?.path === closeOut.path) setCurrentItem(null);
    setCloseOut(null);
  };

  const closeHelp = () => {
    if (helpPage === null) return;
    setHelpPage(null);
    // Revealing the already-mounted screen behind has no load edge of its own.
    requestEinkRefresh();
  };
  const toggleHelp = () => {
    if (helpPage !== null) {
      closeHelp();
      return;
    }
    const page = helpStartPage(activeTab, lastHelpRef.current, new Set(Object.keys(USER_DOCS.pages)));
    lastHelpRef.current = {tab: activeTab, pageId: page};
    setHelpPage(page);
  };
  const selectHelpPage = (pageId: string) => {
    lastHelpRef.current = {tab: activeTab, pageId};
    setHelpPage(pageId);
  };

  const handleSelectTab = (tab: AppTab) => {
    closeHelp();
    perfBegin('tab', tab, {from: activeTab});
    perfMark('tab:press');
    if (tab === 'settings') setSettingsTab('folders');
    setActiveTab(tab);
  };

  // ItemStatusPanel's Archive action (via ItemDetail) calls this once the
  // item's folder has actually moved - `currentItem.path` no longer points
  // at anything under Projects/Areas, so there's nothing left to show on
  // the "Current" tab. Lands back on whichever list (Projects/Areas) this
  // item came from, same as closing out of it normally would.
  const handleArchived = (kind: 'project' | 'area') => {
    setCurrentItem(null);
    setActiveTab(kind === 'project' ? 'projects' : 'areas');
  };

  // Passed to ReviewScreen as onReviewRecorded - re-loads settings so the
  // Review tab's badge updates the moment a step visit is written to
  // settings.reviewSteps, without waiting for the next reorient().
  const refreshSettings = () => {
    loadSettings()
      .then(setSettings)
      .catch(e => logError('App: refreshSettings failed', e instanceof Error ? e.message : String(e)));
  };

  if (mode === 'capture') {
    // The lasso-capture overlay gets the status slot at its top too (D11).
    return (
      <View style={styles.root}>
        <StatusFrame>
          <CaptureScreen key={captureNonce} onOpenItem={stableOpenItem} onOpenDaily={openDaily} />
        </StatusFrame>
      </View>
    );
  }

  // Focus mode (docs/dev/technical-design-now-focus-mode.md §4): the exact same
  // DailyView instance 'tabs' mode's Daily tab renders below, just with
  // focusMode on - no separate screen component, no separate data load.
  // Rendered here, before the TabBar-wrapped 'tabs' branch, the same way
  // 'capture' above always was - "full-screen, no TabBar" is a shape this
  // app already had.
  if (mode === 'focus') {
    // The status slot sits at the very top of focus mode (D4) - it's
    // normally empty there.
    return (
      <View style={styles.root}>
        <StatusFrame>
          <DailyView
            focusMode
            onExitFocusMode={onExitFocusMode}
            onOpenItem={stableOpenItem}
            onOpenInbox={openInbox}
            onOpenCalendarSettings={openSettingsCalendar}
          />
        </StatusFrame>
      </View>
    );
  }

  const handleClose = () => PluginManager.closePluginView();
  navRef.current = {openInbox, openSettingsCalendar, onEnterFocusMode, handleArchived, openCloseOut};

  // Tabs that are never kept alive - rendered while visible, in both modes.
  const nonKeptBody = (
    <>
      {activeTab === 'inbox' && (
        <InboxScreen
         
          onOpenCalendarSettings={openSettingsCalendar}
          onOpenItem={stableOpenItem}
        />
      )}
      {activeTab === 'review' &&
        (closeOut ? (
          <CloseOutWizard
            key={`${closeOut.path}|${closeOut.mode}`}
            projectPath={closeOut.path}
            mode={closeOut.mode}
            onExit={handleCloseOutExit}
           
          />
        ) : (
          <ReviewScreen
            onOpenItem={stableOpenItem}
            onReviewRecorded={refreshSettings}
           
            onOpenCalendarSettings={openSettingsCalendar}
            onStartCloseOut={openCloseOut}
          />
        ))}
      {activeTab === 'settings' && (
        <Settings initialTab={settingsTab} onSwitchProfile={switchToProfile} />
      )}
    </>
  );

  return (
    <View style={styles.root}>
      <TabBar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onClose={handleClose}
        reviewOverdue={isReviewOverdue(settings?.reviewSteps ?? {}, new Date(), activeReviewSteps(features))}
        profileLabel={
          settings && settings.activeProfileId !== DEFAULT_PROFILE_ID ? settings.activeProfileId.toUpperCase() : null
        }
        onProfilePress={openSettingsAdvanced}
        helpOpen={helpPage !== null}
        onHelpPress={toggleHelp}
      />
      {/* Central status slot (docs/dev/technical-design-status-slot.md): a fixed
          strip right under the TabBar, then the active tab's body. */}
      <StatusFrame>
        <View style={styles.body}>
          {keepTabsAlive ? (
            <>
              {KEPT_TABS.map(tab =>
                visitedRef.current.has(tab) ? (
                  <KeptTab key={tab} tab={tab} active={activeTab === tab}>
                    {keptScreens[tab as keyof typeof keptScreens]}
                  </KeptTab>
                ) : null,
              )}
              {nonKeptBody}
            </>
          ) : (
            // "Keep tabs in memory" off: exactly the previous behavior - the
            // active tab's screen is mounted, every other one unmounted.
            <>
              {activeTab === 'projects' && (
                <ItemsList
                  kind="project"
                  onOpenItem={stableOpenItem}
                 
                />
              )}
              {activeTab === 'areas' && (
                <ItemsList
                  kind="area"
                  onOpenItem={stableOpenItem}
                 
                />
              )}
              {activeTab === 'daily' && (
                <DailyView
                  onOpenItem={stableOpenItem}
                  onOpenInbox={openInbox}
                 
                  onOpenCalendarSettings={openSettingsCalendar}
                  onEnterFocusMode={onEnterFocusMode}
                />
              )}
              {activeTab === 'week' && (
                <WeekView
                  onOpenItem={stableOpenItem}
                  onOpenInbox={openInbox}
                 
                  onOpenCalendarSettings={openSettingsCalendar}
                />
              )}
              {activeTab === 'month' && (
                <MonthView
                  onOpenItem={stableOpenItem}
                 
                  onOpenCalendarSettings={openSettingsCalendar}
                />
              )}
              {activeTab === 'current' &&
                (currentItem ? (
                  <ItemDetail
                    kind={currentItem.kind}
                    name={currentItem.name}
                    path={currentItem.path}
                    onArchived={handleArchived}
                   
                    onOpenCalendarSettings={openSettingsCalendar}
                    onOpenItem={stableOpenItem}
                    onStartCloseOut={path => openCloseOut(path, 'full')}
                  />
                ) : (
                  <View style={styles.emptyCurrent}>
                    <Text style={[styles.emptyCurrentText, {color: textColor}]}>
                      No Project or Area selected yet - open one from Projects or Areas.
                    </Text>
                  </View>
                ))}
              {nonKeptBody}
            </>
          )}
          {helpPage !== null && <HelpOverlay pageId={helpPage} onSelectPage={selectHelpPage} onClose={closeHelp} />}
        </View>
      </StatusFrame>
    </View>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
  },
  root: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  body: {
    flex: 1,
  },
  emptyCurrent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyCurrentText: {
    fontSize: FONT.medium,
    opacity: 0.6,
    textAlign: 'center',
  },
});
