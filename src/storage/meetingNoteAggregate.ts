/**
 * Which open todos are "relevant" to a note being created (docs/technical-
 * design-meeting-notes.md §4, widened by docs/dev/technical-design-note-
 * templates.md §4 Phase 2) - deliberately simpler than
 * storage/dailyAggregate.ts's own rule: **tag match only**, no Project/Area
 * membership check, no `resolveAbbrevPath` union, and NOT excluded by
 * flowState - Waiting For/Someday/Maybe all included (unlike
 * dailyAggregate.ts, which always excludes Maybe even on a tag match) -
 * "independent of flow-state" was the user's own phrase for this, a real,
 * stated departure from that file's rule.
 *
 * Pure in-memory transform over storage/dataCache.ts's already-warm cache
 * (Projects + Areas) plus, when passed, Inbox.txt's own tasks - no
 * filesystem I/O here, same "pure transform over what's already loaded"
 * posture as dailyAggregate.ts. Deliberately not folded into that file - the
 * matching rule here is genuinely different, and that file's own doc
 * comment is already dense with Daily-specific exceptions this would only
 * add noise to.
 *
 * FILE NAME NOTE (2026-09-18, Phase 2): unlike domain/meetingNoteBlock.ts/
 * storage/meetingNoteContent.ts, this file's own name is NOT flagged for
 * rename in technical-design-note-templates.md §8's cleanup list - only the
 * function below (relevantTodosForMeeting -> relatedItemsFor) is
 * rename+widened, per §4: "This is a rename+widen, not a new function -
 * resist writing a second near-duplicate matcher." `MeetingRelevantTodo`/
 * `MeetingNoteInboxInput` keep their current names too, for the same
 * "rename only what's asked, not everything nearby" restraint - worth
 * revisiting now that a Todo caller actually exists (Phase 3, below) and
 * these names read oddly next to it.
 *
 * Phase 3 (2026-09-18, same day): the Todo caller has landed
 * (storage/meetingNoteContent.ts's `refreshTodoNoteBlock`) - unlike a
 * Meeting, a Todo calling this with its own `tags` would otherwise match
 * itself (a task sharing a tag with... itself), so `relatedItemsFor` grew
 * one more optional param, `excludeNotePath`, rather than the caller
 * post-filtering by reference equality (fragile - the caller's own Task
 * object may not be the same reference the cache holds). Tasks have no `id`
 * field to filter by, but every real caller of this exclusion only ever
 * runs once `task.notePath` is already set (refreshTodoNoteBlock's own
 * `if (!task.notePath) return` guard), so excluding by `notePath` is safe
 * in practice - a collision would need two genuinely different tasks
 * sharing the exact same relative note path, which nothing in this app
 * allows to happen.
 */
import {parseSharedNoteAnchor} from '../domain/sharedNotePages';
import {GtdParaKind, Task} from '../domain/types';
import {CachedItem} from './dataCache';

export interface MeetingRelevantTodo {
  /** Same shape as dailyAggregate.ts's DailyItemRef, not imported to avoid a Daily-specific dependency (this aggregate has no grouping/"jump to Project/Area" UI - see relatedItemsFor's own doc comment - so it only ever needs these three fields, not that interface's daily/weekly-focus/abbrev extras). */
  item: {kind: GtdParaKind; name: string; path: string};
  task: Task;
}

/**
 * Just the tasks half of the synthetic Inbox source - unlike
 * dailyAggregate.ts's DailyInboxInput, meetings aren't relevant here (this
 * aggregate only ever looks at tasks; a meeting has no use for other
 * meetings' todos). Pass null when Inbox.txt hasn't loaded, or isn't in
 * scope for the calling screen.
 */
export interface MeetingNoteInboxInput {
  tasks: Task[];
}

/**
 * A task qualifies when it's open (not done, not cancelled) and shares at
 * least one tag with `tags` - regardless of flowState (see the module doc
 * comment). An empty `tags` array naturally produces `[]` here, not
 * special-cased - it just falls out of `.some()` on an empty array.
 *
 * Renamed + widened from relevantTodosForMeeting (2026-09-18, docs/
 * technical-design-note-templates.md §4): took `meeting: Pick<Meeting,
 * 'tags'>` before, now takes a plain `tags: string[]` so a future Todo
 * caller can pass `task.tags` directly without wrapping it in a
 * Meeting-shaped object it doesn't have. Every existing call site (meeting
 * notes, via storage/meetingNoteContent.ts) passes `meeting.tags` exactly
 * as before - no behavior change, just a narrower parameter.
 *
 * Scans every CachedItem in `items` (Projects + Areas; an item whose file
 * failed to load on the last cache rebuild is skipped defensively, same as
 * dailyAggregate.ts, though its `tasks` is already `[]` in that case so this
 * only ever changes anything if that ever stops being true), plus the
 * synthetic Inbox source when `inbox` is non-null. No `DailyItemRef`/
 * `INBOX_ITEM` machinery - this doesn't need grouping or a "jump to Project/
 * Area" UI, the note block just prints `task.text` lines, so the synthetic
 * Inbox item's `path` is left `''` rather than threading a `basePath` param
 * through just for a field nothing here reads meaningfully.
 *
 * No pagination, no cap - printed in whatever order the cache iterates
 * items/tasks in (not sorted; not asked for, and this box doesn't have a
 * stable "which order" expectation the way a UI list would).
 *
 * `excludeNotePath` (Phase 3, see the module doc comment) - when set, a task
 * whose own `notePath` equals it is skipped, so a Todo note's "related
 * items" piece never lists the very task the note belongs to.
 *
 * Shared Note Pages (docs/dev/technical-design-shared-note-pages.md §9,
 * 2026-09-22): the comparison itself is keyword-based, not a raw string
 * match, via `excludeIdentity` below. For an own-target notePath this is
 * unchanged - `parseSharedNoteAnchor` returns `null`, so `excludeIdentity`
 * falls through to the exact same raw-string comparison this always did,
 * byte-for-byte. For a shared-target notePath (`file#keyword`), identity is
 * the *keyword* half alone - excluding a task by keyword, not by which file
 * it happens to share with any number of other items' own pages. This
 * matters because several items can carry the same shared file's path in
 * their notePath while living on completely different pages of it -
 * comparing the raw `file#keyword` strings already keeps those apart
 * correctly (different keyword -> different string), but comparing by
 * keyword makes that guarantee explicit rather than an accident of how the
 * anchor happens to be encoded, and keeps this helper correct if the anchor
 * format's fields are ever reordered.
 */
function excludeIdentity(notePath: string | null): string | null {
  if (!notePath) return null;
  const anchor = parseSharedNoteAnchor(notePath);
  return anchor ? anchor.keyword : notePath;
}

export function relatedItemsFor(
  items: CachedItem[],
  inbox: MeetingNoteInboxInput | null,
  tags: string[],
  excludeNotePath: string | null = null,
): MeetingRelevantTodo[] {
  const excludeKey = excludeIdentity(excludeNotePath);
  const matches = (task: Task): boolean =>
    !task.done &&
    !task.cancelled &&
    (!excludeKey || excludeIdentity(task.notePath) !== excludeKey) &&
    task.tags.some(tag => tags.includes(tag));

  const result: MeetingRelevantTodo[] = [];
  for (const cachedItem of items) {
    if (cachedItem.loadError) continue;
    const item = {kind: cachedItem.kind, name: cachedItem.name, path: cachedItem.path};
    for (const task of cachedItem.tasks) {
      if (matches(task)) result.push({item, task});
    }
  }
  if (inbox) {
    const item = {kind: 'inbox' as const, name: 'Inbox', path: ''};
    for (const task of inbox.tasks) {
      if (matches(task)) result.push({item, task});
    }
  }
  return result;
}
