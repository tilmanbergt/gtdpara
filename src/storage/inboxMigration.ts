/**
 * Runs the one-time move of the Inbox from the base root into its own
 * folder under Areas (docs/dev/technical-design-inbox-as-area.md §3.3).
 * The plan comes from domain/inboxMigration.ts; this file does the I/O.
 *
 * Called from storage/dataCache.ts's rebuild, before the Projects/Areas
 * scan, at most once per base root per session. Safe to rerun: each op is
 * planned from the current file state, and Inbox.txt moves last, so an
 * interrupted run resumes on the next start. A blocked or failed move
 * leaves the Inbox where it was - effectiveInboxFolderFor() then keeps the
 * app reading it from the old place.
 *
 * Deliberate exception to design-overview §3 ("file moves ... shown to the
 * user before running"): this one runs automatically (requirement 4). It
 * only relocates gtdpara's own files, checks every collision before moving
 * anything, and reports the outcome afterwards through
 * takeInboxMigrationNotice().
 */
import {
  inboxFolderRelativeToBase,
  INBOX_NOTE_FOLDERS,
  InboxMigrationBlockReason,
  ListedEntry,
  planInboxMigration,
  rewriteMovedLinkedFile,
  rewriteMovedNotePath,
  effectiveInboxFolder,
} from '../domain/inboxMigration';
import {GtdParaSettings, ResolvedParaPaths, resolvePaths, validateInboxFolderName} from '../domain/settings';
import {AREA_FILE_NAME, GtdParaKind, INBOX_FILE_NAME, Meeting, PROJECT_FILE_NAME, Task} from '../domain/types';
import {ensureFolderExists, folderExists, listFolderEntries, moveFile, moveFolder, moveFolderMerge} from '../supernote/fileSystem';
import {log, logError, logWarn} from '../utils/log';
import {loadProjectFile, saveMeetings, saveTasks} from './projectFile';
import {errorMessage} from '../utils/errorMessage';

export type InboxMigrationOutcome =
  | {state: 'none'}
  | {state: 'moved'; noteFolders: number; linksRewritten: number}
  | {state: 'blocked'; reason: InboxMigrationBlockReason}
  | {state: 'failed'};

/** Outcome per base root handled this session - keeps the extra root listing to once per base (profiles can switch bases). */
const outcomes = new Map<string, InboxMigrationOutcome>();
let pendingNotice: InboxMigrationNotice | null = null;

/** What App.tsx shows once in the status slot after a move was attempted. */
export interface InboxMigrationNotice {
  kind: 'success' | 'warning';
  text: string;
}

/** The status-slot text for an outcome (pure; exported for tests). Null when there's nothing to tell. */
export function inboxMigrationNoticeFor(outcome: InboxMigrationOutcome, inboxRelative: string, inboxFolderName: string): InboxMigrationNotice | null {
  switch (outcome.state) {
    case 'none':
      return null;
    case 'moved':
      return {
        kind: 'success',
        text:
          `Inbox moved to ${inboxRelative}` +
          (outcome.linksRewritten > 0
            ? `; links to its notes updated in ${outcome.linksRewritten} file${outcome.linksRewritten === 1 ? '' : 's'}.`
            : '.'),
      };
    case 'blocked':
      return outcome.reason === 'areaNameClash'
        ? {kind: 'warning', text: `Inbox not moved: an Area named ${inboxFolderName} exists. Choose another Inbox folder name in Settings → Folders.`}
        : {kind: 'warning', text: 'Inbox not moved. Run the Integrity Check (Settings → Advanced) for details.'};
    case 'failed':
      return {kind: 'warning', text: 'Inbox not moved. Run the Integrity Check (Settings → Advanced) for details.'};
  }
}

/** This session's outcome for `base` (for the debug bundle); 'none' if it wasn't checked. */
export function getInboxMigrationOutcome(base: string): InboxMigrationOutcome {
  return outcomes.get(base) ?? {state: 'none'};
}

/** Short form for logs and the debug bundle: none | moved | blocked:<reason> | failed. */
export function describeInboxMigrationOutcome(outcome: InboxMigrationOutcome): string {
  return outcome.state === 'blocked' ? `blocked:${outcome.reason}` : outcome.state;
}

/** The message to tell the user, once - App.tsx shows it in the status slot and it is cleared. Null when there's nothing to say. */
export function takeInboxMigrationNotice(): InboxMigrationNotice | null {
  const notice = pendingNotice;
  pendingNotice = null;
  return notice;
}

function listed(entries: Array<{name: string; isFolder: boolean}>): ListedEntry[] {
  return entries.map(e => ({name: e.name, isFolder: e.isFolder}));
}

async function noteEntryNames(folder: string, entries: ListedEntry[]): Promise<Record<(typeof INBOX_NOTE_FOLDERS)[number], string[]>> {
  const result = {Todos: [] as string[], Meetings: [] as string[]};
  for (const name of INBOX_NOTE_FOLDERS) {
    if (entries.some(e => e.isFolder && e.name === name)) {
      result[name] = (await listFolderEntries(`${folder}/${name}`)).map(e => e.name);
    }
  }
  return result;
}

function rewriteTask(task: Task, paths: ResolvedParaPaths, inboxRelative: string): Task {
  const linkedFile = rewriteMovedLinkedFile(task.linkedFile, inboxRelative);
  const notePath = rewriteMovedNotePath(task.notePath, paths.base, paths.inboxFolder);
  return linkedFile === task.linkedFile && notePath === task.notePath ? task : {...task, linkedFile, notePath};
}

function rewriteMeeting(meeting: Meeting, paths: ResolvedParaPaths, inboxRelative: string): Meeting {
  const linkedFile = rewriteMovedLinkedFile(meeting.linkedFile, inboxRelative);
  const notePath = rewriteMovedNotePath(meeting.notePath, paths.base, paths.inboxFolder);
  return linkedFile === meeting.linkedFile && notePath === meeting.notePath ? meeting : {...meeting, linkedFile, notePath};
}

/** Rewrites links in one data file; returns 1 if it changed. Works on the files directly - the cache isn't built yet at this point. */
async function rewriteItem(kind: GtdParaKind, itemPath: string, paths: ResolvedParaPaths, inboxRelative: string): Promise<number> {
  let file = await loadProjectFile(kind, itemPath);
  if (!file.rawContent) return 0;
  let changed = 0;
  const tasks = file.tasks.map(t => rewriteTask(t, paths, inboxRelative));
  if (tasks.some((t, i) => t !== file.tasks[i])) {
    await saveTasks(kind, itemPath, file.rawContent, tasks, file.taskExtraLines);
    changed = 1;
    file = await loadProjectFile(kind, itemPath);
  }
  const meetings = file.meetings.map(m => rewriteMeeting(m, paths, inboxRelative));
  if (meetings.some((m, i) => m !== file.meetings[i])) {
    await saveMeetings(kind, itemPath, file.rawContent, meetings, file.meetingExtraLines);
    changed = 1;
  }
  return changed;
}

/** Op 4: links into the moved Todos/Meetings, in the root Inbox.txt and every live Project/Area file. Archive is not touched (the Integrity Check reports what breaks there). */
async function rewriteLinks(paths: ResolvedParaPaths): Promise<number> {
  const inboxRelative = inboxFolderRelativeToBase(paths.base, paths.inboxFolder);
  let changed = await rewriteItem('inbox', paths.legacyInboxFolder, paths, inboxRelative);
  const roots: Array<{kind: 'project' | 'area'; root: string; dataFile: string}> = [
    {kind: 'project', root: paths.projects, dataFile: PROJECT_FILE_NAME},
    {kind: 'area', root: paths.areas, dataFile: AREA_FILE_NAME},
  ];
  for (const {kind, root, dataFile} of roots) {
    for (const entry of await listFolderEntries(root)) {
      if (!entry.isFolder || entry.path.replace(/\/+$/, '') === paths.inboxFolder) continue;
      const files = await listFolderEntries(entry.path);
      if (!files.some(f => !f.isFolder && f.name === dataFile)) continue;
      changed += await rewriteItem(kind, entry.path, paths, inboxRelative);
    }
  }
  return changed;
}

/**
 * Runs the move if one is due for `paths.base` and hasn't been checked this
 * session. Never throws - a failure is logged and leaves the Inbox at its
 * old place.
 */
export async function migrateInboxIfNeeded(paths: ResolvedParaPaths): Promise<InboxMigrationOutcome> {
  const known = outcomes.get(paths.base);
  if (known) return known;
  const finish = (outcome: InboxMigrationOutcome, notify: boolean): InboxMigrationOutcome => {
    outcomes.set(paths.base, outcome);
    if (notify) {
      const folderName = paths.inboxFolder.slice(paths.inboxFolder.lastIndexOf('/') + 1);
      pendingNotice = inboxMigrationNoticeFor(outcome, inboxFolderRelativeToBase(paths.base, paths.inboxFolder), folderName);
    }
    return outcome;
  };
  try {
    const rootEntries = listed(await listFolderEntries(paths.base));
    if (!rootEntries.some(e => !e.isFolder && e.name === INBOX_FILE_NAME)) {
      return finish({state: 'none'}, false);
    }
    const targetEntries = listed(await listFolderEntries(paths.inboxFolder));
    const plan = planInboxMigration({
      base: paths.base,
      inboxFolder: paths.inboxFolder,
      rootEntries,
      targetEntries,
      rootNoteEntries: await noteEntryNames(paths.base, rootEntries),
      targetNoteEntries: await noteEntryNames(paths.inboxFolder, targetEntries),
    });
    if (plan.state === 'none') return finish({state: 'none'}, false);
    if (plan.state === 'blocked') {
      logWarn('InboxMigration: blocked', plan.reason);
      return finish({state: 'blocked', reason: plan.reason}, true);
    }

    log('InboxMigration: start', `${plan.ops.length} ops`);
    let noteFolders = 0;
    let linksRewritten = 0;
    for (const op of plan.ops) {
      switch (op.kind) {
        case 'ensureFolder':
          await ensureFolderExists(op.path);
          break;
        case 'moveFolderMerge':
          await moveFolderMerge(op.from, op.to);
          noteFolders++;
          break;
        case 'rewriteLinks':
          linksRewritten = await rewriteLinks(paths);
          break;
        case 'moveFile':
          await moveFile(op.from, op.to);
          break;
      }
      log('InboxMigration: done op', op.id);
    }
    log('InboxMigration: done', {noteFolders, filesWithRewrittenLinks: linksRewritten});
    return finish({state: 'moved', noteFolders, linksRewritten}, true);
  } catch (e) {
    logError('InboxMigration: failed', errorMessage(e));
    return finish({state: 'failed'}, true);
  }
}

/** Where the Inbox is right now: the configured folder, or the base root when the move hasn't happened (§3.3). */
export async function effectiveInboxFolderFor(paths: ResolvedParaPaths): Promise<string> {
  try {
    const [rootEntries, targetEntries] = await Promise.all([listFolderEntries(paths.base), listFolderEntries(paths.inboxFolder)]);
    const rootHas = rootEntries.some(e => !e.isFolder && e.name === INBOX_FILE_NAME);
    const targetHas = targetEntries.some(e => !e.isFolder && e.name === INBOX_FILE_NAME);
    return effectiveInboxFolder(paths.base, paths.inboxFolder, rootHas, targetHas);
  } catch (e) {
    logWarn('InboxMigration: could not check the Inbox location', errorMessage(e));
    return paths.inboxFolder;
  }
}

/**
 * The Area folder to keep out of Area listings: the configured Inbox folder,
 * unless it is a real Area the user already had (move blocked by a name
 * clash) - hiding that would hide the user's Area.
 */
export function hiddenAreaFolderFor(paths: ResolvedParaPaths): string | null {
  const outcome = outcomes.get(paths.base);
  if (outcome?.state === 'blocked' && outcome.reason === 'areaNameClash') return null;
  return paths.inboxFolder;
}

export type InboxRenameResult = 'unchanged' | 'moved' | 'notMoved';

/**
 * Settings → Folders save with a changed Inbox folder name
 * (technical-design-inbox-as-area.md §3.5). Moves the folder FIRST, so the
 * saved settings never point at a folder that wasn't moved; throws (and the
 * caller saves nothing) when the name is invalid, the target exists, or the
 * move fails. When Base or Areas change in the same save nothing is moved -
 * like every other folder setting - and 'notMoved' is returned.
 */
export async function renameInboxFolderForSave(stored: GtdParaSettings, next: GtdParaSettings): Promise<InboxRenameResult> {
  const problem = validateInboxFolderName(next.inboxFolder);
  if (problem) throw new Error(problem);
  const before = resolvePaths(stored);
  const after = resolvePaths(next);
  if (before.inboxFolder === after.inboxFolder) return 'unchanged';
  // A move that was blocked under the old name (e.g. an Area with that name) gets another try on the next rebuild.
  outcomes.delete(before.base);
  outcomes.delete(after.base);
  if (before.base !== after.base || before.areas !== after.areas) {
    log('InboxMigration: inbox folder renamed together with base/areas - nothing moved');
    return 'notMoved';
  }
  const name = after.inboxFolder.slice(after.inboxFolder.lastIndexOf('/') + 1);
  if (await folderExists(after.inboxFolder)) throw new Error(`A folder named "${name}" already exists in Areas.`);
  if (!(await folderExists(before.inboxFolder))) return 'unchanged';
  await moveFolder(before.inboxFolder, after.inboxFolder);
  log('InboxMigration: inbox folder renamed');
  return 'moved';
}
