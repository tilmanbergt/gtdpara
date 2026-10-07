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
    expect(composeTaskText(fields({flowState: 'next', dueDate: '2026-10-09'}))).toBe('Order soil #next [due:: 2026-10-09]');
  });
  it('adds the waiting-on name', () => {
    const text = composeTaskText(fields({flowState: 'waiting-for', waitingOnText: 'Meier Sohn'}));
    expect(text).toBe('Order soil #wf/meier-sohn');
  });
  it('writes bare #wf without a name', () => {
    expect(composeTaskText(fields({flowState: 'waiting-for'}))).toBe('Order soil #wf');
  });
  it('replaces a legacy #due: tag and #waiting-for tag in edited text', () => {
    const text = composeTaskText(
      fields({text: 'Order soil #waiting-for:marco #due:2026-01-01', flowState: 'waiting-for', waitingOnText: 'Marco', dueDate: '2026-10-09'}),
    );
    expect(text).toBe('Order soil #wf/marco [due:: 2026-10-09]');
  });
  it('keeps the due field at the end when the abbreviation tag is removed', () => {
    expect(composeTaskText(fields({text: 'Order soil #GR', dueDate: '2026-10-09'}), 'GR')).toBe('Order soil [due:: 2026-10-09]');
  });
  it('removes the abbreviation tag that picked the destination', () => {
    expect(composeTaskText(fields({text: 'Order soil #GR'}), 'GR')).toBe('Order soil');
  });
});
