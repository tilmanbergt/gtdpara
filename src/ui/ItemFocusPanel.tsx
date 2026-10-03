/**
 * Scope + Focus (Daily/Weekly focus checkboxes + the weekly-goal line) -
 * the Current tab's left pane, pinned to the very TOP of the column
 * (2026-09-13, Tilman: "move now the focus selection and display to the
 * top of that column, above the file panel"), above Files. Split out of
 * ui/ItemStatusPanel.tsx, which used to render the Focus section itself
 * (2026-09-09 through 2026-09-13) directly above Archive at the BOTTOM of
 * the column - once Focus needed a screen position on the opposite side
 * of Files from Status/Archive/Assign-to-Area, one component could no
 * longer render both, so this became its own file.
 *
 * Same "extract, don't lift" independent-load pattern ui/ItemStatusPanel.tsx's
 * own module doc comment documents (and screens/ItemDetail.tsx's own
 * `resourceFolderState` already independently duplicates much of the same
 * item state for its own unrelated purpose) - this component does its own
 * small `ensureItemCached` load rather than sharing state with
 * ItemStatusPanel, synchronized only through the shared cache +
 * write-through, same as every other section on this
 * screen. The one accepted consequence: changing Status in the (separate)
 * ItemStatusPanel at the bottom of the column - which itself clears both
 * focus flags when moving off Active - won't visibly greyout/uncheck the
 * Focus section here until the next refresh (manual 🔄, or this screen
 * remounting), same eventual-consistency window every other pair of
 * independently-loaded sections on this screen already has. Scope is
 * never affected by status either way (see below).
 *
 * Scope (docs/dev/technical-design-item-scope.md, 2026-09-14): a new "Scope"
 * section rendered ABOVE the existing "Focus" section, in the same
 * top-of-column block and the same load - added here rather than as a
 * new standalone component because it needs to sit immediately above
 * Focus (no positional conflict the way Focus vs. Status/Archive had),
 * so a fourth independently-loaded panel on this screen would just
 * duplicate this component's own load/error-state boilerplate for no
 * reason. A short (1-3 sentence, not length-limited) free-text
 * description of what this Project/Area is about, tap-to-edit like the
 * goal row below it, but - unlike Focus - never gated by item status:
 * Scope is descriptive metadata, not an actionable pick, so it stays
 * editable regardless of Active/On Hold/Done. Stored in the `## Scope`
 * file span (domain/markdown.ts's parseScopeSpan/writeScopeIntoContent),
 * which `ensureSkeleton` now scaffolds (empty) into every newly-created
 * Project/Area, specifically so it's already there to type into directly
 * from Obsidian.
 *
 * Weekly goal (docs/dev/technical-design-item-goal-display.md, 2026-09-13):
 * below the two checkboxes, one line shows this item's most-recently-set
 * goal - the entry with the latest ISO week key in `weeklyGoals[]`. If that
 * week is the real current week, it's shown plain; otherwise it's labeled
 * "Last goal (Week NN): ..." and shown regardless of whether this item is
 * currently weekly-focused (goal-driven, not focus-driven, matching
 * storage/weeklyAggregate.ts's own findWeeklyGoalsForWeek/
 * WeeklyGoalsHistoryPanel rule). Tapping it always edits *this week's* goal
 * (isoWeekKey(new Date()), never whichever other week's text happens to be
 * showing), with the draft pre-filled from whatever was displayed -
 * carrying an old goal's wording forward into this week is one edit. No
 * history list here at all, deliberately - the Week tab's ui/
 * WeeklyGoalsHistoryPanel.tsx remains the only place a goal's full history
 * is browsable.
 *
 * Monthly focus + monthly goal (2026-09-23, docs/dev/technical-design-monthly-
 * view.md §5.7): a third checkbox, and a second goal row (this month's goal)
 * below the week's. Each checkbox carries its D/W/M letter
 * (ui/FocusBadges.tsx's FocusLetter), the same marks the Week/Month focus
 * cards use. Focus toggles go through storage/focusSlots.ts's
 * toggleItemFocus and goal saves through storage/periodGoals.ts's
 * saveItemGoal - the shared paths every other screen uses. Every write reads
 * the item fresh from the cache first and re-syncs this panel's state from
 * the cache afterwards, so a change made meanwhile by another panel on this
 * screen (status, resource folder, abbreviation) is never overwritten.
 */
import React, {useCallback, useEffect, useState} from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';
import {PeriodScope, periodOf} from '../domain/period';
import {CachedItem, ensureItemCached, findCachedItem, getCachedData, updateItemScope} from '../storage/dataCache';
import {FocusScope, toggleItemFocus} from '../storage/focusSlots';
import {goalsOf, saveItemGoal} from '../storage/periodGoals';
import {saveScope} from '../storage/projectFile';
import {loadSettings} from '../storage/settingsStorage';
import {logError} from '../utils/log';
import {useEinkRefreshOnLoad} from '../utils/screenRefresh';
import {common} from './commonStyles';
import {FocusLetter} from './FocusBadges';
import {ItemGoalRow, ItemScopeRow} from './ItemContextRows';
import {FONT} from './theme';
import {useErrorStatus} from './status/StatusProvider';

interface Props {
  kind: 'project' | 'area';
  name: string;
  path: string;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}

const FOCUS_OPTIONS: Array<{scope: FocusScope; label: string}> = [
  {scope: 'daily', label: 'Daily'},
  {scope: 'weekly', label: 'Weekly'},
  {scope: 'monthly', label: 'Monthly'},
];

const FOCUS_FIELD: Record<FocusScope, 'dailyFocus' | 'weeklyFocus' | 'monthlyFocus'> = {
  daily: 'dailyFocus',
  weekly: 'weeklyFocus',
  monthly: 'monthlyFocus',
};

export default function ItemFocusPanel({
  kind,
  name,
  path,
  textColor,
  borderColor,
  placeholderColor,
}: Props): React.JSX.Element | null {
  // This panel's view of the item - always a copy of the shared cache entry
  // (re-synced after every write below).
  const [state, setState] = useState<CachedItem | null>(null);
  useEinkRefreshOnLoad(state === null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, setPending] = useState<FocusScope | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  useErrorStatus('ItemFocusPanel.actionError', actionError, () => setActionError(null));

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const item = await ensureItemCached(kind, name, path);
      if (item.loadError) throw new Error(item.loadError);
      setState({...item});
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      logError('ItemFocusPanel: load failed', kind, path, message);
      setLoadError(message);
    }
  }, [kind, name, path]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [load]);

  /** The item as a write should see it: fresh from the cache, else this panel's copy. */
  const current = (): CachedItem | null => findCachedItem(path) ?? state;
  const resync = () => {
    const fresh = findCachedItem(path);
    if (fresh) setState({...fresh});
  };

  const toggleFocus = useCallback(
    async (scope: FocusScope, value: boolean) => {
      const item = findCachedItem(path) ?? state;
      if (!item) return;
      const settings = await loadSettings();
      const items = getCachedData()?.items ?? [];
      await toggleItemFocus(items, item, scope, value, settings);
      const fresh = findCachedItem(path);
      if (fresh) setState({...fresh});
    },
    [state, path],
  );

  const handleToggle = (scope: FocusScope, next: boolean) => {
    setActionError(null);
    setPending(scope);
    toggleFocus(scope, next)
      .catch(e => {
        logError('ItemFocusPanel: toggle failed', e instanceof Error ? e.message : String(e));
        setActionError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setPending(null));
  };

  /**
   * Saves Scope (docs/dev/technical-design-item-scope.md). Save-only - Scope
   * never touches frontmatter, so no limit check and no status gate: Scope
   * stays editable regardless of the item's status.
   */
  const handleSaveScope = async (text: string) => {
    const item = current();
    if (!item) return;
    const nextRaw = await saveScope(kind, path, item.rawContent, text);
    updateItemScope(path, nextRaw, text);
    resync();
  };

  /** Sets the CURRENT week's / month's goal (docs/dev/technical-design-item-goal-display.md) - storage/periodGoals.ts's saveItemGoal. */
  const handleSaveGoal = (scope: PeriodScope) => async (text: string) => {
    const item = current();
    if (!item) return;
    await saveItemGoal(item, scope, periodOf(scope, new Date()).key, text);
    resync();
  };

  if (loadError) {
    return (
      <View style={styles.root}>
        <Text style={[common.error, {color: textColor}]}>⚠ {loadError}</Text>
      </View>
    );
  }

  if (!state) return null;

  const disabled = state.status !== 'active';

  return (
    <View style={styles.root}>
      <Text style={[styles.sectionTitle, {color: textColor}]}>Scope</Text>
      <ItemScopeRow
        scope={state.scope}
        onSaveScope={handleSaveScope}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
      <View style={[styles.divider, {backgroundColor: borderColor}]} />
      <Text style={[styles.sectionTitle, {color: textColor}]}>Focus</Text>
      <View style={[styles.focusRow, disabled && styles.sectionDisabled]}>
        {FOCUS_OPTIONS.map(({scope, label}) => {
          const on = state[FOCUS_FIELD[scope]];
          return (
            <Pressable
              key={scope}
              style={styles.focusOption}
              onPress={() => handleToggle(scope, !on)}
              disabled={disabled || pending !== null}
              hitSlop={8}>
              <Text style={[styles.checkbox, {color: textColor}]}>{on ? '☑' : '☐'}</Text>
              <FocusLetter scope={scope} filled={on} textColor={textColor} />
              <Text style={[styles.rowText, {color: textColor}]}>{label}</Text>
            </Pressable>
          );
        })}
      </View>
      {disabled && <Text style={[common.hint, {color: textColor}]}>Focus is only available for Active items.</Text>}
      <ItemGoalRow
        scope="weekly"
        goals={goalsOf(state, 'weekly')}
        disabled={disabled}
        onSaveGoal={handleSaveGoal('weekly')}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
      <ItemGoalRow
        scope="monthly"
        goals={goalsOf(state, 'monthly')}
        disabled={disabled}
        onSaveGoal={handleSaveGoal('monthly')}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: FONT.medium,
    fontWeight: '600',
    marginBottom: 10,
  },
  sectionDisabled: {
    opacity: 0.4,
  },
  divider: {
    height: 1,
    marginBottom: 10,
  },
  focusRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  focusOption: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 18,
  },
  checkbox: {
    fontSize: FONT.medium,
    marginRight: 2,
  },
  rowText: {
    fontSize: FONT.medium,
    marginLeft: 6,
  },
});
