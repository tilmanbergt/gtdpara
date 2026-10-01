/**
 * Cross-project aggregation for the Daily view (design-overview.md §5.2).
 *
 * Previously this did its own full scan-and-read of every Project/Area on
 * every open (the thing that "will get slow" as the number of them grows).
 * Now it's a pure, synchronous transform over whatever storage/dataCache.ts
 * already has loaded in memory - no filesystem I/O here at all, so this is
 * effectively instant regardless of how many Projects/Areas exist. Getting
 * the cache warm (and keeping it warm) is dataCache.ts's job, not this
 * file's.
 *
 * Scope (narrowed 2026-09-10, docs/dev/technical-design-daily-todo-filter.md;
 * widened again 2026-09-16, Tilman feedback): an open (not done, not
 * cancelled) task shows here if its due date is today, tomorrow, or earlier
 * (overdue included - `dueDate <= tomorrowDate` covers all three in one
 * comparison, since any earlier date is also `<= tomorrowDate`), OR it's
 * tagged #next AND it belongs to a Project/Area currently in *daily,
 * weekly or monthly* focus (`domain/destination.ts`'s `isFocused` - the same "focused
 * floats to top" check groupDailyTasksByItem below already uses) - #next
 * alone is no longer enough, and being unfocused entirely is no longer
 * enough either; only the combination of both qualifies a task through this
 * leg. This is a deliberate narrowing from the original focus feature's rule
 * (§5's history): back then, ANY open task belonging to a focused Project/
 * Area showed here regardless of its own tags, which meant a busy focused
 * project could flood Daily. Now focus only ever surfaces that item's #next
 * task(s), not everything it has open. UNLESS a task is tagged Waiting For,
 * Someday, or Maybe (technical-design-tags.md §3), in which case it's
 * excluded outright, full stop, even if it would otherwise qualify by due
 * date or focus membership - that exclusion still wins over everything
 * else, so the only flow-state badge a task on Daily can ever display is
 * still Next (ui/TaskBadges.tsx only renders that one in the 'flat'
 * context). Weekly focus was originally excluded from this leg entirely
 * ("reserved for a future week view") - widened 2026-09-16 once Tilman
 * pointed out that a weekly-focused item's #next task wasn't actually
 * surfaced anywhere else either: `storage/weeklyAggregate.ts`'s Week-view
 * focus cards only ever show a *count* of open #next tasks, never the tasks
 * themselves, so a weekly-focused-only item's next action was invisible
 * everywhere, not just "handled elsewhere." Monthly focus joined the same
 * leg 2026-09-28 (docs/dev/technical-design-review-monthly-focus.md §1) for the
 * same reason - `isFocused` now covers all three levels. Meetings are unaffected by any
 * of this: still filtered to today or tomorrow, not cancelled, soonest
 * first, same as before.
 *
 * A #next task that falls out of Daily under this rule (its item isn't
 * daily- or weekly-focused, and it isn't due soon either) doesn't just
 * vanish unaccounted-for: storage/reviewAggregate.ts's `unfocusedNextItems`
 * bucket surfaces exactly these items on a dedicated Weekly Review step,
 * with a one-tap "Add to Daily/Weekly focus" action and per-task Someday/
 * Maybe/Done/Cancel/Set-due-date actions - see that file's own doc comment.
 *
 * Inbox (docs/dev/technical-design-inbox-tab.md §3, 2026-09-03): Inbox.txt's own
 * tasks/meetings are folded into this same aggregate rather than being
 * DailyView's own always-shown, unfiltered section as before - a synthetic
 * `DailyItemRef` (INBOX_ITEM below) stands in for "the Project/Area this
 * came from" so Inbox entries can flow through the exact same
 * grouping/labeling code (groupDailyTasksByItem, the Calendar column's
 * source subtext) that Project/Area entries already use, for free. Inbox has
 * no Project/Area to be "in daily focus" for, so the 2026-09-10 narrowing
 * above doesn't reach it the same way: an Inbox #next task keeps showing
 * unconditionally, same as before this change - only its due-date leg widens
 * to match (`<= tomorrowDate`). The alternative (dropping Inbox #next
 * visibility entirely, since it can never satisfy an "and it's focused" leg
 * that doesn't apply to it) would just make Inbox #next tasks invisible on
 * Daily until triaged out, which reads as an accidental regression rather
 * than an intended one - decided explicitly, not an oversight. Inbox
 * meetings use the identical today/tomorrow rule, unchanged.
 *
 * Context tags (technical-design-context-tags.md §6, 2026-09-11): the
 * optional `contextTag` param below is a *hard* filter, not an additive one
 * - when set, every rule above is replaced (not widened) for that call:
 * only tasks/meetings whose `tags` include it show at all. Among those
 * matches, flow-state eligibility is relaxed from the normal rule (which
 * excludes Waiting For/Someday/Maybe outright) to allow Next, due-today-or-
 * earlier, Waiting For, and Someday through - Maybe still never qualifies,
 * tag match or not. Meetings keep their existing today/tomorrow/not-
 * cancelled checks unchanged, just ANDed with the tag match.
 *
 * Project/Area-aware (docs/dev/technical-design-project-area-abbreviations.md,
 * 2026-09-14, Tilman: "if the daily tag filter is used: it should identify
 * if a tag refers to an area or project and then show all tasks and
 * meetings of that project / area (independent of the actual tag being
 * present)"): before filtering, `contextTag` is resolved against `items`'
 * own abbrevs (domain/abbrev.ts's resolveAbbrevPath, case-insensitive, same
 * uniqueness the abbrev feature enforces at save time). When it resolves,
 * the tag-match condition above becomes a union, not a replacement - a
 * task/meeting counts if it carries the literal tag OR belongs to that
 * resolved item, so every task and meeting under a Project/Area's `#AT`
 * filter shows even if none of them happen to be tagged `#AT` themselves.
 * When `contextTag` matches no item's abbrev (an ordinary flow-state/
 * context tag, or simply no match), this degrades to the tag-only behavior
 * above, unchanged. Never reaches the synthetic Inbox item - Inbox has no
 * abbrev, so `contextItemPath` (a real Project/Area's path) can never equal
 * `inboxPath`.
 */
import {entriesInRange, entryDate, MeetingSpanDay} from '../domain/meetingSpan';
import {resolveAbbrevPath} from '../domain/abbrev';
import {isFocused} from '../domain/destination';
import {isoDateOffset, meetingTimestampMs, todayIso} from '../domain/meetingTime';
import {GtdParaKind, Meeting, Task} from '../domain/types';
import {CachedItem} from './dataCache';
import {perfTime} from '../utils/perf';

export interface DailyItemRef {
  kind: GtdParaKind;
  name: string;
  path: string;
  /** Carried through from CachedItem (2026-09-03 Daily-cleanup pass) so groupDailyTasksByItem below can sort focused items first without a second cache lookup - always derivable purely from CachedItem, same "cache always reproducible" rule as everything else here (design-overview.md §3). Always false for the synthetic Inbox item below - Inbox can't be daily/weekly-focused. */
  dailyFocus: boolean;
  weeklyFocus: boolean;
  monthlyFocus: boolean;
  /** This item's short abbreviation (docs/dev/technical-design-project-area-abbreviations.md), carried through the same way `dailyFocus`/`weeklyFocus` are - what the Calendar column's trailing badge (ui/MeetingRow.tsx) displays instead of the full name. Always null for the synthetic Inbox item below - Inbox isn't a Project/Area and has no abbrev of its own. */
  abbrev: string | null;
}

/** The synthetic "source item" Inbox tasks/meetings carry - see the module doc comment's "Inbox" note. `path` is `inboxPath` itself, the same address storage/projectFile.ts's loadProjectFile('inbox', inboxPath) already uses. Exported (2026-09-11) for docs/dev/technical-design-now-focus-mode.md's buildNowEntries below, which needs the same synthetic ref. */
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

/** Pure in-memory aggregation over already-cached items plus (2026-09-03) Inbox.txt's own tasks/meetings - see the module doc comment. `inboxPath` addresses the synthetic Inbox item (inboxItemRef above); ignored when `inbox` is null. */
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
      // Waiting For / Someday / Maybe never show on Daily - see the module
      // doc comment. This check wins over the inclusion rule below.
      if (task.flowState === 'waiting-for' || task.flowState === 'someday' || task.flowState === 'maybe') return;
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
      if (task.flowState === 'waiting-for' || task.flowState === 'someday' || task.flowState === 'maybe') return;
      // #next stays unconditional here (no daily-focus leg to combine it
      // with - see the module doc comment's "Inbox" note); due-date leg
      // widened to match the main loop above.
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
 * currently daily-, weekly- or monthly-focused Project/Area (`domain/destination.ts`'s
 * `isFocused` - widened 2026-09-16, Tilman feedback, to match
 * dailyAggregate.ts's own now-widened #next leg above and
 * reviewAggregate.ts's `unfocusedNextItems` criterion, so all three agree on
 * what counts as "focused enough" for a #next task; originally this only
 * read the `dailyFocus` flag). No new query - just a different filter over
 * the same already-cached `items`. Inbox is deliberately excluded - it can
 * never be focused (daily or weekly), and the Picker's own framing ("this
 * week's focused Projects/Areas") doesn't reach it.
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
 * (technical-design-daily-compact-ui.md §3, 2026-09-03 Daily-cleanup pass).
 * Group order: the Inbox group (docs/dev/technical-design-inbox-tab.md §3) always
 * sorts first when present - not-yet-triaged items get visual priority over
 * even a focused Project/Area, a proposed default rather than an explicitly
 * confirmed one, easy to flip if it reads wrong once seen. After that:
 * daily/weekly-focused items first (domain/destination.ts's isFocused, same
 * convention as ItemsList.tsx/destinationCandidates), then whatever order
 * entries arrived in (Array.prototype.sort is stable, so a plain
 * compare-by-focused over the already-built entries is enough). Within a
 * group, task order is preserved exactly as buildDailyAggregate produced it -
 * there's no existing task sort to preserve, and none is introduced here
 * either.
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
