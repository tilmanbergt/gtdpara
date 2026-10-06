/**
 * refreshCache (docs/dev/technical-design-files-0.6.md §3.2): only files whose
 * stamp changed are read again, subscribers are notified only on a real
 * change, and a missing cache / changed folders / missing native stat fall
 * back to a full rebuild.
 */
type FakeFile = {content: string; lastModified: number; size: number};
const mockFiles = new Map<string, FakeFile>();
const mockFolders = new Map<string, string[]>(); // folder -> child folder names
const mockReads: string[] = [];
let mockStatAvailable = true;
let mockClock = 1000;

function mockPut(path: string, content: string): void {
  mockClock += 1;
  mockFiles.set(path, {content, lastModified: mockClock, size: content.length});
}

jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
jest.mock('../../src/supernote/pluginPermissions', () => ({ensureFileReadPermission: jest.fn(async () => true)}));
jest.mock('../../src/supernote/fileSystem', () => ({
  listFolderEntries: async (folder: string) =>
    (mockFolders.get(folder) ?? []).map(name => ({name, path: `${folder}/${name}`, isFolder: true})),
  readTextFile: async (path: string) => {
    mockReads.push(path);
    return mockFiles.get(path)?.content ?? null;
  },
  writeTextFile: async (path: string, content: string) => mockPut(path, content),
  statFiles: async (paths: string[]) =>
    mockStatAvailable
      ? paths.map(path => {
          const file = mockFiles.get(path);
          return {path, exists: !!file, lastModified: file?.lastModified ?? 0, size: file?.size ?? -1};
        })
      : null,
}));

import {DEFAULT_SETTINGS, resolvePaths} from '../../src/domain/settings';
import {
  clearCachedData,
  getCachedData,
  getCachedInbox,
  rebuildCache,
  refreshCache,
  subscribeCache,
} from '../../src/storage/dataCache';

const paths = resolvePaths(DEFAULT_SETTINGS);
const projectFile = (name: string) => `${paths.projects}/${name}/project.txt`;
const areaFile = (name: string) => `${paths.areas}/${name}/area.txt`;

function projectText(abbrev: string, task: string): string {
  return `---\nkind: project\nabbrev: ${abbrev}\n---\n\n## Tasks\n- [ ] ${task}\n\n## Meetings\n`;
}

function inboxText(task: string): string {
  return `---\nkind: inbox\n---\n\n## Tasks\n- [ ] ${task}\n\n## Meetings\n`;
}

let notifications = 0;
let unsubscribe: () => void = () => undefined;

beforeEach(async () => {
  mockFiles.clear();
  mockFolders.clear();
  mockStatAvailable = true;
  mockFolders.set(paths.projects, ['Alpha', 'Beta']);
  mockFolders.set(paths.areas, ['Home', '0 Inbox']);
  mockPut(projectFile('Alpha'), projectText('AL', 'alpha task'));
  mockPut(projectFile('Beta'), projectText('BE', 'beta task'));
  mockPut(areaFile('Home'), `---\nkind: area\nabbrev: HO\n---\n\n## Tasks\n\n## Meetings\n`);
  mockPut(paths.inbox, inboxText('inbox task'));
  clearCachedData();
  await rebuildCache(DEFAULT_SETTINGS);
  mockReads.length = 0;
  notifications = 0;
  unsubscribe = subscribeCache(() => {
    notifications += 1;
  });
});

afterEach(() => unsubscribe());

describe('refreshCache', () => {
  it('reads nothing and notifies nobody when no file changed', async () => {
    const before = getCachedData();
    const after = await refreshCache(DEFAULT_SETTINGS);
    expect(mockReads).toEqual([]);
    expect(notifications).toBe(0);
    expect(after).toBe(before);
  });

  it('reads only the changed file and replaces only that item', async () => {
    const beta = getCachedData()!.items.find(i => i.name === 'Beta');
    mockPut(projectFile('Alpha'), projectText('AL', 'edited in Obsidian'));
    await refreshCache(DEFAULT_SETTINGS);
    expect(mockReads).toEqual([projectFile('Alpha')]);
    expect(notifications).toBe(1);
    const items = getCachedData()!.items;
    expect(items.find(i => i.name === 'Alpha')!.tasks[0].text).toBe('edited in Obsidian');
    expect(items.find(i => i.name === 'Beta')).toBe(beta); // untouched object kept
  });

  it('keeps the item and does not notify when only the stamp moved', async () => {
    const alpha = getCachedData()!.items.find(i => i.name === 'Alpha');
    mockPut(projectFile('Alpha'), mockFiles.get(projectFile('Alpha'))!.content); // same text, new time
    await refreshCache(DEFAULT_SETTINGS);
    expect(mockReads).toEqual([projectFile('Alpha')]);
    expect(notifications).toBe(0);
    expect(getCachedData()!.items.find(i => i.name === 'Alpha')).toBe(alpha);
    // The new stamp is remembered: the next refresh reads nothing.
    mockReads.length = 0;
    await refreshCache(DEFAULT_SETTINGS);
    expect(mockReads).toEqual([]);
  });

  it('picks up an added and a removed folder', async () => {
    mockFolders.set(paths.projects, ['Alpha', 'Gamma']);
    mockPut(projectFile('Gamma'), projectText('GA', 'gamma task'));
    await refreshCache(DEFAULT_SETTINGS);
    expect(mockReads).toEqual([projectFile('Gamma')]);
    expect(notifications).toBe(1);
    expect(getCachedData()!.items.map(i => i.name)).toEqual(['Alpha', 'Gamma', 'Home']);
  });

  it('reloads the Inbox when Inbox.txt changed, without notifying item screens', async () => {
    mockPut(paths.inbox, inboxText('captured on the computer'));
    await refreshCache(DEFAULT_SETTINGS);
    expect(mockReads).toEqual([paths.inbox]);
    expect(notifications).toBe(0);
    expect(getCachedInbox()!.tasks[0].text).toBe('captured on the computer');
  });

  it('rebuilds in full when the folders in Settings changed', async () => {
    const settings = {...DEFAULT_SETTINGS, projectsFolder: 'Other Projects'};
    const after = await refreshCache(settings);
    expect(after.paths.projects).toBe(resolvePaths(settings).projects);
    expect(notifications).toBeGreaterThan(0);
  });

  it('rebuilds in full when the native build cannot stat files', async () => {
    mockStatAvailable = false;
    await refreshCache(DEFAULT_SETTINGS);
    expect(mockReads).toEqual(expect.arrayContaining([projectFile('Alpha'), projectFile('Beta'), areaFile('Home'), paths.inbox]));
  });

  it('builds the cache when there is none yet', async () => {
    clearCachedData();
    mockReads.length = 0;
    const after = await refreshCache(DEFAULT_SETTINGS);
    expect(after.items).toHaveLength(3);
    expect(mockReads).toHaveLength(4);
  });
});
