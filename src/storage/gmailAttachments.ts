/**
 * Saving a Gmail attachment to disk so it can become a Task/Meeting's
 * `linkedFile` (docs/dev/history/technical-design-review-gmail-inbox.md §8) - parallel
 * to storage/noteLinks.ts (creates a new .note) and storage/linkedFiles.ts
 * (points at an existing file), but for a *third* source: bytes fetched over
 * IMAP that don't exist as a file anywhere yet, so this module's job is
 * purely "write it into Resources, then hand back a linkedFile string the
 * normal linkedFile machinery already knows how to resolve/display".
 *
 * Attachments land under `<Resources>/Gmail attachments/<sanitized subject>/
 * <filename>` - grouped by the email they came from (an email with three
 * attachments keeps them together) rather than flat in Resources' root,
 * same "don't dump everything in one folder" instinct storage/noteLinks.ts's
 * own Meetings/Todos subfolders already follow. `linkedFile` is computed
 * with storage/linkedFiles.ts's own toLinkedFile so it round-trips through
 * exactly the same resolve/locate/status functions every other linkedFile
 * does - this module has no reader-side special case anywhere else in the
 * app.
 */
import {ResolvedParaPaths} from '../domain/settings';
import {toLinkedFile} from './linkedFiles';
import {sanitizeFileNameComponent} from './noteLinks';
import {ensureFolderExists, writeBinaryFile} from '../supernote/fileSystem';
import {log} from '../utils/log';
import {collisionFreeName} from './fileNaming';

export const GMAIL_ATTACHMENTS_SUBFOLDER = 'Gmail attachments';
/** Where "Link email as note" (storage/gmailEmailNote.ts, docs/dev/history/technical-design-gmail-email-note.md) writes an email's text as a .note - separate from GMAIL_ATTACHMENTS_SUBFOLDER since the two are conceptually different linked files (the email's own text vs. something it carried). */
export const GMAIL_EMAILS_SUBFOLDER = 'Gmail';

/** Picks a collision-free `<stem>[ (2)][ext]` filename inside an already-existing `folderPath`, the same convention storage/noteLinks.ts's createLinkedNote uses for note filenames (shared loop: storage/fileNaming.ts). */
function collisionFreeFileName(folderPath: string, stem: string, ext: string): Promise<string> {
  return collisionFreeName(folderPath, sanitizeFileNameComponent(stem), ext);
}

/**
 * MIME allow-list (Tilman, docs/dev/history/technical-design-review-gmail-inbox.md §8) -
 * only types this device can actually open via PluginFileAPI.openFile are
 * offered as a one-tap "Save" action; anything else still lists in the
 * message's attachment row (so nothing is silently hidden) but greyed out
 * with a "Not viewable on this device" label instead of a Save button.
 */
export const SUPPORTED_ATTACHMENT_MIME_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'application/epub+zip',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export function isAttachmentSupported(mimeType: string): boolean {
  return SUPPORTED_ATTACHMENT_MIME_TYPES.has(mimeType.toLowerCase());
}

/**
 * Writes one already-fetched attachment (base64, from
 * gmailImapNative.ts's fetchAttachment) into
 * `<Resources>/Gmail attachments/<subject>/<fileName>`, picking a
 * collision-free name the same " (2)/(3)" way storage/noteLinks.ts's
 * createLinkedNote does, and returns the base-root-relative `linkedFile`
 * string to store on the Task/Meeting.
 */
export async function saveGmailAttachment(
  paths: ResolvedParaPaths,
  subject: string,
  fileName: string,
  base64Content: string,
): Promise<string> {
  const folderPath = `${paths.resources.replace(/\/+$/, '')}/${GMAIL_ATTACHMENTS_SUBFOLDER}/${sanitizeFileNameComponent(subject)}`;
  await ensureFolderExists(folderPath);

  const dotIndex = fileName.lastIndexOf('.');
  const stem = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const ext = dotIndex > 0 ? fileName.slice(dotIndex) : '';
  const finalName = await collisionFreeFileName(folderPath, stem, ext);

  const absolutePath = `${folderPath}/${finalName}`;
  await writeBinaryFile(absolutePath, base64Content);
  log('saveGmailAttachment: done', absolutePath);
  return toLinkedFile(paths, absolutePath);
}
