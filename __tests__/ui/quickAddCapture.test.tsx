// docs/dev/technical-design-lasso-0.8.md §3.9: QuickAddWidget variant="capture".
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
  getRecentTagsSync: () => ['tom', 'call'],
  recordTagsUsed: async () => undefined,
}));
jest.mock('../../src/ui/useAbbrevItems', () => ({
  useAbbrevItems: () => [
    {kind: 'project', name: 'Team offsite', path: '/Note/1 Projects/Team offsite', abbrev: 'TO', status: 'active'},
  ],
}));

import React from 'react';
import {Text, TextInput} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import QuickAddWidget, {CaptureSeed} from '../../src/ui/QuickAddWidget';
import {StatusProvider} from '../../src/ui/status/StatusProvider';
import {Destination} from '../../src/domain/destination';

const inbox: Destination = {type: 'inbox'};

function setup(seed: CaptureSeed, destination: Destination = inbox) {
  const added: Array<{text: string; dest: Destination}> = [];
  const saved: string[] = [];
  const destChanges: Destination[] = [];
  const props = {
    variant: 'capture' as const,
    fixedDestination: destination,
    captureSeed: seed,
    onAddTask: async (text: string, dest: Destination) => {
      added.push({text, dest});
    },
    onAddMeeting: async () => undefined,
    onCaptureSaved: (mode: string) => saved.push(mode),
    onCaptureDestinationChange: (d: Destination) => destChanges.push(d),
    textColor: '#000',
    borderColor: '#000',
    placeholderColor: '#888',
  };
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <StatusProvider>
        <QuickAddWidget {...props} />
      </StatusProvider>,
    );
  });
  const rerender = (nextSeed: CaptureSeed) =>
    act(() => {
      r.update(
        <StatusProvider>
          <QuickAddWidget {...props} captureSeed={nextSeed} />
        </StatusProvider>,
      );
    });
  return {r, added, saved, destChanges, rerender};
}

const allText = (r: TestRenderer.ReactTestRenderer): string[] =>
  r.root.findAllByType(Text).map(t => {
    const c = t.props.children;
    return Array.isArray(c) ? c.join('') : typeof c === 'string' ? c : '';
  });

function press(r: TestRenderer.ReactTestRenderer, label: string) {
  const target = r.root.findAll(
    n => typeof n.props.onPress === 'function' && n.findAllByType(Text).some(t => allText({root: t} as never).length >= 0 && [t.props.children].flat().join('') === label),
  )[0];
  if (!target) {throw new Error(`no button "${label}" in ${allText(r).join(' | ')}`);}
  return act(async () => {
    await target.props.onPress();
  });
}

const visibleInputs = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(TextInput).map(i => i.props.value as string);

describe('QuickAddWidget capture', () => {
  it('shows split items as rows and saves each with the same chips', async () => {
    const {r, added, saved} = setup({key: 'lasso-1', items: ['book room', 'agenda to Tom', 'slides'], split: true});
    expect(visibleInputs(r)).toEqual(expect.arrayContaining(['book room', 'agenda to Tom', 'slides']));
    await press(r, 'Next');
    await press(r, 'Save 3 & close');
    expect(added.map(a => a.text)).toEqual(['book room #next', 'agenda to Tom #next', 'slides #next']);
    expect(added.every(a => a.dest.type === 'inbox')).toBe(true);
    expect(saved).toEqual(['close']);
  });

  it('removes a row with ✕ and joins the rows when Split lines is turned off', async () => {
    const {r, added} = setup({key: 'lasso-2', items: ['a', 'b', 'c'], split: true});
    await act(async () => {
      r.root.findAll(n => n.props.accessibilityLabel === 'Remove item 2')[0].props.onPress();
    });
    await press(r, '☑ Split lines');
    expect(visibleInputs(r)).toContain('a c');
    await press(r, 'Save & next');
    expect(added.map(a => a.text)).toEqual(['a c']);
  });

  it('fills recognized text for the same key only while the user has not typed', () => {
    const {r, rerender} = setup({key: 'm-1', items: [''], split: false});
    rerender({key: 'm-1', items: ['Room for offsite?'], split: false});
    expect(visibleInputs(r)).toContain('Room for offsite?');
    act(() => {
      r.root.findAllByType(TextInput)[0].props.onChangeText('My own text');
    });
    rerender({key: 'm-1', items: ['Late recognition'], split: false});
    expect(visibleInputs(r)).toContain('My own text');
    rerender({key: 'm-2', items: ['Next mark'], split: false});
    expect(visibleInputs(r)).toContain('Next mark');
  });

  it('offers File to chips and reports the choice; a typed #ABBR wins', async () => {
    const {r, added, destChanges} = setup({key: 'x', items: ['order soil'], split: false});
    await press(r, '#TO Team offsite');
    expect(destChanges).toEqual([{type: 'item', kind: 'project', name: 'Team offsite', path: '/Note/1 Projects/Team offsite'}]);
    act(() => {
      r.root.findAllByType(TextInput)[0].props.onChangeText('order soil #TO');
    });
    await press(r, 'Save & view');
    expect(added[0]).toEqual({text: 'order soil', dest: {type: 'item', kind: 'project', name: 'Team offsite', path: '/Note/1 Projects/Team offsite'}});
  });

  it('refuses to save an empty todo', async () => {
    const {r, added, saved} = setup({key: 'e', items: [''], split: false});
    await press(r, 'Save & close');
    expect(added).toEqual([]);
    expect(saved).toEqual([]);
  });
});
