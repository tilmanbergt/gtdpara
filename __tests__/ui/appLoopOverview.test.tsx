// docs/dev/history/technical-design-loops.md §4.5, §4.6: App with a loop overview open - its todos
// and meetings, and Edit in Quick Add renaming the loop after a confirm in the status slot.
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
  const rules = jest.requireActual('../../src/domain/tagRules');
  const stored = {
    ...s.DEFAULT_SETTINGS,
    lastSeenVersion: '99.0.0',
    tagRules: [{...rules.createEmptyTagRule('r1', 'loop'), name: 'Workshops', tags: ['workshop']}],
  };
  return {loadSettings: async () => stored, saveSettings: async () => undefined, patchSettings: async () => stored};
});
const mockWritten: Array<[string, string]> = [];
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
      `- [ ] Book room #workshop/offsite #next [due:: ${today}]`,
      '- [ ] Plain leaf #offsite',
      '- [ ] Send minutes [meeting:: 2026-01-07 Kickoff workshop/offsite]',
      '',
      '## Meetings',
      '- 2026-01-07 10:00-11:00 Kickoff #workshop/offsite',
      '',
      '## Loops',
      '- workshop/offsite: active, 2026-11-14',
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
    writeTextFile: async (path: string, text: string) => {
      files[path] = text;
      mockWritten.push([path, text]);
    },
  };
});

import React from 'react';
import {Text, TextInput} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import App from '../../App';
import {loopKindsReady} from '../../src/storage/loopKinds';
import {openOverview} from '../../src/ui/overviewStore';

const AREA = '/storage/emulated/0/Note/2 Areas/Coaching';

const texts = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));
const rendered = (r: TestRenderer.ReactTestRenderer) => JSON.stringify(r.toJSON());
const pressText = async (r: TestRenderer.ReactTestRenderer, label: string) => {
  const text = r.root.findAllByType(Text).find(t => [t.props.children].flat().join('') === label);
  expect(text).toBeDefined();
  let node: TestRenderer.ReactTestInstance | null = text!;
  while (node && typeof node.props.onPress !== 'function') node = node.parent;
  expect(node).not.toBeNull();
  // Not awaited: a save waits for the confirm in the status slot.
  await act(async () => {
    node!.props.onPress();
  });
};

async function settle() {
  for (let i = 0; i < 6; i++) {
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
  await act(async () => {
    await loopKindsReady();
  });
  return r;
}

describe('App with a loop overview', () => {
  it('shows the loop’s todos and meetings, and renames the loop from Edit', async () => {
    const r = await renderApp();
    await act(async () => openOverview({tag: 'workshop/offsite', ownerPath: AREA}));
    await settle();
    expect(texts(r)).toContain('○ offsite');
    expect(texts(r).some(t => t.startsWith('workshop · in Coaching · '))).toBe(true);
    expect(rendered(r)).toContain('Book room');
    expect(rendered(r)).toContain('Send minutes');
    expect(rendered(r)).not.toContain('Plain leaf');
    expect(rendered(r)).toContain('+ Next workshop');
    expect(texts(r)).toEqual(expect.arrayContaining(['Todos', 'Looking back']));

    await pressText(r, 'Edit');
    await settle();
    expect(texts(r)).toContain('Save loop');
    const input = r.root.findAllByType(TextInput).find(t => t.props.value === '#workshop/offsite');
    expect(input).toBeDefined();
    await act(async () => input!.props.onChangeText('#workshop/teamoffsite'));
    await pressText(r, 'Save loop');
    await settle();
    expect(rendered(r)).toContain('Rename loop workshop/offsite to workshop/teamoffsite?');
    await pressText(r, 'Rename');
    await settle();
    const area = mockWritten.filter(([path]) => path.endsWith('Coaching/area.txt')).pop()?.[1] ?? '';
    expect(area).toContain('- workshop/teamoffsite: active, 2026-11-14');
    expect(area).toContain('Book room #workshop/teamoffsite #next');
    expect(area).toContain('Kickoff #workshop/teamoffsite');
    expect(area).toContain('Plain leaf #offsite');
    act(() => r.unmount());
  });
});
