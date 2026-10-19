// docs/dev/history/technical-design-engage.md §3.8: the Engage sidebar button opens the
// panel (mode 'engage'), a landing still in flight doesn't replace it, Close hides the
// plugin view and the gtdpara button goes back to the tabs.
jest.mock('react-native-svg', () => {
  const ReactLib = require('react');
  const stub = (props: object) => ReactLib.createElement('Svg', props);
  return {Svg: stub, Path: stub, Circle: stub, Rect: stub, Line: stub, Polyline: stub, G: stub};
});
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@react-native-clipboard/clipboard', () => ({setString: jest.fn(), getString: jest.fn(async () => '')}));
const mockButtons: {press?: (event: {id: number}) => void} = {};
const mockClosePluginView = jest.fn();
jest.mock('sn-plugin-lib', () => ({
  NativePluginManager: {},
  PluginManager: {
    registerButtonListener: (listener: {onButtonPress: (event: {id: number}) => void}) => {
      mockButtons.press = listener.onButtonPress;
      return {remove: () => undefined};
    },
    closePluginView: () => mockClosePluginView(),
  },
  PluginCommAPI: {getCurrentPageNum: async () => ({success: true, result: 2})},
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
jest.mock('../../src/storage/settingsStorage', () => {
  const s = jest.requireActual('../../src/domain/settings');
  const stored = {...s.DEFAULT_SETTINGS, lastSeenVersion: '99.0.0'};
  return {loadSettings: async () => stored, saveSettings: async () => undefined, patchSettings: async () => stored};
});
jest.mock('../../src/supernote/fileSystem', () => ({
  ...jest.requireActual('../../src/supernote/fileSystem'),
  getCurrentNotePath: async () => '/storage/emulated/0/Note/Sparring.note',
  rememberLaunchNotePath: () => undefined,
  setOpenPathObserver: () => undefined,
  getPrivateTempDir: async () => '/tmp/gtdpara',
  deleteTempTree: async () => undefined,
  appendDebugLogFile: async () => undefined,
  writePerfTraceFile: async () => undefined,
  statFiles: async () => null,
  fileExists: async () => false,
  listFolderEntries: async () => [],
  readTextFile: async (path: string) => {
    throw new Error(`no file ${path}`);
  },
  writeTextFile: async () => undefined,
}));

import React from 'react';
import {Text} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import App from '../../App';
import {ENGAGE_BUTTON_ID, SIDEBAR_BUTTON_ID} from '../../src/domain/buttonIds';
import {engageOwner} from '../../src/ui/engageStore';
import {log} from '../../src/utils/log';
import {closeOverview, getOverview} from '../../src/ui/overviewStore';

const texts = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));

async function settle() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }
}

describe('App with the Engage button', () => {
  it('opens the panel even when pressed before the landing finishes, closes it, and returns to the tabs', async () => {
    let r!: TestRenderer.ReactTestRenderer;
    // Synchronous acts: the listener is registered, reorient() is still awaiting
    // when the replayed cold-start press arrives.
    act(() => {
      r = TestRenderer.create(<App />);
    });
    act(() => mockButtons.press!({id: ENGAGE_BUTTON_ID}));
    await settle();
    expect(texts(r)).toContain('Engage next');
    // A note outside every Project/Area and no focus: the week's (empty) focus list.
    expect(texts(r)).toContain("This week's focus");
    expect(texts(r)).not.toContain('Daily');
    expect(log).toHaveBeenCalledWith('EngageOverlay: opened', 'owner=none', 'via=button', 'current=no', 'back=no', 'pageMeeting=no');

    const close = r.root.findAll(n => n.props.label === 'Close' && typeof n.props.onPress === 'function')[0];
    await act(async () => close.props.onPress());
    expect(mockClosePluginView).toHaveBeenCalledTimes(1);

    // The gtdpara button leaves the hidden panel at once, before reorient() finishes.
    act(() => mockButtons.press!({id: SIDEBAR_BUTTON_ID}));
    expect(texts(r)).not.toContain('Engage next');
    await settle();
    expect(texts(r)).toContain('Daily'); // the TabBar: back in the tab shell
    act(() => r.unmount());
  });

  it('opens for an owner through the store ("Engage ›") and Open gtdpara goes to the tabs', async () => {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<App />);
    });
    await settle();
    expect(texts(r)).toContain('Daily');
    await act(async () => engageOwner({kind: 'item', itemPath: '/storage/emulated/0/Note/1 Projects/Website'}));
    await settle();
    expect(texts(r)).toContain('Open gtdpara');
    expect(texts(r)).not.toContain('Daily');
    expect(log).toHaveBeenCalledWith('EngageOverlay: opened', 'owner=item', 'via=ownerPage', 'current=no', 'back=no', 'pageMeeting=no');
    const open = r.root.findAll(n => n.props.label === 'Open gtdpara' && typeof n.props.onPress === 'function')[0];
    await act(async () => open.props.onPress());
    await settle();
    expect(texts(r)).toContain('Daily');
    act(() => r.unmount());
  });

  it('leaving to an overview opens it once the tab shell shows (docs/dev/history/technical-design-engage-in-context.md §2.9)', async () => {
    let r!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      r = TestRenderer.create(<App />);
    });
    await settle();
    await act(async () => engageOwner({kind: 'item', itemPath: '/storage/emulated/0/Note/1 Projects/Website'}));
    await settle();
    const panel = r.root.findAll(n => typeof n.props.onExit === 'function' && n.props.request)[0];
    const owner = {kind: 'thread' as const, scopeOwnerPath: '/storage/emulated/0/Note/2 Areas/Coaching', tag: 'retro/alpha'};
    await act(async () => panel.props.onExit({kind: 'overview', owner}));
    await settle();
    expect(texts(r)).toContain('Daily');
    expect(getOverview()).toEqual({tag: 'retro/alpha', ownerPath: owner.scopeOwnerPath, lens: 'thread'});
    act(() => closeOverview());
    act(() => r.unmount());
  });
});
