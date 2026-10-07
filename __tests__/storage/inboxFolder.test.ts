/** Renaming the Inbox folder against an in-memory file system. */
const mockFiles = new Map<string, string>();
const mockFolders = new Set<string>();

function mockParentOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/'));
}
function mockAddFolder(path: string): void {
  for (let p = path; p && p !== '/storage'; p = mockParentOf(p)) mockFolders.add(p);
}
function mockWriteFile(path: string, content: string): void {
  mockAddFolder(mockParentOf(path));
  mockFiles.set(path, content);
}
function mockChildren(folder: string): Array<{name: string; path: string; isFolder: boolean}> {
  const out = new Map<string, {name: string; path: string; isFolder: boolean}>();
  for (const f of mockFolders) if (mockParentOf(f) === folder) out.set(f, {name: f.slice(folder.length + 1), path: f, isFolder: true});
  for (const f of mockFiles.keys()) if (mockParentOf(f) === folder) out.set(f, {name: f.slice(folder.length + 1), path: f, isFolder: false});
  return [...out.values()];
}
function mockMoveTree(from: string, to: string): void {
  for (const f of [...mockFolders]) {
    if (f === from || f.startsWith(`${from}/`)) {
      mockFolders.delete(f);
      mockFolders.add(to + f.slice(from.length));
    }
  }
  for (const [f, c] of [...mockFiles]) {
    if (f.startsWith(`${from}/`)) {
      mockFiles.delete(f);
      mockFiles.set(to + f.slice(from.length), c);
    }
  }
  mockAddFolder(mockParentOf(to));
}

// Quiet: the rename logs.
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));

jest.mock('../../src/supernote/fileSystem', () => ({
  listFolderEntries: jest.fn(async (folder: string) => mockChildren(folder)),
  readTextFile: jest.fn(async (path: string) => mockFiles.get(path) ?? null),
  writeTextFile: jest.fn(async (path: string, content: string) => mockWriteFile(path, content)),
  ensureFolderExists: jest.fn(async (path: string) => mockAddFolder(path)),
  folderExists: jest.fn(async (path: string) => mockFolders.has(path)),
  moveFile: jest.fn(async (from: string, to: string) => {
    if (mockFiles.has(to)) throw new Error('exists');
    mockWriteFile(to, mockFiles.get(from)!);
    mockFiles.delete(from);
  }),
  moveFolder: jest.fn(async (from: string, to: string) => {
    if (mockFolders.has(to)) throw new Error('exists');
    mockMoveTree(from, to);
  }),
  moveFolderMerge: jest.fn(async (from: string, to: string) => mockMoveTree(from, to)),
}));

import {DEFAULT_SETTINGS} from '../../src/domain/settings';
import {renameInboxFolderForSave} from '../../src/storage/inboxFolder';

const BASE = '/storage/emulated/0/Note';
const NEW = `${BASE}/2 Areas/0 Inbox`;

const inboxFile = (tasks: string[]) => ['---', 'kind: inbox', '---', '', '## Tasks', '', ...tasks, '', '## Meetings', '', ''].join('\n');

beforeEach(() => {
  mockFiles.clear();
  mockFolders.clear();
});

describe('renameInboxFolderForSave', () => {
  it('moves the folder, refuses an existing name, leaves it alone when Areas changes too', async () => {
    mockWriteFile(`${NEW}/Inbox.txt`, inboxFile([]));
    mockWriteFile(`${BASE}/2 Areas/Home/area.txt`, 'x');
    const stored = DEFAULT_SETTINGS;
    await expect(renameInboxFolderForSave(stored, {...stored, inboxFolder: 'Home'})).rejects.toThrow('already exists');
    await expect(renameInboxFolderForSave(stored, {...stored, inboxFolder: 'a/b'})).rejects.toThrow('slash');
    expect(await renameInboxFolderForSave(stored, {...stored, inboxFolder: '0 Inbox'})).toBe('unchanged');
    expect(await renameInboxFolderForSave(stored, {...stored, inboxFolder: 'Inbox', areasFolder: 'Areas'})).toBe('notMoved');
    expect(await renameInboxFolderForSave(stored, {...stored, inboxFolder: 'Inbox'})).toBe('moved');
    expect(mockFiles.has(`${BASE}/2 Areas/Inbox/Inbox.txt`)).toBe(true);
    expect(mockFiles.has(`${NEW}/Inbox.txt`)).toBe(false);
  });
});
