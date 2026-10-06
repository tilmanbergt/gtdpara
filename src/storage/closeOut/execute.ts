/**
 * Runs the archive step of a close-out (docs/dev/technical-design-project-close-
 * out.md §7): the ordered ops from domain/closeOut/archiveOps.ts, one at a
 * time, journaled in the plan so an interrupted run can simply be started
 * again - every op checks whether it is already done and skips if so.
 * Nothing is ever rolled back or deleted; the first failure stops the run
 * and the result says exactly which ops completed.
 */
import {ArchiveOp, planArchiveOps} from '../../domain/closeOut/archiveOps';
import {CloseOutPlan, isJournalDone, parsePlan, withJournal, writePlanIntoContent} from '../../domain/closeOut/plan';
import {ensureSkeleton, writeFrontMatterIntoContent} from '../../domain/markdown';
import {isoDate, writeLifecycleDate} from '../../domain/lifecycleDates';
import {GtdParaSettings, ResolvedParaPaths, resolvePaths} from '../../domain/settings';
import {fileExists, folderExists, moveFile, moveFolder, writeTextFile} from '../../supernote/fileSystem';
import {archiveTargetsFor} from '../archive';
import {findCachedItem, frontMatterOf, getCachedData, reloadCachedInbox, removeCachedItem, resolveLivePaths, updateItemMeetings, updateItemTasks} from '../dataCache';
import {stripPageAnchor} from '../../domain/sharedNotePages';
import {toLinkedFile} from '../linkedFiles';
import {dataFilePath, loadProjectFile, saveMeetings, saveTasks} from '../projectFile';
import {savePlan} from './planStore';
import {moveMarksToInbox} from '../markStore';
import {log, logError} from '../../utils/log';
import {errorMessage} from '../../utils/errorMessage';

export type OpState = 'pending' | 'running' | 'done' | 'skipped' | 'failed';

export interface OpStatus {
  op: ArchiveOp;
  state: OpState;
  error?: string;
}

export interface ArchiveRunResult {
  ok: boolean;
  steps: OpStatus[];
  archivedFolder: string;
}

function nowStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${isoDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Ops for the project at `projectPath` as they would run now - also what step 5 displays. */
export function archiveOpsFor(projectPath: string, settings: GtdParaSettings): ArchiveOp[] {
  const item = findCachedItem(projectPath);
  if (!item) throw new Error('This project is no longer in the lists - Settings → Advanced → Reload all files.');
  const paths = resolvePaths(settings);
  const {plan} = parsePlan(item.rawContent);
  const targets = archiveTargetsFor(item, settings);
  return planArchiveOps({
    mode: plan.mode,
    projectPath,
    plan,
    targetFolder: targets.folder,
    targetPdf: targets.pdf,
    areaFolder: item.area ? `${paths.areas}/${item.area}` : null,
    resourcesRoot: paths.resources,
    toLinked: abs => toLinkedFile(paths, abs),
    openMarkCount: item.marks.length,
  });
}

/**
 * Rewrites every todo/meeting linkedFile equal to `from` - in every cached
 * Project/Area and the Inbox. A lasso source link to a page (`<file>#page=<n>`,
 * 0.8) counts as a link to that file and keeps its page.
 */
async function rewriteLinks(from: string, to: string, paths: ResolvedParaPaths): Promise<number> {
  let changed = 0;
  const hits = (linked: string) => stripPageAnchor(linked) === from;
  const moved = (linked: string) => (linked === from ? to : `${to}${linked.slice(stripPageAnchor(linked).length)}`);
  for (const listed of getCachedData()?.items ?? []) {
    let item = findCachedItem(listed.path);
    if (!item) continue;
    if (item.tasks.some(t => hits(t.linkedFile))) {
      const tasks = item.tasks.map(t => (hits(t.linkedFile) ? {...t, linkedFile: moved(t.linkedFile)} : t));
      const raw = await saveTasks(item.kind, item.path, item.rawContent, tasks, item.taskExtraLines);
      updateItemTasks(item.path, raw, tasks, item.taskExtraLines);
      changed++;
      item = findCachedItem(listed.path);
      if (!item) continue;
    }
    if (item.meetings.some(m => hits(m.linkedFile))) {
      const meetings = item.meetings.map(m => (hits(m.linkedFile) ? {...m, linkedFile: moved(m.linkedFile)} : m));
      const raw = await saveMeetings(item.kind, item.path, item.rawContent, meetings, item.meetingExtraLines);
      updateItemMeetings(item.path, raw, meetings, item.meetingExtraLines);
      changed++;
    }
  }
  let inbox = await loadProjectFile('inbox', paths.inboxFolder);
  if (inbox.tasks.some(t => hits(t.linkedFile))) {
    const tasks = inbox.tasks.map(t => (hits(t.linkedFile) ? {...t, linkedFile: moved(t.linkedFile)} : t));
    await saveTasks('inbox', paths.inboxFolder, inbox.rawContent, tasks, inbox.taskExtraLines);
    changed++;
    inbox = await loadProjectFile('inbox', paths.inboxFolder);
  }
  if (inbox.meetings.some(m => hits(m.linkedFile))) {
    const meetings = inbox.meetings.map(m => (hits(m.linkedFile) ? {...m, linkedFile: moved(m.linkedFile)} : m));
    await saveMeetings('inbox', paths.inboxFolder, inbox.rawContent, meetings, inbox.meetingExtraLines);
    changed++;
  }
  if (changed > 0) await reloadCachedInbox(paths.inboxFolder);
  return changed;
}

/**
 * Checks, before anything moves, that no op would overwrite something:
 * returns the problems (empty = safe). A source that is already gone with its
 * destination present is fine - that op was done in an earlier run.
 */
async function preflight(ops: ArchiveOp[]): Promise<string[]> {
  const problems: string[] = [];
  for (const op of ops) {
    if (op.kind === 'moveOutcome' || op.kind === 'movePdf') {
      if ((await fileExists(op.from)) && (await fileExists(op.to))) problems.push(`Already exists: ${op.to}`);
      if (!(await fileExists(op.from)) && !(await fileExists(op.to))) problems.push(`Missing: ${op.from}`);
    } else if (op.kind === 'moveFolder') {
      if ((await folderExists(op.from)) && (await folderExists(op.to))) problems.push(`Already exists: ${op.to}`);
    }
  }
  return problems;
}

/**
 * Runs the archive. `onUpdate` gets the full status list after every change
 * (for the step-5 result view). Blockers are the caller's to check first -
 * this only guards against overwriting files.
 */
export async function runCloseOutArchive(
  projectPath: string,
  settings: GtdParaSettings,
  onUpdate?: (steps: OpStatus[]) => void,
): Promise<ArchiveRunResult> {
  const item = findCachedItem(projectPath);
  if (!item) throw new Error('This project is no longer in the lists - Settings → Advanced → Reload all files.');
  const paths = await resolveLivePaths(settings);
  const ops = archiveOpsFor(projectPath, settings);
  const folderOp = ops.find((o): o is Extract<ArchiveOp, {kind: 'moveFolder'}> => o.kind === 'moveFolder');
  if (!folderOp) throw new Error('Internal error: no folder move planned.');
  const targetFolder = folderOp.to;
  let plan: CloseOutPlan = parsePlan(item.rawContent).plan;
  const steps: OpStatus[] = ops.map(op => ({op, state: isJournalDone(plan, op.id) ? 'skipped' : 'pending'}));
  const report = () => onUpdate?.(steps.map(s => ({...s})));
  report();

  const problems = await preflight(ops.filter(op => !isJournalDone(plan, op.id)));
  if (problems.length > 0) throw new Error(`Nothing was moved:\n${problems.join('\n')}`);

  let folderMoved = false;
  const journal = async (op: ArchiveOp, state: 'started' | 'done') => {
    plan = withJournal(plan, {op: op.id, state, at: nowStamp()});
    if (!folderMoved) await savePlan(projectPath, plan);
  };

  for (const step of steps) {
    if (step.state === 'skipped') continue;
    const {op} = step;
    step.state = 'running';
    report();
    try {
      if (op.kind !== 'stampArchived') await journal(op, 'started');
      switch (op.kind) {
        case 'moveOutcome':
        case 'movePdf':
          if ((await fileExists(op.from)) || !(await fileExists(op.to))) await moveFile(op.from, op.to);
          break;
        case 'rewriteLinks':
          log('closeOut: rewrote links', op.relPath, await rewriteLinks(op.fromLinked, op.toLinked, paths));
          break;
        case 'moveMarks': {
          const {moved} = await moveMarksToInbox({kind: 'project', folder: op.from}, op.to, paths.inboxFolder);
          log('closeOut: marks moved to the Inbox', moved);
          break;
        }
        case 'moveFolder':
          if ((await folderExists(op.from)) || !(await folderExists(op.to))) await moveFolder(op.from, op.to);
          folderMoved = true;
          break;
        case 'stampArchived': {
          // One write at the new location: status, archivedAt, cleared focus, and the final journal.
          const fresh = findCachedItem(projectPath) ?? item;
          const fm = {
            ...frontMatterOf(fresh),
            extraLines: writeLifecycleDate(fresh.frontMatterExtraLines, 'archivedAt', isoDate(new Date())),
            status: 'archived' as const,
            dailyFocus: false,
            weeklyFocus: false,
            monthlyFocus: false,
          };
          const finalPlan = withJournal(withJournal(plan, {op: 'move-folder', state: 'done', at: nowStamp()}), {op: op.id, state: 'done', at: nowStamp()});
          const content = writePlanIntoContent(writeFrontMatterIntoContent(ensureSkeleton(fresh.rawContent, 'project'), fm), finalPlan);
          await writeTextFile(dataFilePath('project', op.folder), content);
          plan = finalPlan;
          removeCachedItem(projectPath);
          break;
        }
      }
      if (op.kind !== 'stampArchived' && op.kind !== 'moveFolder') await journal(op, 'done');
      step.state = 'done';
      report();
    } catch (e) {
      step.state = 'failed';
      step.error = errorMessage(e);
      logError('closeOut: op failed', op.id, step.error);
      report();
      return {ok: false, steps, archivedFolder: targetFolder};
    }
  }
  log('closeOut: archived', projectPath, '->', targetFolder);
  return {ok: true, steps, archivedFolder: targetFolder};
}
