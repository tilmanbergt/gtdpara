// docs/dev/history/technical-design-quality-hardening.md §3.2: every data-file save re-reads
// the file, keeps an outside edit to other parts and stops on an edit to the same part.
const mockFiles = new Map<string, string>();
const mockWrites: string[] = [];
jest.mock('../../src/supernote/fileSystem', () => ({
  readTextFile: async (path: string) => mockFiles.get(path) ?? null,
  writeTextFile: async (path: string, content: string) => {
    mockWrites.push(path);
    mockFiles.set(path, content);
  },
}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));

import {FileConflictError, setDataFileReloadListener, takeMergedWrite, writeDataFile} from '../../src/storage/dataFileWrite';
import {answerWriteConflict, getWriteConflict, installWriteConflictUi, subscribeWriteConflicts} from '../../src/storage/writeConflicts';
import {DATA_FILE_HEADINGS, writeScopeIntoContent, writeTasksIntoContent} from '../../src/domain/markdown';
import {DataFileChange} from '../../src/domain/writeGuard';
import {Task} from '../../src/domain/types';

const DIR = '/Note/1 Projects/Website';
const FILE = `${DIR}/project.txt`;
const BASE = '---\nkind: project\nstatus: active\n---\n\n## Scope\nOld\n\n## Tasks\n- [ ] One\n\n## Meetings\n';

function addTask(text: string): DataFileChange {
  return {
    parts: [DATA_FILE_HEADINGS.tasks],
    apply: content => content.replace('## Tasks\n', `## Tasks\n- [ ] ${text}\n`),
  };
}

beforeEach(() => {
  mockFiles.clear();
  mockWrites.length = 0;
  setDataFileReloadListener(null);
});

it('writes onto an unchanged file', async () => {
  mockFiles.set(FILE, BASE);
  const next = await writeDataFile('project', DIR, FILE, BASE, addTask('Two'));
  expect(mockFiles.get(FILE)).toBe(next);
  expect(next).toContain('- [ ] Two\n- [ ] One');
  expect(takeMergedWrite(next)).toBe(false);
});

it('keeps an outside edit to another part and marks the result as merged', async () => {
  mockFiles.set(FILE, writeScopeIntoContent(BASE, 'Edited in Obsidian'));
  const next = await writeDataFile('project', DIR, FILE, BASE, addTask('Two'));
  expect(next).toContain('Edited in Obsidian');
  expect(next).toContain('- [ ] Two');
  expect(takeMergedWrite(next)).toBe(true);
  expect(takeMergedWrite(next)).toBe(false);
});

it('without a UI to ask, keeps the outside version, reloads it and throws', async () => {
  const outside = BASE.replace('- [ ] One', '- [x] One');
  mockFiles.set(FILE, outside);
  const reloaded: string[] = [];
  setDataFileReloadListener((_kind, path, content) => reloaded.push(`${path}|${content}`));
  const error = await writeDataFile('project', DIR, FILE, BASE, addTask('Two')).catch(e => e);
  expect(error).toBeInstanceOf(FileConflictError);
  expect(error.message).toBe('Not saved: "Website" keeps the version changed outside Kept GTD.');
  expect(mockWrites).toEqual([]);
  expect(mockFiles.get(FILE)).toBe(outside);
  expect(reloaded).toEqual([`${DIR}|${outside}`]);
});

describe('with the question shown', () => {
  let uninstall: () => void = () => undefined;
  beforeEach(() => {
    uninstall = installWriteConflictUi();
  });
  afterEach(() => uninstall());

  /** Resolves the question once it is shown. */
  function nextQuestion(): Promise<{id: number; fileName: string; parts: string[]}> {
    return new Promise(resolve => {
      const shown = getWriteConflict();
      if (shown) return resolve(shown);
      const off = subscribeWriteConflicts(() => {
        const c = getWriteConflict();
        if (c) {
          off();
          resolve(c);
        }
      });
    });
  }

  it('"Use mine" writes the save into the file as it is then', async () => {
    const outside = writeScopeIntoContent(BASE.replace('- [ ] One', '- [x] One'), 'Outside scope');
    mockFiles.set(FILE, outside);
    const save = writeDataFile('project', DIR, FILE, BASE, {
      parts: [DATA_FILE_HEADINGS.tasks],
      apply: content => writeTasksIntoContent(content, [], ['- [ ] Mine']),
    });
    const question = await nextQuestion();
    expect(question).toMatchObject({fileName: 'Website', parts: [DATA_FILE_HEADINGS.tasks]});
    answerWriteConflict(question.id, 'mine');
    const next = await save;
    expect(mockFiles.get(FILE)).toBe(next);
    expect(next).toContain('- [ ] Mine');
    expect(next).not.toContain('- [x] One');
    expect(next).toContain('Outside scope');
    expect(takeMergedWrite(next)).toBe(true);
    expect(getWriteConflict()).toBeNull();
  });

  it('"Use the file" writes nothing and fails the save', async () => {
    const outside = BASE.replace('- [ ] One', '- [x] One');
    mockFiles.set(FILE, outside);
    const save = writeDataFile('project', DIR, FILE, BASE, addTask('Two')).catch(e => e);
    answerWriteConflict((await nextQuestion()).id, 'file');
    expect(await save).toBeInstanceOf(FileConflictError);
    expect(mockWrites).toEqual([]);
    expect(mockFiles.get(FILE)).toBe(outside);
  });
});

it('a file deleted outside is not recreated', async () => {
  const error = await writeDataFile('project', DIR, FILE, BASE, addTask('Two')).catch(e => e);
  expect(error).toBeInstanceOf(FileConflictError);
  expect(error.message).toContain('was deleted or moved outside Kept GTD');
  expect(mockWrites).toEqual([]);
});

it('runs two saves of the same file one after the other, so neither overwrites the other', async () => {
  mockFiles.set(FILE, BASE);
  const tasks: Task[] = [];
  const scope = writeDataFile('project', DIR, FILE, BASE, {
    parts: [DATA_FILE_HEADINGS.scope],
    apply: content => writeScopeIntoContent(content, 'New scope'),
  });
  const task = writeDataFile('project', DIR, FILE, BASE, {
    parts: [DATA_FILE_HEADINGS.tasks],
    apply: content => writeTasksIntoContent(content, tasks, ['- [ ] Kept as a line']),
  });
  await Promise.all([scope, task]);
  expect(mockFiles.get(FILE)).toContain('New scope');
  expect(mockFiles.get(FILE)).toContain('- [ ] Kept as a line');
});

it('scaffolds a new file', async () => {
  const next = await writeDataFile('inbox', '/Note/Inbox', '/Note/Inbox/Inbox.txt', '', addTask('First'));
  expect(next).toContain('kind: inbox');
  expect(next).toContain('- [ ] First');
});
