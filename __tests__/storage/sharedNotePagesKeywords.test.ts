// docs/dev/history/technical-design-keyword-length.md §4.3: a keyword the Supernote refuses
// never leaves a page without a keyword, and a rename adds the new keyword before it deletes
// the old one.

const mockCalls: string[] = [];
let mockFailInsertKeyword = false;

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('sn-plugin-lib', () => ({PluginCommAPI: {recycleElement: jest.fn()}}));
jest.mock('../../src/supernote/fileSystem', () => ({
  getNoteTotalPageNum: jest.fn(async () => 2),
  getKeyWords: jest.fn(async () => {
    mockCalls.push('getKeyWords');
    return [
      {page: 0, keyword: '2026-10-01', index: 1},
      {page: 1, keyword: 'Old text', index: 1},
      {page: 1, keyword: 'New text', index: 2},
    ];
  }),
  insertNotePage: jest.fn(async () => {
    mockCalls.push('insertNotePage');
  }),
  insertKeyWord: jest.fn(async (_f: string, _p: number, keyword: string) => {
    mockCalls.push(`insertKeyWord ${keyword}`);
    if (mockFailInsertKeyword) throw new Error('The keyword exceeds the maximum length limit.');
  }),
  deleteKeyWord: jest.fn(async (_f: string, _p: number, index: number) => {
    mockCalls.push(`deleteKeyWord ${index}`);
  }),
  recordDebugLogEntry: jest.fn(async () => undefined),
}));

import {insertItemPage, renameKeywordAt} from '../../src/storage/sharedNotePages';

beforeEach(() => {
  mockCalls.length = 0;
  mockFailInsertKeyword = false;
});

describe('insertItemPage', () => {
  it('refuses a keyword over 43 characters before writing anything', async () => {
    await expect(insertItemPage('/n.note', 'x'.repeat(44), 'style_white', '2026-10-19')).rejects.toThrow('43');
    expect(mockCalls).toEqual([]);
  });

  it('inserts the page, then its keyword', async () => {
    await insertItemPage('/n.note', 'Fits', 'style_white', '2026-10-19');
    expect(mockCalls.filter(c => c !== 'getKeyWords')).toEqual(['insertNotePage', 'insertKeyWord Fits']);
  });
});

describe('renameKeywordAt', () => {
  it('adds the new keyword before deleting the old one', async () => {
    await renameKeywordAt('/n.note', 1, 'Old text', 'New text');
    expect(mockCalls).toEqual(['insertKeyWord New text', 'getKeyWords', 'deleteKeyWord 1']);
  });

  it('keeps the old keyword when adding the new one fails', async () => {
    mockFailInsertKeyword = true;
    await expect(renameKeywordAt('/n.note', 1, 'Old text', 'New text')).rejects.toThrow();
    expect(mockCalls).toEqual(['insertKeyWord New text']);
  });

  it('refuses a new keyword over 43 characters without touching the page', async () => {
    await expect(renameKeywordAt('/n.note', 1, 'Old text', 'y'.repeat(44))).rejects.toThrow('43');
    expect(mockCalls).toEqual([]);
  });
});
