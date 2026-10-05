/**
 * storage/markStore.ts (docs/dev/technical-design-lasso-0.8.md §3.6): mark
 * lines are written from the file on disk, one change at a time, and the
 * cache is updated so a later task save keeps them.
 */
const mockFiles = new Map<string, string>();
const mockWrites: string[] = [];
let mockWriteDelay = 0;

jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
jest.mock('../../src/supernote/pluginPermissions', () => ({ensureFileReadPermission: jest.fn(async () => true)}));
jest.mock('../../src/supernote/fileSystem', () => ({
  listFolderEntries: async (folder: string) => {
    if (folder.endsWith('1 Projects')) return [{name: 'Garden', path: `${folder}/Garden`, isFolder: true}];
    return [];
  },
  readTextFile: async (path: string) => mockFiles.get(path) ?? null,
  writeTextFile: async (path: string, content: string) => {
    if (mockWriteDelay) await new Promise(r => setTimeout(r, mockWriteDelay));
    mockWrites.push(path);
    mockFiles.set(path, content);
  },
  statFiles: async () => null,
}));
jest.mock('../../src/storage/inboxMigration', () => ({
  migrateInboxIfNeeded: async () => ({kind: 'none'}),
  effectiveInboxFolderFor: async (paths: {inboxFolder: string}) => paths.inboxFolder,
  hiddenAreaFolderFor: (paths: {inboxFolder: string}) => paths.inboxFolder,
}));

import {parseMarksSpan} from '../../src/domain/markdown';
import {DEFAULT_SETTINGS, resolvePaths} from '../../src/domain/settings';
import {Mark} from '../../src/domain/types';
import {clearCachedData, findCachedItem, getCachedInbox, rebuildCache} from '../../src/storage/dataCache';
import {addTaskToDestination} from '../../src/storage/itemMutations';
import {
  addMarkLine,
  addMarkToContent,
  markFileRef,
  markNotePathFor,
  removeMarkFromContent,
  removeMarkLine,
} from '../../src/storage/markStore';
import {buildTask} from '../../src/storage/itemMutations';

const paths = resolvePaths(DEFAULT_SETTINGS);
const GARDEN = `${paths.projects}/Garden`;
const GARDEN_FILE = `${GARDEN}/project.txt`;
const INBOX_FILE = paths.inbox;
const gardenRef = markFileRef({type: 'item', kind: 'project', name: 'Garden', path: GARDEN}, paths);
const inboxRef = markFileRef({type: 'inbox'}, paths);

const mark = (n: number, notePath = 'Plan.note'): Mark => ({
  id: `m-20261005-10421${n}-00${n}`,
  createdAt: '2026-10-05 10:42',
  notePath,
  page: 0,
  text: null,
});

beforeEach(() => {
  mockFiles.clear();
  mockWrites.length = 0;
  mockWriteDelay = 0;
  clearCachedData();
  mockFiles.set(GARDEN_FILE, '---\nkind: project\nabbrev: GR\n---\n\n## Tasks\n- [ ] Order soil\n\n## Meetings\n');
});

describe('pure content helpers', () => {
  it('adds once and removes', () => {
    const once = addMarkToContent('', 'inbox', mark(1));
    expect(addMarkToContent(once, 'inbox', mark(1))).toBe(once);
    expect(parseMarksSpan(once).marks).toHaveLength(1);
    expect(removeMarkFromContent(once, mark(1).id)).not.toContain('^m-');
    expect(removeMarkFromContent(once, 'm-20991231-000000-000')).toBeNull();
  });
  it('writes the path relative inside the item, absolute in the Inbox', () => {
    expect(markNotePathFor(gardenRef, `${GARDEN}/Meetings/Sync.note`)).toBe('Meetings/Sync.note');
    expect(markNotePathFor(inboxRef, `${paths.inboxFolder}/Todos/x.note`)).toBe(`${paths.inboxFolder}/Todos/x.note`);
  });
});

describe('addMarkLine / removeMarkLine', () => {
  it('works without any cache (the Mark button case) and creates the Inbox file if missing', async () => {
    await addMarkLine(inboxRef, mark(1, '/storage/emulated/0/Document/x.pdf'));
    expect(parseMarksSpan(mockFiles.get(INBOX_FILE)!).marks.map(m => m.notePath)).toEqual([
      '/storage/emulated/0/Document/x.pdf',
    ]);
  });

  it('serializes quick changes so none is lost', async () => {
    mockWriteDelay = 5;
    await Promise.all([addMarkLine(gardenRef, mark(1)), addMarkLine(gardenRef, mark(2)), addMarkLine(gardenRef, mark(3))]);
    expect(parseMarksSpan(mockFiles.get(GARDEN_FILE)!).marks.map(m => m.id)).toEqual([mark(1).id, mark(2).id, mark(3).id]);
    await Promise.all([removeMarkLine(gardenRef, mark(2).id), addMarkLine(gardenRef, mark(4))]);
    expect(parseMarksSpan(mockFiles.get(GARDEN_FILE)!).marks.map(m => m.id)).toEqual([mark(1).id, mark(3).id, mark(4).id]);
  });

  it('reports a mark that was deleted by hand as gone, without writing', async () => {
    expect(await removeMarkLine(gardenRef, mark(9).id)).toBe(false);
    expect(mockWrites).toEqual([]);
  });

  it('keeps the mark when a todo is saved afterwards from the cached text (regression guard)', async () => {
    await rebuildCache(DEFAULT_SETTINGS);
    expect(findCachedItem(GARDEN)?.marks).toEqual([]);
    await addMarkLine(gardenRef, mark(1));
    expect(findCachedItem(GARDEN)?.marks.map(m => m.id)).toEqual([mark(1).id]);
    await addTaskToDestination(buildTask('Measure beds'), {type: 'item', kind: 'project', name: 'Garden', path: GARDEN}, {
      inbox: getCachedInbox(),
      inboxPath: paths.inboxFolder,
    });
    const saved = mockFiles.get(GARDEN_FILE)!;
    expect(saved).toContain('Measure beds');
    expect(parseMarksSpan(saved).marks.map(m => m.id)).toEqual([mark(1).id]);
  });

  it('updates the cached Inbox', async () => {
    await rebuildCache(DEFAULT_SETTINGS);
    await addMarkLine(inboxRef, mark(5, '/a/b.note'));
    expect(getCachedInbox()?.marks.map(m => m.id)).toEqual([mark(5).id]);
    await removeMarkLine(inboxRef, mark(5).id);
    expect(getCachedInbox()?.marks).toEqual([]);
  });
});
