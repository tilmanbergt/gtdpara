/**
 * Reading a home notebook's Contents
 * (docs/dev/history/technical-design-home-notebooks.md §3.5): its keywords
 * (one call, also the page count), its headings (one `getTitles` call), and -
 * only on pages gtdpara doesn't title itself - one `getElements` per page with
 * headings, for the typed text of the textbox each heading covers. What was
 * read is cached in memory per file and its modification time, so the tab
 * reads a file again only after it changed; the entries are built from it
 * each time (domain/notebookContents.ts), so a renamed todo shows at once.
 * Logs counts and ms only - never headings or file names.
 */
import {buildContents, ContentsEntry, ContentsItem, ContentsTitle, gtdparaPages} from '../domain/notebookContents';
import {todayIso} from '../domain/meetingTime';
import {PageKeyword} from '../domain/sharedNotePages';
import {getElements, statFiles} from '../supernote/fileSystem';
import {getTitles, NoteTitle} from '../supernote/noteTitles';
import {recycleElements} from '../supernote/sdkElements';
import {log} from '../utils/log';
import {readAllKeywords} from './sharedNotePages';

interface ReadNotebook {
  mtimeMs: number;
  keywords: PageKeyword[];
  titles: ContentsTitle[];
}

const cache = new Map<string, ReadNotebook>();

/** How many files the Contents cache holds (the debug bundle's count). */
export function cachedContentsCount(): number {
  return cache.size;
}

/** The typed text of the textbox `title` covers on its page, or null (handwriting, or nothing found). */
function coveredText(title: NoteTitle, elements: Awaited<ReturnType<typeof getElements>>): string | null {
  const covered = elements.find(el => (title.controlTrailNums ?? []).includes(el.numInPage) && el.textBox?.textContentFull);
  return covered?.textBox?.textContentFull ?? null;
}

async function readNotebook(path: string, mtimeMs: number, item: ContentsItem, today: string): Promise<ReadNotebook> {
  const start = Date.now();
  const {keywords, totalPages} = await readAllKeywords(path);
  const titles = await getTitles(path, Array.from({length: Math.max(0, totalPages)}, (_, i) => i));
  const own = gtdparaPages(keywords, item, today);
  const byPage = new Map<number, NoteTitle[]>();
  for (const title of titles) {
    if (!own.has(title.page)) byPage.set(title.page, [...(byPage.get(title.page) ?? []), title]);
  }
  const read: ContentsTitle[] = titles.filter(t => own.has(t.page)).map(t => ({page: t.page, y: t.Y, text: null}));
  for (const [page, pageTitles] of byPage) {
    const elements = await getElements(page, path);
    try {
      for (const title of pageTitles) read.push({page, y: title.Y, text: coveredText(title, elements)});
    } finally {
      recycleElements(elements);
    }
  }
  log('NotebookContents: read', `${totalPages} pages`, `${titles.length} titles`, `${byPage.size} pages looked up`, `${Date.now() - start} ms`);
  return {mtimeMs, keywords, titles: read};
}

/**
 * The Contents of the notebook at `path` for `item` (its Project or Area).
 * Throws when the note can't be read; the caller says so in the status slot.
 */
export async function loadContents(path: string, item: ContentsItem): Promise<ContentsEntry[]> {
  const today = todayIso();
  const stat = (await statFiles([path]))?.[0];
  const mtimeMs = stat?.exists ? stat.lastModified : -1;
  let read = cache.get(path);
  if (!read || read.mtimeMs !== mtimeMs || mtimeMs < 0) {
    read = await readNotebook(path, mtimeMs, item, today);
    if (mtimeMs >= 0) cache.set(path, read);
  }
  return buildContents({keywords: read.keywords, titles: read.titles, item, today});
}
