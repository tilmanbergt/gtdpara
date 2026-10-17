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
import {buildPageAnchor, buildSharedNoteAnchor, parsePageAnchor, parseSharedNoteAnchor, renderSharedFileName} from './sharedNotePages';
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

// ---- Rename safety net (§3.7) ----

const STORED_NAME_RE = /^name:\s*(.*)$/;

/**
 * The item's name as gtdpara last knew it: the front matter's `name:` line,
 * kept among the lines the front matter parser leaves alone (like `doneAt:`),
 * so older versions keep it untouched. Null when there is none.
 */
export function readStoredName(frontMatterExtraLines: readonly string[]): string | null {
  for (const line of frontMatterExtraLines) {
    const m = STORED_NAME_RE.exec(line.trim());
    if (m) return m[1].trim() || null;
  }
  return null;
}

/** `frontMatterExtraLines` with `name:` set to `name` (the line replaced in place, or added). */
export function withStoredName(frontMatterExtraLines: readonly string[], name: string): string[] {
  const line = `name: ${name}`;
  const index = frontMatterExtraLines.findIndex(l => STORED_NAME_RE.test(l.trim()));
  if (index === -1) return [...frontMatterExtraLines, line];
  return frontMatterExtraLines.map((l, i) => (i === index ? line : l));
}

export type RenameCase =
  | {kind: 'rename'; from: string; to: string}
  | {kind: 'conflict'; from: string; to: string}
  /** The stored name is outdated but there is nothing to move: only `name:` is brought up to date. */
  | {kind: 'update-name'; from: string; to: string}
  | null;

/**
 * Whether the item's folder was renamed outside gtdpara while its home
 * notebook kept the old name (§3.7): `stored` differs from the folder name,
 * this year's notebook rendered with `stored` exists (`fromExists`) and the
 * one rendered with the folder name doesn't (`toExists`) → rename. Both exist
 * → conflict (reported only). The old one missing → only the name. Nothing
 * when the names agree, `name:` is missing, or the template doesn't use
 * `{name}` (`fromFile === toFile`).
 */
export function renameCase(input: {stored: string | null; folderName: string; fromFile: string; toFile: string; fromExists: boolean; toExists: boolean}): RenameCase {
  const {stored, folderName} = input;
  if (!stored || stored === folderName) return null;
  if (input.fromFile === input.toFile) return {kind: 'update-name', from: stored, to: folderName};
  if (!input.fromExists) return {kind: 'update-name', from: stored, to: folderName};
  if (input.toExists) return {kind: 'conflict', from: stored, to: folderName};
  return {kind: 'rename', from: stored, to: folderName};
}

/** A notebook moving from one file to another: relative to its item's folder, and absolute. */
export interface NotebookMove {
  oldRelative: string;
  newRelative: string;
  oldAbsolute: string;
  newAbsolute: string;
}

/**
 * A stored note link after its notebook moved (§3.7), or null when it doesn't
 * point into the old file. In the notebook's own item (`ownItem`) a relative
 * link - a page anchor `<file>#<keyword>`, a page link `<file>#page=n` or the
 * file itself - is re-pointed; everywhere an absolute link to the file is.
 * The keyword or page stays.
 */
export function relinkNotePath(notePath: string, ownItem: boolean, move: NotebookMove): string | null {
  const swap = (file: string): string | null => {
    if (file === move.oldAbsolute) return move.newAbsolute;
    if (ownItem && file === move.oldRelative) return move.newRelative;
    return null;
  };
  const page = parsePageAnchor(notePath);
  if (page) {
    const file = swap(page.filePath);
    return file === null ? null : buildPageAnchor(file, page.page);
  }
  const anchor = parseSharedNoteAnchor(notePath);
  if (anchor) {
    const file = swap(anchor.filePath);
    return file === null ? null : buildSharedNoteAnchor(file, anchor.keyword);
  }
  return swap(notePath);
}

/** The Default notebook's settings a rename check needs. */
export interface HomeNotebookSpec {
  /** The Default notebook's name template and folder (relative to the item's folder). */
  template: string;
  folder: string;
  /** YYYY-MM-DD: this year's file is the one checked. */
  today: string;
}

/**
 * This year's home notebook under the stored name and under the folder name,
 * as a move (§3.7) - or null when `name:` is missing or agrees with the folder.
 */
export function renamedNotebookMove(input: {itemPath: string; stored: string | null; abbrev: string; spec: HomeNotebookSpec}): (NotebookMove & {fromFile: string; toFile: string; from: string; to: string}) | null {
  const itemPath = input.itemPath.replace(/\/+$/, '');
  const to = itemPath.slice(itemPath.lastIndexOf('/') + 1);
  const from = input.stored;
  if (!from || from === to) return null;
  const render = (itemName: string) => homeNotebookName({template: input.spec.template, itemName, itemAbbrev: input.abbrev, date: input.spec.today});
  const fromFile = render(from);
  const toFile = render(to);
  const rel = (file: string) => (input.spec.folder ? `${input.spec.folder}/${file}.note` : `${file}.note`);
  return {
    from,
    to,
    fromFile,
    toFile,
    oldRelative: rel(fromFile),
    newRelative: rel(toFile),
    oldAbsolute: `${itemPath}/${rel(fromFile)}`,
    newAbsolute: `${itemPath}/${rel(toFile)}`,
  };
}

/** The offer on the Project/Area page: "<from> is now <to>. Rename …?" Rename · Not now. */
export function renameOfferText(c: {from: string; to: string; fromFile: string; toFile: string}): {text: string; detail: string; labels: string[]} {
  return {
    text: `${c.from} is now ${c.to}. Rename ${c.fromFile}.note to ${c.toFile}.note?`,
    detail: 'Renames this year\'s home notebook and updates the links of todos, meetings and marks that point into it. Earlier years keep their names.',
    labels: ['Rename', 'Not now'],
  };
}

/** After the rename; `failed` data files kept links to the old name. */
export function renameDoneText(toFile: string, linksUpdated: number, failed = 0): string {
  const done = `Renamed to ${toFile}.note; ${linksUpdated} ${linksUpdated === 1 ? 'link' : 'links'} updated.`;
  return failed > 0 ? `${done} Links in ${failed} ${failed === 1 ? 'file were' : 'files were'} not updated - run the Integrity Check.` : done;
}

/** The Integrity Check's message for a renamed folder whose notebook kept the old name. */
export function renameFindingText(c: {kind: 'rename' | 'conflict'; to: string; fromFile: string; toFile: string}): string {
  return c.kind === 'rename'
    ? `Folder renamed to ${c.to}; its notebook is still ${c.fromFile}.note`
    : `Folder renamed to ${c.to}; both ${c.fromFile}.note and ${c.toFile}.note exist`;
}
