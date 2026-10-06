/**
 * ItemContextBlock — Area (read-only) + Scope + Last goal, stacked, shared
 * by all four Review steps that show a single Project/Area's context in
 * the detail column (Stalled projects, Neglected areas, Done awaiting
 * review, On Hold reconsideration - docs/dev/technical-design-review-master-
 * detail.md §5.1).
 *
 * Scope/Goal rendering and editing live in one place (ui/ItemContextRows.tsx),
 * used by both the item detail screen's ui/ItemFocusPanel.tsx and every
 * Review step that shows an item, so the same elements look and behave the
 * same everywhere.
 *
 * Takes the already-loaded `item: CachedItem` directly (Review's own live
 * cache lookup - see reviewAggregate.ts's/ReviewScreen.tsx's module doc
 * comments on why the detail panel always re-reads `items.find(...)` rather
 * than trusting a frozen snapshot entry) rather than doing its own
 * `ensureItemCached` load the way `ItemFocusPanel` does - Review already has
 * the item in hand, so a second load here would be redundant I/O.
 *
 * Saves write straight through the shared cache (`updateItemScope`/
 * `updateItemWeeklyGoals`, same functions `ItemFocusPanel`'s own
 * handleSaveScope/handleSaveGoal call) and then call `onChanged` so the
 * caller can refresh its own view of the cache (`ReviewScreen.tsx`'s
 * `refreshFromCache` pattern).
 *
 * Area (Projects only, `item.area`) is plain read-only text, deliberately
 * NOT `ui/ItemStatusPanel.tsx`'s interactive "Area: name ✕" pill - the Area
 * can't be reassigned from Review. See the technical design's §6.2 for why
 * that piece is not reused. Renders nothing when a Project has no Area
 * assigned (this block can't assign one) and never for Areas (which have no
 * `area` field of their own).
 *
 * Scope and Goal are always editable here (`disabled={false}`) regardless
 * of the item's status - see the technical design's §4.3 (`ItemGoalRow`'s
 * `disabled` prop is supplied by the caller).
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
