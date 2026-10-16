// docs/dev/history/technical-design-engage.md §3.4: page → todo or meeting, with the one keyword read.
const mockKeywordCalls: Array<[string, number[]]> = [];
let mockKeywords: Array<{page: number; keyword: string}> | Error = [];
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
jest.mock('../../src/supernote/fileSystem', () => ({
  getKeyWords: async (path: string, pages: number[]) => {
    mockKeywordCalls.push([path, pages]);
    if (mockKeywords instanceof Error) throw mockKeywords;
    return mockKeywords;
  },
}));

import {entryForNotePage} from '../../src/storage/notePageEntry';
import {logError} from '../../src/utils/log';
import {task} from '../../test-helpers/fixtures';

const AREA = '/Note/2 Areas/Coaching';
const ref = {kind: 'area' as const, name: 'Coaching', path: AREA, abbrev: null};
const anna = task('Ask Anna #sparring/anna #next', {notePath: 'Sparring.note#Ask Anna #sparring/anna'});
const bob = task('Ask Bob #sparring/bob', {notePath: 'Sparring.note#Ask Bob #sparring/bob'});
const sources = [{ref, tasks: [anna, bob], meetings: []}];

beforeEach(() => {
  mockKeywordCalls.length = 0;
  mockKeywords = [];
});

describe('entryForNotePage', () => {
  it('finds a todo by its keyword in a shared notebook, reading that one page', async () => {
    mockKeywords = [{page: 5, keyword: 'Ask Bob #sparring/bob'}];
    const hit = await entryForNotePage(`${AREA}/Sparring.note`, 5, sources);
    expect(hit).toMatchObject({kind: 'task', taskIndex: 1});
    expect(mockKeywordCalls).toEqual([[`${AREA}/Sparring.note`, [5]]]);
  });

  it('a direct hit needs no device call', async () => {
    const own = task('Brief', {notePath: 'Todos/Brief.note'});
    expect(await entryForNotePage(`${AREA}/Todos/Brief.note`, 0, [{ref, tasks: [own], meetings: []}])).toMatchObject({kind: 'task', taskIndex: 0});
    expect(mockKeywordCalls).toHaveLength(0);
  });

  it('no page, no candidates or a failing read: no entry', async () => {
    expect(await entryForNotePage(`${AREA}/Sparring.note`, null, sources)).toBeNull();
    expect(await entryForNotePage('/Note/Other.note', 1, sources)).toBeNull();
    expect(mockKeywordCalls).toHaveLength(0);
    mockKeywords = new Error('host');
    expect(await entryForNotePage(`${AREA}/Sparring.note`, 2, sources)).toBeNull();
    expect(logError).toHaveBeenCalledWith('notePageEntry: reading page keywords failed', 'host');
  });
});
