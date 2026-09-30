/**
 * "Link email as note" (docs/dev/technical-design-gmail-email-note.md): writes an
 * email's Subject/From/Date header plus its full text into a multi-page .note
 * under `<Resources>/Gmail/<date> <subject>.note` and hands back the
 * base-relative `linkedFile` string for the Task/Meeting. Replaces the old
 * `.txt` writer (saveGmailEmailAsFile) - the device cannot open a .txt via
 * PluginFileAPI.openFile, a .note it can.
 */
import {buildEmailNoteText, EMAIL_NOTE_MAX_PAGES, EMAIL_NOTE_TRUNCATION_NOTICE, emailNoteBaseName} from '../domain/emailNote';
import {ResolvedParaPaths} from '../domain/settings';
import {paginateText} from '../domain/textPagination';
import {ensureFolderExists} from '../supernote/fileSystem';
import {measureTextHeight} from '../supernote/textboxMetrics';
import {log} from '../utils/log';
import {collisionFreeName} from './fileNaming';
import {GMAIL_EMAILS_SUBFOLDER} from './gmailAttachments';
import {toLinkedFile} from './linkedFiles';
import {getNoteTemplate} from './noteLinks';
import {
  createTextNote,
  TEXT_NOTE_FONT_SIZE,
  TEXT_NOTE_RECT_HEIGHT_PX,
  TEXT_NOTE_RECT_WIDTH_PX,
} from './textNote';

/**
 * When the native measurement is unavailable the estimate is used instead;
 * over-provisioning is the safe failure (one page too many, never clipped
 * text), so heights from a fallback measurement are inflated by this factor.
 */
export const FALLBACK_HEIGHT_SAFETY = 1.15;

/** The page cap keeps ~10 pages (~20-25k characters); anything past this many characters is dropped up front so a pathological mail never reaches the measurer. */
const MAX_INPUT_CHARS = 60000;

export interface GmailEmailForNote {
  subject: string;
  from: string;
  /** ISO timestamp, '' if unparseable. */
  date: string;
}

export interface SavedEmailNote {
  linkedFile: string;
  pageCount: number;
  truncated: boolean;
}

/** Cuts to `max` UTF-16 units without leaving half of a surrogate pair at the end. */
function clampChars(text: string, max: number): string {
  if (text.length <= max) return text;
  const code = text.charCodeAt(max - 1);
  return text.slice(0, code >= 0xd800 && code <= 0xdbff ? max - 1 : max);
}

export async function saveGmailEmailAsNote(
  paths: ResolvedParaPaths,
  message: GmailEmailForNote,
  body: string,
  onProgress?: (text: string) => void,
): Promise<SavedEmailNote> {
  const today = new Date();
  onProgress?.('Preparing note...');

  const fullText = clampChars(buildEmailNoteText(message, body, today), MAX_INPUT_CHARS);
  const measure = async (text: string): Promise<number> => {
    const m = await measureTextHeight(text, TEXT_NOTE_RECT_WIDTH_PX, TEXT_NOTE_FONT_SIZE);
    return m.source === 'fallback' ? m.heightPx * FALLBACK_HEIGHT_SAFETY : m.heightPx;
  };
  const {pages, truncated, droppedChars} = await paginateText(fullText, measure, {
    maxHeightPx: TEXT_NOTE_RECT_HEIGHT_PX,
    maxPages: EMAIL_NOTE_MAX_PAGES,
    truncationNotice: EMAIL_NOTE_TRUNCATION_NOTICE,
  });
  if (pages.length === 0) throw new Error('This email has no text to save.');

  const folderPath = `${paths.resources.replace(/\/+$/, '')}/${GMAIL_EMAILS_SUBFOLDER}`;
  await ensureFolderExists(folderPath);
  const fileName = await collisionFreeName(folderPath, emailNoteBaseName(message.date, message.subject, today), '.note');
  const absolutePath = `${folderPath}/${fileName}`;

  await createTextNote({
    absolutePath,
    pages,
    template: getNoteTemplate(),
    onProgress: (done, total) => onProgress?.(`Creating note... page ${done}/${total}`),
  });
  log('saveGmailEmailAsNote: done', absolutePath, `${pages.length} page(s)`, truncated ? `capped, ~${droppedChars} chars dropped` : '');
  return {linkedFile: toLinkedFile(paths, absolutePath), pageCount: pages.length, truncated};
}
