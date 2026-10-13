// docs/dev/history/technical-design-note-setups-finish.md §2: the optional "Files" group of FileBrowserPane -
// one top tab for every root, a second row for the place, and every arm landing on the right place.
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
import {activeTopTab, FILES_GROUP_KEY, groupEntryKey, groupTopTab} from '../../src/ui/fileBrowserGroup';
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

/** A Project page's roots as screens/ItemDetail.tsx builds them; `greyed` = a refile or area-assignment arm. */
const projectRoots = (greyed = false): FileBrowserRoot[] => [
  {key: 'project', label: 'Project Files', shortLabel: 'Project', rootPath: '/n/1 Projects/P', alternate: browse},
  {key: 'area', label: 'Area Files', shortLabel: 'Area', rootPath: '/n/2 Areas/A', disabled: greyed},
  {key: 'resources', label: 'Resources', rootPath: '/n/3 Resources', disabled: greyed},
];
const projectTabs: FileBrowserExtraTab[] = [
  {key: 'threads', label: 'Threads', render: () => <Text>threads content</Text>},
  {key: 'projects', label: 'Loops', render: () => <Text>loops content</Text>},
];

const tabRows = (r: TestRenderer.ReactTestRenderer) => r.root.findAll(n => Array.isArray(n.props.tabs) && typeof n.props.onChange === 'function');
const top = (r: TestRenderer.ReactTestRenderer) => tabRows(r)[0];
const places = (r: TestRenderer.ReactTestRenderer) => tabRows(r)[1];
const labels = (node: TestRenderer.ReactTestInstance | undefined) => node?.props.tabs.map((t: {label: string}) => t.label);
const greyed = (node: TestRenderer.ReactTestInstance) => node.props.tabs.filter((t: {disabled?: boolean}) => t.disabled).map((t: {label: string}) => t.label);
const listRows = (r: TestRenderer.ReactTestRenderer) =>
  (r.root.findAll(n => Array.isArray(n.props.rows) && typeof n.props.renderRow === 'function')[0]?.props.rows ?? []).map((e: {name: string}) => e.name);

async function settle() {
  for (let i = 0; i < 4; i++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }
}

function pane(linkTarget: LinkTarget | null, roots = projectRoots(), extraTabs = projectTabs, resetKey = 'P') {
  return (
    <StatusProvider>
      <FileBrowserPane
        roots={roots}
        linkTarget={linkTarget}
        resetKey={resetKey}
        extraTabs={extraTabs}
        groupLabel="Files"
        viewportHeight={400}
        textColor="#000"
        borderColor="#000"
      />
    </StatusProvider>
  );
}

async function mount(element: React.ReactElement) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(element);
  });
  await settle();
  return r;
}

describe('FileBrowserPane with groupLabel', () => {
  it('shows three top tabs, opens on Threads, and Files opens on the page’s own files', async () => {
    const r = await mount(pane(null));
    expect(labels(top(r))).toEqual(['Threads', 'Loops', 'Files']);
    expect(top(r).props.activeKey).toBe('threads');
    expect(places(r)).toBeUndefined();
    await act(async () => top(r).props.onChange(FILES_GROUP_KEY));
    await settle();
    expect(labels(places(r))).toEqual(['Project', 'Area', 'Resources']);
    expect(places(r).props.activeKey).toBe('project');
    expect(listRows(r)).toEqual(['P-file.pdf']);
    await act(async () => places(r).props.onChange('resources'));
    await settle();
    expect(listRows(r)).toEqual(['3 Resources-file.pdf']);
    // Back to Threads and to Files again: the place last shown.
    await act(async () => top(r).props.onChange('threads'));
    await act(async () => top(r).props.onChange(FILES_GROUP_KEY));
    await settle();
    expect(places(r).props.activeKey).toBe('resources');
    // Another item starts on its own files again.
    await act(async () => r.update(pane(null, projectRoots(), projectTabs, 'Q')));
    await act(async () => top(r).props.onChange(FILES_GROUP_KEY));
    await settle();
    expect(places(r).props.activeKey).toBe('project');
    act(() => r.unmount());
  });

  it('link a file: Files opens on Project with "Other Projects/Areas ›", back to Threads afterwards', async () => {
    const r = await mount(pane(null));
    const link: LinkTarget = {mode: 'arming', onPick: jest.fn(), onCancel: jest.fn()};
    await act(async () => r.update(pane(link)));
    await settle();
    expect(top(r).props.activeKey).toBe(FILES_GROUP_KEY);
    expect(greyed(top(r))).toEqual(['Threads', 'Loops']);
    expect(places(r).props.activeKey).toBe('project');
    expect(listRows(r)).toEqual([OTHER_ITEMS_ROW_LABEL, 'P-file.pdf']);
    await act(async () => r.update(pane(null)));
    await settle();
    expect(top(r).props.activeKey).toBe('threads');
    act(() => r.unmount());
  });

  it('refile and assign Area: Files › Browse, the other places greyed, back to Threads afterwards', async () => {
    const r = await mount(pane(null));
    const refile: LinkTarget = {mode: 'arming', onPick: jest.fn(), onCancel: jest.fn(), pickKind: 'folder', root: 'browse'};
    await act(async () => r.update(pane(refile, projectRoots(true))));
    await settle();
    expect(top(r).props.activeKey).toBe(FILES_GROUP_KEY);
    expect(labels(places(r))).toEqual(['Browse', 'Area', 'Resources']);
    expect(greyed(places(r))).toEqual(['Area', 'Resources']);
    expect(listRows(r)).toEqual(['Projects', 'Areas']);
    await act(async () => r.update(pane(null)));
    await settle();
    expect(top(r).props.activeKey).toBe('threads');

    const assign: LinkTarget = {mode: 'arming', onPick: jest.fn(), onCancel: jest.fn(), pickKind: 'folder', root: 'browse', startAt: 'area'};
    await act(async () => r.update(pane(assign, projectRoots(true))));
    await settle();
    expect(labels(places(r))).toEqual(['Browse', 'Area', 'Resources']);
    expect(greyed(places(r))).toEqual(['Area', 'Resources']);
    expect(listRows(r)).toEqual(['2 Areas-file.pdf']);
    await act(async () => r.update(pane(null)));
    await settle();
    expect(top(r).props.activeKey).toBe('threads');
    act(() => r.unmount());
  });

  it('locating a linked file opens Files on its place', async () => {
    const r = await mount(pane(null));
    const locate: LinkTarget = {mode: 'locating', root: 'resources', folderPath: '', fileName: '3 Resources-file.pdf', fileMissing: false};
    await act(async () => r.update(pane(locate)));
    await settle();
    expect(top(r).props.activeKey).toBe(FILES_GROUP_KEY);
    expect(places(r).props.activeKey).toBe('resources');
    act(() => r.unmount());
  });

  it('an Area page: the Projects tab keeps its arming root on the top row; Files is greyed while refiling', async () => {
    const projectFiles: FileBrowserRoot = {key: 'projectFiles', label: 'Project Files', rootPath: '/n/1 Projects', alternate: browse};
    const areaTabs: FileBrowserExtraTab[] = [
      {key: 'threads', label: 'Threads', render: () => <Text>threads content</Text>},
      {key: 'projects', label: 'Projects', render: () => <Text>projects content</Text>, armingRoot: projectFiles},
    ];
    const areaRoots = (g = false): FileBrowserRoot[] => [
      {key: 'project', label: 'Area Files', shortLabel: 'Area', rootPath: '/n/2 Areas/A', disabled: g},
      {key: 'resources', label: 'Resources', rootPath: '/n/3 Resources', disabled: g},
    ];
    const r = await mount(pane(null, areaRoots(), areaTabs));
    expect(labels(top(r))).toEqual(['Threads', 'Projects', 'Files']);
    await act(async () => top(r).props.onChange('projects'));
    await settle();
    const link: LinkTarget = {mode: 'arming', onPick: jest.fn(), onCancel: jest.fn()};
    await act(async () => r.update(pane(link, areaRoots(), areaTabs)));
    await settle();
    expect(labels(top(r))).toEqual(['Threads', 'Project Files', 'Files']);
    expect(top(r).props.activeKey).toBe('projectFiles');
    expect(places(r)).toBeUndefined();
    await act(async () => r.update(pane(null, areaRoots(), areaTabs)));
    await settle();
    expect(top(r).props.activeKey).toBe('projects');

    const refile: LinkTarget = {mode: 'arming', onPick: jest.fn(), onCancel: jest.fn(), pickKind: 'folder', root: 'browse'};
    await act(async () => r.update(pane(refile, areaRoots(true), areaTabs)));
    await settle();
    expect(labels(top(r))).toEqual(['Threads', 'Browse', 'Files']);
    expect(greyed(top(r))).toEqual(['Threads', 'Files']);
    expect(listRows(r)).toEqual(['Projects', 'Areas']);
    act(() => r.unmount());
  });

  it('without groupLabel every root is a top tab, as before', async () => {
    const r = await mount(
      <StatusProvider>
        <FileBrowserPane roots={projectRoots()} linkTarget={null} extraTabs={projectTabs} viewportHeight={400} textColor="#000" borderColor="#000" />
      </StatusProvider>,
    );
    expect(labels(top(r))).toEqual(['Threads', 'Loops', 'Project Files', 'Area Files', 'Resources']);
    expect(tabRows(r)).toHaveLength(1);
    act(() => r.unmount());
  });
});

describe('fileBrowserGroup', () => {
  const placesOf = [{key: 'project'}, {key: 'area', disabled: true}, {key: 'resources'}];
  it('the top tab: an extra tab, the group for one of its places, else the slot', () => {
    expect(activeTopTab('threads', 'project', placesOf)).toBe('threads');
    expect(activeTopTab(null, 'resources', placesOf)).toBe(FILES_GROUP_KEY);
    expect(activeTopTab(null, 'projectFiles', placesOf)).toBe('projectFiles');
  });
  it('the group tab is greyed only when every place is', () => {
    expect(groupTopTab('Files', placesOf).disabled).toBe(false);
    expect(groupTopTab('Files', [{key: 'a', disabled: true}]).disabled).toBe(true);
  });
  it('tapping the group keeps its place, else the first that can be picked', () => {
    expect(groupEntryKey('resources', placesOf)).toBe('resources');
    expect(groupEntryKey('projectFiles', placesOf)).toBe('project');
    expect(groupEntryKey(undefined, [{key: 'a', disabled: true}, {key: 'b'}])).toBe('b');
  });
});
