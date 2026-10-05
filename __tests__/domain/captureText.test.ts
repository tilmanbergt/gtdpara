import {
  collapseText,
  hasBullet,
  joinItems,
  prepareCaptureText,
  splitByHand,
  splitAtSelection,
  splitItems,
} from '../../src/domain/captureText';

describe('prepareCaptureText', () => {
  it('splits the recognizer output of box, dash and dot (device round 6)', () => {
    expect(prepareCaptureText('☐ Test Box\n- Test Dash\n• Test Bullet', 'todo')).toEqual({
      items: ['Test Box', 'Test Dash', 'Test Bullet'],
      split: true,
    });
  });
  it('treats numbers as bullets', () => {
    expect(prepareCaptureText('1. book room\n2) agenda\n(3) slides', 'todo').items).toEqual(['book room', 'agenda', 'slides']);
  });
  it('joins a line without bullet to the item above it', () => {
    expect(prepareCaptureText('- Anna: budget numbers\n  by Fri\n- send slides to Tom', 'todo').items).toEqual([
      'Anna: budget numbers by Fri',
      'send slides to Tom',
    ]);
  });
  it('puts heading lines in front of every item', () => {
    expect(prepareCaptureText('Team sync\n- book room\n- agenda to Tom', 'todo').items).toEqual([
      'Team sync: book room',
      'Team sync: agenda to Tom',
    ]);
    expect(prepareCaptureText('Team sync:\n- book room\n- agenda', 'todo').items).toEqual([
      'Team sync: book room',
      'Team sync: agenda',
    ]);
    expect(prepareCaptureText('Offsite -\n- room\n- food', 'todo').items).toEqual(['Offsite - room', 'Offsite - food']);
  });
  it('makes one item without bullets, collapsing whitespace', () => {
    expect(prepareCaptureText('Call the   plumber\nabout the leak', 'todo')).toEqual({
      items: ['Call the plumber about the leak'],
      split: false,
    });
  });
  it('strips a single bullet without splitting', () => {
    expect(prepareCaptureText('- order soil', 'todo')).toEqual({items: ['order soil'], split: false});
  });
  it('does not take a decimal number for a bullet', () => {
    expect(hasBullet('3.5 hours planning')).toBe(false);
    expect(prepareCaptureText('3.5 hours planning\n2. not a list', 'todo').split).toBe(false);
  });
  it('never splits a meeting', () => {
    expect(prepareCaptureText('- Sync with Tom\n- Thursday', 'meeting')).toEqual({items: ['Sync with Tom - Thursday'], split: false});
  });
  it('handles empty text', () => {
    expect(prepareCaptureText('', 'todo')).toEqual({items: [''], split: false});
    expect(prepareCaptureText('  \n ', 'todo')).toEqual({items: [''], split: false});
  });
  it('ignores a bare bullet without text', () => {
    expect(hasBullet('- ')).toBe(false);
  });
});

describe('toggling by hand', () => {
  it('splits at every line and joins back', () => {
    expect(splitByHand('a\n\n  b  c \n')).toEqual(['a', 'b c']);
    expect(splitByHand('')).toEqual(['']);
    expect(joinItems(['a', ' b ', ''])).toBe('a b');
    expect(splitItems('x\r\ny')).toEqual(['x', 'y']);
    expect(collapseText(' a \n\t b ')).toBe('a b');
  });
});

describe('boxes and dots inside a line (no line breaks from the recognizer)', () => {
  it('splits the shape seen on the device', () => {
    expect(prepareCaptureText('☐ Buy fresh flowers☐ Call Anna today☐ Book room', 'todo')).toEqual({
      items: ['Buy fresh flowers', 'Call Anna today', 'Book room'],
      split: true,
    });
    expect(prepareCaptureText('Team: • room • agenda', 'todo').items).toEqual(['Team: room', 'Team: agenda']);
  });
  it('leaves dashes and the middle dot inside a line alone', () => {
    expect(prepareCaptureText('Anna - budget e-mail · Fri', 'todo')).toEqual({items: ['Anna - budget e-mail · Fri'], split: false});
  });
  it('does not split a meeting title', () => {
    expect(prepareCaptureText('☐ a☐ b', 'meeting').split).toBe(false);
  });
});

describe('splitAtSelection', () => {
  it('cuts at the cursor', () => {
    expect(splitAtSelection('book room agenda to Tom', 10, 10)).toEqual(['book room', 'agenda to Tom']);
  });
  it('removes a bullet at the start of the new item', () => {
    expect(splitAtSelection('book room - agenda', 10, 10)).toEqual(['book room', 'agenda']);
  });
  it('cuts out a selection as the next item', () => {
    const text = 'book room agenda to Tom slides';
    expect(splitAtSelection(text, 10, 23)).toEqual(['book room slides', 'agenda to Tom']);
    expect(splitAtSelection(text, 23, 10)).toEqual(['book room slides', 'agenda to Tom']);
  });
  it('refuses when one side would be empty', () => {
    expect(splitAtSelection('abc', 0, 0)).toBeNull();
    expect(splitAtSelection('abc', 3, 3)).toBeNull();
    expect(splitAtSelection('abc', 0, 3)).toBeNull();
  });
});
