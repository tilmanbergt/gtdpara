// docs/dev/history/technical-design-tending-threads.md §3.9: the Current page's Threads tab - New with
// Tend / Not, the counterpart filter (the §1.2.1 predicate) and its pill, Set inactive with the close-out.
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

const AREA_FILE = '/storage/emulated/0/Note/2 Areas/Coaching/area.txt';

const texts = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));
const pressText = async (r: TestRenderer.ReactTestRenderer, label: string | RegExp, index = 0) => {
  const matches = (text: string) => (typeof label === 'string' ? text === label : label.test(text));
  const found = r.root.findAllByType(Text).filter(t => matches([t.props.children].flat().join('')));
  expect(found.length).toBeGreaterThan(index);
  let node: TestRenderer.ReactTestInstance | null = found[index];
  while (node && typeof node.props.onPress !== 'function') node = node.parent;
  expect(node).not.toBeNull();
  await act(async () => node!.props.onPress());
};
/** The rows a list was handed (lists measure themselves on the device). */
const listRows = (r: TestRenderer.ReactTestRenderer, header: string) =>
  r.root.findAll(n => n.props.header === header && Array.isArray(n.props.rows))[0]?.props.rows ?? [];

/**
 * Presses `label` inside the first row of list `header` that `pick` accepts: the row is rendered on
 * its own from the list's renderRow (the list itself shows nothing without a measured layout).
 */
const pressInRow = async (r: TestRenderer.ReactTestRenderer, header: string, pick: (row: any) => boolean, label: string) => {
  const list = r.root.findAll(n => n.props.header === header && Array.isArray(n.props.rows))[0];
  const row = list.props.rows.find(pick);
  expect(row).toBeDefined();
  let part!: TestRenderer.ReactTestRenderer;
  act(() => {
    part = TestRenderer.create(list.props.renderRow(row));
  });
  await pressText(part, label);
  await settle();
};
const leafIs = (leaf: string) => (row: any) => row.entry?.counterpart?.leaf === leaf;

async function settle() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }
}

async function openCoachingThreads() {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<App />);
  });
  await settle();
  await pressText(r, 'Areas');
  await settle();
  await pressText(r, /^Coaching /);
  await settle();
  // Threads comes first and is open, then Projects; the Projects' folders and Browse show only while arming.
  const filesTabs = r.root.findAll(n => Array.isArray(n.props.tabs) && n.props.tabs.some((t: {label: string}) => t.label === 'Threads'))[0];
  expect(filesTabs.props.tabs.map((t: {label: string}) => t.label)).toEqual(['Threads', 'Projects', 'Area Files', 'Resources']);
  expect(filesTabs.props.activeKey).toBe('threads');
  return r;
}

describe('the Threads tab on the Current page', () => {
  it('lists New and Active counterparts of the scope, no Inbox-only ones, and writes Tend', async () => {
    const r = await openCoachingThreads();
    const rows = listRows(r, 'Threads').map((row: {kind: string; label?: string; entry?: {counterpart: {leaf: string}}}) =>
      row.entry ? `${row.kind}:${row.entry.counterpart.leaf}` : `${row.kind}:${row.label}`,
    );
    expect(rows).toEqual(['head:New', 'confirm:anna', 'head:Active', 'active:alpha']);
    const list = r.root.findAll(n => n.props.header === 'Threads' && Array.isArray(n.props.rows))[0];
    let anna!: TestRenderer.ReactTestRenderer;
    act(() => {
      anna = TestRenderer.create(list.props.renderRow(list.props.rows.find(leafIs('anna'))));
    });
    expect(texts(anna)).toEqual(expect.arrayContaining(['anna', 'w/f only', 'Tend', 'Not']));
    await pressInRow(r, 'Threads', leafIs('anna'), 'Tend');
    const write = mockWrites.filter(([path]) => path === AREA_FILE).pop();
    expect(write?.[1]).toContain('## Threads\n- alpha: active\n- anna: active\n');
    act(() => r.unmount());
  });

  it('filters Todos and Meetings by the counterpart, with a pill to clear it', async () => {
    const r = await openCoachingThreads();
    await pressInRow(r, 'Threads', leafIs('alpha'), 'alpha');
    expect(texts(r)).toContain('alpha ✕');
    const todos = listRows(r, 'Todos').filter((row: {kind: string}) => row.kind === 'entry').map((row: {task: {text: string}}) => row.task.text);
    expect(todos).toEqual(['Draft agenda #retro/alpha', 'Agreed point']);
    const meetings = listRows(r, 'Meetings').filter((row: {meeting?: unknown}) => row.meeting).map((row: {meeting: {title: string}}) => row.meeting.title);
    expect(meetings).toEqual(['Retro #retro/alpha']);
    await pressText(r, 'alpha ✕');
    await settle();
    expect(texts(r)).not.toContain('alpha ✕');
    expect(listRows(r, 'Todos').filter((row: {kind: string}) => row.kind === 'entry')).toHaveLength(4);
    act(() => r.unmount());
  });

  it('closes out I owe and Relevant before setting inactive', async () => {
    const r = await openCoachingThreads();
    await pressInRow(r, 'Threads', leafIs('alpha'), 'alpha');
    await pressInRow(r, 'Threads', leafIs('alpha'), 'Set inactive');
    expect(texts(r)).toContain('Set alpha inactive');
    const closeRows = listRows(r, 'Open todos').map((row: {kind: string; label?: string; entry?: {task: {text: string}}}) => row.entry?.task.text ?? row.label);
    expect(closeRows).toEqual(['I owe', 'Agreed point', 'Relevant', 'Draft agenda #retro/alpha']);
    await pressInRow(r, 'Open todos', row => row.entry?.task.text === 'Agreed point', 'Done');
    await pressText(r, 'Set inactive');
    await settle();
    const write = mockWrites.filter(([path]) => path === AREA_FILE).pop()![1];
    expect(write).toContain('- [x] Agreed point');
    expect(write).toContain('- [ ] Draft agenda #retro/alpha');
    expect(write).toContain('- alpha: inactive');
    expect(texts(r)).not.toContain('alpha ✕');
    expect(listRows(r, 'Threads').map((row: {kind: string}) => row.kind)).toContain('fold');
    act(() => r.unmount());
  });
});
