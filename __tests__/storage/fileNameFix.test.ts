/** applyFileNameFixes (docs/dev/technical-design-files-0.6.md §3.5). */
const mockFiles = new Map<string, string>();
const mockMoves: Array<[string, string]> = [];
const mockFailMoveOf = new Set<string>();

jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
jest.mock('../../src/supernote/fileSystem', () => ({
  listFolderEntries: async (folder: string) =>
    Array.from(mockFiles.keys())
      .filter(p => p.startsWith(`${folder}/`) && !p.slice(folder.length + 1).includes('/'))
      .map(p => ({name: p.slice(folder.length + 1), path: p, isFolder: false})),
  moveFile: async (from: string, to: string) => {
    if (mockFailMoveOf.has(from)) throw new Error('locked');
    mockFiles.set(to, mockFiles.get(from) ?? '');
    mockFiles.delete(from);
    mockMoves.push([from, to]);
  },
  readTextFile: async (path: string) => mockFiles.get(path) ?? null,
  writeTextFile: async (path: string, content: string) => {
    mockFiles.set(path, content);
  },
}));
jest.mock('../../src/storage/dataCache', () => ({
  findCachedItem: () => undefined,
  reloadCachedInbox: jest.fn(async () => undefined),
  updateItemTasks: jest.fn(),
  updateItemMeetings: jest.fn(),
}));

import {planFileNameFixes} from '../../src/domain/fileNameFix';
import {applyFileNameFixes} from '../../src/storage/fileNameFix';

const A = '/n/1 Projects/Alpha';
const DATA = `${A}/project.txt`;

beforeEach(() => {
  mockFiles.clear();
  mockMoves.length = 0;
  mockFailMoveOf.clear();
});

describe('applyFileNameFixes', () => {
  it('renames the file and rewrites every link to it', async () => {
    mockFiles.set(`${A}/Todos/Call #marco.note`, 'note');
    mockFiles.set(`${A}/Todos/Call marco.note`, 'other'); // name taken
    mockFiles.set(
      DATA,
      '---\nkind: project\nabbrev: AL\n---\n\n## Tasks\n- [ ] Call #marco → [[Todos/Call #marco.note]]\n- [ ] Other\n\n## Meetings\n',
    );
    // What the parser reads as notePath is what the plan carries; take it from the parsed file.
    const {loadProjectFile} = jest.requireActual('../../src/storage/projectFile') as typeof import('../../src/storage/projectFile');
    const before = await loadProjectFile('project', A);
    const notePath = before.tasks[0].notePath;
    expect(notePath).toBe('Todos/Call #marco.note');

    const {fixes} = planFileNameFixes([
      {itemKind: 'project', itemPath: A, inArchive: false, entityKind: 'task', entityLabel: 'Call', notePath, file: `${A}/Todos/Call #marco.note`, keyword: null},
    ]);
    const result = await applyFileNameFixes(fixes);
    expect(result).toEqual({renamed: 1, linksUpdated: 1, failed: []});
    expect(mockMoves).toEqual([[`${A}/Todos/Call #marco.note`, `${A}/Todos/Call marco (2).note`]]);
    const after = await loadProjectFile('project', A);
    expect(after.tasks[0].notePath).toBe('Todos/Call marco (2).note');
    expect(after.tasks[1].text).toBe('Other');
  });

  it('keeps going after a failed rename and leaves that link alone', async () => {
    mockFiles.set(`${A}/Todos/a #1.note`, '');
    mockFiles.set(`${A}/Todos/b #2.note`, '');
    mockFailMoveOf.add(`${A}/Todos/a #1.note`);
    mockFiles.set(DATA, '---\nkind: project\nabbrev: AL\n---\n\n## Tasks\n- [ ] a → [[Todos/a #1.note]]\n- [ ] b → [[Todos/b #2.note]]\n\n## Meetings\n');
    const {loadProjectFile} = jest.requireActual('../../src/storage/projectFile') as typeof import('../../src/storage/projectFile');
    const before = await loadProjectFile('project', A);
    const {fixes} = planFileNameFixes(
      before.tasks.map(t => ({itemKind: 'project' as const, itemPath: A, inArchive: false, entityKind: 'task' as const, entityLabel: t.text, notePath: t.notePath, file: `${A}/${t.notePath}`, keyword: null})),
    );
    const result = await applyFileNameFixes(fixes);
    expect(result.renamed).toBe(1);
    expect(result.failed).toEqual([{file: `${A}/Todos/a #1.note`, error: 'locked'}]);
    const after = await loadProjectFile('project', A);
    expect(after.tasks.map(t => t.notePath)).toEqual(['Todos/a #1.note', 'Todos/b 2.note']);
  });
});
