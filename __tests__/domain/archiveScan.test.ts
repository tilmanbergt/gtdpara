import {ArchiveListEntry, collectArchivedItems} from '../../src/domain/closeOut/archiveScan';

/** A fake folder tree: every key is a folder path, its value the names inside ("/" suffix = folder). */
function lister(tree: Record<string, string[]>) {
  return async (folder: string): Promise<ArchiveListEntry[]> =>
    (tree[folder] ?? []).map(name => {
      const isFolder = name.endsWith('/');
      const clean = isFolder ? name.slice(0, -1) : name;
      return {name: clean, path: `${folder}/${clean}`, isFolder};
    });
}

describe('collectArchivedItems', () => {
  const tree = {
    A: ['Old flat/', '2026/', 'stray.pdf'],
    'A/Old flat': ['project.txt', 'Todos/'],
    'A/2026': ['Solo/', 'Solo.pdf', 'Customer/', 'Health/'],
    'A/2026/Solo': ['project.txt'],
    'A/2026/Customer': ['Website/', 'Website.pdf'],
    'A/2026/Customer/Website': ['project.txt', 'Meetings/'],
    'A/2026/Health': ['area.txt', 'Run/'],
    'A/2026/Health/Run': ['project.txt'],
  };

  it('finds flat, year, year/Area and archived-Area items', async () => {
    const items = await collectArchivedItems(lister(tree), 'A');
    expect(items.map(i => `${i.kind}:${i.path}`).sort()).toEqual([
      'area:A/2026/Health',
      'project:A/2026/Customer/Website',
      'project:A/2026/Health/Run',
      'project:A/2026/Solo',
      'project:A/Old flat',
    ]);
  });

  it('does not look inside a project folder', async () => {
    const calls: string[] = [];
    const list = lister(tree);
    await collectArchivedItems(async f => {
      calls.push(f);
      return list(f);
    }, 'A');
    expect(calls).not.toContain('A/Old flat/Todos');
    expect(calls).not.toContain('A/2026/Customer/Website/Meetings');
  });

  it('stops at the depth limit', async () => {
    const deep = {R: ['a/'], 'R/a': ['b/'], 'R/a/b': ['c/'], 'R/a/b/c': ['project.txt']};
    expect(await collectArchivedItems(lister(deep), 'R', 2)).toEqual([]);
    expect((await collectArchivedItems(lister(deep), 'R', 3)).map(i => i.path)).toEqual(['R/a/b/c']);
  });

  it('returns nothing for an empty Archive', async () => {
    expect(await collectArchivedItems(lister({}), 'A')).toEqual([]);
  });
});
