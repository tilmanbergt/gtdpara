/**
 * Cross-project aggregation for the Weekly Review flow (screens/ReviewScreen.tsx),
 * mirroring storage/dailyAggregate.ts's own pattern exactly: a pure,
 * synchronous transform over whatever storage/dataCache.ts already has
 * loaded in memory - no filesystem I/O here, so this is effectively
 * instant regardless of how many Projects/Areas exist. Getting the cache
 * warm is dataCache.ts's job, not this file's (design-overview.md §3's
 * "read the already-warm cache" rule).
 *
 * Inbox.txt is deliberately NOT covered here, same as dailyAggregate.ts -
 * it's a single flat file outside storage/dataCache.ts's `items` array, so
 * ReviewScreen loads it directly (loadProjectFile('inbox', inboxPath)),
 * same as DailyView already does for its own Inbox section.
 *
 * Scope, one bucket per Weekly Review step that needs cross-project data
 * (steps that only touch one item at a time - status/archive/focus actions -
 * don't need an aggregate entry, they read/write CachedItem directly):
 * - weekMeetings: every not-cancelled meeting that touches the week the
 *   "Week ahead" step shows (domain/weekDate.ts's weekAheadRangeIso: this
 *   week, or next week from Friday to Sunday) - once per meeting, also when
 *   a multi-day meeting started before that week. Sorted soonest first.
 *   Only its length is used, as the hub's count; the step itself is
 *   screens/ReviewWeekAhead.tsx.
 * - stalledProjects: Active projects with zero *actionable* open tasks -
 *   not done, not cancelled, and NOT tagged Someday or Maybe (
 *   technical-design-tags.md: a project whose only open tasks are all shelved to
 *   Someday/Maybe has no real next action either; Waiting For tasks still
 *   count, since they represent real, if blocked, follow-up). Each stalled
 *   entry carries its own next-2-upcoming-meetings (not bounded to the
 *   week-ahead window above - a stalled project's only near-term touchpoint
 *   might be three weeks out, and that's still worth surfacing) AND its own
 *   `shelvedTasks` - the Someday/Maybe tasks excluded from the "is it
 *   stalled" check - so the Stalled Projects step can still show them, with
 *   a quick way to promote one to Next right there.
 * - doneProjects: projects at status 'done' - Areas never reach this status
 *   (domain/types.ts's ItemStatus doc comment), so this is projects only.
 * - onHoldItems: Projects AND Areas at status 'on-hold', kind on each entry
 *   distinguishes them - Weekly Review's On Hold step reviews both kinds
 *   together.
 * - neglectedAreas: the Areas counterpart of stalledProjects, same
 *   Someday/Maybe-excluded/shelvedTasks treatment.
 * - unfocusedNextItems (docs/dev/history/technical-design-daily-todo-filter.md,
 *   docs/dev/history/technical-design-review-monthly-focus.md §1): Active Projects
 *   AND Areas, not currently focused *at all* (`domain/destination.ts`'s
 *   `isFocused` - neither daily, weekly NOR monthly), that have at least one
 *   open #next task WITHOUT a due date - the items whose #next work is
 *   otherwise quiet, since storage/dailyAggregate.ts shows a #next task
 *   only for a daily- or weekly-focused item. Weekly-focused items don't
 *   count as unfocused: storage/weeklyAggregate.ts's focus cards already
 *   surface a count for them on the Week view. A #next task that already carries a due date is
 *   excluded - it's not actually quiet: storage/dailyAggregate.ts's own
 *   `isDueSoonOrOverdue` check means it'll surface on Daily on its own once
 *   due, so flagging it here too would be noise; the review step is for
 *   tasks with no other route back onto Daily's radar. Each entry carries
 *   its own nextTasks (nextTasksFor below) so the "Unfocused next items"
 *   review step can offer per-task Someday/Maybe/Done/Cancel/Set-due-date
 *   actions plus a whole-item "Add to Daily/Weekly focus" action. Can never
 *   overlap with stalledProjects/neglectedAreas: those require *zero*
 *   actionable open tasks, and a #next task always counts as actionable
 *   (isActionableOpenTask only excludes Someday/Maybe).
 * - meetingsToClose (docs/dev/history/technical-design-meeting-tracking.md): meetings whose
 *   Tag Rule tracks "review after", that are over, not yet `#reviewed`, and
 *   within the last REVIEW_LOOKBACK_DAYS. The predicate is domain/
 *   meetingTracking.ts's `isReviewOutstanding` - the same resolution the Daily
 *   row's icon uses, so the two can't disagree. Needs the Tag Rules
 *   (`definitions`), which are settings, not item data, so the caller passes
 *   them in (an empty list -> nothing tracked -> empty bucket).
 */
import {isFocused} from '../domain/destination';
import {countMeetingsInRange} from '../domain/meetingSpan';
import {meetingTimestampMs, splitAndSortMeetings} from '../domain/meetingTime';
import {isReviewOutstanding} from '../domain/meetingTracking';
import {TagRule} from '../domain/tagRules';
import {ReviewStepId} from '../domain/reviewSteps';
import {Meeting, Task} from '../domain/types';
import {weekAheadRangeIso} from '../domain/weekDate';
import {CachedItem} from './dataCache';

export interface ReviewItemRef {
  kind: 'project' | 'area';
  name: string;
  path: string;
}

export interface ReviewMeetingEntry {
  item: ReviewItemRef;
  /** Index into that item's *full* meetings array (CachedItem.meetings). */
  meetingIndex: number;
  meeting: Meeting;
}

export interface ReviewShelvedTaskEntry {
  item: ReviewItemRef;
  /** Index into that item's *full* tasks array (CachedItem.tasks) - needed to write a flow-state promotion back with saveTasks + updateItemTasks, same shape storage/dailyAggregate.ts's DailyTaskEntry already uses. */
  taskIndex: number;
  task: Task;
}

export interface ReviewProjectEntry {
  item: ReviewItemRef;
  /** Up to 2 nearest not-cancelled upcoming meetings for this item, any date - not bounded to weekMeetings' week. */
  upcomingMeetings: ReviewMeetingEntry[];
  /** This item's own open Someday/Maybe tasks - excluded from the stalled/neglected check itself (see the module doc comment) but surfaced here so the UI can offer a one-tap promote-to-Next. */
  shelvedTasks: ReviewShelvedTaskEntry[];
}

export interface ReviewNextTaskEntry {
  item: ReviewItemRef;
  /** Index into that item's *full* tasks array (CachedItem.tasks) - same convention as ReviewShelvedTaskEntry. */
  taskIndex: number;
  task: Task;
}

export interface ReviewUnfocusedNextEntry {
  item: ReviewItemRef;
  /** This item's own open (#next, not done/cancelled, no due date) tasks - see nextTasksFor. */
  nextTasks: ReviewNextTaskEntry[];
}

export interface ReviewAggregate {
  weekMeetings: ReviewMeetingEntry[];
  stalledProjects: ReviewProjectEntry[];
  doneProjects: ReviewItemRef[];
  onHoldItems: ReviewItemRef[];
  neglectedAreas: ReviewProjectEntry[];
  /** Active Projects/Areas, not focused at all (not daily, weekly or monthly), with ≥1 open #next task that has no due date yet - see the module doc comment's "unfocusedNextItems" note. */
  unfocusedNextItems: ReviewUnfocusedNextEntry[];
  /** Past meetings still owing their tracked review, most recent first - see the module doc comment's "meetingsToClose" note. */
  meetingsToClose: ReviewMeetingEntry[];
  /** Items whose data file failed to load on the last cache build - reported, not silently dropped, same as dailyAggregate.ts. */
  failedItems: Array<{item: ReviewItemRef; error: string}>;
}

const NEXT_MEETINGS_LIMIT = 2;

function nextUpcomingMeetings(item: ReviewItemRef, meetings: Meeting[], now: Date): ReviewMeetingEntry[] {
  const indexed = meetings
    .map((meeting, index) => ({meeting, index}))
    .filter(({meeting}) => !meeting.cancelled);
  const {upcoming} = splitAndSortMeetings(indexed, now.getTime());
  return upcoming.slice(0, NEXT_MEETINGS_LIMIT).map(({meeting, index}) => ({item, meetingIndex: index, meeting}));
}

/**
 * Not done, not cancelled, and not shelved to Someday/Maybe - see the
 * module doc comment. Exported so screens/ReviewScreen.tsx can apply the
 * exact same "does this count as open work" rule when it live-recomputes a
 * frozen Stalled/Neglected card's task list against the current cache,
 * instead of drifting from this file's own definition.
 */
export function isActionableOpenTask(task: Task): boolean {
  return !task.done && !task.cancelled && task.flowState !== 'someday' && task.flowState !== 'maybe';
}

/**
 * This item's own open Someday/Maybe tasks, for ReviewProjectEntry.shelvedTasks.
 * Exported for the same reason as isActionableOpenTask above - ReviewScreen.tsx
 * reuses this to keep a frozen card's shelved-task list live (e.g. so a
 * just-promoted task disappears from it immediately, rather than only after
 * the card itself next re-freezes).
 */
export function shelvedTasksFor(item: ReviewItemRef, tasks: Task[]): ReviewShelvedTaskEntry[] {
  return tasks
    .map((task, taskIndex) => ({item, taskIndex, task}))
    .filter(({task}) => !task.done && !task.cancelled && (task.flowState === 'someday' || task.flowState === 'maybe'));
}

/**
 * This item's own open (#next, not done, not cancelled), NOT-YET-DUE tasks -
 * the set the "Unfocused next items" review step surfaces per item. A task
 * that already has a due date is excluded - see this module's own doc
 * comment's "unfocusedNextItems" note for why - so setting one on a task from
 * that review step (screens/ReviewScreen.tsx's handleSetTaskDueDate) is
 * exactly how a task leaves this list without being Someday/Maybe/Done/
 * Cancelled: the same live recompute that drops a task the moment it's
 * resolved also drops one the moment it's scheduled. Exported so
 * ReviewScreen.tsx can recompute a frozen card's task list live against the
 * current cache, same reason isActionableOpenTask/shelvedTasksFor are
 * exported.
 */
export function nextTasksFor(item: ReviewItemRef, tasks: Task[]): ReviewNextTaskEntry[] {
  return tasks
    .map((task, taskIndex) => ({item, taskIndex, task}))
    .filter(({task}) => !task.done && !task.cancelled && task.flowState === 'next' && task.dueDate === null);
}

/** Pure in-memory aggregation over already-cached items - see the module doc comment. */
export function buildReviewAggregate(
  items: CachedItem[],
  now: Date = new Date(),
  definitions: TagRule[] = [],
): ReviewAggregate {
  const week = weekAheadRangeIso(now);

  const weekMeetings: ReviewMeetingEntry[] = [];
  const stalledProjects: ReviewProjectEntry[] = [];
  const doneProjects: ReviewItemRef[] = [];
  const onHoldItems: ReviewItemRef[] = [];
  const neglectedAreas: ReviewProjectEntry[] = [];
  const unfocusedNextItems: ReviewUnfocusedNextEntry[] = [];
  const meetingsToClose: ReviewMeetingEntry[] = [];
  const failedItems: ReviewAggregate['failedItems'] = [];

  for (const cachedItem of items) {
    const item: ReviewItemRef = {kind: cachedItem.kind, name: cachedItem.name, path: cachedItem.path};

    if (cachedItem.loadError) {
      failedItems.push({item, error: cachedItem.loadError});
      continue;
    }

    cachedItem.meetings.forEach((meeting, meetingIndex) => {
      if (countMeetingsInRange([meeting], week.start, week.end) > 0) {
        weekMeetings.push({item, meetingIndex, meeting});
      }
      if (isReviewOutstanding(meeting, definitions, now)) {
        meetingsToClose.push({item, meetingIndex, meeting});
      }
    });

    if (cachedItem.kind === 'project' && cachedItem.status === 'done') {
      doneProjects.push(item);
    }
    if (cachedItem.status === 'on-hold') {
      onHoldItems.push(item);
    }

    if (cachedItem.status === 'active') {
      const hasOpenTask = cachedItem.tasks.some(isActionableOpenTask);
      if (!hasOpenTask) {
        const entry: ReviewProjectEntry = {
          item,
          upcomingMeetings: nextUpcomingMeetings(item, cachedItem.meetings, now),
          shelvedTasks: shelvedTasksFor(item, cachedItem.tasks),
        };
        if (cachedItem.kind === 'project') {
          stalledProjects.push(entry);
        } else {
          neglectedAreas.push(entry);
        }
      }

      if (!isFocused(cachedItem)) {
        const nextTasks = nextTasksFor(item, cachedItem.tasks);
        if (nextTasks.length > 0) {
          unfocusedNextItems.push({item, nextTasks});
        }
      }
    }
  }

  weekMeetings.sort((a, b) => meetingTimestampMs(a.meeting, now) - meetingTimestampMs(b.meeting, now));

  meetingsToClose.sort((a, b) => meetingTimestampMs(b.meeting, now) - meetingTimestampMs(a.meeting, now));

  return {
    weekMeetings,
    stalledProjects,
    doneProjects,
    onHoldItems,
    neglectedAreas,
    unfocusedNextItems,
    meetingsToClose,
    failedItems,
  };
}

/** One step's number on the Review hub. `of` is only set where the count reads "N of M" (Focus reset's filled weekly+monthly slots). */
export interface ReviewStepCount {
  n: number;
  of?: number;
}

/**
 * The Review hub's per-step numbers (docs/dev/history/technical-design-review-hub.md
 * §5.2) - "how much is waiting in there", live from the same aggregate the
 * steps themselves read, so the hub and a step can never disagree about
 * membership (the steps' own frozen snapshots only affect what stays visible
 * INSIDE a visit). A Record over every ReviewStepId, so adding a step to
 * domain/reviewSteps.ts fails to compile until it gets a count here.
 *
 * `inboxOpenCount` is passed in because Inbox.txt lives outside the item
 * cache (ReviewScreen loads it directly and already knows which Inbox tasks/
 * meetings are still open). Week ahead counts gtdpara meetings only - Google
 * Calendar events sit in a separate async cache; the Inbox's meetings in
 * that week come in as `weekAheadInboxCount`, for the same reason as
 * `inboxOpenCount`. Unfocused next items counts
 * TASKS, not projects: the tasks are that step's selectable rows.
 *
 * `gmailInboxCount` is passed in for the same reason `inboxOpenCount` is -
 * the Gmail inbox (storage/gmailInboxCache.ts) is its own module-level
 * cache, entirely outside both the item cache and this function's own
 * `aggregate` parameter, since it comes from IMAP rather than anything on
 * this device's storage.
 */
export function buildReviewStepCounts(
  aggregate: ReviewAggregate,
  inboxOpenCount: number,
  items: CachedItem[],
  settings: {
    weeklyFocusProjectCount: number;
    weeklyFocusAreaCount: number;
    monthlyFocusProjectCount: number;
    monthlyFocusAreaCount: number;
  },
  gmailInboxCount: number,
  weekAheadInboxCount = 0,
): Record<ReviewStepId, ReviewStepCount> {
  return {
    weekAhead: {n: aggregate.weekMeetings.length + weekAheadInboxCount},
    meetingsCloseOut: {n: aggregate.meetingsToClose.length},
    gmailInbox: {n: gmailInboxCount},
    inbox: {n: inboxOpenCount},
    stalled: {n: aggregate.stalledProjects.length},
    done: {n: aggregate.doneProjects.length},
    onHold: {n: aggregate.onHoldItems.length},
    neglected: {n: aggregate.neglectedAreas.length},
    unfocusedNext: {n: aggregate.unfocusedNextItems.reduce((sum, entry) => sum + entry.nextTasks.length, 0)},
    // "Focus reset" (id kept as 'weeklyFocus' - see domain/reviewSteps.ts)
    // sets weekly AND monthly focus, so its "N of M" counts both levels'
    // filled slots against both levels' limits.
    weeklyFocus: {
      n: items.filter(item => item.weeklyFocus).length + items.filter(item => item.monthlyFocus).length,
      of:
        settings.weeklyFocusProjectCount +
        settings.weeklyFocusAreaCount +
        settings.monthlyFocusProjectCount +
        settings.monthlyFocusAreaCount,
    },
  };
}
