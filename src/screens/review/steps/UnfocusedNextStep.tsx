/**
 * Review step "Unfocused next items": active Projects/Areas with an open
 * #next task but no Daily, Weekly or Monthly focus, so the task shows
 * nowhere. The left list groups the tasks under their item; picking a task
 * offers Someday/Maybe/Done/Cancel/due date for it and adding its item to a
 * focus. Removing another item's focus here can make that item qualify; it
 * is added to the frozen list right away.
 */
import React, {useEffect, useState} from 'react';
import {Pressable, Text, View} from 'react-native';
import {isFocused} from '../../../domain/destination';
import {setFlowStateTag} from '../../../domain/flowState';
import {deriveTaskFields, setDueTag} from '../../../domain/markdown';
import {GtdParaSettings} from '../../../domain/settings';
import {CachedItem, findCachedItem, updateItemTasks} from '../../../storage/dataCache';
import {FocusScope, focusBlockedReason, setItemFocus} from '../../../storage/focusSlots';
import {saveTasks} from '../../../storage/projectFile';
import {nextTasksFor, ReviewItemRef, ReviewNextTaskEntry, ReviewUnfocusedNextEntry} from '../../../storage/reviewAggregate';
import {log} from '../../../utils/log';
import {requestEinkRefresh} from '../../../utils/screenRefresh';
import DateInput from '../../../ui/DateInput';
import FocusedItemRow from '../../../ui/FocusedItemRow';
import {COLUMN_WIDTH_PX} from '../../../ui/itemEntryRow';
import ReviewMasterDetail from '../../../ui/ReviewMasterDetail';
import {activeLineEstimator} from '../../../ui/textLineEstimator';
import {common} from '../../../ui/commonStyles';
import {FONT} from '../../../ui/theme';
import {useErrorStatus} from '../../../ui/status/StatusProvider';
import {errorMessage} from '../../../utils/errorMessage';
import {styles} from '../reviewStyles';
import {reviewCurrentItem, ReviewEmptyDetail, ReviewStepProps, togglePeriodFocus} from '../shared';
import {bump} from '../reviewVisit';
import {useFrozenStepList} from '../useFrozenStepList';

/** One flattened row of the Unfocused-next-items left list - see flattenUnfocusedNext below. */
type UnfocusedNextRow =
  | {kind: 'header'; key: string; entry: ReviewUnfocusedNextEntry}
  | {kind: 'note'; key: string; text: string}
  | {kind: 'entry'; key: string; entry: ReviewUnfocusedNextEntry; taskEntry: ReviewNextTaskEntry};

/**
 * Groups `list` into header+entry rows, one header per item followed by its
 * own live #next tasks (`nextTasksFor` recomputed against the current
 * cache, same "membership frozen, task list live" split every other step's
 * detail lookup uses) - same flattening convention `ProjectDataPanel.tsx`'s
 * `TodosSection`/`MeetingsSection` already use for a grouped `PagedSection`
 * (docs/dev/technical-design-review-master-detail.md §5.4). A "note" row fills
 * in for an item whose #next tasks were all resolved OR given a due date
 * during this review visit (`nextTasksFor` excludes a due-dated task the
 * same way it excludes a resolved one, see reviewAggregate.ts's own doc
 * comment - 2026-09-16, Tilman feedback) - still frozen into the step (see
 * the module doc comment's "Frozen snapshots" note) but with nothing left
 * to act on until it gets a new, not-yet-due #next task.
 */
function flattenUnfocusedNext(list: ReviewUnfocusedNextEntry[], items: CachedItem[]): UnfocusedNextRow[] {
  const rows: UnfocusedNextRow[] = [];
  for (const entry of list) {
    const current = reviewCurrentItem(entry.item, items);
    const liveNextTasks = nextTasksFor(entry.item, current.tasks);
    rows.push({kind: 'header', key: `${entry.item.path}#header`, entry});
    if (liveNextTasks.length === 0) {
      rows.push({kind: 'note', key: `${entry.item.path}#note`, text: 'Nothing left needing attention here (resolved or already scheduled).'});
    } else {
      for (const taskEntry of liveNextTasks) {
        rows.push({kind: 'entry', key: `${entry.item.path}#${taskEntry.taskIndex}`, entry, taskEntry});
      }
    }
  }
  return rows;
}

// Chrome/line-height estimates for the Unfocused-next-items left list's own
// header/note/entry rows - same "one line of FONT.small/medium text" method
// ui/itemEntryRow.ts's own constants use, sized for this step's own plain
// text rows (a project/area group label, or a task's own text) rather than
// reusing those constants directly (different font size for the header).
const UNFOCUSED_HEADER_ROW_PX = 30;
const UNFOCUSED_NOTE_ROW_PX = 28;
const UNFOCUSED_ENTRY_CHROME_PX = 12;
const UNFOCUSED_ENTRY_LINE_HEIGHT_PX = 22;

function unfocusedTaskLines(text: string, columnWidthPx: number): number {
  return Math.min(2, activeLineEstimator.estimateLines(text, Math.max(1, columnWidthPx - 12), FONT.medium));
}

function unfocusedNextRowHeight(row: UnfocusedNextRow): number {
  if (row.kind === 'header') return UNFOCUSED_HEADER_ROW_PX;
  if (row.kind === 'note') return UNFOCUSED_NOTE_ROW_PX;
  return UNFOCUSED_ENTRY_CHROME_PX + unfocusedTaskLines(row.taskEntry.task.text, COLUMN_WIDTH_PX) * UNFOCUSED_ENTRY_LINE_HEIGHT_PX;
}

/**
 * Renders one row of the Unfocused-next-items left list - header/note/entry,
 * per flattenUnfocusedNext above. `selected` only ever applies to an 'entry'
 * row (ReviewMasterDetail's own isSelectable gates header/note rows out of
 * selection). `focused` (2026-09-16, Tilman feedback) is likewise only ever
 * true for an 'entry' row - see its caller, renderUnfocusedNextItems, for
 * how it's computed (the parent item's LIVE Daily-or-Weekly focus state,
 * not a frozen flag) - and marks every task row under a project/area the
 * moment that item is focused from the detail panel, with a "✓ " prefix,
 * same convention ReviewLeftRow's own `actedOn` checkmark uses elsewhere in
 * this file.
 */
function UnfocusedNextRowView({
  row,
  selected,
  focused,
  textColor,
  borderColor,
}: {
  row: UnfocusedNextRow;
  selected: boolean;
  focused: boolean;
  textColor: string;
  borderColor: string;
}): React.JSX.Element {
  if (row.kind === 'header') {
    return (
      <View key={row.key} style={styles.masterGroupLabel}>
        <Text style={[styles.masterGroupLabelText, {color: textColor}]} numberOfLines={1}>
          {row.entry.item.name}
          {row.entry.item.kind === 'area' ? ' (Area)' : ''}
        </Text>
      </View>
    );
  }
  if (row.kind === 'note') {
    return (
      <View key={row.key} style={styles.masterNoteRow}>
        <Text style={[common.hint, {color: textColor}]}>{row.text}</Text>
      </View>
    );
  }
  const heightPx = unfocusedNextRowHeight(row);
  return (
    <View
      key={row.key}
      style={[
        styles.masterRow,
        styles.masterRowIndented,
        {height: heightPx, minHeight: heightPx, borderColor},
        selected && styles.masterRowSelected,
      ]}>
      <Text
        style={[styles.masterRowText, {color: textColor}, focused && styles.masterRowActedOn]}
        numberOfLines={unfocusedTaskLines(row.taskEntry.task.text, COLUMN_WIDTH_PX)}>
        {focused ? '✓ ' : ''}
        {row.taskEntry.task.text}
      </Text>
    </View>
  );
}

/**
 * Unfocused-next-items detail panel, for the selected task - task text as
 * heading (tap to open its parent item), the parent project/area name as a
 * caption, Someday/Maybe/Done/Cancel/Set-due-date pills for the task
 * (Set-due-date is new, 2026-09-16, Tilman feedback - see onSetDueDate),
 * "+ Add to Daily/Weekly/Monthly focus" pills for the parent item (Monthly
 * added 2026-09-28; grayed out the
 * moment that item is already focused in that scope - also 2026-09-16
 * feedback, live via `isFocused`/`reviewCurrentItem` rather than a frozen
 * flag, so a removal below un-grays it immediately), and a
 * live "Current focus" section restricted to the selected task's OWN kind
 * (2026-09-16 feedback: an Area task's Current-focus only lists focused
 * Areas, a Project task's only lists focused Projects - showing the other
 * kind here was never actionable from an Area/Project task's own detail
 * panel, just noise) so a full Daily/Weekly slot can be freed without
 * leaving Review.
 */
function UnfocusedNextTaskDetail({
  entry,
  taskEntry,
  items,
  settings,
  onOpenItem,
  onTaskAction,
  onSetDueDate,
  onAddToDailyFocus,
  onAddToWeeklyFocus,
  onAddToMonthlyFocus,
  onRemoveFocus,
  textColor,
  borderColor,
  placeholderColor,
}: {
  entry: ReviewUnfocusedNextEntry;
  taskEntry: ReviewNextTaskEntry;
  items: CachedItem[];
  settings: GtdParaSettings | null;
  onOpenItem: (item: ReviewItemRef) => void;
  onTaskAction: (entry: ReviewNextTaskEntry, action: 'someday' | 'maybe' | 'done' | 'cancel') => Promise<void>;
  onSetDueDate: (entry: ReviewNextTaskEntry, dueDate: string | null) => Promise<void>;
  onAddToDailyFocus: (item: ReviewItemRef) => Promise<void>;
  onAddToWeeklyFocus: (item: ReviewItemRef) => Promise<void>;
  onAddToMonthlyFocus: (item: ReviewItemRef) => Promise<void>;
  onRemoveFocus: (item: CachedItem, scope: FocusScope) => Promise<void>;
  textColor: string;
  borderColor: string;
  placeholderColor: string;
}): React.JSX.Element {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useErrorStatus('ReviewScreen.error', error, () => setError(null));
  const [dueDateOpen, setDueDateOpen] = useState(false);
  const [dueDateDraft, setDueDateDraft] = useState('');

  // Collapses the due-date input back down whenever the selected task
  // changes, so switching tasks never leaves a stale draft open on the
  // wrong one (this component isn't remounted per selection - ReviewMasterDetail
  // just re-renders it with new props).
  useEffect(() => {
    setDueDateOpen(false);
    setDueDateDraft('');
  }, [entry.item.path, taskEntry.taskIndex]);

  const runAction = (fn: () => Promise<void>) => {
    setError(null);
    setPending(true);
    fn()
      .catch(e => setError(errorMessage(e)))
      .finally(() => setPending(false));
  };

  const TASK_ACTIONS = ['someday', 'maybe', 'done', 'cancel'] as const;
  const taskActionLabel = (action: (typeof TASK_ACTIONS)[number]): string =>
    action === 'someday' ? 'Someday' : action === 'maybe' ? 'Maybe' : action === 'done' ? 'Done' : 'Cancel';

  const currentParent = reviewCurrentItem(entry.item, items);
  const dailyFocused = items.filter(i => i.dailyFocus && i.kind === entry.item.kind);
  const weeklyFocused = items.filter(i => i.weeklyFocus && i.kind === entry.item.kind);
  const monthlyFocused = items.filter(i => i.monthlyFocus && i.kind === entry.item.kind);
  const focusRowLabel = (item: CachedItem) => `${item.name}${item.kind === 'area' ? ' (Area)' : ''}`;
  const kindLabel = entry.item.kind === 'area' ? 'areas' : 'projects';
  const dailyLimit = entry.item.kind === 'area' ? settings?.dailyFocusAreaCount : settings?.dailyFocusProjectCount;
  const weeklyLimit = entry.item.kind === 'area' ? settings?.weeklyFocusAreaCount : settings?.weeklyFocusProjectCount;
  const monthlyLimit = entry.item.kind === 'area' ? settings?.monthlyFocusAreaCount : settings?.monthlyFocusProjectCount;

  const submitDueDate = () => {
    const trimmed = dueDateDraft.trim();
    if (!trimmed) return;
    runAction(() => onSetDueDate(taskEntry, trimmed));
  };

  return (
    <View>
      <Pressable onPress={() => onOpenItem(entry.item)}>
        <Text style={[styles.cardTitle, {color: textColor}]}>{taskEntry.task.text}</Text>
      </Pressable>
      <Text style={[styles.detailCaption, {color: textColor}]}>
        {entry.item.name}
        {entry.item.kind === 'area' ? ' (Area)' : ''}
      </Text>
      <View style={styles.pillRow}>
        {TASK_ACTIONS.map(action => (
          <Pressable
            key={action}
            style={[styles.pill, {borderColor}]}
            disabled={pending}
            onPress={() => runAction(() => onTaskAction(taskEntry, action))}
            hitSlop={8}>
            <Text style={[styles.pillText, {color: textColor}]}>{taskActionLabel(action)}</Text>
          </Pressable>
        ))}
        {!dueDateOpen && (
          <Pressable style={[styles.pill, {borderColor}]} disabled={pending} onPress={() => setDueDateOpen(true)} hitSlop={8}>
            <Text style={[styles.pillText, {color: textColor}]}>📅 Set due date</Text>
          </Pressable>
        )}
      </View>
      {dueDateOpen && (
        <View style={styles.pillRow}>
          {/* Shared date field with the -1/Today/+1/+7 strip (ui/DateInput.tsx). */}
          <DateInput
            value={dueDateDraft}
            onChangeText={setDueDateDraft}
            onSubmitEditing={submitDueDate}
            placeholder="YYYY-MM-DD"
            placeholderColor={placeholderColor}
            textColor={textColor}
            borderColor={borderColor}
            width={120}
            containerStyle={styles.dueDateWrap}
            inputStyle={styles.dueDateInput}
          />
          <Pressable style={[styles.pill, {borderColor}]} disabled={pending || !dueDateDraft.trim()} onPress={submitDueDate} hitSlop={8}>
            <Text style={[styles.pillText, {color: textColor}]}>Save</Text>
          </Pressable>
          <Pressable
            style={[styles.pill, {borderColor}]}
            disabled={pending}
            onPress={() => {
              setDueDateOpen(false);
              setDueDateDraft('');
            }}
            hitSlop={8}>
            <Text style={[styles.pillText, {color: textColor}]}>✕</Text>
          </Pressable>
        </View>
      )}
      <View style={styles.pillRow}>
        <Pressable
          style={[styles.pill, {borderColor}, currentParent.dailyFocus && styles.pillDisabled]}
          disabled={pending || currentParent.dailyFocus}
          onPress={() => runAction(() => onAddToDailyFocus(entry.item))}
          hitSlop={8}>
          <Text style={[styles.pillText, {color: textColor}]}>
            {currentParent.dailyFocus ? '✓ ' : '+ Add '}
            {entry.item.name} to Daily focus
          </Text>
        </Pressable>
        <Pressable
          style={[styles.pill, {borderColor}, currentParent.weeklyFocus && styles.pillDisabled]}
          disabled={pending || currentParent.weeklyFocus}
          onPress={() => runAction(() => onAddToWeeklyFocus(entry.item))}
          hitSlop={8}>
          <Text style={[styles.pillText, {color: textColor}]}>
            {currentParent.weeklyFocus ? '✓ ' : '+ Add '}
            {entry.item.name} to Weekly focus
          </Text>
        </Pressable>
        <Pressable
          style={[styles.pill, {borderColor}, currentParent.monthlyFocus && styles.pillDisabled]}
          disabled={pending || currentParent.monthlyFocus}
          onPress={() => runAction(() => onAddToMonthlyFocus(entry.item))}
          hitSlop={8}>
          <Text style={[styles.pillText, {color: textColor}]}>
            {currentParent.monthlyFocus ? '✓ ' : '+ Add '}
            {entry.item.name} to Monthly focus
          </Text>
        </Pressable>
      </View>
      <View style={[common.divider, {backgroundColor: borderColor}]} />
      <Text style={[styles.sectionLabel, {color: textColor}]}>
        Current focus <Text style={styles.sectionLabelHint}>(manage without leaving Review)</Text>
      </Text>
      <Text style={[styles.focusSubheading, {color: textColor}]}>
        Daily — {dailyFocused.length} of {dailyLimit ?? 0} {kindLabel}
      </Text>
      {dailyFocused.map(item => (
        <FocusedItemRow
          key={`daily-${item.path}`}
          label={focusRowLabel(item)}
          onPress={() => onOpenItem({kind: item.kind, name: item.name, path: item.path})}
          onRemove={() => runAction(() => onRemoveFocus(item, 'daily'))}
          disabled={pending}
          textColor={textColor}
          borderColor={borderColor}
        />
      ))}
      <Text style={[styles.focusSubheading, {color: textColor}]}>
        Weekly — {weeklyFocused.length} of {weeklyLimit ?? 0} {kindLabel}
      </Text>
      {weeklyFocused.map(item => (
        <FocusedItemRow
          key={`weekly-${item.path}`}
          label={focusRowLabel(item)}
          onPress={() => onOpenItem({kind: item.kind, name: item.name, path: item.path})}
          onRemove={() => runAction(() => onRemoveFocus(item, 'weekly'))}
          disabled={pending}
          textColor={textColor}
          borderColor={borderColor}
        />
      ))}
      <Text style={[styles.focusSubheading, {color: textColor}]}>
        Monthly — {monthlyFocused.length} of {monthlyLimit ?? 0} {kindLabel}
      </Text>
      {monthlyFocused.map(item => (
        <FocusedItemRow
          key={`monthly-${item.path}`}
          label={focusRowLabel(item)}
          onPress={() => onOpenItem({kind: item.kind, name: item.name, path: item.path})}
          onRemove={() => runAction(() => onRemoveFocus(item, 'monthly'))}
          disabled={pending}
          textColor={textColor}
          borderColor={borderColor}
        />
      ))}
    </View>
  );
}
export default function UnfocusedNextStep({
  data,
  stepEntryToken,
  onOpenItem,
  textColor,
  borderColor,
  placeholderColor,
}: ReviewStepProps): React.JSX.Element {
  const {items, settings, aggregate, refreshFromCache} = data;
  const frozen = useFrozenStepList(aggregate?.unfocusedNextItems, stepEntryToken);

  /**
   * One #next task's Someday/Maybe/Done/Cancel action from the Unfocused-next-
   * items step - same findCachedItem/saveTasks/updateItemTasks write-through
   * as every other task mutation on this screen. Someday/Maybe reuse
   * setFlowStateTag (same as handlePromoteToNext, opposite direction); Done/
   * Cancel set the task's own boolean flag directly, same soft-delete
   * convention as everywhere else (nothing is ever removed from the file).
   */
  const handleUnfocusedNextTaskAction = async (
    entry: ReviewNextTaskEntry,
    action: 'someday' | 'maybe' | 'done' | 'cancel',
  ): Promise<void> => {
    const cachedItem = findCachedItem(entry.item.path);
    const current = cachedItem?.tasks[entry.taskIndex];
    if (!cachedItem || !current) {
      throw new Error(`"${entry.task.text}" changed on disk - Settings → Advanced → Reload all files.`);
    }
    const nextTasks = cachedItem.tasks.slice();
    if (action === 'done') {
      nextTasks[entry.taskIndex] = {...current, done: true};
    } else if (action === 'cancel') {
      nextTasks[entry.taskIndex] = {...current, cancelled: true};
    } else {
      const nextText = setFlowStateTag(current.text, action);
      nextTasks[entry.taskIndex] = {...current, text: nextText, ...deriveTaskFields(nextText)};
    }
    const nextRaw = await saveTasks(entry.item.kind, entry.item.path, cachedItem.rawContent, nextTasks, cachedItem.taskExtraLines);
    updateItemTasks(entry.item.path, nextRaw, nextTasks, cachedItem.taskExtraLines);
    log('ReviewScreen: unfocused-next task action', action, entry.item.path, entry.taskIndex);
    refreshFromCache();
    requestEinkRefresh();
  };

  /**
   * "+ Set due date" on an Unfocused-next-items task (2026-09-16, Tilman
   * feedback) - a task with no other way back onto Daily's radar can be
   * given one right here instead of leaving it stuck; `setDueTag` (same
   * helper ui/QuickAddWidget.tsx's own due-date field uses) writes/clears
   * the `#due:` tag, same findCachedItem/saveTasks/updateItemTasks write-
   * through as every other task mutation on this screen. `dueDate: null`
   * clears it (the UI's own "✕" clear affordance). Once saved,
   * reviewAggregate.ts's `nextTasksFor` excludes any task with a due date,
   * so this task drops out of the currently-viewed item's live task list on
   * the very next render - the same "note" fallback flattenUnfocusedNext
   * already shows when every #next task on an item gets resolved covers
   * this case too (a due date isn't a resolution, but it's the same "this
   * item has nothing left needing this step's attention right now" state).
   */
  const handleSetTaskDueDate = async (entry: ReviewNextTaskEntry, dueDate: string | null): Promise<void> => {
    const cachedItem = findCachedItem(entry.item.path);
    const current = cachedItem?.tasks[entry.taskIndex];
    if (!cachedItem || !current) {
      throw new Error(`"${entry.task.text}" changed on disk - Settings → Advanced → Reload all files.`);
    }
    const nextText = setDueTag(current.text, dueDate);
    const nextTasks = cachedItem.tasks.slice();
    nextTasks[entry.taskIndex] = {...current, text: nextText, ...deriveTaskFields(nextText)};
    const nextRaw = await saveTasks(entry.item.kind, entry.item.path, cachedItem.rawContent, nextTasks, cachedItem.taskExtraLines);
    updateItemTasks(entry.item.path, nextRaw, nextTasks, cachedItem.taskExtraLines);
    log('ReviewScreen: unfocused-next task due date set', dueDate, entry.item.path, entry.taskIndex);
    refreshFromCache();
    requestEinkRefresh();
  };

  /**
   * "Add to Daily focus" on an Unfocused-next-items card - same
   * focusBlockedReason-then-setItemFocus pattern handleToggleItemWeeklyFocus
   * uses above, just scope: 'daily' and always turning the flag on (this
   * button only ever adds - the Current-focus panel's own ✕, wired to
   * handleRemoveItemFocus below, is where a slot gets freed instead).
   * Explicit resolution, so - like handleStalledArchive et al. above - it
   * also marks the card acted-on (checkmarked, stays visible - see
   * doneSnapshot's own doc comment) rather than dropping it from the frozen
   * snapshot.
   */
  const handleAddToDailyFocus = async (itemRef: ReviewItemRef): Promise<void> => {
    const cachedItem = findCachedItem(itemRef.path);
    if (!cachedItem) throw new Error(`"${itemRef.name}" changed on disk - Settings → Advanced → Reload all files.`);
    if (!settings) throw new Error('Settings not loaded yet - Settings → Advanced → Reload all files.');
    const reason = focusBlockedReason(items, cachedItem.kind, 'daily', settings);
    if (reason) throw new Error(reason);
    await setItemFocus(
      cachedItem,
      'daily',
      true,
    );
    log('ReviewScreen: added to daily focus', itemRef.path);
    refreshFromCache();
    bump('dailyFocusAdded');
    frozen.markActed(itemRef.path);
    requestEinkRefresh();
  };

  /**
   * "Add to Weekly focus" on an Unfocused-next-items card (2026-09-16,
   * round-2 requirement c) - reuses handleToggleItemWeeklyFocus (the Focus
   * Reset step's own toggle handler) rather than duplicating its
   * focusBlockedReason-then-setItemFocus shape a second time; that handler
   * already does the settings-loaded/blocked-reason check, the actual
   * setItemFocus call, refreshFromCache, and the 'weeklyFocusAdded' bump
   * when `value` is true - this just resolves the frozen `itemRef` to a live
   * `CachedItem` first (findCachedItem, same guard every other action on
   * this screen uses) and marks the card acted-on afterward, same as
   * handleAddToDailyFocus above.
   */
  const handleAddToWeeklyFocus = async (itemRef: ReviewItemRef): Promise<void> => {
    const cachedItem = findCachedItem(itemRef.path);
    if (!cachedItem) throw new Error(`"${itemRef.name}" changed on disk - Settings → Advanced → Reload all files.`);
    await togglePeriodFocus(data, cachedItem, 'weekly', true);
    frozen.markActed(itemRef.path);
  };

  /** "+ Add to Monthly focus" (2026-09-28, docs/dev/technical-design-review-monthly-focus.md §2) - same shape as handleAddToWeeklyFocus above. */
  const handleAddToMonthlyFocus = async (itemRef: ReviewItemRef): Promise<void> => {
    const cachedItem = findCachedItem(itemRef.path);
    if (!cachedItem) throw new Error(`"${itemRef.name}" changed on disk - Settings → Advanced → Reload all files.`);
    await togglePeriodFocus(data, cachedItem, 'monthly', true);
    frozen.markActed(itemRef.path);
  };

  /**
   * Removes a Daily or Weekly focus slot from the Unfocused-next-items
   * step's own "Current focus" panel (round-2 requirement c) - shared by
   * both scopes since turning a focus flag *off* is never blocked
   * (focusBlockedReason only ever gates turning one *on* - see
   * handleToggleFocus/toggleFocus's own comments in ui/ItemFocusPanel.tsx),
   * so this needs no settings/blocked-reason check at all, just the same
   * setItemFocus + refreshFromCache write-through every other focus change
   * on this screen uses. Doesn't touch any step's acted-on set - removing a
   * *different* item's focus slot from this panel isn't an action on the
   * currently-selected item itself.
   *
   * Removal gets one more step (2026-09-16, Tilman feedback - widened same
   * day once the "unfocused" criterion itself was widened): reviewAggregate.
   * ts's `unfocusedNextItems` criterion is `!isFocused(item)` (neither daily
   * NOR weekly focus - storage/dailyAggregate.ts now requires either one for
   * a #next task to show on Daily view, see that file's own doc comment), so
   * removing EITHER scope can make `item` newly qualify as an unfocused-next
   * item in its own right, the moment the OTHER scope's flag is also unset -
   * a project/area you're freeing a focus slot from, right here, might
   * itself now have #next work nobody will see anywhere. Originally this
   * only ran for Daily-scope removal (back when the criterion was
   * `!dailyFocus` alone, so only a Daily removal could ever flip it); now it
   * checks whichever flag DIDN'T just change (`item`'s pre-removal value,
   * since only `scope`'s own flag is being cleared) and runs for both
   * scopes. Normally a step's left list is frozen at step-entry (this
   * file's "Frozen snapshots" convention) and wouldn't pick this up until
   * Unfocused-next-items is re-entered, but Tilman asked for it to appear
   * immediately instead - so this appends a fresh entry straight into
   * `unfocusedNextSnapshot` (only while that snapshot is already live, i.e.
   * we're on this step; harmless no-op otherwise, since re-entering the
   * step re-freezes from the aggregate anyway) rather than waiting for the
   * next freeze.
   */
  const handleRemoveItemFocus = async (item: CachedItem, scope: FocusScope): Promise<void> => {
    await setItemFocus(
      item,
      scope,
      false,
    );
    log('ReviewScreen: removed focus', item.path, scope);
    refreshFromCache();
    // Any OTHER focus level still set? (monthly joined 2026-09-28 -
    // `item` holds the pre-removal flags, so clear just `scope`'s own.)
    const otherScopeStillFocused = isFocused({
      dailyFocus: scope === 'daily' ? false : item.dailyFocus,
      weeklyFocus: scope === 'weekly' ? false : item.weeklyFocus,
      monthlyFocus: scope === 'monthly' ? false : item.monthlyFocus,
    });
    if (item.status === 'active' && !otherScopeStillFocused) {
      const itemRef: ReviewItemRef = {kind: item.kind, name: item.name, path: item.path};
      const nextTasks = nextTasksFor(itemRef, item.tasks);
      if (nextTasks.length > 0) {
        frozen.append({item: itemRef, nextTasks}, e => e.item.path);
      }
    }
    requestEinkRefresh();
  };

  const unfocusedNextRows = flattenUnfocusedNext(frozen.list, items);

  const renderUnfocusedNextDetail = (selectedKey: string | null): React.ReactNode => {
    if (!selectedKey) {
      return (
        <ReviewEmptyDetail
          title="No task selected"
          text="These active projects and areas have an open #next task but aren't in Daily, Weekly or Monthly focus, so it doesn't show on your Daily view. Add the item to a focus, or resolve the task directly."
          hint="Tap a task on the left to get started."
          textColor={textColor}
        />
      );
    }
    const row = unfocusedNextRows.find(r => r.kind === 'entry' && r.key === selectedKey);
    if (!row || row.kind !== 'entry') return null;
    return (
      <UnfocusedNextTaskDetail
        entry={row.entry}
        taskEntry={row.taskEntry}
        items={items}
        settings={settings}
        onOpenItem={onOpenItem}
        onTaskAction={handleUnfocusedNextTaskAction}
        onSetDueDate={handleSetTaskDueDate}
        onAddToDailyFocus={handleAddToDailyFocus}
        onAddToWeeklyFocus={handleAddToWeeklyFocus}
        onAddToMonthlyFocus={handleAddToMonthlyFocus}
        onRemoveFocus={handleRemoveItemFocus}
        textColor={textColor}
        borderColor={borderColor}
        placeholderColor={placeholderColor}
      />
    );
  };

  return (
    <ReviewMasterDetail<UnfocusedNextRow>
      header="Unfocused next items"
      rows={unfocusedNextRows}
      rowHeight={row => unfocusedNextRowHeight(row)}
      isSelectable={row => row.kind === 'entry'}
      rowKey={row => row.key}
      isCountableRow={row => row.kind === 'entry'}
      renderRow={(row, selected) => (
        <UnfocusedNextRowView
          row={row}
          selected={selected}
          focused={row.kind === 'entry' && isFocused(reviewCurrentItem(row.entry.item, items))}
          textColor={textColor}
          borderColor={borderColor}
        />
      )}
      renderDetail={renderUnfocusedNextDetail}
      actedOnKeys={frozen.actedOn}
      resetKey={stepEntryToken}
      emptyHint="Nothing here - every #next item is either due soon or already in Daily focus."
      textColor={textColor}
      borderColor={borderColor}
    />
  );

}
