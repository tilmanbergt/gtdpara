/**
 * Which owner and which todo the open note page stands for
 * (docs/dev/history/technical-design-engage.md §3.4): the Engage button's
 * context (R2) and the todo it makes current (R3). First hit wins:
 *
 * 1. the todo or meeting whose page this is (own note, page link, or its page
 *    in a shared notebook - storage/notePageEntry.ts). A todo becomes current;
 *    its owner is its loop, else its thread, else its item. A meeting has no
 *    current todo; its owner is its thread, else its loop, else its item, and
 *    the meeting itself is passed on (the Agreed tab).
 * 2. a loop note (any page no entry claims): that loop.
 * 3. a note inside a Project/Area folder: the item.
 * 4. none.
 */
import {EngageOwner, EngageSource, EngageTodoKey, MeetingRef, ownerOfMeeting, ownerOfTodo} from '../domain/engageOwner';
import {findEnclosingItem, ResolvedParaPaths} from '../domain/settings';
import {errorMessage} from '../utils/errorMessage';
import {log} from '../utils/log';
import {pageSourcesOf} from './engageAggregate';
import {loopNoteOf} from './loopNotes';
import {entryForNotePage} from './notePageEntry';

export type NoteContextRule = 'todoNote' | 'meetingNote' | 'loopNote' | 'item' | 'none';

export interface NoteContext {
  owner: EngageOwner | null;
  todo: EngageTodoKey | null;
  /** The meeting whose page this is (rule `meetingNote`); its agreed todos open the Agreed tab. */
  meeting: MeetingRef | null;
  rule: NoteContextRule;
}

function loopNoteOwner(absPath: string, source: EngageSource): EngageOwner | null {
  for (const item of source.items) {
    for (const line of item.loops) {
      if (line.status !== 'active') continue;
      try {
        if (loopNoteOf(item.path, line.tag).absolutePath === absPath) return {kind: 'loop', itemPath: item.path, tag: line.tag};
      } catch (e) {
        log('noteOwnerOf: loop note name unknown', errorMessage(e));
      }
    }
  }
  return null;
}

async function lookup(absPath: string, page: number | null, source: EngageSource, paths: ResolvedParaPaths): Promise<NoteContext> {
  const entry = await entryForNotePage(absPath, page, pageSourcesOf(source));
  if (entry?.kind === 'task') {
    const owner = ownerOfTodo({itemPath: entry.item.path, task: entry.task}, source);
    const open = !entry.task.done && !entry.task.cancelled;
    const todo = open ? {itemPath: entry.item.path, taskText: entry.task.text, taskIndex: entry.taskIndex} : null;
    return {owner, todo, meeting: null, rule: 'todoNote'};
  }
  if (entry?.kind === 'meeting') {
    const meeting = {itemPath: entry.item.path, meetingIndex: entry.meetingIndex};
    return {owner: ownerOfMeeting({itemPath: entry.item.path, meeting: entry.meeting}, source), todo: null, meeting, rule: 'meetingNote'};
  }
  const loop = loopNoteOwner(absPath, source);
  if (loop) return {owner: loop, todo: null, meeting: null, rule: 'loopNote'};
  const enclosing = findEnclosingItem(paths, absPath);
  if (enclosing && source.items.some(item => item.path === enclosing.path)) {
    return {owner: {kind: 'item', itemPath: enclosing.path}, todo: null, meeting: null, rule: 'item'};
  }
  return {owner: null, todo: null, meeting: null, rule: 'none'};
}

/** The owner and current todo of the note page `absPath`/`page` (0-based); logs which rule hit, never the path. */
export async function noteContextOf(
  absPath: string | null,
  page: number | null,
  source: EngageSource,
  paths: ResolvedParaPaths,
): Promise<NoteContext> {
  const context = absPath ? await lookup(absPath, page, source, paths) : {owner: null, todo: null, meeting: null, rule: 'none' as const};
  log('noteOwnerOf: context', 'rule=' + context.rule, 'owner=' + (context.owner?.kind ?? 'none'), 'todo=' + (context.todo ? 'yes' : 'no'));
  return context;
}
