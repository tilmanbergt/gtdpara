// docs/dev/history/technical-design-engage-in-context.md §2.3, §2.10: the overview's "n someday ›" opens Review's
// "Someday / Maybe" step filtered to its todos; "Show all" lists every one; #next brings a todo back.
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
  PluginManager: {registerButtonListener: () => ({remove: () => undefined}), closePluginView: jest.fn()},
  PluginCommAPI: {},
  PluginFileAPI: {},
  PluginNoteAPI: {},
}));
jest.mock('../../src/utils/screenRefresh', () => ({requestEinkRefresh: jest.fn(), useEinkRefreshOnLoad: jest.fn()}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
jest.mock('../../src/supernote/pluginPermissions', () => ({
  ensureFileReadPermission: async () => true,
  ensureFileWritePermission: async () => true,
  ensureFileDeletePermission: async () => true,
}));
jest.mock('../../src/storage/settingsStorage', () => {
  const s = jest.requireActual('../../src/domain/settings');
  const setups = jest.requireActual('../../src/domain/noteSetups');
  const stored = {
    ...s.DEFAULT_SETTINGS,
    lastSeenVersion: '99.0.0',
    noteSetups: [{...setups.createNoteSetup('r1', 'thread'), name: 'Retros', tags: ['retro']}],
  };
  return {
    loadSettings: async () => stored,
    saveSettings: async () => undefined,
    patchSettings: async () => stored,
    updateReviewSteps: async (fn: (steps: object) => object) => ({...stored, reviewSteps: fn(stored.reviewSteps)}),
  };
});
const mockWrites: Array<[string, string]> = [];
jest.mock('../../src/supernote/fileSystem', () => {
  const files: Record<string, string> = {
    '/storage/emulated/0/Note/2 Areas/Coaching/area.txt': [
      '---',
      'kind: area',
      'status: active',
      '---',
      '',
      '## Tasks',
      '- [ ] Draft agenda #retro/alpha',
      '- [ ] Parked idea #retro/alpha #someday',
      '- [ ] Unrelated dream #maybe',
      '',
      '## Meetings',
      '- 2026-01-07 10:00-11:00 Retro #retro/alpha',
      '',
    ].join('\n'),
    '/storage/emulated/0/Note/2 Areas/0 Inbox/Inbox.txt': '---\nkind: inbox\n---\n\n## Tasks\n\n## Meetings\n',
  };
  return {
    ...jest.requireActual('../../src/supernote/fileSystem'),
    getCurrentNotePath: async () => null,
    rememberLaunchNotePath: () => undefined,
    setOpenPathObserver: () => undefined,
    getPrivateTempDir: async () => '/tmp/gtdpara',
    deleteTempTree: async () => undefined,
    appendDebugLogFile: async () => undefined,
    writePerfTraceFile: async () => undefined,
    statFiles: async () => null,
    fileExists: async (path: string) => path in files,
    listFolderEntries: async (folder: string) =>
      folder.endsWith('2 Areas') ? [{name: 'Coaching', path: `${folder}/Coaching`, isFolder: true}] : [],
    readTextFile: async (path: string) => {
      if (path in files) return files[path];
      throw new Error(`no file ${path}`);
    },
    writeTextFile: async (path: string, text: string) => {
      files[path] = text;
      mockWrites.push([path, text]);
    },
  };
});

import React from 'react';
import {Text} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import App from '../../App';
import {getOverview, openOverview} from '../../src/ui/overviewStore';
import {StatusProvider} from '../../src/ui/status/StatusProvider';

const AREA = '/storage/emulated/0/Note/2 Areas/Coaching';

const texts = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));
const pressText = async (r: TestRenderer.ReactTestRenderer, label: string) => {
  const found = r.root.findAllByType(Text).filter(t => [t.props.children].flat().join('') === label);
  expect(found.length).toBeGreaterThan(0);
  let node: TestRenderer.ReactTestInstance | null = found[0];
  while (node && typeof node.props.onPress !== 'function') node = node.parent;
  expect(node).not.toBeNull();
  await act(async () => node!.props.onPress());
};

async function settle() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }
}

const stepList = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAll(n => n.props.header === 'Someday / Maybe' && typeof n.props.renderDetail === 'function')[0];
const rowTexts = (r: TestRenderer.ReactTestRenderer) =>
  stepList(r).props.rows.map((row: {kind: string; taskEntry?: {task: {text: string}}; entry: {item: {name: string}}}) =>
    row.kind === 'entry' ? row.taskEntry!.task.text : `[${row.entry.item.name}]`,
  );

describe('Review: Someday / Maybe', () => {
  it('opens filtered from the overview, shows all on request, and #next brings a todo back', async () => {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<App />);
    });
    await settle();
    await act(async () => openOverview({tag: 'retro/alpha', ownerPath: AREA}));
    await settle();
    await pressText(r, '1 someday ›');
    await settle();

    expect(getOverview()).toBeNull();
    expect(texts(r).some(t => t.includes('Someday / Maybe'))).toBe(true);
    expect(rowTexts(r)).toEqual(['[Coaching]', 'Parked idea #retro/alpha #someday']);
    expect(texts(r).some(t => t.startsWith('   Only #retro/alpha · '))).toBe(true);

    await pressText(r, 'Show all');
    await settle();
    expect(rowTexts(r)).toEqual(['[Coaching]', 'Parked idea #retro/alpha #someday', 'Unrelated dream #maybe']);

    let detail!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      detail = TestRenderer.create(<StatusProvider>{stepList(r).props.renderDetail(`${AREA}#1`)}</StatusProvider>);
    });
    expect(texts(detail)).toEqual(expect.arrayContaining(['#next', 'To plan', 'Done', 'Cancel']));
    await pressText(detail, '#next');
    await settle();
    const written = mockWrites.filter(([path]) => path.endsWith('area.txt')).pop()![1];
    expect(written).toContain('- [ ] Parked idea #retro/alpha #next');
    expect(written).not.toContain('Parked idea #retro/alpha #someday');
    act(() => detail.unmount());
    act(() => r.unmount());
  });
});
