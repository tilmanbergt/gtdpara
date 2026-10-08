/**
 * Makes note pages findable (docs/dev/history/technical-design-projects-findable-notes.md):
 *
 * - **Headings** (§2.6, step 5 of the writing order): after
 *   storage/meetingNoteContent.ts's `populateNoteFromRule` has inserted the
 *   rule's textboxes, every piece with the Heading switch on
 *   (`pieceIsHeading`) and some text gets a title element over its textbox,
 *   so Supernote lists it in the note's table of contents. Content first,
 *   headings second: a heading that can't be written is logged and skipped,
 *   the note keeps its content.
 * - **Keywords** (§2.7): `syncPageKeywords` gives the page the item's date
 *   keyword and its tags, and drops an outdated date keyword - on every
 *   refresh that is not frozen, so a moved meeting's keyword follows on the
 *   next open.
 *
 * Logs carry counts only, never heading or keyword texts (they hold client
 * names, §2.9).
 */
import {notePieceUserData} from '../domain/meetingNoteBlock';
import {isOurHeading, planPageKeywords} from '../domain/noteFindability';
import {NoteHeadingStyle} from '../domain/settings';
import {pieceIsHeading, TagRule} from '../domain/tagRules';
import {deleteKeyWord, getElements, getKeyWords, insertElements, insertKeyWord} from '../supernote/fileSystem';
import {buildTitleElement, ELEMENT_TYPE_TITLE, ElementWithTitle} from '../supernote/noteTitles';
import {recycleElements} from '../supernote/sdkElements';
import {errorMessage} from '../utils/errorMessage';
import {log, logWarn} from '../utils/log';

/** The indexes of `definition`'s pieces that become headings: switch on and non-empty text. */
export function headingPieceIndexes(definition: TagRule, pieceContent: readonly string[]): number[] {
  return definition.pieces.flatMap((piece, index) => (pieceIsHeading(piece) && (pieceContent[index] ?? '') !== '' ? [index] : []));
}

/**
 * Inserts one title element per heading piece over the textbox
 * `populateNoteFromRule` just wrote for it (found by its per-piece marker),
 * all in one `insertElements` call. Never throws.
 */
export async function applyPieceHeadings(
  notePath: string,
  page: number,
  definition: TagRule,
  pieceContent: readonly string[],
  style: NoteHeadingStyle,
): Promise<void> {
  const indexes = headingPieceIndexes(definition, pieceContent);
  if (indexes.length === 0) return;
  const titles: ElementWithTitle[] = [];
  try {
    const elements = (await getElements(page, notePath)) as ElementWithTitle[];
    for (const index of indexes) {
      const textBox = elements.find(el => el.userData === notePieceUserData(index) && el.textBox);
      if (!textBox?.textBox) {
        logWarn('noteFindability: heading textbox missing, skipped', `piece=${index}`);
        continue;
      }
      titles.push(await buildTitleElement({page, textBoxNum: textBox.numInPage, rect: textBox.textBox.textRect, style}));
    }
    log('noteFindability: heading', `wanted=${indexes.length}`, `found=${titles.length}`);
    if (titles.length === 0) return;
    await insertElements(notePath, page, titles);
    log('noteFindability: heading', `inserted=${titles.length}`, `style=${style}`);
  } catch (e) {
    logWarn('noteFindability: heading failed', errorMessage(e));
  } finally {
    recycleElements(titles);
  }
  await logTitleCheckpoint(notePath, page);
}

/**
 * TEMPORARY device-checkpoint diagnostic (design §5, step S1; delete in
 * step S4): logs every title element `getElements` returns for the page -
 * type, numInPage, title.controlTrailNums, title.style, contour count, and
 * whether it carries gtdpara's marker - so the debug log shows what the host
 * stored. Numbers only, no texts. Never throws.
 */
async function logTitleCheckpoint(notePath: string, page: number): Promise<void> {
  try {
    const elements = (await getElements(page, notePath)) as ElementWithTitle[];
    const titles = elements.filter(el => el.type === ELEMENT_TYPE_TITLE);
    log('S1-DIAG titles', `page=${page}`, `elements=${elements.length}`, `titles=${titles.length}`);
    for (const el of titles) {
      let contours: string;
      try {
        contours = el.contoursSrc ? String(await el.contoursSrc.size()) : 'none';
      } catch (e) {
        contours = `error:${errorMessage(e)}`;
      }
      log(
        'S1-DIAG title',
        `type=${el.type}`,
        `numInPage=${el.numInPage}`,
        `controlTrailNums=${JSON.stringify(el.title?.controlTrailNums ?? null)}`,
        `style=${el.title?.style ?? 'none'}`,
        `contours=${contours}`,
        `userData=${el.userData == null ? 'none' : 'set'}`,
        `ours=${isOurHeading(el)}`,
      );
    }
  } catch (e) {
    logWarn('S1-DIAG titles failed', errorMessage(e));
  }
}

/**
 * Brings `page`'s keywords in line with the item (§2.7): one `getKeyWords`,
 * then the deletes (highest position first) and inserts of
 * `planPageKeywords`. Each failing call is logged and skipped. Never throws.
 */
export async function syncPageKeywords(notePath: string, page: number, item: {date: string | null; tags: readonly string[]}): Promise<void> {
  try {
    const onPage = (await getKeyWords(notePath, [page])).filter(k => k.page === page);
    const plan = planPageKeywords({onPage, date: item.date, tags: item.tags});
    let deleted = 0;
    let added = 0;
    for (const index of plan.deleteIndexes) {
      try {
        await deleteKeyWord(notePath, page, index);
        deleted++;
      } catch (e) {
        logWarn('noteFindability: keyword delete failed', errorMessage(e));
      }
    }
    for (const keyword of plan.add) {
      try {
        await insertKeyWord(notePath, page, keyword);
        added++;
      } catch (e) {
        logWarn('noteFindability: keyword insert failed', errorMessage(e));
      }
    }
    log('noteFindability: keywords', `page=${page}`, `added=${added}`, `deleted=${deleted}`);
  } catch (e) {
    logWarn('noteFindability: keywords failed', errorMessage(e));
  }
}
