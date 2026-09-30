/**
 * Assigning/unassigning a Project's supporting Area (technical-design-
 * project-area-assignment.md §3.1) - the plain, non-cascading half of this
 * feature. Parallel to storage/statusControl.ts: this module only ever
 * writes the `area` frontmatter field itself; the cascading side effects
 * (an Area going On Hold pulling its Active projects with it, an Area
 * archive being blocked/cascaded by its assigned projects' status) live in
 * storage/statusControl.ts and storage/archive.ts respectively, since they
 * need `assignedProjects` from here rather than the other way around.
 *
 * Same "write the file, then update the cache, in that order" shape every
 * other frontmatter mutation in this app uses (storage/statusControl.ts's
 * setItemStatus, storage/focusSlots.ts's setItemFocus).
 */
import {CachedItem, FrontMatterSource, frontMatterOf, getCachedData, updateItemFrontMatter} from './dataCache';
import {saveFrontMatter} from './projectFile';

/** Just the fields a Project's own frontmatter write needs - same shape as setItemStatus's Pick, minus the fields this module doesn't touch (dailyFocus/weeklyFocus are carried through unchanged, never toggled by an assignment change). */
type AssignableProject = Pick<CachedItem, 'kind' | 'path' | 'rawContent'> & FrontMatterSource;

/**
 * Sets `project`'s `area` field to `areaName` (a bare Area folder name -
 * the Areas tab's picker only ever offers Active areas, so nothing here
 * re-validates that; see ui/FileBrowserPane.tsx's entryFilter). No side
 * effects on the Area itself - the relationship is read from the Project's
 * side only (assignedProjects below).
 */
export async function assignProjectToArea(
  project: AssignableProject,
  areaName: string,
): Promise<{rawContent: string; area: string}> {
  const fm = {...frontMatterOf(project), area: areaName};
  const rawContent = await saveFrontMatter(project.kind, project.path, project.rawContent, fm);
  updateItemFrontMatter(project.path, rawContent, fm);
  return {rawContent, area: areaName};
}

/** Clears `project`'s `area` field. No confirmation at this layer (or the UI layer above it) - a reversible, non-destructive change, unlike archiving. */
export async function unassignProject(
  project: AssignableProject,
): Promise<{rawContent: string; area: null}> {
  const fm = {...frontMatterOf(project), area: null};
  const rawContent = await saveFrontMatter(project.kind, project.path, project.rawContent, fm);
  updateItemFrontMatter(project.path, rawContent, fm);
  return {rawContent, area: null};
}

/**
 * Every cached Project currently assigned to `areaName` (matched by bare
 * folder name, same identity `area` itself is stored by). Used by: the
 * Area's own "Project Files" tab (ui/FileBrowserPane.tsx's entryFilter),
 * the On-Hold cascade (storage/statusControl.ts), and the archive
 * block/cascade (storage/archive.ts). Reads the already-warm cache rather
 * than scanning the filesystem, same "reads should prefer the cache"
 * convention as everywhere else in this app - an empty/missing cache
 * simply means no matches are found, same as any other cache read.
 */
export function assignedProjects(areaName: string): CachedItem[] {
  const cache = getCachedData();
  if (!cache) return [];
  return cache.items.filter(item => item.kind === 'project' && item.area === areaName);
}
