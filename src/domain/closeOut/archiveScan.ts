/**
 * Finds the archived Projects and Areas under the Archive folder for the Integrity Check.
 *
 * Archived items sit at different depths: `Archive/<name>/` (Archive now from an item's
 * status), `Archive/<year>/<Project>/`, `Archive/<year>/<Area>/<Project>/` and
 * `Archive/<year>/<Area>/` (close-out, domain/closeOut/archivePaths.ts). A folder holding
 * `project.txt` or `area.txt` is an item; the walk goes on into an Area's sub-folders, because an
 * archived Area folder can hold archived projects. Folders without a data file (a year, an
 * Area folder that only groups projects) are walked through. Pure: the caller passes `list`.
 */
import {AREA_FILE_NAME, PROJECT_FILE_NAME} from '../types';

export interface ArchiveListEntry {
  name: string;
  path: string;
  isFolder: boolean;
}

export interface ArchivedItem {
  kind: 'project' | 'area';
  path: string;
  name: string;
}

/** Year folder, Area folder and project folder - deep enough for every layout close-out writes. */
export const ARCHIVE_SCAN_DEPTH = 3;

export async function collectArchivedItems(
  list: (folder: string) => Promise<ArchiveListEntry[]>,
  archiveRoot: string,
  maxDepth: number = ARCHIVE_SCAN_DEPTH,
): Promise<ArchivedItem[]> {
  const found: ArchivedItem[] = [];
  // `entries` is the listing of a folder at `depth` (1 = directly under the Archive root).
  const walk = async (entries: ArchiveListEntry[], depth: number): Promise<void> => {
    for (const sub of entries.filter(e => e.isFolder)) {
      const inner = await list(sub.path);
      const files = inner.filter(e => !e.isFolder).map(e => e.name);
      if (files.includes(PROJECT_FILE_NAME)) {
        found.push({kind: 'project', path: sub.path, name: sub.name});
        continue; // a project never holds other items
      }
      if (files.includes(AREA_FILE_NAME)) found.push({kind: 'area', path: sub.path, name: sub.name});
      if (depth < maxDepth) await walk(inner, depth + 1);
    }
  };
  await walk(await list(archiveRoot), 1);
  return found;
}
