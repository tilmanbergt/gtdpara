// docs/dev/history/technical-design-tending-threads.md §3.10: Review's "Tending threads" - the roster per
// scope with the New block, the summary panel, Tend, and "Open overview" over Review.
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
  const rules = jest.requireActual('../../src/domain/tagRules');
  const stored = {
    ...s.DEFAULT_SETTINGS,
    lastSeenVersion: '99.0.0',
    tagRules: [{...rules.createEmptyTagRule('r1', 'meeting'), name: 'Retro', tags: ['retro']}],
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
      '- [ ] Agreed point [meeting:: 2026-01-07 Retro retro/alpha]',
      '- [ ] Unrelated todo',
      '- [ ] Ask Anna #wf/anna [created:: 2026-01-01]',
      '',
      '## Meetings',
      '- 2026-01-07 10:00-11:00 Retro #retro/alpha',
      '- 2026-01-08 10:00-11:00 Other',
      '',
      '## Threads',
      '- alpha: active',
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
import {StatusProvider} from '../../src/ui/status/StatusProvider';
import {getThreadOverview} from '../../src/ui/threadOverlayStore';

const AREA = '/storage/emulated/0/Note/2 Areas/Coaching';
const AREA_FILE = `${AREA}/area.txt`;

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

/** The step's detail column for `key`, rendered on its own (the list shows nothing without a measured layout). */
async function detail(r: TestRenderer.ReactTestRenderer, key: string) {
  const md = r.root.findAll(n => n.props.header === 'Tending threads' && typeof n.props.renderDetail === 'function')[0];
  let part!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    part = TestRenderer.create(<StatusProvider>{md.props.renderDetail(key)}</StatusProvider>);
  });
  return part;
}

describe('Review: Tending threads', () => {
  it('lists the roster per scope and offers the summary, Tend and the overview', async () => {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<App />);
    });
    await settle();
    await pressText(r, /^Review/);
    await settle();
    expect(texts(r)).toContain('Tending threads');
    expect(texts(r)).toContain('2 counterparts');
    await pressText(r, 'Tending threads');
    await settle();

    const md = r.root.findAll(n => n.props.header === 'Tending threads' && Array.isArray(n.props.rows))[0];
    expect(md.props.rows.map((row: {kind: string; label?: string; leaf?: string}) => row.leaf ?? row.label)).toEqual(['New', 'anna', 'Coaching', 'alpha']);

    const alpha = await detail(r, `${AREA}|alpha`);
    expect(texts(alpha)).toEqual(expect.arrayContaining(['alpha', 'Open overview ›', 'Set inactive', 'I owe · 1', 'Relevant · 1']));
    expect(texts(alpha)).toContain('+ Next retro');
    await pressText(alpha, 'Open overview ›');
    expect(getThreadOverview()).toEqual({tag: 'retro/alpha', ownerPath: AREA, lens: 'counterpart'});
    await settle();
    expect(texts(r)).toContain('‹ Review');

    const anna = await detail(r, `${AREA}|anna`);
    expect(texts(anna)).toEqual(expect.arrayContaining(['anna', 'Tend', 'Not', 'Waiting for · 1']));
    expect(texts(anna).join(' ')).toContain('w/f only');
    await pressText(anna, 'Tend');
    await settle();
    const write = mockWrites.filter(([path]) => path === AREA_FILE).pop();
    expect(write?.[1]).toContain('- anna: active');
    act(() => r.unmount());
  });
});
