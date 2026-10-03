const mockListFolderEntries = jest.fn(async (_path: string) => [] as Array<{name: string; isFolder: boolean}>);
const mockEnsureFolderExists = jest.fn(async (_path: string) => undefined);
const mockWriteTextFile = jest.fn(async (_path: string, _content: string) => undefined);

jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
jest.mock('../../src/supernote/fileSystem', () => ({
  listFolderEntries: (path: string) => mockListFolderEntries(path),
  ensureFolderExists: (path: string) => mockEnsureFolderExists(path),
  writeTextFile: (path: string, content: string) => mockWriteTextFile(path, content),
}));
jest.mock('../../src/supernote/pluginPermissions', () => ({ensureFileReadPermission: jest.fn(async () => true)}));
jest.mock('../../src/storage/dataCache', () => ({
  ensureItemCached: jest.fn(async (kind: string, name: string, path: string) => ({kind, name, path})),
  assignDefaultAbbrevIfMissing: jest.fn(async () => undefined),
}));

import {createItem} from '../../src/storage/createItem';
import {DEFAULT_SETTINGS} from '../../src/domain/settings';

describe('createItem name rule', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects # and names the character, creating nothing', async () => {
    await expect(createItem('project', 'A#B', DEFAULT_SETTINGS)).rejects.toThrow('A name can\'t contain "#".');
    expect(mockEnsureFolderExists).not.toHaveBeenCalled();
    expect(mockWriteTextFile).not.toHaveBeenCalled();
  });

  it('lists several forbidden characters once each', async () => {
    await expect(createItem('area', 'x[1]/y[2]', DEFAULT_SETTINGS)).rejects.toThrow(
      'A name can\'t contain "[", "]", "/".',
    );
  });

  it('creates a valid name', async () => {
    const item = await createItem('project', 'Garden 2026', DEFAULT_SETTINGS);
    expect(item.name).toBe('Garden 2026');
    expect(mockEnsureFolderExists).toHaveBeenCalledTimes(1);
    expect(mockWriteTextFile).toHaveBeenCalledTimes(1);
  });
});
