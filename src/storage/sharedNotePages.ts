/**
 * Shared Note Pages - the page engine (docs/dev/history/technical-design-shared-note-pages.md
 * §4). Wraps the PluginFileAPI calls `supernote/fileSystem.ts` exposes
 * (`insertNotePage`/`insertKeyWord`/`getKeyWords`/`deleteKeyWord`/
 * `getNoteTotalPageNum`/`createNote`/`ensureFolderExists`/`listFolderEntries`)
 * into the four device-facing operations this feature needs, handing every
 * decision that doesn't need the device to the pure helpers in
 * `domain/sharedNotePages.ts`.
 *
 * `writeRecreatedNotice` is the one piece of §7's "page not found ->
 * recreate" behavior that lives here. The rest of the wiring (§6-§8) is in
 * `storage/meetingNoteContent.ts` (`openOrCreateMeetingNote`/
 * `openOrCreateTodoNote`); this file is only the page engine and never
 * decides own-vs-shared or reads a Task/Meeting.
 *
 * The four functions §4 names (`ensureSharedNoteFile`/`findKeywordPage`/
 * `insertChronologicalPage`/`renameKeywordAt`) record one attempt +
 * success/failure + timing entry per call via `recordDebugLogEntry`
 * (`supernote/fileSystem.ts`'s on-device diagnostic file), so §10's open
 * risks can be checked on the device without `adb logcat`. Their
 * `try`/`catch` only adds the log entry and always rethrows the original
 * error unchanged. `writeRecreatedNotice` uses a plain `log()` instead.
 */
import {
  chronologicalInsertIndex,
  findExactKeywordPage,
  insertTodoPageIndex,
  PageKeyword,
  recreatedPageNoticeText,
} from '../domain/sharedNotePages';
import {
  DEFAULT_PIECE_FONT_SIZE,
  DEFAULT_PIECE_X,
  DEFAULT_PIECE_Y,
  pieceWidthPx,
} from '../domain/tagRules';
import {estimatePieceTextHeight} from '../domain/meetingNoteBlock';
import {
  createElement,
  createNote,
  deleteKeyWord,
  ELEMENT_TYPE_TEXT,
  ensureFolderExists,
  getKeyWords,
  getNoteTotalPageNum,
  insertElements,
  insertKeyWord,
  insertNotePage,
  listFolderEntries,
  recordDebugLogEntry,
  toRect,
} from '../supernote/fileSystem';
import {log} from '../utils/log';
import {errorMessage} from '../utils/errorMessage';

/** Every keyword currently on `filePath`, as `{page, keyword}` pairs (also used by the close-out scan, storage/closeOut/scan.ts) - one `getNoteTotalPageNum` + one `getKeyWords` call covering every page, never one call per page. Resolves `[]` for a brand-new (zero-page) file without calling `getKeyWords` at all - passing an empty `pageList` is untested API territory, so this sidesteps it rather than relying on it resolving sensibly. */
export async function readAllKeywords(filePath: string): Promise<{keywords: PageKeyword[]; totalPages: number}> {
  const totalPages = await getNoteTotalPageNum(filePath);
  if (totalPages <= 0) return {keywords: [], totalPages};
  const pageList = Array.from({length: totalPages}, (_, i) => i);
  const raw = await getKeyWords(filePath, pageList);
  return {keywords: raw.map(kw => ({page: kw.page, keyword: kw.keyword})), totalPages};
}

/**
 * Ensures `folderPath/fileName.note` exists (creating the folder and/or the
 * note itself as needed) and returns its absolute path. Existence is
 * checked via `listFolderEntries`, not by attempting `createNote` and
 * inspecting the failure - `createNote`'s error message for "already
 * exists" isn't one this codebase distinguishes, so checking first is the
 * safer pattern (mirrors
 * `createLinkedNote`'s own `ensureFolderExists` + collision-avoidance
 * style, just checking existence instead of avoiding a name collision).
 */
export async function ensureSharedNoteFile(folderPath: string, fileName: string, background: string): Promise<string> {
  const start = Date.now();
  try {
    await ensureFolderExists(folderPath);
    const targetName = `${fileName}.note`;
    const absolutePath = `${folderPath}/${targetName}`;
    const entries = await listFolderEntries(folderPath);
    const exists = entries.some(e => !e.isFolder && e.name === targetName);
    if (!exists) {
      log('ensureSharedNoteFile: creating', absolutePath);
      await createNote(absolutePath, background, true);
    }
    await recordDebugLogEntry('ensureSharedNoteFile', true, Date.now() - start, {
      folderPath,
      fileName,
      background,
      absolutePath,
      created: !exists,
    });
    return absolutePath;
  } catch (e) {
    await recordDebugLogEntry('ensureSharedNoteFile', false, Date.now() - start, {
      folderPath,
      fileName,
      background,
      errorMessage: errorMessage(e),
    });
    throw e;
  }
}

/**
 * The page carrying an exact-match `keyword` on `filePath`, or `null` if
 * none does (design doc §4's `findKeywordPage`). Reads the whole keyword
 * index in one round trip (`readAllKeywords`) rather than paging through it.
 */
export async function findKeywordPage(filePath: string, keyword: string): Promise<number | null> {
  const start = Date.now();
  try {
    const {keywords, totalPages} = await readAllKeywords(filePath);
    const page = findExactKeywordPage(keywords, keyword);
    // totalPages/keywordCount on every call (found or not) - the running
    // trail this leaves is what §10 risk #3 (getKeyWords cost over a large
    // page count) needs: durationMs against totalPages across many entries
    // shows whether the call is scaling linearly as a shared file grows.
    await recordDebugLogEntry('findKeywordPage', true, Date.now() - start, {
      filePath,
      keyword,
      totalPages,
      keywordCount: keywords.length,
      page: page ?? '(not found)',
    });
    return page;
  } catch (e) {
    await recordDebugLogEntry('findKeywordPage', false, Date.now() - start, {
      filePath,
      keyword,
      errorMessage: errorMessage(e),
    });
    throw e;
  }
}

/**
 * Inserts a brand-new page for `keyword` into `filePath` and returns its
 * index (design doc §4's `insertChronologicalPage`). `isDated` selects the
 * ordering rule: `true` (meetings) inserts chronologically among existing
 * dated pages (`domain/sharedNotePages.ts`'s `chronologicalInsertIndex`);
 * `false` (todos) always appends (`insertTodoPageIndex`) - todos have no
 * date to order by (§4/§9 of the design doc).
 *
 * Reads the keyword index only when `isDated` (the undated/todo path needs
 * nothing but the page count) - a small, deliberate optimization over always
 * reading it, since a todo-heavy shared file never needs its keywords for
 * this decision at all.
 */
export async function insertChronologicalPage(
  filePath: string,
  keyword: string,
  template: string,
  isDated: boolean,
): Promise<number> {
  const start = Date.now();
  try {
    let index: number;
    let totalPagesBefore: number;
    if (isDated) {
      const {keywords, totalPages} = await readAllKeywords(filePath);
      index = chronologicalInsertIndex(keywords, totalPages, keyword);
      totalPagesBefore = totalPages;
    } else {
      totalPagesBefore = await getNoteTotalPageNum(filePath);
      index = insertTodoPageIndex(totalPagesBefore);
    }
    log('insertChronologicalPage: inserting', filePath, `page=${index}`, keyword);
    await insertNotePage(filePath, index, template);
    await insertKeyWord(filePath, index, keyword);
    await recordDebugLogEntry('insertChronologicalPage', true, Date.now() - start, {
      filePath,
      keyword,
      isDated,
      totalPagesBefore,
      insertedPage: index,
    });
    return index;
  } catch (e) {
    await recordDebugLogEntry('insertChronologicalPage', false, Date.now() - start, {
      filePath,
      keyword,
      isDated,
      errorMessage: errorMessage(e),
    });
    throw e;
  }
}

/**
 * Swaps `oldKeyword` for `newKeyword` on `filePath`'s `page` (design doc §4's
 * `renameKeywordAt`, lazy rename per §6). Looks up `oldKeyword`'s own
 * `KeyWord.index` on that one page (a single-page `getKeyWords` call, not
 * the whole-file read `readAllKeywords` does) before deleting it - `index`
 * is 1-based and specific to `deleteKeyWord`, never assumed or
 * reconstructed.
 *
 * `opts.keepOldKeyword` (design doc §8's collision guard) skips the delete
 * entirely when the caller already knows another item still derives
 * `oldKeyword` - deciding that requires comparing against every OTHER
 * cached item, which this file has no access to and shouldn't (that check
 * is `storage/meetingNoteContent.ts`'s `openOrCreateMeetingNote`/
 * `openOrCreateTodoNote`); this function only carries out whichever
 * decision the caller already made. When `oldKeyword` isn't found on the
 * page at all (already renamed, or hand-edited away), the delete step is
 * silently skipped either way - `newKeyword` still gets added, which is
 * the half of this operation that actually matters for findability.
 */
export async function renameKeywordAt(
  filePath: string,
  page: number,
  oldKeyword: string,
  newKeyword: string,
  opts: {keepOldKeyword?: boolean} = {},
): Promise<void> {
  const start = Date.now();
  try {
    let deletedOldKeyword = false;
    if (!opts.keepOldKeyword) {
      const onPage = await getKeyWords(filePath, [page]);
      const hit = onPage.find(kw => kw.keyword === oldKeyword);
      if (hit) {
        await deleteKeyWord(filePath, page, hit.index);
        deletedOldKeyword = true;
      } else {
        log('renameKeywordAt: old keyword not found on page, skipping delete', filePath, `page=${page}`, oldKeyword);
      }
    }
    await insertKeyWord(filePath, page, newKeyword);
    await recordDebugLogEntry('renameKeywordAt', true, Date.now() - start, {
      filePath,
      page,
      oldKeyword,
      newKeyword,
      keepOldKeyword: !!opts.keepOldKeyword,
      deletedOldKeyword,
    });
  } catch (e) {
    await recordDebugLogEntry('renameKeywordAt', false, Date.now() - start, {
      filePath,
      page,
      oldKeyword,
      newKeyword,
      keepOldKeyword: !!opts.keepOldKeyword,
      errorMessage: errorMessage(e),
    });
    throw e;
  }
}

/**
 * Writes the "page not found, recreated" notice (design doc §7) onto a
 * freshly recreated page - one plain text element, positioned/sized the same
 * way a definition's own first piece would be (`DEFAULT_PIECE_X/Y/FONT_SIZE`,
 * `estimatePieceTextHeight` - the same constants and height estimate
 * `storage/meetingNoteContent.ts`'s `populateNoteFromRule` uses for a
 * page's first piece), since the recreated page is otherwise blank at the
 * moment this runs (the caller writes it before populating the page's real
 * content, so this notice ends up first, unlike the pieces which follow at
 * their own positions regardless of it).
 *
 * Deliberately carries no `userData` marker - every element `storage/
 * meetingNoteContent.ts` writes gets one (`notePieceUserData`/
 * `NOTE_LINK_USERDATA`/`MEETING_NOTE_BLOCK_USERDATA`) so a later refresh's
 * `deleteStaleManagedElements` can find and replace it; this one is meant to
 * survive every future refresh untouched, the same way a line the user wrote
 * by hand would, since it's a one-time historical note about *this specific
 * page*, not part of the note's regenerated content.
 */
export async function writeRecreatedNotice(filePath: string, page: number, isoDate: string): Promise<void> {
  const text = recreatedPageNoticeText(isoDate);
  const width = pieceWidthPx(DEFAULT_PIECE_X);
  const height = estimatePieceTextHeight(text, width, DEFAULT_PIECE_FONT_SIZE);

  const element = await createElement(ELEMENT_TYPE_TEXT);
  element.pageNum = page;
  element.layerNum = 0;
  element.textBox = {
    fontSize: DEFAULT_PIECE_FONT_SIZE,
    fontPath: null,
    textContentFull: text,
    textRect: toRect(DEFAULT_PIECE_X, DEFAULT_PIECE_Y, width, height),
    textDigestData: null,
    textAlign: 0,
    textBold: 0,
    textItalics: 0,
    textFrameWidthType: 0,
    textFrameStyle: 0,
    textEditable: 1,
  };

  log('writeRecreatedNotice: writing', filePath, `page=${page}`, text);
  await insertElements(filePath, page, [element]);
}
