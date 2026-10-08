/**
 * The "Since last time" note piece's content
 * (docs/dev/history/technical-design-tending-threads.md §3.11): a printed
 * snapshot of the thread overview (storage/threadAggregate.ts) for the
 * meeting's first thread tag, thread lens, owner = the meeting's item, as of
 * the moment the note is written.
 *
 * Previous = the latest meeting of the thread (its tag or deeper, not
 * cancelled) that starts before this one; without one there is nothing to
 * write. Blocks: "Agreed last time" (todos agreed in the previous meeting,
 * open first, then done), "I owe", "Waiting for", "Relevant" (the overview's
 * open todos), "Done since then" (todos of the lens completed on or after
 * the previous meeting's day). Each todo appears once: one agreed last time
 * stays in that block, open or done, and is left out of the others; the rest
 * follow the overview's precedence (Waiting for > I owe > Relevant).
 */
import {SinceLast, SinceLastLine} from '../domain/sinceLastText';
import {displayTaskText} from '../domain/taskLabels';
import {belongsToThread, isCounterpartType, threadsOfTags} from '../domain/threads';
import {Meeting, Task} from '../domain/types';
import {CachedItem} from './dataCache';
import {buildThreadOverview, threadLensContext, ThreadInboxInput, ThreadTaskEntry} from './threadAggregate';

const startKey = (m: Pick<Meeting, 'date' | 'time'>) => `${m.date} ${m.time || '00:00'}`;
const entryKey = (e: ThreadTaskEntry) => `${e.item.path}#${e.taskIndex}`;
const lineOf = (task: Task): SinceLastLine => ({text: displayTaskText(task, 'grouped'), done: task.done});

/** The piece's blocks for `meeting` of the item at `itemPath` (the Inbox folder for an Inbox meeting), or null. */
export function buildSinceLast(
  meeting: Meeting,
  itemPath: string,
  items: readonly CachedItem[],
  inbox: ThreadInboxInput | null,
  now: Date = new Date(),
): SinceLast | null {
  const thread = threadsOfTags(meeting.tags).find(t => !isCounterpartType(t.type));
  if (!thread) return null;
  const ctx = threadLensContext(items, inbox, thread.tag, 'thread', itemPath);
  const overview = buildThreadOverview(items, inbox, thread.tag, 'thread', itemPath, now);
  if (!ctx || !overview) return null;

  const own = startKey(meeting);
  let previous: {path: string; meetingIndex: number; meeting: Meeting} | null = null;
  for (const source of ctx.inScope) {
    source.meetings.forEach((m, meetingIndex) => {
      if (m.cancelled || !belongsToThread(m.tags, thread) || startKey(m) >= own) return;
      if (!previous || startKey(m) > startKey(previous.meeting)) previous = {path: source.ref.path, meetingIndex, meeting: m};
    });
  }
  if (!previous) return null;
  const prev: {path: string; meetingIndex: number; meeting: Meeting} = previous;

  const agreed: ThreadTaskEntry[] = [];
  const doneSince: ThreadTaskEntry[] = [];
  for (const source of ctx.inScope) {
    source.tasks.forEach((task, taskIndex) => {
      if (task.cancelled) return;
      const entry = {item: source.ref, taskIndex, task};
      const match = ctx.provenanceOf(task);
      if (match && match.path === prev.path && match.meetingIndex === prev.meetingIndex) {
        agreed.push(entry);
        return;
      }
      if (task.done && task.fields.completion !== null && task.fields.completion >= prev.meeting.date && ctx.relationOf(task, match)) {
        doneSince.push(entry);
      }
    });
  }
  const agreedKeys = new Set(agreed.map(entryKey));
  const rest = (list: ThreadTaskEntry[]) => list.filter(e => !agreedKeys.has(entryKey(e))).map(e => lineOf(e.task));
  doneSince.sort((a, b) => (b.task.fields.completion ?? '').localeCompare(a.task.fields.completion ?? ''));

  return {
    previous: prev.meeting.date,
    blocks: [
      {title: 'Agreed last time', lines: [...agreed.filter(e => !e.task.done), ...agreed.filter(e => e.task.done)].map(e => lineOf(e.task))},
      {title: 'I owe', lines: rest(overview.ahead.owe)},
      {title: 'Waiting for', lines: rest(overview.ahead.waiting)},
      {title: 'Relevant', lines: rest(overview.ahead.relevant)},
      {title: 'Done since then', lines: doneSince.map(e => lineOf(e.task))},
    ],
  };
}
