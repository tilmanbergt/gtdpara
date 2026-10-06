jest.mock('react-native-svg', () => ({}));
import {markMeta, markStatus} from '../../../src/ui/capture/MarksColumn';

const open = {
  mark: {id: 'm', createdAt: '2026-10-05 10:42', notePath: 'a.note', page: 1, text: null},
  owner: {type: 'inbox' as const},
  absPath: '/a.note',
} as unknown as Parameters<typeof markMeta>[0];

describe('marks column meta line', () => {
  it('always shows page, date and time, then the status', () => {
    expect(markMeta(open, undefined)).toBe('p2 · 5.10. 10:42 · not recognized');
    expect(markMeta(open, {state: 'recognizing', text: ''})).toBe('p2 · 5.10. 10:42 · recognizing…');
    expect(markMeta(open, {state: 'done', text: 'x'})).toBe('p2 · 5.10. 10:42 · recognized');
  });
  it('names empty, failed and missing', () => {
    expect(markStatus({state: 'empty', text: ''})).toBe('no text');
    expect(markStatus({state: 'failed', text: ''})).toBe('no text');
    expect(markStatus({state: 'done', text: '', missing: true})).toBe('picture missing');
  });
});
