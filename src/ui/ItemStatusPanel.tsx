/**
 * Status (Active/On Hold/Done) + Archive + Assign to Area - the Current
 * tab's left pane, below Files (docs/dev/history/technical-design-inbox-tab.md §4).
 *
 * Focus is shown by ui/ItemFocusPanel.tsx at the TOP of the same column -
 * see that file's module doc comment (independent load, the weekly goal
 * line, and the accepted eventual-consistency window between it and this
 * component). `dailyFocus`/`weeklyFocus` stay on this component's own
 * StatusPanelState anyway: changeStatus/handleAssignArea/handleUnassignArea
 * need them to round-trip the frontmatter block without clobbering them,
 * even though nothing here renders them.
 *
 * Extract, don't lift: rather than hoist status state up into
 * screens/ItemDetail.tsx (which would make ItemDetail a second owner of item
 * data), this component does its own small, independent ensureItemCached
 * load - the same "independent per-section state, synchronized only through
 * the shared cache + write-through" pattern DailyFocusKindSection/ItemsList/
 * ProjectDataPanel/ui/ItemFocusPanel.tsx use side-by-side without sharing
 * state directly (design-overview.md §3's "reads should prefer the cache").
 *
 * **Assign to Area** (technical-design-project-area-assignment.md §4.1,
 * Projects only) sits in the same row as "🗄 Archive…", to its right - a
 * button ("Assign to Area…") when unassigned, a pill ("Area: <name>  ✕")
 * once assigned. Picking works the same way linked-files arming does: this
 * component doesn't own a FileBrowserPane of its own (that's a sibling,
 * owned by screens/ItemDetail.tsx), so pressing the button reports a full
 * `LinkTarget` up via `onRequestAreaAssignment` - the same
 * report-a-LinkTarget shape ProjectDataPanel's `onLinkTargetChange` uses.
 * `onPick`/`onCancel` are fully owned/constructed here (this component has
 * everything it needs - state, kind, path), same "the closure that owns the
 * mutation also builds the callback" convention ProjectDataPanel's own
 * armTarget/onPick follows.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {ItemStatus} from '../domain/types';
import {resolvePaths} from '../domain/settings';
import {assignedProjects, assignProjectToArea, unassignProject} from '../storage/areaAssignment';
import {archiveItem, archiveLeavesEmptyFolder, archiveTargetsFor, describeAreaArchiveBlock} from '../storage/archive';
import {archiveDoneText, emptyFolderConfirmNote} from '../domain/fileChangeText';
import {displayPath} from '../supernote/fileSystem';
import {ensureItemCached, findCachedItem} from '../storage/dataCache';
import {useOnScreenShow} from './screenActivity';
import {loadSettings} from '../storage/settingsStorage';
import {SettableStatus, setItemStatus} from '../storage/statusControl';
import {logError} from '../utils/log';
import {useEinkRefreshOnLoad} from '../utils/screenRefresh';
import {ARMING_TEXT, LinkTarget} from './FileBrowserPane';
import {common} from './commonStyles';
import {COLORS, FONT} from './theme';
import {useErrorStatus, useStatus, useStatusApi} from './status/StatusProvider';
import {usePerfRender} from '../utils/perf';
import {errorMessage} from '../utils/errorMessage';

interface Props {
  kind: 'project' | 'area';
  name: string;
  path: string;
  /** Called once this item's folder has actually moved to Archive (the caller navigates away, since `path` then points at nothing under Projects/Areas). */
  onArchived?: () => void;
  /**
   * Projects only: when set, "Archive…" becomes "Close out…" and opens the
   * close-out wizard instead of archiving directly (docs/dev/technical-design-
   * project-close-out.md §6.2). Areas keep the direct Archive.
   */
  onStartCloseOut?: (projectPath: string) => void;
  /** Arms (non-null) or cancels (null) the Areas tab for area-assignment - screens/ItemDetail.tsx merges this report with ProjectDataPanel's own onLinkTargetChange, giving this one priority whenever it's non-null (see ItemDetail's module doc comment). Projects only - never called for an Area. */
  onRequestAreaAssignment?: (target: LinkTarget | null) => void;
  textColor: string;
  borderColor: string;
}

/** Just the fields this panel actually reads/writes - ProjectDataPanel's PanelState carries more (tasks/meetings/etc.) it doesn't need here. */
interface StatusPanelState {
  rawContent: string;
  status: ItemStatus;
  dailyFocus: boolean;
  weeklyFocus: boolean;
  monthlyFocus: boolean;
  frontMatterExtraLines: string[];
  defaultResourceFolder: string | null;
  /** The Area this Project supports, by bare folder name, or null - always null for Areas. */
  area: string | null;
  /** This item's short abbreviation (docs/dev/history/technical-design-project-area-abbreviations.md), or null - carried through unchanged on every write here, same reason `area`/`defaultResourceFolder` already are (see storage/projectFile.ts's saveFrontMatter doc comment). */
  abbrev: string | null;
}

/**
 * This item as every frontmatter write here should see it: fresh from the
 * shared cache when present (another panel on this screen - ItemFocusPanel,
 * ItemDetail's own resource-folder/abbrev saves - may have written the
 * file since this panel loaded), falling back to this panel's own snapshot.
 * Every write spreads the whole thing (docs/dev/history/technical-design-monthly-view.md
 * §2.1), so no field - focus flags included - can be clobbered by a stale copy.
 */
function currentItem(kind: 'project' | 'area', name: string, path: string, snapshot: StatusPanelState) {
  return {kind, name, path, ...(findCachedItem(path) ?? snapshot)};
}

export default function ItemStatusPanel({
  kind,
  name,
  path,
  onArchived,
  onStartCloseOut,
  onRequestAreaAssignment,
  textColor,
  borderColor,
}: Props): React.JSX.Element | null {
  usePerfRender('ItemStatusPanel');
  const [state, setState] = useState<StatusPanelState | null>(null);
  // Explicit e-ink refresh once this panel's own independent load actually
  // lands - see src/utils/screenRefresh.ts. No separate loading flag here
  // (see the module doc comment's "extract, don't lift" note), so `state
  // === null` stands in for it - true for the initial mount load, same as
  // every other screen's own `loading` state covers its own initial load.
  useEinkRefreshOnLoad(state === null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [archiving, setArchiving] = useState(false);
  const statusApi = useStatusApi();
  const [archiveError, setArchiveError] = useState<string | null>(null);
  useErrorStatus('ItemStatusPanel.archiveError', archiveError, () => setArchiveError(null));
  // "Can't archive yet" and the archive confirm are both shown in the
  // central status slot (D10).
  const [archiveBlock, setArchiveBlock] = useState<string | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState<{text: string; detail: string; run: () => void} | null>(null);
  useStatus(
    'ItemStatusPanel.archiveBlock',
    archiveBlock ? {kind: 'warning', text: `Can't archive yet: ${archiveBlock}`, detail: archiveBlock, onDismiss: () => setArchiveBlock(null)} : null,
  );
  useStatus(
    'ItemStatusPanel.archiveConfirm',
    archiveConfirm
      ? {
          kind: 'confirm',
          text: archiveConfirm.text,
          detail: archiveConfirm.detail,
          actions: [
            {
              label: 'Move to Archive',
              primary: true,
              onPress: () => {
                const run = archiveConfirm.run;
                setArchiveConfirm(null);
                run();
              },
            },
          ],
          onCancel: () => setArchiveConfirm(null),
        }
      : null,
  );
  const [areaError, setAreaError] = useState<string | null>(null);
  useErrorStatus('ItemStatusPanel.areaError', areaError, () => setAreaError(null));


  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const item = await ensureItemCached(kind, name, path);
      if (item.loadError) throw new Error(item.loadError);
      setState({
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
    } catch (e) {
      const message = errorMessage(e);
      logError('ItemStatusPanel: load failed', kind, path, message);
      setLoadError(message);
    }
  }, [kind, name, path]);

  useEffect(() => {
    load();
  }, [load]);

  // Kept tab shown again (docs/dev/history/technical-design-keep-tabs-alive.md §5.3):
  // reload from the shared cache only if this item's file changed while
  // hidden (e.g. its status or focus changed from Daily/Week/Projects).
  useOnScreenShow(() => {
    const item = findCachedItem(path);
    if (item && state && item.rawContent !== state.rawContent) load();
  });

  /** Active/On Hold/Done - never 'archived', see storage/statusControl.ts. Moving off Active clears both focus flags in the same write; moving an Area to On Hold also cascades to its assigned Active projects (statusControl.ts). `area` is carried through unchanged - a status change must never clear a Project's Area assignment. */
  const changeStatus = useCallback(
    async (next: SettableStatus) => {
      if (!state) return;
      const result = await setItemStatus(
        currentItem(kind, name, path, state),
        next,
      );
      setState(prev =>
        prev
          ? {
              ...prev,
              rawContent: result.rawContent,
              status: result.status,
              dailyFocus: result.dailyFocus,
              weeklyFocus: result.weeklyFocus,
              monthlyFocus: result.monthlyFocus,
              frontMatterExtraLines: result.frontMatterExtraLines,
            }
          : prev,
      );
    },
    [state, kind, name, path],
  );

  /**
   * Confirms, then moves this item's folder to Archive and stamps
   * `status: archived` - storage/archive.ts's archiveItem. Folder/Area
   * names in the confirmation text come from the user's actual Settings
   * (not hardcoded "Projects"/"Archive"), same as the technical design
   * calls for. `onArchived` (App.tsx, via ItemDetail) navigates away once
   * this resolves, since `path` stops pointing at anything real.
   *
   * Area-specific (technical-design-project-area-assignment.md §3.3, §5):
   * if this Area has any assigned Project that's still Active or On Hold,
   * the block is surfaced immediately via a plain acknowledgement alert -
   * the destructive "Move to Archive?" confirmation is never even opened
   * in that case. Otherwise, if any assigned Project is Done, the confirm
   * text names them and says they'll be archived too.
   */
  const handleArchivePress = useCallback(() => {
    if (!state) return;
    setArchiveError(null);
    setArchiveBlock(null);

    if (kind === 'area') {
      const block = describeAreaArchiveBlock(name);
      if (block) {
        setArchiveBlock(block);
        return;
      }
    }

    (async () => {
      try {
        const settings = await loadSettings();
        const folderLabel = kind === 'project' ? settings.projectsFolder : settings.areasFolder;
        const cascaded = kind === 'area' ? assignedProjects(name).filter(p => p.status === 'done') : [];
        const cascadeNote =
          cascaded.length > 0
            ? ` This also archives ${cascaded.length} completed project${cascaded.length === 1 ? '' : 's'} assigned to it: ${cascaded
                .map(p => `"${p.name}"`)
                .join(', ')}.`
            : '';
        const plural = cascaded.length > 0;
        // Exact year/area target (docs/dev/history/technical-design-project-close-out.md §5.1), shown relative to the base root.
        const base = resolvePaths(settings).base;
        const target = archiveTargetsFor(currentItem(kind, name, path, state), settings);
        const targetLabel = target.folder.startsWith(`${base}/`) ? target.folder.slice(base.length + 1) : target.folder;
        // A merge into an existing folder leaves this folder empty: name it
        // here, so the confirmation is also the explicit OK for deleting it
        // (docs/dev/history/technical-design-inkhub-submission.md §3.4).
        const leavesEmpty = await archiveLeavesEmptyFolder(currentItem(kind, name, path, state), settings);
        const mergeNote = leavesEmpty ? emptyFolderConfirmNote(displayPath(path), displayPath(target.folder)) : '';
        // Confirm in the central status slot (D10) - short question in the
        // slot, the full explanation behind a tap on the text (D12).
        setArchiveConfirm({
          text: `Move "${name}" to ${targetLabel}?${cascaded.length > 0 ? ` (+${cascaded.length} done project${cascaded.length === 1 ? '' : 's'})` : ''}`,
          detail: `This moves "${name}"'s folder out of ${folderLabel} and into ${targetLabel} on your device.${mergeNote}${cascadeNote} The plugin won't show ${
            plural ? 'either' : 'it'
          } here again — to bring ${plural ? 'them' : 'it'} back, move the folder${plural ? 's' : ''} yourself in Supernote's file browser.`,
          run: () => {
            setArchiving(true);
            archiveItem(currentItem(kind, name, path, state), settings, undefined, {deleteEmptySource: leavesEmpty})
              .then(result => {
                // Global: this panel unmounts once onArchived navigates away.
                const id = 'ItemStatusPanel.archiveDone';
                statusApi.show(id, {
                  kind: result.keptEmptyFolder ? 'info' : 'success',
                  text: archiveDoneText(name, displayPath(result.path), result.keptEmptyFolder ? displayPath(result.keptEmptyFolder) : null),
                  scope: 'global',
                  onDismiss: () => statusApi.clear(id),
                });
                onArchived?.();
              })
              .catch(e => {
                logError('ItemStatusPanel: archive failed', errorMessage(e));
                setArchiveError(errorMessage(e));
              })
              .finally(() => setArchiving(false));
          },
        });
      } catch (e) {
        logError('ItemStatusPanel: archive confirm setup failed', errorMessage(e));
        setArchiveError(errorMessage(e));
      }
    })();
  }, [state, kind, name, path, onArchived, statusApi]);

  /** Writes the new assignment, then cancels arming - the arm/pick round-trip is complete either way once a pick lands. */
  const handleAssignArea = useCallback(
    async (areaName: string) => {
      if (!state) return;
      setAreaError(null);
      try {
        const result = await assignProjectToArea(
          currentItem(kind, name, path, state),
          areaName,
        );
        setState(prev => (prev ? {...prev, rawContent: result.rawContent, area: result.area} : prev));
      } catch (e) {
        const message = errorMessage(e);
        logError('ItemStatusPanel: assign area failed', message);
        setAreaError(message);
      } finally {
        onRequestAreaAssignment?.(null);
      }
    },
    [state, kind, name, path, onRequestAreaAssignment],
  );

  /** Clears the assignment immediately - no confirmation, a reversible/non-destructive change, unlike Archive. */
  const handleUnassignArea = useCallback(async () => {
    if (!state) return;
    setAreaError(null);
    try {
      const result = await unassignProject(currentItem(kind, name, path, state));
      setState(prev => (prev ? {...prev, rawContent: result.rawContent, area: result.area} : prev));
    } catch (e) {
      const message = errorMessage(e);
      logError('ItemStatusPanel: unassign area failed', message);
      setAreaError(message);
    }
  }, [state, kind, name, path]);

  /** Presses "Assign to Area…" (or re-taps the "Area: <name>" pill to reassign) - arms the Browse tab, landing directly inside its Areas category (`startAt: 'area'`, see ui/FileBrowserPane.tsx's `startAt` doc comment), same way ProjectDataPanel arms a file-link/refile. */
  const handleArmAreaAssignment = useCallback(() => {
    onRequestAreaAssignment?.({
      mode: 'arming',
      root: 'browse',
      startAt: 'area',
      pickKind: 'folder',
      label: ARMING_TEXT.area,
      onPick: (_root, relativePath) => {
        handleAssignArea(relativePath);
      },
      onCancel: () => onRequestAreaAssignment?.(null),
    });
  }, [onRequestAreaAssignment, handleAssignArea]);

  if (loadError) {
    return (
      <View style={styles.root}>
        <Text style={[common.error, {color: textColor}]}>⚠ {loadError}</Text>
      </View>
    );
  }

  if (!state) return null;

  return (
    <View style={styles.root}>
      <StatusSection
        kind={kind}
        status={state.status}
        onChange={changeStatus}
        textColor={textColor}
        borderColor={borderColor}
      />
      <View style={styles.section}>
        <View style={styles.actionsRow}>
          {kind === 'project' && onStartCloseOut ? (
            <ArchiveAction label="🗄 Close out…" onPress={() => onStartCloseOut(path)} pending={archiving} textColor={textColor} />
          ) : (
            <ArchiveAction label="🗄 Archive…" onPress={handleArchivePress} pending={archiving} textColor={textColor} />
          )}
          {kind === 'project' && (
            <AreaAssignmentAction
              area={state.area}
              onPressAssign={handleArmAreaAssignment}
              onPressUnassign={handleUnassignArea}
              textColor={textColor}
            />
          )}
        </View>
      </View>
    </View>
  );
}

function StatusSection({
  kind,
  status,
  onChange,
  textColor,
  borderColor,
}: {
  kind: 'project' | 'area';
  status: ItemStatus;
  onChange: (next: SettableStatus) => Promise<void>;
  textColor: string;
  borderColor: string;
}): React.JSX.Element {
  // Projects get a 3-way Active/On Hold/Done picker; Areas get a 2-way
  // Active/On Hold picker - an Area doesn't complete (technical-design-
  // status-archive.md §1). 'archived' is deliberately never an option here
  // - see ArchiveAction below.
  const options: Array<{value: SettableStatus; label: string}> =
    kind === 'project'
      ? [
          {value: 'active', label: 'Active'},
          {value: 'on-hold', label: 'On Hold'},
          {value: 'done', label: 'Done'},
        ]
      : [
          {value: 'active', label: 'Active'},
          {value: 'on-hold', label: 'On Hold'},
        ];

  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  useErrorStatus('ItemStatusPanel.actionError', actionError, () => setActionError(null));

  const handleSelect = (value: SettableStatus) => {
    if (value === status || pending) return;
    setActionError(null);
    setPending(true);
    onChange(value)
      .catch(e => {
        logError('StatusSection: change failed', errorMessage(e));
        setActionError(errorMessage(e));
      })
      .finally(() => setPending(false));
  };

  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, {color: textColor}]}>Status</Text>
      <View style={styles.statusRow}>
        {options.map(option => {
          const selected = option.value === status;
          return (
            <Pressable
              key={option.value}
              style={[
                styles.statusOption,
                {borderColor: selected ? COLORS.accent : borderColor},
                selected && styles.statusOptionSelected,
              ]}
              onPress={() => handleSelect(option.value)}
              disabled={pending}
              hitSlop={8}>
              <Text style={[styles.statusOptionText, {color: selected ? COLORS.accentText : textColor}]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function ArchiveAction({
  label,
  onPress,
  pending,
  textColor,
}: {
  label: string;
  onPress: () => void;
  pending: boolean;
  textColor: string;
}): React.JSX.Element {
  return (
    <Pressable style={[styles.archiveButton, {borderColor: textColor}]} onPress={onPress} disabled={pending} hitSlop={8}>
      <Text style={[styles.archiveButtonText, {color: textColor}]}>{label}</Text>
    </Pressable>
  );
}

/**
 * "Assign to Area…" when unassigned; a "Area: <name>  ✕" pill once
 * assigned - tapping the name re-arms the picker (to reassign), tapping
 * "✕" clears immediately (no confirmation).
 */
function AreaAssignmentAction({
  area,
  onPressAssign,
  onPressUnassign,
  textColor,
}: {
  area: string | null;
  onPressAssign: () => void;
  onPressUnassign: () => void;
  textColor: string;
}): React.JSX.Element {
  if (!area) {
    return (
      <Pressable style={[styles.archiveButton, {borderColor: textColor}]} onPress={onPressAssign} hitSlop={8}>
        <Text style={[styles.archiveButtonText, {color: textColor}]}>Assign to Area…</Text>
      </Pressable>
    );
  }
  return (
    <View style={[styles.areaPill, {borderColor: textColor}]}>
      <Pressable onPress={onPressAssign} hitSlop={8}>
        <Text style={[styles.archiveButtonText, {color: textColor}]}>Area: {area}</Text>
      </Pressable>
      <Pressable onPress={onPressUnassign} hitSlop={8} style={styles.areaPillClose}>
        <Text style={[styles.areaPillCloseText, {color: textColor}]}>✕</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {},
  section: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: FONT.medium,
    fontWeight: '600',
    marginBottom: 10,
  },
  statusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  statusOption: {
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginRight: 8,
    marginBottom: 8,
  },
  statusOptionSelected: {
    backgroundColor: COLORS.accent,
  },
  statusOptionText: {
    fontSize: FONT.small,
    fontWeight: '600',
  },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  archiveButton: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 10,
    marginBottom: 8,
  },
  archiveButtonText: {
    fontSize: FONT.small,
    fontWeight: '600',
  },
  areaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  areaPillClose: {
    marginLeft: 8,
    paddingHorizontal: 4,
  },
  areaPillCloseText: {
    fontSize: FONT.small,
    opacity: 0.7,
  },
});
