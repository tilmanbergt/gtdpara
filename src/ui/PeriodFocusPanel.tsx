/**
 * The Week AND Month views' Focus/Projects/Areas panel (docs/dev/technical-design-
 * monthly-view.md §5.4) - ui/WeeklyFocusPanel.tsx generalized by `scope`, so
 * weekly and monthly focus have the same UX by construction (Tilman,
 * 2026-09-23: "weekly and monthly focus have very similar UX experience").
 * Same three mini-tabs (Focus | Projects | Areas), same arm-and-pick for an
 * empty slot (ui/FileBrowserPane.tsx's `LinkTarget` arming), same
 * tab-blocking-while-armed and leave-the-screen-cancels-the-arm behavior as
 * ui/DailyFocusPanel.tsx (see its module doc comment for the reasoning).
 *
 * Each focused item is a small card: name + D/W/M badges (ui/FocusBadges.tsx)
 * + "✕", a counts line (Next / Someday / meetings this week, or highlights
 * this month), a tap-to-edit goal row for the displayed period (`periodKey`),
 * and a dim line with the other planning level's goal (storage/
 * periodFocusCards.ts's `secondaryGoal`: the month goal on a weekly card,
 * this week's goal on a monthly card).
 *
 * Only ever rendered by the caller on a period whose focus/goals can be
 * edited (domain/period.ts's `canEditPeriod`); any other period gets
 * ui/PeriodGoalsHistoryPanel.tsx instead. Focus and goal writes are the
 * caller's (`onToggle`/`onSaveGoal`) - this panel only renders and collects.
 *
 * Self-measuring (see WeeklyFocusPanel's former `viewportHeight` note): with
 * `viewportHeight` omitted, this panel's root is `flex:1` and both
 * FileBrowserPanes measure the bounded box they're given.
 */
import React, {useCallback, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {PeriodScope} from '../domain/period';
import {CachedItem, findCachedItem} from '../storage/dataCache';
import {FOCUS_SCOPES} from '../storage/focusSlots';
import {PeriodFocusCardData} from '../storage/periodFocusCards';
import {FolderEntry} from '../supernote/fileSystem';
import {logError} from '../utils/log';
import FileBrowserPane, {ARMING_TEXT, FileBrowserRoot, LinkTarget} from './FileBrowserPane';
import FocusBadges from './FocusBadges';
import InlineTextEditor from './InlineTextEditor';
import MiniTabs, {MiniTabDef} from './MiniTabs';
import {FONT} from './theme';
import {useErrorStatus} from './status/StatusProvider';
import {usePerfRender} from '../utils/perf';

type FocusKind = 'project' | 'area';
type FocusPanelTab = 'focus' | 'projects' | 'areas';

const TAB_FOR_KIND: Record<FocusKind, FocusPanelTab> = {project: 'projects', area: 'areas'};

interface Props {
  /** Week or month - which focus flag, slot counts and goal period this panel works on. */
  scope: PeriodScope;
  items: CachedItem[];
  /** Absolute Projects/Areas folder paths - `FileBrowserRoot.rootPath` for the two browse tabs. */
  projectsPath: string;
  areasPath: string;
  projectLimit: number;
  areaLimit: number;
  /** The displayed period's focus-card data (storage/periodFocusCards.ts) - one entry per item focused at `scope`, looked up by path. */
  focusCards: PeriodFocusCardData[];
  /** Key of the period currently displayed ("2026-W41" / "2026-10") - which period a card's goal edits apply to. */
  periodKey: string;
  /** Jump the whole app to a Project/Area's Current tab - passed straight through from screens/WeekView.tsx (App.tsx's `openItem`), same as ui/DailyFocusPanel.tsx's identical prop. */
  onOpenItem: (kind: FocusKind, entry: FolderEntry) => void;
  /** Adds/removes `item` from `scope` focus (limit checked by the caller - storage/focusSlots.ts's toggleItemFocus). */
  onToggle: (item: CachedItem, value: boolean) => Promise<void>;
  /** Sets `item`'s goal text for `periodKey` (empty string clears it) - storage/periodGoals.ts's saveItemGoal. */
  onSaveGoal: (item: CachedItem, periodKey: string, text: string) => Promise<void>;
  /**
   * The Projects/Areas tabs' own `FileBrowserPane` viewport, in px.
   *
   * Optional (2026-09-17, [[feature_pagination_fixed_height]]) - omitted
   * (today's only caller, screens/WeekView.tsx), this panel's own root gets
   * a conditional `flex:1` and forwards `undefined` into both `FileBrowserPane`
   * calls, which self-measure on their own - see the module doc comment.
   * Passed explicitly, it goes straight to both calls instead, bypassing
   * self-measuring entirely (the escape hatch, same shape every other
   * optional `viewportHeight` prop this session has).
   */
  viewportHeight?: number;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}

function PeriodFocusPanel({
  scope,
  items,
  projectsPath,
  areasPath,
  projectLimit,
  areaLimit,
  focusCards,
  periodKey,
  onOpenItem,
  onToggle,
  onSaveGoal,
  viewportHeight,
  textColor,
  borderColor,
  placeholderColor,
}: Props): React.JSX.Element {
  usePerfRender('PeriodFocusPanel');
  // See `viewportHeight`'s own doc comment above.
  const selfMeasuring = viewportHeight == null;
  const [activeTab, setActiveTab] = useState<FocusPanelTab>('focus');
  // Which kind is currently armed for picking, or null - local state,
  // deliberately never lifted (see ui/DailyFocusPanel.tsx's module doc
  // comment's "Leaving Daily..." note - the same reasoning applies here:
  // App.tsx genuinely unmounts screens/WeekView.tsx when Week isn't the
  // active tab, which destroys this state for free).
  const [focusArm, setFocusArm] = useState<{kind: FocusKind} | null>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  useErrorStatus('PeriodFocusPanel.pickError', pickError, () => setPickError(null));

  const armFromEmptySlot = (kind: FocusKind) => {
    setPickError(null);
    setFocusArm({kind});
    setActiveTab(TAB_FOR_KIND[kind]);
  };
  const cancelArm = useCallback(() => setFocusArm(null), []);

  /** See ui/DailyFocusPanel.tsx's `handleFocusPick` - identical logic, against this panel's own `scope`. */
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
          logError('PeriodFocusPanel: pick failed', e instanceof Error ? e.message : String(e));
          setPickError(e instanceof Error ? e.message : String(e));
        });
    },
    [focusArm, projectsPath, areasPath, items, onToggle],
  );

  const activeOnly = (entry: FolderEntry) => findCachedItem(entry.path)?.status === 'active';
  const activeAndNotFocused = (kind: FocusKind) => (entry: FolderEntry) => {
    const cached = findCachedItem(entry.path);
    return cached?.status === 'active' && cached.kind === kind && !cached[FOCUS_SCOPES[scope].field];
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
  const linkTargetFor = (tabKind: FocusKind): LinkTarget | null =>
    focusArm?.kind === tabKind
      ? {
          mode: 'arming',
          pickKind: 'folder',
          label: ARMING_TEXT.focus(scope, tabKind),
          onPick: handleFocusPick,
          onCancel: cancelArm,
        }
      : null;

  const tabs: MiniTabDef<FocusPanelTab>[] = [
    {key: 'focus', label: 'Focus', disabled: !!focusArm},
    {key: 'projects', label: 'Projects', disabled: !!focusArm && focusArm.kind !== 'project'},
    {key: 'areas', label: 'Areas', disabled: !!focusArm && focusArm.kind !== 'area'},
  ];

  // Monthly defaults to more areas than projects (3 A / 2 P), so Areas lead
  // there; weekly keeps its original Projects-first order.
  const sectionOrder: FocusKind[] = scope === 'monthly' ? ['area', 'project'] : ['project', 'area'];

  const cardFor = (path: string): PeriodFocusCardData | null =>
    focusCards.find(c => c.item.path === path) ?? null;

  return (
    <View style={selfMeasuring ? styles.selfMeasuringRoot : undefined}>
      <MiniTabs tabs={tabs} activeKey={activeTab} onChange={setActiveTab} textColor={textColor} borderColor={borderColor} />
      {activeTab === 'focus' && (
        <>
          {sectionOrder.map(kind => (
            <FixedSlotSection
              key={kind}
              scope={scope}
              kind={kind}
              label={kind === 'project' ? 'Projects' : 'Areas'}
              limit={kind === 'project' ? projectLimit : areaLimit}
              items={items}
              cardFor={cardFor}
              periodKey={periodKey}
              onOpenItem={onOpenItem}
              onToggle={onToggle}
              onSaveGoal={onSaveGoal}
              onAddEmpty={() => armFromEmptySlot(kind)}
              textColor={textColor}
              borderColor={borderColor}
              placeholderColor={placeholderColor}
            />
          ))}
        </>
      )}
      {activeTab === 'projects' && (
        <FileBrowserPane
          roots={[projectsRoot]}
          linkTarget={linkTargetFor('project')}
          resetKey="projects"
          viewportHeight={viewportHeight}
          textColor={textColor}
          borderColor={borderColor}
        />
      )}
      {activeTab === 'areas' && (
        <FileBrowserPane
          roots={[areasRoot]}
          linkTarget={linkTargetFor('area')}
          resetKey="areas"
          viewportHeight={viewportHeight}
          textColor={textColor}
          borderColor={borderColor}
        />
      )}
    </View>
  );
}

/**
 * One kind's row of focus slots at this panel's `scope` - every currently-focused item of
 * `kind`, rendered as a small card (name + Next/Someday/meeting counts - see
 * the module doc comment), followed by however many empty slots remain
 * under `limit`. Otherwise identical to ui/DailyFocusPanel.tsx's own
 * `FixedSlotSection` (tap-name-to-navigate, "✕" to remove, pending/
 * actionError).
 */
function FixedSlotSection({
  scope,
  kind,
  label,
  limit,
  items,
  cardFor,
  periodKey,
  onOpenItem,
  onToggle,
  onSaveGoal,
  onAddEmpty,
  textColor,
  borderColor,
  placeholderColor,
}: {
  scope: PeriodScope;
  kind: FocusKind;
  label: string;
  limit: number;
  items: CachedItem[];
  cardFor: (path: string) => PeriodFocusCardData | null;
  periodKey: string;
  onOpenItem: (kind: FocusKind, entry: FolderEntry) => void;
  onToggle: (item: CachedItem, value: boolean) => Promise<void>;
  onSaveGoal: (item: CachedItem, periodKey: string, text: string) => Promise<void>;
  onAddEmpty: () => void;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}): React.JSX.Element {
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  useErrorStatus('PeriodFocusPanel.actionError', actionError, () => setActionError(null));

  const focused = items.filter(item => item.kind === kind && item[FOCUS_SCOPES[scope].field]);
  const emptySlotCount = Math.max(0, limit - focused.length);
  const kindLabel = kind === 'project' ? 'project' : 'area';

  const handleRemove = (item: CachedItem) => {
    setActionError(null);
    setPending(true);
    onToggle(item, false)
      .catch(e => {
        logError('PeriodFocusPanel: remove failed', e instanceof Error ? e.message : String(e));
        setActionError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setPending(false));
  };

  return (
    <View style={styles.focusKindBlock}>
      <Text style={[styles.focusKindLabel, {color: textColor}]}>{label}</Text>
      {focused.map(item => {
        const card = cardFor(item.path);
        const meetingCount = card?.meetingCount ?? 0;
        const meetingWord =
          scope === 'weekly'
            ? `meeting${meetingCount === 1 ? '' : 's'} this week`
            : `highlight${meetingCount === 1 ? '' : 's'}`;
        return (
          <View key={item.path} style={[styles.card, {borderColor}]}>
            <View style={styles.cardHeaderRow}>
              <Pressable
                style={styles.rowTextWrap}
                onPress={() => onOpenItem(item.kind, {name: item.name, path: item.path, isFolder: true})}>
                <Text style={[styles.rowText, {color: textColor}]} numberOfLines={1}>
                  {item.name}
                </Text>
              </Pressable>
              <FocusBadges item={item} active={scope} textColor={textColor} />
              <Pressable onPress={() => handleRemove(item)} disabled={pending} hitSlop={8}>
                <Text style={[styles.cancelText, {color: textColor}]}>✕</Text>
              </Pressable>
            </View>
            <Text style={[styles.cardCountRow, {color: textColor}]}>
              {card?.nextCount ?? 0} Next · {card?.somedayCount ?? 0} Someday · {meetingCount} {meetingWord}
            </Text>
            {/* key={periodKey}: forces a clean remount (resets any in-progress
                edit/draft) when the displayed period changes - see GoalRow. */}
            <GoalRow
              key={periodKey}
              scope={scope}
              item={item}
              goal={card?.goal ?? null}
              periodKey={periodKey}
              onSaveGoal={onSaveGoal}
              textColor={textColor}
              borderColor={borderColor}
              placeholderColor={placeholderColor}
            />
            {card?.secondaryGoal && (
              <Text style={[styles.secondaryGoal, {color: textColor}]} numberOfLines={1}>
                {card.secondaryGoal.label}: {card.secondaryGoal.text}
              </Text>
            )}
          </View>
        );
      })}
      {Array.from({length: emptySlotCount}).map((_, i) => (
        <Pressable key={`empty-${i}`} style={[styles.row, {borderColor}]} onPress={onAddEmpty} disabled={pending} hitSlop={8}>
          <Text style={[styles.rowText, styles.addSlotText, {color: textColor}]}>+ Add {kindLabel}</Text>
        </Pressable>
      ))}
    </View>
  );
}

/**
 * Tap-to-edit goal line for one focus card (the displayed period's goal).
 * Not editing: shows the current goal text (with a target marker) or, if
 * `periodKey` has no goal set for this item, a dim
 * "+ Add a goal" prompt - either is tappable to enter edit mode. Editing:
 * ui/InlineTextEditor.tsx (shared with ItemContextRows' Scope/Goal rows),
 * whose draft seeds from `goal` each time it mounts - the caller remounts this
 * component via `key={periodKey}` when the displayed period changes instead, so
 * this component itself doesn't need to reconcile an external goal change
 * against a possibly-open edit.
 */
function GoalRow({
  scope,
  item,
  goal,
  periodKey,
  onSaveGoal,
  textColor,
  borderColor,
  placeholderColor,
}: {
  scope: PeriodScope;
  item: CachedItem;
  goal: string | null;
  periodKey: string;
  onSaveGoal: (item: CachedItem, periodKey: string, text: string) => Promise<void>;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}): React.JSX.Element {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <InlineTextEditor
        initialText={goal ?? ''}
        onSave={text => onSaveGoal(item, periodKey, text)}
        onClose={() => setEditing(false)}
        placeholder={scope === 'weekly' ? 'Goal for this week' : 'Goal for this month'}
        logLabel="PeriodFocusPanel: save goal failed"
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
    );
  }

  return (
    <Pressable onPress={() => setEditing(true)} hitSlop={4}>
      <Text style={[styles.goalRow, {color: textColor}, !goal && styles.goalRowEmpty]} numberOfLines={2}>
        {goal ? `🎯 ${goal}` : `+ Add a goal for this ${scope === 'weekly' ? 'week' : 'month'}`}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // See `viewportHeight`'s own doc comment - mirrors
  // ui/ReviewMasterDetail.tsx's/ui/GoogleCalendarPanel.tsx's own
  // `selfMeasuringRoot`.
  selfMeasuringRoot: {
    flex: 1,
  },
  focusKindBlock: {
    marginBottom: 12,
  },
  focusKindLabel: {
    fontSize: FONT.small,
    fontWeight: '600',
    opacity: 0.6,
    marginBottom: 4,
  },
  card: {
    borderBottomWidth: 1,
    paddingVertical: 7,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardCountRow: {
    fontSize: FONT.small,
    opacity: 0.6,
    marginTop: 2,
  },
  goalRow: {
    fontSize: FONT.small,
    marginTop: 4,
  },
  goalRowEmpty: {
    opacity: 0.6,
  },
  secondaryGoal: {
    fontSize: FONT.small,
    opacity: 0.6,
    marginTop: 2,
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
export default React.memo(PeriodFocusPanel);
