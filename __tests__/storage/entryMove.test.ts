/** moveEntryWithNote (docs/dev/technical-design-files-0.6.md §3.4). */
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

import {moveEntryWithNote} from '../../src/storage/entryMove';
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
