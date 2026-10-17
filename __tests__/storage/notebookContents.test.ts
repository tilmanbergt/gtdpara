// docs/dev/history/technical-design-home-notebooks.md §3.5: reading a notebook's Contents - one keyword read, one
// getTitles, textboxes only on pages gtdpara doesn't title, cached per file and modification time.
jest.mock('sn-plugin-lib', () => ({PluginCommAPI: {recycleElement: jest.fn()}, PluginFileAPI: {}}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
let mockMtime = 1;
const mockGetElements = jest.fn(async (page: number, _path: string) =>
  page === 2 ? [{numInPage: 4, textBox: {textContentFull: 'Intent\nmore'}}, {numInPage: 5, textBox: null}] : [],
);
jest.mock('../../src/supernote/fileSystem', () => ({
  statFiles: async (paths: string[]) => paths.map(path => ({path, exists: true, lastModified: mockMtime, size: 1})),
  getElements: (page: number, path: string) => mockGetElements(page, path),
}));
const mockGetTitles = jest.fn(async (_path: string, _pages: number[]) => [
  {page: 0, X: 0, Y: 100, width: 1, height: 1, style: 3, controlTrailNums: [1]},
  {page: 2, X: 0, Y: 300, width: 1, height: 1, style: 3, controlTrailNums: [5]},
  {page: 2, X: 0, Y: 200, width: 1, height: 1, style: 3, controlTrailNums: [4]},
]);
jest.mock('../../src/supernote/noteTitles', () => ({getTitles: (p: string, pages: number[]) => mockGetTitles(p, pages)}));
jest.mock('../../src/storage/sharedNotePages', () => ({
  readAllKeywords: async () => ({keywords: [{page: 0, keyword: 'home'}], totalPages: 3}),
}));

import {cachedContentsCount, loadContents} from '../../src/storage/notebookContents';

const item = {name: 'Lead', tasks: [], meetings: []};

describe('loadContents', () => {
  it('reads once, looks textboxes up only where gtdpara titles nothing, and caches by modification time', async () => {
    const entries = await loadContents('/n/Lead 2026.note', item);
    expect(entries.map(e => [e.page, e.text, e.source])).toEqual([
      [0, 'Lead', 'home'],
      [2, 'Intent', 'typed'],
      [2, 'Handwritten heading', 'handwritten'],
    ]);
    expect(mockGetTitles).toHaveBeenCalledWith('/n/Lead 2026.note', [0, 1, 2]);
    expect(mockGetElements.mock.calls.map(c => c[0])).toEqual([2]);
    expect(cachedContentsCount()).toBe(1);

    await loadContents('/n/Lead 2026.note', {...item, name: 'Leadership'});
    expect(mockGetTitles).toHaveBeenCalledTimes(1);

    mockMtime = 2;
    await loadContents('/n/Lead 2026.note', item);
    expect(mockGetTitles).toHaveBeenCalledTimes(2);
  });
});
