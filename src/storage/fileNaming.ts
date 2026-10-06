/**
 * Collision-free file names inside an existing folder
 * (docs/dev/technical-design-gmail-email-note.md 3.6) - the one shared loop
 * used by storage/noteLinks.ts's createLinkedNote and
 * storage/gmailAttachments.ts's collisionFreeFileName.
 */
import {listFolderEntries} from '../supernote/fileSystem';

/**
 * Picks `<stem><ext>`, or `<stem> (2)<ext>`, `<stem> (3)<ext>`, ... when that
 * name is already taken (case-insensitive) in `folderPath`. The caller has
 * already made `stem` filename-safe (see noteLinks.ts's sanitizeFileNameComponent)
 * and ensured the folder exists; `ext` includes the dot (e.g. ".note"), or is ''.
 */
export async function collisionFreeName(folderPath: string, stem: string, ext: string): Promise<string> {
  const existing = await listFolderEntries(folderPath);
  const existingNames = new Set(existing.map(entry => entry.name.toLowerCase()));
  let finalName = `${stem}${ext}`;
  let attempt = 2;
  while (existingNames.has(finalName.toLowerCase())) {
    finalName = `${stem} (${attempt})${ext}`;
    attempt += 1;
  }
  return finalName;
}
