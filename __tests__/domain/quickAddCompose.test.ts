import {composeTaskText} from '../../src/domain/quickAddCompose';

const fields = (over: Partial<Parameters<typeof composeTaskText>[0]> = {}) => ({
  text: 'Order soil',
  flowState: null,
  waitingOnText: '',
  dueDate: '',
  ...over,
});

describe('composeTaskText', () => {
  it('returns trimmed text without chips', () => {
    expect(composeTaskText(fields({text: '  Order soil  '}))).toBe('Order soil');
  });
  it('returns empty for empty text', () => {
    expect(composeTaskText(fields({text: '   ', flowState: 'next'}))).toBe('');
  });
  it('adds flow state and due date', () => {
    expect(composeTaskText(fields({flowState: 'next', dueDate: '2026-10-09'}))).toBe('Order soil #next #due:2026-10-09');
  });
  it('adds the waiting-on name', () => {
    const text = composeTaskText(fields({flowState: 'waiting-for', waitingOnText: 'Meier Sohn'}));
    expect(text).toContain('#waiting-for');
    expect(text.toLowerCase()).toContain('meier');
  });
  it('removes the abbreviation tag that picked the destination', () => {
    expect(composeTaskText(fields({text: 'Order soil #GR'}), 'GR')).toBe('Order soil');
  });
});
