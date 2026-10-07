// docs/dev/history/technical-design-split-by-tag.md §3.6: placeholder chips insert at the cursor.

jest.mock('@react-native-clipboard/clipboard', () => ({
  __esModule: true,
  default: {getString: jest.fn(async () => ''), setString: jest.fn()},
}));

import React, {useState} from 'react';
import {TextInput} from 'react-native';
import TestRenderer, {act} from 'react-test-renderer';
import ClipboardTextInput, {ClipboardTextInputHandle} from '../../src/ui/ClipboardTextInput';

let handle: React.RefObject<ClipboardTextInputHandle | null> = {current: null};
let current = '';

function Field({initial}: {initial: string}): React.JSX.Element {
  const [value, setValue] = useState(initial);
  current = value;
  handle = React.useRef<ClipboardTextInputHandle>(null);
  return (
    <ClipboardTextInput
      value={value}
      onChangeText={setValue}
      placeholderColor="#888"
      textColor="#000"
      borderColor="#000"
      handleRef={handle}
    />
  );
}

describe('ClipboardTextInput insertAtCursor', () => {
  it('appends with a space when the field was never focused', () => {
    act(() => {
      TestRenderer.create(<Field initial="Coaching" />);
    });
    act(() => handle.current!.insertAtCursor('{subtag}'));
    expect(current).toBe('Coaching {subtag}');
    act(() => handle.current!.insertAtCursor('{year}'));
    expect(current).toBe('Coaching {subtag} {year}');
  });

  it('inserts at the last cursor position', () => {
    let renderer: TestRenderer.ReactTestRenderer | undefined;
    act(() => {
      renderer = TestRenderer.create(<Field initial="Coaching {year}" />);
    });
    const input = renderer!.root.findByType(TextInput);
    act(() => input.props.onSelectionChange({nativeEvent: {selection: {start: 8, end: 8}}}));
    act(() => handle.current!.insertAtCursor('{subtag}'));
    expect(current).toBe('Coaching {subtag} {year}');
  });
});
