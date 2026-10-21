// docs/dev/history/technical-design-quality-hardening.md §5.2 F4/F5: unusual data files are read
// and every save over them keeps each line the user wrote.
const mockFiles = new Map<string, string>();
jest.mock('../../src/supernote/fileSystem', () => ({
  readTextFile: async (path: string) => mockFiles.get(path) ?? null,
  writeTextFile: async (path: string, content: string) => {
    mockFiles.set(path, content);
  },
}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
jest.mock('../../src/supernote/pluginPermissions', () => ({ensureFileReadPermission: async () => true, ensureFileWritePermission: async () => true}));

import {normalizeLineEndings} from '../../src/domain/markdown';
import {newTask} from '../../src/domain/taskEdit';
import {
  loadProjectFile,
  saveFrontMatter,
  saveMeetings,
  saveMonthlyGoals,
  saveScope,
  saveTasks,
  saveWeeklyGoals,
} from '../../src/storage/projectFile';
import {frontMatterOf} from '../../src/storage/dataCache';

const DIR = '/Note/1 Projects/Odd';
const FILE = `${DIR}/project.txt`;

const ODD: Record<string, string> = {
  windowsLineEndings: '---\r\nkind: project\r\nstatus: active\r\n---\r\n\r\n## Scope\r\nKeep me\r\n\r\n## Tasks\r\n- [ ] One\r\n\r\n## Meetings\r\n',
  byteOrderMark: '﻿---\nkind: project\nstatus: active\n---\n\n## Tasks\n- [ ] One\n\n## Meetings\n',
  twoTaskHeadings: '---\nkind: project\n---\n\n## Tasks\n- [ ] One\n\n## Tasks\n- [ ] Two in a second heading\n\n## Meetings\n',
  noFrontMatter: '## Tasks\n- [ ] One\n',
  headingWithTrailingSpaces: '---\nkind: project\n---\n\n## Tasks  \n- [ ] One\n\n## Meetings\n',
  subHeading: '---\nkind: project\n---\n\n## Tasks\n- [ ] One\n### Sub heading by hand\n- [ ] Two\n\n## Meetings\n',
  indentedSubTodo: '---\nkind: project\n---\n\n## Tasks\n- [ ] One\n    - [ ] nested sub todo\n\n## Meetings\n',
  onlyText: 'just some notes, no structure\n',
  ownSection: '---\nkind: project\nowner: me\n---\n\nA paragraph.\n\n## Research\n- my own list\n\n## Tasks\n- [ ] One\n',
};

/** Each save the app makes, applied once to the file as it is. */
const SAVES: Array<[string, (raw: string) => Promise<string>]> = [
  ['tasks', async raw => {
    const s = await loadProjectFile('project', DIR);
    return saveTasks('project', DIR, raw, [...s.tasks, newTask({text: 'Added'})], s.taskExtraLines);
  }],
  ['meetings', async raw => {
    const s = await loadProjectFile('project', DIR);
    return saveMeetings('project', DIR, raw, s.meetings, s.meetingExtraLines);
  }],
  ['scope', async raw => saveScope('project', DIR, raw, 'New scope')],
  ['weekly goals', async raw => {
    const s = await loadProjectFile('project', DIR);
    return saveWeeklyGoals('project', DIR, raw, s.weeklyGoals, s.weeklyGoalsExtraLines);
  }],
  ['monthly goals', async raw => {
    const s = await loadProjectFile('project', DIR);
    return saveMonthlyGoals('project', DIR, raw, s.monthlyGoals, s.monthlyGoalsExtraLines);
  }],
  ['front matter', async raw => {
    const s = await loadProjectFile('project', DIR);
    return saveFrontMatter('project', DIR, raw, {...frontMatterOf(s), dailyFocus: true});
  }],
];

describe.each(Object.entries(ODD))('%s', (_name, original) => {
  it.each(SAVES)('a %s save keeps every line', async (_save, save) => {
    mockFiles.set(FILE, original);
    const {rawContent} = await loadProjectFile('project', DIR);
    const written = await save(rawContent);
    const kept = (line: string) => written.includes(line.trim());
    const userLines = normalizeLineEndings(original)
      .replace(/^﻿/, '')
      .split('\n')
      .filter(l => l.trim() && !/^(status:|## Scope|Keep me)/.test(l.trim()));
    expect(userLines.filter(l => !kept(l))).toEqual([]);
    expect(written).not.toContain('\r');
  });
});

it('reads the todos of a file with Windows line endings', async () => {
  mockFiles.set(FILE, ODD.windowsLineEndings);
  const state = await loadProjectFile('project', DIR);
  expect(state.tasks.map(t => t.text)).toEqual(['One']);
  expect(state.scope).toBe('Keep me');
});

it('normalizeLineEndings turns \\r\\n and lone \\r into \\n and leaves other text alone', () => {
  expect(normalizeLineEndings('a\r\nb\rc\nd')).toBe('a\nb\nc\nd');
  const plain = 'a\nb';
  expect(normalizeLineEndings(plain)).toBe(plain);
});
