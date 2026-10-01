/**
 * Everything the close-out wizard shows, loaded in one place
 * (docs/dev/technical-design-project-close-out.md §8.2): the cached project,
 * its plan, the folder scan, the grouped contents, the readiness findings
 * and the archive targets. The wizard reloads this after every action, so
 * each screen always reflects the files and the cache as they are now.
 *
 * Two levels, because the scan is the only slow part (one host call per
 * note): `loadCloseOutContext` scans; `refreshCloseOutContext` re-derives
 * everything else from the cache, the plan and an existing scan.
 */
import {buildContents, ContentsModel, ProjectScan} from '../../domain/closeOut/inventory';
import {CloseOutMode, CloseOutPlan, OutcomeDest, parsePlan} from '../../domain/closeOut/plan';
import {evaluateReadiness, Finding, OtherItemLinks} from '../../domain/closeOut/readiness';
import {outcomeFolder} from '../../domain/closeOut/archiveOps';
import {isoDate, readLifecycleDate} from '../../domain/lifecycleDates';
import {monthKeyOf} from '../../domain/period';
import {GtdParaSettings, ResolvedParaPaths} from '../../domain/settings';
import {isoWeekKey} from '../../domain/weekDate';
import {fileExists, folderExists, getRememberedLaunchNotePath} from '../../supernote/fileSystem';
import {archiveTargetsFor} from '../archive';
import {CachedItem, findCachedItem, getCachedData, resolveLivePaths} from '../dataCache';
import {toLinkedFile} from '../linkedFiles';
import {loadProjectFile} from '../projectFile';
import {scanProject} from './scan';

export interface CloseOutContext {
  item: CachedItem;
  settings: GtdParaSettings;
  paths: ResolvedParaPaths;
  mode: CloseOutMode;
  plan: CloseOutPlan;
  planFound: boolean;
  scan: ProjectScan;
  contents: ContentsModel;
  findings: Finding[];
  doneAt: string | null;
  targets: {folder: string; pdf: string | null};
  /** Absolute folder of the project's Area, or null. */
  areaFolder: string | null;
  /** Base-root-relative display of an absolute path. */
  display: (absPath: string) => string;
  /** Display of an outcome destination folder. */
  outcomeLabel: (dest: OutcomeDest) => string;
  /** Absolute path of the close-out PDF while it still lives in the project folder. */
  workingPdfPath: string;
}

function requireItem(projectPath: string): CachedItem {
  const item = findCachedItem(projectPath);
  if (!item) throw new Error('This project is no longer in the lists - tap 🔄 to refresh.');
  return item;
}

export async function loadCloseOutContext(
  projectPath: string,
  settings: GtdParaSettings,
  mode: CloseOutMode,
  onProgress?: (label: string) => void,
): Promise<CloseOutContext> {
  const item = requireItem(projectPath);
  const paths = await resolveLivePaths(settings);
  const scan = await scanProject(item, paths, onProgress);
  return refreshCloseOutContext({scan, settings, mode, projectPath});
}

export async function refreshCloseOutContext(args: {
  scan: ProjectScan;
  settings: GtdParaSettings;
  mode: CloseOutMode;
  projectPath: string;
}): Promise<CloseOutContext> {
  const {scan, settings, projectPath} = args;
  const item = requireItem(projectPath);
  const paths = await resolveLivePaths(settings);
  const {plan, found} = parsePlan(item.rawContent);
  const mode = found ? plan.mode : args.mode;
  const now = new Date();
  const doneAt = readLifecycleDate(item.frontMatterExtraLines, 'doneAt');
  const targetsFull = archiveTargetsFor(item, settings, now);
  const targets = {folder: targetsFull.folder, pdf: mode === 'full' ? targetsFull.pdf : null};
  const areaFolder = item.area ? `${paths.areas}/${item.area}` : null;
  const display = (abs: string) => {
    const prefix = `${paths.base.replace(/\/+$/, '')}/`;
    return abs.startsWith(prefix) ? abs.slice(prefix.length) : abs;
  };
  const outcomeLabel = (dest: OutcomeDest) => {
    const folder = outcomeFolder(dest, areaFolder, paths.resources);
    return folder ? display(folder) : 'Area (none assigned)';
  };

  const contents = buildContents({
    projectPath,
    tasks: item.tasks,
    meetings: item.meetings,
    scan,
    plan,
    ownPdfName: `${item.name}.pdf`,
  });

  const others: OtherItemLinks[] = (getCachedData()?.items ?? [])
    .filter(i => i.path !== item.path)
    .map(i => ({name: i.name, kind: i.kind, tasks: i.tasks, meetings: i.meetings}));
  try {
    const inbox = await loadProjectFile('inbox', paths.inboxFolder);
    others.push({name: 'Inbox', kind: 'inbox', tasks: inbox.tasks, meetings: inbox.meetings});
  } catch {
    // Inbox unreadable: its links just aren't checked.
  }

  const findings = evaluateReadiness({
    mode,
    projectPath,
    tasks: item.tasks,
    meetings: item.meetings,
    weeklyGoalKeys: item.weeklyGoals.map(g => g.weekKey),
    monthlyGoalKeys: item.monthlyGoals.map(g => g.monthKey),
    currentWeekKey: isoWeekKey(now),
    currentMonthKey: monthKeyOf(now),
    today: isoDate(now),
    now,
    noteDefinitions: settings.noteCreationDefinitions,
    others,
    projectLinkedPrefix: toLinkedFile(paths, projectPath),
    plan,
    targetFolderExists: await folderExists(targets.folder),
    targetPdfExists: targets.pdf ? await fileExists(targets.pdf) : null,
    targetFolderLabel: display(targets.folder),
    targetPdfLabel: targets.pdf ? display(targets.pdf) : null,
    unreadableNoteNames: contents.unreadable.map(e => e.title),
    launchPath: getRememberedLaunchNotePath()?.path ?? null,
  });

  return {
    item,
    settings,
    paths,
    mode,
    plan,
    planFound: found,
    scan,
    contents,
    findings,
    doneAt,
    targets,
    areaFolder,
    display,
    outcomeLabel,
    workingPdfPath: `${projectPath.replace(/\/+$/, '')}/${item.name}.pdf`,
  };
}
