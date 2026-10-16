// docs/dev/history/technical-design-engage.md §3.7, §6: the Engage panel renders every screen kind
// over a real cache built from fixture files, and its actions write through the one write path.
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
  PluginManager: {closePluginView: jest.fn()},
  PluginCommAPI: {getCurrentPageNum: async () => ({success: true, result: 0})},
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
const mockSettings: {current: Record<string, unknown>} = {current: {}};
jest.mock('../../src/storage/settingsStorage', () => ({
  loadSettings: async () => mockSettings.current,
  saveSettings: async () => undefined,
  patchSettings: async (patch: object) => (mockSettings.current = {...mockSettings.current, ...patch}),
}));
const AREAS = '/storage/emulated/0/Note/2 Areas';
const mockFiles: Record<string, string> = {};
const mockNote: {path: string | null} = {path: null};
jest.mock('../../src/supernote/fileSystem', () => ({
  ...jest.requireActual('../../src/supernote/fileSystem'),
  getCurrentNotePath: async () => mockNote.path,
  statFiles: async () => null,
  fileExists: async (path: string) => path in mockFiles,
  listFolderEntries: async (folder: string) =>
    folder.endsWith('2 Areas')
      ? Object.keys(mockFiles)
          .filter(p => p.endsWith('/area.txt'))
          .map(p => {
            const name = p.split('/').slice(-2)[0];
            return {name, path: `${folder}/${name}`, isFolder: true};
          })
      : [],
  readTextFile: async (path: string) => {
    if (path in mockFiles) return mockFiles[path];
    throw new Error(`no file ${path}`);
  },
  writeTextFile: async (path: string, content: string) => {
    mockFiles[path] = content;
  },
}));

import React from 'react';
import {Text} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import {DEFAULT_SETTINGS} from '../../src/domain/settings';
import {createNoteSetup} from '../../src/domain/noteSetups';
import EngageOverlay from '../../src/screens/engage/EngageOverlay';
import {EngageRequest} from '../../src/domain/engageFlow';
import {clearCachedData} from '../../src/storage/dataCache';
import {StatusProvider} from '../../src/ui/status/StatusProvider';

function area(name: string, lines: string[], extra: string[] = []): void {
  mockFiles[`${AREAS}/${name}/area.txt`] = ['---', 'kind: area', 'status: active', ...extra, '---', '', ...lines, ''].join('\n');
}
const COACHING = `${AREAS}/Coaching`;

const texts = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));
const rendered = (r: TestRenderer.ReactTestRenderer) => JSON.stringify(r.toJSON());
/** The expanded QuickAddWidget, found by its props (its export is wrapped). */
const quickAdd = (r: TestRenderer.ReactTestRenderer) => r.root.findAll(n => n.props.fixedDestination && typeof n.props.onAddTask === 'function' && n.props.layoutKey === 'engage');
async function settle() {
  for (let i = 0; i < 8; i++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }
}
const textOf = (n: TestRenderer.ReactTestInstance): string => n.children.map(c => (typeof c === 'string' ? c : textOf(c))).join('');
/** Presses a PillButton by its label, or the nearest element with an onPress around a text that contains `label`. */
async function press(r: TestRenderer.ReactTestRenderer, label: string) {
  const pill = r.root.findAll(n => n.props.label === label && typeof n.props.onPress === 'function')[0];
  let node: TestRenderer.ReactTestInstance | null = pill ?? r.root.findAllByType(Text).find(t => textOf(t).includes(label)) ?? null;
  expect(node).not.toBeNull();
  while (node && typeof node.props.onPress !== 'function') node = node.parent;
  expect(node).not.toBeNull();
  await act(async () => node!.props.onPress());
  await settle();
}
async function open(request: EngageRequest) {
  let r!: TestRenderer.ReactTestRenderer;
  const onClose = jest.fn();
  await act(async () => {
    r = TestRenderer.create(
      <StatusProvider>
        <EngageOverlay request={request} onClose={onClose} onOpenGtdpara={jest.fn()} />
      </StatusProvider>,
    );
  });
  await settle();
  return {r, onClose};
}

beforeEach(() => {
  for (const key of Object.keys(mockFiles)) delete mockFiles[key];
  mockFiles[`${AREAS}/0 Inbox/Inbox.txt`] = '---\nkind: inbox\n---\n\n## Tasks\n\n## Meetings\n';
  mockSettings.current = {
    ...DEFAULT_SETTINGS,
    lastSeenVersion: '99.0.0',
    noteSetups: [{...createNoteSetup('r1', 'loop'), name: 'Workshops', tags: ['workshop']}],
  };
  mockNote.path = null;
  clearCachedData();
});

describe('EngageOverlay screens', () => {
  it('S4/S5: the note\'s todo in the Now box; Done shows the ack line, Undo brings it back', async () => {
    area('Coaching', [
      '## Tasks',
      '- [ ] Book room #workshop/offsite #next → [[Todos/Book room.note]]',
      '- [ ] Draft agenda #workshop/offsite #next',
      '- [ ] Plan dinner #workshop/offsite',
      '',
      '## Loops',
      '- workshop/offsite: active',
    ]);
    mockNote.path = `${COACHING}/Todos/Book room.note`;
    const {r} = await open({via: 'button'});
    expect(texts(r)).toContain('Loop');
    expect(texts(r)).toContain('Working on');
    expect(rendered(r)).toContain('Book room');
    expect(texts(r)).toContain('Engage next');
    expect(rendered(r)).toContain('Draft agenda');
    expect(rendered(r)).not.toContain('Plan dinner');
    expect(mockSettings.current.engageCurrent).toMatchObject({taskIndex: 0, owner: {kind: 'loop', tag: 'workshop/offsite'}});

    await press(r, 'Done');
    expect(mockFiles[`${COACHING}/area.txt`]).toContain('- [x] Book room');
    expect(texts(r)).not.toContain('Working on');
    expect(rendered(r)).toContain('Done:');
    expect(mockSettings.current.engageCurrent).toBeNull();

    await press(r, 'Undo');
    expect(mockFiles[`${COACHING}/area.txt`]).toContain('- [ ] Book room');
    expect(texts(r)).toContain('Working on');
    act(() => r.unmount());
  });

  it('S4: the Now box holds the only #next → no plan offered under it', async () => {
    area('Coaching', ['## Tasks', '- [ ] Book room #next → [[Todos/Book room.note]]', '- [ ] Plan dinner']);
    mockNote.path = `${COACHING}/Todos/Book room.note`;
    const {r} = await open({via: 'button'});
    expect(texts(r)).toContain('Working on');
    expect(texts(r)).not.toContain('No next action left. Pick one from the plan:');
    expect(rendered(r)).not.toContain('Plan dinner');
    act(() => r.unmount());
  });

  it('S6: no #next left → the plan with Someday; a pick adds #next and makes it current', async () => {
    area('Coaching', ['## Tasks', '- [ ] Plan dinner', '- [ ] Call caterer', '- [ ] Later thing #someday']);
    const {r} = await open({via: 'ownerPage', owner: {kind: 'item', itemPath: COACHING}});
    expect(texts(r)).toContain('Area');
    expect(texts(r)).toContain('No next action left. Pick one from the plan:');
    expect(rendered(r)).not.toContain('Later thing');
    expect(r.root.findAll(n => n.props.label === 'Someday' && typeof n.props.onPress === 'function')).toHaveLength(2);

    await press(r, 'Call caterer');
    expect(mockFiles[`${COACHING}/area.txt`]).toContain('- [ ] Call caterer #next');
    expect(texts(r)).toContain('Working on');
    expect(mockSettings.current.engageCurrent).toMatchObject({taskText: 'Call caterer #next'});
    act(() => r.unmount());
  });

  it('S8: an empty owner → "Nothing left", Select next focus and Close as main action', async () => {
    area('Coaching', ['## Tasks', '- [x] Old one']);
    const {r} = await open({via: 'ownerPage', owner: {kind: 'item', itemPath: COACHING}});
    expect(texts(r)).toContain('Nothing left in Coaching.');
    expect(texts(r)).toContain('+ Add todo');
    expect(texts(r)).toContain('Select next focus ›');
    const close = r.root.findAll(n => n.props.label === 'Close' && typeof n.props.onPress === 'function')[0];
    expect(close.props.primary).toBe(true);
    act(() => r.unmount());
  });

  it('S9: no owner from the note → today\'s focus as owner lines; a tap makes it the owner', async () => {
    area('Coaching', ['## Tasks', '- [ ] Draft agenda #next'], ['dailyFocus: true']);
    area('Writing', ['## Tasks', '- [ ] Outline'], ['dailyFocus: true']);
    mockNote.path = '/storage/emulated/0/Note/Elsewhere.note';
    const {r} = await open({via: 'button'});
    expect(texts(r)).toContain("Today's focus");
    expect(texts(r)).toEqual(expect.arrayContaining(['Area · Coaching · 1 next ›', 'Area · Writing · pick next ›']));
    await press(r, 'Area · Writing · pick next ›');
    expect(texts(r)).toContain('No next action left. Pick one from the plan:');
    act(() => r.unmount());
  });

  it('S10: nothing left in today\'s focus → the celebration and Select new focus', async () => {
    area('Coaching', ['## Tasks', '- [x] Done one'], ['dailyFocus: true']);
    const {r} = await open({via: 'button'});
    expect(texts(r)).toContain("✓  All done in today's focus.");
    expect(texts(r)).toContain('Coaching');
    await press(r, 'Select new focus ›');
    expect(texts(r)).toContain("This week's focus");
    expect(texts(r)).toContain("Anything beyond this week's focus: Open gtdpara.");
    act(() => r.unmount());
  });

  it('S7: Quick Add expands with the owner as destination and folds again', async () => {
    area('Coaching', ['## Tasks', '- [ ] Draft agenda #next']);
    const {r} = await open({via: 'ownerPage', owner: {kind: 'item', itemPath: COACHING}});
    expect(quickAdd(r)).toHaveLength(0);
    await press(r, '+ Quick Add');
    const widget = quickAdd(r);
    expect(widget).toHaveLength(1);
    expect(widget[0].props.fixedDestination).toMatchObject({type: 'item', kind: 'area', path: COACHING});
    await act(async () => widget[0].props.onAddTask('Ring venue', widget[0].props.fixedDestination));
    await settle();
    expect(mockFiles[`${COACHING}/area.txt`]).toContain('Ring venue');
    expect(quickAdd(r)).toHaveLength(0);
    act(() => r.unmount());
  });
});
