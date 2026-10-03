/**
 * Moving one todo/meeting out of a Project/Area into another Project/Area or
 * the Inbox, and closing one in place - cache-based helpers built from the
 * existing pieces (inboxFiling's appendTaskToTarget/appendMeetingToTarget,
 * itemMutations' mutateEntryTasks/mutateEntryMeetings). Added for the
 * close-out checklist (docs/dev/technical-design-project-close-out.md §6.3).
 *
 * As built: screens/ProjectDataPanel.tsx keeps its own refile code - it
 * writes through its screen-local panel state (withTasks/withMeetings), and
 * switching it to these cache-based helpers would change how that screen
 * refreshes. That's a behavior change, so it's deferred rather than slipped
 * into this feature.
 */
import {ResolvedParaPaths} from '../domain/settings';
import {Meeting, Task} from '../domain/types';
import {findCachedItem} from './dataCache';
import {appendMeetingToTarget, appendTaskToTarget, InboxFilingTarget} from './inboxFiling';
import {mutateEntryMeetings, mutateEntryTasks} from './itemMutations';
import {loadProjectFile, saveMeetings, saveTasks} from './projectFile';

export type MoveTarget = {type: 'inbox'} | ({type: 'item'} & InboxFilingTarget);

const NO_INBOX = {inbox: null, inboxPath: null};

function sourceOf(itemPath: string) {
  const item = findCachedItem(itemPath);
  if (!item) throw new Error('This item changed on disk - Settings → Advanced → Reload all files.');
  return item;
}

async function appendToInbox(paths: ResolvedParaPaths, add: {task?: Task; meeting?: Meeting}): Promise<void> {
  const inbox = await loadProjectFile('inbox', paths.inboxFolder);
  if (add.task) await saveTasks('inbox', paths.inboxFolder, inbox.rawContent, [...inbox.tasks, add.task], inbox.taskExtraLines);
  if (add.meeting) await saveMeetings('inbox', paths.inboxFolder, inbox.rawContent, [...inbox.meetings, add.meeting], inbox.meetingExtraLines);
}

/** Moves tasks[taskIndex] of the cached item at `itemPath` to `target`. Appends first, removes second: a failure in between leaves a duplicate, never a loss. */
export async function moveTaskTo(itemPath: string, taskIndex: number, target: MoveTarget, paths: ResolvedParaPaths): Promise<Task> {
  const item = sourceOf(itemPath);
  const task = item.tasks[taskIndex];
  if (!task) throw new Error('That todo changed on disk - Settings → Advanced → Reload all files.');
  if (target.type === 'inbox') await appendToInbox(paths, {task});
  else await appendTaskToTarget(target, task);
  await mutateEntryTasks({item: {kind: item.kind, path: item.path}, taskIndex, task}, tasks => tasks.filter((_, i) => i !== taskIndex), NO_INBOX);
  return task;
}

/** Meeting counterpart of moveTaskTo. */
export async function moveMeetingTo(itemPath: string, meetingIndex: number, target: MoveTarget, paths: ResolvedParaPaths): Promise<Meeting> {
  const item = sourceOf(itemPath);
  const meeting = item.meetings[meetingIndex];
  if (!meeting) throw new Error('That meeting changed on disk - Settings → Advanced → Reload all files.');
  if (target.type === 'inbox') await appendToInbox(paths, {meeting});
  else await appendMeetingToTarget(target, meeting);
  await mutateEntryMeetings({item: {kind: item.kind, path: item.path}, meetingIndex, meeting}, ms => ms.filter((_, i) => i !== meetingIndex), NO_INBOX);
  return meeting;
}

/** Marks tasks[taskIndex] done or cancelled in place. */
export async function closeTask(itemPath: string, taskIndex: number, how: 'done' | 'cancelled'): Promise<void> {
  const item = sourceOf(itemPath);
  const task = item.tasks[taskIndex];
  if (!task) throw new Error('That todo changed on disk - Settings → Advanced → Reload all files.');
  await mutateEntryTasks(
    {item: {kind: item.kind, path: item.path}, taskIndex, task},
    tasks => tasks.map((t, i) => (i === taskIndex ? {...t, done: how === 'done', cancelled: how === 'cancelled'} : t)),
    NO_INBOX,
  );
}

/** Cancels meetings[meetingIndex] in place (soft-delete, as everywhere else). */
export async function cancelMeeting(itemPath: string, meetingIndex: number): Promise<void> {
  const item = sourceOf(itemPath);
  const meeting = item.meetings[meetingIndex];
  if (!meeting) throw new Error('That meeting changed on disk - Settings → Advanced → Reload all files.');
  await mutateEntryMeetings(
    {item: {kind: item.kind, path: item.path}, meetingIndex, meeting},
    ms => ms.map((m, i) => (i === meetingIndex ? {...m, cancelled: true} : m)),
    NO_INBOX,
  );
}
