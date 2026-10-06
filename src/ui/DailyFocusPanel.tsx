/**
 * Daily view's Focus/Projects/Areas panel (technical-design-daily-focus-
 * panel.md) - a single narrow panel directly below the Calendar column, so
 * the Open-tasks column keeps the full height.
 *
 * Three direct mini-tabs - Focus | Projects | Areas, never a single wrapping
 * "Browse" tab:
 *
 * - **Focus** - today's fixed-slot display: every currently-focused item of
 *   a kind gets a row with "✕" to remove, followed by
 *   `limit - focused.length` empty "+ Add {kind}" slots. Tapping a focused
 *   row's name navigates to it (`onOpenItem`).
 * - **Projects** / **Areas** - a plain, alphabetically-ordered browse of
 *   every *Active* item of that kind (not just focused ones); tapping a name
 *   navigates to it too. Built from a single-root `ui/FileBrowserPane.tsx`
 *   instance per tab (`projectsRoot`/`areasRoot` below) rather than the
 *   `sources` composite root `ItemDetail.tsx`/`InboxScreen.tsx`'s "Browse"
 *   tab uses - this panel already has direct Projects/Areas mini-tabs of its
 *   own, so there's nothing for a synthetic two-level chooser to add.
 *   `FileBrowserPane` only renders its own internal tab strip when it's
 *   given more than one root (see its module doc comment), so a single-root
 *   instance here shows no competing tab row - this panel's own `<MiniTabs>`
 *   is the only tab UI on screen.
 *
 * **Arm-and-pick.** Tapping an empty "+ Add {kind}" slot on Focus arms the
 * matching tab as a picker instead of expanding an inline candidate list in
 * place: it switches to
 * that tab, and while armed its `FileBrowserPane` root's `entryFilter`
 * narrows to Active-and-not-already-focused items, with `linkTarget` in
 * `arming`/`pickKind: 'folder'` mode so a tap on a name **picks** (calls
 * `onToggle(item, true)`) instead of navigating - the same `LinkTarget`
 * mechanism `ui/ItemStatusPanel.tsx`'s "Assign to Area…" and
 * `screens/InboxScreen.tsx`'s refile-arming already use for an identical
 * "pick a Project/Area" interaction (see `ui/FileBrowserPane.tsx`'s module
 * doc comment). No `root`/`startAt` on `linkTarget` here - those exist so a
 * composite root can redirect itself to a specific source; this panel's own
 * tab switch already puts the right single-root pane on screen before arming
 * starts, so there's nothing for `FileBrowserPane` itself to redirect.
 *
 * **Mini-tab blocking while armed** reuses `ui/MiniTabs.tsx`'s existing
 * `disabled` flag - the exact same silent grey-out-and-non-tappable
 * convention `ui/FileBrowserPane.tsx` already uses for its own Resources tab
 * while refile-arming (`disabled`'s own doc comment there: "don't add/remove
 * tabs, just change what tapping them does") - not a separate
 * dimmed-tab-plus-text-message widget. While armed for one kind, Focus and the *other* kind's tab grey out and
 * stop responding to taps; the armed tab itself stays fully active so the
 * pick (or cancelling via the arming badge's "✕", rendered by
 * `FileBrowserPane` itself) can happen.
 *
 * **Leaving Daily for a different top-level app tab is never blocked, and
 * silently cancels any in-progress arm, with no code written for it at all**
 * - `App.tsx` genuinely unmounts a tab's screen when it isn't active (no
 * `display:none`, no back-stack), so this component's own `activeTab`/
 * `focusArm` state (plain `useState`, owned entirely here - deliberately
 * never lifted up into `DailyView`/`App.tsx`) is destroyed the moment
 * `DailyView` unmounts, and starts fresh next time Daily is opened. This is
 * a load-bearing reason not to lift this state: doing so would have to
 * reinvent "did I just get unmounted" by hand instead of getting it for free
 * from where the state already lives.
 *
 * **A successful pick** clears `focusArm` and returns to the Focus tab
 * automatically, so the result is visible immediately without an extra tap.
 * Cancelling clears `focusArm` only, leaving `activeTab` wherever it was
 * (now unarmed, ordinary browsing).
 *
 * **Sizing.** Focus tab's total row budget
 * (`dailyFocusProjectCount + dailyFocusAreaCount`, defaults 3 + 2 = 5) is
 * `ui/pagination.ts`'s `PAGE_SIZE.dailyFocusPanel` - Projects/Areas page at
 * the same size, so the panel's outer height never grows or shrinks per
 * tab. The size is passed as an explicit
 * `viewportHeight={focusPanelViewportHeightPx}` on each `FileBrowserPane`.
 * This panel uses a fixed height, not self-measuring: its root has no
 * bounding `flex:1`, and the Focus tab's fixed-slot content doesn't
 * self-measure at all.
 */
import React, {useCallback, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {CachedItem, findCachedItem} from '../storage/dataCache';
import {FolderEntry} from '../supernote/fileSystem';
import {logError} from '../utils/log';
import FileBrowserPane, {ARMING_TEXT, FileBrowserRoot, LinkTarget, fileBrowserViewportHeightPx} from './FileBrowserPane';
import FocusedItemRow from './FocusedItemRow';
import MiniTabs, {MiniTabDef} from './MiniTabs';
import {PAGE_SIZE} from './pagination';
import {FONT} from './theme';
import {useErrorStatus} from './status/StatusProvider';
import {usePerfRender} from '../utils/perf';
import {errorMessage} from '../utils/errorMessage';

type FocusKind = 'project' | 'area';
type FocusPanelTab = 'focus' | 'projects' | 'areas';

const TAB_FOR_KIND: Record<FocusKind, FocusPanelTab> = {project: 'projects', area: 'areas'};

interface Props {
  items: CachedItem[];
  /** Absolute Projects/Areas folder paths - `FileBrowserRoot.rootPath` for the two browse tabs. */
  projectsPath: string;
  areasPath: string;
  dailyFocusProjectCount: number;
  dailyFocusAreaCount: number;
  /** Jump the whole app to a Project/Area's Current tab - same prop DailyView itself receives from App.tsx, passed straight through (App.tsx's `openItem`). */
  onOpenItem: (kind: FocusKind, entry: FolderEntry) => void;
  /** Adds/removes `item` from daily focus - DailyView's `handleToggleItemFocus` (it runs `focusBlockedReason` before turning a flag on and writes through via `storage/focusSlots.ts`'s `setItemFocus`). Used for both a Focus-tab row's "✕" and a successful arm-and-pick. */
  onToggle: (item: CachedItem, value: boolean) => Promise<void>;
  textColor: string;
  borderColor: string;
}

function DailyFocusPanel({
  items,
  projectsPath,
  areasPath,
  dailyFocusProjectCount,
  dailyFocusAreaCount,
  onOpenItem,
  onToggle,
  textColor,
  borderColor,
}: Props): React.JSX.Element {
  usePerfRender('DailyFocusPanel');
  const [activeTab, setActiveTab] = useState<FocusPanelTab>('focus');
  // Which kind is currently armed for picking, or null - see the module doc
  // comment's "Arm-and-pick" note. Local state, deliberately never lifted -
  // see "Leaving Daily..." above.
  const [focusArm, setFocusArm] = useState<{kind: FocusKind} | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  useErrorStatus('DailyFocusPanel.pickError', pickError, () => setPickError(null));

  const armFromEmptySlot = (kind: FocusKind) => {
    setPickError(null);
    setFocusArm({kind});
    setActiveTab(TAB_FOR_KIND[kind]);
  };
  const cancelArm = useCallback(() => setFocusArm(null), []);

  /**
   * `arming`'s onPick - `relativePath` is a bare top-level folder name (this
   * root's `rootPath` is the Projects/Areas folder directly, no `sources`
   * composite involved), so it's exactly `item.name`/the last path segment.
   * Looks the item up in the already-warm cache, re-checks nothing itself
   * beyond what `onToggle` already does (it runs `focusBlockedReason`
   * defensively right before writing) - this arm's
   * own `entryFilter` (active-and-not-already-focused) is what normally
   * keeps a full slot from ever being offered as a candidate in the first
   * place.
   */
  const handleFocusPick = useCallback(
    (_root: string, relativePath: string) => {
      if (!focusArm) return;
      const name = relativePath.split('/').pop() ?? relativePath;
      const basePath = focusArm.kind === 'project' ? projectsPath : areasPath;
      const path = `${basePath.replace(/\/+$/, '')}/${name}`;
      const item = findCachedItem(path) ?? items.find(i => i.kind === focusArm.kind && i.path === path);
      if (!item) {
        setPickError(`Couldn't find ${name} - try refreshing.`);
        return;
      }
      setPickError(null);
      onToggle(item, true)
        .then(() => {
          setFocusArm(null);
          setActiveTab('focus');
        })
        .catch(e => {
          logError('DailyFocusPanel: pick failed', errorMessage(e));
          setPickError(errorMessage(e));
        });
    },
    [focusArm, projectsPath, areasPath, items, onToggle],
  );

  const activeOnly = (entry: FolderEntry) => findCachedItem(entry.path)?.status === 'active';
  const activeAndNotFocused = (kind: FocusKind) => (entry: FolderEntry) => {
    const cached = findCachedItem(entry.path);
    return cached?.status === 'active' && cached.kind === kind && !cached.dailyFocus;
  };

  const projectsRoot: FileBrowserRoot = {
    key: 'projects',
    label: 'Projects',
    rootPath: projectsPath,
    entryFilter: focusArm?.kind === 'project' ? activeAndNotFocused('project') : activeOnly,
    onNavigateToItem: (kind, name, path) => onOpenItem(kind, {name, path, isFolder: true}),
  };
  const areasRoot: FileBrowserRoot = {
    key: 'areas',
    label: 'Areas',
    rootPath: areasPath,
    entryFilter: focusArm?.kind === 'area' ? activeAndNotFocused('area') : activeOnly,
    onNavigateToItem: (kind, name, path) => onOpenItem(kind, {name, path, isFolder: true}),
  };
  // Fixed panel height, passed as the component-level `viewportHeight` prop
  // (see the module doc comment's "Sizing" note).
  const focusPanelViewportHeightPx = fileBrowserViewportHeightPx(PAGE_SIZE.dailyFocusPanel);

  const linkTargetFor = (tabKind: FocusKind): LinkTarget | null =>
    focusArm?.kind === tabKind
      ? {
          mode: 'arming',
          pickKind: 'folder',
          label: ARMING_TEXT.focus('daily', tabKind),
          onPick: handleFocusPick,
          onCancel: cancelArm,
        }
      : null;

  const tabs: MiniTabDef<FocusPanelTab>[] = [
    {key: 'focus', label: 'Focus', disabled: !!focusArm},
    {key: 'projects', label: 'Projects', disabled: !!focusArm && focusArm.kind !== 'project'},
    {key: 'areas', label: 'Areas', disabled: !!focusArm && focusArm.kind !== 'area'},
  ];

  return (
    <View>
      <MiniTabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} textColor={textColor} borderColor={borderColor} />
      {activeTab === 'focus' && (
        <>
          <FixedSlotSection
            kind="project"
            label="Projects"
            limit={dailyFocusProjectCount}
            items={items}
            onOpenItem={onOpenItem}
            onToggle={onToggle}
            onAddEmpty={() => armFromEmptySlot('project')}
            textColor={textColor}
            borderColor={borderColor}
          />
          <FixedSlotSection
            kind="area"
            label="Areas"
            limit={dailyFocusAreaCount}
            items={items}
            onOpenItem={onOpenItem}
            onToggle={onToggle}
            onAddEmpty={() => armFromEmptySlot('area')}
            textColor={textColor}
            borderColor={borderColor}
          />
        </>
      )}
      {activeTab === 'projects' && (
        <FileBrowserPane
          roots={[projectsRoot]}
          linkTarget={linkTargetFor('project')}
          resetKey="projects"
          viewportHeight={focusPanelViewportHeightPx}
          textColor={textColor}
          borderColor={borderColor}
        />
      )}
      {activeTab === 'areas' && (
        <FileBrowserPane
          roots={[areasRoot]}
          linkTarget={linkTargetFor('area')}
          resetKey="areas"
          viewportHeight={focusPanelViewportHeightPx}
          textColor={textColor}
          borderColor={borderColor}
        />
      )}
    </View>
  );
}

/**
 * One kind's row of daily-focus slots (Projects, or Areas) - every
 * currently-focused item of `kind`, each removable, followed by however many
 * empty slots remain under `limit`. Tapping an empty slot calls
 * `onAddEmpty` (arms the matching mini-tab); a focused row's name navigates
 * to it, "✕" removes it, and `pending`/`actionError` show progress/errors.
 */
function FixedSlotSection({
  kind,
  label,
  limit,
  items,
  onOpenItem,
  onToggle,
  onAddEmpty,
  textColor,
  borderColor,
}: {
  kind: FocusKind;
  label: string;
  limit: number;
  items: CachedItem[];
  onOpenItem: (kind: FocusKind, entry: FolderEntry) => void;
  onToggle: (item: CachedItem, value: boolean) => Promise<void>;
  onAddEmpty: () => void;
  textColor: string;
  borderColor: string;
}): React.JSX.Element {
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  useErrorStatus('DailyFocusPanel.actionError', actionError, () => setActionError(null));

  const focused = items.filter(item => item.kind === kind && item.dailyFocus);
  const emptySlotCount = Math.max(0, limit - focused.length);
  const kindLabel = kind === 'project' ? 'project' : 'area';

  const handleRemove = (item: CachedItem) => {
    setActionError(null);
    setPending(true);
    onToggle(item, false)
      .catch(e => {
        logError('FixedSlotSection: remove failed', errorMessage(e));
        setActionError(errorMessage(e));
      })
      .finally(() => setPending(false));
  };

  return (
    <View style={styles.focusKindBlock}>
      <Text style={[styles.focusKindLabel, {color: textColor}]}>{label}</Text>
      {focused.map(item => (
        <FocusedItemRow
          key={item.path}
          label={item.name}
          onPress={() => onOpenItem(item.kind, {name: item.name, path: item.path, isFolder: true})}
          onRemove={() => handleRemove(item)}
          disabled={pending}
          textColor={textColor}
          borderColor={borderColor}
        />
      ))}
      {Array.from({length: emptySlotCount}).map((_, i) => (
        <Pressable key={`empty-${i}`} style={[styles.row, {borderColor}]} onPress={onAddEmpty} disabled={pending} hitSlop={8}>
          <Text style={[styles.rowText, styles.addSlotText, {color: textColor}]}>+ Add {kindLabel}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  focusKindBlock: {
    marginBottom: 12,
  },
  focusKindLabel: {
    fontSize: FONT.small,
    fontWeight: '600',
    opacity: 0.6,
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    paddingVertical: 7,
  },
  rowTextWrap: {
    flex: 1,
  },
  rowText: {
    fontSize: FONT.medium,
  },
  addSlotText: {
    opacity: 0.6,
  },
  cancelText: {
    fontSize: FONT.medium,
    opacity: 0.6,
    marginLeft: 8,
    paddingHorizontal: 4,
  },
});

/**
 * Memoized (docs/dev/technical-design-render-perf-ab.md §3 B2): re-renders only
 * when its props change. Call sites pass stable callbacks
 * (ui/useStableCallback.ts); an unstable prop somewhere only means the memo
 * doesn't skip there, never a stale render.
 */
export default React.memo(DailyFocusPanel);
