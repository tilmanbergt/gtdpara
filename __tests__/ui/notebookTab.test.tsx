// docs/dev/history/technical-design-home-notebooks.md §3.4: the Notebook tab - no notebook yet, the years present
// with Open, and a missing current year that reads "+ <year>".
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
let mockContentsOn = true;
jest.mock('../../src/storage/settingsStorage', () => ({
  loadSettings: async () => {
    const s = jest.requireActual('../../src/domain/settings');
    const setups = jest.requireActual('../../src/domain/noteSetups');
    return {
      ...s.DEFAULT_SETTINGS,
      notebookContentsEnabled: mockContentsOn,
      noteSetupDefaults: {...setups.seedNoteSetupDefaults(), notebook: {name: '{name} {year}', folder: ''}},
    };
  },
}));
const mockLoadContents = jest.fn(async (_path: string, _item: unknown) => [
  {page: 0, y: 0, text: 'Lead', detail: '', source: 'home'},
  {page: 3, y: 120, text: 'Handwritten heading', detail: '', source: 'handwritten'},
]);
jest.mock('../../src/storage/notebookContents', () => ({loadContents: (p: string, item: unknown) => mockLoadContents(p, item)}));
jest.mock('../../src/ui/useCachedItems', () => ({useCachedItems: () => mockItems}));
const mockItems = [{path: '/n/2 Areas/Lead', name: 'Lead', tasks: [], meetings: []}];
let mockFiles: string[] = [];
jest.mock('../../src/supernote/fileSystem', () => ({
  listFolderEntries: async (folder: string) => mockFiles.map(name => ({name, path: `${folder}/${name}`, isFolder: false})),
}));

import React from 'react';
import {Text} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import {StatusProvider} from '../../src/ui/status/StatusProvider';
import NotebookTab from '../../src/screens/notebook/NotebookTab';
import {HomeNotebook} from '../../src/storage/homeNotebooks';

const YEAR = new Date().getFullYear();
const FOLDER = '/n/2 Areas/Lead';
const nb = (exists: boolean): HomeNotebook => ({
  itemPath: FOLDER,
  itemAbbrev: '',
  folder: FOLDER,
  fileName: `Lead ${YEAR}`,
  relativeFile: `Lead ${YEAR}.note`,
  absolutePath: `${FOLDER}/Lead ${YEAR}.note`,
  exists,
  known: true,
});
const actions = {tap: jest.fn(), create: jest.fn(), open: jest.fn()};

async function render(notebook: HomeNotebook) {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(
      <StatusProvider>
        <NotebookTab nb={notebook} ownerKind="area" actions={actions} viewportHeight={600} textColor="#000" borderColor="#000" />
      </StatusProvider>,
    );
  });
  await act(async () => undefined);
  await act(async () => undefined);
  return r;
}
const texts = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));
async function tapText(r: TestRenderer.ReactTestRenderer, label: string) {
  let node: TestRenderer.ReactTestInstance | null = r.root.findAllByType(Text).find(t => [t.props.children].flat().join('') === label) ?? null;
  while (node && typeof node.props.onPress !== 'function') node = node.parent;
  await act(async () => node!.props.onPress());
}

beforeEach(() => {
  jest.clearAllMocks();
  mockContentsOn = true;
});

describe('NotebookTab', () => {
  it('no notebook yet: what it will be, and Create notebook', async () => {
    mockFiles = [];
    const r = await render(nb(false));
    expect(texts(r)).toContain(`No home notebook yet. It will be Lead ${YEAR}.note in this Area's folder.`);
    await tapText(r, '+ Create notebook');
    expect(actions.create).toHaveBeenCalledWith(expect.objectContaining({absolutePath: `${FOLDER}/Lead ${YEAR}.note`}));
  });

  it('a chip per year present; the chosen one is what Open opens', async () => {
    mockFiles = [`Lead ${YEAR}.note`, `Lead ${YEAR - 2}.note`, 'Other.note'];
    const r = await render(nb(true));
    expect(texts(r)).toEqual(expect.arrayContaining([`Lead ${YEAR}`, String(YEAR), String(YEAR - 2)]));
    await tapText(r, 'Open');
    expect(actions.open).toHaveBeenLastCalledWith(expect.anything(), `${FOLDER}/Lead ${YEAR}.note`);
    await tapText(r, String(YEAR - 2));
    expect(texts(r)).toContain(`Lead ${YEAR - 2}`);
    await tapText(r, 'Open');
    expect(actions.open).toHaveBeenLastCalledWith(expect.anything(), `${FOLDER}/Lead ${YEAR - 2}.note`);
  });

  it('this year missing, last year there: "doesn\'t exist yet" and a "+ <year>" chip that creates it', async () => {
    mockFiles = [`Lead ${YEAR - 1}.note`];
    const r = await render(nb(false));
    expect(texts(r)).toContain(`Lead ${YEAR} doesn't exist yet.`);
    expect(texts(r)).toEqual(expect.arrayContaining([`+ ${YEAR}`, String(YEAR - 1)]));
    await tapText(r, `+ ${YEAR}`);
    expect(actions.create).toHaveBeenCalledTimes(1);
    await tapText(r, String(YEAR - 1));
    expect(texts(r)).toContain(`Lead ${YEAR - 1}`);
  });
});

describe('NotebookTab Contents (§3.5)', () => {
  it('lists the headings of the shown file; a row opens that page', async () => {
    mockFiles = [`Lead ${YEAR}.note`];
    const r = await render(nb(true));
    expect(mockLoadContents).toHaveBeenCalledWith(`${FOLDER}/Lead ${YEAR}.note`, expect.objectContaining({name: 'Lead'}));
    expect(texts(r)).toEqual(expect.arrayContaining(['Contents', 'p.1', 'Lead', 'p.4', 'Handwritten heading']));
    await tapText(r, 'p.4');
    expect(actions.open).toHaveBeenLastCalledWith(expect.anything(), `${FOLDER}/Lead ${YEAR}.note`, 3);
  });

  it('switched off: name, years and Open only', async () => {
    mockContentsOn = false;
    mockFiles = [`Lead ${YEAR}.note`];
    const r = await render(nb(true));
    expect(mockLoadContents).not.toHaveBeenCalled();
    expect(texts(r)).not.toContain('Contents');
    expect(texts(r)).toContain('Open');
  });
});
