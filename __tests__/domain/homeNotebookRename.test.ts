// docs/dev/history/technical-design-home-notebooks.md §3.7, §6: the stored name, the rename case, re-pointed links,
// and the Integrity Check's finding.
import {
  readStoredName,
  relinkNotePath,
  renameCase,
  renamedNotebookMove,
  withStoredName,
} from '../../src/domain/homeNotebook';
import {checkHomeNotebookRenamed} from '../../src/domain/integrityCheck';
import {parseFrontMatter, writeFrontMatterIntoContent} from '../../src/domain/markdown';

const AREA = '/n/2 Areas/People Leadership';
const spec = {template: '{name} {year}', folder: '', today: '2026-10-17'};

describe('name: in the front matter', () => {
  it('round-trips through the front matter, kept among the lines the parser leaves alone', () => {
    const file = '---\nkind: area\nstatus: active\n---\n\n## Tasks\n';
    const fm = parseFrontMatter(file);
    expect(readStoredName(fm.extraLines)).toBeNull();
    const written = writeFrontMatterIntoContent(file, {...fm, extraLines: withStoredName(fm.extraLines, 'Leadership')});
    expect(written).toContain('name: Leadership');
    const again = parseFrontMatter(written);
    expect(readStoredName(again.extraLines)).toBe('Leadership');
    expect(again.status).toBe('active');
    expect(withStoredName(again.extraLines, 'People Leadership').filter(l => l.startsWith('name:'))).toEqual(['name: People Leadership']);
  });
});

describe('renamedNotebookMove and renameCase', () => {
  it('this year\'s file under the stored name and under the folder name', () => {
    expect(renamedNotebookMove({itemPath: AREA, stored: 'Leadership', abbrev: '', spec})).toEqual({
      from: 'Leadership',
      to: 'People Leadership',
      fromFile: 'Leadership 2026',
      toFile: 'People Leadership 2026',
      oldRelative: 'Leadership 2026.note',
      newRelative: 'People Leadership 2026.note',
      oldAbsolute: `${AREA}/Leadership 2026.note`,
      newAbsolute: `${AREA}/People Leadership 2026.note`,
    });
    expect(renamedNotebookMove({itemPath: AREA, stored: 'People Leadership', abbrev: '', spec})).toBeNull();
    expect(renamedNotebookMove({itemPath: AREA, stored: null, abbrev: '', spec})).toBeNull();
  });

  const input = {stored: 'Leadership', folderName: 'People Leadership', fromFile: 'Leadership 2026', toFile: 'People Leadership 2026'};
  it('rename, conflict, or only the name', () => {
    expect(renameCase({...input, fromExists: true, toExists: false})).toEqual({kind: 'rename', from: 'Leadership', to: 'People Leadership'});
    expect(renameCase({...input, fromExists: true, toExists: true})?.kind).toBe('conflict');
    expect(renameCase({...input, fromExists: false, toExists: false})?.kind).toBe('update-name');
    expect(renameCase({...input, fromFile: 'Notes', toFile: 'Notes', fromExists: true, toExists: true})?.kind).toBe('update-name');
    expect(renameCase({...input, stored: null, fromExists: true, toExists: false})).toBeNull();
    expect(renameCase({...input, stored: 'People Leadership', fromExists: true, toExists: false})).toBeNull();
  });
});

describe('relinkNotePath', () => {
  const move = {
    oldRelative: 'Leadership 2026.note',
    newRelative: 'People Leadership 2026.note',
    oldAbsolute: `${AREA}/Leadership 2026.note`,
    newAbsolute: `${AREA}/People Leadership 2026.note`,
  };
  it('re-points the item\'s own anchors, page links and file links; keyword and page stay', () => {
    expect(relinkNotePath('Leadership 2026.note#2026-10-02 1:1 #1on1/anna', true, move)).toBe('People Leadership 2026.note#2026-10-02 1:1 #1on1/anna');
    expect(relinkNotePath('Leadership 2026.note#page=3', true, move)).toBe('People Leadership 2026.note#page=3');
    expect(relinkNotePath('Leadership 2026.note', true, move)).toBe('People Leadership 2026.note');
  });
  it('re-points absolute links from any item or the Inbox, relative ones only in the own item', () => {
    expect(relinkNotePath(`${AREA}/Leadership 2026.note#page=2`, false, move)).toBe(`${AREA}/People Leadership 2026.note#page=2`);
    expect(relinkNotePath(`${AREA}/Leadership 2026.note`, false, move)).toBe(`${AREA}/People Leadership 2026.note`);
    expect(relinkNotePath('Leadership 2026.note#x', false, move)).toBeNull();
  });
  it('leaves unrelated links alone', () => {
    expect(relinkNotePath('Leadership 2025.note#x', true, move)).toBeNull();
    expect(relinkNotePath('Todos/Call Anna.note', true, move)).toBeNull();
    expect(relinkNotePath('/n/other.note#page=1', true, move)).toBeNull();
  });
});

describe('Integrity Check: homeNotebookRenamed', () => {
  const files = new Set<string>();
  const io = {fileExists: async (p: string) => files.has(p), folderExists: async () => true};
  const input = (raw: string, homeNotebook: typeof spec | null = spec) => ({
    itemKind: 'area' as const,
    itemPath: AREA,
    tasks: [],
    meetings: [],
    rawContent: raw,
    basePath: '/n',
    resourcesPath: '/n/3 Resources',
    defaultResourceFolder: null,
    homeNotebook,
  });
  const raw = '---\nkind: area\nname: Leadership\nstatus: active\n---\n';

  beforeEach(() => files.clear());

  it('reports a renamed folder whose notebook kept the old name, and a conflict', async () => {
    files.add(`${AREA}/Leadership 2026.note`);
    expect((await checkHomeNotebookRenamed(input(raw), io)).map(f => f.message)).toEqual([
      'Folder renamed to People Leadership; its notebook is still Leadership 2026.note',
    ]);
    files.add(`${AREA}/People Leadership 2026.note`);
    expect((await checkHomeNotebookRenamed(input(raw), io))[0].message).toContain('both');
  });

  it('nothing without the old file, without name:, or without a Default notebook', async () => {
    expect(await checkHomeNotebookRenamed(input(raw), io)).toEqual([]);
    files.add(`${AREA}/Leadership 2026.note`);
    expect(await checkHomeNotebookRenamed(input('---\nkind: area\nstatus: active\n---\n'), io)).toEqual([]);
    expect(await checkHomeNotebookRenamed(input(raw, null), io)).toEqual([]);
  });
});
