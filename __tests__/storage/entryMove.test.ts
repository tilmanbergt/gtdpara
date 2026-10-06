/** moveEntryWithNote (docs/dev/history/technical-design-files-0.6.md §3.4) and the one move every screen uses, moveTask/moveMeeting. */
const mockExisting = new Set<string>();
const mockMoves: Array<[string, string]> = [];
let mockMoveFails = false;

jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
jest.mock('../../src/supernote/fileSystem', () => ({
  fileExists: async (path: string) => mockExisting.has(path),
  listFolderEntries: async (folder: string) =>
    Array.from(mockExisting)
      .filter(p => p.startsWith(`${folder}/`) && !p.slice(folder.length + 1).includes('/'))
      .map(p => ({name: p.slice(folder.length + 1), path: p, isFolder: false})),
  ensureFolderExists: async () => undefined,
  moveFile: async (from: string, to: string) => {
    if (mockMoveFails) throw new Error('move failed');
    mockExisting.delete(from);
    mockExisting.add(to);
    mockMoves.push([from, to]);
  },
  displayPath: (path: string) => path,
}));

// An in-memory cache and file layer: each "file" is the entry list saved for a folder.
type Entries = {tasks: Task[]; meetings: Meeting[]};
const mockFiles = new Map<string, Entries>();
const mockCached = new Set<string>();
const mockSaves: string[] = [];
let mockSaveFailsFor: string | null = null;
let mockInbox: unknown = null;
const INBOX = '/n/2 Areas/0 Inbox';

function mockState(path: string) {
  const f = mockFiles.get(path) ?? {tasks: [], meetings: []};
  return {rawContent: path, tasks: f.tasks, meetings: f.meetings, taskExtraLines: [], meetingExtraLines: []};
}

jest.mock('../../src/storage/projectFile', () => ({
  loadProjectFile: async (_kind: string, path: string) => mockState(path),
  saveTasks: async (_kind: string, path: string, _raw: string, tasks: Task[]) => {
    if (mockSaveFailsFor === path) throw new Error('save failed');
    mockFiles.set(path, {...(mockFiles.get(path) ?? {tasks: [], meetings: []}), tasks});
    mockSaves.push(`tasks ${path}`);
    return path;
  },
  saveMeetings: async (_kind: string, path: string, _raw: string, meetings: Meeting[]) => {
    if (mockSaveFailsFor === path) throw new Error('save failed');
    mockFiles.set(path, {...(mockFiles.get(path) ?? {tasks: [], meetings: []}), meetings});
    mockSaves.push(`meetings ${path}`);
    return path;
  },
}));
jest.mock('../../src/storage/dataCache', () => ({
  getCachedData: () => ({paths: {inboxFolder: INBOX}}),
  getCachedInbox: () => mockInbox,
  setCachedInbox: (next: unknown) => {
    mockInbox = next;
  },
  findCachedItem: (path: string) => (mockCached.has(path) ? {kind: 'project', name: path, path, ...mockState(path)} : undefined),
  ensureItemCached: async (kind: string, name: string, path: string) => {
    mockCached.add(path);
    return {kind, name, path, ...mockState(path)};
  },
  updateItemTasks: () => undefined,
  updateItemMeetings: () => undefined,
}));

import {itemTarget, moveEntryWithNote, moveMeeting, moveTask} from '../../src/storage/entryMove';
import {Meeting, Task} from '../../src/domain/types';
import {meeting, task} from '../../test-helpers/fixtures';

const A = '/n/1 Projects/Alpha';
const B = '/n/1 Projects/Beta';

function ui(answer: boolean) {
  return {
    confirm: jest.fn(async (_text: {text: string; detail: string; actionLabel: string}) => answer),
    done: jest.fn((_text: string): void => undefined),
  };
}

beforeEach(() => {
  mockExisting.clear();
  mockMoves.length = 0;
  mockMoveFails = false;
  mockFiles.clear();
  mockCached.clear();
  mockSaves.length = 0;
  mockSaveFailsFor = null;
  mockInbox = null;
});

describe('moveEntryWithNote', () => {
  it('writes without asking when there is no note', async () => {
    const write = jest.fn(async () => undefined);
    const u = ui(true);
    expect(await moveEntryWithNote({entry: task('Call'), entryKind: 'task', sourceFolder: A, target: {path: B, name: 'Beta'}}, u, write)).toBe(true);
    expect(u.confirm).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith(task('Call'));
  });

  it('writes nothing when the user cancels', async () => {
    mockExisting.add(`${A}/Todos/Call.note`);
    const write = jest.fn(async () => undefined);
    const moved = await moveEntryWithNote(
      {entry: task('Call', {notePath: 'Todos/Call.note'}), entryKind: 'task', sourceFolder: A, target: {path: B, name: 'Beta'}},
      ui(false),
      write,
    );
    expect(moved).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(mockMoves).toEqual([]);
  });

  it('moves an own note first, then writes, then reports', async () => {
    mockExisting.add(`${A}/Todos/Call.note`);
    mockExisting.add(`${B}/Todos/Call.note`); // taken in the target
    const order: string[] = [];
    const u = ui(true);
    u.done.mockImplementation(() => {
      order.push('done');
    });
    const write = jest.fn(async (entry: {notePath: string}) => {
      order.push(`write ${entry.notePath} after ${mockMoves.length} move`);
    });
    await moveEntryWithNote({entry: task('Call', {notePath: 'Todos/Call.note'}), entryKind: 'task', sourceFolder: A, target: {path: B, name: 'Beta'}}, u, write);
    expect(mockMoves).toEqual([[`${A}/Todos/Call.note`, `${B}/Todos/Call (2).note`]]);
    expect(order).toEqual(['write Todos/Call (2).note after 1 move', 'done']);
    expect(u.confirm.mock.calls[0][0].text).toContain('Its note Call.note moves along');
  });

  it('keeps a shared page and links it absolutely', async () => {
    const file = `${A}/Meetings/Coaching 2026.note`;
    mockExisting.add(file);
    const write = jest.fn(async () => undefined);
    const u = ui(true);
    await moveEntryWithNote(
      {entry: meeting('2026-10-07', 'Session', {notePath: 'Meetings/Coaching 2026.note#2026-10-07 Session'}), entryKind: 'meeting', sourceFolder: A, target: {path: B, name: 'Beta'}},
      u,
      write,
    );
    expect(mockMoves).toEqual([]);
    expect(write).toHaveBeenCalledWith(expect.objectContaining({notePath: `${file}#2026-10-07 Session`}));
    expect(u.confirm.mock.calls[0][0].text).toContain('Its page stays in Coaching 2026.note');
    expect(u.done).not.toHaveBeenCalled();
  });

  it('writes no data file when the note move fails', async () => {
    mockExisting.add(`${A}/Todos/Call.note`);
    mockMoveFails = true;
    const write = jest.fn(async () => undefined);
    await expect(
      moveEntryWithNote({entry: task('Call', {notePath: 'Todos/Call.note'}), entryKind: 'task', sourceFolder: A, target: {path: B, name: 'Beta'}}, ui(true), write),
    ).rejects.toThrow('move failed');
    expect(write).not.toHaveBeenCalled();
  });

  it('moves the entry without asking when its own note file is gone', async () => {
    const write = jest.fn(async () => undefined);
    const u = ui(true);
    await moveEntryWithNote({entry: task('Call', {notePath: 'Todos/Call.note'}), entryKind: 'task', sourceFolder: A, target: {path: B, name: 'Beta'}}, u, write);
    expect(u.confirm).not.toHaveBeenCalled();
    expect(write).toHaveBeenCalledWith(expect.objectContaining({notePath: 'Todos/Call.note'}));
  });
});

describe('moveTask / moveMeeting', () => {
  const beta = itemTarget({kind: 'project', name: 'Beta', path: B});

  function seed(path: string, entries: Partial<Entries>, cached = true) {
    mockFiles.set(path, {tasks: [], meetings: [], ...entries});
    if (cached) mockCached.add(path);
  }

  it('moves a todo from one item to another: target first, then source', async () => {
    seed(A, {tasks: [task('Keep'), task('Call')]});
    seed(B, {tasks: [task('Other')]});
    const moved = await moveTask({kind: 'project', path: A}, 1, task('Call (edited)'), beta, ui(true));
    expect(moved?.text).toBe('Call (edited)');
    expect(mockFiles.get(B)?.tasks.map(t => t.text)).toEqual(['Other', 'Call (edited)']);
    expect(mockFiles.get(A)?.tasks.map(t => t.text)).toEqual(['Keep']);
    expect(mockSaves).toEqual([`tasks ${B}`, `tasks ${A}`]);
  });

  it('moves a meeting from an item to the Inbox and updates the shared Inbox', async () => {
    seed(A, {meetings: [meeting('2026-10-07', 'Sync')]});
    seed(INBOX, {meetings: []}, false);
    const moved = await moveMeeting({kind: 'project', path: A}, 0, meeting('2026-10-07', 'Sync'), {type: 'inbox'}, ui(true));
    expect(moved?.title).toBe('Sync');
    expect(mockFiles.get(INBOX)?.meetings.map(m => m.title)).toEqual(['Sync']);
    expect(mockFiles.get(A)?.meetings).toEqual([]);
    expect((mockInbox as Entries).meetings.map(m => m.title)).toEqual(['Sync']);
  });

  it('files a todo from the Inbox into an item', async () => {
    seed(INBOX, {tasks: [task('Buy milk'), task('Call')]}, false);
    mockInbox = mockState(INBOX);
    await moveTask({kind: 'inbox', path: INBOX}, 0, task('Buy milk'), beta, ui(true));
    expect(mockFiles.get(B)?.tasks.map(t => t.text)).toEqual(['Buy milk']);
    expect(mockFiles.get(INBOX)?.tasks.map(t => t.text)).toEqual(['Call']);
    expect((mockInbox as Entries).tasks.map(t => t.text)).toEqual(['Call']);
  });

  it('leaves a duplicate, never a loss, when removing from the source fails', async () => {
    seed(A, {tasks: [task('Call')]});
    mockSaveFailsFor = A;
    await expect(moveTask({kind: 'project', path: A}, 0, task('Call'), beta, ui(true))).rejects.toThrow('save failed');
    expect(mockFiles.get(B)?.tasks.map(t => t.text)).toEqual(['Call']);
    expect(mockFiles.get(A)?.tasks.map(t => t.text)).toEqual(['Call']);
  });

  it('writes nothing when the user cancels the note confirm', async () => {
    seed(A, {tasks: [task('Call', {notePath: 'Todos/Call.note'})]});
    mockExisting.add(`${A}/Todos/Call.note`);
    const moved = await moveTask({kind: 'project', path: A}, 0, task('Call', {notePath: 'Todos/Call.note'}), beta, ui(false));
    expect(moved).toBeNull();
    expect(mockSaves).toEqual([]);
  });
});
