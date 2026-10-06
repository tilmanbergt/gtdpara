/**
 * Renaming the Inbox's folder from Settings → Folders. The Inbox lives in its
 * own folder under Areas (`<areas>/<inboxFolder>`, domain/settings.ts's
 * resolvePaths); that folder is never listed as an Area.
 */
import {GtdParaSettings, resolvePaths, validateInboxFolderName} from '../domain/settings';
import {folderExists, moveFolder} from '../supernote/fileSystem';
import {log} from '../utils/log';

export type InboxRenameResult = 'unchanged' | 'moved' | 'notMoved';

/**
 * Settings → Folders save with a changed Inbox folder name. Moves the folder
 * FIRST, so the saved settings never point at a folder that wasn't moved;
 * throws (and the caller saves nothing) when the name is invalid, the target
 * exists, or the move fails. When Base or Areas change in the same save
 * nothing is moved - like every other folder setting - and 'notMoved' is
 * returned.
 */
export async function renameInboxFolderForSave(stored: GtdParaSettings, next: GtdParaSettings): Promise<InboxRenameResult> {
  const problem = validateInboxFolderName(next.inboxFolder);
  if (problem) throw new Error(problem);
  const before = resolvePaths(stored);
  const after = resolvePaths(next);
  if (before.inboxFolder === after.inboxFolder) return 'unchanged';
  if (before.base !== after.base || before.areas !== after.areas) {
    log('InboxFolder: renamed together with base/areas - nothing moved');
    return 'notMoved';
  }
  const name = after.inboxFolder.slice(after.inboxFolder.lastIndexOf('/') + 1);
  if (await folderExists(after.inboxFolder)) throw new Error(`A folder named "${name}" already exists in Areas.`);
  if (!(await folderExists(before.inboxFolder))) return 'unchanged';
  await moveFolder(before.inboxFolder, after.inboxFolder);
  log('InboxFolder: renamed');
  return 'moved';
}
