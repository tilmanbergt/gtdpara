/**
 * Moves one task or meeting from its current file into a different
 * Project/Area's own file - the "Refile" action (docs/dev/technical-design-
 * unified-quickadd.md §7's reserved button, wired 2026-09-09), reached from
 * inside QuickAddWidget's edit mode on any screen that has a Files pane
 * (screens/InboxScreen.tsx, screens/ReviewScreen.tsx's Inbox-to-zero step,
 * screens/ItemDetail.tsx's Current tab via screens/ProjectDataPanel.tsx).
 * Supersedes the row-level arm-based "File" action those first two screens
 * used to expose directly on the row (onArmFile) - filing an Inbox item and
 * moving an already-filed one are the same operation underneath, so there's
 * now exactly one entry point (Refile, inside edit mode) for both.
 *
 * A MOVE, not a copy or a soft-delete: the line disappears from the source
 * file entirely and reappears in the target's own project.txt/area.txt/
 * Inbox.txt. This is different from Cancel (Task.cancelled/Meeting.cancelled
 * - the line stays put, just hidden) - refiling has nowhere sensible to
 * leave a trace behind, since the source isn't the item's home any more
 * once it moves.
 *
 * Write order: the TARGET file first, then the removal from the source - so
 * a crash between the two writes leaves the item duplicated (visible in
 * both places, recoverable by hand) rather than lost outright. Same "which
 * failure mode is acceptable" reasoning storage/archive.ts's archiveItem
 * uses for its own two-step move+stamp sequence.
 *
 * `fileInboxTask`/`fileInboxMeeting` (Inbox source only) are the original,
 * still-used-as-is entry points for screens/InboxScreen.tsx and
 * screens/ReviewScreen.tsx's Inbox-to-zero step. `appendTaskToTarget`/
 * `appendMeetingToTarget` are the shared "other half" both those and
 * screens/ProjectDataPanel.tsx's own Current-tab refile (Project/Area
 * source, via storage/dataCache.ts's write-through pair directly, since a
 * Project/Area's source-side removal already goes through that screen's own
 * `withTasks`/`withMeetings` helpers rather than through this module) all
 * reduce to.
 */
import {ResolvedParaPaths} from '../domain/settings';
import {Meeting, Task} from '../domain/types';
import {ensureItemCached, updateItemMeetings, updateItemTasks} from './dataCache';
import {ProjectFileState, saveMeetings, saveTasks} from './projectFile';

/** A refile target is always a Project or Area - never Inbox (there's no "un-file back to Inbox" flow) and never Resources (that's for linking, a different picker root entirely). */
export interface InboxFilingTarget {
  kind: 'project' | 'area';
  name: string;
  path: string;
}

/** Appends `task` onto `target`'s own Tasks span and write-throughs the shared cache - the target-side half of a refile, shared by fileInboxTask below and screens/ProjectDataPanel.tsx's own Current-tab refile. */
export async function appendTaskToTarget(target: InboxFilingTarget, task: Task): Promise<void> {
  const targetItem = await ensureItemCached(target.kind, target.name, target.path);
  const nextTargetTasks = [...targetItem.tasks, task];
  const nextTargetRaw = await saveTasks(
    target.kind,
    target.path,
    targetItem.rawContent,
    nextTargetTasks,
    targetItem.taskExtraLines,
  );
  updateItemTasks(target.path, nextTargetRaw, nextTargetTasks, targetItem.taskExtraLines);
}

/** Meeting counterpart of appendTaskToTarget above. */
export async function appendMeetingToTarget(target: InboxFilingTarget, meeting: Meeting): Promise<void> {
  const targetItem = await ensureItemCached(target.kind, target.name, target.path);
  const nextTargetMeetings = [...targetItem.meetings, meeting];
  const nextTargetRaw = await saveMeetings(
    target.kind,
    target.path,
    targetItem.rawContent,
    nextTargetMeetings,
    targetItem.meetingExtraLines,
  );
  updateItemMeetings(target.path, nextTargetRaw, nextTargetMeetings, targetItem.meetingExtraLines);
}

/**
 * Turns a FileBrowserPane pick (root key + relativePath, from an arming
 * LinkTarget with pickKind:'folder' over the projects/areas roots -
 * docs/dev/technical-design-filing-unification.md §2/§3.4) into an
 * InboxFilingTarget. Pick only ever fires at depth 0 (pickKind:'folder'),
 * so relativePath is always a bare folder name - shared by
 * screens/InboxScreen.tsx and screens/ReviewScreen.tsx's Inbox-to-zero
 * step, the only two filing surfaces in the app.
 */
export function resolveFilingPick(paths: ResolvedParaPaths, root: string, relativePath: string): InboxFilingTarget | null {
  if (root === 'projects') return {kind: 'project', name: relativePath, path: `${paths.projects}/${relativePath}`};
  if (root === 'areas') return {kind: 'area', name: relativePath, path: `${paths.areas}/${relativePath}`};
  return null; // shouldn't happen - Resources isn't offered as a root while file-arming (§3.3)
}

/**
 * Files `inbox.tasks[taskIndex]` into `target`. Returns the Inbox side of
 * the result only (rawContent + tasks) - the caller (ReviewScreen) merges
 * that back into its own local Inbox state, the same shape DailyView's own
 * Inbox mutations already return. The target's cache entry is updated via
 * the usual write-through pair internally; the caller doesn't need to
 * touch it, just re-read the cache if it wants the target's fresh row.
 */
export async function fileInboxTask(
  inbox: ProjectFileState,
  basePath: string,
  taskIndex: number,
  target: InboxFilingTarget,
): Promise<{inboxRawContent: string; inboxTasks: Task[]}> {
  const task = inbox.tasks[taskIndex];
  if (!task) {
    throw new Error('That inbox item changed on disk - tap 🔄 to refresh.');
  }

  await appendTaskToTarget(target, task);

  const nextInboxTasks = inbox.tasks.filter((_, index) => index !== taskIndex);
  const nextInboxRaw = await saveTasks('inbox', basePath, inbox.rawContent, nextInboxTasks, inbox.taskExtraLines);

  return {inboxRawContent: nextInboxRaw, inboxTasks: nextInboxTasks};
}

/** Meeting counterpart of fileInboxTask above - see its doc comment. */
export async function fileInboxMeeting(
  inbox: ProjectFileState,
  basePath: string,
  meetingIndex: number,
  target: InboxFilingTarget,
): Promise<{inboxRawContent: string; inboxMeetings: Meeting[]}> {
  const meeting = inbox.meetings[meetingIndex];
  if (!meeting) {
    throw new Error('That inbox item changed on disk - tap 🔄 to refresh.');
  }

  await appendMeetingToTarget(target, meeting);

  const nextInboxMeetings = inbox.meetings.filter((_, index) => index !== meetingIndex);
  const nextInboxRaw = await saveMeetings(
    'inbox',
    basePath,
    inbox.rawContent,
    nextInboxMeetings,
    inbox.meetingExtraLines,
  );

  return {inboxRawContent: nextInboxRaw, inboxMeetings: nextInboxMeetings};
}
