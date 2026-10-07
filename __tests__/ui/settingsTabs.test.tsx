// Settings in pieces (technical-design-quality-0.9.md §3.11): every tab renders, and Save writes the draft.
const mockSaved: unknown[] = [];

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
jest.mock('../../src/storage/settingsStorage', () => {
  const s = jest.requireActual('../../src/domain/settings');
  const tagRules = jest.requireActual('../../src/domain/tagRules');
  const stored = {...s.DEFAULT_SETTINGS, tagRules: [tagRules.createDefaultMeetingRule('1')], experimentalGoogleCalendar: true, experimentalGmail: true};
  return {
    loadSettings: async () => stored,
    saveSettings: async (v: unknown) => {
      mockSaved.push(v);
    },
    patchSettings: async () => stored,
  };
});
jest.mock('../../src/storage/dataCache', () => ({clearCachedData: jest.fn(), rebuildCache: jest.fn()}));
jest.mock('../../src/storage/gmailInboxCache', () => ({clearCachedGmailInbox: jest.fn()}));
jest.mock('../../src/storage/inboxFolder', () => ({renameInboxFolderForSave: async () => 'unchanged'}));

import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {Text, TextInput} from 'react-native';
import Settings, {SettingsTab} from '../../src/screens/settings/Settings';
import {setFeatures} from '../../src/ui/featureStore';
import {StatusProvider} from '../../src/ui/status/StatusProvider';

async function render(tab: SettingsTab) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(
      <StatusProvider>
        <Settings initialTab={tab} />
      </StatusProvider>,
    );
  });
  return r;
}

const texts = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAllByType(Text).map(t => [].concat(t.props.children).join(''));

beforeAll(() => setFeatures({googleCalendar: true, gmail: true}));

describe('Settings tabs', () => {
  it.each<[SettingsTab, string]>([
    ['folders', 'Projects folder'],
    ['focus', 'Daily focus — Projects'],
    ['calendar', 'Google Calendar ICS link'],
    ['gmail', 'Gmail address'],
    ['templates', '+ New tag rule'],
    ['advanced', 'Reload all files'],
  ])('%s renders', async (tab, expected) => {
    const r = await render(tab);
    expect(texts(r).some(t => t.includes(expected))).toBe(true);
  });

  it('opens a tag rule for editing and the Add piece page', async () => {
    const r = await render('templates');
    const press = async (label: string) => {
      const node = r.root.findAll(n => n.props.onPress && texts({root: n} as never).some(t => t === label))[0];
      await act(async () => node.props.onPress());
    };
    await press('+ New tag rule');
    expect(texts(r)).toContain('+ Add piece');
    await press('+ Add piece');
    expect(texts(r)).toContain('‹ Back to rule');
  });

  it('Save writes the edited folder name', async () => {
    const r = await render('folders');
    const input = r.root.findAllByType(TextInput)[1];
    await act(async () => input.props.onChangeText('Projekte'));
    const save = r.root.findAll(n => n.props.onPress && texts({root: n} as never).includes('Save'))[0];
    await act(async () => save.props.onPress());
    expect(mockSaved.at(-1)).toMatchObject({projectsFolder: 'Projekte'});
  });
});
