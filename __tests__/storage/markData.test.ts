/** storage/markData.ts: orphaned private mark data is removed only when old enough. */
const mockFolders: string[] = [];
const mockDeleted: string[] = [];

jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
jest.mock('../../src/supernote/fileSystem', () => ({
  getPrivateDataDir: async () => '/private/data',
  listFolderEntries: async () => mockFolders.map(name => ({name, path: `/private/data/marks/${name}`, isFolder: true})),
  deletePrivateDataTree: async (path: string) => {
    mockDeleted.push(path);
    return true;
  },
  readTextFile: async () => null,
  writeTextFile: async () => undefined,
}));

import {cleanOrphanedMarkData, markIdAgeMs} from '../../src/storage/markData';

describe('markIdAgeMs', () => {
  it('reads the local time from the id', () => {
    expect(markIdAgeMs('m-20261005-104212-351', new Date(2026, 9, 5, 10, 43, 12))).toBe(60_000);
    expect(markIdAgeMs('nope', new Date())).toBeNull();
  });
});

describe('cleanOrphanedMarkData', () => {
  it('deletes only folders without a line that are older than a day', async () => {
    mockFolders.push('m-20261001-100000-001', 'm-20261001-100000-002', 'm-20261005-090000-003', 'not-a-mark');
    const now = new Date(2026, 9, 5, 10, 0, 0);
    const deleted = await cleanOrphanedMarkData(new Set(['m-20261001-100000-002']), now);
    expect(deleted).toEqual(['m-20261001-100000-001']);
    expect(mockDeleted).toEqual(['/private/data/marks/m-20261001-100000-001']);
  });
});
