/**
 * The home notebook of a Project or Area
 * (docs/dev/history/technical-design-home-notebooks.md §3.1): the Default
 * setup's notebook rendered for that item. Implicit - nothing stores a link -
 * so its name is rendered here, once, for every place that needs it:
 * storage/noteTargets.ts places a todo's or meeting's Default notebook page
 * with the same function. Pure: no React Native, no SDK, no I/O.
 */
import {sanitizeFileNameComponent} from './fileName';
import {renderSharedFileName} from './sharedNotePages';

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
