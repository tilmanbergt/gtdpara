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
const mockNoteOpen: {cancelled: boolean; calls: number} = {cancelled: false, calls: 0};
jest.mock('../../src/storage/meetingNoteContent', () => ({
  ...jest.requireActual('../../src/storage/meetingNoteContent'),
  openOrCreateTodoNote: async (task: unknown) => {
    mockNoteOpen.calls++;
    return {task, changed: false, cancelled: mockNoteOpen.cancelled, outcome: null};
  },
}));
const mockOpenedFiles: string[] = [];
jest.mock('../../src/storage/linkedFiles', () => ({
  ...jest.requireActual('../../src/storage/linkedFiles'),
  openLinkedFile: async (_paths: unknown, linkedFile: string) => {
    mockOpenedFiles.push(linkedFile);
  },
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
  mockNoteOpen.cancelled = false;
  mockNoteOpen.calls = 0;
  mockOpenedFiles.length = 0;
  clearCachedData();
});

describe('EngageOverlay screens', () => {
  it('S4/S5: the note\'s todo is worked on; the other #next under Next; Done shows the ack line, Undo brings it back', async () => {
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
    expect(texts(r)).toEqual(expect.arrayContaining(['Next 1', 'Plan 1']));
    expect(rendered(r)).toContain('Draft agenda');
    expect(rendered(r)).not.toContain('Plan dinner');
    expect(mockSettings.current.engageCurrent).toMatchObject({taskIndex: 0, owner: {kind: 'loop', tag: 'workshop/offsite'}});

    // The Now box's Done is the large check box on the right.
    const done = r.root.findAll(n => n.props.accessibilityLabel === 'Done' && typeof n.props.onPress === 'function');
    expect(done.length).toBeGreaterThan(0); // the Pressable and its host view
    expect(r.root.findAll(n => n.props.label === 'Done')).toHaveLength(0);
    await act(async () => done[0].props.onPress());
    await settle();
    expect(mockFiles[`${COACHING}/area.txt`]).toContain('- [x] Book room');
    // The only #next left moves up as "Next action"; the empty Next tab gives way to Plan.
    expect(texts(r)).toContain('Next action');
    expect(texts(r)).toEqual(expect.arrayContaining(['Next 0', 'Plan 1']));
    expect(rendered(r)).toContain('Plan dinner');
    expect(rendered(r)).toContain('Done:');
    expect(mockSettings.current.engageCurrent).toBeNull();

    await press(r, 'Undo');
    expect(mockFiles[`${COACHING}/area.txt`]).toContain('- [ ] Book room');
    expect(texts(r)).toContain('Working on');
    act(() => r.unmount());
  });

  it('Now box: details, Note › and File: <name> ›; each closes the panel once opened, a cancelled note does not', async () => {
    area('Coaching', [
      '## Tasks',
      '- [ ] Send offer #wf/anna-meier → [[Todos/Send offer.note]] +[[3 Resources/Offer v2.pdf]] [meeting:: 2026-10-07 Retro alpha] [due:: 2026-10-19]',
    ]);
    mockNote.path = `${COACHING}/Todos/Send offer.note`;
    const {r, onClose} = await open({via: 'button'});
    expect(texts(r)).toContain('Working on');
    expect(texts(r).some(t => t.startsWith('Waiting for Anna Meier · follow up ') && t.includes('Agreed in Retro alpha'))).toBe(true);
    expect(texts(r)).toContain('File: Offer v2.pdf ›');

    mockNoteOpen.cancelled = true;
    await press(r, 'Note ›');
    expect(mockNoteOpen.calls).toBe(1);
    expect(onClose).not.toHaveBeenCalled();
    mockNoteOpen.cancelled = false;
    await press(r, 'Note ›');
    expect(onClose).toHaveBeenCalledTimes(1);

    await press(r, 'File: Offer v2.pdf ›');
    expect(mockOpenedFiles).toEqual(['3 Resources/Offer v2.pdf']);
    expect(onClose).toHaveBeenCalledTimes(2);
    act(() => r.unmount());
  });

  it('several #next and nothing chosen: "Pick your next action below"; a tap works on it, offering + Note', async () => {
    area('Coaching', ['## Tasks', '- [ ] Plan dinner #next', '- [ ] Call caterer #next', '- [ ] Book band']);
    const {r} = await open({via: 'ownerPage', owner: {kind: 'item', itemPath: COACHING}});
    expect(texts(r)).toContain('Pick your next action below.');
    expect(texts(r)).toEqual(expect.arrayContaining(['Next 2', 'Plan 1']));
    await press(r, 'Plan dinner');
    expect(texts(r)).toContain('Working on');
    expect(texts(r)).toContain('+ Note');
    expect(texts(r)).toContain('Next 1');
    expect(mockSettings.current.engageCurrent).toMatchObject({taskText: 'Plan dinner #next'});
    act(() => r.unmount());
  });

  it('Remove #next on a Next row sends it to the plan', async () => {
    area('Coaching', ['## Tasks', '- [ ] Plan dinner #next', '- [ ] Call caterer #next', '- [ ] Book band #next']);
    const {r} = await open({via: 'ownerPage', owner: {kind: 'item', itemPath: COACHING}});
    const remove = r.root.findAll(n => n.props.label === 'Remove #next' && typeof n.props.onPress === 'function');
    expect(remove).toHaveLength(3);
    await act(async () => remove[1].props.onPress());
    await settle();
    expect(mockFiles[`${COACHING}/area.txt`]).toContain('- [ ] Call caterer\n');
    expect(texts(r)).toEqual(expect.arrayContaining(['Next 2', 'Plan 1']));
    act(() => r.unmount());
  });

  it('no #next: the Plan tab; "#next" marks a todo without switching or choosing it, Someday parks it', async () => {
    area('Coaching', ['## Tasks', '- [ ] Plan dinner', '- [ ] Call caterer', '- [ ] Book band', '- [ ] Later thing #someday']);
    const {r} = await open({via: 'ownerPage', owner: {kind: 'item', itemPath: COACHING}});
    expect(texts(r)).toEqual(expect.arrayContaining(['Next 0', 'Plan 3']));
    expect(texts(r)).not.toContain('Pick your next action below.');
    expect(rendered(r)).not.toContain('Later thing');

    const make = r.root.findAll(n => n.props.label === '#next' && typeof n.props.onPress === 'function');
    await act(async () => make[1].props.onPress());
    await settle();
    expect(mockFiles[`${COACHING}/area.txt`]).toContain('- [ ] Call caterer #next');
    expect(rendered(r)).toContain('Now #next:');
    // The only #next is shown as "Next action", not chosen; the Plan tab stays.
    expect(texts(r)).toContain('Next action');
    expect(texts(r)).toEqual(expect.arrayContaining(['Next 0', 'Plan 2']));
    expect(mockSettings.current.engageCurrent).toBeNull();

    const someday = r.root.findAll(n => n.props.label === 'Someday' && typeof n.props.onPress === 'function');
    await act(async () => someday[someday.length - 1].props.onPress());
    await settle();
    expect(mockFiles[`${COACHING}/area.txt`]).toContain('- [ ] Book band #someday');

    await press(r, 'Next 0');
    expect(texts(r)).toContain('No other next action.');
    act(() => r.unmount());
  });

  it('Engage follows the note: another project\'s note switches, "Continue with" goes back to the todo worked on', async () => {
    area('Coaching', ['## Tasks', '- [ ] Draft agenda #next', '- [ ] Book room #next']);
    area('Writing', ['## Tasks', '- [ ] Outline #next']);
    mockSettings.current = {
      ...mockSettings.current,
      engageCurrent: {itemPath: COACHING, taskText: 'Book room #next', taskIndex: 1, owner: {kind: 'item', itemPath: COACHING}},
    };
    mockNote.path = `${AREAS}/Writing/Meetings/Ideas.note`;
    const {r} = await open({via: 'button'});
    expect(texts(r)).toContain('Writing');
    expect(texts(r)).toContain('Next action');
    expect(texts(r)).toContain('Continue with Book room');
    await press(r, 'Continue with Book room');
    expect(texts(r)).toContain('Coaching');
    expect(texts(r)).toContain('Working on');
    expect(rendered(r)).toContain('Book room');
    expect(texts(r).some(t => t.startsWith('Continue with'))).toBe(false);
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
    expect(texts(r)).toEqual(expect.arrayContaining(['Next 0', 'Plan 1']));
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
    // Close stays in its place while Quick Add is open.
    expect(r.root.findAll(n => n.props.label === 'Close' && typeof n.props.onPress === 'function')).toHaveLength(1);
    await act(async () => widget[0].props.onAddTask('Ring venue', widget[0].props.fixedDestination));
    await settle();
    expect(mockFiles[`${COACHING}/area.txt`]).toContain('Ring venue');
    expect(quickAdd(r)).toHaveLength(0);
    act(() => r.unmount());
  });
});
