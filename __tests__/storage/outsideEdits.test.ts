/**
 * The cache stays true to the file when a save meets an outside edit
 * (docs/dev/history/technical-design-quality-hardening.md §3.2): a kept edit to
 * another part shows up in every parsed field, a conflicting one replaces the
 * cached item, and the Inbox behaves the same.
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
import {writeScopeIntoContent} from '../../src/domain/markdown';
import {
  clearCachedData,
  findCachedItem,
  getCachedInbox,
  rebuildCache,
  setCachedInbox,
  updateItemTasks,
} from '../../src/storage/dataCache';
import {saveMeetings, saveTasks} from '../../src/storage/projectFile';
import {FileConflictError} from '../../src/storage/dataFileWrite';
import {newTask} from '../../src/domain/taskEdit';

const paths = resolvePaths(DEFAULT_SETTINGS);
const alphaDir = `${paths.projects}/Alpha`;
const alphaFile = `${alphaDir}/project.txt`;
const ALPHA = '---\nkind: project\nabbrev: AL\n---\n\n## Scope\nOld scope\n\n## Tasks\n- [ ] alpha task\n\n## Meetings\n';
const INBOX = '---\nkind: inbox\n---\n\n## Tasks\n- [ ] inbox task\n\n## Meetings\n';

beforeEach(async () => {
  mockFiles.clear();
  mockFolders.clear();
  mockFolders.set(paths.projects, ['Alpha']);
  mockFolders.set(paths.areas, ['0 Inbox']);
  mockPut(alphaFile, ALPHA);
  mockPut(paths.inbox, INBOX);
  clearCachedData();
  await rebuildCache(DEFAULT_SETTINGS);
});

it('a todo saved after an outside Scope edit keeps the Scope, in the file and in the cache', async () => {
  mockPut(alphaFile, writeScopeIntoContent(ALPHA, 'Scope from Obsidian'));
  const item = findCachedItem(alphaDir)!;
  const tasks = [...item.tasks, newTask({text: 'new task'})];
  const next = await saveTasks('project', alphaDir, item.rawContent, tasks, item.taskExtraLines);
  updateItemTasks(alphaDir, next, tasks, item.taskExtraLines);
  expect(mockFiles.get(alphaFile)?.content).toContain('Scope from Obsidian');
  expect(mockFiles.get(alphaFile)?.content).toContain('- [ ] new task');
  expect(findCachedItem(alphaDir)!.scope).toBe('Scope from Obsidian');
  expect(findCachedItem(alphaDir)!.tasks.map(t => t.text)).toEqual(['alpha task', 'new task']);
});

it('a todo saved after an outside todo edit writes nothing and shows the outside version', async () => {
  const outside = ALPHA.replace('- [ ] alpha task', '- [ ] alpha task, edited outside');
  mockPut(alphaFile, outside);
  const item = findCachedItem(alphaDir)!;
  const tasks = [...item.tasks, newTask({text: 'new task'})];
  await expect(saveTasks('project', alphaDir, item.rawContent, tasks, item.taskExtraLines)).rejects.toBeInstanceOf(
    FileConflictError,
  );
  expect(mockFiles.get(alphaFile)?.content).toBe(outside);
  expect(findCachedItem(alphaDir)!.tasks.map(t => t.text)).toEqual(['alpha task, edited outside']);
});

it('an Inbox meeting saved after an outside todo edit keeps the todo in the shared Inbox state', async () => {
  mockPut(paths.inbox, INBOX.replace('- [ ] inbox task', '- [ ] inbox task\n- [ ] added outside'));
  const inbox = getCachedInbox()!;
  const next = await saveMeetings('inbox', paths.inboxFolder, inbox.rawContent, [], ['- note line']);
  setCachedInbox({...inbox, rawContent: next});
  expect(getCachedInbox()!.tasks.map(t => t.text)).toEqual(['inbox task', 'added outside']);
});
