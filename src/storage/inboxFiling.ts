/**
 * The filing picker's target: a Browse pick (Projects or Areas root) turned
 * into the Project/Area a todo or meeting is filed to. The move itself is
 * storage/entryMove.ts's moveTask/moveMeeting.
 */
import {ResolvedParaPaths} from '../domain/settings';

/** A filing target is always a Project or Area - never Resources (that root is for linking). */
export interface InboxFilingTarget {
  kind: 'project' | 'area';
  name: string;
  path: string;
}

/**
 * Turns a FileBrowserPane pick (root key + relativePath, from an arming
 * LinkTarget with pickKind:'folder' over the Projects/Areas roots -
 * docs/dev/technical-design-filing-unification.md §2/§3.4) into an
 * InboxFilingTarget. Picks only fire at depth 0, so relativePath is a bare
 * folder name.
 */
export function resolveFilingPick(paths: ResolvedParaPaths, root: string, relativePath: string): InboxFilingTarget | null {
  if (root === 'projects') return {kind: 'project', name: relativePath, path: `${paths.projects}/${relativePath}`};
  if (root === 'areas') return {kind: 'area', name: relativePath, path: `${paths.areas}/${relativePath}`};
  return null; // Resources isn't offered as a root while file-arming
}
