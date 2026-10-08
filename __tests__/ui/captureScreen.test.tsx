// docs/dev/history/technical-design-lasso-0.8.md §3.7: the shared capture / marks screen.
const mockCalls: string[] = [];
const mockAdded: Array<{text: string; notePath: string; linkedFile: string; dest: {type: string}}> = [];
const mockState = {marksInbox: [] as unknown[], stored: {} as Record<string, string>, recognized: [] as string[]};

jest.mock('react-native-svg', () => {
  const ReactLib = require('react');
  const stub = (props: object) => ReactLib.createElement('Svg', props);
  return {Svg: stub, Path: stub, Circle: stub, Rect: stub, Line: stub, Polyline: stub, G: stub};
});
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@react-native-clipboard/clipboard', () => ({setString: jest.fn(), getString: jest.fn(async () => '')}));
jest.mock('sn-plugin-lib', () => ({
  NativePluginManager: {},
  PluginManager: {closePluginView: jest.fn(async () => mockCalls.push('closePluginView'))},
  PluginCommAPI: {},
  PluginFileAPI: {},
  PluginNoteAPI: {},
}));
jest.mock('../../src/utils/screenRefresh', () => ({requestEinkRefresh: jest.fn(), useEinkRefreshOnLoad: jest.fn()}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
jest.mock('../../src/storage/tagUsage', () => ({
  getRecentTags: () => new Promise(() => undefined),
  getRecentTagsSync: () => [],
  recordTagsUsed: async () => undefined,
}));
jest.mock('../../src/ui/useAbbrevItems', () => ({useAbbrevItems: () => []}));
jest.mock('../../src/storage/settingsStorage', () => ({
  loadSettings: async () => jest.requireActual('../../src/domain/settings').DEFAULT_SETTINGS,
}));
jest.mock('../../src/storage/dataCache', () => {
  const settings = jest.requireActual('../../src/domain/settings');
  const paths = settings.resolvePaths(settings.DEFAULT_SETTINGS);
  return {
    getCachedData: () => {
      mockCalls.push('cache');
      return {scannedAt: 0, paths, items: []};
    },
    rebuildCache: async () => ({scannedAt: 0, paths, items: []}),
    setCachedInbox: jest.fn(),
  };
});
jest.mock('../../src/ui/useCachedItems', () => ({useCachedItems: () => []}));
jest.mock('../../src/ui/useCachedInbox', () => ({useCachedInbox: () => ({marks: mockState.marksInbox, tasks: [], meetings: []})}));
jest.mock('../../src/storage/itemMutations', () => ({
  buildTask: (text: string, opts: {notePath?: string; linkedFile?: string}) => ({
    text,
    notePath: opts?.notePath ?? '',
    linkedFile: opts?.linkedFile ?? '',
  }),
  buildMeeting: (f: object, opts: {notePath?: string; linkedFile?: string}) => ({
    ...f,
    notePath: opts?.notePath ?? '',
    linkedFile: opts?.linkedFile ?? '',
  }),
  addTaskToDestination: async (task: {text: string; notePath: string; linkedFile: string}, dest: {type: string}) => {
    mockAdded.push({text: task.text, notePath: task.notePath, linkedFile: task.linkedFile, dest});
    return {nextInbox: null};
  },
  addMeetingToDestination: async () => ({nextInbox: null}),
}));
jest.mock('../../src/storage/projectFile', () => ({loadProjectFile: async () => null}));
jest.mock('../../src/storage/marks', () => ({
  cleanMarkDataOrphans: async () => mockCalls.push('cleanOrphans'),
  createMarkFromLasso: async () => ({kind: 'saved', id: 'x'}),
  finishMark: async (open: {mark: {id: string}}, change: string) => {
    mockCalls.push(`finish:${open.mark.id}:${change}`);
    return {removed: true, iconOk: true, iconDetail: change};
  },
  outcomeNeedsScreen: () => false,
  runPendingIconChanges: async () => undefined,
  setMarkOutcome: jest.fn(),
  storedMarkText: async (open: {mark: {id: string}}) => mockState.stored[open.mark.id] ?? null,
  recognizeMark: async (open: {mark: {id: string}}) => {
    mockState.recognized.push(open.mark.id);
    return {
      text: open.mark.id.endsWith('1') ? 'Room for offsite?' : 'Ask HR',
      error: null,
      ms: 1,
      missing: false,
    };
  },
}));
jest.mock('../../src/supernote/fileSystem', () => ({
  getCurrentNotePath: async () => '/Note/2 Areas/0 Inbox/Todos/Test.note',
  getPrivateDataDir: async () => '/private/data',
  getPrivateTempDir: async () => '/private/tmp',
  openPath: async () => undefined,
}));
jest.mock('../../src/supernote/lasso', () => ({
  setLassoBoxState: async (s: number) => mockCalls.push(`lassoState:${s}`),
}));
jest.mock('../../src/supernote/lassoRead', () => ({
  readLasso: async () => ({
    path: '/Note/2 Areas/0 Inbox/Todos/Test.note',
    page: 1,
    rect: {left: 0, top: 0, right: 100, bottom: 100},
    displaySize: {width: 1404, height: 1872},
    pageSize: {width: 1404, height: 1872},
    textBoxText: '',
    strokes: [{points: [1, 2]}],
    elementCount: 1,
    errors: [],
    timingsMs: {},
  }),
  saveLassoPreview: async (t: string) => t,
}));
jest.mock('../../src/supernote/strokeRecognition', () => ({
  recognizeStrokes: async () => {
    mockCalls.push('recognize');
    return {text: '- book room\n- agenda to Tom', error: null, ms: 1};
  },
}));

import React from 'react';
import {Image, Text, TextInput} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import CaptureScreen from '../../src/screens/CaptureScreen';
import {StatusProvider} from '../../src/ui/status/StatusProvider';

const flush = () => act(async () => {
  for (let i = 0; i < 10; i++) {await Promise.resolve();}
});

function render(request: React.ComponentProps<typeof CaptureScreen>['request'], onExit = jest.fn()) {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <StatusProvider>
        <CaptureScreen request={request} onOpenItem={jest.fn()} onOpenDaily={jest.fn()} onExit={onExit} />
      </StatusProvider>,
    );
  });
  return r;
}

const texts = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));

async function press(r: TestRenderer.ReactTestRenderer, label: string) {
  const target = r.root.findAll(
    n => typeof n.props.onPress === 'function' && n.findAllByType(Text).some(t => [t.props.children].flat().join('') === label),
  )[0];
  if (!target) {throw new Error(`no "${label}" in ${texts(r).join(' | ')}`);}
  await act(async () => {
    await target.props.onPress();
  });
  await flush();
}

beforeEach(() => {
  mockCalls.length = 0;
  mockAdded.length = 0;
  mockState.marksInbox = [];
  mockState.stored = {};
  mockState.recognized = [];
});

it('lasso without marks: no column, bullets split, saves with a page link and closes', async () => {
  const r = render({source: 'lasso'});
  await flush();
  expect(texts(r)).not.toContain('Lasso & marks');
  const values = r.root.findAllByType(TextInput).map(i => i.props.value);
  expect(values).toEqual(expect.arrayContaining(['book room', 'agenda to Tom']));
  await press(r, 'Save 2 & close');
  expect(mockAdded.map(a => a.text)).toEqual(['book room', 'agenda to Tom']);
  // The source page is the item's linked file (checkpoint B), not its working note.
  expect(mockAdded[0].notePath).toBe('');
  expect(mockAdded[0].linkedFile).toBe('/Note/2 Areas/0 Inbox/Todos/Test.note#page=2');
  expect(mockCalls).toEqual(expect.arrayContaining(['lassoState:2', 'closePluginView']));
});

it('marks: first mark selected and recognized, Save & next finishes it and moves on', async () => {
  mockState.marksInbox = [
    {id: 'm-20261005-100000-001', createdAt: '2026-10-05 10:00', notePath: '/Note/x/A.note', page: 0, text: null},
    {id: 'm-20261005-100100-002', createdAt: '2026-10-05 10:01', notePath: '/Note/x/A.note', page: 1, text: null},
  ];
  const onExit = jest.fn();
  const r = render({source: 'marks', scope: {type: 'all'}, returnTo: 'inbox'}, onExit);
  await flush();
  await flush();
  expect(texts(r)).toContain('Open marks · 2');
  expect(r.root.findAllByType(TextInput).map(i => i.props.value)).toContain('Room for offsite?');
  await press(r, 'Save & next');
  expect(mockAdded.map(a => a.text)).toEqual(['Room for offsite?']);
  expect(mockAdded[0].notePath).toBe('');
  expect(mockAdded[0].linkedFile).toBe('/Note/x/A.note#page=1');
  expect(mockCalls).toContain('finish:m-20261005-100000-001:done');
  expect(texts(r).join(' ')).toContain('A.note · p2');
});

it('marks: text kept from an earlier open is used, not recognized again; the column shows date and status', async () => {
  mockState.marksInbox = [
    {id: 'm-20261005-100000-001', createdAt: '2026-10-05 10:00', notePath: '/Note/x/A.note', page: 0, text: null},
  ];
  mockState.stored = {'m-20261005-100000-001': 'Stored text'};
  const r = render({source: 'marks', scope: {type: 'all'}, returnTo: 'inbox'});
  await flush();
  await flush();
  expect(r.root.findAllByType(TextInput).map(i => i.props.value)).toContain('Stored text');
  expect(mockState.recognized).toEqual([]);
});

it('✂ Split at cursor: a caret splits there, a selection becomes the next item', async () => {
  const r = render({source: 'lasso'});
  await flush();
  await press(r, '☑ Split lines');
  const field = () => r.root.findAllByType(TextInput).find(i => i.props.multiline)!;
  await act(async () => {
    field().props.onChangeText('book room agenda to Tom slides');
  });
  await press(r, '✂ Split at cursor');
  // No cursor known yet: nothing is split (the hint goes to the status slot).
  expect(field().props.value).toBe('book room agenda to Tom slides');
  await act(async () => {
    field().props.onSelectionChange({nativeEvent: {selection: {start: 10, end: 23}}});
  });
  await press(r, '✂ Split at cursor');
  const values = () => r.root.findAllByType(TextInput).map(i => i.props.value);
  expect(values()).toEqual(expect.arrayContaining(['book room slides', 'agenda to Tom']));
  // In rows: the focused row is split, the new item right below it.
  const row = () => r.root.findAllByType(TextInput).find(i => i.props.value === 'book room slides')!;
  await act(async () => {
    row().props.onFocus();
    row().props.onSelectionChange({nativeEvent: {selection: {start: 9, end: 9}}});
  });
  await press(r, '✂ Split at cursor');
  const rows = values().filter(v => ['book room', 'slides', 'agenda to Tom'].includes(v));
  expect(rows).toEqual(['book room', 'slides', 'agenda to Tom']);
});

it('lasso, then the last mark: Save & next ends on an empty form without the old picture', async () => {
  mockState.marksInbox = [
    {id: 'm-20261005-100000-001', createdAt: '2026-10-05 10:00', notePath: '/Note/x/A.note', page: 0, text: null},
  ];
  const r = render({source: 'lasso'});
  await flush();
  await flush();
  await press(r, 'Save 2 & next');
  expect(r.root.findAllByType(TextInput).map(i => i.props.value)).toContain('Room for offsite?');
  mockState.marksInbox = [];
  await press(r, 'Save & next');
  await flush();
  expect(texts(r).join(' ')).toContain('Lasso saved · no marks left. Add another todo or press Done.');
  expect(r.root.findAllByType(Image)).toHaveLength(0);
  expect(texts(r)).toContain('Done');
});

it('asks for an e-ink redraw when the recognized text arrives', async () => {
  const {requestEinkRefresh} = jest.requireMock('../../src/utils/screenRefresh');
  (requestEinkRefresh as jest.Mock).mockClear();
  render({source: 'lasso'});
  await flush();
  expect(requestEinkRefresh).toHaveBeenCalled();
});

it('starts recognizing the lasso before the project list is loaded (route A)', async () => {
  render({source: 'lasso'});
  await flush();
  expect(mockCalls.indexOf('recognize')).toBeGreaterThanOrEqual(0);
  expect(mockCalls.indexOf('recognize')).toBeLessThan(mockCalls.indexOf('cache'));
});
