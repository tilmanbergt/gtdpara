/**
 * The Inbox move against an in-memory file system
 * (docs/dev/technical-design-inbox-as-area.md §5).
 */
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

// Quiet: the move logs every step (and a warning in the blocked case, which is tested on purpose).
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

import {DEFAULT_SETTINGS, resolvePaths} from '../../src/domain/settings';
import {
  effectiveInboxFolderFor,
  getInboxMigrationOutcome,
  hiddenAreaFolderFor,
  migrateInboxIfNeeded,
  renameInboxFolderForSave,
  takeInboxMigrationNotice,
} from '../../src/storage/inboxMigration';

const BASE = '/storage/emulated/0/Note';
const paths = resolvePaths(DEFAULT_SETTINGS);
const NEW = `${BASE}/2 Areas/0 Inbox`;

const inboxFile = (tasks: string[]) => ['---', 'kind: inbox', '---', '', '## Tasks', '', ...tasks, '', '## Meetings', '', ''].join('\n');

beforeEach(() => {
  mockFiles.clear();
  mockFolders.clear();
});

describe('migrateInboxIfNeeded', () => {
  it('moves Inbox.txt and its note folders, rewrites links, reports once', async () => {
    mockWriteFile(`${BASE}/Inbox.txt`, inboxFile(['- [ ] Call Bob → [[Todos/Call Bob.note]]', `- [ ] Lasso → [[${BASE}/Todos/Call Bob.note]]`]));
    mockWriteFile(`${BASE}/Todos/Call Bob.note`, 'note');
    mockWriteFile(`${BASE}/Meetings/m.note`, 'meeting');
    mockWriteFile(`${BASE}/2 Areas/Home/area.txt`, ['---', 'kind: area', '---', '', '## Tasks', '', '- [ ] See inbox note +[[Todos/Call Bob.note]]', '', '## Meetings', '', ''].join('\n'));

    const outcome = await migrateInboxIfNeeded(paths);
    expect(outcome).toEqual({state: 'moved', noteFolders: 2, linksRewritten: 2});
    expect(mockFiles.has(`${BASE}/Inbox.txt`)).toBe(false);
    expect(mockFiles.has(`${NEW}/Inbox.txt`)).toBe(true);
    expect(mockFiles.get(`${NEW}/Todos/Call Bob.note`)).toBe('note');
    expect(mockFiles.get(`${NEW}/Meetings/m.note`)).toBe('meeting');
    expect(mockFolders.has(`${BASE}/Todos`)).toBe(false);
    const inbox = mockFiles.get(`${NEW}/Inbox.txt`)!;
    expect(inbox).toContain('[[Todos/Call Bob.note]]'); // relative: unchanged, moved along
    expect(inbox).toContain(`[[${NEW}/Todos/Call Bob.note]]`); // absolute: rewritten
    expect(mockFiles.get(`${BASE}/2 Areas/Home/area.txt`)).toContain('+[[2 Areas/0 Inbox/Todos/Call Bob.note]]');
    expect(await effectiveInboxFolderFor(paths)).toBe(NEW);
    expect(takeInboxMigrationNotice()).toEqual({kind: 'success', text: 'Inbox moved to 2 Areas/0 Inbox; links to its notes updated in 2 files.'});
    expect(takeInboxMigrationNotice()).toBeNull();
    // Once per base per session.
    expect(await migrateInboxIfNeeded(paths)).toBe(outcome);
  });
});

describe('blocked move', () => {
  it('keeps the Inbox at the root when a real Area has the name, and keeps that Area visible', async () => {
    const otherBase = '/storage/emulated/0/Note/b';
    const p = resolvePaths({...DEFAULT_SETTINGS, baseRoot: otherBase});
    mockWriteFile(`${otherBase}/Inbox.txt`, inboxFile(['- [ ] x']));
    mockWriteFile(`${otherBase}/2 Areas/0 Inbox/area.txt`, '---\nkind: area\n---\n');
    expect(await migrateInboxIfNeeded(p)).toEqual({state: 'blocked', reason: 'areaNameClash'});
    expect(mockFiles.has(`${otherBase}/Inbox.txt`)).toBe(true);
    expect(await effectiveInboxFolderFor(p)).toBe(otherBase);
    expect(hiddenAreaFolderFor(p)).toBeNull();
    expect(getInboxMigrationOutcome(otherBase)).toEqual({state: 'blocked', reason: 'areaNameClash'});
    expect(takeInboxMigrationNotice()?.text).toContain('an Area named 0 Inbox exists');
  });
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
