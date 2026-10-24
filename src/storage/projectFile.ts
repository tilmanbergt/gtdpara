/**
 * Reads and writes a single Project/Area's data file (project.txt/area.txt),
 * combining the pure parsing in domain/markdown.ts with the native text I/O
 * in supernote/fileSystem.ts. Each save re-serializes only the span it
 * touched (Tasks or Meetings), per domain/markdown.ts's safe-partial-write
 * behavior - saving a task never rewrites the Meetings section or anything
 * else in the file, and vice versa.
 *
 * Every save goes through storage/dataFileWrite.ts, which re-reads the file
 * first: an edit made outside gtdpara since `rawContent` was read is kept
 * when it touched other parts, and stops the save when it touched the same.
 */
import {
  DATA_FILE_HEADINGS,
  FrontMatterFields,
  FRONT_MATTER_PART,
  normalizeLineEndings,
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
import {CounterpartLine, parseThreadsSpan, THREADS_HEADING, writeThreadsIntoContent} from '../domain/threadsSection';
import {LoopLine, LOOPS_HEADING, parseLoopsSpan, writeLoopsIntoContent} from '../domain/loopsSection';
import {Agreement, parseAgreementsSpan} from '../domain/agreements';
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
import {readTextFile} from '../supernote/fileSystem';
import {writeDataFile} from './dataFileWrite';
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
  /** From the `## Loops` span (docs/dev/history/technical-design-loops.md §3.2) - the loops this file owns; empty for most files and always for the Inbox. Written only through storage/loops.ts. */
  loops: LoopLine[];
  loopsExtraLines: string[];
  /** From the `## Agreements` span (docs/dev/history/technical-design-meetings-0.21.md §2.1) - the agreements this file holds; empty for most files and always for the Inbox. Written only through storage/agreements.ts. */
  agreements: Agreement[];
  agreementsExtraLines: string[];
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
  const rawContent = normalizeLineEndings(content ?? '');
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
  const {loops, extraLines: loopsExtraLines} = parseLoopsSpan(rawContent);
  const {agreements, extraLines: agreementsExtraLines} = parseAgreementsSpan(rawContent);
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
    loops,
    loopsExtraLines,
    agreements,
    agreementsExtraLines,
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
 * meeting ever added to this Project/Area. Resolves the content now in the
 * file, which includes an outside edit to other parts (storage/dataFileWrite.ts).
 */
export async function saveTasks(
  kind: GtdParaKind,
  itemPath: string,
  rawContent: string,
  tasks: Task[],
  extraLines: string[] = [],
): Promise<string> {
  return writeDataFile(kind, itemPath, dataFilePath(kind, itemPath), rawContent, {
    parts: [DATA_FILE_HEADINGS.tasks],
    apply: content => writeTasksIntoContent(content, tasks, extraLines),
  });
}

/** Saves the Meetings span - see saveTasks for the shared rawContent/scaffolding behavior. */
export async function saveMeetings(
  kind: GtdParaKind,
  itemPath: string,
  rawContent: string,
  meetings: Meeting[],
  extraLines: string[] = [],
): Promise<string> {
  return writeDataFile(kind, itemPath, dataFilePath(kind, itemPath), rawContent, {
    parts: [DATA_FILE_HEADINGS.meetings],
    apply: content => writeMeetingsIntoContent(content, meetings, extraLines),
  });
}

/** Saves the Threads span (docs/dev/history/technical-design-tending-threads.md §3.9.1) - see saveTasks for the shared rawContent/scaffolding behavior. */
export async function saveThreads(
  kind: GtdParaKind,
  itemPath: string,
  rawContent: string,
  threads: CounterpartLine[],
  extraLines: string[] = [],
): Promise<string> {
  return writeDataFile(kind, itemPath, dataFilePath(kind, itemPath), rawContent, {
    parts: [THREADS_HEADING],
    apply: content => writeThreadsIntoContent(content, threads, extraLines),
  });
}

/** Saves the Loops span (docs/dev/history/technical-design-loops.md §3.2) - see saveTasks for the shared rawContent/scaffolding behavior. */
export async function saveLoops(
  kind: GtdParaKind,
  itemPath: string,
  rawContent: string,
  loops: LoopLine[],
  extraLines: string[] = [],
): Promise<string> {
  return writeDataFile(kind, itemPath, dataFilePath(kind, itemPath), rawContent, {
    parts: [LOOPS_HEADING],
    apply: content => writeLoopsIntoContent(content, loops, extraLines),
  });
}

/** Saves the Scope span - see saveTasks for the shared rawContent/scaffolding behavior. */
export async function saveScope(
  kind: GtdParaKind,
  itemPath: string,
  rawContent: string,
  scope: string,
): Promise<string> {
  return writeDataFile(kind, itemPath, dataFilePath(kind, itemPath), rawContent, {
    parts: [DATA_FILE_HEADINGS.scope],
    apply: content => writeScopeIntoContent(content, scope),
  });
}

/** Saves the Weekly Goals span - see saveTasks for the shared rawContent/scaffolding behavior. */
export async function saveWeeklyGoals(
  kind: GtdParaKind,
  itemPath: string,
  rawContent: string,
  goals: WeeklyGoal[],
  extraLines: string[] = [],
): Promise<string> {
  return writeDataFile(kind, itemPath, dataFilePath(kind, itemPath), rawContent, {
    parts: [DATA_FILE_HEADINGS.weeklyGoals],
    apply: content => writeWeeklyGoalsIntoContent(content, goals, extraLines),
  });
}

/** Saves the Monthly Goals span (docs/dev/history/technical-design-monthly-view.md §2.2) - see saveTasks for the shared rawContent/scaffolding behavior. */
export async function saveMonthlyGoals(
  kind: GtdParaKind,
  itemPath: string,
  rawContent: string,
  goals: MonthlyGoal[],
  extraLines: string[] = [],
): Promise<string> {
  return writeDataFile(kind, itemPath, dataFilePath(kind, itemPath), rawContent, {
    parts: [DATA_FILE_HEADINGS.monthlyGoals],
    apply: content => writeMonthlyGoalsIntoContent(content, goals, extraLines),
  });
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
  return writeDataFile(kind, itemPath, dataFilePath(kind, itemPath), rawContent, {
    parts: [FRONT_MATTER_PART],
    apply: content => writeFrontMatterIntoContent(content, fm),
  });
}
