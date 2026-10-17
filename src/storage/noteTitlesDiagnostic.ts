/**
 * Diagnostic for the Contents of a home notebook
 * (docs/dev/history/technical-design-home-notebooks.md §3.5, §5 S0): on the
 * note the plugin was opened from, how many headings `getTitles` returns, how
 * long that takes, and for each heading whether a textbox among the elements
 * it covers (`controlTrailNums` = their `numInPage`) was found, and whether
 * that textbox is gtdpara's own. Runs only while Debug logging is on; logs
 * counts, ms and yes/no only - never file names or texts.
 */
import {isNoteTemplateManagedElement} from '../domain/meetingNoteBlock';
import {getElements, getNoteTotalPageNum} from '../supernote/fileSystem';
import {getTitles, NoteTitle} from '../supernote/noteTitles';
import {recycleElements} from '../supernote/sdkElements';
import {errorMessage} from '../utils/errorMessage';
import {log, logWarn} from '../utils/log';

/** `p<page>:yes|own|no` for each title on one page: a covered textbox found (own = gtdpara's), or none. */
function coveredTextboxes(page: number, titles: NoteTitle[], elements: Awaited<ReturnType<typeof getElements>>): string[] {
  return titles.map(title => {
    const covered = elements.filter(el => (title.controlTrailNums ?? []).includes(el.numInPage) && el.textBox);
    if (covered.length === 0) return `p${page}:no`;
    return `p${page}:${covered.some(el => isNoteTemplateManagedElement(el.userData)) ? 'own' : 'yes'}`;
  });
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
        found.push(...coveredTextboxes(page, pageTitles, elements));
      } finally {
        recycleElements(elements);
      }
    }
    log(
      'NoteTitles: open note',
      `${totalPages} pages`,
      `${titles.length} titles in ${titlesMs} ms`,
      `${byPage.size} pages with titles`,
      `textbox ${found.join(' ') || '-'}`,
      `total ${Date.now() - start} ms`,
    );
  } catch (e) {
    logWarn('NoteTitles: diagnostic failed', errorMessage(e));
  }
}
