// docs/dev/history/technical-design-note-setups-finish.md §2: three top tabs on every Project/Area page,
// the places inside Files (Project · Area · Resources, or Area · Resources), opening on the page's own files.
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
    noteSetups: [{...setups.createNoteSetup('r1', 'thread'), name: 'Retro', tags: ['retro']}],
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
    '/storage/emulated/0/Note/1 Projects/Allotment/project.txt': '---\nkind: project\nstatus: active\n---\n\n## Tasks\n\n## Meetings\n',
    '/storage/emulated/0/Note/2 Areas/0 Inbox/Inbox.txt': '---\nkind: inbox\n---\n\n## Tasks\n\n## Meetings\n',
  };
  const folders: Record<string, string[]> = {
    '1 Projects': ['Garden', 'Boat', 'Allotment'],
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

async function settle() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }
}

const tabRows = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAll(n => Array.isArray(n.props.tabs) && typeof n.props.onChange === 'function' && n.props.tabs.some((t: {label: string}) => ['Threads', 'Project', 'Area'].includes(t.label)));
const labels = (node: TestRenderer.ReactTestInstance) => node.props.tabs.map((t: {label: string}) => t.label);

async function openPage(tab: 'Areas' | 'Projects', name: RegExp, nextPage = false) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<App />);
  });
  await settle();
  await pressText(r, tab);
  await settle();
  if (nextPage) {
    await pressText(r, '›');
    await settle();
  }
  await pressText(r, name);
  await settle();
  return r;
}

/** The top row's labels, then (after tapping Files) the places row's labels and its active place. */
async function filesOf(r: TestRenderer.ReactTestRenderer): Promise<{top: string[]; places: string[]; active: string}> {
  const top = filesTabs(r);
  expect(top.props.activeKey).toBe('threads');
  const files = top.props.tabs.find((t: {label: string}) => t.label === 'Files');
  await act(async () => top.props.onChange(files.key));
  await settle();
  const rows = tabRows(r);
  expect(rows).toHaveLength(2);
  return {top: labels(top), places: labels(rows[1]), active: rows[1].props.activeKey};
}

describe('one Files tab on the Project/Area page', () => {
  it('an Area: Threads · Projects · Files, with Area · Resources', async () => {
    const r = await openPage('Areas', /^Home /);
    // The header carries "Engage ›" for this Area (docs/dev/history/technical-design-engage.md §3.7).
    expect(r.root.findAll(n => n.props.label === 'Engage ›' && n.props.owner === undefined && typeof n.props.onPress === 'function')).toHaveLength(1);
    expect(await filesOf(r)).toEqual({top: ['Threads', 'Projects', 'Files'], places: ['Area', 'Resources'], active: 'project'});
    act(() => r.unmount());
  });

  it('a Project with an Area: Threads · Loops · Files, with Project · Area · Resources', async () => {
    const r = await openPage('Projects', /^Garden /);
    expect(await filesOf(r)).toEqual({top: ['Threads', 'Loops', 'Files'], places: ['Project', 'Area', 'Resources'], active: 'project'});
    act(() => r.unmount());
  });

  it('a Project without an Area: Project · Resources', async () => {
    const r = await openPage('Projects', /^Allotment /, true);
    expect(await filesOf(r)).toEqual({top: ['Threads', 'Loops', 'Files'], places: ['Project', 'Resources'], active: 'project'});
    act(() => r.unmount());
  });
});
