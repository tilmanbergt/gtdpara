/**
 * A stand-in for `sn-plugin-lib` on top of FakeFs
 * (docs/dev/history/technical-design-quality-hardening.md §4.2).
 *
 * A note is a `.note` file whose content is JSON - pages with keywords,
 * titles and the elements the plugin wrote (textboxes, links, title
 * elements) - so moving or renaming it through the file system keeps it. The
 * device state the plugin asks about (the open note and page, the sidebar
 * buttons) lives here. Lasso, stroke recognition and PNG rendering are device
 * only: every call this fake doesn't know answers "not available" and is
 * recorded in `unsupported`, so a scenario that needs one fails visibly.
 */
import {FakeFs} from './fakeFs';

/** An element as the plugin builds it (supernote/fileSystem.ts's `Element`), plus a title element's `title`. */
export interface FakeElement {
  uuid: string;
  type: number;
  pageNum: number;
  layerNum: number;
  numInPage: number;
  userData?: string | null;
  textBox: {textContentFull: string | null} | null;
  link: {fullText: string} | null;
  title?: {controlTrailNums: number[]} | null;
}

interface FakePage {
  keywords: string[];
  /** Headings the host already had on the page (set up by a scenario); title elements the plugin inserts live in `elements`. */
  titles: unknown[];
  elements: FakeElement[];
}

interface FakeNote {
  template: string;
  pages: FakePage[];
}

type Response<T> = {success: boolean; result?: T; error?: {code: number; message: string}};

/** A page with every field set (notes written before elements were modelled have none). */
const blankPage = (p: Partial<FakePage>): FakePage => ({keywords: p.keywords ?? [], titles: p.titles ?? [], elements: p.elements ?? []});

/** Element positions on a page start at 1 (`numInPage`). */
const renumber = (elements: FakeElement[]): FakeElement[] => elements.map((el, i) => ({...el, numInPage: i + 1}));

/** Simple text metrics for `NativeModules.TextboxMetrics`: one line per text line, half the font size per character. */
export const fakeTextboxMetrics = {
  measureTextLayout: async ({text, width, fontSize}: {text: string; width: number; fontSize: number}) => {
    const lines = text.split('\n');
    const longest = Math.max(...lines.map(l => l.length));
    return {layoutHeight: Math.ceil(lines.length * fontSize * 1.2), lineCount: lines.length, maxLineWidth: Math.min(width, longest * fontSize * 0.5)};
  },
};

const ok = <T,>(result: T): Response<T> => ({success: true, result});
const fail = (message: string): Response<never> => ({success: false, error: {code: 1, message}});

export class FakeSdk {
  /** The note the plugin was opened from, or null (opened from a document or the home screen). */
  currentFile: string | null = null;
  currentPage = 0;
  /** Notes the plugin asked the host to open, in order. */
  readonly opened: Array<{path: string; page: number}> = [];
  /** SDK calls this fake doesn't model. */
  readonly unsupported: string[] = [];
  closed = 0;
  private elementCount = 0;
  private buttonListener: ((event: {id: number}) => void) | null = null;

  constructor(private readonly fs: FakeFs) {}

  /** Writes a note the way the host would have made it. */
  putNote(path: string, pages: Array<Partial<FakePage>> = [{}], template = 'style_white'): void {
    const note: FakeNote = {template, pages: pages.map(blankPage)};
    this.fs.put(path, JSON.stringify(note));
  }

  note(path: string): FakeNote | null {
    const text = this.fs.get(path);
    if (!text) return null;
    const note = JSON.parse(text) as FakeNote;
    return {...note, pages: note.pages.map(blankPage)};
  }

  /** Presses one of the plugin's sidebar or toolbar buttons. */
  pressButton(id: number): void {
    if (!this.buttonListener) throw new Error('fakeSdk: no button listener registered (is the app mounted?)');
    this.buttonListener({id});
  }

  private withNote<T>(path: string, run: (note: FakeNote) => Response<T>, write = false): Response<T> {
    const note = this.note(path);
    if (!note) return fail(`no note at ${path}`);
    const result = run(note);
    if (write) this.fs.put(path, JSON.stringify(note));
    return result;
  }

  private onPage(note: FakeNote, page: number, change: (p: FakePage) => unknown): Response<boolean> {
    if (!note.pages[page]) return fail(`no page ${page}`);
    change(note.pages[page]);
    return ok(true);
  }

  private unknown(api: string, name: string): () => Promise<Response<never>> {
    return async () => {
      this.unsupported.push(`${api}.${name}`);
      return fail(`${api}.${name} is not available in the fake device`);
    };
  }

  private api<T extends object>(name: string, known: T): T {
    return new Proxy(known, {
      get: (target, prop) => (prop in target ? target[prop as keyof T] : typeof prop === 'string' ? this.unknown(name, prop) : undefined),
    });
  }

  /** e-ink refreshes the plugin asked for (NativePluginManager.invalidatePluginView). */
  refreshes = 0;

  /** The module object `jest.mock('sn-plugin-lib', …)` returns. */
  readonly module = {
    NativePluginManager: {
      invalidatePluginView: () => {
        this.refreshes += 1;
      },
    },
    PluginManager: this.api('PluginManager', {
      registerButtonListener: (listener: {onButtonPress: (event: {id: number}) => void}) => {
        this.buttonListener = listener.onButtonPress;
        return {remove: () => (this.buttonListener = null)};
      },
      closePluginView: () => {
        this.closed += 1;
      },
      invalidatePluginView: () => undefined,
      hasPermission: async () => true,
      requestPermission: async () => true,
    }),
    PluginCommAPI: this.api('PluginCommAPI', {
      getCurrentFilePath: async () => (this.currentFile ? ok(this.currentFile) : fail('no file open')),
      getCurrentPageNum: async () => ok(this.currentPage),
      getNoteSystemTemplates: async () => [{name: 'style_white', vUri: '', hUri: ''}],
      createElement: async (type: number) => {
        this.elementCount += 1;
        const element: FakeElement = {uuid: `fake-element-${this.elementCount}`, type, pageNum: 0, layerNum: 0, numInPage: 0, userData: null, textBox: null, link: null};
        return ok(element);
      },
      recycleElement: () => undefined,
    }),
    PluginFileAPI: this.api('PluginFileAPI', {
      createNote: async ({notePath, template}: {notePath: string; template: string}) => {
        if (this.fs.exists(notePath)) return fail(`a file exists at ${notePath}`);
        this.putNote(notePath, [{}], template);
        return ok(true);
      },
      openFile: async (path: string, page: number) => {
        if (!this.fs.exists(path)) return fail(`no file at ${path}`);
        this.opened.push({path, page});
        return ok(true);
      },
      getNoteTotalPageNum: async (path: string) => this.withNote(path, n => ok(n.pages.length)),
      insertNotePage: async ({notePath, page}: {notePath: string; page: number}) =>
        this.withNote(
          notePath,
          n => {
            n.pages.splice(page, 0, blankPage({}));
            return ok(true);
          },
          true,
        ),
      getKeyWords: async (path: string, pages: number[]) =>
        this.withNote(path, n =>
          ok(pages.flatMap(page => (n.pages[page]?.keywords ?? []).map((keyword, i) => ({keyword, page, index: i + 1})))),
        ),
      insertKeyWord: async (path: string, page: number, keyword: string) =>
        this.withNote(path, n => this.onPage(n, page, p => p.keywords.push(keyword)), true),
      deleteKeyWord: async (path: string, page: number, index: number) =>
        this.withNote(path, n => this.onPage(n, page, p => p.keywords.splice(index - 1, 1)), true),
      getTitles: async (path: string, pages: number[]) =>
        this.withNote(path, n =>
          ok(pages.flatMap(p => [...(n.pages[p]?.titles ?? []), ...(n.pages[p]?.elements ?? []).flatMap(el => (el.title ? [el.title] : []))])),
        ),
      getPageSize: async () => ok({width: 1404, height: 1872}),
      getElements: async (page: number, path: string) =>
        this.withNote(path, n => (n.pages[page] ? ok(n.pages[page].elements) : fail(`no page ${page}`))),
      insertElements: async (path: string, page: number, elements: FakeElement[]) =>
        this.withNote(
          path,
          n => this.onPage(n, page, p => (p.elements = renumber([...p.elements, ...elements.map(el => JSON.parse(JSON.stringify(el)) as FakeElement)]))),
          true,
        ),
      deleteElements: async (path: string, page: number, nums: number[]) =>
        this.withNote(path, n => this.onPage(n, page, p => (p.elements = renumber(p.elements.filter(el => !nums.includes(el.numInPage))))), true),
    }),
    PluginNoteAPI: this.api('PluginNoteAPI', {}),
    PluginDocAPI: this.api('PluginDocAPI', {}),
  };
}
