/**
 * The ONE implementation of "create a Task/Meeting and put it somewhere" and
 * "change one existing Task/Meeting wherever it lives" that every screen
 * shares (docs/dev/technical-design-cache-subscription-and-shared-add-path.md
 * §B, 2026-09-20). Before this, Daily, Week, Review, Inbox, Project and
 * Capture each carried their own copy of the same Task/Meeting object
 * literal and of the "Inbox file or cached Project/Area item?" branch - and
 * the copies had drifted (Capture's literals lacked `linkedFile`; Week's
 * post-save refresh silently did nothing, so meetings filed to a
 * Project/Area did not show up until something else re-rendered it).
 *
 * Deliberately no React and no screen state in here. The Inbox is still
 * held as local `ProjectFileState` by each screen (moving it into
 * storage/dataCache.ts is a separate, later step), so every function that
 * may write the Inbox file takes it as an explicit `InboxContext` and
 * RETURNS the new Inbox state (`nextInbox`, or null when the Inbox file was
 * not the one written) - the caller does `if (nextInbox) setInbox(nextInbox)`.
 * Returning it (instead of a setter callback) also gives multi-step callers
 * (Daily's bulk `#now` clear) the fresh value to thread into the next call,
 * which is what the old `inboxOverride` parameter was for: `setInbox` is
 * async, so a second call reading the `inbox` React state would otherwise
 * see the pre-mutation value and clobber the first write.
 *
 * Project/Area writes go through storage/dataCache.ts's write-through pair
 * exactly as before; the cache itself announces the change
 * (subscribeCache), so no caller has a "refresh" step to forget.
 */
import {Destination} from '../domain/destination';
import {deriveMeetingFields, deriveTaskFields} from '../domain/markdown';
import {Meeting, Task} from '../domain/types';
import {ensureItemCached, findCachedItem, updateItemMeetings, updateItemTasks} from './dataCache';
import {ProjectFileState, saveMeetings, saveTasks} from './projectFile';

/** What a mutation needs to know about the (screen-local) Inbox. `inboxPath` is the Inbox folder (cache paths.inboxFolder), which holds Inbox.txt. */
export interface InboxContext {
  inbox: ProjectFileState | null;
  inboxPath: string | null;
}

/** `nextInbox` is set only when the Inbox file was the one written - see the module doc comment. */
export interface MutationResult {
  nextInbox: ProjectFileState | null;
}

/** The fields ui/QuickAddWidget.tsx's `MeetingQuickAddFields` carries (declared here structurally so storage/ never imports from ui/). `endTime`/`days` are the meeting's length (docs/dev/technical-design-monthly-view.md §2.3) - optional so a caller building a meeting from just title/date/time gets "no end" / 1 day. */
export interface MeetingInput {
  title: string;
  date: string;
  time: string;
  endTime?: string;
  days?: number;
}

/** A new open Task from raw text. `notePath` only for Capture's "link to source note". */
export function buildTask(text: string, opts?: {notePath?: string}): Task {
  return {
    text,
    done: false,
    cancelled: false,
    ...deriveTaskFields(text),
    notePath: opts?.notePath ?? '',
    linkedFile: '',
  };
}

/** A new, non-recurring, not-cancelled Meeting. `notePath` only for Capture's "link to source note". */
export function buildMeeting(fields: MeetingInput, opts?: {notePath?: string}): Meeting {
  return {
    title: fields.title,
    date: fields.date,
    time: fields.time,
    endTime: fields.time ? fields.endTime ?? '' : '',
    days: fields.time ? 1 : Math.max(1, fields.days ?? 1),
    ...deriveMeetingFields(fields.title),
    cancelled: false,
    notePath: opts?.notePath ?? '',
    linkedFile: '',
  };
}

/**
 * `meeting` with an edit session's fields applied - the ONE place that maps
 * Quick Add's edited fields onto a stored Meeting (docs/dev/technical-design-
 * monthly-view.md §3.3). Every screen's "save meeting edit" and "quick-file
 * meeting edit" used to copy title/date/time by hand (10 copies); a new
 * meeting field now needs exactly one change, here. Everything not edited
 * (cancelled/notePath) is carried over from `meeting`.
 */
export function applyMeetingEdit(meeting: Meeting, fields: MeetingInput, linkedFile: string): Meeting {
  return {
    ...meeting,
    title: fields.title,
    date: fields.date,
    time: fields.time,
    endTime: fields.time ? fields.endTime ?? '' : '',
    days: fields.time ? 1 : Math.max(1, fields.days ?? 1),
    ...deriveMeetingFields(fields.title),
    linkedFile,
  };
}

const INBOX_NOT_LOADED = 'Inbox not loaded yet - Settings → Advanced → Reload all files.';

/** Appends `task` to the Inbox file or to the Project/Area `destination` names (loading that item into the cache first if it is not there yet). */
export async function addTaskToDestination(
  task: Task,
  destination: Destination,
  ctx: InboxContext,
): Promise<MutationResult> {
  if (destination.type === 'inbox') {
    const {inbox, inboxPath} = ctx;
    if (!inbox || !inboxPath) throw new Error(INBOX_NOT_LOADED);
    const nextTasks = [...inbox.tasks, task];
    const nextRaw = await saveTasks('inbox', inboxPath, inbox.rawContent, nextTasks, inbox.taskExtraLines);
    return {nextInbox: {...inbox, rawContent: nextRaw, tasks: nextTasks}};
  }
  const item = await ensureItemCached(destination.kind, destination.name, destination.path);
  const nextTasks = [...item.tasks, task];
  const nextRaw = await saveTasks(destination.kind, destination.path, item.rawContent, nextTasks, item.taskExtraLines);
  updateItemTasks(destination.path, nextRaw, nextTasks, item.taskExtraLines);
  return {nextInbox: null};
}

/** Meeting counterpart of addTaskToDestination. */
export async function addMeetingToDestination(
  meeting: Meeting,
  destination: Destination,
  ctx: InboxContext,
): Promise<MutationResult> {
  if (destination.type === 'inbox') {
    const {inbox, inboxPath} = ctx;
    if (!inbox || !inboxPath) throw new Error(INBOX_NOT_LOADED);
    const nextMeetings = [...inbox.meetings, meeting];
    const nextRaw = await saveMeetings('inbox', inboxPath, inbox.rawContent, nextMeetings, inbox.meetingExtraLines);
    return {nextInbox: {...inbox, rawContent: nextRaw, meetings: nextMeetings}};
  }
  const item = await ensureItemCached(destination.kind, destination.name, destination.path);
  const nextMeetings = [...item.meetings, meeting];
  const nextRaw = await saveMeetings(
    destination.kind,
    destination.path,
    item.rawContent,
    nextMeetings,
    item.meetingExtraLines,
  );
  updateItemMeetings(destination.path, nextRaw, nextMeetings, item.meetingExtraLines);
  return {nextInbox: null};
}

/** Where a Daily/Week row's task lives: which item (or the synthetic `inbox`), and its index in that item's Tasks list. */
export interface TaskEntryRef {
  item: {kind: 'project' | 'area' | 'inbox'; path: string};
  taskIndex: number;
  task: {text: string};
}

/** Where a Daily/Week row's meeting lives - see TaskEntryRef. */
export interface MeetingEntryRef {
  item: {kind: 'project' | 'area' | 'inbox'; path: string};
  meetingIndex: number;
  meeting: {title: string};
}

/**
 * Re-fetches `entry`'s own source (the Inbox via `ctx`, otherwise the live
 * cache) fresh, applies `mutate` to a copy of its full tasks array, saves the
 * file and writes the cache through. Throws a user-facing message if the
 * item or the task index no longer matches what is cached (edited/removed
 * outside the plugin since the last load). `mutate` is source-agnostic - it
 * just indexes by `entry.taskIndex` into whatever array it is handed - so
 * the same callback works against either backing array.
 */
export async function mutateEntryTasks(
  entry: TaskEntryRef,
  mutate: (tasks: Task[]) => Task[],
  ctx: InboxContext,
): Promise<MutationResult> {
  if (entry.item.kind === 'inbox') {
    const {inbox, inboxPath} = ctx;
    if (!inbox || !inboxPath) throw new Error(INBOX_NOT_LOADED);
    if (!inbox.tasks[entry.taskIndex]) {
      throw new Error(`"${entry.task.text}" changed on disk - Settings → Advanced → Reload all files.`);
    }
    const nextTasks = mutate(inbox.tasks.slice());
    const nextRaw = await saveTasks('inbox', inboxPath, inbox.rawContent, nextTasks, inbox.taskExtraLines);
    return {nextInbox: {...inbox, rawContent: nextRaw, tasks: nextTasks}};
  }
  const item = findCachedItem(entry.item.path);
  const current = item?.tasks[entry.taskIndex];
  if (!item || !current) {
    throw new Error(`"${entry.task.text}" changed on disk - Settings → Advanced → Reload all files.`);
  }
  const nextTasks = mutate(item.tasks.slice());
  const nextRaw = await saveTasks(entry.item.kind, entry.item.path, item.rawContent, nextTasks, item.taskExtraLines);
  updateItemTasks(entry.item.path, nextRaw, nextTasks, item.taskExtraLines);
  return {nextInbox: null};
}

/** Meeting counterpart of mutateEntryTasks. */
export async function mutateEntryMeetings(
  entry: MeetingEntryRef,
  mutate: (meetings: Meeting[]) => Meeting[],
  ctx: InboxContext,
): Promise<MutationResult> {
  if (entry.item.kind === 'inbox') {
    const {inbox, inboxPath} = ctx;
    if (!inbox || !inboxPath) throw new Error(INBOX_NOT_LOADED);
    if (!inbox.meetings[entry.meetingIndex]) {
      throw new Error(`"${entry.meeting.title}" changed on disk - Settings → Advanced → Reload all files.`);
    }
    const nextMeetings = mutate(inbox.meetings.slice());
    const nextRaw = await saveMeetings('inbox', inboxPath, inbox.rawContent, nextMeetings, inbox.meetingExtraLines);
    return {nextInbox: {...inbox, rawContent: nextRaw, meetings: nextMeetings}};
  }
  const item = findCachedItem(entry.item.path);
  const current = item?.meetings[entry.meetingIndex];
  if (!item || !current) {
    throw new Error(`"${entry.meeting.title}" changed on disk - Settings → Advanced → Reload all files.`);
  }
  const nextMeetings = mutate(item.meetings.slice());
  const nextRaw = await saveMeetings(
    entry.item.kind,
    entry.item.path,
    item.rawContent,
    nextMeetings,
    item.meetingExtraLines,
  );
  updateItemMeetings(entry.item.path, nextRaw, nextMeetings, item.meetingExtraLines);
  return {nextInbox: null};
}
