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
import {
  buildContents,
  ContentsEntry,
  ContentsItem,
  ContentsTitle,
  gtdparaPages,
  headingText,
  PageElementForHeading,
  PageRect,
} from '../domain/notebookContents';
import {todayIso} from '../domain/meetingTime';
import {PageKeyword} from '../domain/sharedNotePages';
import {getElements, statFiles} from '../supernote/fileSystem';
import {ElementWithTitle, getTitles, NoteTitle} from '../supernote/noteTitles';
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

/** A heading's rectangle as getTitles reports it. */
export function titleRect(title: Pick<NoteTitle, 'X' | 'Y' | 'width' | 'height'>): PageRect {
  return {left: title.X, top: title.Y, right: title.X + title.width, bottom: title.Y + title.height};
}

/** A page's elements as domain/notebookContents.ts's `headingText` reads them. */
export function headingElementsOf(elements: readonly ElementWithTitle[]): PageElementForHeading[] {
  return elements.map(el => ({
    numInPage: el.numInPage,
    textbox: el.textBox?.textRect ? {rect: el.textBox.textRect, text: el.textBox.textContentFull ?? ''} : null,
    title: el.title ? {rect: titleRect(el.title), trail: el.title.controlTrailNums ?? []} : null,
  }));
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
      const onPage = headingElementsOf(elements);
      for (const title of pageTitles) read.push({page, y: title.Y, text: headingText({rect: titleRect(title), trail: title.controlTrailNums ?? []}, onPage)});
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
