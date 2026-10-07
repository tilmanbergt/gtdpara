// docs/dev/history/technical-design-waiting-for-0.7.md §3.3: title and labels render as one text,
// and the #next label's double-tap flips #now.
jest.mock('react-native-svg', () => {
  const ReactLib = require('react');
  const stub = (props: object) => ReactLib.createElement('Svg', props);
  return {Svg: stub, Path: stub, Circle: stub, Rect: stub};
});

import React from 'react';
import {Text} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import TaskRow, {ReadOnlyTaskRow} from '../../src/ui/TaskRow';
import {task} from '../../test-helpers/fixtures';

const noop = () => {};
function renderRow(text: string, onToggleNow?: () => void) {
  let r!: TestRenderer.ReactTestRenderer;
  act(() => {
    r = TestRenderer.create(
      <TaskRow
        task={task(text)}
        isEditing={false}
        onStartEdit={noop}
        onToggleDone={noop}
        onCreateNote={noop}
        onOpenNote={noop}
        linkedFile=""
        onToggleNow={onToggleNow}
        context="flat"
        textColor="#000"
        borderColor="#000"
      />,
    );
  });
  return r;
}

/** The row's title Text: the one whose children include the labels. */
function titleText(r: TestRenderer.ReactTestRenderer): string {
  const texts = r.root.findAllByType(Text).filter(t => t.props.numberOfLines != null);
  const flatten = (n: unknown): string =>
    typeof n === 'string' ? n : Array.isArray(n) ? n.map(flatten).join('') : n && typeof n === 'object' && 'props' in (n as object) ? flatten((n as {props: {children?: unknown}}).props.children) : '';
  return texts.map(t => flatten(t.props.children)).join('|');
}

describe('TaskRow labels', () => {
  it('shows the title with its labels in one text', () => {
    const r = renderRow('Signed NDA #waiting-for:meier');
    expect(titleText(r)).toContain('Signed NDA');
    expect(r.root.findAllByType(Text).some(t => t.props.children === '#w/f Meier')).toBe(true);
    expect(titleText(r)).not.toContain('#waiting-for');
    // The label sits inside the title's Text (same flow, same clamp), not beside it.
    let node = r.root.findAllByType(Text).find(t => t.props.children === '#w/f Meier')!.parent;
    let insideTitle = false;
    while (node) {
      if (node.type === Text && node.props.numberOfLines != null) insideTitle = true;
      node = node.parent;
    }
    expect(insideTitle).toBe(true);
  });

  it('double-tap on #next calls onToggleNow, a single tap does not', () => {
    const toggle = jest.fn();
    const r = renderRow('Draft offer #next', toggle);
    const label = r.root.findAllByType(Text).find(t => t.props.children === '#next')!;
    act(() => label.props.onPress());
    expect(toggle).not.toHaveBeenCalled();
    act(() => label.props.onPress());
    expect(toggle).toHaveBeenCalledTimes(1);
  });

  it('other labels have no own tap handler', () => {
    const r = renderRow('Price sheet #due:2026-01-05', jest.fn());
    const due = r.root.findAllByType(Text).find(t => typeof t.props.children === 'string' && t.props.children.startsWith('#due'))!;
    expect(due.props.onPress).toBeUndefined();
  });

  it('read-only row renders labels too', () => {
    let r!: TestRenderer.ReactTestRenderer;
    act(() => {
      r = TestRenderer.create(<ReadOnlyTaskRow task={task('NDA #waiting-for')} context="flat" textColor="#000" borderColor="#000" />);
    });
    expect(r.root.findAllByType(Text).some(t => t.props.children === '#w/f')).toBe(true);
  });
});
