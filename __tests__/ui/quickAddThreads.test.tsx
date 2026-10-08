// docs/dev/history/technical-design-tending-threads.md §3.4, §3.6: Quick Add's provenance line and "+ Next" seed.
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

import React from 'react';
import {Text, TextInput} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import QuickAddWidget from '../../src/ui/QuickAddWidget';
import {MeetingSeed} from '../../src/ui/quickAdd/useDraftRequests';
import {QuickAddProvenance} from '../../src/ui/quickAdd/ProvenanceLine';
import {StatusProvider} from '../../src/ui/status/StatusProvider';

function render(extra: {provenance?: QuickAddProvenance | null; meetingSeed?: MeetingSeed | null}) {
  const element = (p: typeof extra) => (
    <StatusProvider>
      <QuickAddWidget
        fixedDestination={{type: 'inbox'}}
        onAddTask={async () => undefined}
        onAddMeeting={async () => undefined}
        textColor="#000"
        borderColor="#000"
        placeholderColor="#888"
        {...p}
      />
    </StatusProvider>
  );
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(element(extra));
  });
  return {r, update: (next: typeof extra) => act(() => r.update(element(next)))};
}

const texts = (r: TestRenderer.ReactTestRenderer) =>
  r.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));

describe('Quick Add provenance line', () => {
  it('shows the label on the Todo tab and ✕ clears it', () => {
    const onClear = jest.fn();
    const {r} = render({provenance: {label: '↳ from Retro alpha · Wed 30.9. · adds #retro/alpha', onClear}});
    expect(texts(r)).toContain('↳ from Retro alpha · Wed 30.9. · adds #retro/alpha');
    const clear = r.root.findAll(n => n.props.accessibilityLabel === 'Drop' && typeof n.props.onPress === 'function')[0];
    act(() => clear.props.onPress());
    expect(onClear).toHaveBeenCalled();
  });

  it('shows nothing without provenance', () => {
    const {r} = render({provenance: null});
    expect(texts(r).some(t => t.startsWith('↳'))).toBe(false);
  });
});

describe('Quick Add meeting seed', () => {
  it('fills the meeting draft once per nonce', () => {
    const fields = {title: 'Retro #retro/alpha', date: '2026-10-14', time: '10:00', endTime: '11:30', days: 1};
    const {r, update} = render({meetingSeed: null});
    update({meetingSeed: {fields, nonce: 1}});
    const values = r.root.findAllByType(TextInput).map(i => i.props.value);
    expect(values).toContain('Retro #retro/alpha');
    expect(values).toContain('2026-10-14');
    expect(values).toContain('10:00-11:30');
  });
});
