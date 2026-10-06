/**
 * Which open todos are "relevant" to a note being created (docs/technical-
 * design-meeting-notes.md §4, docs/dev/technical-design-note-
 * templates.md §4) - deliberately simpler than
 * storage/dailyAggregate.ts's own rule: **tag match only**, no Project/Area
 * membership check, no `resolveAbbrevPath` union, and NOT excluded by
 * flowState - Waiting For/Someday/Maybe all included (unlike
 * dailyAggregate.ts, which always excludes Maybe even on a tag match):
 * relevance here is independent of flow state.
 *
 * Pure in-memory transform over storage/dataCache.ts's already-warm cache
 * (Projects + Areas) plus, when passed, Inbox.txt's own tasks - no
 * filesystem I/O here, same "pure transform over what's already loaded"
 * posture as dailyAggregate.ts. Deliberately not folded into that file - the
 * matching rule here is different, and that file's doc comment is already
 * dense with Daily-specific exceptions.
 *
 * Callers are meeting notes and Todo notes (storage/meetingNoteContent.ts's
 * `refreshTodoNoteBlock`). A Todo passing its own `tags` would match itself,
 * so `relatedItemsFor` takes `excludeNotePath` rather than the caller
 * post-filtering by reference equality (fragile - the caller's Task object may
 * not be the same reference the cache holds). Tasks have no `id` field to
 * filter by, but every caller of this exclusion only runs once
 * `task.notePath` is set (refreshTodoNoteBlock's `if (!task.notePath) return`
 * guard), so excluding by `notePath` is safe - a collision would need two
 * different tasks sharing the exact same relative note path, which nothing in
 * this app allows.
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
 * comment). An empty `tags` array produces `[]` (no special case).
 *
 * Scans every CachedItem in `items` (Projects + Areas; an item whose file
 * failed to load on the last cache rebuild is skipped defensively, same as
 * dailyAggregate.ts), plus the synthetic Inbox source when `inbox` is
 * non-null. No `DailyItemRef`/`INBOX_ITEM` machinery - the note block just
 * prints `task.text` lines, so the synthetic Inbox item's `path` is left
 * `''`.
 *
 * No pagination, no cap, no sorting - printed in the order the cache
 * iterates items/tasks.
 *
 * `excludeNotePath` - when set, a task whose own `notePath` identifies the
 * same note is skipped, so a Todo note's "related items" piece never lists
 * the very task the note belongs to.
 *
 * Shared Note Pages (docs/dev/technical-design-shared-note-pages.md §9): the
 * comparison is keyword-based via `excludeIdentity` below. For an own-target
 * notePath `parseSharedNoteAnchor` returns `null` and the raw strings are
 * compared. For a shared-target notePath (`file#keyword`), identity is the
 * *keyword* alone - several items can carry the same shared file's path in
 * their notePath while living on different pages of it, and comparing by
 * keyword keeps them apart explicitly rather than by accident of how the
 * anchor is encoded.
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
