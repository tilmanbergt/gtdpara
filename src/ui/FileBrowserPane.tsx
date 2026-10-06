/**
 * The folder-stack file browser pane, extracted from screens/ItemDetail.tsx
 * (technical-design-linked-files.md §5) once a second caller (screens/
 * InboxScreen.tsx's rebuilt left pane) needed the same shape - same "extract
 * once a second caller needs the same shape" bar ui/TaskRow.tsx/
 * ui/FileToPicker.tsx were built to.
 *
 * Renders one or more `roots` (a MiniTabs row when there's more than one -
 * ItemDetail's own "Project Files"/"Resources" tabs; a single unlabeled root
 * for Inbox, which only ever browses Resources) and drills into folders via
 * an in-pane navigation stack, same live-scan-every-level behavior
 * ItemDetail always had (no caching - drilling back into an already-seen
 * folder rescans it).
 *
 * `linkTarget` drives three states beyond that plain "browse and open"
 * default:
 * - `null` - today's ItemDetail behavior exactly: tap a folder to drill in,
 *   tap a file to open it via `onOpenFile`.
 * - `{mode: 'locating', ...}` - switches to `root`, drills the stack to
 *   `folderPath`, and (once entries load) pages to whichever page contains
 *   `fileName` (ui/pagination.ts's `JumpTo`/`usePagedByHeight`), highlighting
 *   that row with a solid black left border (deliberately not the app's
 *   usual blue `rowEditing` - the one deliberate e-ink-legibility exception
 *   across this whole feature, per the UX rounds). If `fileMissing`, the
 *   pane still navigates to `folderPath` but nothing gets the highlight.
 * - `{mode: 'arming', onPick}` - tabs/drilling keep working; the pick
 *   message (`label`, or ARMING_TEXT's default) is published to the central
 *   status slot as a 'modal' with Cancel (docs/dev/technical-design-status-
 *   slot.md §7.2, 2026-09-29 - was an inline "Select Attachment  ✕" badge
 *   at the right end of the MiniTabs row, easily out of view). Tapping a
 *   *file* (not a folder) calls
 *   `onPick(activeRoot.key, relativePath)` (relative to that root's
 *   `rootPath`) instead of opening it; tapping `✕` calls `linkTarget.onCancel`.
 *
 * Pin (Resources root only, when `defaultSubfolder`/`onSetDefaultSubfolder`
 * are both set on a root): the breadcrumb row's trailing icon is the
 * outline pin when the currently-browsed subfolder isn't `defaultSubfolder`
 * (tap to call `onSetDefaultSubfolder`), filled and non-tappable when it
 * already matches. That root starts browsing at `defaultSubfolder` (once
 * it's the active root) rather than at `rootPath` itself, whenever one is
 * set.
 *
 * `entryFilter` (technical-design-project-area-assignment.md §4.2) - a root
 * can filter which entries show at its own top level only (a folder
 * entered from there shows its real, unfiltered contents). Used by the
 * Areas tab (Active-status areas only) and an Area's Project Files tab
 * (projects assigned to that Area only) - both cross-referencing the
 * shared cache, not the raw filesystem listing.
 *
 * `LinkTarget`'s `arming` variant also gained `pickKind`/`label`/`root`
 * for area-assignment: `pickKind: 'folder'` makes a top-level folder tap
 * pick immediately (assign) rather than drill in, `label` sets the
 * status-slot pick message (ARMING_TEXT), and `root` (when set) auto-switches to
 * that root and resets to its top level when arming starts. All three are
 * additive - omitted, they reproduce today's file-linking arm exactly.
 *
 * `disabled` (2026-09-09, the Browse-tab rework below) - a root renders its
 * MiniTabs entry greyed out and non-tappable instead of disappearing from
 * `roots`. Replaces the earlier pattern (screens/InboxScreen.tsx/
 * screens/ReviewScreen.tsx/screens/ItemDetail.tsx used to filter a root out
 * of the array entirely, or swap the whole `roots` array, while arming) -
 * Tilman's "don't add/remove tabs, just change what tapping them does"
 * feedback: the tab set a screen offers should never visibly change shape
 * just because an arm/link started. Each caller computes `disabled` itself
 * (e.g. Resources while refile-arming, since Resources can never be a valid
 * refile destination) rather than this component inferring it.
 *
 * `sources` + `onNavigateToItem` (2026-09-09, reworked same day into a
 * two-level structure per Tilman's follow-up feedback) - a composite
 * "Browse" root: instead of one `rootPath`, its top level (depth 0) is a
 * synthetic, in-memory pair of entries, one per `source` (its `label` -
 * "Projects"/"Areas" - and `path`), never a real directory scan. A depth-0
 * tap always just drills in, exactly like tapping any other folder -
 * regardless of arm state - landing one level down on that source's own
 * real, unfiltered-by-tap directory listing (an ordinary single-directory
 * scan of `source.path`, same as any other root; `entryFilter` and the
 * pick/navigate behaviors below all apply at *this* depth, not depth 0).
 * `rootPath` is still required on a `sources` root purely for the stack's
 * own depth-0 bookkeeping (breadcrumb label, "Up" availability, the target
 * `buildStack` resets to) - it's never actually scanned.
 *
 * Tap behavior one level below a `sources` root's depth-0 chooser (i.e. once
 * "Projects" or "Areas" has been drilled into), in priority order - this is
 * the *only* level where picking/navigating ever fires; depth 0 above it,
 * and depth 2+ below it, always just drill in as plain browsing:
 * 1. `arming` with `pickKind: 'folder'` (refile, or area-assignment via
 *    `startAt` below) - picks immediately, same as any other root, but
 *    since this level's entries came from a `source` rather than a single
 *    root-wide `rootPath`, the callback gets `(source.kind === 'project' ?
 *    'projects' : 'areas', entry.name)` - deliberately the exact (root,
 *    relativePath) shape storage/inboxFiling.ts's resolveFilingPick already
 *    expects, so no caller-side pick handler needed a single line of change
 *    for this.
 * 2. `arming` with the default `pickKind: 'file'` (linking) - falls through
 *    to the ordinary "folder tap drills in" behavior, letting the user open
 *    a Project/Area and pick an actual file inside it exactly like any
 *    other root.
 * 3. Not arming at all (`linkTarget` null) - `onNavigateToItem` fires
 *    instead of drilling in, if the root provided one. This is the one
 *    genuinely new interaction FileBrowserPane didn't have before: jumping
 *    the whole app to that Project/Area (App.tsx's `openItem`) rather than
 *    browsing its files in place. Below this level, or with no
 *    `onNavigateItem` set, a folder tap always just drills in as normal.
 *
 * `sources` roots use `PAGE_SIZE.browse` (smaller than `PAGE_SIZE.full`,
 * ui/pagination.ts) for their real listings - the depth-0 chooser only ever
 * has two entries, so page size there is moot.
 *
 * `startAt` (LinkTarget's `arming` variant, 2026-09-09) - pairs with `root`
 * pointing at a `sources` root: instead of stopping at that root's own
 * depth-0 chooser, the auto-navigate-on-arm effect below drills straight
 * into the matching source's listing (skipping the "Projects"/"Areas" tap),
 * so an arm can land directly on "pick one of these Areas" without the user
 * having to tap through the chooser first. Used by area-assignment
 * (`startAt: 'area'`) once it moved from its own dedicated Areas root onto
 * Browse (technical-design-project-area-assignment.md §4.1 follow-up).
 * Refile-arming never sets it - it wants the user to choose Projects vs.
 * Areas explicitly - so it's still routed via Browse's ordinary depth-0
 * chooser.
 *
 * Alphabetical ordering (2026-09-10, technical-design-daily-focus-panel.md
 * §5a) - a real folder scan's entries are now sorted by `name`
 * (locale-aware, case-insensitive) before rendering, rather than whatever
 * order `listFolderEntries` happened to return (raw OS directory order,
 * unspecified). Applies to every root uniformly, not just Daily's new ones -
 * no existing caller depended on directory-scan order meaning anything, so
 * this is a pure improvement with no opt-in flag. The `sources` root's own
 * synthetic depth-0 chooser is deliberately exempt - it's a fixed two-entry,
 * caller-declared list ("Projects" then "Areas"), not a scan, and sorting it
 * would silently flip that declared order.
 *
 * `pageSize` (`FileBrowserRoot`, 2026-09-10, same design doc) - per-root
 * override of the `isSourcesRoot ? PAGE_SIZE.browse : PAGE_SIZE.full`
 * default, for a caller whose available space doesn't fit either of those
 * (Daily/Weekly's Focus/Projects/Areas panel, sized to its own fixed
 * slot-count row budget - see `ui/pagination.ts`'s
 * `PAGE_SIZE.dailyFocusPanel`/`.weeklyFocusPanel`). **Superseded 2026-09-17**
 * by the component-level `viewportHeight` prop below - this field is no
 * longer read by `FileBrowserPane` itself (kept on the type for now rather
 * than as a breaking removal; no caller sets it any more either, see
 * `viewportHeight`'s own doc comment for where the equivalent pixel value
 * now comes from).
 *
 * Self-measuring, tabbed-pane follow-on (2026-09-17, [[feature_pagination_
 * fixed_height]]): `viewportHeight` is now an optional prop (see its own
 * doc comment below) - unlike every other converted row-list component,
 * this one previously had no `viewportHeight` prop at all and always sized
 * itself from a fixed row-COUNT (`pageSize` above) rather than a caller-
 * supplied pixel budget, so the old `pageSize`-derived formula
 * (`fileBrowserViewportHeightPx`, still exported below) now only fires for
 * a caller that explicitly passes a pixel value - two contexts that were
 * confirmed sole-occupant/composability cases (`ItemDetail.tsx`'s
 * `filesArea`, `InboxScreen.tsx`'s `leftPane`) get self-measuring for free
 * by omitting the prop, same as every other conversion this session.
 * `DailyFocusPanel.tsx`/`WeeklyFocusPanel.tsx`'s Projects/Areas tabs are
 * NOT yet converted - their own embedding context needs its own check
 * first (memory: feature_pagination_fixed_height.md's "Next steps") - so
 * they keep passing an explicit `fileBrowserViewportHeightPx(pageSize)`
 * value for now, reproducing today's exact pixel behavior unchanged.
 */
import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, StyleSheet, Text, View} from 'react-native';
import {FolderEntry, listFolderEntries, openPath, subscribeFolderChanges} from '../supernote/fileSystem';
import {log, logError} from '../utils/log';
import {requestEinkRefresh, useEinkRefreshOnLoad} from '../utils/screenRefresh';
import MiniTabs from './MiniTabs';
import PagedSection from './PagedSection';
import {JumpTo} from './pagination';
import {activeLineEstimator} from './textLineEstimator';
import {PinIcon} from './icons';
import {common} from './commonStyles';
import {FONT} from './theme';
import {useStatus, useErrorStatus} from './status/StatusProvider';
import {errorMessage} from '../utils/errorMessage';

// Right column width this pane renders in when it's the left half of a
// two-column screen (screens/ItemDetail.tsx, screens/InboxScreen.tsx, both
// plain flex:1 two-column splits) - docs/dev/design-device-rendering.md §5.1's
// two-column convention, same derivation and same constant every Batch 2
// screen (screens/ProjectDataPanel.tsx/screens/InboxScreen.tsx) already
// uses for its own row-height estimates. Daily view's Focus/Projects/Areas
// panel (its own `pageSize` override below) renders this pane narrower than
// that, but reuses the same estimator with the same width figure regardless
// - same "starting point, not yet verified for that narrower caller"
// caveat those two files' own COLUMN_WIDTH_PX comments already carry.
const COLUMN_WIDTH_PX = 678;

/**
 * Entry row height (Batch 3, 2026-09-15, docs/dev/technical-design-pagination-
 * fixed-height.md §3.8) - closes the one genuine gap in this app's row-
 * height story (§2.2 there): unlike every other row type, entries here
 * never had a `numberOfLines` cap at all, so a long folder/file name could
 * wrap 3+ lines and blow past whatever a fixed-row-count `PAGE_SIZE` budget
 * assumed. Mirrors ui/TaskRow.tsx's/ui/MeetingRow.tsx's own
 * `taskRowLines`/`meetingRowLines` shape - same `activeLineEstimator`, same
 * `FONT.medium` line-height figure - but with no sibling icons to reserve
 * width for (an entry row is just its own text, unlike TaskRow's checkbox/
 * badges or MeetingRow's note/clip icons), so the full column width is
 * available to the estimator.
 */
const MAX_LINES = 2;
// paddingVertical (5, on `styles.entryRow`) + paddingVertical (5, again on
// `styles.entry` - docs/dev/design-device-rendering.md §5.2 already flagged
// this "padding applied twice, on the row wrapper and the text" shape as
// this row's real chrome, confirmed off a real screenshot's ~41px single-
// line total) each counted twice (top+bottom) = 20.
const FILE_ENTRY_CHROME_PX = 5 * 2 + 5 * 2;
// Same FONT.medium line-height figure ui/TaskRow.tsx's own
// TASK_ROW_LINE_HEIGHT_PX uses, for the same reason MeetingRow's normal-row
// estimator reuses it rather than re-deriving one - this row's title text
// is the same font size.
const FILE_ENTRY_LINE_HEIGHT_PX = 22;

/** The exact string this row renders - mirrors ui/MeetingRow.tsx's own
 * `meetingLineText` pattern of estimating the real displayed text, not just
 * the bare name, so the folder icon/arrow or file icon prefix/suffix count
 * toward the wrap width too. */
function fileEntryDisplayText(entry: FolderEntry): string {
  return entry.isFolder ? `📁 ${entry.name} ›` : `📄 ${entry.name}`;
}

export function fileEntryLines(entry: FolderEntry, columnWidthPx: number): number {
  const availableWidth = Math.max(1, columnWidthPx);
  return Math.min(MAX_LINES, activeLineEstimator.estimateLines(fileEntryDisplayText(entry), availableWidth, FONT.medium));
}

export function fileEntryHeight(entry: FolderEntry, columnWidthPx: number): number {
  return FILE_ENTRY_CHROME_PX + fileEntryLines(entry, columnWidthPx) * FILE_ENTRY_LINE_HEIGHT_PX;
}

/**
 * "N single-line rows" in px, same total-pixel-budget-preserving conversion
 * Batch 2 applied to `PAGE_SIZE.projectTodos`/etc. Pulled out to a standalone
 * exported function (2026-09-17, [[feature_pagination_fixed_height]]'s
 * self-measuring follow-on) so a caller not yet safe to self-measure
 * (`DailyFocusPanel.tsx`/`WeeklyFocusPanel.tsx` today) can still pass an
 * explicit `viewportHeight` that reproduces this component's old always-
 * pageSize-derived sizing exactly, rather than losing that option once
 * `viewportHeight` became optional-and-self-measuring-by-default.
 */
export function fileBrowserViewportHeightPx(pageSize: number): number {
  return pageSize * (FILE_ENTRY_CHROME_PX + FILE_ENTRY_LINE_HEIGHT_PX);
}

export interface FileBrowserRoot {
  /** 'project' | 'resources' | 'areas' | 'area' - matches technical-design-linked-files.md §5/§8's and technical-design-project-area-assignment.md §4.2's LinkTarget/EditTarget root keys. */
  key: string;
  /** MiniTabs label - "Project Files" / "Resources" / "Areas" / "Area Files". */
  label: string;
  /** Absolute path this root starts browsing at. */
  rootPath: string;
  /** Resources root only - lets the pane render the pin and start at the pinned subfolder instead of rootPath. Relative to rootPath; '' or undefined/null = no pin set. */
  defaultSubfolder?: string | null;
  onSetDefaultSubfolder?: (subfolderRelativePath: string) => void;
  /**
   * Applied ONLY to entries at this root's own pick/navigate level (depth 0
   * normally; one level below a `sources` root's depth-0 chooser - see the
   * module doc comment) - a folder entered from there shows its real,
   * unfiltered contents (technical-design-project-area-assignment.md §4.2).
   * Used by an Area's Project Files tab (assigned-to-this-area-only) and by
   * Browse's own `sources` (active-status-only). Omitted (undefined) for
   * every other root - no behavior change there.
   */
  entryFilter?: (entry: FolderEntry) => boolean;
  /** Greys this root's MiniTabs entry out and makes it non-tappable, without removing it from `roots` - see the module doc comment's `disabled` note. Omitted/false = enabled, today's behavior for every existing caller. */
  disabled?: boolean;
  /** Composite "Browse" root only - see the module doc comment's `sources`/`onNavigateToItem` note. Each entry becomes one synthetic depth-0 folder (`label`), which - once tapped - drills into an ordinary scan of `path`. `kind` tags that listing for pick/navigate purposes one level down. */
  sources?: {kind: 'project' | 'area'; path: string; label: string}[];
  /** Composite "Browse" root only - fires on a tap, one level below the depth-0 chooser, of an entry inside one of `sources`' listings, when `linkTarget` is null (plain browsing, not arming) - see the module doc comment's tap-priority note. Ignored elsewhere, and ignored entirely on a root with no `sources`. */
  onNavigateToItem?: (kind: 'project' | 'area', name: string, path: string) => void;
  /** Overrides this root's page size (see the module doc comment's `pageSize` note) - defaults to `isSourcesRoot ? PAGE_SIZE.browse : PAGE_SIZE.full` when omitted. **Superseded 2026-09-17, no longer read by `FileBrowserPane`** - use the component-level `viewportHeight` prop (with `fileBrowserViewportHeightPx`) instead. */
  pageSize?: number;
}

/**
 * Pick-message texts for the central status slot (docs/dev/technical-design-
 * status-slot.md D14) - longer than the old badge labels, saying what to tap.
 */
export const ARMING_TEXT = {
  default: 'Select attachment: tap a file to link it',
  link: (type: 'task' | 'meeting') => `Select attachment: tap a file to link it to this ${type === 'task' ? 'todo' : 'meeting'}`,
  refile: (type: 'task' | 'meeting') => `Refile: tap the Project or Area to move this ${type === 'task' ? 'todo' : 'meeting'} to`,
  area: 'Select Area: tap the Area this project belongs to',
  focus: (scope: 'daily' | 'weekly' | 'monthly', kind: 'project' | 'area') =>
    `${scope === 'daily' ? "Today's" : scope === 'weekly' ? "This week's" : "This month's"} focus: tap the ${
      kind === 'project' ? 'Project' : 'Area'
    } to add`,
} as const;

/** Per-instance suffix for this pane's status-slot id (several panes can be mounted at once). */
let nextPaneInstance = 0;

export type LinkTarget =
  | {mode: 'locating'; root: string; folderPath: string; fileName: string; fileMissing: boolean}
  | {
      mode: 'arming';
      onPick: (root: string, relativePath: string) => void;
      onCancel: () => void;
      /**
       * 'file' (default, omitted) = today's linked-files behavior
       * unchanged: a folder tap always drills in, only a file tap picks.
       * 'folder' = a folder tap at the root's own pick/navigate level
       * (depth 0 normally; one level below a `sources` root's depth-0
       * chooser - see the module doc comment) picks immediately instead of
       * drilling in; elsewhere, taps still drill in normally, so a user can
       * look inside e.g. an Area before committing
       * (technical-design-project-area-assignment.md §4.2).
       */
      pickKind?: 'file' | 'folder';
      /** The pick message shown in the central status slot while armed - see ARMING_TEXT. Defaults to ARMING_TEXT.default when omitted. */
      label?: string;
      /** When set, arming switches the active root to this key and resets the stack to its top level (same auto-navigate shape `locating` already has) - used by refile-arming and area-assignment so the pick always starts at the Browse root. Omitted for today's file-linking arm, which starts wherever the user is already browsing. */
      root?: string;
      /** Composite `sources` roots only, paired with `root` - skips straight past that root's depth-0 "Projects"/"Areas" chooser into the matching source's own listing, instead of stopping at the chooser (see the module doc comment's `startAt` note). Omitted = stop at the chooser (refile-arming's own behavior, letting the user choose Projects vs. Areas). */
      startAt?: 'project' | 'area';
    };

interface Props {
  /** 1 root (Inbox) -> MiniTabs omitted; 2 roots (Current) -> MiniTabs shown. */
  roots: FileBrowserRoot[];
  /** Drives the black-line auto-locate, or the armed pick state - see the module doc comment. `arming`'s own `onCancel` (not a separate prop here) is what the status slot's Cancel calls - it's bundled into LinkTarget itself so the caller that owns armTarget (screens/ProjectDataPanel.tsx/screens/InboxScreen.tsx) can report it through the same onLinkTargetChange channel as everything else, rather than needing a second callback-registration path back down into whichever screen owns the edit/arm state. */
  linkTarget: LinkTarget | null;
  /** Same resetKey convention ui/pagination.ts's hooks already use - pass something that changes whenever the caller's own identity changes (e.g. the item's path), so a newly-mounted pane for a different item doesn't inherit a stale drill/page position. */
  resetKey?: string;
  /**
   * Fires with the currently-displayed root key and its absolute folder
   * path every time either changes (root switch, drill in/out, Up) - the
   * opposite direction from `linkTarget`'s own bubble-up, added for
   * screens/ItemDetail.tsx's "Note" quick-add tab (memory:
   * feature_standalone_note_quickadd.md) to know where a new standalone
   * note would land. Optional - omitted by every caller that doesn't need
   * it (screens/InboxScreen.tsx).
   */
  onActiveLocationChange?: (rootKey: string, folderPath: string) => void;
  /**
   * The internal `PagedSection`'s own fixed viewport, in px.
   *
   * Optional (2026-09-17, [[feature_pagination_fixed_height]]'s self-
   * measuring follow-on) - omitted, this component's own root gets a
   * conditional `flex:1` (mirrors `ui/GoogleCalendarPanel.tsx`'s own
   * treatment) and forwards `undefined` straight into the internal
   * `PagedSection`, which self-measures on its own. Passed explicitly, it
   * bypasses that entirely and goes straight to `PagedSection` - the old
   * `pageSize`-derived pixel formula (now `fileBrowserViewportHeightPx`,
   * exported above) is how a caller reproduces the previous always-fixed
   * behavior while its own embedding context isn't yet confirmed safe to
   * self-measure.
   */
  viewportHeight?: number;
  textColor: string;
  borderColor: string;
}

interface StackLevel {
  name: string;
  path: string;
}

/** `path` relative to `root`, or `path` unchanged if it isn't actually under `root` (shouldn't happen for anything this pane itself navigated to). */
function relativeToRoot(root: string, path: string): string {
  const prefix = `${root.replace(/\/+$/, '')}/`;
  return path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

export default function FileBrowserPane({
  roots,
  linkTarget,
  resetKey,
  onActiveLocationChange,
  viewportHeight,
  textColor,
  borderColor,
}: Props): React.JSX.Element {
  // See `viewportHeight`'s own doc comment above.
  const selfMeasuring = viewportHeight == null;
  const [activeRootKey, setActiveRootKey] = useState(roots[0]?.key);
  const activeRoot = roots.find(r => r.key === activeRootKey) ?? roots[0];

  /**
   * Builds the full navigation stack from `root` down to `relativePath`
   * (or just the root level if it's empty/null) - never a single collapsed
   * level for a non-root destination, so "‹ Up" (depth > 0 below) stays
   * available all the way back to the root, and only disappears once
   * you're actually *at* the root. Used both for the pin's defaultSubfolder
   * starting point and for `locating` mode's auto-navigate-to-a-linked-
   * file's folderPath - both need identical "build down, don't collapse"
   * behavior. (Re-fixes a regression: this exact bug - and exactly this
   * fix - was already found and documented during the linked-files feature
   * work, but the version that made it onto the device had lost it -
   * caught 2026-09-07 via Tilman reporting getting stuck unable to navigate
   * above a pinned Resources subfolder.)
   */
  const buildStack = (root: FileBrowserRoot, relativePath: string | null | undefined): StackLevel[] => {
    const rootPath = root.rootPath.replace(/\/+$/, '');
    const levels: StackLevel[] = [{name: root.label, path: rootPath}];
    if (!relativePath) return levels;
    let cur = rootPath;
    for (const segment of relativePath.split('/').filter(Boolean)) {
      cur = `${cur}/${segment}`;
      levels.push({name: segment, path: cur});
    }
    return levels;
  };

  const [stack, setStack] = useState<StackLevel[]>([{name: activeRoot?.label ?? '', path: activeRoot?.rootPath ?? ''}]);
  const [entries, setEntries] = useState<FolderEntry[]>([]);
  const [loading, setLoading] = useState(true);
  // Explicit e-ink refresh once a folder listing actually lands - see
  // src/utils/screenRefresh.ts.
  useEinkRefreshOnLoad(loading);
  const [error, setError] = useState<string | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  useErrorStatus('FileBrowserPane.openError', openError, () => setOpenError(null));

  // Armed pick -> central status slot (docs/dev/technical-design-status-slot.md
  // §7.2). Cleared automatically when disarmed or when this pane unmounts
  // (e.g. on a tab switch, which also drops the arm state itself).
  const armingStatusId = useRef(`files.arming.${++nextPaneInstance}`).current;
  useStatus(
    armingStatusId,
    linkTarget?.mode === 'arming'
      ? {kind: 'modal', text: linkTarget.label ?? ARMING_TEXT.default, onCancel: linkTarget.onCancel}
      : null,
  );

  // Whenever the caller's own identity changes (resetKey), or the pane
  // switches roots on its own, start over at that root's starting path
  // (rootPath, or its pinned defaultSubfolder if set).
  useEffect(() => {
    if (!activeRoot) return;
    setStack(buildStack(activeRoot, activeRoot.defaultSubfolder));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRootKey, resetKey]);

  // `locating` mode: switch root and drill straight to folderPath whenever
  // linkTarget changes - see the module doc comment.
  useEffect(() => {
    if (!linkTarget || linkTarget.mode !== 'locating') return;
    const root = roots.find(r => r.key === linkTarget.root);
    if (!root) return;
    setActiveRootKey(root.key);
    setStack(buildStack(root, linkTarget.folderPath));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkTarget]);

  // `arming` mode with an explicit `root` (refile-arming, and area-
  // assignment's folder-pick, technical-design-project-area-assignment.md
  // §4.2): switch to that root and reset to its top level, same auto-
  // navigate shape as `locating` - always start the pick at Browse, not
  // wherever the pane was last browsing. Today's file-linking arm never
  // sets `root`, so it's unaffected by this effect.
  //
  // `startAt` (see the module doc comment) additionally drills one level
  // past a `sources` root's own depth-0 chooser, straight into the matching
  // source's listing - area-assignment's own arm.
  useEffect(() => {
    if (!linkTarget || linkTarget.mode !== 'arming' || !linkTarget.root) return;
    const root = roots.find(r => r.key === linkTarget.root);
    if (!root) return;
    setActiveRootKey(root.key);
    if (linkTarget.startAt && root.sources) {
      const source = root.sources.find(s => s.kind === linkTarget.startAt);
      if (source) {
        setStack([...buildStack(root, undefined), {name: source.label, path: source.path}]);
        return;
      }
    }
    setStack(buildStack(root, undefined));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linkTarget]);

  const current = stack[stack.length - 1];
  const depth = stack.length - 1;

  // Reports the currently-displayed root/folder up to the caller - see the
  // `onActiveLocationChange` doc comment above. Fires on every root switch,
  // drill-in, or Up, including the ones driven by the effects above
  // (locating/arming auto-navigate) - deliberately not gated on those, since
  // the caller cares about where the pane visibly ends up, not why it moved
  // there.
  useEffect(() => {
    if (!activeRootKey || !current) return;
    onActiveLocationChange?.(activeRootKey, current.path);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRootKey, current?.path]);

  // A `sources` root's depth-0 level is a synthetic two-entry chooser
  // ("Projects"/"Areas"), never a real directory scan - see FileBrowserRoot's
  // `sources` doc comment. Picking/navigating, and entryFilter, all apply
  // one level down instead of at depth 0 - `pickNavigateDepth` is that
  // level (1 for a `sources` root, 0 - unchanged - for every other root).
  const isSourcesRoot = !!activeRoot?.sources;
  const pickNavigateDepth = isSourcesRoot ? 1 : 0;
  const showSourceChooser = isSourcesRoot && depth === 0;

  // Rescan the shown folder when something creates or moves a file in it
  // (supernote/fileSystem.ts's folder-change notifications) - e.g. a Quick
  // Add note created right into this folder. Quiet: the old listing stays
  // on screen until the new one arrives (no loading state, no flicker).
  const [reloadTick, setReloadTick] = useState(0);
  const shownPathRef = useRef<string | null>(null);
  shownPathRef.current = current?.path ?? null;
  useEffect(
    () =>
      subscribeFolderChanges(folder => {
        if (folder === shownPathRef.current?.replace(/\/+$/, '')) setReloadTick(t => t + 1);
      }),
    [],
  );
  const loadedPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!current) return;
    if (showSourceChooser && activeRoot?.sources) {
      // Synthetic, in-memory - no scan needed (see the module doc comment).
      setEntries(activeRoot.sources.map(source => ({name: source.label, path: source.path, isFolder: true})));
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    const quiet = loadedPathRef.current === current.path;
    if (!quiet) setLoading(true);
    setError(null);
    (async () => {
      try {
        log('FileBrowserPane: loading', current.path, quiet ? '(refresh)' : '');
        const result = await listFolderEntries(current.path);
        // Alphabetical, locale-aware, case-insensitive - see the module doc
        // comment's 2026-09-10 note. A real scan only; the `sources` root's
        // synthetic depth-0 chooser is built separately, above, and is
        // deliberately left in its caller-declared order.
        const sorted = [...result].sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}));
        if (!cancelled) {
          setEntries(sorted);
          loadedPathRef.current = current.path;
          if (quiet) requestEinkRefresh();
        }
      } catch (e) {
        const message = errorMessage(e);
        logError('FileBrowserPane: load failed', current.path, message);
        if (!cancelled) setError(message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // Keyed on the path plus showSourceChooser (a stable boolean), not on
    // activeRoot/activeRoot.sources themselves - `sources` is a fresh array
    // literal every render (screens build `roots` inline), so depending on
    // its identity would rescan on every unrelated re-render. `current` is
    // also a fresh object every render for the same reason - only a real
    // level change (or genuinely entering/leaving the depth-0 chooser)
    // should trigger a rescan.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.path, showSourceChooser, reloadTick]);

  /** Which `sources` entry `current` (the folder actually being listed, one level below the depth-0 chooser) came from - null off a non-`sources` root, or above/below that level. Depends only on `current`, not on which of its child entries is being picked/navigated - every entry at pickNavigateDepth came from the same one source. */
  const currentSourceKind = (): 'project' | 'area' | null => {
    const source = activeRoot?.sources?.find(s => current?.path === s.path);
    return source?.kind ?? null;
  };

  // entryFilter applies ONLY at pickNavigateDepth (this root's own top
  // level, or one level below a `sources` root's depth-0 chooser) - a
  // folder entered from there shows its real, unfiltered contents (see
  // FileBrowserRoot's doc comment).
  const visibleEntries = depth === pickNavigateDepth && activeRoot?.entryFilter ? entries.filter(activeRoot.entryFilter) : entries;

  // Once entries for the locating target's folder have loaded, jump to
  // whichever page holds fileName (ui/pagination.ts's JumpTo/
  // usePagedByHeight - Batch 3, 2026-09-15) - no-op (null) if fileMissing,
  // or the file otherwise isn't there. `index` is the entry's own real
  // position in `visibleEntries` now, not a fixed-page-size-derived one -
  // see ui/pagination.ts's `JumpTo` doc comment on why the old
  // `pageIndexOf`-based detour is gone.
  const jumpTo: JumpTo | null =
    linkTarget?.mode === 'locating' && !linkTarget.fileMissing
      ? (() => {
          const index = visibleEntries.findIndex(e => e.name === linkTarget.fileName);
          return index === -1 ? null : {key: `${current?.path}:${linkTarget.fileName}`, index};
        })()
      : null;

  const handleOpenFolder = (entry: FolderEntry) => {
    setOpenError(null);
    setStack(prev => [...prev, {name: entry.name, path: entry.path}]);
  };

  const handleUp = () => {
    setOpenError(null);
    setStack(prev => (prev.length > 1 ? prev.slice(0, -1) : prev));
  };

  const handleEntryPress = async (entry: FolderEntry) => {
    // The depth-0 chooser on a `sources` root ("Projects"/"Areas") always
    // just drills in, regardless of arm state - see the module doc
    // comment's `sources` note. Picking/navigating only ever happens one
    // level below this.
    if (showSourceChooser) {
      handleOpenFolder(entry);
      return;
    }
    // Picking a folder itself only ever fires at pickNavigateDepth - see
    // LinkTarget's pickKind doc comment. Elsewhere, or with the default
    // 'file' pickKind, a folder tap always just drills in.
    if (linkTarget?.mode === 'arming' && linkTarget.pickKind === 'folder' && entry.isFolder && depth === pickNavigateDepth) {
      if (isSourcesRoot) {
        // A `sources` root has no single rootPath to compute a relativePath
        // against - synthesize the (root, relativePath) shape
        // storage/inboxFiling.ts's resolveFilingPick already expects
        // instead (see FileBrowserRoot's `sources` doc comment).
        const kind = currentSourceKind();
        if (kind) linkTarget.onPick(kind === 'project' ? 'projects' : 'areas', entry.name);
        return;
      }
      linkTarget.onPick(activeRoot.key, relativeToRoot(activeRoot.rootPath, entry.path));
      return;
    }
    // Plain browsing (not arming at all) at pickNavigateDepth on a
    // `sources` root - jump the app to that Project/Area instead of
    // drilling in, if the root offered a way to (see FileBrowserRoot's
    // `onNavigateToItem` doc comment). Arming with the default 'file'
    // pickKind (linking) skips this branch entirely and falls through to
    // the ordinary drill-in below, which is exactly what lets linking find
    // a file inside one of these folders.
    if (!linkTarget && isSourcesRoot && depth === pickNavigateDepth && activeRoot.onNavigateToItem && entry.isFolder) {
      const kind = currentSourceKind();
      if (kind) {
        activeRoot.onNavigateToItem(kind, entry.name, entry.path);
        return;
      }
    }
    if (entry.isFolder) {
      handleOpenFolder(entry);
      return;
    }
    if (linkTarget?.mode === 'arming' && (linkTarget.pickKind ?? 'file') === 'file') {
      linkTarget.onPick(activeRoot.key, relativeToRoot(activeRoot.rootPath, entry.path));
      return;
    }
    setOpenError(null);
    try {
      await openPath(entry.path);
    } catch (e) {
      const message = errorMessage(e);
      logError('FileBrowserPane: open failed', entry.path, message);
      setOpenError(`Couldn't open ${entry.name}: ${message}`);
    }
  };

  const currentSubfolder = activeRoot ? relativeToRoot(activeRoot.rootPath, current?.path ?? activeRoot.rootPath) : '';
  const showPin = !!activeRoot?.onSetDefaultSubfolder;
  const pinIsDefault = showPin && (activeRoot?.defaultSubfolder ?? '') === currentSubfolder;

  if (!activeRoot) {
    return <View />;
  }

  return (
    <View style={selfMeasuring ? styles.selfMeasuringRoot : undefined}>
      {roots.length > 1 ? (
        <View style={styles.tabsRow}>
          <MiniTabs
            tabs={roots.map(r => ({key: r.key, label: r.label, disabled: r.disabled}))}
            activeKey={activeRoot.key}
            onChange={key => setActiveRootKey(key)}
            textColor={textColor}
            borderColor={borderColor}
          />
        </View>
      ) : null}
      {/* Breadcrumb + "‹ Up" + pagination arrows merged into one PagedSection
          header (Batch 3, 2026-09-15, docs/dev/technical-design-pagination-
          fixed-height.md §3.8) - replaces the old separate paneHeaderRow +
          PageControls pair. "‹ Up" is a nested pressable <Text>, same
          pattern ui/TaskRow.tsx's tappable tag spans already use, since it
          has to live inside PagedSection's own header <Text> (see that
          component's `header` doc comment on why a View/Pressable can't
          nest there directly) - the pin button can't, so it's passed via
          `headerAccessory` instead, right after the header text and before
          the +N/arrows. Loading/error still render inside the same fixed-
          height box via `viewportContent`, so the header/breadcrumb/pin
          stay mounted and stable across a folder-load flicker instead of
          the whole section disappearing and reappearing. */}
      <PagedSection
        header={
          <>
            {depth > 0 && (
              <Text onPress={handleUp} style={styles.upTextNested}>
                {'‹ Up  '}
              </Text>
            )}
            {stack.map(level => level.name).join(' › ')}
          </>
        }
        headerAccessory={
          showPin ? (
            <Pressable
              onPress={() => !pinIsDefault && activeRoot.onSetDefaultSubfolder?.(currentSubfolder)}
              disabled={pinIsDefault}
              hitSlop={8}
              style={styles.pinButton}>
              <PinIcon color={textColor} filled={pinIsDefault} />
            </Pressable>
          ) : undefined
        }
        rows={loading || error ? [] : visibleEntries}
        rowHeight={entry => fileEntryHeight(entry, COLUMN_WIDTH_PX)}
        viewportHeight={viewportHeight}
        resetKey={current?.path}
        jumpTo={jumpTo}
        renderRow={entry => {
          const isLocateTarget =
            linkTarget?.mode === 'locating' && !entry.isFolder && !linkTarget.fileMissing && entry.name === linkTarget.fileName;
          // Pins the row's real rendered height to the same value its
          // rowHeight callback above summed toward viewportHeight - same
          // "reserved and rendered must agree exactly" contract ui/
          // TaskRow.tsx's/ui/MeetingRow.tsx's own `height` prop documents,
          // so a 2-line entry can't quietly grow taller than what
          // PagedSection budgeted for it (this row has no pre-existing
          // `minHeight` to fight with the way those two did, but pinning it
          // still keeps a mispredicted line count a clip inside the fixed
          // viewport - the safe failure mode - rather than a page-break
          // mismatch).
          const rowHeightPx = fileEntryHeight(entry, COLUMN_WIDTH_PX);
          return (
            <Pressable
              key={entry.path}
              onPress={() => handleEntryPress(entry)}
              style={[styles.entryRow, {height: rowHeightPx, minHeight: rowHeightPx}, isLocateTarget && styles.entryRowLocated]}>
              <Text
                style={[styles.entry, entry.isFolder && styles.entryLink, {color: textColor}]}
                numberOfLines={fileEntryLines(entry, COLUMN_WIDTH_PX)}>
                {fileEntryDisplayText(entry)}
              </Text>
            </Pressable>
          );
        }}
        emptyHint="This folder is empty."
        viewportContent={
          loading ? (
            <ActivityIndicator style={common.spacer} />
          ) : error ? (
            <Text style={[styles.error, {color: textColor}]}>⚠ {error}</Text>
          ) : undefined
        }
        textColor={textColor}
        borderColor={borderColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // See `viewportHeight`'s own doc comment - mirrors
  // ui/GoogleCalendarPanel.tsx's own `selfMeasuringRoot`.
  selfMeasuringRoot: {
    flex: 1,
  },
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  // Nested inside PagedSection's own header <Text> (see the render's own
  // comment on why) - a plain inline style, not a full row/button, since it
  // has to stay Text-compatible content.
  upTextNested: {
    fontWeight: '700',
  },
  pinButton: {
    marginLeft: 8,
    paddingHorizontal: 4,
  },
  error: {
    fontSize: FONT.small,
  },
  entryRow: {
    paddingVertical: 5,
  },
  entryRowLocated: {
    borderLeftWidth: 4,
    borderLeftColor: '#000000',
    paddingLeft: 4,
  },
  entry: {
    fontSize: FONT.medium,
    paddingVertical: 5,
    // Descender-clipping fix (2026-09-17, [[feature_pagination_fixed_height]])
    // - same fix confirmed on screens/ItemsList.tsx's own row Text: Android's
    // default `includeFontPadding` reserves space above cap-height without a
    // matching reservation below the baseline, so a fixed-height, top-aligned
    // row clips descenders at its own bottom edge.
    includeFontPadding: false,
  },
  entryLink: {
    fontWeight: '500',
  },
});
