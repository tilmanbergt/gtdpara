/**
 * Where things go in the Archive (docs/dev/history/technical-design-project-close-out.md
 * §5.1, decisions 19-21 and 23 of docs/dev/history/spike-project-archive-pdf.md):
 *
 *   Archive/<year>/<Area>/<Project>/      project folder, project with an Area
 *   Archive/<year>/<Area>/<Project>.pdf   its archive PDF - next to the folder
 *   Archive/<year>/<Project>/             project folder, no Area
 *   Archive/<year>/<Project>.pdf
 *   Archive/<year>/<Area>/                a whole Area (merged into what's there)
 *
 * The year is the year the project was DONE (`doneAt`), falling back to
 * today's year - a project done on 30 Dec and archived on 5 Jan belongs to
 * the old year. Pure: callers pass the archive root and "today".
 */

export interface ProjectArchiveTargets {
  year: string;
  /** Folder the project folder is moved to (must not exist yet). */
  folder: string;
  /** Path of the project's archive PDF. */
  pdf: string;
  /** The folder both of the above sit in (Archive/<year>/ or Archive/<year>/<Area>/). */
  parent: string;
}

function join(...parts: string[]): string {
  return parts
    .filter(p => p.length > 0)
    .map((p, i) => (i === 0 ? p.replace(/\/+$/, '') : p.replace(/^\/+|\/+$/g, '')))
    .join('/');
}

/** "2026" from a YYYY-MM-DD done date, else from `today`. */
export function archiveYear(doneAt: string | null, today: Date): string {
  if (doneAt && /^\d{4}-\d{2}-\d{2}$/.test(doneAt)) return doneAt.slice(0, 4);
  return String(today.getFullYear());
}

export function projectArchiveTargets(archiveRoot: string, projectName: string, area: string | null, year: string): ProjectArchiveTargets {
  const parent = area ? join(archiveRoot, year, area) : join(archiveRoot, year);
  return {year, parent, folder: join(parent, projectName), pdf: join(parent, `${projectName}.pdf`)};
}

/** An Area's archive folder - may already exist (earlier archived projects/material of that Area and year): callers merge into it. */
export function areaArchiveTarget(archiveRoot: string, areaName: string, year: string): string {
  return join(archiveRoot, year, areaName);
}
