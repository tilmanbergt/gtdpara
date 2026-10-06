/**
 * Cross-project aggregation for the Daily view (design-overview.md §5.2).
 *
 * A pure, synchronous transform over whatever storage/dataCache.ts already
 * has loaded in memory - no filesystem I/O here, so this stays fast however
 * many Projects/Areas exist. Keeping the cache warm is dataCache.ts's job.
 *
 * Scope (docs/dev/technical-design-daily-todo-filter.md): an open (not done,
 * not cancelled) task shows here if its due date is today, tomorrow, or
 * earlier (`dueDate <= tomorrowDate` covers all three), OR it's tagged #next
 * AND it belongs to a Project/Area currently in daily, weekly or monthly
 * focus (`domain/destination.ts`'s `isFocused`). Focus alone does not
 * qualify a task - only its #next task(s) - so a busy focused project can't
 * flood Daily. Weekly and monthly focus count because nothing else shows a
 * weekly/monthly-focused item's #next tasks: the Week view's focus cards
 * only show a count (docs/dev/technical-design-review-monthly-focus.md §1).
 * A task tagged Someday or Maybe (technical-design-tags.md §3) is excluded
 * outright. A Waiting For task has its own rule
 * (docs/dev/technical-design-waiting-for-0.7.md W1): it shows when it has no
 * date or its date is today or earlier - from any Project, Area or the
 * Inbox, focused or not - and stays hidden while its date is still in the
 * future (domain/flowState.ts's isWaitingForShownOnDaily). Meetings: today
 * or tomorrow, not cancelled, soonest first.
 *
 * A #next task that falls out of Daily under this rule is not lost:
 * storage/reviewAggregate.ts's `unfocusedNextItems` bucket surfaces these
 * items on a dedicated Weekly Review step, with focus and per-task actions.
 *
 * Inbox (docs/dev/technical-design-inbox-tab.md §3): Inbox.txt's own
 * tasks/meetings are folded into this same aggregate - a synthetic
 * `DailyItemRef` (INBOX_ITEM below) stands in for "the Project/Area this came
 * from", so Inbox entries flow through the same grouping/labeling code
 * (groupDailyTasksByItem, the Calendar column's source subtext). Inbox can
 * never be focused, so an Inbox #next task always shows (otherwise it would
 * be invisible on Daily until triaged - a deliberate choice); its due-date
 * leg is the same `<= tomorrowDate`. Inbox meetings use the same
 * today/tomorrow rule.
 *
 * Context tags (technical-design-context-tags.md §6): the optional
 * `contextTag` param below is a *hard* filter - when set, every rule above is
 * replaced for that call: only tasks/meetings whose `tags` include it show.
 * Among those matches, every open task qualifies whatever its flow state or
 * date (Waiting For with a future date and Someday included) - only Maybe
 * never qualifies. Meetings keep their today/tomorrow/not-cancelled checks,
 * ANDed with the tag match.
 *
 * Project/Area-aware (docs/dev/technical-design-project-area-abbreviations.md):
 * before filtering, `contextTag` is resolved against `items`' own abbrevs
 * (domain/abbrev.ts's resolveAbbrevPath, case-insensitive). When it
 * resolves, the tag-match condition becomes a union - a task/meeting counts
 * if it carries the literal tag OR belongs to that resolved item, so every
 * task and meeting of a Project/Area shows under its `#AT` filter even when
 * not tagged `#AT` itself. When `contextTag` matches no abbrev, the tag-only
 * behavior above applies. Never reaches the synthetic Inbox item - Inbox has
 * no abbrev, so `contextItemPath` can never equal `inboxPath`.
 */
import {entriesInRange, entryDate, MeetingSpanDay} from '../domain/meetingSpan';
import {resolveAbbrevPath} from '../domain/abbrev';
import {isFocused} from '../domain/destination';
import {isWaitingForShownOnDaily} from '../domain/flowState';
import {isoDateOffset, meetingTimestampMs, todayIso} from '../domain/meetingTime';
import {GtdParaKind, Meeting, Task} from '../domain/types';
import {CachedItem} from './dataCache';
import {perfTime} from '../utils/perf';

export interface DailyItemRef {
  kind: GtdParaKind;
  name: string;
  path: string;
  /** Carried through from CachedItem so groupDailyTasksByItem below can sort focused items first without a second cache lookup - always derivable purely from CachedItem, same "cache always reproducible" rule as everything else here (design-overview.md §3). Always false for the synthetic Inbox item below - Inbox can't be daily/weekly-focused. */
  dailyFocus: boolean;
  weeklyFocus: boolean;
  monthlyFocus: boolean;
  /** This item's short abbreviation (docs/dev/technical-design-project-area-abbreviations.md), carried through the same way `dailyFocus`/`weeklyFocus` are - what the Calendar column's trailing badge (ui/MeetingRow.tsx) displays instead of the full name. Always null for the synthetic Inbox item below - Inbox isn't a Project/Area and has no abbrev of its own. */
  abbrev: string | null;
}

/** The synthetic "source item" Inbox tasks/meetings carry - see the module doc comment's "Inbox" note. `path` is `inboxPath` itself, the same address storage/projectFile.ts's loadProjectFile('inbox', inboxPath) uses. Exported for docs/dev/technical-design-now-focus-mode.md's buildNowEntries below, which needs the same synthetic ref. */
export function inboxItemRef(inboxPath: string): DailyItemRef {
  return {kind: 'inbox', name: 'Inbox', path: inboxPath, dailyFocus: false, weeklyFocus: false, monthlyFocus: false, abbrev: null};
}

export interface DailyTaskEntry {
  item: DailyItemRef;
  /** Index into that item's *full* tasks array (CachedItem.tasks) - needed to write a toggle back with saveTasks + updateItemTasks. */
  taskIndex: number;
  task: Task;
}

export interface DailyMeetingEntry {
  item: DailyItemRef;
  meetingIndex: number;
  meeting: Meeting;
  /** Set only for a multi-day meeting - which covered day (today or tomorrow) this entry stands for; see storage/weeklyAggregate.ts's entriesInRange. */
  span?: MeetingSpanDay;
}

export interface DailyAggregate {
  /** Open tasks matching the focus rule (see the module doc comment), in no particular order. */
  tasks: DailyTaskEntry[];
  /** Meetings dated today or tomorrow, not cancelled, soonest first. */
  meetings: DailyMeetingEntry[];
  /** Items whose data file failed to load on the last cache build - reported, not silently dropped from the rest of the aggregate. */
  failedItems: Array<{item: DailyItemRef; error: string}>;
}

/** Just the two arrays buildDailyAggregate needs from Inbox.txt - storage/projectFile.ts's ProjectFileState carries more than this, callers pass just these two fields. `null` when Inbox hasn't loaded yet (same "not loaded yet" gap DailyView's own handlers already guard against elsewhere). */
export interface DailyInboxInput {
  tasks: Task[];
  meetings: Meeting[];
}

/** Pure in-memory aggregation over already-cached items plus Inbox.txt's own tasks/meetings - see the module doc comment. `inboxPath` addresses the synthetic Inbox item (inboxItemRef above); ignored when `inbox` is null. */
function buildDailyAggregateImpl(
  items: CachedItem[],
  inbox: DailyInboxInput | null,
  inboxPath: string,
  now: Date = new Date(),
  contextTag: string | null = null,
): DailyAggregate {
  const todayDate = todayIso(now);
  const tomorrowDate = isoDateOffset(1, now);
  // See the module doc comment's "Project/Area-aware" note.
  const contextItemPath = contextTag ? resolveAbbrevPath(contextTag, items) : null;

  const tasks: DailyTaskEntry[] = [];
  const meetings: DailyMeetingEntry[] = [];
  const failedItems: DailyAggregate['failedItems'] = [];

  for (const cachedItem of items) {
    const item: DailyItemRef = {
      kind: cachedItem.kind,
      name: cachedItem.name,
      path: cachedItem.path,
      dailyFocus: cachedItem.dailyFocus,
      weeklyFocus: cachedItem.weeklyFocus,
      monthlyFocus: cachedItem.monthlyFocus,
      abbrev: cachedItem.abbrev,
    };

    if (cachedItem.loadError) {
      failedItems.push({item, error: cachedItem.loadError});
      continue;
    }

    const inContextItem = contextItemPath !== null && cachedItem.path === contextItemPath;

    cachedItem.tasks.forEach((task, taskIndex) => {
      if (task.done || task.cancelled) return;
      if (contextTag) {
        // Hard filter, replacing the normal rule below entirely - see the
        // module doc comment's "Context tags" note. Widened to a union with
        // `inContextItem` when the tag resolved to a Project/Area (the
        // "Project/Area-aware" note) - Maybe still never qualifies, tag/
        // item match or not; Waiting For/Someday become eligible here,
        // unlike the normal rule just below.
        if ((!task.tags.includes(contextTag) && !inContextItem) || task.flowState === 'maybe') return;
        tasks.push({item, taskIndex, task});
        return;
      }
      // Someday / Maybe never show on Daily; Waiting For has its own rule
      // (no date or date reached, any item) - see the module doc comment.
      // Both checks win over the inclusion rule below.
      if (task.flowState === 'someday' || task.flowState === 'maybe') return;
      if (task.flowState === 'waiting-for') {
        if (isWaitingForShownOnDaily(task, todayDate)) tasks.push({item, taskIndex, task});
        return;
      }
      const isDueSoonOrOverdue = task.dueDate !== null && task.dueDate <= tomorrowDate;
      const isFocusedNext = task.flowState === 'next' && isFocused(cachedItem);
      if (isDueSoonOrOverdue || isFocusedNext) {
        tasks.push({item, taskIndex, task});
      }
    });
    cachedItem.meetings.forEach((meeting, meetingIndex) => {
      if (contextTag && !meeting.tags.includes(contextTag) && !inContextItem) return;
      // Multi-day meetings show on every covered day (one entry per day).
      if (!meeting.cancelled) meetings.push(...entriesInRange({item, meetingIndex, meeting}, todayDate, tomorrowDate));
    });
  }

  if (inbox) {
    const item = inboxItemRef(inboxPath);
    inbox.tasks.forEach((task, taskIndex) => {
      if (task.done || task.cancelled) return;
      if (contextTag) {
        if (!task.tags.includes(contextTag) || task.flowState === 'maybe') return;
        tasks.push({item, taskIndex, task});
        return;
      }
      if (task.flowState === 'someday' || task.flowState === 'maybe') return;
      if (task.flowState === 'waiting-for') {
        if (isWaitingForShownOnDaily(task, todayDate)) tasks.push({item, taskIndex, task});
        return;
      }
      // #next stays unconditional here (no focus leg to combine it with - see
      // the module doc comment's "Inbox" note); same due-date leg as the main
      // loop above.
      const isNext = task.flowState === 'next';
      const isDueSoonOrOverdue = task.dueDate !== null && task.dueDate <= tomorrowDate;
      if (isNext || isDueSoonOrOverdue) {
        tasks.push({item, taskIndex, task});
      }
    });
    inbox.meetings.forEach((meeting, meetingIndex) => {
      if (contextTag && !meeting.tags.includes(contextTag)) return;
      // Multi-day meetings show on every covered day (one entry per day).
      if (!meeting.cancelled) meetings.push(...entriesInRange({item, meetingIndex, meeting}, todayDate, tomorrowDate));
    });
  }

  meetings.sort((a, b) => meetingTimestampMs(a.meeting, now) - meetingTimestampMs(b.meeting, now));

  return {tasks, meetings, failedItems};
}

/** The day a Daily meeting entry is listed under - its covered day for a multi-day meeting, else its date. */
export function dailyEntryDate(entry: DailyMeetingEntry): string {
  return entryDate(entry);
}

/**
 * Every task currently carrying #now, across every item plus Inbox -
 * docs/dev/technical-design-now-focus-mode.md §6's state A ("Working the set").
 * Deliberately NOT built on top of buildDailyAggregate's own `tasks` array:
 * that one excludes done tasks outright (the normal Daily-view rule), but
 * focus mode needs a #now task to keep showing, checked, right up until the
 * whole cohort clears together (§5/§6) - so this scans the full tasks array
 * instead and keeps done ones. Cancelled tasks are still excluded (the
 * model's universal soft-delete rule, unconditional everywhere else). No
 * due-date or daily-focus-membership filtering at all - #now is its own
 * complete filter, independent of every other Daily inclusion rule.
 */
function buildNowEntriesImpl(
  items: CachedItem[],
  inbox: DailyInboxInput | null,
  inboxPath: string,
): DailyTaskEntry[] {
  const entries: DailyTaskEntry[] = [];
  for (const cachedItem of items) {
    if (cachedItem.loadError) continue;
    const item: DailyItemRef = {
      kind: cachedItem.kind,
      name: cachedItem.name,
      path: cachedItem.path,
      dailyFocus: cachedItem.dailyFocus,
      weeklyFocus: cachedItem.weeklyFocus,
      monthlyFocus: cachedItem.monthlyFocus,
      abbrev: cachedItem.abbrev,
    };
    cachedItem.tasks.forEach((task, taskIndex) => {
      if (task.cancelled || !task.now) return;
      entries.push({item, taskIndex, task});
    });
  }
  if (inbox) {
    const item = inboxItemRef(inboxPath);
    inbox.tasks.forEach((task, taskIndex) => {
      if (task.cancelled || !task.now) return;
      entries.push({item, taskIndex, task});
    });
  }
  return entries;
}

/**
 * Focus mode's Picker state (docs/dev/technical-design-now-focus-mode.md §6,
 * state C) - every not-done, not-cancelled Next task belonging to a
 * currently daily-, weekly- or monthly-focused Project/Area
 * (`domain/destination.ts`'s `isFocused`), the same "focused" test as the
 * #next leg above and reviewAggregate.ts's `unfocusedNextItems`, so all
 * three agree. No new query - just a different filter over the same
 * already-cached `items`. Inbox is excluded - it can never be focused.
 */
function buildFocusCandidateEntriesImpl(items: CachedItem[]): DailyTaskEntry[] {
  const entries: DailyTaskEntry[] = [];
  for (const cachedItem of items) {
    if (cachedItem.loadError || !isFocused(cachedItem)) continue;
    const item: DailyItemRef = {
      kind: cachedItem.kind,
      name: cachedItem.name,
      path: cachedItem.path,
      dailyFocus: cachedItem.dailyFocus,
      weeklyFocus: cachedItem.weeklyFocus,
      monthlyFocus: cachedItem.monthlyFocus,
      abbrev: cachedItem.abbrev,
    };
    cachedItem.tasks.forEach((task, taskIndex) => {
      if (task.done || task.cancelled || task.flowState !== 'next') return;
      entries.push({item, taskIndex, task});
    });
  }
  return entries;
}

export interface DailyTaskGroup {
  item: DailyItemRef;
  entries: DailyTaskEntry[];
}

/**
 * Groups an already-built DailyAggregate's tasks by source Project/Area
 * (technical-design-daily-compact-ui.md §3). Group order: the Inbox group
 * (docs/dev/technical-design-inbox-tab.md §3) always sorts first when
 * present - not-yet-triaged items get visual priority over even a focused
 * Project/Area. After that: daily/weekly-focused items first
 * (domain/destination.ts's isFocused), then arrival order
 * (Array.prototype.sort is stable). Within a group, task order is the order
 * buildDailyAggregate produced (file order), except that Waiting For todos
 * move to the end of their group.
 */
function groupDailyTasksByItemImpl(entries: DailyTaskEntry[]): DailyTaskGroup[] {
  const byPath = new Map<string, DailyTaskGroup>();
  for (const entry of entries) {
    let group = byPath.get(entry.item.path);
    if (!group) {
      group = {item: entry.item, entries: []};
      byPath.set(entry.item.path, group);
    }
    group.entries.push(entry);
  }
  // Waiting For todos go last inside their group (docs/dev/technical-design-
  // waiting-for-0.7.md W2) - stable sort, so everything else keeps its order.
  // taskIndex is untouched, so every row action still hits the right task.
  const isWaiting = (entry: DailyTaskEntry) => Number(entry.task.flowState === 'waiting-for');
  for (const group of byPath.values()) group.entries.sort((a, b) => isWaiting(a) - isWaiting(b));
  return Array.from(byPath.values()).sort((a, b) => {
    if (a.item.kind === 'inbox' && b.item.kind !== 'inbox') return -1;
    if (b.item.kind === 'inbox' && a.item.kind !== 'inbox') return 1;
    return Number(isFocused(b.item)) - Number(isFocused(a.item));
  });
}

/** Perf-traced entry point (docs/dev/technical-design-perf-tracing.md) - see buildDailyAggregateImpl above for the actual logic. */
export function buildDailyAggregate(...args: Parameters<typeof buildDailyAggregateImpl>): ReturnType<typeof buildDailyAggregateImpl> {
  return perfTime('agg:daily', () => buildDailyAggregateImpl(...args));
}

/** Perf-traced entry point (docs/dev/technical-design-perf-tracing.md) - see buildNowEntriesImpl above for the actual logic. */
export function buildNowEntries(...args: Parameters<typeof buildNowEntriesImpl>): ReturnType<typeof buildNowEntriesImpl> {
  return perfTime('agg:nowEntries', () => buildNowEntriesImpl(...args));
}

/** Perf-traced entry point (docs/dev/technical-design-perf-tracing.md) - see buildFocusCandidateEntriesImpl above for the actual logic. */
export function buildFocusCandidateEntries(...args: Parameters<typeof buildFocusCandidateEntriesImpl>): ReturnType<typeof buildFocusCandidateEntriesImpl> {
  return perfTime('agg:focusCandidates', () => buildFocusCandidateEntriesImpl(...args));
}

/** Perf-traced entry point (docs/dev/technical-design-perf-tracing.md) - see groupDailyTasksByItemImpl above for the actual logic. */
export function groupDailyTasksByItem(...args: Parameters<typeof groupDailyTasksByItemImpl>): ReturnType<typeof groupDailyTasksByItemImpl> {
  return perfTime('agg:groupDailyTasks', () => groupDailyTasksByItemImpl(...args));
}
