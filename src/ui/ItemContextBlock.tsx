/**
 * ItemContextBlock — Area (read-only) + Scope + Last goal, stacked, shared
 * by all four Review steps that show a single Project/Area's context in
 * the detail column (Stalled projects, Neglected areas, Done awaiting
 * review, On Hold reconsideration - docs/dev/technical-design-review-master-
 * detail.md §5.1). New component, 2026-09-16.
 *
 * This is the concrete answer to "gleiche visuelle und UX Logik für gleiche
 * Elemente überall": Scope/Goal rendering and editing now live in exactly
 * one place (ui/ItemContextRows.tsx), used by both the item detail screen's
 * ui/ItemFocusPanel.tsx and every Review step that shows an item - not a
 * second, drifting copy.
 *
 * Takes the already-loaded `item: CachedItem` directly (Review's own live
 * cache lookup - see reviewAggregate.ts's/ReviewScreen.tsx's module doc
 * comments on why the detail panel always re-reads `items.find(...)` rather
 * than trusting a frozen snapshot entry) rather than doing its own
 * `ensureItemCached` load the way `ItemFocusPanel` does - Review already has
 * the item in hand, so a second load here would just be redundant I/O.
 *
 * Saves write straight through the shared cache (`updateItemScope`/
 * `updateItemWeeklyGoals`, same functions `ItemFocusPanel`'s own
 * handleSaveScope/handleSaveGoal call) and then call `onChanged` so the
 * caller can refresh its own view of the cache - mirrors
 * `ReviewScreen.tsx`'s existing `refreshFromCache` pattern used after every
 * other mutation on that screen.
 *
 * Area (Projects only, `item.area`) is plain read-only text, deliberately
 * NOT `ui/ItemStatusPanel.tsx`'s interactive "Area: name ✕" pill - Review's
 * requirement is the opposite of that component's entire reason to exist
 * (confirmed in the requirements chat: "area aber nicht wechselbar" - no
 * reassignment from Review). See the technical design's §6.2 for the full
 * reasoning on why that one piece is a deliberate non-reuse. Renders
 * nothing when a Project has no Area assigned yet (nothing actionable to
 * show here either way, since this block can't assign one) and never for
 * Areas (which have no `area` field of their own).
 *
 * Scope and Goal are always editable here (`disabled={false}`) regardless
 * of the item's status - confirmed in the requirements chat ("ich denke
 * editierbar ist okay an dieser Stelle" for Scope; Goal follows the same
 * reasoning) - see the technical design's §4.3 for why this needs zero
 * changes to `ItemGoalRow` itself (its `disabled` prop was already
 * externally supplied, not internally computed).
 */
import React, {useCallback} from 'react';
import {StyleSheet, Text, View} from 'react-native';
import {CachedItem, updateItemScope} from '../storage/dataCache';
import {goalsOf, saveItemGoal} from '../storage/periodGoals';
import {saveScope} from '../storage/projectFile';
import {logError} from '../utils/log';
import {ItemGoalRow, ItemScopeRow} from './ItemContextRows';
import {FONT} from './theme';
import {errorMessage} from '../utils/errorMessage';

interface Props {
  item: CachedItem;
  /** Computed once by the caller (e.g. ReviewScreen: `isoWeekKey(new Date())`) and passed to every ItemContextBlock instance in the same step, so every card in one review moment agrees on "now" - see ItemGoalRow's own doc comment. */
  currentWeekKey: string;
  /** Called after a successful Scope/Goal save - the caller should re-read the cache into its own state (ReviewScreen's existing `refreshFromCache`), since this block mutates the shared cache directly but doesn't hold any view state of its own. */
  onChanged?: () => void;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}

export default function ItemContextBlock({
  item,
  currentWeekKey,
  onChanged,
  textColor,
  borderColor,
  placeholderColor,
}: Props): React.JSX.Element {
  const handleSaveScope = useCallback(
    async (text: string) => {
      try {
        const nextRaw = await saveScope(item.kind, item.path, item.rawContent, text);
        updateItemScope(item.path, nextRaw, text);
        onChanged?.();
      } catch (e) {
        logError('ItemContextBlock: save scope failed', item.path, errorMessage(e));
        throw e;
      }
    },
    [item.kind, item.path, item.rawContent, onChanged],
  );

  const handleSaveGoal = useCallback(
    async (text: string) => {
      try {
        await saveItemGoal(item, 'weekly', currentWeekKey, text);
        onChanged?.();
      } catch (e) {
        logError('ItemContextBlock: save goal failed', item.path, errorMessage(e));
        throw e;
      }
    },
    [item, currentWeekKey, onChanged],
  );

  return (
    <View style={styles.root}>
      {item.kind === 'project' && item.area && (
        <Text style={[styles.areaLine, {color: textColor}]}>Area: {item.area}</Text>
      )}
      <ItemScopeRow
        scope={item.scope}
        onSaveScope={handleSaveScope}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
      <ItemGoalRow
        goals={goalsOf(item, 'weekly')}
        scope="weekly"
        disabled={false}
        currentKey={currentWeekKey}
        onSaveGoal={handleSaveGoal}
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
  areaLine: {
    fontSize: FONT.small,
    fontWeight: '600',
    marginBottom: 4,
  },
});
