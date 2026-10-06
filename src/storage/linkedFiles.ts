/**
 * Resolving and locating a Task/Meeting's `linkedFile` (technical-design-
 * linked-files.md §4) - parallel to storage/noteLinks.ts, but for pointing
 * at an *existing* file the user selects rather than creating a new .note.
 *
 * `linkedFile` (domain/types.ts) is always stored base-root-relative
 * (ResolvedParaPaths.base), never item-relative like notePath is - a linked
 * file can live under Resources, which isn't nested under any Project/Area,
 * so one base-relative rule covers both sources without branching. That
 * means, unlike storage/noteLinks.ts's resolveNotePath, there's no
 * absolute-vs-relative branch to handle here: every linkedFile is relative
 * to `paths.base`, full stop.
 *
 * A third source (technical-design-project-area-assignment.md §6, §4.4): a
 * Project's own assigned Area's folder. `locateLinkedFile`'s optional
 * `areaFolderPath` parameter is that Area's resolved absolute path (built by
 * the caller from the Project's `area` field), checked alongside `itemPath`
 * and `paths.resources`. Areas themselves never have an assigned Area of
 * their own (`area` is always null there), so this parameter is simply
 * omitted/null for an Area's own locate calls - the check is inert.
 */
import {ResolvedParaPaths} from '../domain/settings';
import {parsePageAnchor, stripPageAnchor} from '../domain/sharedNotePages';
import {listFolderEntries, openPath} from '../supernote/fileSystem';

/**
 * Turns a stored linkedFile value into an absolute path (without any page).
 * Lasso capture (docs/dev/history/technical-design-lasso-0.8.md) links the source
 * page as `<file>#page=<n>`, and a source outside the base folder (a PDF
 * in Document/) is stored absolute (starting with '/').
 */
export function resolveLinkedFilePath(paths: ResolvedParaPaths, linkedFile: string): string {
  const file = stripPageAnchor(linkedFile);
  return file.startsWith('/') ? file : `${paths.base}/${file}`;
}

/** The 0-based page a linkedFile points to, or -1 (open as the host likes). */
export function linkedFilePage(linkedFile: string): number {
  return parsePageAnchor(linkedFile)?.page ?? -1;
}

/** Opens a linkedFile - at its page when it carries one. */
export function openLinkedFile(paths: ResolvedParaPaths, linkedFile: string): Promise<void> {
  return openPath(resolveLinkedFilePath(paths, linkedFile), linkedFilePage(linkedFile));
}

/**
 * linkedFile relative to paths.base, given an absolute FolderEntry.path
 * under either Projects/Areas or Resources - the inverse of
 * resolveLinkedFilePath, used once when a file is tapped while armed
 * (ui/FileBrowserPane.tsx's `arming` mode). Not scoped to project/resources
 * specifically - any absolute path under `paths.base` resolves, since the
 * armed pane can be browsing either root when the tap happens.
 */
export function toLinkedFile(paths: ResolvedParaPaths, absolutePath: string): string {
  const basePrefix = `${paths.base.replace(/\/+$/, '')}/`;
  if (!absolutePath.startsWith(basePrefix)) return absolutePath;
  return absolutePath.slice(basePrefix.length);
}

export type LinkedFileStatus = 'ok' | 'missing';

/**
 * Whether the linked file itself still exists, by listing its parent folder
 * (supernote/fileSystem.ts's listFolderEntries) and checking for a matching
 * name. Note: listFolderEntries resolves an empty array both when a folder
 * is genuinely empty and when it doesn't exist at all - this check can't
 * tell those apart, but doesn't need to: either way the file isn't in the
 * list, so 'missing' is correct regardless of which case it is. The Files
 * pane's own auto-navigate just shows whatever that folder listing returns
 * (empty or not) - no special-cased "folder is gone" message, per the "no
 * text banner, ⚠ is enough" decision.
 */
export async function linkedFileStatus(
  paths: ResolvedParaPaths,
  linkedFile: string,
): Promise<LinkedFileStatus> {
  const absolutePath = resolveLinkedFilePath(paths, linkedFile);
  const lastSlash = absolutePath.lastIndexOf('/');
  const folderPath = lastSlash === -1 ? '' : absolutePath.slice(0, lastSlash);
  const fileName = lastSlash === -1 ? absolutePath : absolutePath.slice(lastSlash + 1);
  const entries = await listFolderEntries(folderPath);
  const found = entries.some(entry => !entry.isFolder && entry.name === fileName);
  return found ? 'ok' : 'missing';
}

/** Where linkedFile's *containing folder* lives, for the Files pane's auto-navigate: which root (Project/Area Files, the assigned Area's Files, or Resources) and the folder-only path relative to that root. */
export interface LinkedFileLocation {
  root: 'item' | 'resources' | 'area';
  /** Folder path relative to the item's own root (root: 'item'), the assigned Area's own folder (root: 'area'), or paths.resources (root: 'resources'). '' = the root itself. */
  folderPath: string;
  fileName: string;
}

/**
 * Splits an absolute path into {folderPath, fileName} relative to `root`,
 * or null if `absolutePath` isn't under `root` at all.
 */
function relativeLocation(root: string, absolutePath: string): {folderPath: string; fileName: string} | null {
  const prefix = `${root.replace(/\/+$/, '')}/`;
  if (!absolutePath.startsWith(prefix)) return null;
  const rest = absolutePath.slice(prefix.length);
  const lastSlash = rest.lastIndexOf('/');
  if (lastSlash === -1) return {folderPath: '', fileName: rest};
  return {folderPath: rest.slice(0, lastSlash), fileName: rest.slice(lastSlash + 1)};
}

/**
 * Resolves `linkedFile` to a {root, folderPath, fileName} the Files pane can
 * auto-navigate to: `itemPath` (this Task/Meeting's own Project/Area folder)
 * first, then `areaFolderPath` (a Project's assigned Area's folder, if any -
 * technical-design-project-area-assignment.md §6), then `paths.resources`.
 * Returns null if `linkedFile` resolves under none of those - shouldn't
 * happen for anything this plugin wrote (every linkedFile is picked from one
 * of those roots), but a hand-edited file is possible, same defensive
 * posture as domain/markdown.ts's parser generally. (An Area's own tasks
 * linking to a file under one of *its* assigned Projects' folders - the
 * reverse direction, via the Project Files tab §4.4 adds to an Area's own
 * Files pane - isn't covered by any of these three roots either; picking
 * such a file still links it, it just won't auto-locate on re-edit, same
 * "returns null" fallback as any other not-yet-covered source.)
 */
export function locateLinkedFile(
  paths: ResolvedParaPaths,
  itemPath: string,
  linkedFile: string,
  areaFolderPath?: string | null,
): LinkedFileLocation | null {
  const absolutePath = resolveLinkedFilePath(paths, linkedFile);

  const underItem = relativeLocation(itemPath, absolutePath);
  if (underItem) return {root: 'item', ...underItem};

  if (areaFolderPath) {
    const underArea = relativeLocation(areaFolderPath, absolutePath);
    if (underArea) return {root: 'area', ...underArea};
  }

  const underResources = relativeLocation(paths.resources, absolutePath);
  if (underResources) return {root: 'resources', ...underResources};

  return null;
}
