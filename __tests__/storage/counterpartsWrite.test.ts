/** storage/counterparts.ts's setCounterpartStatus: the scope owner's file, then the cache (§3.9.1, D16). */
import {item} from '../../test-helpers/fixtures';
import type {CachedItem} from '../../src/storage/dataCache';

const mockWrites: Array<[string, string]> = [];
let mockItems: CachedItem[] = [];
const mockUpdates: string[] = [];

jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
jest.mock('../../src/supernote/fileSystem', () => ({
  readTextFile: jest.fn(),
  writeTextFile: async (path: string, text: string) => {
    mockWrites.push([path, text]);
  },
}));
jest.mock('../../src/storage/dataCache', () => ({
  getCachedData: () => ({items: mockItems}),
  findCachedItem: (path: string) => mockItems.find(i => i.path === path),
  updateItemThreads: (path: string, rawContent: string, threads: unknown) => {
    const found = mockItems.find(i => i.path === path);
    if (found) Object.assign(found, {rawContent, threads});
    mockUpdates.push(path);
  },
}));

import {setCounterpartStatus} from '../../src/storage/counterparts';

beforeEach(() => {
  mockWrites.length = 0;
  mockUpdates.length = 0;
  mockItems = [
    item('area', 'Atruvia', {rawContent: '---\nkind: area\nstatus: active\n---\n\n## Scope\n\n## Tasks\n\n## Meetings\n'}),
    item('project', 'Tender', {area: 'Atruvia', rawContent: '---\nkind: project\nstatus: active\narea: Atruvia\n---\n'}),
    item('project', 'Solo', {rawContent: '---\nkind: project\nstatus: active\n---\n\n## Tasks\n'}),
  ];
});

it('writes a Project with an Area into the Area file', async () => {
  const owner = await setCounterpartStatus(mockItems[1].path, 'mieke', 'active');
  expect(owner).toBe(mockItems[0].path);
  expect(mockWrites).toHaveLength(1);
  expect(mockWrites[0][0]).toBe(`${mockItems[0].path}/area.txt`);
  expect(mockWrites[0][1]).toContain('## Meetings\n\n## Threads\n- mieke: active\n');
  expect(mockUpdates).toEqual([mockItems[0].path]);
  expect(mockItems[0].threads.map(t => t.leaf)).toEqual(['mieke']);
});

it('writes a Project without an Area into its own file and keeps other lines', async () => {
  await setCounterpartStatus(mockItems[2].path, 'alpha', 'inactive');
  await setCounterpartStatus(mockItems[2].path, 'beta', 'active');
  expect(mockWrites[1][0]).toBe(`${mockItems[2].path}/project.txt`);
  expect(mockWrites[1][1]).toContain('## Threads\n- alpha: inactive\n- beta: active\n');
});

it('refuses the Inbox and unknown paths', async () => {
  await expect(setCounterpartStatus('/Note/2 Areas/0 Inbox', 'x', 'active')).rejects.toThrow(/not loaded/);
  expect(mockWrites).toHaveLength(0);
});
