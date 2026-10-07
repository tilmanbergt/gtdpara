/**
 * Closing one todo/meeting of a cached Project/Area in place - the close-out
 * checklist's Done/Cancel actions (docs/dev/technical-design-project-close-
 * out.md §6.3). Moves go through storage/entryMove.ts.
 */
import {todayIso} from '../domain/meetingTime';
import {withTaskCancelled, withTaskDone} from '../domain/taskEdit';
import {findCachedItem} from './dataCache';
import {mutateEntryMeetings, mutateEntryTasks} from './itemMutations';

const NO_INBOX = {inbox: null, inboxPath: null};

function sourceOf(itemPath: string) {
  const item = findCachedItem(itemPath);
  if (!item) throw new Error('This item changed on disk - Settings → Advanced → Reload all files.');
  return item;
}

/** Marks tasks[taskIndex] done or cancelled in place. */
export async function closeTask(itemPath: string, taskIndex: number, how: 'done' | 'cancelled'): Promise<void> {
  const item = sourceOf(itemPath);
  const task = item.tasks[taskIndex];
  if (!task) throw new Error('That todo changed on disk - Settings → Advanced → Reload all files.');
  await mutateEntryTasks(
    {item: {kind: item.kind, path: item.path}, taskIndex, task},
    tasks =>
      tasks.map((t, i) =>
        i === taskIndex ? withTaskCancelled(withTaskDone(t, how === 'done', todayIso()), how === 'cancelled') : t,
      ),
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
