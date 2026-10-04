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
import {findCachedItem, reloadCachedInbox} from './dataCache';
import {EntryMoveUi, moveEntryWithNote} from './entryMove';
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
  await reloadCachedInbox(paths.inboxFolder);
}

function targetFolder(target: MoveTarget, paths: ResolvedParaPaths): {path: string; name: string} {
  return target.type === 'inbox' ? {path: paths.inboxFolder, name: 'Inbox'} : {path: target.path, name: target.name};
}

/**
 * Moves tasks[taskIndex] of the cached item at `itemPath` to `target`, with
 * its note (storage/entryMove.ts, after the user confirms). Appends first,
 * removes second: a failure in between leaves a duplicate, never a loss.
 * Returns the task as written to the target, or null when the user cancelled.
 */
export async function moveTaskTo(
  itemPath: string,
  taskIndex: number,
  target: MoveTarget,
  paths: ResolvedParaPaths,
  ui: EntryMoveUi,
): Promise<Task | null> {
  const item = sourceOf(itemPath);
  const task = item.tasks[taskIndex];
  if (!task) throw new Error('That todo changed on disk - Settings → Advanced → Reload all files.');
  let written: Task | null = null;
  await moveEntryWithNote({entry: task, entryKind: 'task', sourceFolder: item.path, target: targetFolder(target, paths)}, ui, async moved => {
    if (target.type === 'inbox') await appendToInbox(paths, {task: moved});
    else await appendTaskToTarget(target, moved);
    await mutateEntryTasks({item: {kind: item.kind, path: item.path}, taskIndex, task}, tasks => tasks.filter((_, i) => i !== taskIndex), NO_INBOX);
    written = moved;
  });
  return written;
}

/** Meeting counterpart of moveTaskTo. */
export async function moveMeetingTo(
  itemPath: string,
  meetingIndex: number,
  target: MoveTarget,
  paths: ResolvedParaPaths,
  ui: EntryMoveUi,
): Promise<Meeting | null> {
  const item = sourceOf(itemPath);
  const meeting = item.meetings[meetingIndex];
  if (!meeting) throw new Error('That meeting changed on disk - Settings → Advanced → Reload all files.');
  let written: Meeting | null = null;
  await moveEntryWithNote({entry: meeting, entryKind: 'meeting', sourceFolder: item.path, target: targetFolder(target, paths)}, ui, async moved => {
    if (target.type === 'inbox') await appendToInbox(paths, {meeting: moved});
    else await appendMeetingToTarget(target, moved);
    await mutateEntryMeetings({item: {kind: item.kind, path: item.path}, meetingIndex, meeting}, ms => ms.filter((_, i) => i !== meetingIndex), NO_INBOX);
    written = moved;
  });
  return written;
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
