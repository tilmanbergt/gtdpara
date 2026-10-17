// docs/dev/history/technical-design-home-notebooks.md §3.3: the Projects tab shows a notebook icon at the end of every row,
// on every status; a row tall enough for the icon's touch target.
jest.mock('react-native-svg', () => {
  const ReactLib = require('react');
  const stub = (name: string) => (props: object) => ReactLib.createElement(name, props);
  return {Svg: stub('Svg'), Path: stub('Path'), Circle: stub('Circle'), Rect: stub('Rect')};
});
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@react-native-clipboard/clipboard', () => ({setString: jest.fn(), getString: jest.fn(async () => '')}));
jest.mock('sn-plugin-lib', () => ({PluginCommAPI: {}, PluginFileAPI: {}}));
jest.mock('../../src/utils/screenRefresh', () => ({requestEinkRefresh: jest.fn(), useEinkRefreshOnLoad: jest.fn()}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
jest.mock('../../src/storage/settingsStorage', () => ({
  loadSettings: async () => {
    const s = jest.requireActual('../../src/domain/settings');
    const setups = jest.requireActual('../../src/domain/noteSetups');
    return {...s.DEFAULT_SETTINGS, noteSetupDefaults: {...setups.seedNoteSetupDefaults(), notebook: {name: '{name} {year}', folder: ''}}};
  },
}));
jest.mock('../../src/supernote/fileSystem', () => ({
  displayPath: (p: string) => p,
  statFiles: async (paths: string[]) => paths.map(path => ({path, exists: path.includes('/Garden/'), lastModified: 0, size: 0})),
  subscribeFolderChanges: () => () => undefined,
}));
jest.mock('../../src/storage/dataCache', () => {
  const item = (name: string, status: string) => ({kind: 'project', name, path: `/n/1 Projects/${name}`, status, abbrev: null, dailyFocus: false, weeklyFocus: false, monthlyFocus: false});
  const cache = {items: [item('Garden', 'active'), item('Boat', 'on-hold'), item('Tax', 'done')], paths: {projects: '/n/1 Projects'}};
  return {getCachedData: () => cache, getCacheVersion: () => 1, subscribeCache: () => () => undefined, rebuildCache: async () => cache, findCachedItem: () => undefined};
});

import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import ItemsList from '../../src/screens/ItemsList';
import {StatusProvider} from '../../src/ui/status/StatusProvider';

describe('ItemsList with home notebooks', () => {
  it('renders an icon on Active, On Hold and Done rows', async () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    await act(async () => {
      renderer = TestRenderer.create(
        <StatusProvider>
          <ItemsList kind="project" onOpenItem={() => undefined} />
        </StatusProvider>,
      );
    });
    await act(async () => undefined);
    const labels = renderer!.root.findAll(n => typeof n.props.accessibilityLabel === 'string' && /^(Open|Create) /.test(n.props.accessibilityLabel)).map(n => n.props.accessibilityLabel);
    const year = new Date().getFullYear();
    expect(new Set(labels)).toEqual(new Set([`Open Garden ${year}`, `Create Boat ${year}`, `Create Tax ${year}`]));
  });
});
