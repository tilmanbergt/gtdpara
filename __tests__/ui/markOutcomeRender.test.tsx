// docs/dev/history/technical-design-lasso-0.8.md §3.6: the small result screen of
// "Mark for later", and index.js registering the Mark button.
const mockButtons: Array<{type: number; id: number; showType: number}> = [];
const mockListeners: Array<{onButtonPress: (e: {id?: number}) => void}> = [];
const mockClosed: number[] = [];

jest.mock('sn-plugin-lib', () => ({
  PluginManager: {
    init: jest.fn(),
    registerButton: (type: number, _apps: string[], opts: {id: number; showType: number}) =>
      mockButtons.push({type, id: opts.id, showType: opts.showType}),
    registerButtonListener: (l: {onButtonPress: (e: {id?: number}) => void}) => {
      mockListeners.push(l);
      return {remove: jest.fn()};
    },
    closePluginView: async () => {
      mockClosed.push(1);
      return true;
    },
    showPluginView: async () => true,
  },
  PluginCommAPI: {},
  PluginFileAPI: {},
  PluginNoteAPI: {},
}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
jest.mock('../../src/utils/screenRefresh', () => ({requestEinkRefresh: jest.fn()}));

import React from 'react';
import {Text} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import MarkOutcomeScreen from '../../src/ui/MarkOutcomeScreen';
import {getMarkOutcome, setMarkOutcome} from '../../src/storage/marks';

function texts(r: TestRenderer.ReactTestRenderer): string[] {
  return r.root.findAllByType(Text).map(t => (typeof t.props.children === 'string' ? t.props.children : ''));
}

describe('MarkOutcomeScreen', () => {
  it('offers "Try icon again" when only the icon is missing', () => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(
        <MarkOutcomeScreen outcome={{kind: 'iconMissing', id: 'm-20261005-104212-351', page: 0, rect: null, detail: '105'}} />,
      );
    });
    expect(texts(r)).toEqual(expect.arrayContaining(['Mark saved, icon missing', 'Try icon again', 'OK']));
  });

  it('OK clears the outcome and closes gtdpara', async () => {
    setMarkOutcome({kind: 'empty'});
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<MarkOutcomeScreen outcome={{kind: 'empty'}} />);
    });
    expect(texts(r)).toContain('Nothing to mark');
    expect(texts(r)).not.toContain('Try icon again');
    const ok = r.root.findAll(n => n.props.onPress && n.findAllByType(Text).some(t => t.props.children === 'OK'))[0];
    await act(async () => ok.props.onPress());
    expect(getMarkOutcome()).toBeNull();
    expect(mockClosed.length).toBe(1);
  });
});

describe('index.js', () => {
  it('registers sidebar, Capture and the Mark button (showType 0) with its own listener', () => {
    jest.isolateModules(() => {
      jest.doMock('../../App', () => () => null);
      require('../../index.js');
    });
    expect(mockButtons).toEqual([
      {type: 1, id: 100, showType: 1},
      {type: 2, id: 200, showType: 1},
      {type: 2, id: 300, showType: 0},
    ]);
    expect(mockListeners).toHaveLength(1);
  });
});
