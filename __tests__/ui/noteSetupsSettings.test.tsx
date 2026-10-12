// Settings → Note setups (docs/dev/history/technical-design-note-setups.md §6): the list, the
// setup page with its page rows, the tag picker and the page layout page render and save.
const mockSaved: Array<Record<string, unknown>> = [];

jest.mock('react-native-svg', () => {
  const ReactLib = require('react');
  const stub = (props: object) => ReactLib.createElement('Svg', props);
  return {Svg: stub, Path: stub, Circle: stub, Rect: stub, Line: stub, Polyline: stub, G: stub};
});
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@react-native-clipboard/clipboard', () => ({setString: jest.fn(), getString: jest.fn(async () => '')}));
jest.mock('sn-plugin-lib', () => ({NativePluginManager: {}, PluginManager: {}, PluginCommAPI: {}, PluginFileAPI: {}, PluginNoteAPI: {}}));
jest.mock('../../src/utils/screenRefresh', () => ({requestEinkRefresh: jest.fn(), useEinkRefreshOnLoad: jest.fn()}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
jest.mock('../../src/supernote/fileSystem', () => ({
  ...jest.requireActual('../../src/supernote/fileSystem'),
  listFolderEntries: async () => [{name: 'Lined.png', path: '/MyStyle/Lined.png', isFolder: false}],
}));
jest.mock('../../src/storage/tagUsage', () => ({getRecentTags: async () => ['coaching/sabina', 'retro/alpha', 'daily']}));
jest.mock('../../src/storage/loopKinds', () => ({setLoopSetups: jest.fn()}));
jest.mock('../../src/storage/settingsStorage', () => {
  const s = jest.requireActual('../../src/domain/settings');
  const setups = jest.requireActual('../../src/domain/noteSetups');
  const stored = {
    ...s.DEFAULT_SETTINGS,
    noteSetups: [{...setups.createNoteSetup('1', 'thread'), name: 'Sparring', tags: ['sparring', 'retro']}],
    noteSetupDefaults: setups.seedNoteSetupDefaults(),
    nextNoteSetupId: 2,
    noteSetupsMigrated: true,
    noteSetupsNotice: [{setup: 'Sparring', change: 'merged', detail: 'Merged from the rules Sparring, Retro.'}],
  };
  return {
    loadSettings: async () => stored,
    saveSettings: async () => undefined,
    patchSettings: async (patch: Record<string, unknown>) => {
      mockSaved.push(patch);
      return {...stored, ...patch};
    },
  };
});
jest.mock('../../src/storage/dataCache', () => ({clearCachedData: jest.fn(), rebuildCache: jest.fn()}));
jest.mock('../../src/storage/gmailInboxCache', () => ({clearCachedGmailInbox: jest.fn()}));
jest.mock('../../src/storage/inboxFolder', () => ({renameInboxFolderForSave: async () => 'unchanged'}));

import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {Text, TextInput} from 'react-native';
import Settings from '../../src/screens/settings/Settings';
import {StatusEntry, StatusProvider, useStatusList} from '../../src/ui/status/StatusProvider';

let statusList: StatusEntry[] = [];
function StatusProbe(): null {
  statusList = useStatusList();
  return null;
}

async function render() {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(
      <StatusProvider>
        <Settings initialTab="templates" />
        <StatusProbe />
      </StatusProvider>,
    );
  });
  await measure(r);
  return r;
}

const texts = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map(t => [].concat(t.props.children).join(''));

/** Lays every measured box out at a device-like size, so paged lists show all their rows (as on the A5 X). */
async function measure(r: TestRenderer.ReactTestRenderer) {
  const nodes = r.root.findAll(n => typeof n.props.onLayout === 'function');
  await act(async () => {
    for (const n of nodes) n.props.onLayout({nativeEvent: {layout: {x: 0, y: 0, width: 473, height: 1200}}});
  });
}

async function press(r: TestRenderer.ReactTestRenderer, label: string) {
  const node = r.root.findAll(n => n.props.onPress && texts({root: n} as never).some(t => t === label))[0];
  if (!node) throw new Error(`No button "${label}" in: ${texts(r).join(' | ')}`);
  await act(async () => node.props.onPress());
  await measure(r);
}

beforeEach(() => {
  mockSaved.length = 0;
});

describe('Note setups list', () => {
  it('shows the heading style, the notice, the Default and the setups', async () => {
    const r = await render();
    const all = texts(r);
    expect(all).toContain('Tag Rules are now Note setups.');
    expect(all).toContain('Sparring: Merged from the rules Sparring, Retro.');
    expect(all).toContain('+ New note setup');
    expect(all).toContain('Default');
    expect(all.some(t => t.startsWith('#sparring #retro · own note per item'))).toBe(true);
    await press(r, 'OK');
    expect(mockSaved.at(-1)).toEqual({noteSetupsNotice: null});
  });
});

describe('setup page', () => {
  it('lists the page rows, opens the tag picker, and refuses a tag another setup has', async () => {
    const r = await render();
    await press(r, '+ New note setup');
    expect(texts(r)).toEqual(expect.arrayContaining(['Pages', 'Meeting page', 'Todo page', 'Default layout · 4 pieces · blank']));
    expect(texts(r)).not.toContain('First page');
    await press(r, '+ tag');
    // Types first; tags of the Sparring setup left out.
    expect(texts(r)).toEqual(expect.arrayContaining(['#coaching', '#daily']));
    expect(texts(r)).not.toContain('#retro');
    await press(r, '#coaching');
    const input = r.root.findAllByType(TextInput)[0];
    await act(async () => input.props.onChangeText('#Retro'));
    await press(r, 'Add');
    expect(statusList.some(e => e.msg.text === '#retro is already in Sparring.')).toBe(true);
    await press(r, 'Done');
    expect(texts(r)).toContain('#coaching');
    await press(r, 'Loop');
    expect(texts(r)).toContain('First page');
    await press(r, 'Save');
    const saved = mockSaved.at(-1) as {noteSetups: Array<{name: string; kind: string; tags: string[]}>; nextNoteSetupId: number};
    expect(saved.noteSetups[1]).toMatchObject({name: '#coaching', kind: 'loop', tags: ['coaching']});
    expect(saved.nextNoteSetupId).toBe(3);
  });

  it('refuses a folder that leaves the Area or Project', async () => {
    const r = await render();
    await press(r, 'Sparring');
    await press(r, 'One notebook');
    const inputs = r.root.findAllByType(TextInput);
    await act(async () => inputs[inputs.length - 1].props.onChangeText('../x'));
    await press(r, 'Save');
    expect(statusList.some(e => e.msg.text === 'A folder name cannot start with a dot.')).toBe(true);
    expect(mockSaved).toEqual([]);
  });
});

describe('page layout page', () => {
  it('Customize copies the Default page; Pieces · Add · Background edit it; Save stores the own layout', async () => {
    const r = await render();
    await press(r, 'Sparring');
    const customize = r.root.findAll(n => n.props.onPress && texts({root: n} as never).some(t => t === 'Customize ›'))[0];
    await act(async () => customize.props.onPress());
    await measure(r);
    expect(texts(r)).toEqual(expect.arrayContaining(['Meeting page · Own layout', 'Pieces', 'Add', 'Background', 'Use default']));
    await press(r, 'Add');
    expect(texts(r)).toEqual(expect.arrayContaining(['✓ Date & title', 'Since last time', '+ New text']));
    await press(r, 'Since last time');
    expect(texts(r)).toContain('✓ Since last time');
    await press(r, 'Background');
    await press(r, 'Lined.png');
    expect(texts(r)).toContain('✓ Lined.png');
    await press(r, 'Done');
    expect(texts(r)).toContain('Own layout · 5 pieces · Lined.png');
    await press(r, 'Save');
    const saved = mockSaved.at(-1) as {noteSetups: Array<{pages: Record<string, {template: string; pieces: Array<{type: string}>}>}>};
    expect(saved.noteSetups[0].pages.meeting.template).toBe('Lined.png');
    expect(saved.noteSetups[0].pages.meeting.pieces.map(p => p.type)).toEqual(['dateTitle', 'time', 'link', 'related', 'sinceLast']);
  });

  it('Use default asks first, then drops the own layout', async () => {
    const r = await render();
    await press(r, 'Sparring');
    await press(r, 'Customize ›');
    // Use default waits for the confirm, so it is not awaited here.
    const useDefault = r.root.findAll(n => n.props.onPress && texts({root: n} as never).some(t => t === 'Use default'))[0];
    act(() => {
      useDefault.props.onPress();
    });
    const confirm = statusList.find(e => e.msg.kind === 'confirm');
    expect(confirm?.msg.text).toBe('Use the Default page? Your own layout for this page is removed.');
    await act(async () => confirm!.msg.actions![0].onPress());
    await measure(r);
    expect(texts(r)).toContain('Default layout · 4 pieces · blank');
    expect(texts(r)).not.toContain('Own layout · 4 pieces · blank');
  });

  it('the Default page has Notes and Edit › rows for all three pages', async () => {
    const r = await render();
    await press(r, 'Default');
    expect(texts(r)).toEqual(expect.arrayContaining(['Own note per item', 'One notebook', 'First page', 'Edit ›']));
    await press(r, 'One notebook');
    await press(r, 'Save');
    expect(mockSaved.at(-1)).toMatchObject({noteSetupDefaults: {notebook: {name: '{tag} {subtag} {year}', folder: ''}}});
  });
});
