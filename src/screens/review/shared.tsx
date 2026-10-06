/**
 * What the Review shell hands every step, and the small pieces several
 * steps share: the empty detail column, the left-list row for an item, and
 * the live lookup of a frozen item reference.
 */
import React from 'react';
import {Text, View} from 'react-native';
import {Destination} from '../../domain/destination';
import {CachedItem} from '../../storage/dataCache';
import {focusBlockedReason, setItemFocus} from '../../storage/focusSlots';
import {log} from '../../utils/log';
import {requestEinkRefresh} from '../../utils/screenRefresh';
import {bump} from './reviewVisit';
import {ReviewItemRef} from '../../storage/reviewAggregate';
import {SettableStatus} from '../../storage/statusControl';
import {COLUMN_WIDTH_PX, itemEntryDisplayText, itemEntryHeight, itemEntryLines} from '../../ui/itemEntryRow';
import {styles} from './reviewStyles';
import {ReviewData} from './useReviewData';

export interface ReviewColors {
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}

/** Props every step gets from the shell. */
export interface ReviewStepProps extends ReviewColors {
  data: ReviewData;
  /** Changes on every page change: the master-detail list's selection reset. */
  stepEntryToken: number;
  /** Opens a Project/Area in the Current tab. */
  onOpenItem: (item: ReviewItemRef) => void;
  /** Adds a task (Quick Add on any step) and counts it in the recap. */
  onAddTask: (text: string, destination: Destination) => Promise<void>;
}

/** Quick Add needs an onAddMeeting even in `taskOnly` mode, where it is never reached. */
export const noopAddMeeting = async (): Promise<void> => {};

export const FIXED_INBOX_DESTINATION: Destination = {type: 'inbox'};

/** "This item changed on disk" - the message every step throws when a frozen row no longer matches the files. */
export function changedOnDisk(name: string): Error {
  return new Error(`"${name}" changed on disk - Settings → Advanced → Reload all files.`);
}

export const SETTINGS_NOT_LOADED = 'Settings not loaded yet - Settings → Advanced → Reload all files.';

/**
 * Adds `item` to (or removes it from) the weekly or monthly focus - Focus
 * reset and Unfocused next items. Adding checks the slot limit first.
 */
export async function togglePeriodFocus(data: ReviewData, item: CachedItem, scope: 'weekly' | 'monthly', value: boolean): Promise<void> {
  if (value) {
    if (!data.settings) throw new Error(SETTINGS_NOT_LOADED);
    const reason = focusBlockedReason(data.items, item.kind, scope, data.settings);
    if (reason) throw new Error(reason);
  }
  await setItemFocus(item, scope, value);
  log('ReviewScreen: period focus toggled', scope, item.path, value);
  data.refreshFromCache();
  if (value) bump(scope === 'weekly' ? 'weeklyFocusAdded' : 'monthlyFocusAdded');
  requestEinkRefresh();
}

export function statusLabel(status: SettableStatus): string {
  if (status === 'active') return 'Active';
  if (status === 'on-hold') return 'On Hold';
  return 'Done';
}

/**
 * A safe-default CachedItem for a frozen `ReviewItemRef` that's vanished
 * from the live cache between freezing a step's snapshot and rendering it
 * (item removed on disk outside the plugin, or a stale path) - same shape
 * `storage/dataCache.ts`'s own `loadOneItem` catch branch already uses for
 * a failed load, reused here rather than inventing a second "empty
 * CachedItem" shape. Lets every master-detail row/detail renderer below
 * call `ui/itemEntryRow.ts`'s helpers and `ui/ItemContextBlock.tsx`
 * unconditionally on a real `CachedItem`, instead of every call site
 * separately guarding a possibly-undefined lookup.
 */
function reviewFallbackItem(ref: ReviewItemRef): CachedItem {
  return {
    kind: ref.kind,
    name: ref.name,
    path: ref.path,
    rawContent: '',
    tasks: [],
    meetings: [],
    taskExtraLines: [],
    meetingExtraLines: [],
    scope: '',
    weeklyGoals: [],
    weeklyGoalsExtraLines: [],
    monthlyGoals: [],
    monthlyGoalsExtraLines: [],
    marks: [],
    marksExtraLines: [],
    status: 'active',
    dailyFocus: false,
    weeklyFocus: false,
    monthlyFocus: false,
    defaultResourceFolder: null,
    area: null,
    abbrev: null,
    frontMatterExtraLines: [],
  };
}

/**
 * The live `CachedItem` for a frozen `ReviewItemRef`, falling back to
 * `reviewFallbackItem` above in the (normally unreachable) case it's gone
 * missing from `items` - same "look the item back up in the live cache on
 * every render" pattern the old `ReviewItemCard`/`UnfocusedNextCard` always
 * used for their own task/meeting lists (see this file's "Frozen snapshots"
 * module doc comment), now the single shared lookup every converted step's
 * row and detail renderer uses.
 */
export function reviewCurrentItem(ref: ReviewItemRef, items: CachedItem[]): CachedItem {
  return items.find(i => i.path === ref.path) ?? reviewFallbackItem(ref);
}

/**
 * One left-list row, shared by Stalled projects / Neglected areas / Done
 * awaiting review / On Hold reconsideration (all four are a flat list of
 * single items, unlike Unfocused next items' own grouped rows) - same
 * itemEntryHeight/itemEntryLines/itemEntryDisplayText sizing/text-fit logic
 * `screens/ItemsList.tsx` uses for its own Projects/Areas list (docs/
 * technical-design-review-master-detail.md §6.5), so a project/area reads
 * identically wherever it's listed. `actedOn` prepends a checkmark and
 * mutes the row (still fully tappable, still re-selectable - the
 * "eine Haken reicht, aber auch Option es nochmal zu ändern" requirement);
 * `selected` gives the row a left accent bar, mirroring the mockup.
 */
export function ReviewLeftRow({
  current,
  selected,
  actedOn,
  textColor,
  borderColor,
}: {
  current: CachedItem;
  selected: boolean;
  actedOn: boolean;
  textColor: string;
  borderColor: string;
}): React.JSX.Element {
  const heightPx = itemEntryHeight(current, COLUMN_WIDTH_PX);
  return (
    <View
      style={[
        styles.masterRow,
        {height: heightPx, minHeight: heightPx, borderColor},
        selected && styles.masterRowSelected,
      ]}>
      <Text
        style={[styles.masterRowText, {color: textColor}, actedOn && styles.masterRowActedOn]}
        numberOfLines={itemEntryLines(current, COLUMN_WIDTH_PX)}>
        {actedOn ? '✓ ' : ''}
        {itemEntryDisplayText(current)}
      </Text>
    </View>
  );
}

/** Plain, centered empty-state guide shown in the detail column before anything is selected (requirements chat: "Leer mit Hinweistext") - one shared shape, each step supplying its own criteria-based copy (round-2 requirement d). */
export function ReviewEmptyDetail({
  title,
  text,
  hint,
  textColor,
}: {
  title: string;
  text: string;
  hint: string;
  textColor: string;
}): React.JSX.Element {
  return (
    <View style={styles.emptyDetail}>
      <Text style={[styles.emptyDetailTitle, {color: textColor}]}>{title}</Text>
      <Text style={[styles.emptyDetailText, {color: textColor}]}>{text}</Text>
      <Text style={[styles.emptyDetailHint, {color: textColor}]}>{hint}</Text>
    </View>
  );
}

