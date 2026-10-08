// docs/dev/history/technical-design-projects-findable-notes.md §1: an Area page's Projects tab - its
// assigned Projects with their signals, the on-hold fold, and a row tap opening the Project.
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
  return {loadSettings: async () => stored, saveSettings: async () => undefined, patchSettings: async () => stored};
});
jest.mock('../../src/supernote/fileSystem', () => {
  const files: Record<string, string> = {
    '/storage/emulated/0/Note/2 Areas/Home/area.txt': '---\nkind: area\nstatus: active\n---\n\n## Tasks\n\n## Meetings\n',
    '/storage/emulated/0/Note/1 Projects/Garden/project.txt': [
      '---',
      'kind: project',
      'status: active',
      'area: Home',
      '---',
      '',
      '## Tasks',
      '- [ ] Order soil #next',
      '- [ ] Sketch beds',
      '',
      '## Meetings',
      '',
    ].join('\n'),
    '/storage/emulated/0/Note/1 Projects/Boat/project.txt': '---\nkind: project\nstatus: on-hold\narea: Home\n---\n\n## Tasks\n\n## Meetings\n',
    '/storage/emulated/0/Note/1 Projects/Elsewhere/project.txt': '---\nkind: project\nstatus: active\n---\n\n## Tasks\n\n## Meetings\n',
    '/storage/emulated/0/Note/2 Areas/0 Inbox/Inbox.txt': '---\nkind: inbox\n---\n\n## Tasks\n\n## Meetings\n',
  };
  const folders: Record<string, string[]> = {
    '1 Projects': ['Garden', 'Boat', 'Elsewhere'],
    '2 Areas': ['Home'],
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
    listFolderEntries: async (folder: string) => {
      const names = folders[folder.split('/').pop() ?? ''] ?? [];
      return names.map(name => ({name, path: `${folder}/${name}`, isFolder: true}));
    },
    readTextFile: async (path: string) => {
      if (path in files) return files[path];
      throw new Error(`no file ${path}`);
    },
    writeTextFile: async (path: string, text: string) => {
      files[path] = text;
    },
  };
});

import React from 'react';
import {Text} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import App from '../../App';

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
const filesTabs = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAll(n => Array.isArray(n.props.tabs) && n.props.tabs.some((t: {label: string}) => t.label === 'Threads'))[0];
const projectsList = (r: TestRenderer.ReactTestRenderer) => r.root.findAll(n => n.props.header === 'Projects' && Array.isArray(n.props.rows))[0];

async function settle() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }
}

describe('the Projects tab on an Area page', () => {
  it('lists the Area’s Projects with their signals and opens one on tap', async () => {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<App />);
    });
    await settle();
    await pressText(r, 'Areas');
    await settle();
    await pressText(r, /^Home /);
    await settle();
    expect(filesTabs(r).props.tabs.map((t: {label: string}) => t.label)).toEqual(['Threads', 'Projects', 'Area Files', 'Resources']);
    expect(filesTabs(r).props.activeKey).toBe('threads');
    await act(async () => filesTabs(r).props.onChange('projects'));
    await settle();
    const list = projectsList(r);
    expect(list.props.rows.map((row: {kind: string; glance?: {item: {name: string}}; count?: number}) => row.glance?.item.name ?? `${row.kind}:${row.count}`)).toEqual([
      'Garden',
      'fold:1',
    ]);
    let garden!: TestRenderer.ReactTestRenderer;
    act(() => {
      garden = TestRenderer.create(list.props.renderRow(list.props.rows[0]));
    });
    expect(texts(garden)).toEqual(expect.arrayContaining(['Garden', 'last — · next —', '2 open · 1 next']));
    await act(async () => garden.root.findAll(n => typeof n.props.onPress === 'function')[0].props.onPress());
    await settle();
    expect(texts(r)).toEqual(expect.arrayContaining(['Garden', 'Project']));
    expect(filesTabs(r).props.tabs.map((t: {label: string}) => t.label)).toEqual(['Threads', 'Project Files', 'Resources', 'Area Files']);
    act(() => r.unmount());
  });
});
