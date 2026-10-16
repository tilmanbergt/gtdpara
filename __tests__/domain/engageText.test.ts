// docs/dev/history/technical-design-engage.md §3.12: the panel's texts.
import {ackLabel, marksLineText, noNextPromptText, nothingLeftText, ownerLineText} from '../../src/domain/engageText';

describe('engageText', () => {
  it('owner lines', () => {
    expect(ownerLineText({kindLabel: 'Loop', name: 'launch', nextCount: 2, pickNext: false})).toBe('Loop · launch · 2 next ›');
    expect(ownerLineText({kindLabel: 'Area', name: 'Coaching', nextCount: 0, pickNext: true})).toBe('Area · Coaching · pick next ›');
  });
  it('marks line: hidden at 0, singular and plural, naming the item', () => {
    expect(marksLineText(0, 'Coaching')).toBe('');
    expect(marksLineText(1, 'Coaching')).toBe('1 mark to process in Coaching ›');
    expect(marksLineText(3, 'Website')).toBe('3 marks to process in Website ›');
  });
  it('signals and acks', () => {
    expect(nothingLeftText('launch')).toBe('Nothing left in launch.');
    expect(noNextPromptText('Website')).toBe('Website has no next action. Pick one:');
    expect(['done', 'someday', 'unnext'].map(k => ackLabel(k as 'done'))).toEqual(['Done:', 'Someday:', 'No longer #next:']);
  });
});
