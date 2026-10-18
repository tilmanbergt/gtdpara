// docs/dev/history/technical-design-home-notebooks.md §3.3: Daily's focus rows carry the notebook icon between the
// name and ✕; Review's rows pass none.
import React from 'react';
import {Text} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import FocusedItemRow from '../../src/ui/FocusedItemRow';

function texts(el: React.JSX.Element): string[] {
  let renderer: TestRenderer.ReactTestRenderer | undefined;
  act(() => {
    renderer = TestRenderer.create(el);
  });
  return renderer!.root.findAllByType(Text).map(t => String(t.props.children));
}

describe('FocusedItemRow accessory', () => {
  it('renders the accessory between the name and ✕', () => {
    expect(texts(<FocusedItemRow label="Garden" onRemove={() => undefined} accessory={<Text>icon</Text>} textColor="#000" borderColor="#000" />)).toEqual([
      'Garden',
      'icon',
      '✕',
    ]);
  });

  it('without one, only the name and ✕', () => {
    expect(texts(<FocusedItemRow label="Garden" onRemove={() => undefined} textColor="#000" borderColor="#000" />)).toEqual(['Garden', '✕']);
  });
});
