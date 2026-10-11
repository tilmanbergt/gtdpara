/** Saving a loop edit (docs/dev/history/technical-design-loops.md §4.6): renames are asked, then written in one go. */
const mockWrites: Array<[string, string]> = [];
const mockMoves: Array<[string, string]> = [];
const mockExisting = new Set<string>();
let mockItem: unknown = null;

jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
jest.mock('../../src/supernote/fileSystem', () => ({
  writeTextFile: async (path: string, content: string) => {
    mockWrites.push([path, content]);
  },
  fileExists: async (path: string) => mockExisting.has(path),
  moveFile: async (from: string, to: string) => {
    mockMoves.push([from, to]);
  },
  readTextFile: async () => null,
}));
jest.mock('../../src/storage/dataCache', () => ({
  setTasksWrittenHook: () => undefined,
  findCachedItem: () => mockItem,
  applyItemRawContent: () => undefined,
  updateItemLoops: () => undefined,
}));
jest.mock('../../src/storage/loopKinds', () => ({
  getLoopKinds: () => ({kinds: ['workshop'], rules: {}}),
}));
jest.mock('../../src/storage/noteLinks', () => ({sanitizeFileNameComponent: (name: string) => name}));

import {newLoopLine} from '../../src/domain/loopsSection';
import {parseLoopEdit} from '../../src/domain/loopEdit';
import {updateLoop} from '../../src/storage/loops';
import {item, meeting, task} from '../../test-helpers/fixtures';

const owner = () =>
  item('area', 'Atruvia', {
    tasks: [task('Book room #workshop/offsite', {notePath: '2026-11 workshop offsite.note#page=2'})],
    meetings: [meeting('2026-11-01', 'Kickoff #workshop/offsite')],
    loops: [newLoopLine('workshop/offsite', '2026-11-14')],
  });
const edit = (line: string) => parseLoopEdit(line, ['workshop'])!;
const NOTE = '/Note/2 Areas/Atruvia/2026-11 workshop offsite.note';

beforeEach(() => {
  mockWrites.length = 0;
  mockMoves.length = 0;
  mockExisting.clear();
  mockItem = owner();
});

describe('updateLoop', () => {
  it('saves a new main date in the same month without asking', async () => {
    mockExisting.add(NOTE);
    const ask = jest.fn(async () => true);
    expect(await updateLoop('/Note/2 Areas/Atruvia', 'workshop/offsite', edit('#workshop/offsite [due:: 2026-11-20]'), '', ask)).toBe(true);
    expect(ask).not.toHaveBeenCalled();
    expect(mockMoves).toEqual([]);
    expect(mockWrites[0][1]).toContain('- workshop/offsite: active, 2026-11-20');
  });

  it('asks before moving the note to its new month, and links follow', async () => {
    mockExisting.add(NOTE);
    const ask = jest.fn(async () => true);
    await updateLoop('/Note/2 Areas/Atruvia', 'workshop/offsite', edit('#workshop/offsite [due:: 2026-12-02]'), '', ask);
    expect(ask).toHaveBeenCalledTimes(1);
    expect(mockMoves).toEqual([[NOTE, '/Note/2 Areas/Atruvia/2026-12 workshop offsite.note']]);
    expect(mockWrites[0][1]).toContain('→ [[2026-12 workshop offsite.note#page=2]]');
  });

  it('renames the tag after a confirm; declining saves nothing', async () => {
    const no = jest.fn(async () => false);
    expect(await updateLoop('/Note/2 Areas/Atruvia', 'workshop/offsite', edit('#workshop/team [due:: 2026-11-14]'), '', no)).toBe(false);
    expect(mockWrites).toEqual([]);
    const yes = jest.fn(async () => true);
    expect(await updateLoop('/Note/2 Areas/Atruvia', 'workshop/offsite', edit('#workshop/team [due:: 2026-11-14]'), '', yes)).toBe(true);
    const written = mockWrites[0][1];
    expect(written).toContain('- workshop/team: active, 2026-11-14');
    expect(written).toContain('Book room #workshop/team');
    expect(written).toContain('Kickoff #workshop/team');
  });

  it('refuses a tag that has a loop already', async () => {
    mockItem = {...owner(), loops: [newLoopLine('workshop/offsite'), newLoopLine('workshop/team')]};
    await expect(updateLoop('/Note/2 Areas/Atruvia', 'workshop/offsite', edit('#workshop/team'), '', async () => true)).rejects.toThrow(
      'Loop workshop/team exists already in Atruvia.',
    );
  });
});
