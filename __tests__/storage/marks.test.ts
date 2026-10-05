/**
 * storage/marks.ts createMarkFromLasso (docs/dev/technical-design-lasso-0.8.md
 * §3.6): the `## Marks` line is the commit point; a failure there takes the
 * icon and the data back.
 */
const mockState = {
  snap: null as null | Record<string, unknown>,
  iconPlaced: true,
  addFails: false,
  calls: [] as string[],
};

jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
jest.mock('../../src/supernote/lassoRead', () => ({
  readLasso: async () => mockState.snap,
  isEmptyLasso: (s: {strokes: unknown[]; textBoxText: string}) => s.strokes.length === 0 && !s.textBoxText.trim(),
  saveLassoPreview: async (target: string) => {
    mockState.calls.push('preview');
    return target;
  },
}));
jest.mock('../../src/supernote/strokeRecognition', () => ({recognizeStrokes: jest.fn()}));
jest.mock('../../src/supernote/lasso', () => ({
  setLassoBoxState: async () => {
    mockState.calls.push('lassoGone');
  },
}));
jest.mock('../../src/supernote/markIcons', () => ({
  insertBookmark: async () => {
    mockState.calls.push('icon');
    return {placed: mockState.iconPlaced, box: {left: 0, top: 0, right: 28, bottom: 28}, retried: false, saved: true, error: mockState.iconPlaced ? null : '105: busy'};
  },
  changeMarkIcon: async (_ref: unknown, change: string) => {
    mockState.calls.push('icon-' + change);
    return {ok: true, retry: false, detail: change};
  },
}));
jest.mock('../../src/supernote/fileSystem', () => ({
  ensureFolderExists: async () => undefined,
  readTextFile: async (path: string) => (path.endsWith('Garden/project.txt') ? '## Tasks\n' : null),
}));
jest.mock('../../src/storage/markData', () => ({
  markDataFolder: async (id: string) => `/private/data/marks/${id}`,
  markPicturePath: async (id: string) => `/private/data/marks/${id}/picture.png`,
  writeMarkData: async () => {
    mockState.calls.push('data');
  },
  deleteMarkData: async () => {
    mockState.calls.push('dataDeleted');
  },
  readMarkData: async () => null,
}));
jest.mock('../../src/storage/markStore', () => {
  const actual = jest.requireActual('../../src/storage/markStore');
  return {
    ...actual,
    addMarkLine: async (ref: {kind: string}, mark: {notePath: string; text: string | null}) => {
      if (mockState.addFails) {throw new Error('disk full');}
      mockState.calls.push(`line:${ref.kind}:${mark.notePath}:${mark.text ?? ''}`);
    },
  };
});
jest.mock('../../src/storage/settingsStorage', () => ({
  loadSettings: async () => jest.requireActual('../../src/domain/settings').DEFAULT_SETTINGS,
}));
jest.mock('../../src/storage/dataCache', () => ({
  getCachedData: () => null,
  findCachedItem: () => undefined,
  resolveLivePaths: async (s: unknown) => jest.requireActual('../../src/domain/settings').resolvePaths(s),
}));

import {DEFAULT_SETTINGS, resolvePaths} from '../../src/domain/settings';
import {createMarkFromLasso, outcomeNeedsScreen} from '../../src/storage/marks';

const paths = resolvePaths(DEFAULT_SETTINGS);
const stroke = {thickness: 1, penColor: 0, penType: 10, layerNum: 0, points: [1, 2], pressures: [1]};
const snap = (over: Record<string, unknown> = {}) => ({
  path: `${paths.projects}/Garden/Plan.note`,
  page: 2,
  rect: {left: 10, top: 10, right: 400, bottom: 120},
  displaySize: {width: 1404, height: 1872},
  pageSize: {width: 1404, height: 1872},
  textBoxText: '',
  strokes: [stroke],
  elementCount: 1,
  errors: [],
  timingsMs: {},
  ...over,
});

beforeEach(() => {
  mockState.snap = snap();
  mockState.iconPlaced = true;
  mockState.addFails = false;
  mockState.calls = [];
});

const NOW = new Date(2026, 9, 5, 10, 42, 12);

it('saves into the project the note belongs to, in the designed order, silently', async () => {
  const outcome = await createMarkFromLasso(NOW);
  expect(outcome.kind).toBe('saved');
  expect(outcomeNeedsScreen(outcome)).toBe(false);
  expect(mockState.calls).toEqual(['preview', 'lassoGone', 'icon', 'data', 'line:project:Plan.note:']);
});

it('puts marks from outside projects/areas into the Inbox with an absolute path, keeping text-box text', async () => {
  mockState.snap = snap({path: '/storage/emulated/0/Document/Spec.pdf', strokes: [], textBoxText: 'Order toner'});
  const outcome = await createMarkFromLasso(NOW);
  expect(outcome.kind).toBe('saved');
  expect(mockState.calls).toContain('line:inbox:/storage/emulated/0/Document/Spec.pdf:Order toner');
});

it('says so when the lasso is empty, without touching anything', async () => {
  mockState.snap = snap({strokes: [], textBoxText: ' '});
  expect((await createMarkFromLasso(NOW)).kind).toBe('empty');
  expect(mockState.calls).toEqual([]);
});

it('keeps the mark but reports a missing icon', async () => {
  mockState.iconPlaced = false;
  const outcome = await createMarkFromLasso(NOW);
  expect(outcome).toMatchObject({kind: 'iconMissing', page: 2});
  expect(mockState.calls).toContain('line:project:Plan.note:');
});

it('takes the icon and data back when the line cannot be written', async () => {
  mockState.addFails = true;
  const outcome = await createMarkFromLasso(NOW);
  expect(outcome).toEqual({kind: 'failed', detail: 'disk full'});
  expect(mockState.calls.slice(-2)).toEqual(['icon-remove', 'dataDeleted']);
});
