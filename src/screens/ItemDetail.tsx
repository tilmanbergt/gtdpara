/**
 * ItemDetail — a single Project or Area.
 *
 * Rendered by App.tsx as the content of the "Current" tab (App.tsx's
 * tab-based navigation) whenever `currentItem` is set - no header/back
 * button of its own; switching tabs is the only navigation now.
 *
 * Left: ui/FileBrowserPane.tsx, with two roots (technical-design-linked-
 * files.md §5/§8) - 'project' (this item's own folder, always scoped to the
 * *project/area root* regardless of how deep the pane is drilled, same as
 * the Todos/Meetings on the right) and 'resources' (the user's shared
 * Resources folder, per domain/settings.ts's resolvePaths - the "attach an
 * existing file" flow's second, more common source). Extracted from this
 * screen's former single-root inline browser once screens/InboxScreen.tsx
 * needed the exact same shape - see FileBrowserPane's own module doc
 * comment for the roots/locating/arming/pin behavior it now owns.
 *
 * `linkTarget` (locating a linked file's row, or arming a "pick a file for
 * this task/meeting" selection) is owned by ProjectDataPanel - the right
 * pane's Todos/Meetings own the one edit-or-arm target for this whole
 * screen (technical-design-linked-files.md §8's EditTarget/armTarget) - and
 * reported up through `onLinkTargetChange` into this screen's own
 * `dataPanelLinkTarget` state.
 *
 * **Area-assignment arming** (technical-design-project-area-assignment.md
 * §4.1/§4.3) adds a second source of LinkTarget: ui/ItemStatusPanel.tsx's
 * "Assign to Area…" reports its own arming/cancel through
 * `onRequestAreaAssignment` into a *separate* `areaLinkTarget` state, rather
 * than sharing ProjectDataPanel's setter. They're merged as `linkTarget =
 * areaLinkTarget ?? dataPanelLinkTarget` (area-assignment wins whenever it's
 * active) before being threaded into FileBrowserPane. Two states instead of
 * one shared setter is a deliberate choice: ProjectDataPanel's own
 * onLinkTargetChange effect re-fires (with `null`) on any change to its
 * armTarget/editTarget/paths/etc. dependencies, including ones unrelated to
 * area-assignment - sharing one setter would risk that effect clobbering an
 * in-progress area-assignment arm out from under it. The accepted trade-off:
 * if a file-link edit/arm was already active in ProjectDataPanel when
 * area-assignment starts, canceling the area-assignment arm reveals
 * whatever ProjectDataPanel's own state still is (it was never told to
 * cancel) rather than restoring some prior "nothing armed" state - a rare
 * interaction, not worth building full bidirectional cancellation between
 * the two components for.
 *
 * `handleSetDefaultResourceFolder` (the Resources root's pin) is
 * deliberately NOT part of that edit/arm bubbling - it's its own small,
 * independent read-modify-write against this item's frontmatter (same
 * "extract, don't lift" / independent-load pattern ui/ItemStatusPanel.tsx
 * uses for Status+Archive), since pinning a subfolder has nothing to do
 * with which task/meeting is being edited.
 *
 * Right: ProjectDataPanel - the item's own Todos and Meetings, always
 * scoped to the project/area root.
 *
 * Left pane, pinned to the very TOP (2026-09-13, Tilman: "move now the
 * focus selection and display to the top of that column, above the file
 * panel"): ui/ItemFocusPanel.tsx - the Daily/Weekly focus checkboxes plus
 * the weekly-goal line (docs/dev/technical-design-item-goal-display.md). This
 * used to be part of ui/ItemStatusPanel.tsx (2026-09-09 through
 * 2026-09-13, right above Archive) - see that file's own module doc
 * comment for why it split into its own component once it needed a
 * position on the opposite side of Files from Status/Archive.
 *
 * Left pane, pinned to the very bottom: ui/ItemStatusPanel.tsx - Status +
 * Archive + Assign to Area (2026-09-03, docs/dev/technical-design-inbox-tab.md
 * §4: Status+Archive relocated here from the top of the right pane's
 * ProjectDataPanel, which now starts with its QuickAddWidget instead).
 * `onArchived` is sourced from here rather than ProjectDataPanel now, same
 * bubble-up shape as before. `styles.filesArea` wraps the Files title/
 * error/FileBrowserPane in its own `flex: 1` box (2026-09-09, per direct
 * feedback) so this panel always sits flush at the bottom of the left pane
 * regardless of how few or many files/folders are showing above it, rather
 * than trailing wherever FileBrowserPane's own (unpadded, page-length-
 * dependent) content happens to end. ui/ItemFocusPanel.tsx above it, by
 * contrast, is sized to its own content (no `flex: 1`) - it's pinned to the
 * top by document order alone, not by absorbing leftover space the way
 * `filesArea` does for the bottom panel.
 *
 * **File browser roots** (technical-design-project-area-assignment.md §4.4):
 * a Project always gets 'project'/'resources', plus a third 'area' root once
 * one is assigned, pointed at that Area's own folder. An Area always gets
 * 'project' (labeled "Area Files"), 'resources', and 'projectFiles' (every
 * Project whose `area` matches this one, via entryFilter). `findCachedItem`
 * (storage/dataCache.ts) is what that filter reads - the same already-warm
 * cache every other cross-item lookup in this app prefers over a filesystem
 * scan.
 *
 * Every kind also always gets one more: 'browse' (2026-09-09, Tilman's
 * "don't add/remove tabs, just switch tabs and change what tapping them
 * does" feedback) - a two-level, always-Active-only Projects/Areas browser
 * (ui/FileBrowserPane.tsx's `sources`) that's a permanent tab rather than
 * something conjured only while refile-arming, the way this used to work.
 * A Project used to also get a standalone 'areas' root (every Active area,
 * for area-assignment) - removed the same day, once Browse could reach the
 * same listing itself (`startAt: 'area'`, below).
 * `isRefileArming`/`isAreaAssignmentArming`/`disableOthersWhileArming` below
 * grey out every root except Browse (never remove them) while either a
 * refile or an area-assignment is being picked, and Browse itself handles
 * all three of "browse normally" (jumps the app to that item, via
 * `onOpenItem`), "picking" (refile or area-assignment), and "link-arming"
 * (drills in to find a file) on its own - see ui/FileBrowserPane.tsx's
 * `sources`/`onNavigateToItem`/`startAt` doc comments for how.
 *
 * Reloading: leaving the tab and "Reload all files" (Settings → Advanced)
 * remount this screen, which loads the item again; FileBrowserPane scans its
 * open folder itself whenever it (re)mounts or drills.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {ItemStatus} from '../domain/types';
import {AbbrevValidation, ExistingAbbrev, validateAbbrev} from '../domain/abbrev';
import {ResolvedParaPaths, resolvePaths} from '../domain/settings';
import {ensureItemCached, findCachedItem, frontMatterOf, getCachedData, updateItemFrontMatter} from '../storage/dataCache';
import {saveFrontMatter} from '../storage/projectFile';
import {loadSettings} from '../storage/settingsStorage';
import {FolderEntry} from '../supernote/fileSystem';
import {logError} from '../utils/log';
import {useEinkRefreshOnLoad} from '../utils/screenRefresh';
import ClipboardTextInput from '../ui/ClipboardTextInput';
import {common} from '../ui/commonStyles';
import {FONT, useThemeColors} from '../ui/theme';
import FileBrowserPane, {FileBrowserRoot, LinkTarget} from '../ui/FileBrowserPane';
import ItemFocusPanel from '../ui/ItemFocusPanel';
import ItemStatusPanel from '../ui/ItemStatusPanel';
import ProjectDataPanel from './ProjectDataPanel';
import {useErrorStatus} from '../ui/status/StatusProvider';
import MarkWrap from '../ui/status/StatusMark';
import {usePerfRender} from '../utils/perf';
import {useOnScreenShow} from '../ui/screenActivity';

/**
 * User-facing text for an invalid abbreviation candidate (domain/abbrev.ts's
 * validateAbbrev) - kept here rather than in domain/abbrev.ts since it's
 * display copy, not logic (domain/ stays pure per the repo's own
 * convention). Covers all three AbbrevInvalidReason kinds; only 'reserved'
 * and 'duplicate' are ever actually shown by AbbrevPill below (2026-09-14,
 * Tilman: single conditional, non-dimmed error line, no permanent hint -
 * see that component's doc comment) - 'empty' is included for completeness/
 * defense-in-depth (e.g. Save somehow reached with a blank draft).
 */
function abbrevErrorMessage(validation: AbbrevValidation): string {
  if (validation.valid || !validation.reason) return '';
  switch (validation.reason.kind) {
    case 'empty':
      return 'Enter an abbreviation.';
    case 'reserved':
      return "That matches a flow-state tag - pick something else.";
    case 'duplicate':
      return `Already used by "${validation.reason.usedBy}".`;
  }
}

interface Props {
  kind: 'project' | 'area';
  name: string;
  path: string;
  /** Called once ui/ItemStatusPanel.tsx's Archive action has actually moved this item's folder - App.tsx navigates away, since `path` no longer resolves to anything under Projects/Areas. */
  onArchived?: (kind: 'project' | 'area') => void;
  /** Threaded straight through to ProjectDataPanel's MeetingsSection (docs/dev/technical-design-google-calendar.md §9) - switches to Settings' Calendar sub-tab from the Google mini-tab's empty state. */
  onOpenCalendarSettings?: () => void;
  /** The Files pane's Browse tab (2026-09-09, see the module doc comment's "Browse tab" note) - plain-browsing a top-level Project/Area entry there swaps the "Current" tab to that item, same App.tsx `openItem` used to open one from the Projects/Areas tabs. */
  onOpenItem?: (kind: 'project' | 'area', entry: FolderEntry) => void;
  /** Projects: opens the close-out wizard from the status panel's "Close out…" (docs/dev/technical-design-project-close-out.md §6.2). */
  onStartCloseOut?: (projectPath: string) => void;
}

/** Just the frontmatter fields handleSetDefaultResourceFolder needs to read-modify-write - see the module doc comment's "extract, don't lift" note. Mirrors ui/ItemStatusPanel.tsx's own StatusPanelState. `area` is read (never written) here - it's this screen's only source for the assigned-Area's own file-browser root (see the module doc comment's "File browser roots" note) and must be carried through unchanged on every save (saveFrontMatter/updateItemFrontMatter both default it to null when omitted). */
interface ResourceFolderState {
  rawContent: string;
  status: ItemStatus;
  dailyFocus: boolean;
  weeklyFocus: boolean;
  monthlyFocus: boolean;
  frontMatterExtraLines: string[];
  defaultResourceFolder: string | null;
  area: string | null;
  /** This item's short abbreviation (docs/dev/technical-design-project-area-abbreviations.md), or null - carried through unchanged on every write here, same reason `area`/`defaultResourceFolder` already are (see storage/projectFile.ts's saveFrontMatter doc comment), and the value the header's AbbrevPill below reads/edits directly. */
  abbrev: string | null;
}

export default function ItemDetail({
  kind,
  name,
  path,
  onArchived,
  onOpenCalendarSettings,
  onOpenItem,
  onStartCloseOut,
}: Props): React.JSX.Element {
  usePerfRender('ItemDetail');
  const {textColor, borderColor, placeholderColor} = useThemeColors();

  const [error, setError] = useState<string | null>(null);

  // The user's resolved Resources folder (domain/settings.ts) - the
  // 'resources' root's rootPath below. Loaded once; Settings changes take
  // effect the next time this screen mounts, same as every other reader of
  // loadSettings() in this codebase.
  const [paths, setPaths] = useState<ResolvedParaPaths | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadSettings().then(s => {
      if (!cancelled) setPaths(resolvePaths(s));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // See the module doc comment's "handleSetDefaultResourceFolder" note.
  const [resourceFolderState, setResourceFolderState] = useState<ResourceFolderState | null>(null);
  useEffect(() => {
    let cancelled = false;
    ensureItemCached(kind, name, path).then(item => {
      if (cancelled) return;
      setResourceFolderState({
        rawContent: item.rawContent,
        status: item.status,
        dailyFocus: item.dailyFocus,
        weeklyFocus: item.weeklyFocus,
        monthlyFocus: item.monthlyFocus,
        frontMatterExtraLines: item.frontMatterExtraLines,
        defaultResourceFolder: item.defaultResourceFolder,
        area: item.area,
        abbrev: item.abbrev,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [kind, name, path]);

  // Kept tab shown again (docs/dev/technical-design-keep-tabs-alive.md §5.3):
  // re-derive quietly if this item's file changed while hidden.
  useOnScreenShow(() => {
    const item = findCachedItem(path);
    if (!item || item.rawContent === resourceFolderState?.rawContent) return;
    setResourceFolderState({
      rawContent: item.rawContent,
      status: item.status,
      dailyFocus: item.dailyFocus,
      weeklyFocus: item.weeklyFocus,
      monthlyFocus: item.monthlyFocus,
      frontMatterExtraLines: item.frontMatterExtraLines,
      defaultResourceFolder: item.defaultResourceFolder,
      area: item.area,
      abbrev: item.abbrev,
    });
  });

  // Explicit e-ink refresh once the initial ensureItemCached load lands -
  // see src/utils/screenRefresh.ts.
  // `resourceFolderState === null` covers the mount-time load above, which
  // (unlike most other screens) never had its own loading flag before this.
  useEinkRefreshOnLoad(resourceFolderState === null);

  /** The Resources root's pin (ui/FileBrowserPane.tsx's onSetDefaultSubfolder) - writes the new pinned subfolder into this item's frontmatter, write-through into the shared cache, same as ui/ItemStatusPanel.tsx's changeStatus. */
  const handleSetDefaultResourceFolder = useCallback(
    async (subfolderRelativePath: string) => {
      if (!resourceFolderState) return;
      try {
        // Fresh from the cache, not this screen's own snapshot: another panel on this
        // screen (ItemFocusPanel/ItemStatusPanel) may have written the file since -
        // its rawContent/focus flags must not be overwritten with stale values.
        const current = findCachedItem(path) ?? resourceFolderState;
        const fm = {...frontMatterOf(current), defaultResourceFolder: subfolderRelativePath};
        const nextRaw = await saveFrontMatter(kind, path, current.rawContent, fm);
        updateItemFrontMatter(path, nextRaw, fm);
        setResourceFolderState(prev =>
          prev ? {...prev, rawContent: nextRaw, defaultResourceFolder: subfolderRelativePath} : prev,
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        logError('ItemDetail: set default resource folder failed', message);
        setError(message);
      }
    },
    [resourceFolderState, kind, path],
  );

  /** Every OTHER Project/Area's abbreviation, from the already-warm cache - what AbbrevPill below validates a candidate against (domain/abbrev.ts's validateAbbrev, same uniqueness check storage/dataCache.ts's migrateMissingAbbrevs uses). A thunk rather than a value so AbbrevPill can snapshot it fresh each time editing starts, instead of a mount-time list going stale as other items change. */
  const listOtherAbbrevs = useCallback((): ExistingAbbrev[] => {
    const cache = getCachedData();
    if (!cache) return [];
    return cache.items
      .filter(i => i.path !== path && i.abbrev !== null)
      .map(i => ({value: i.abbrev as string, itemName: i.name}));
  }, [path]);

  /** Saves a new abbreviation - AbbrevPill's onSave, mirroring handleSetDefaultResourceFolder's own read-modify-write shape. Re-validates (defense in depth - AbbrevPill itself already disables Save while invalid) and throws a user-facing message on failure, which AbbrevPill's own save() catches and displays. */
  const handleSaveAbbrev = useCallback(
    async (text: string) => {
      if (!resourceFolderState) return;
      const trimmed = text.trim();
      const validation = validateAbbrev(trimmed, listOtherAbbrevs());
      if (!validation.valid) {
        throw new Error(abbrevErrorMessage(validation));
      }
      // Fresh from the cache, not this screen's own snapshot: another panel on this
      // screen (ItemFocusPanel/ItemStatusPanel) may have written the file since -
      // its rawContent/focus flags must not be overwritten with stale values.
      const current = findCachedItem(path) ?? resourceFolderState;
      const fm = {...frontMatterOf(current), abbrev: trimmed};
      const nextRaw = await saveFrontMatter(kind, path, current.rawContent, fm);
      updateItemFrontMatter(path, nextRaw, fm);
      setResourceFolderState(prev => (prev ? {...prev, rawContent: nextRaw, abbrev: trimmed} : prev));
    },
    [resourceFolderState, kind, path, listOtherAbbrevs],
  );

  // Reported up from ProjectDataPanel's Todos/Meetings (the one edit-or-arm
  // target for this whole screen, technical-design-linked-files.md §8), and
  // separately from ui/ItemStatusPanel.tsx's "Assign to Area…" - merged
  // below with area-assignment taking priority. See the module doc
  // comment's "Area-assignment arming" note for why these are two states
  // rather than one shared setter.
  const [dataPanelLinkTarget, setDataPanelLinkTarget] = useState<LinkTarget | null>(null);
  const [areaLinkTarget, setAreaLinkTarget] = useState<LinkTarget | null>(null);
  const linkTarget = areaLinkTarget ?? dataPanelLinkTarget;

  // Reported up from FileBrowserPane's own onActiveLocationChange (its doc
  // comment) - the Files pane's currently-displayed root/folder, for the
  // "Note" quick-add tab (memory: feature_standalone_note_quickadd.md).
  // `noteFolderPath` is that folder's absolute path, but only while the
  // active root is this item's own ('project' key, labeled "Project Files"/
  // "Area Files") - null on every other root (Resources, Area Files of an
  // assigned Area, Project Files of an Area, Browse), same restriction
  // fileBrowserRoots below already encodes. Read fresh by QuickAddWidget at
  // the moment "+Add" is pressed, not frozen when its Note tab was opened.
  const [activeFilesLocation, setActiveFilesLocation] = useState<{rootKey: string; path: string} | null>(null);
  const noteFolderPath = activeFilesLocation?.rootKey === 'project' ? activeFilesLocation.path : null;

  // The Area this Project supports, if any - null for Areas, and null for a
  // Project until resourceFolderState's own load lands (see the module doc
  // comment's "File browser roots" note).
  const assignedArea = kind === 'project' ? resourceFolderState?.area ?? null : null;

  // Active-only, same entryFilter every other destination picker in the app
  // uses (technical-design-project-area-assignment.md §4.2, docs/technical-
  // design-filing-unification.md §3.1) - shared here by Browse's own
  // `sources` below.
  const activeOnly = (entry: FolderEntry) => findCachedItem(entry.path)?.status === 'active';

  // Refile-arming (2026-09-09, storage/inboxFiling.ts's module doc comment):
  // ProjectDataPanel.tsx's own armTarget can arm for 'refile' as well as
  // 'link', both bubbled up through the same dataPanelLinkTarget/onPick
  // shape (its own onLinkTargetChange doc comment). `pickKind === 'folder'`
  // alone isn't enough to tell refile-arming apart from area-assignment's
  // own folder pick (ui/ItemStatusPanel.tsx's "Assign to Area…", reported
  // through the separate areaLinkTarget merged below) - both now route
  // through Browse (`root: 'browse'`), so checking `dataPanelLinkTarget`
  // specifically (never populated by area-assignment's own, separate
  // areaLinkTarget state) is what actually tells them apart here.
  const isRefileArming =
    dataPanelLinkTarget?.mode === 'arming' && dataPanelLinkTarget.pickKind === 'folder' && dataPanelLinkTarget.root === 'browse';
  // Area-assignment-arming (ui/ItemStatusPanel.tsx's "Assign to Area…",
  // 2026-09-09 follow-up: moved from its own dedicated Areas root onto
  // Browse via `startAt: 'area'` - see ui/FileBrowserPane.tsx's `startAt`
  // doc comment). Same reasoning as isRefileArming above for disabling every
  // other root while it's active: a tap on e.g. Resources mid-arm would
  // otherwise try to pick a folder there using area-assignment's own onPick,
  // which expects a Browse-shaped (root, relativePath) pair.
  const isAreaAssignmentArming = areaLinkTarget?.mode === 'arming';

  // Browse tab (2026-09-09, Tilman's "don't add/remove tabs, just switch
  // tabs and change behavior on tap" call; reworked same day into a
  // two-level Projects/Areas chooser, see ui/FileBrowserPane.tsx's `sources`
  // doc comment), always present rather than swapped in only while
  // refile-arming. Three behaviors, all handled by FileBrowserPane itself
  // from `sources`/`onNavigateToItem`/pickKind/`startAt`: plain browsing
  // jumps the "Current" tab to whichever Project/Area you tap (onOpenItem,
  // this screen's own equivalent of App.tsx's `openItem`); picking
  // (pickKind:'folder' - refile-arming, or area-assignment via `startAt:
  // 'area'`) selects one immediately; link-arming (the default
  // pickKind:'file') drills into one so you can pick a file inside it.
  // Neither kind's own roots below offer a way to browse *every* Project (a
  // Project's own roots have no 'projects' sibling) or, for an Area, every
  // other Area - this is that missing capability, once, rather than the
  // universal-roots swap this replaced.
  const browseRoot: FileBrowserRoot | null = paths
    ? {
        key: 'browse',
        label: 'Browse',
        rootPath: paths.base,
        sources: [
          {kind: 'project', path: paths.projects, label: 'Projects'},
          {kind: 'area', path: paths.areas, label: 'Areas'},
        ],
        entryFilter: activeOnly,
        onNavigateToItem: (entryKind, entryName, entryPath) => onOpenItem?.(entryKind, {name: entryName, path: entryPath, isFolder: true}),
      }
    : null;

  // Every other root is disabled (greyed, non-tappable, but still shown -
  // ui/FileBrowserPane.tsx's `disabled` doc comment) while refile-arming OR
  // area-assignment-arming, since Browse is the only valid destination for
  // either anywhere on this screen - same principle screens/InboxScreen.tsx
  // applies to its own Resources tab. The auto-switch-to-`root` effect
  // already built into ui/FileBrowserPane.tsx's `arming` handling (triggered
  // by `root: 'browse'`, both cases) moves the active tab to Browse the
  // instant either arm starts, so a disabled root is never left showing as
  // "active" either.
  const disableOthersWhileArming = (r: FileBrowserRoot): FileBrowserRoot =>
    isRefileArming || isAreaAssignmentArming ? {...r, disabled: true} : r;

  const fileBrowserRoots: FileBrowserRoot[] = paths
    ? kind === 'project'
      ? [
          disableOthersWhileArming({key: 'project', label: 'Project Files', rootPath: path}),
          disableOthersWhileArming({
            key: 'resources',
            label: 'Resources',
            rootPath: paths.resources,
            defaultSubfolder: resourceFolderState?.defaultResourceFolder ?? null,
            onSetDefaultSubfolder: handleSetDefaultResourceFolder,
          }),
          ...(assignedArea
            ? [disableOthersWhileArming({key: 'area', label: 'Area Files', rootPath: `${paths.areas}/${assignedArea}`})]
            : []),
          ...(browseRoot ? [browseRoot] : []),
        ]
      : [
          disableOthersWhileArming({key: 'project', label: 'Area Files', rootPath: path}),
          disableOthersWhileArming({
            key: 'resources',
            label: 'Resources',
            rootPath: paths.resources,
            defaultSubfolder: resourceFolderState?.defaultResourceFolder ?? null,
            onSetDefaultSubfolder: handleSetDefaultResourceFolder,
          }),
          disableOthersWhileArming({
            key: 'projectFiles',
            label: 'Project Files',
            rootPath: paths.projects,
            // Every Project currently assigned to this Area, by bare folder
            // name (same identity `area` itself is stored by) - see
            // storage/areaAssignment.ts's assignedProjects, which this
            // mirrors inline since entryFilter needs a per-entry predicate,
            // not a list.
            entryFilter: entry => findCachedItem(entry.path)?.area === name,
          }),
          ...(browseRoot ? [browseRoot] : []),
        ]
    : [{key: 'project', label: kind === 'project' ? 'Project Files' : 'Area Files', rootPath: path}];


  return (
    <View style={common.container}>
      <View style={styles.headerRow}>
        <Text style={[styles.heading, {color: textColor}]} numberOfLines={1}>
          {name}
        </Text>
        <Text style={[styles.kindTag, {color: textColor}]}>
          {kind === 'project' ? 'Project' : 'Area'}
        </Text>
        {resourceFolderState && (
          <AbbrevPill
            abbrev={resourceFolderState.abbrev}
            getExistingAbbrevs={listOtherAbbrevs}
            onSave={handleSaveAbbrev}
            textColor={textColor}
            borderColor={borderColor}
            placeholderColor={placeholderColor}
          />
        )}
      </View>

      <View style={styles.body}>
        <View style={[styles.leftPane, {borderColor}]}>
          <ItemFocusPanel
            kind={kind}
            name={name}
            path={path}
            textColor={textColor}
            borderColor={borderColor}
            placeholderColor={placeholderColor}
          />
          <View style={[styles.divider, {backgroundColor: borderColor}]} />
          <View style={styles.filesArea}>
            <Text style={[styles.paneTitle, {color: textColor}]}>Files</Text>
            {error && (
              <Text style={[styles.error, {color: textColor}]}>⚠ {error}</Text>
            )}
            <FileBrowserPane
              roots={fileBrowserRoots}
              linkTarget={linkTarget}
              resetKey={path}
              onActiveLocationChange={(rootKey, folderPath) => setActiveFilesLocation({rootKey, path: folderPath})}
              textColor={textColor}
              borderColor={borderColor}
            />
          </View>
          <View style={[styles.divider, {backgroundColor: borderColor}]} />
          <ItemStatusPanel
            kind={kind}
            name={name}
            path={path}
            onArchived={() => onArchived?.(kind)}
            onStartCloseOut={onStartCloseOut}
            onRequestAreaAssignment={setAreaLinkTarget}
            textColor={textColor}
            borderColor={borderColor}
          />
        </View>

        <View style={styles.rightPane}>
          <ProjectDataPanel
            kind={kind}
            name={name}
            path={path}
            onOpenCalendarSettings={onOpenCalendarSettings}
            onLinkTargetChange={setDataPanelLinkTarget}
            noteFolderPath={noteFolderPath}
          />
        </View>
      </View>
    </View>
  );
}

/**
 * Trailing `#tag` pill in the header (docs/dev/technical-design-project-area-
 * abbreviations.md) - always last, after the kindTag (2026-09-14, Tilman:
 * "please put the tag always at the end"). Tap to edit inline, mirroring ui/
 * ItemFocusPanel.tsx's ItemScopeRow tap-to-edit pattern (draft state +
 * Save/Cancel text buttons). Always rendered once resourceFolderState has
 * loaded - migrateMissingAbbrevs (storage/dataCache.ts) guarantees every
 * Project/Area already has a non-null abbrev by the time this screen can
 * show one, so there's no "+ Add" empty state the way Scope/Goal have; a
 * still-null value (should not happen post-migration) just shows an empty
 * "#" pill, itself tappable to fill one in.
 *
 * Validates live against the same two rules the storage-side save enforces
 * (domain/abbrev.ts's validateAbbrev) - reserved flow-state word, or already
 * used by another Project/Area, case-insensitively. `getExistingAbbrevs` is
 * a thunk rather than a plain prop so the snapshot is taken fresh each time
 * editing starts (startEdit), rather than risking a mount-time list going
 * stale as other items change while this screen sits open.
 *
 * One conditional error line (2026-09-14, Tilman: "We don't need the
 * reserved line for flow states in addition to the already used, just show
 * that line if the user enters exactly a flow state (but then not in
 * gray).") - no permanently-visible hint line, and no separate dimmed
 * reserved-word line. A single `common.error`-styled line (already undimmed
 * - see ui/commonStyles.ts) appears only while the current draft is
 * actually invalid, covering the reserved-word and duplicate cases the same
 * way Save is caught to for a write-time failure.
 */
function AbbrevPill({
  abbrev,
  getExistingAbbrevs,
  onSave,
  textColor,
  borderColor,
  placeholderColor,
}: {
  abbrev: string | null;
  getExistingAbbrevs: () => ExistingAbbrev[];
  onSave: (text: string) => Promise<void>;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}): React.JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(abbrev ?? '');
  const [existingAbbrevs, setExistingAbbrevs] = useState<ExistingAbbrev[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const startEdit = () => {
    setSaveError(null);
    setDraft(abbrev ?? '');
    setExistingAbbrevs(getExistingAbbrevs());
    setEditing(true);
  };
  const cancelEdit = () => {
    setSaveError(null);
    setDraft(abbrev ?? '');
    setEditing(false);
  };

  const validation = validateAbbrev(draft, existingAbbrevs);
  // Only reserved/duplicate ever show while editing an already-populated
  // pill - 'empty' would require clearing a non-empty draft to nothing,
  // which just disables Save below rather than showing text for it.
  const liveError = !validation.valid ? abbrevErrorMessage(validation) : null;

  const save = () => {
    if (!validation.valid) return;
    setSaveError(null);
    setSaving(true);
    onSave(draft)
      .then(() => setEditing(false))
      .catch(e => {
        logError('AbbrevPill: save failed', e instanceof Error ? e.message : String(e));
        setSaveError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setSaving(false));
  };

  // Validation (live) or save error -> central status slot, ⚠ on the field
  // (docs/dev/technical-design-status-slot.md §7.4).
  const shownError = editing ? liveError ?? saveError : null;
  useErrorStatus('ItemDetail.abbrev', shownError, !liveError && saveError ? () => setSaveError(null) : undefined);

  if (editing) {
    return (
      <View style={styles.abbrevEditWrap}>
        <View style={styles.abbrevEditRow}>
          <MarkWrap mark={shownError ? 'warning' : null} textColor={textColor}>
          <View style={styles.abbrevInputBox}>
            <ClipboardTextInput
              value={draft}
              onChangeText={setDraft}
              onSubmitEditing={save}
              placeholder="Abbrev"
              placeholderColor={placeholderColor}
              textColor={textColor}
              borderColor={borderColor}
              editable={!saving}
            />
          </View>
          </MarkWrap>
          <Pressable
            onPress={save}
            disabled={saving || !validation.valid}
            hitSlop={8}
            style={[styles.abbrevSaveButton, {borderColor}]}>
            <Text style={[styles.abbrevSaveText, {color: textColor}]}>Save</Text>
          </Pressable>
          <Pressable onPress={cancelEdit} disabled={saving} hitSlop={8}>
            <Text style={[styles.abbrevCancelText, {color: textColor}]}>Cancel</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <Pressable onPress={startEdit} hitSlop={8} style={[styles.abbrevPill, {borderColor: textColor}]}>
      <Text style={[styles.abbrevPillText, {color: textColor}]}>#{abbrev ?? ''}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  heading: {
    fontSize: FONT.large,
    fontWeight: '700',
    flex: 1,
  },
  kindTag: {
    fontSize: FONT.small,
    opacity: 0.6,
    marginLeft: 8,
  },
  body: {
    flex: 1,
    flexDirection: 'row',
  },
  leftPane: {
    flex: 1,
    borderRightWidth: 1,
    paddingRight: 16,
    marginRight: 16,
  },
  // Absorbs all the left pane's leftover vertical space (2026-09-09) so
  // ItemStatusPanel, right after it in document order, always lands flush
  // at the very bottom of the left pane - see the module doc comment's
  // placement note.
  filesArea: {
    flex: 1,
  },
  rightPane: {
    flex: 1,
  },
  paneTitle: {
    fontSize: FONT.medium,
    fontWeight: '600',
    marginBottom: 10,
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
  error: {
    fontSize: FONT.small,
    marginBottom: 6,
  },
  abbrevPill: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginLeft: 8,
  },
  abbrevPillText: {
    fontSize: FONT.small,
    fontWeight: '600',
  },
  abbrevEditWrap: {
    marginLeft: 8,
  },
  abbrevEditRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  // ClipboardTextInput's own inner wrap is `flex: 1` (styled for its usual
  // full-width usage, e.g. ItemFocusPanel.tsx's Scope/Goal rows) - fine
  // there, but meaningless inline in a row next to Save/Cancel with no
  // width of its own to fill. This gives it one: short, since abbreviations
  // are a handful of characters, not a sentence.
  abbrevInputBox: {
    width: 90,
  },
  abbrevSaveButton: {
    borderWidth: 1,
    borderRadius: 3,
    paddingVertical: 3,
    paddingHorizontal: 8,
    marginLeft: 6,
  },
  abbrevSaveText: {
    fontSize: FONT.small,
  },
  abbrevCancelText: {
    fontSize: FONT.small,
    opacity: 0.6,
    marginLeft: 8,
    paddingHorizontal: 4,
  },
});
