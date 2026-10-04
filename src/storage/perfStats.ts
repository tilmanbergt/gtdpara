/**
 * Data-volume statistics written into every performance trace's header
 * (docs/dev/technical-design-perf-tracing.md §4.1), so timings can be read
 * against how much data there is. Called by utils/perf.ts only when a trace
 * has ENDED (injected via perfConfigure in App.tsx) - never during a measured
 * tab switch. Pure read of the in-memory cache: no file I/O.
 *
 * What a screen actually drew (rows rendered, pages) is not here - that comes
 * from the trace's own counters (row:task, row:meeting, ...). The Inbox is
 * not part of the cache; its counts are in the trace's load:projectFile span
 * meta (kind 'inbox').
 */
import {todayIso} from '../domain/meetingTime';
import {getCachedData} from './dataCache';

export function collectPerfStats(): unknown {
  const cache = getCachedData();
  if (!cache) return {cache: 'not built'};

  const today = todayIso();
  const items = {projects: 0, areas: 0, byStatus: {} as Record<string, number>, loadErrors: 0};
  const tasks = {total: 0, open: 0, done: 0, cancelled: 0, overdue: 0, dueToday: 0, withNote: 0, withLinkedFile: 0};
  const meetings = {
    total: 0,
    past: 0,
    today: 0,
    future: 0,
    cancelled: 0,
    withNote: 0,
    withLinkedFile: 0,
  };
  const files = {dataFiles: 0, totalChars: 0, largest: {name: '', chars: 0}};
  const perItem: Array<{name: string; kind: string; chars: number; tasks: number; meetings: number}> = [];

  for (const item of cache.items) {
    if (item.kind === 'project') items.projects += 1;
    else items.areas += 1;
    items.byStatus[item.status] = (items.byStatus[item.status] ?? 0) + 1;
    if (item.loadError) items.loadErrors += 1;

    const chars = item.rawContent.length;
    if (chars > 0) files.dataFiles += 1;
    files.totalChars += chars;
    if (chars > files.largest.chars) files.largest = {name: item.name, chars};
    perItem.push({name: item.name, kind: item.kind, chars, tasks: item.tasks.length, meetings: item.meetings.length});

    for (const task of item.tasks) {
      tasks.total += 1;
      if (task.cancelled) tasks.cancelled += 1;
      else if (task.done) tasks.done += 1;
      else {
        tasks.open += 1;
        if (task.dueDate && task.dueDate < today) tasks.overdue += 1;
        if (task.dueDate === today) tasks.dueToday += 1;
      }
      if (task.notePath) tasks.withNote += 1;
      if (task.linkedFile) tasks.withLinkedFile += 1;
    }

    for (const meeting of item.meetings) {
      meetings.total += 1;
      if (meeting.notePath) meetings.withNote += 1;
      if (meeting.linkedFile) meetings.withLinkedFile += 1;
      if (meeting.cancelled) meetings.cancelled += 1;
      if (meeting.date < today) meetings.past += 1;
      else if (meeting.date === today) meetings.today += 1;
      else meetings.future += 1;
    }
  }

  perItem.sort((a, b) => b.chars - a.chars);
  return {
    cacheAgeMs: Date.now() - cache.scannedAt,
    items,
    tasks,
    meetings,
    files,
    perItem,
  };
}
