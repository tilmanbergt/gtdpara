// docs/dev/history/technical-design-projects-findable-notes.md §1.2: an extra tab's `armingRoot` takes the
// tab's slot while an arm is active (the Area page's Projects tab shows the Projects' folders, and Browse
// while refiling), and the slot is the extra tab again when the arm ends.
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
import FileBrowserPane, {FileBrowserExtraTab, FileBrowserRoot, LinkTarget, OTHER_ITEMS_ROW_LABEL} from '../../src/ui/FileBrowserPane';
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
const projectFiles: FileBrowserRoot = {key: 'projectFiles', label: 'Project Files', rootPath: '/n/1 Projects', alternate: browse};
const roots: FileBrowserRoot[] = [
  {key: 'project', label: 'Area Files', rootPath: '/n/2 Areas/A'},
  {key: 'resources', label: 'Resources', rootPath: '/n/3 Resources'},
];
const extraTabs: FileBrowserExtraTab[] = [
  {key: 'threads', label: 'Threads', render: () => <Text>threads content</Text>},
  {key: 'projects', label: 'Projects', render: () => <Text>projects content</Text>, armingRoot: projectFiles},
];

const tabsNode = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAll(n => Array.isArray(n.props.tabs) && typeof n.props.onChange === 'function')[0];
const tabLabels = (r: TestRenderer.ReactTestRenderer) => tabsNode(r).props.tabs.map((t: {label: string}) => t.label);
const activeTab = (r: TestRenderer.ReactTestRenderer) => tabsNode(r).props.activeKey;
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

async function openOnProjects() {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(pane(null));
  });
  await settle();
  expect(tabLabels(r)).toEqual(['Threads', 'Projects', 'Area Files', 'Resources']);
  expect(activeTab(r)).toBe('threads');
  await act(async () => tabsNode(r).props.onChange('projects'));
  await settle();
  expect(texts(r)).toContain('projects content');
  return r;
}

describe('FileBrowserPane: an extra tab with an arming root', () => {
  it('shows the Projects’ folders in the tab’s slot while link-arming, and the tab again afterwards', async () => {
    const r = await openOnProjects();
    const link: LinkTarget = {mode: 'arming', onPick: jest.fn(), onCancel: jest.fn()};
    await act(async () => r.update(pane(link)));
    await settle();
    expect(tabLabels(r)).toEqual(['Threads', 'Project Files', 'Area Files', 'Resources']);
    expect(activeTab(r)).toBe('projectFiles');
    expect(listRows(r).map((e: {name: string}) => e.name)).toEqual([OTHER_ITEMS_ROW_LABEL, '1 Projects-file.pdf']);
    await act(async () => r.update(pane(null)));
    await settle();
    expect(tabLabels(r)).toEqual(['Threads', 'Projects', 'Area Files', 'Resources']);
    expect(activeTab(r)).toBe('projects');
    expect(texts(r)).toContain('projects content');
    act(() => r.unmount());
  });

  it('shows Browse in that slot while refiling, and returns to the tab the arm started on', async () => {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(pane(null));
    });
    await settle();
    const refile: LinkTarget = {mode: 'arming', onPick: jest.fn(), onCancel: jest.fn(), pickKind: 'folder', root: 'browse'};
    await act(async () => r.update(pane(refile)));
    await settle();
    expect(tabLabels(r)).toEqual(['Threads', 'Browse', 'Area Files', 'Resources']);
    expect(activeTab(r)).toBe('projectFiles');
    expect(listRows(r).map((e: {name: string}) => e.name)).toEqual(['Projects', 'Areas']);
    await act(async () => r.update(pane(null)));
    await settle();
    expect(tabLabels(r)).toEqual(['Threads', 'Projects', 'Area Files', 'Resources']);
    expect(activeTab(r)).toBe('threads');
    act(() => r.unmount());
  });

  it('goes to the Projects tab after an arm that started on a root and ended on its arming root', async () => {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(pane(null));
    });
    await settle();
    await act(async () => tabsNode(r).props.onChange('resources'));
    await settle();
    const link: LinkTarget = {mode: 'arming', onPick: jest.fn(), onCancel: jest.fn()};
    await act(async () => r.update(pane(link)));
    await settle();
    expect(activeTab(r)).toBe('resources');
    await act(async () => tabsNode(r).props.onChange('projectFiles'));
    await settle();
    expect(listRows(r).map((e: {name: string}) => e.name)).toEqual([OTHER_ITEMS_ROW_LABEL, '1 Projects-file.pdf']);
    await act(async () => r.update(pane(null)));
    await settle();
    expect(activeTab(r)).toBe('projects');
    act(() => r.unmount());
  });
});
