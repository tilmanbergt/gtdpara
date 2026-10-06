/**
 * Weekly + monthly goals behind one API (docs/dev/history/technical-design-monthly-view.md
 * §4.2). Before this, "save a weekly goal" existed in three copies
 * (screens/WeekView.tsx, ui/ItemFocusPanel.tsx, ui/ItemContextBlock.tsx);
 * every goal read/write for either period now goes through here. The stored
 * shapes stay as they were (`CachedItem.weeklyGoals` with `weekKey`,
 * `CachedItem.monthlyGoals` with `monthKey`) - this module only maps them to
 * one generic `{key, text}` view.
 */
import {setGoalForMonth, setGoalForWeek} from '../domain/markdown';
import {PeriodScope} from '../domain/period';
import {CachedItem, findCachedItem, updateItemMonthlyGoals, updateItemWeeklyGoals} from './dataCache';
import {DailyItemRef} from './dailyAggregate';
import {saveMonthlyGoals, saveWeeklyGoals} from './projectFile';

export interface PeriodGoal {
  key: string;
  text: string;
}

/** Every goal `item` ever had for `scope`, as `{key, text}`. */
export function goalsOf(
  item: Pick<CachedItem, 'weeklyGoals' | 'monthlyGoals'>,
  scope: PeriodScope,
): PeriodGoal[] {
  return scope === 'weekly'
    ? item.weeklyGoals.map(g => ({key: g.weekKey, text: g.text}))
    : item.monthlyGoals.map(g => ({key: g.monthKey, text: g.text}));
}

/** `item`'s goal text for period `key`, or null. */
export function goalFor(
  item: Pick<CachedItem, 'weeklyGoals' | 'monthlyGoals'>,
  scope: PeriodScope,
  key: string,
): string | null {
  return goalsOf(item, scope).find(g => g.key === key)?.text ?? null;
}

/**
 * Sets (or, for blank `text`, clears) `item`'s goal for period `key` and
 * write-throughs file then cache. Re-reads the item fresh from the cache
 * first ("never trust a possibly-stale closed-over item" - the pattern every
 * former copy of this already followed), so a caller may pass any snapshot.
 */
export async function saveItemGoal(
  item: Pick<CachedItem, 'path' | 'name'>,
  scope: PeriodScope,
  key: string,
  text: string,
): Promise<void> {
  const current = findCachedItem(item.path);
  if (!current) throw new Error(`"${item.name}" changed on disk - Settings → Advanced → Reload all files.`);
  if (scope === 'weekly') {
    const next = setGoalForWeek(current.weeklyGoals, key, text);
    const raw = await saveWeeklyGoals(current.kind, current.path, current.rawContent, next, current.weeklyGoalsExtraLines);
    updateItemWeeklyGoals(current.path, raw, next, current.weeklyGoalsExtraLines);
  } else {
    const next = setGoalForMonth(current.monthlyGoals, key, text);
    const raw = await saveMonthlyGoals(current.kind, current.path, current.rawContent, next, current.monthlyGoalsExtraLines);
    updateItemMonthlyGoals(current.path, raw, next, current.monthlyGoalsExtraLines);
  }
}

/** One item that had a goal recorded for a specific period - see findGoalsForPeriod. */
export interface GoalHistoryEntry {
  item: DailyItemRef;
  goal: string;
}

/**
 * Every item that has a goal for period `key` - goal-driven, not
 * focus-driven (docs/dev/history/technical-design-weekly-goals.md §1: a past period
 * shows only goals that were actually set, regardless of the item's current
 * focus flags). Reads only the passed-in cache array, no file scan.
 */
export function findGoalsForPeriod(items: CachedItem[], scope: PeriodScope, key: string): GoalHistoryEntry[] {
  const entries: GoalHistoryEntry[] = [];
  for (const cachedItem of items) {
    if (cachedItem.loadError) continue;
    const goal = goalFor(cachedItem, scope, key);
    if (goal === null) continue;
    entries.push({
      item: {
        kind: cachedItem.kind,
        name: cachedItem.name,
        path: cachedItem.path,
        dailyFocus: cachedItem.dailyFocus,
        weeklyFocus: cachedItem.weeklyFocus,
        monthlyFocus: cachedItem.monthlyFocus,
        abbrev: cachedItem.abbrev,
      },
      goal,
    });
  }
  return entries;
}
