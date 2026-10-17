// docs/dev/history/technical-design-home-notebooks.md §3.7: renaming moves this year's file and re-points every link
// into it through the usual write-through, then stores the new name.
jest.mock('sn-plugin-lib', () => ({PluginCommAPI: {}, PluginFileAPI: {}}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
const mockAreaPath = '/n/2 Areas/People Leadership';
const mockOtherPath = '/n/1 Projects/Hiring';
const mockFiles = new Set<string>([`${mockAreaPath}/Leadership 2026.note`]);
const mockMoves: Array<[string, string]> = [];
jest.mock('../../src/supernote/fileSystem', () => ({
  fileExists: async (p: string) => mockFiles.has(p),
  moveFile: async (from: string, to: string) => {
    mockMoves.push([from, to]);
  },
  statFiles: async (paths: string[]) => paths.map(path => ({path, exists: false, lastModified: 0, size: 0})),
}));
const mockRewrites: unknown[] = [];
jest.mock('../../src/storage/fileNameFix', () => ({
  rewriteItem: async (item: {tasks: Map<string, string>; meetings: Map<string, string>}) => {
    mockRewrites.push(item);
    return item.tasks.size + item.meetings.size;
  },
}));
const mockMarkCalls: string[] = [];
jest.mock('../../src/storage/markStore', () => ({
  repointMarkLines: async (ref: {folder: string}) => {
    mockMarkCalls.push(ref.folder);
    return 1;
  },
}));
const mockSaved: string[][] = [];
jest.mock('../../src/storage/projectFile', () => ({
  saveFrontMatter: async (_k: string, _p: string, raw: string, fm: {extraLines: string[]}) => {
    mockSaved.push(fm.extraLines);
    return raw;
  },
}));
const mockArea = {
  kind: 'area',
  name: 'People Leadership',
  path: mockAreaPath,
  abbrev: null,
  rawContent: '',
  status: 'active',
  dailyFocus: false,
  weeklyFocus: false,
  monthlyFocus: false,
  defaultResourceFolder: null,
  area: null,
  frontMatterExtraLines: ['kind: area', 'name: Leadership'],
  tasks: [{notePath: 'Leadership 2026.note#Plan the year'}, {notePath: 'Todos/x.note'}],
  meetings: [{notePath: 'Leadership 2026.note#2026-10-02 1:1'}],
  marks: [{notePath: 'Leadership 2026.note'}],
};
const mockProject = {...mockArea, kind: 'project', name: 'Hiring', path: mockOtherPath, frontMatterExtraLines: [], tasks: [{notePath: `${mockAreaPath}/Leadership 2026.note#page=2`}], meetings: [], marks: []};
jest.mock('../../src/storage/dataCache', () => ({
  getCachedData: () => ({items: [mockArea, mockProject]}),
  getCachedInbox: () => ({tasks: [], meetings: [], marks: []}),
  findCachedItem: (p: string) => [mockArea, mockProject].find(i => i.path === p),
  frontMatterOf: (i: {frontMatterExtraLines: string[]}) => ({extraLines: i.frontMatterExtraLines}),
  updateItemFrontMatter: (_p: string, _raw: string, fm: {extraLines: string[]}) => {
    mockArea.frontMatterExtraLines = fm.extraLines;
  },
}));

import {DEFAULT_SETTINGS} from '../../src/domain/settings';
import {seedNoteSetupDefaults} from '../../src/domain/noteSetups';
import {CachedItem} from '../../src/storage/dataCache';
import {detectHomeNotebookRename, renameHomeNotebook} from '../../src/storage/homeNotebookRename';

const settings = {...DEFAULT_SETTINGS, noteSetupDefaults: seedNoteSetupDefaults()};
const YEAR = new Date().getFullYear();

describe('renameHomeNotebook', () => {
  it('detects, moves this year\'s file, re-points links and marks, and stores the new name', async () => {
    mockFiles.clear();
    mockFiles.add(`${mockAreaPath}/Leadership ${YEAR}.note`);
    mockArea.tasks = [{notePath: `Leadership ${YEAR}.note#Plan the year`}, {notePath: 'Todos/x.note'}];
    mockArea.meetings = [{notePath: `Leadership ${YEAR}.note#2026-10-02 1:1`}];
    mockArea.marks = [{notePath: `Leadership ${YEAR}.note`}];
    mockProject.tasks = [{notePath: `${mockAreaPath}/Leadership ${YEAR}.note#page=2`}];
    const offer = await detectHomeNotebookRename(mockArea as unknown as CachedItem, settings);
    expect(offer?.found.kind).toBe('rename');
    const result = await renameHomeNotebook(mockArea as unknown as CachedItem, offer!, settings);
    expect(mockMoves).toEqual([[`${mockAreaPath}/Leadership ${YEAR}.note`, `${mockAreaPath}/People Leadership ${YEAR}.note`]]);
    expect(mockRewrites).toEqual([
      {
        kind: 'area',
        path: mockAreaPath,
        tasks: new Map([[`Leadership ${YEAR}.note#Plan the year`, `People Leadership ${YEAR}.note#Plan the year`]]),
        meetings: new Map([[`Leadership ${YEAR}.note#2026-10-02 1:1`, `People Leadership ${YEAR}.note#2026-10-02 1:1`]]),
      },
      {
        kind: 'project',
        path: mockOtherPath,
        tasks: new Map([[`${mockAreaPath}/Leadership ${YEAR}.note#page=2`, `${mockAreaPath}/People Leadership ${YEAR}.note#page=2`]]),
        meetings: new Map(),
      },
    ]);
    expect(mockMarkCalls).toEqual([mockAreaPath]);
    expect(result).toEqual({linksUpdated: 4, failed: 0});
    expect(mockSaved.at(-1)).toEqual(['kind: area', 'name: People Leadership']);
  });
});
