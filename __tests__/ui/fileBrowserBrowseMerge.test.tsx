// docs/dev/history/technical-design-tending-threads.md §3.9.4 (D4): Browse is the Project Files slot's
// alternate - shown there while an arm targets it, offered as a row while link-arming - and extra tabs.
jest.mock('../../src/utils/screenRefresh', () => ({requestEinkRefresh: jest.fn(), useEinkRefreshOnLoad: jest.fn()}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
jest.mock('../../src/supernote/fileSystem', () => ({
  listFolderEntries: async (folder: string) => [{name: `${folder.split('/').pop()}-file.pdf`, path: `${folder}/x.pdf`, isFolder: false}],
  openPath: jest.fn(),
  subscribeFolderChanges: () => () => undefined,
}));

import React from 'react';
import {Text} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import FileBrowserPane, {FileBrowserRoot, LinkTarget, OTHER_ITEMS_ROW_LABEL} from '../../src/ui/FileBrowserPane';
import {StatusProvider} from '../../src/ui/status/StatusProvider';

const browse: FileBrowserRoot = {
  key: 'browse',
  label: 'Browse',
  rootPath: '/n',
  sources: [
    {kind: 'project', path: '/n/1 Projects', label: 'Projects'},
    {kind: 'area', path: '/n/2 Areas', label: 'Areas'},
  ],
};
const roots: FileBrowserRoot[] = [
  {key: 'project', label: 'Project Files', rootPath: '/n/1 Projects/P', alternate: browse},
  {key: 'resources', label: 'Resources', rootPath: '/n/3 Resources'},
];
const extraTabs = [{key: 'threads', label: 'Threads', render: () => <Text>threads content</Text>}];

const tabLabels = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAll(n => Array.isArray(n.props.tabs) && typeof n.props.onChange === 'function')[0].props.tabs.map((t: {label: string}) => t.label);
const listRows = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAll(n => Array.isArray(n.props.rows) && typeof n.props.renderRow === 'function')[0]?.props.rows ?? [];
const texts = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));

async function settle() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }
}

function pane(linkTarget: LinkTarget | null) {
  return (
    <StatusProvider>
      <FileBrowserPane roots={roots} linkTarget={linkTarget} extraTabs={extraTabs} viewportHeight={400} textColor="#000" borderColor="#000" />
    </StatusProvider>
  );
}

describe('FileBrowserPane: Browse merge and extra tabs', () => {
  it('offers no Browse tab outside arming, and shows an extra tab', async () => {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(pane(null));
    });
    await settle();
    expect(tabLabels(r)).toEqual(['Project Files', 'Resources', 'Threads']);
    const tabs = r.root.findAll(n => Array.isArray(n.props.tabs) && typeof n.props.onChange === 'function')[0];
    await act(async () => tabs.props.onChange('threads'));
    expect(texts(r)).toContain('threads content');
    act(() => r.unmount());
  });

  it('shows Browse in the Project Files slot while a refile arm targets it, and switches back', async () => {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(pane(null));
    });
    await settle();
    const refile: LinkTarget = {mode: 'arming', onPick: jest.fn(), onCancel: jest.fn(), pickKind: 'folder', root: 'browse'};
    await act(async () => r.update(pane(refile)));
    await settle();
    expect(tabLabels(r)).toEqual(['Browse', 'Resources', 'Threads']);
    expect(listRows(r).map((e: {name: string}) => e.name)).toEqual(['Projects', 'Areas']);
    await act(async () => r.update(pane(null)));
    await settle();
    expect(tabLabels(r)).toEqual(['Project Files', 'Resources', 'Threads']);
    expect(listRows(r).map((e: {name: string}) => e.name)).toEqual(['P-file.pdf']);
    act(() => r.unmount());
  });

  it('offers "Other Projects/Areas ›" while link-arming, opening Browse in the same slot', async () => {
    let r!: TestRenderer.ReactTestRenderer;
    const link: LinkTarget = {mode: 'arming', onPick: jest.fn(), onCancel: jest.fn()};
    await act(async () => {
      r = TestRenderer.create(pane(link));
    });
    await settle();
    expect(listRows(r).map((e: {name: string}) => e.name)).toEqual([OTHER_ITEMS_ROW_LABEL, 'P-file.pdf']);
    const list = r.root.findAll(n => Array.isArray(n.props.rows) && typeof n.props.renderRow === 'function')[0];
    const row = list.props.renderRow(list.props.rows[0]);
    await act(async () => row.props.onPress());
    await settle();
    expect(tabLabels(r)).toEqual(['Browse', 'Resources', 'Threads']);
    expect(listRows(r).map((e: {name: string}) => e.name)).toEqual(['Projects', 'Areas']);
    act(() => r.unmount());
  });
});
