// Meeting and todo rows: the tap targets span the row's full height - the
// vertical padding sits inside them, not on the row, so a tap above or below
// the text line still selects (one-line meeting rows were mostly dead space).
jest.mock('react-native-svg', () => {
  const ReactLib = require('react');
  const stub = (props: object) => ReactLib.createElement('Svg', props);
  return {Svg: stub, Path: stub, Circle: stub, Rect: stub};
});

import React from 'react';
import {Pressable, StyleSheet, View, ViewStyle} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import MeetingRow, {MeetingRowLayout, ROW_PAD_DP} from '../../src/ui/MeetingRow';
import TaskRow from '../../src/ui/TaskRow';
import {meeting, task} from '../../test-helpers/fixtures';

const noop = () => {};
const flat = (style: unknown): ViewStyle => StyleSheet.flatten(style as ViewStyle) ?? {};

function render(el: React.JSX.Element) {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(el);
  });
  return r;
}

describe('MeetingRow tap targets', () => {
  const rowFor = (layout: MeetingRowLayout) =>
    render(
      <MeetingRow
        meeting={meeting('2026-10-22', 'Team sync', {time: '10:00', endTime: '11:00', linkedFile: 'Resources/a.pdf'})}
        layout={layout}
        time="time"
        note={{onOpen: noop, onCreate: noop}}
        file={{linkedFile: 'Resources/a.pdf', onOpen: noop}}
        onPress={noop}
        textColor="#000"
        borderColor="#000"
      />,
    );

  it.each<MeetingRowLayout>(['oneLine', 'twoLine'])('%s: the row stretches its targets and carries no vertical padding', layout => {
    const r = rowFor(layout);
    const row = flat(r.root.findAllByType(View)[0].props.style);
    expect(row.alignItems).toBe('stretch');
    expect(row.paddingVertical ?? row.paddingTop ?? row.paddingBottom).toBeUndefined();
    const targets = r.root.findAllByType(Pressable);
    // main, note, clip
    expect(targets).toHaveLength(3);
    for (const t of targets) {
      expect(flat(t.props.style).paddingVertical).toBe(ROW_PAD_DP);
      expect(flat(t.props.style).alignSelf ?? 'stretch').toBe('stretch');
    }
  });
});

describe('TaskRow tap targets', () => {
  it('the edit target fills the row height; the row carries no vertical padding', () => {
    const r = render(
      <TaskRow
        task={task('Order soil')}
        isEditing={false}
        onStartEdit={noop}
        onToggleDone={noop}
        onCreateNote={noop}
        onOpenNote={noop}
        linkedFile=""
        context="flat"
        textColor="#000"
        borderColor="#000"
        height={42}
      />,
    );
    const row = flat(r.root.findAllByType(View).find(v => flat(v.props.style).borderBottomWidth === 1)!.props.style);
    expect(row.paddingVertical ?? row.paddingTop ?? row.paddingBottom).toBeUndefined();
    const edit = r.root.findAllByType(Pressable).find(p => p.props.onPress === noop && flat(p.props.style).flex === 1)!;
    expect(flat(edit.props.style).paddingVertical).toBe(ROW_PAD_DP);
    // Its wrapper stretches to the row's height, so the Pressable's flex: 1 fills it.
    expect(flat(edit.parent!.props.style).alignSelf).toBe('stretch');
    for (const p of r.root.findAllByType(Pressable)) expect(flat(p.props.style).paddingVertical).toBe(ROW_PAD_DP);
  });
});
