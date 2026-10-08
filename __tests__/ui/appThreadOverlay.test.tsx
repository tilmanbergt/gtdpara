// docs/dev/history/technical-design-tending-threads.md §3.5, §3.7: App with the thread overview open
// over Daily - Back and a tab tap close it, the help replaces it; a nested tag in a row opens it.
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
  PluginManager: {registerButtonListener: () => ({remove: () => undefined}), closePluginView: jest.fn()},
  PluginCommAPI: {},
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
jest.mock('../../src/supernote/fileSystem', () => {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const files: Record<string, string> = {
    '/storage/emulated/0/Note/2 Areas/Coaching/area.txt': [
      '---',
      'kind: area',
      'status: active',
      '---',
      '',
      '## Tasks',
      `- [ ] Draft agenda #retro/alpha [due:: ${today}]`,
      '',
      '## Meetings',
      '- 2026-01-07 10:00-11:00 Retro #retro/alpha',
      '',
    ].join('\n'),
    '/storage/emulated/0/Note/2 Areas/0 Inbox/Inbox.txt': '---\nkind: inbox\n---\n\n## Tasks\n\n## Meetings\n',
  };
  return {
    ...jest.requireActual('../../src/supernote/fileSystem'),
    getCurrentNotePath: async () => null,
    rememberLaunchNotePath: () => undefined,
    setOpenPathObserver: () => undefined,
    getPrivateTempDir: async () => '/tmp/gtdpara',
    deleteTempTree: async () => undefined,
    appendDebugLogFile: async () => undefined,
    writePerfTraceFile: async () => undefined,
    statFiles: async () => null,
    fileExists: async (path: string) => path in files,
    listFolderEntries: async (folder: string) =>
      folder.endsWith('2 Areas') ? [{name: 'Coaching', path: `${folder}/Coaching`, isFolder: true}] : [],
    readTextFile: async (path: string) => {
      if (path in files) return files[path];
      throw new Error(`no file ${path}`);
    },
    writeTextFile: async () => undefined,
  };
});

import React from 'react';
import {Text} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import App from '../../App';
import TaskRow from '../../src/ui/TaskRow';
import {getThreadOverview, openThreadOverview} from '../../src/ui/threadOverlayStore';
import {task} from '../../test-helpers/fixtures';

const AREA = '/storage/emulated/0/Note/2 Areas/Coaching';

const texts = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));
/** Every rendered string, nested spans included. */
const rendered = (r: TestRenderer.ReactTestRenderer) => JSON.stringify(r.toJSON());
/** Presses the nearest element with an onPress around the text `label`. */
const pressText = async (r: TestRenderer.ReactTestRenderer, label: string) => {
  const text = r.root.findAllByType(Text).find(t => [t.props.children].flat().join('') === label);
  expect(text).toBeDefined();
  let node: TestRenderer.ReactTestInstance | null = text!;
  while (node && typeof node.props.onPress !== 'function') node = node.parent;
  expect(node).not.toBeNull();
  await act(async () => node!.props.onPress());
};

async function settle() {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }
}

async function renderApp() {
  let r!: TestRenderer.ReactTestRenderer;
  await act(async () => {
    r = TestRenderer.create(<App />);
  });
  await settle();
  return r;
}

describe('App with the thread overview', () => {
  it('draws the overview over Daily and closes it with Back', async () => {
    const r = await renderApp();
    expect(texts(r)).toContain('Today');
    await act(async () => openThreadOverview({tag: 'retro/alpha', ownerPath: AREA}));
    await settle();
    expect(texts(r)).toContain('‹ Daily');
    expect(texts(r)).toContain('#retro/alpha');
    expect(texts(r)).toContain('in Coaching');
    expect(rendered(r)).toContain('Ahead');
    expect(rendered(r)).toContain('+ Next retro');
    expect(rendered(r)).toContain('Draft agenda');
    expect(texts(r)).toContain('Looking back');

    await pressText(r, '‹ Daily');
    await settle();
    expect(getThreadOverview()).toBeNull();
    expect(texts(r)).not.toContain('Looking back');
    act(() => r.unmount());
  });

  it('closes on a tab tap and when the help opens', async () => {
    const r = await renderApp();
    await act(async () => openThreadOverview({tag: 'retro/alpha', ownerPath: AREA}));
    await settle();
    await pressText(r, 'Week');
    await settle();
    expect(getThreadOverview()).toBeNull();

    await act(async () => openThreadOverview({tag: 'retro/alpha', ownerPath: AREA}));
    await settle();
    await pressText(r, '?');
    await settle();
    expect(getThreadOverview()).toBeNull();
    expect(texts(r)).not.toContain('Looking back');
    act(() => r.unmount());
  });
});

describe('tap routing in a row', () => {
  it('opens the overview from a nested tag and from the #w/f label, with the row as owner', () => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(
        <TaskRow
          task={task('Agenda #retro/alpha #wf/max')}
          isEditing={false}
          onStartEdit={() => undefined}
          onToggleDone={() => undefined}
          onCreateNote={() => undefined}
          onOpenNote={() => undefined}
          linkedFile=""
          ownerPath={AREA}
          context="flat"
          textColor="#000"
          borderColor="#000"
        />,
      );
    });
    const tag = r.root.findAll(n => typeof n.props.onPress === 'function' && n.props.children === '#retro/alpha')[0];
    act(() => tag.props.onPress());
    expect(getThreadOverview()).toEqual({tag: 'retro/alpha', ownerPath: AREA, lens: 'thread'});
    const label = r.root.findAll(n => typeof n.props.onPress === 'function' && n.props.children === '#w/f Max')[0];
    act(() => label.props.onPress());
    expect(getThreadOverview()).toEqual({tag: 'wf/max', ownerPath: AREA, lens: 'thread'});
  });

  it('keeps a plain tag inert without a filter handler', () => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(
        <TaskRow
          task={task('Call #alpha')}
          isEditing={false}
          onStartEdit={() => undefined}
          onToggleDone={() => undefined}
          onCreateNote={() => undefined}
          onOpenNote={() => undefined}
          linkedFile=""
          context="flat"
          textColor="#000"
          borderColor="#000"
        />,
      );
    });
    expect(r.root.findAll(n => typeof n.props.onPress === 'function' && n.props.children === '#alpha')).toHaveLength(0);
  });
});
