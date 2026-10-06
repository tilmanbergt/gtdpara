/**
 * Daily/weekly/monthly focus: how many Projects/Areas can be marked focused
 * at once (domain/settings.ts's six *FocusCount fields), and the shared save path
 * both the Project/Area view (ProjectDataPanel's two checkboxes) and Daily
 * view (its own Focus section) use to flip a flag - one place enforcing the
 * limit, rather than reimplementing the check twice.
 *
 * countFocused/canAddFocus/focusBlockedReason are pure reads over an
 * already-cached CachedItem[] (same "read the already-warm cache" rule
 * dailyAggregate.ts follows) - never scan the filesystem to answer "is
 * daily project focus full?". setItemFocus is the one function here that
 * does I/O, and it's unconditional: it does not itself check the limit -
 * callers must check focusBlockedReason first when turning a flag *on*
 * (turning one off never needs the check) and skip the call entirely if
 * it returns non-null, showing that message instead.
 */
import {GtdParaSettings} from '../domain/settings';
import {CachedItem, FrontMatterSource, frontMatterOf, updateItemFrontMatter} from './dataCache';
import {saveFrontMatter} from './projectFile';

export type FocusScope = 'daily' | 'weekly' | 'monthly';
export type FocusKind = 'project' | 'area';

type FocusField = 'dailyFocus' | 'weeklyFocus' | 'monthlyFocus';
type FocusCountSetting =
  | 'dailyFocusProjectCount'
  | 'dailyFocusAreaCount'
  | 'weeklyFocusProjectCount'
  | 'weeklyFocusAreaCount'
  | 'monthlyFocusProjectCount'
  | 'monthlyFocusAreaCount';

/**
 * One row of config per focus level (docs/dev/technical-design-monthly-view.md
 * §4.1) - the frontmatter flag, the two Settings slot counts, and the label
 * used in messages. Adding a level is one more row here, not another
 * branch in every function below.
 */
export const FOCUS_SCOPES: Record<
  FocusScope,
  {field: FocusField; project: FocusCountSetting; area: FocusCountSetting; label: string; letter: string}
> = {
  daily: {field: 'dailyFocus', project: 'dailyFocusProjectCount', area: 'dailyFocusAreaCount', label: 'Daily', letter: 'D'},
  weekly: {field: 'weeklyFocus', project: 'weeklyFocusProjectCount', area: 'weeklyFocusAreaCount', label: 'Weekly', letter: 'W'},
  monthly: {field: 'monthlyFocus', project: 'monthlyFocusProjectCount', area: 'monthlyFocusAreaCount', label: 'Monthly', letter: 'M'},
};

/** The configured slot count for `kind` at `scope`. */
export function focusLimit(kind: FocusKind, scope: FocusScope, settings: GtdParaSettings): number {
  const cfg = FOCUS_SCOPES[scope];
  return settings[kind === 'project' ? cfg.project : cfg.area];
}

/** How many `kind` items currently have `scope` focus set. */
export function countFocused(items: CachedItem[], kind: FocusKind, scope: FocusScope): number {
  const field = FOCUS_SCOPES[scope].field;
  return items.filter(item => item.kind === kind && item[field]).length;
}

/**
 * Whether one more `kind` item can be added to `scope` focus under
 * `settings`'s configured limit. Lowering a limit below the current count
 * elsewhere (Settings) never un-focuses anything - so `used` can already be
 * `>= limit` here, which just means no *new* one can be added until the
 * count is back under the limit by manual removal.
 */
export function canAddFocus(
  items: CachedItem[],
  kind: FocusKind,
  scope: FocusScope,
  settings: GtdParaSettings,
): boolean {
  return countFocused(items, kind, scope) < focusLimit(kind, scope, settings);
}

/** A user-facing reason a focus-on attempt is blocked, or null if it's allowed right now. Only meaningful when turning a flag *on* - never call this for turning one off. */
export function focusBlockedReason(
  items: CachedItem[],
  kind: FocusKind,
  scope: FocusScope,
  settings: GtdParaSettings,
): string | null {
  const limit = focusLimit(kind, scope, settings);
  const used = countFocused(items, kind, scope);
  if (used < limit) return null;
  const kindLabel = kind === 'project' ? 'project' : 'area';
  return `${FOCUS_SCOPES[scope].label} ${kindLabel} focus is full (${used}/${limit}) - remove one first.`;
}

/**
 * Flips `item`'s `scope` focus flag to `value` and saves: writes the file
 * (saveFrontMatter) then the cache (updateItemFrontMatter), in that order,
 * same as every other mutation in this codebase (design-overview.md §3,
 * "Write-through is not optional"). Does not check the limit itself - see
 * the module doc comment, or use `toggleItemFocus` below, which does.
 *
 * Every other frontmatter field is carried through unchanged via
 * `frontMatterOf` (docs/dev/technical-design-monthly-view.md §2.1).
 */
export async function setItemFocus(
  item: Pick<CachedItem, 'kind' | 'path' | 'rawContent'> & FrontMatterSource,
  scope: FocusScope,
  value: boolean,
): Promise<{rawContent: string; dailyFocus: boolean; weeklyFocus: boolean; monthlyFocus: boolean}> {
  const fm = {...frontMatterOf(item), [FOCUS_SCOPES[scope].field]: value};
  const rawContent = await saveFrontMatter(item.kind, item.path, item.rawContent, fm);
  updateItemFrontMatter(item.path, rawContent, fm);
  return {rawContent, dailyFocus: fm.dailyFocus, weeklyFocus: fm.weeklyFocus, monthlyFocus: fm.monthlyFocus};
}

/**
 * The one "check the limit, then flip the flag" path every focus toggle in
 * the app uses (Daily's focus panel, Week/Month focus panels, the
 * Project/Area page's checkboxes) - throws the user-facing
 * `focusBlockedReason` message when turning a flag on would exceed the
 * limit. Turning a flag off never checks.
 */
export async function toggleItemFocus(
  items: CachedItem[],
  item: Pick<CachedItem, 'kind' | 'path' | 'rawContent'> & FrontMatterSource,
  scope: FocusScope,
  value: boolean,
  settings: GtdParaSettings,
): Promise<{rawContent: string; dailyFocus: boolean; weeklyFocus: boolean; monthlyFocus: boolean}> {
  if (value) {
    const reason = focusBlockedReason(items, item.kind, scope, settings);
    if (reason) throw new Error(reason);
  }
  return setItemFocus(item, scope, value);
}
