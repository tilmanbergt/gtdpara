/**
 * Diagnostic for the Contents of a home notebook
 * (docs/dev/history/technical-design-home-notebooks.md §3.5, §5 S0): on the
 * note the plugin was opened from, how many headings `getTitles` returns, how
 * long that takes, and for each heading whether the Contents finds its
 * textbox, and whether that textbox is gtdpara's own, with the numbers that
 * decide it (trails, rectangles, element types). Runs only while Debug
 * logging is on; logs counts, ms, numbers and yes/no only - never file names
 * or texts.
 */
import {isNoteTemplateManagedElement} from '../domain/meetingNoteBlock';
import {headingText} from '../domain/notebookContents';
import {getElements, getNoteTotalPageNum} from '../supernote/fileSystem';
import {ElementWithTitle, getTitles, NoteTitle} from '../supernote/noteTitles';
import {recycleElements} from '../supernote/sdkElements';
import {errorMessage} from '../utils/errorMessage';
import {log, logWarn} from '../utils/log';
import {headingElementsOf, titleRect} from './notebookContents';

/** A rectangle as `l,t,r,b`, rounded. */
const rectText = (r: {left: number; top: number; right: number; bottom: number}) => [r.left, r.top, r.right, r.bottom].map(Math.round).join(',');

/**
 * For each title on one page: `p<page>:yes|own|no` - a covered textbox found
 * the way the Contents finds it (domain/notebookContents.ts's `headingText`;
 * own = gtdpara's) - with getTitles' trail and rectangle; then the page's
 * elements as `num:type[@rect][>trail]`. Numbers only.
 */
function describePage(page: number, titles: NoteTitle[], elements: ElementWithTitle[]): string {
  const onPage = headingElementsOf(elements);
  const found = titles.map(title => {
    const text = headingText({rect: titleRect(title), trail: title.controlTrailNums ?? []}, onPage);
    const own = text !== null && elements.some(el => el.textBox?.textContentFull === text && isNoteTemplateManagedElement(el.userData));
    return `p${page}:${text === null ? 'no' : own ? 'own' : 'yes'} trail=[${(title.controlTrailNums ?? []).join(',')}] at=${rectText(titleRect(title))}`;
  });
  const els = elements.map(el => {
    const rect = el.textBox?.textRect ? `@${rectText(el.textBox.textRect)}` : el.title ? `@${rectText(titleRect(el.title))}` : '';
    const trail = el.title ? `>[${(el.title.controlTrailNums ?? []).join(',')}]` : '';
    return `${el.numInPage}:${el.type}${rect}${trail}`;
  });
  return `${found.join(' ')} els ${els.join(' ')}`;
}

/** Logs the headings of the note at `notePath` (see module comment). Never throws. */
export async function logNoteTitlesDiagnostic(notePath: string): Promise<void> {
  if (!notePath.toLowerCase().endsWith('.note')) return;
  const start = Date.now();
  try {
    const totalPages = await getNoteTotalPageNum(notePath);
    const titlesStart = Date.now();
    const titles = await getTitles(notePath, Array.from({length: Math.max(0, totalPages)}, (_, i) => i));
    const titlesMs = Date.now() - titlesStart;
    const byPage = new Map<number, NoteTitle[]>();
    for (const title of titles) byPage.set(title.page, [...(byPage.get(title.page) ?? []), title]);
    const found: string[] = [];
    for (const [page, pageTitles] of [...byPage].sort((a, b) => a[0] - b[0])) {
      const elements = await getElements(page, notePath);
      try {
        found.push(describePage(page, pageTitles, elements as ElementWithTitle[]));
      } finally {
        recycleElements(elements);
      }
    }
    log(
      'NoteTitles: open note',
      `${totalPages} pages`,
      `${titles.length} titles in ${titlesMs} ms`,
      `${byPage.size} pages with titles`,
      `textbox ${found.join(' | ') || '-'}`,
      `total ${Date.now() - start} ms`,
    );
  } catch (e) {
    logWarn('NoteTitles: diagnostic failed', errorMessage(e));
  }
}
