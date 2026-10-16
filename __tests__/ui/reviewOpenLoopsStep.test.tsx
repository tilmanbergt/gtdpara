// docs/dev/history/technical-design-loops.md §4.8: Review's "Open loops" - the open loops per scope, what
// needs a look, and the summary with the overview and Close loop.
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
    noteSetups: [{...setups.createNoteSetup('r1', 'loop'), name: 'Workshops', tags: ['workshop']}],
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
      '- [ ] Book room #workshop/live #next',
      '',
      '## Meetings',
      '',
      '## Loops',
      '- workshop/offsite: active, 2026-01-05',
      '- workshop/live: active',
      '',
    ].join('\n'),
    '/storage/emulated/0/Note/2 Areas/0 Inbox/Inbox.txt': '---\nkind: inbox\n---\n\n## Tasks\n- [ ] Inbox only #wf/ivan\n\n## Meetings\n',
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
import {loopKindsReady} from '../../src/storage/loopKinds';
import {StatusProvider} from '../../src/ui/status/StatusProvider';
import {getOverview} from '../../src/ui/overviewStore';

const AREA = '/storage/emulated/0/Note/2 Areas/Coaching';

const texts = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));
const pressText = async (r: TestRenderer.ReactTestRenderer, label: string | RegExp) => {
  const matches = (text: string) => (typeof label === 'string' ? text === label : label.test(text));
  const found = r.root.findAllByType(Text).filter(t => matches([t.props.children].flat().join('')));
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

async function detail(r: TestRenderer.ReactTestRenderer, key: string) {
  const md = r.root.findAll(n => n.props.header === 'Open loops' && typeof n.props.renderDetail === 'function')[0];
  let part!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    part = TestRenderer.create(<StatusProvider>{md.props.renderDetail(key)}</StatusProvider>);
  });
  return part;
}

describe('Review: Open loops', () => {
  it('lists the open loops per scope, counts the ones needing a look, and opens the overview', async () => {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<App />);
    });
    await act(async () => {
      await loopKindsReady();
    });
    await settle();
    await pressText(r, /^Review/);
    await settle();
    expect(texts(r)).toContain('Open loops');
    expect(texts(r)).toContain('1 loop');
    await pressText(r, 'Open loops');
    await settle();

    const md = r.root.findAll(n => n.props.header === 'Open loops' && Array.isArray(n.props.rows))[0];
    expect(md.props.rows.map((row: {label: string}) => row.label)).toEqual(['Coaching', 'offsite', 'live']);

    const offsite = await detail(r, `${AREA}|workshop/offsite`);
    expect(texts(offsite)).toEqual(expect.arrayContaining(['○ offsite', 'workshop · in Coaching', 'Open overview ›', 'Close loop', '0 open · no next action']));
    expect(texts(offsite).some(t => t.endsWith('· close?'))).toBe(true);
    const live = await detail(r, `${AREA}|workshop/live`);
    expect(texts(live)).toContain('1 open · 1 next');
    expect(texts(live).some(t => t.includes('close?') || t === 'no next action')).toBe(false);
    await pressText(offsite, 'Open overview ›');
    expect(getOverview()).toEqual({tag: 'workshop/offsite', ownerPath: AREA, lens: 'thread'});
    act(() => r.unmount());
  });
});
