// docs/dev/history/technical-design-meeting-reflection.md §2.6-§2.7: the toolbar in its states,
// and the quieter row (no +clip, no M toggle; the status icon selects).
jest.mock('react-native-svg', () => {
  const ReactLib = require('react');
  const stub = (props: object) => ReactLib.createElement('Svg', props);
  return {Svg: stub, Path: stub, Circle: stub, Rect: stub, Line: stub, Polyline: stub, G: stub};
});

import React from 'react';
import {Pressable, Text} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import {deriveMeetingFields} from '../../src/domain/markdown';
import {emptyToolbarSlots, ToolbarSlot} from '../../src/domain/meetingToolbar';
import {createNoteSetup} from '../../src/domain/noteSetups';
import MeetingRow from '../../src/ui/MeetingRow';
import MeetingToolbar from '../../src/ui/MeetingToolbar';
import {meeting} from '../../test-helpers/fixtures';

const texts = (r: TestRenderer.ReactTestRenderer) => r.root.findAllByType(Text).map(t => [t.props.children].flat().join(''));
const render = (el: React.ReactElement) => {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(el);
  });
  return r;
};
const colors = {textColor: '#000', borderColor: '#000'};

describe('MeetingToolbar', () => {
  const calls: string[] = [];
  const toolbar = (slots: ToolbarSlot[], meetingName: string | null, onLink?: () => void) =>
    render(
      <MeetingToolbar
        slots={slots}
        meetingName={meetingName}
        onCheckpoint={kind => calls.push(`tick ${kind}`)}
        onReflection={() => calls.push('reflect')}
        onLink={onLink}
        {...colors}
      />,
    );

  it('empty: greyed slots and the hint; nothing reacts', () => {
    const r = toolbar(emptyToolbarSlots(true), null, () => calls.push('link'));
    expect(texts(r)).toEqual(['Reflect ›', 'Link file', 'Tap a meeting']);
    expect(r.root.findAllByType(Pressable).every(p => p.props.disabled)).toBe(true);
  });

  it('before / after / with link: the slots act on the meeting', () => {
    calls.length = 0;
    const before = toolbar([{kind: 'checkpoint', tracking: 'prep', done: false, label: 'Prepped'}], 'Sparring');
    expect(texts(before)).toEqual(['☐ Prepped', 'Sparring']);
    act(() => before.root.findAllByType(Pressable)[0].props.onPress());

    const after = toolbar(
      [
        {kind: 'checkpoint', tracking: 'review', done: true, label: 'Reviewed'},
        {kind: 'reflection', label: 'Reflection ›', pending: false},
        {kind: 'link', label: 'Link file'},
      ],
      'Sparring',
      () => calls.push('link'),
    );
    expect(texts(after)).toEqual(['✓ Reviewed', 'Reflection ›', 'Link file', 'Sparring']);
    after.root.findAllByType(Pressable).forEach(p => act(() => p.props.onPress()));
    expect(calls).toEqual(['tick prep', 'tick review', 'reflect', 'link']);
  });
});

describe('MeetingRow, quieter', () => {
  const setups = {setups: [{...createNoteSetup('1', 'thread'), tags: ['sparring'], tracking: {trackPrep: true, trackReview: true}}], defaults: {pages: {}, tracking: {trackPrep: false, trackReview: false}, notebook: null}};
  const title = 'Sparring #sparring #monthly';
  const m = meeting('2026-10-18', title, {time: '10:00', ...deriveMeetingFields(title)});

  for (const layout of ['oneLine', 'twoLine'] as const) {
    it(`${layout}: no +clip and no M toggle; the status icon is inside the row's own tap`, () => {
      const selected: string[] = [];
      const r = render(
        <MeetingRow meeting={m} layout={layout} time="time" highlight="mark" tracking={{setups}} file={{linkedFile: ''}} onPress={() => selected.push('row')} {...colors} />,
      );
      expect(texts(r)).not.toContain('+');
      const pressables = r.root.findAllByType(Pressable);
      expect(pressables).toHaveLength(1);
      act(() => pressables[0].props.onPress());
      expect(selected).toEqual(['row']);
      expect(texts(r).includes('M')).toBe(layout === 'twoLine');
    });
  }
});
