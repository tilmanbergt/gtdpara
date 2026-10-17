// docs/dev/history/technical-design-home-notebooks.md §3.1, §3.3: the notebook icon of a Project/Area -
// its state from one statFiles call, open, create after a confirm, the new-year choice, hidden without a Default notebook.
jest.mock('react-native-svg', () => {
  const ReactLib = require('react');
  const stub = (name: string) => (props: object) => ReactLib.createElement(name, props);
  return {Svg: stub('Svg'), Path: stub('Path'), Circle: stub('Circle'), Rect: stub('Rect')};
});
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('sn-plugin-lib', () => ({PluginCommAPI: {}, PluginFileAPI: {}}));
jest.mock('../../src/utils/screenRefresh', () => ({requestEinkRefresh: jest.fn(), useEinkRefreshOnLoad: jest.fn()}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));

let mockNotebook: {name: string; folder: string} | null = {name: '{name} {year}', folder: ''};
jest.mock('../../src/storage/settingsStorage', () => ({
  loadSettings: async () => {
    const s = jest.requireActual('../../src/domain/settings');
    const setups = jest.requireActual('../../src/domain/noteSetups');
    return {...s.DEFAULT_SETTINGS, noteSetupDefaults: {...setups.seedNoteSetupDefaults(), notebook: mockNotebook}};
  },
}));

let mockFiles = new Set<string>();
const mockOpenPath = jest.fn(async (_path: string, _page?: number) => undefined);
const mockEnsureShared = jest.fn(async (folder: string, fileName: string) => {
  mockFiles.add(`${folder}/${fileName}.note`);
  return `${folder}/${fileName}.note`;
});
const mockStatFiles = jest.fn(async (paths: string[]) => paths.map(path => ({path, exists: mockFiles.has(path), lastModified: 0, size: 0})));
jest.mock('../../src/supernote/fileSystem', () => ({
  displayPath: (p: string) => p.replace(/^\/storage\/emulated\/0\//, ''),
  statFiles: (paths: string[]) => mockStatFiles(paths),
  fileExists: async (p: string) => mockFiles.has(p),
  openPath: (p: string, page?: number) => mockOpenPath(p, page),
  subscribeFolderChanges: () => () => undefined,
  listFolderEntries: async (folder: string) =>
    [...mockFiles].filter(f => f.startsWith(`${folder}/`) && !f.slice(folder.length + 1).includes('/')).map(f => ({name: f.slice(folder.length + 1), path: f, isFolder: false})),
}));
jest.mock('../../src/storage/sharedNotePages', () => ({ensureSharedNoteFile: (folder: string, fileName: string) => mockEnsureShared(folder, fileName)}));
jest.mock('../../src/storage/dataCache', () => ({findCachedItem: () => undefined, subscribeCache: () => () => undefined}));

import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {HomeNotebook} from '../../src/storage/homeNotebooks';
import HomeNotebookButton from '../../src/ui/HomeNotebookButton';
import {StatusEntry, StatusProvider, useStatusList} from '../../src/ui/status/StatusProvider';
import {useHomeNotebooks} from '../../src/ui/useHomeNotebooks';
import {useHomeNotebookTap} from '../../src/ui/useHomeNotebookTap';

const YEAR = new Date().getFullYear();
const P = '/storage/emulated/0/Note/1 Projects';
const items = [
  {path: `${P}/Garden`, name: 'Garden', abbrev: null},
  {path: `${P}/Boat`, name: 'Boat', abbrev: null},
];
const garden = `${P}/Garden/Garden ${YEAR}.note`;
const boat = `${P}/Boat/Boat ${YEAR}.note`;

let list: StatusEntry[] = [];
let notebooks: Array<HomeNotebook | null> = [];
let tap: (nb: HomeNotebook) => void = () => undefined;

function Probe(): React.JSX.Element {
  const homes = useHomeNotebooks(items);
  tap = useHomeNotebookTap('Test');
  list = useStatusList();
  notebooks = items.map(item => homes.of(item));
  return (
    <>
      {notebooks.map((nb, i) => (
        <HomeNotebookButton key={i} nb={nb} onPress={tap} variant="icon" textColor="#000" borderColor="#000" />
      ))}
    </>
  );
}

async function mount(): Promise<TestRenderer.ReactTestRenderer> {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  await act(async () => {
    renderer = TestRenderer.create(
      <StatusProvider>
        <Probe />
      </StatusProvider>,
    );
  });
  await act(async () => undefined);
  return renderer!;
}

const flush = () => act(async () => undefined);

beforeEach(() => {
  mockNotebook = {name: '{name} {year}', folder: ''};
  mockFiles = new Set([garden]);
  mockOpenPath.mockClear();
  mockEnsureShared.mockClear();
  mockStatFiles.mockClear();
});

describe('home notebook icons', () => {
  it('reads both states with one statFiles call: plain when it exists, + when it does not', async () => {
    const renderer = await mount();
    expect(mockStatFiles).toHaveBeenCalledWith([garden, boat]);
    expect(notebooks.map(nb => [nb?.fileName, nb?.exists, nb?.known])).toEqual([
      [`Garden ${YEAR}`, true, true],
      [`Boat ${YEAR}`, false, true],
    ]);
    expect(renderer.root.findAllByType('Svg' as never).length).toBe(2);
    expect(renderer.root.findAllByType('Circle' as never).length).toBe(1);
  });

  it('opens an existing notebook on the last viewed page', async () => {
    await mount();
    await act(async () => tap(notebooks[0]!));
    await flush();
    expect(mockOpenPath).toHaveBeenCalledWith(garden, -1);
  });

  it('creates a missing one after the confirm, opens it on page 1 and names it', async () => {
    await mount();
    await act(async () => tap(notebooks[1]!));
    await flush();
    expect(list[0].msg).toMatchObject({kind: 'confirm', text: `new file Boat ${YEAR}.note`});
    await act(async () => list[0].msg.actions![0].onPress());
    await flush();
    expect(mockEnsureShared).toHaveBeenCalledWith(`${P}/Boat`, `Boat ${YEAR}`);
    expect(mockOpenPath).toHaveBeenCalledWith(boat, 0);
    expect(list.map(e => e.msg.text)).toContain(`Created Boat ${YEAR}.note in Note/1 Projects/Boat.`);
  });

  it('✕ on the confirm creates nothing', async () => {
    await mount();
    await act(async () => tap(notebooks[1]!));
    await flush();
    await act(async () => list[0].msg.onCancel!());
    await flush();
    expect(mockEnsureShared).not.toHaveBeenCalled();
    expect(mockOpenPath).not.toHaveBeenCalled();
  });

  it('this year missing, last year there: Create <year> · Open <last year>', async () => {
    mockFiles.add(`${P}/Boat/Boat ${YEAR - 1}.note`);
    await mount();
    await act(async () => tap(notebooks[1]!));
    await flush();
    expect(list[0].msg.text).toBe(`No Boat ${YEAR} yet.`);
    expect(list[0].msg.actions!.map(a => a.label)).toEqual([`Create ${YEAR}`, `Open ${YEAR - 1}`]);
    await act(async () => list[0].msg.actions![1].onPress());
    await flush();
    expect(mockOpenPath).toHaveBeenCalledWith(`${P}/Boat/Boat ${YEAR - 1}.note`, -1);
    expect(mockEnsureShared).not.toHaveBeenCalled();
  });

  it('no icon when the Default has no notebook', async () => {
    mockNotebook = null;
    const renderer = await mount();
    expect(notebooks).toEqual([null, null]);
    expect(renderer.root.findAllByType('Svg' as never)).toHaveLength(0);
    expect(mockStatFiles).not.toHaveBeenCalled();
  });
});
