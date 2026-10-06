/**
 * Writes a multi-page .note whose pages each carry one textbox of already
 * paginated text (docs/dev/technical-design-gmail-email-note.md 3.4). Generic - not
 * email-specific - so meeting minutes or other long text can reuse it. Pagination
 * itself (domain/textPagination.ts) and measurement (supernote/textboxMetrics.ts)
 * happen BEFORE this is called; everything left to fail here is host API calls.
 *
 * Uses the file-level PluginFileAPI wrappers only - deliberately NOT
 * PluginNoteAPI.saveCurrentNote(), which the sister project NoteDraft calls
 * because it edits the note that is open; the note written here is not open
 * (same reason storage/meetingNoteContent.ts avoids PluginNoteAPI).
 */
import {DEFAULT_PIECE_FONT_SIZE, NOTE_PAGE_HEIGHT_PX, NOTE_PAGE_WIDTH_PX} from '../domain/tagRules';
import {TextPage} from '../domain/textPagination';
import {createNote, insertElements, insertNotePage} from '../supernote/fileSystem';
import {buildTextboxElement} from '../supernote/noteElements';
import {log} from '../utils/log';

/**
 * Page geometry, from the sister project's tested import defaults (A5X page,
 * 1404 x 1872): margins left 100 / top 100 / right 200 / bottom 200.
 */
export const TEXT_NOTE_MARGIN_LEFT = 100;
export const TEXT_NOTE_MARGIN_TOP = 100;
export const TEXT_NOTE_MARGIN_RIGHT = 200;
export const TEXT_NOTE_MARGIN_BOTTOM = 200;
/** Text rect: x 100, y 100, 1104 wide x 1572 high. */
export const TEXT_NOTE_RECT_WIDTH_PX = NOTE_PAGE_WIDTH_PX - TEXT_NOTE_MARGIN_LEFT - TEXT_NOTE_MARGIN_RIGHT;
export const TEXT_NOTE_RECT_HEIGHT_PX = NOTE_PAGE_HEIGHT_PX - TEXT_NOTE_MARGIN_TOP - TEXT_NOTE_MARGIN_BOTTOM;
export const TEXT_NOTE_FONT_SIZE = DEFAULT_PIECE_FONT_SIZE;

export interface CreateTextNoteParams {
  absolutePath: string;
  /** One textbox per page; `heightPx` is the box height (already capped at TEXT_NOTE_RECT_HEIGHT_PX). */
  pages: TextPage[];
  /** Background template name, e.g. 'style_white'. */
  template: string;
  /** Called after each page is complete: (pagesDone, pagesTotal). */
  onProgress?: (done: number, total: number) => void;
}

/**
 * createNote (page 0) -> textbox on page 0 -> for each further page:
 * insertNotePage (appends at index i) -> textbox on page i. Sequential on
 * purpose (insertNotePage can hang; see fileSystem.ts's timeout). If a call
 * fails partway the plugin cannot delete the half-written file - the error
 * propagates and the caller reports the path.
 */
export async function createTextNote(params: CreateTextNoteParams): Promise<void> {
  const {absolutePath, pages, template, onProgress} = params;
  if (pages.length === 0) throw new Error('There is no text to write.');

  await createNote(absolutePath, template, true);
  for (let i = 0; i < pages.length; i++) {
    if (i > 0) await insertNotePage(absolutePath, i, template);
    const textbox = await buildTextboxElement({
      text: pages[i].text,
      x: TEXT_NOTE_MARGIN_LEFT,
      y: TEXT_NOTE_MARGIN_TOP,
      width: TEXT_NOTE_RECT_WIDTH_PX,
      height: Math.max(1, Math.min(TEXT_NOTE_RECT_HEIGHT_PX, pages[i].heightPx)),
      fontSize: TEXT_NOTE_FONT_SIZE,
      pageNum: i,
    });
    await insertElements(absolutePath, i, [textbox]);
    onProgress?.(i + 1, pages.length);
  }
  log('createTextNote: done', absolutePath, `${pages.length} page(s)`);
}
