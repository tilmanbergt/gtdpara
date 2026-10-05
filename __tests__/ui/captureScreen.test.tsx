// docs/dev/technical-design-lasso-0.8.md §3.7: the shared capture / marks screen.
const mockCalls: string[] = [];
const mockAdded: Array<{text: string; notePath: string; dest: {type: string}}> = [];
const mockState = {marksInbox: [] as unknown[]};

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
    getCachedData: () => ({scannedAt: 0, paths, items: []}),
    rebuildCache: async () => ({scannedAt: 0, paths, items: []}),
    setCachedInbox: jest.fn(),
  };
});
jest.mock('../../src/ui/useCachedItems', () => ({useCachedItems: () => []}));
jest.mock('../../src/ui/useCachedInbox', () => ({useCachedInbox: () => ({marks: mockState.marksInbox})}));
jest.mock('../../src/storage/itemMutations', () => ({
  buildTask: (text: string, opts: {notePath?: string}) => ({text, notePath: opts?.notePath ?? ''}),
  buildMeeting: (f: object, opts: {notePath?: string}) => ({...f, notePath: opts?.notePath ?? ''}),
  addTaskToDestination: async (task: {text: string; notePath: string}, dest: {type: string}) => {
    mockAdded.push({text: task.text, notePath: task.notePath, dest});
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
  recognizeMark: async (open: {mark: {id: string}}) => ({
    text: open.mark.id.endsWith('1') ? 'Room for offsite?' : 'Ask HR',
    error: null,
    ms: 1,
    missing: false,
  }),
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
  recognizeStrokes: async () => ({text: '- book room\n- agenda to Tom', error: null, ms: 1}),
}));

import React from 'react';
import {Text, TextInput} from 'react-native';
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
});

it('lasso without marks: no column, bullets split, saves with a page link and closes', async () => {
  const r = render({source: 'lasso'});
  await flush();
  expect(texts(r)).not.toContain('Lasso & marks');
  const values = r.root.findAllByType(TextInput).map(i => i.props.value);
  expect(values).toEqual(expect.arrayContaining(['book room', 'agenda to Tom']));
  await press(r, 'Save 2 & close');
  expect(mockAdded.map(a => a.text)).toEqual(['book room', 'agenda to Tom']);
  expect(mockAdded[0].notePath).toBe('/Note/2 Areas/0 Inbox/Todos/Test.note#page=2');
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
  expect(mockAdded[0].notePath).toBe('/Note/x/A.note#page=1');
  expect(mockCalls).toContain('finish:m-20261005-100000-001:done');
  expect(texts(r).join(' ')).toContain('A.note · p2');
});
