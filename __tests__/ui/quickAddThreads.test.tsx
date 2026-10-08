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
import {ProvenanceState, useProvenance} from '../../src/ui/quickAdd/useProvenance';
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
    const {r} = render({provenance: {label: '↳ from Retro alpha · Wed 30.9.', onClear}});
    expect(texts(r)).toContain('↳ from Retro alpha · Wed 30.9.');
    const clear = r.root.findAll(n => n.props.accessibilityLabel === 'Drop' && typeof n.props.onPress === 'function')[0];
    act(() => clear.props.onPress());
    expect(onClear).toHaveBeenCalled();
  });

  it('shows nothing without provenance', () => {
    const {r} = render({provenance: null});
    expect(texts(r).some(t => t.startsWith('↳'))).toBe(false);
  });
});

describe('useProvenance (close-out, overview and capture write through it)', () => {
  const mieke = {date: '2026-09-30', title: '1:1 Mieke #101/mieke', tags: ['101/mieke']};
  function probe(): {current: () => ProvenanceState} {
    let state!: ProvenanceState;
    function Probe() {
      state = useProvenance(mieke);
      return null;
    }
    act(() => {
      TestRenderer.create(<Probe />);
    });
    return {current: () => state};
  }

  it('writes only the meeting field and shows no "adds"', () => {
    const p = probe();
    expect(p.current().provenance?.label.startsWith('↳ from 1:1 Mieke · ')).toBe(true);
    expect(p.current().provenance?.label).not.toContain('adds');
    expect(p.current().apply('Raise budget #101/sven')).toBe('Raise budget #101/sven [meeting:: 2026-09-30 1:1 Mieke 101/mieke]');
  });

  it('✕ drops the link for the next todo only', () => {
    const p = probe();
    act(() => p.current().provenance!.onClear());
    expect(p.current().provenance).toBeNull();
    expect(p.current().apply('Raise budget')).toBe('Raise budget');
    act(() => p.current().added());
    expect(p.current().apply('Next one')).toBe('Next one [meeting:: 2026-09-30 1:1 Mieke 101/mieke]');
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
