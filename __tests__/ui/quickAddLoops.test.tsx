// docs/dev/history/technical-design-loops.md §4.1: Quick Add relabels its button for a todo that is a loop itself.
jest.mock('react-native-svg', () => {
  const ReactLib = require('react');
  const stub = (props: object) => ReactLib.createElement('Svg', props);
  return {Svg: stub, Path: stub, Circle: stub, Rect: stub, Line: stub, Polyline: stub, G: stub};
});
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@react-native-clipboard/clipboard', () => ({setString: jest.fn(), getString: jest.fn(async () => '')}));
jest.mock('sn-plugin-lib', () => ({NativePluginManager: {}, PluginManager: {}, PluginCommAPI: {}, PluginFileAPI: {}, PluginNoteAPI: {}}));
jest.mock('../../src/utils/screenRefresh', () => ({requestEinkRefresh: jest.fn(), useEinkRefreshOnLoad: jest.fn()}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
jest.mock('../../src/storage/tagUsage', () => ({
  getRecentTags: () => new Promise(() => undefined),
  getRecentTagsSync: () => [],
  recordTagsUsed: async () => undefined,
}));
jest.mock('../../src/ui/useAbbrevItems', () => ({useAbbrevItems: () => []}));
jest.mock('../../src/ui/useLoopKinds', () => ({useLoopKinds: () => ({kinds: ['workshop'], rules: {}})}));
const mockLoops: Array<{tag: string}> = [];
jest.mock('../../src/storage/dataCache', () => ({
  findCachedItem: (path: string) => (path === '/a' ? {path, loops: mockLoops} : undefined),
}));

import React from 'react';
import {Pressable, Text, TextInput} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import QuickAddWidget from '../../src/ui/QuickAddWidget';
import FlowStateChips from '../../src/ui/FlowStateChips';
import {Destination} from '../../src/domain/destination';
import {StatusProvider} from '../../src/ui/status/StatusProvider';
import {newLoopLine} from '../../src/domain/loopsSection';

function render(destination: Destination, onAddTask = jest.fn(async () => undefined)) {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <StatusProvider>
        <QuickAddWidget
          fixedDestination={destination}
          onAddTask={onAddTask}
          onAddMeeting={async () => undefined}
          textColor="#000"
          borderColor="#000"
          placeholderColor="#888"
        />
      </StatusProvider>,
    );
  });
  return r;
}

const AREA: Destination = {type: 'item', kind: 'area', name: 'Atruvia', path: '/a'};

function type(r: TestRenderer.ReactTestRenderer, text: string) {
  act(() => r.root.findAllByType(TextInput)[0].props.onChangeText(text));
}

const buttonLabels = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAllByType(Pressable).flatMap(p => p.findAllByType(Text).map(t => [t.props.children].flat().join('')));

beforeEach(() => {
  mockLoops.length = 0;
});

describe('Quick Add and loops', () => {
  it('a bare loop tag in an Area adds a loop', () => {
    const onAddTask = jest.fn(async () => undefined);
    const r = render(AREA, onAddTask);
    type(r, '#workshop/teamoffsite #next');
    expect(buttonLabels(r)).toContain('+ Add loop');
    type(r, 'Book room #workshop/teamoffsite');
    expect(buttonLabels(r)).toContain('+ Add');
    expect(buttonLabels(r)).not.toContain('+ Add loop');
  });

  it('stays a todo with someday and in the Inbox', () => {
    const r = render(AREA);
    type(r, '#workshop/idea');
    expect(buttonLabels(r)).toContain('+ Add loop');
    act(() => r.root.findByType(FlowStateChips).props.onChange('someday'));
    expect(buttonLabels(r)).not.toContain('+ Add loop');
    const inbox = render({type: 'inbox'});
    type(inbox, '#workshop/teamoffsite');
    expect(buttonLabels(inbox)).not.toContain('+ Add loop');
  });

  it('disables Add when the loop exists', () => {
    mockLoops.push(newLoopLine('workshop/teamoffsite'));
    const onAddTask = jest.fn(async () => undefined);
    const r = render(AREA, onAddTask);
    type(r, '#workshop/teamoffsite');
    const add = r.root.findAllByType(Pressable).find(p => p.findAllByType(Text).some(t => t.props.children === '+ Add'));
    expect(add?.props.disabled).toBe(true);
  });
});
