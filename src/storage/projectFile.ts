/**
 * Reads and writes a single Project/Area's data file (project.txt/area.txt),
 * combining the pure parsing in domain/markdown.ts with the native text I/O
 * in supernote/fileSystem.ts. Each save re-serializes only the span it
 * touched (Tasks or Meetings), per domain/markdown.ts's safe-partial-write
 * behavior - saving a task never rewrites the Meetings section or anything
 * else in the file, and vice versa.
 *
 * Like ItemDetail's own file listing, this is load-once-per-screen, not
 * kept in the cross-project cache (design-overview.md §2.3, which serves
 * cross-project views like Daily) - a mid-session
 * external edit to the file is the same narrow, accepted risk the design
 * doc calls out for write-through in general.
 */
import {
  ensureSkeleton,
  FrontMatterFields,
  parseFrontMatter,
  parseMarksSpan,
  parseMeetingsSpan,
  parseMonthlyGoalsSpan,
  parseScopeSpan,
  parseTasksSpan,
  parseWeeklyGoalsSpan,
  writeFrontMatterIntoContent,
  writeMeetingsIntoContent,
  writeMonthlyGoalsIntoContent,
  writeScopeIntoContent,
  writeTasksIntoContent,
  writeWeeklyGoalsIntoContent,
} from '../domain/markdown';
import {CounterpartLine, parseThreadsSpan, writeThreadsIntoContent} from '../domain/threadsSection';
import {
  AREA_FILE_NAME,
  GtdParaKind,
  INBOX_FILE_NAME,
  ItemStatus,
  Mark,
  Meeting,
  MonthlyGoal,
  PROJECT_FILE_NAME,
  Task,
  WeeklyGoal,
} from '../domain/types';
import {readTextFile, writeTextFile} from '../supernote/fileSystem';
import {log} from '../utils/log';
import {perfEnd, perfStart} from '../utils/perf';

/** For 'inbox', callers pass the Inbox folder as itemPath - the cache's `paths.inboxFolder` (docs/dev/history/technical-design-inbox-as-area.md), which is the base root only while an old Inbox hasn't been moved yet. */
export function dataFileName(kind: GtdParaKind): string {
  if (kind === 'area') return AREA_FILE_NAME;
  if (kind === 'inbox') return INBOX_FILE_NAME;
  return PROJECT_FILE_NAME;
}

export function dataFilePath(kind: GtdParaKind, itemPath: string): string {
  return `${itemPath.replace(/\/+$/, '')}/${dataFileName(kind)}`;
}

export interface ProjectFileState {
  /** The file's full text, or '' if it doesn't exist yet. Feed this back into saveTasks/saveMeetings/saveFrontMatter. */
  rawContent: string;
  tasks: Task[];
  meetings: Meeting[];
  taskExtraLines: string[];
  meetingExtraLines: string[];
  /** From the `## Scope` span (docs/dev/history/technical-design-item-scope.md) - a single free-text value, '' if never set. Scaffolded (empty) into every new Project/Area's file by `ensureSkeleton`, so it's usually present even before a scope is ever typed in. */
  scope: string;
  /** From the `## Weekly Goals` span (docs/dev/history/technical-design-weekly-goals.md) - one entry per ISO week that ever had a goal set, empty for most items most of the time. */
  weeklyGoals: WeeklyGoal[];
  weeklyGoalsExtraLines: string[];
  /** From the `## Monthly Goals` span (docs/dev/history/technical-design-monthly-view.md §2.2) - one entry per month that ever had a goal set. */
  monthlyGoals: MonthlyGoal[];
  monthlyGoalsExtraLines: string[];
  /** From the `## Marks` span (docs/dev/history/technical-design-lasso-0.8.md §3.1) - open "Mark for later" lines; empty for most files. Written only through storage/markStore.ts. */
  marks: Mark[];
  marksExtraLines: string[];
  /** From the `## Threads` span (docs/dev/history/technical-design-tending-threads.md §3.9.1) - the confirmed counterparts of the scope this file owns; empty for most files and always for the Inbox. Written only through storage/counterparts.ts. */
  threads: CounterpartLine[];
  threadsExtraLines: string[];
  /** From the frontmatter block's status/dailyFocus/weeklyFocus/monthlyFocus/defaultResourceFolder/area fields - see domain/markdown.ts's parseFrontMatter. */
  status: ItemStatus;
  dailyFocus: boolean;
  weeklyFocus: boolean;
  monthlyFocus: boolean;
  defaultResourceFolder: string | null;
  /** The Area this Project supports, by bare folder name (technical-design-project-area-assignment.md §2), or null - Projects only, always null for Areas/Inbox. */
  area: string | null;
  /** This item's short abbreviation (docs/dev/history/technical-design-project-area-abbreviations.md), or null if never set - Projects/Areas only. */
  abbrev: string | null;
  frontMatterExtraLines: string[];
}

/** Loads and parses a Project/Area's data file. A missing file is not an error - it just parses as empty. */
export async function loadProjectFile(
  kind: GtdParaKind,
  itemPath: string,
): Promise<ProjectFileState> {
  const path = dataFilePath(kind, itemPath);
  log('loadProjectFile: start', path);
  const perfTotal = perfStart();
  const content = await readTextFile(path);
  const rawContent = content ?? '';
  const perfParse = perfStart();
  const state = parseProjectFileContent(rawContent);
  // Perf trace (docs/dev/history/technical-design-perf-tracing.md): parse vs. whole load
  // (whole = permission check + native read + parse).
  const perfMeta = {kind, path, chars: rawContent.length, tasks: state.tasks.length, meetings: state.meetings.length};
  perfEnd('parse:projectFile', perfParse, perfMeta);
  perfEnd('load:projectFile', perfTotal, perfMeta);
  log('loadProjectFile: done', path, `${state.tasks.length} tasks`, `${state.meetings.length} meetings`);
  return state;
}

/**
 * Parses a data file's full text into its state - the pure half of
 * loadProjectFile, also used when a file was written outside the cache's
 * own save paths (storage/markStore.ts re-parses after adding a mark line).
 */
export function parseProjectFileContent(rawContent: string): ProjectFileState {
  const {tasks, extraLines: taskExtraLines} = parseTasksSpan(rawContent);
  const {meetings, extraLines: meetingExtraLines} = parseMeetingsSpan(rawContent);
  const scope = parseScopeSpan(rawContent);
  const {goals: weeklyGoals, extraLines: weeklyGoalsExtraLines} = parseWeeklyGoalsSpan(rawContent);
  const {goals: monthlyGoals, extraLines: monthlyGoalsExtraLines} = parseMonthlyGoalsSpan(rawContent);
  const {marks, extraLines: marksExtraLines} = parseMarksSpan(rawContent);
  const {threads, extraLines: threadsExtraLines} = parseThreadsSpan(rawContent);
  const {
    status,
    dailyFocus,
    weeklyFocus,
    monthlyFocus,
    defaultResourceFolder,
    area,
    abbrev,
    extraLines: frontMatterExtraLines,
  } = parseFrontMatter(rawContent);
  return {
    rawContent,
    tasks,
    meetings,
    taskExtraLines,
    meetingExtraLines,
    scope,
    weeklyGoals,
    weeklyGoalsExtraLines,
    monthlyGoals,
    monthlyGoalsExtraLines,
    marks,
    marksExtraLines,
    threads,
    threadsExtraLines,
    status,
    dailyFocus,
    weeklyFocus,
    monthlyFocus,
    defaultResourceFolder,
    area,
    abbrev,
    frontMatterExtraLines,
  };
}

/**
 * Saves the Tasks span. `rawContent` should be the state's current
 * rawContent (from loadProjectFile, or the previous save's return value) -
 * scaffolds a fresh file skeleton first if this is the very first todo or
 * meeting ever added to this Project/Area.
 */
export async function saveTasks(
  kind: GtdParaKind,
  itemPath: string,
  rawContent: string,
  tasks: Task[],
  extraLines: string[] = [],
): Promise<string> {
  const base = ensureSkeleton(rawContent, kind);
  const next = writeTasksIntoContent(base, tasks, extraLines);
  await writeTextFile(dataFilePath(kind, itemPath), next);
  return next;
}

/** Saves the Meetings span - see saveTasks for the shared rawContent/scaffolding behavior. */
export async function saveMeetings(
  kind: GtdParaKind,
  itemPath: string,
  rawContent: string,
  meetings: Meeting[],
  extraLines: string[] = [],
): Promise<string> {
  const base = ensureSkeleton(rawContent, kind);
  const next = writeMeetingsIntoContent(base, meetings, extraLines);
  await writeTextFile(dataFilePath(kind, itemPath), next);
  return next;
}

/** Saves the Threads span (docs/dev/history/technical-design-tending-threads.md §3.9.1) - see saveTasks for the shared rawContent/scaffolding behavior. */
export async function saveThreads(
  kind: GtdParaKind,
  itemPath: string,
  rawContent: string,
  threads: CounterpartLine[],
  extraLines: string[] = [],
): Promise<string> {
  const base = ensureSkeleton(rawContent, kind);
  const next = writeThreadsIntoContent(base, threads, extraLines);
  await writeTextFile(dataFilePath(kind, itemPath), next);
  return next;
}

/** Saves the Scope span - see saveTasks for the shared rawContent/scaffolding behavior. */
export async function saveScope(
  kind: GtdParaKind,
  itemPath: string,
  rawContent: string,
  scope: string,
): Promise<string> {
  const base = ensureSkeleton(rawContent, kind);
  const next = writeScopeIntoContent(base, scope);
  await writeTextFile(dataFilePath(kind, itemPath), next);
  return next;
}

/** Saves the Weekly Goals span - see saveTasks for the shared rawContent/scaffolding behavior. */
export async function saveWeeklyGoals(
  kind: GtdParaKind,
  itemPath: string,
  rawContent: string,
  goals: WeeklyGoal[],
  extraLines: string[] = [],
): Promise<string> {
  const base = ensureSkeleton(rawContent, kind);
  const next = writeWeeklyGoalsIntoContent(base, goals, extraLines);
  await writeTextFile(dataFilePath(kind, itemPath), next);
  return next;
}

/** Saves the Monthly Goals span (docs/dev/history/technical-design-monthly-view.md §2.2) - see saveTasks for the shared rawContent/scaffolding behavior. */
export async function saveMonthlyGoals(
  kind: GtdParaKind,
  itemPath: string,
  rawContent: string,
  goals: MonthlyGoal[],
  extraLines: string[] = [],
): Promise<string> {
  const base = ensureSkeleton(rawContent, kind);
  const next = writeMonthlyGoalsIntoContent(base, goals, extraLines);
  await writeTextFile(dataFilePath(kind, itemPath), next);
  return next;
}

/**
 * Saves the whole frontmatter block from one `FrontMatterFields` object
 * (docs/dev/history/technical-design-monthly-view.md §2.1) - see saveTasks for the shared
 * rawContent/scaffolding behavior. Callers build `fm` as
 * `{...frontMatterOf(item), <the field they change>}` (storage/dataCache.ts),
 * so every field they don't touch is carried through unchanged by
 * construction - replacing the old positional signature whose defaulted
 * `area`/`abbrev` parameters silently cleared those values when omitted.
 */
export async function saveFrontMatter(
  kind: GtdParaKind,
  itemPath: string,
  rawContent: string,
  fm: FrontMatterFields,
): Promise<string> {
  const base = ensureSkeleton(rawContent, kind);
  const next = writeFrontMatterIntoContent(base, fm);
  await writeTextFile(dataFilePath(kind, itemPath), next);
  return next;
}
