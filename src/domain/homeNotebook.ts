/**
 * The home notebook of a Project or Area
 * (docs/dev/history/technical-design-home-notebooks.md §3.1): the Default
 * setup's notebook rendered for that item. Implicit - nothing stores a link -
 * so its name is rendered here, once, for every place that needs it:
 * storage/noteTargets.ts places a todo's or meeting's Default notebook page
 * with the same function. Pure: no React Native, no SDK, no I/O.
 */
import {sanitizeFileNameComponent} from './fileName';
import {PieceRenderContext} from './pageLayout';
import {periodLabel} from './period';
import {normalizeNotePath} from './returnContext';
import {renderSharedFileName} from './sharedNotePages';
import {MonthlyGoal, WeeklyGoal} from './types';

/** The Default notebook's file name when its name template renders empty. */
export const HOME_NOTEBOOK_FALLBACK = 'Notes';

/** Page-1 keyword of a home notebook: its Home page. */
export const HOME_PAGE_KEYWORD = 'home';

/** How many years back the year list looks for earlier files. */
export const HOME_NOTEBOOK_YEARS_BACK = 10;

export interface HomeNotebookNameInput {
  /** The Default notebook's name template (`noteSetupDefaults.notebook.name`). */
  template: string;
  /** The Project's or Area's folder name (`{name}`). */
  itemName: string;
  /** Its abbreviation (`{abbr}`), `''` without one. */
  itemAbbrev: string;
  /** `YYYY-MM-DD` for the date placeholders. */
  date: string;
}

/**
 * The home notebook's base name (no folder, no ".note"): the template with
 * `{tag}`/`{subtag}` empty (the Default matches no setup tag), falling back to
 * "Notes", made safe as a file name.
 */
export function homeNotebookName(input: HomeNotebookNameInput): string {
  return sanitizeFileNameComponent(
    renderSharedFileName({
      template: input.template.trim() ? input.template : HOME_NOTEBOOK_FALLBACK,
      fallbackName: HOME_NOTEBOOK_FALLBACK,
      tag: '',
      subtag: '',
      itemName: input.itemName,
      itemAbbrev: input.itemAbbrev,
      date: input.date,
    }),
  );
}

/**
 * Whether the template makes one file per year: `{year}` and none of
 * `{quarter}`/`{month}`/`{day}`. Only then are there earlier years to offer.
 */
export function hasYear(template: string): boolean {
  return /\{year\}/i.test(template) && !/\{(quarter|month|day)\}/i.test(template);
}

export interface HomeNotebookYear {
  year: number;
  /** Base name, no ".note". */
  fileName: string;
  exists: boolean;
}

/**
 * The years of a home notebook, current first: this year (whether its file
 * exists or not) and every earlier year, up to `HOME_NOTEBOOK_YEARS_BACK`
 * back, whose file exists. `existingFileNames` are the file names in the
 * notebook's folder, with ".note". Without `hasYear` there is one entry, the
 * name rendered for `input.date`.
 */
export function homeNotebookYears(
  input: HomeNotebookNameInput,
  existingFileNames: readonly string[],
  thisYear: number,
): HomeNotebookYear[] {
  const existing = new Set(existingFileNames);
  const exists = (fileName: string) => existing.has(`${fileName}.note`);
  if (!hasYear(input.template)) {
    const fileName = homeNotebookName(input);
    return [{year: thisYear, fileName, exists: exists(fileName)}];
  }
  const years: HomeNotebookYear[] = [];
  for (let year = thisYear; year >= thisYear - HOME_NOTEBOOK_YEARS_BACK; year--) {
    const fileName = homeNotebookName({...input, date: `${year}-01-01`});
    const found = exists(fileName);
    if (year === thisYear || found) years.push({year, fileName, exists: found});
  }
  return years;
}

/** The parts of a home notebook a tap needs. */
export interface HomeNotebookTapInput {
  absolutePath: string;
  exists: boolean;
  /** Current first, as `homeNotebookYears` lists them, with absolute paths. */
  years: ReadonlyArray<{year: number; absolutePath: string; exists: boolean}>;
}

export type HomeNotebookTapPlan =
  | {kind: 'open'; path: string}
  | {kind: 'create'; path: string}
  | {kind: 'choose-year'; createYear: number; createPath: string; openYear: number; openPath: string};

/**
 * What a tap on the notebook icon does (§3.1): open an existing notebook;
 * this year's missing and an earlier year's present - offer both, creating
 * this year's first; otherwise create it.
 */
export function planHomeNotebookTap(nb: HomeNotebookTapInput): HomeNotebookTapPlan {
  if (nb.exists) return {kind: 'open', path: nb.absolutePath};
  const current = nb.years[0];
  const earlier = nb.years.find(y => y.exists && (!current || y.year < current.year));
  if (current && earlier) {
    return {kind: 'choose-year', createYear: current.year, createPath: nb.absolutePath, openYear: earlier.year, openPath: earlier.absolutePath};
  }
  return {kind: 'create', path: nb.absolutePath};
}

// ---- Home page (§3.2) ----

/** The latest entry by key (both "2026-W41" and "2026-10" sort as strings), or null. */
function latestBy<T>(goals: readonly T[], key: (goal: T) => string): T | null {
  return goals.reduce<T | null>((latest, goal) => (latest === null || key(goal) > key(latest) ? goal : latest), null);
}

/**
 * The `goals` piece: the latest monthly goal and the latest weekly goal,
 * whatever period they belong to, one line each with their period -
 * "October 2026: …", "Week 43: …" (the labels of the "Last goal" display,
 * domain/period.ts). Empty goals are left out; '' when there is none.
 */
export function homeGoalsText(item: {monthlyGoals: readonly MonthlyGoal[]; weeklyGoals: readonly WeeklyGoal[]}): string {
  const monthly = latestBy(item.monthlyGoals.filter(g => g.text.trim()), g => g.monthKey);
  const weekly = latestBy(item.weeklyGoals.filter(g => g.text.trim()), g => g.weekKey);
  return [
    monthly ? `${periodLabel('monthly', monthly.monthKey)} ${monthly.monthKey.slice(0, 4)}: ${monthly.text.trim()}` : '',
    weekly ? `${periodLabel('weekly', weekly.weekKey)}: ${weekly.text.trim()}` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** What the Home page's pieces show: the item's name, its Scope and its latest goals. */
export function homePageContext(item: {
  name: string;
  scope: string;
  monthlyGoals: readonly MonthlyGoal[];
  weeklyGoals: readonly WeeklyGoal[];
}): PieceRenderContext {
  return {title: item.name, scope: item.scope.trim(), goals: homeGoalsText(item)};
}

// ---- Engage "Go to" (§3.6) ----

/**
 * Where Engage's "Go to <notebook> ›" leads: this year's home notebook when it
 * exists and the open note is neither it nor one of its earlier years; else
 * null (Engage never creates files). `years` as `homeNotebookYears` lists
 * them, current first, with absolute paths.
 */
export function homeNotebookGoTo(
  openNotePath: string | null,
  years: ReadonlyArray<{absolutePath: string; exists: boolean}>,
): string | null {
  const current = years[0];
  if (!current?.exists) return null;
  const open = openNotePath ? normalizeNotePath(openNotePath) : null;
  if (open && years.some(y => normalizeNotePath(y.absolutePath) === open)) return null;
  return current.absolutePath;
}

// ---- Notebook tab (§3.4) ----

export const NOTEBOOK_TAB_TEXT = {
  label: 'Notebook',
  open: 'Open',
  create: '+ Create notebook',
  contents: 'Contents',
  noContents: 'No headings yet.',
  contentsError: "Contents can't be read right now.",
} as const;

/** A Contents row's page, 1-based as Supernote shows it. */
export function contentsPageLabel(page: number): string {
  return `p.${page + 1}`;
}

/** The tab without any notebook file: what it will be. `relativeFile` as the note link names it. */
export function homeNotebookEmptyText(relativeFile: string, kind: 'project' | 'area'): string {
  return `No home notebook yet. It will be ${relativeFile} in this ${kind === 'project' ? 'Project' : 'Area'}'s folder.`;
}

/** This year's notebook is missing while earlier years exist. */
export function homeNotebookMissingYearText(fileName: string): string {
  return `${fileName} doesn't exist yet.`;
}

/** A year chip: the year, "+ <year>" for this year's missing file (a tap creates it). */
export function yearChipLabel(year: {year: number; exists: boolean}): string {
  return year.exists ? String(year.year) : `+ ${year.year}`;
}
