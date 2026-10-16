// docs/dev/history/technical-design-engage.md §3.12: the panel's texts.
import {ackLabel, linkedFileButtonText, marksLineText, noNextPromptText, nothingLeftText, nowDetailsText, ownerLineText, promptTodoLabel} from '../../src/domain/engageText';
import {task} from '../../test-helpers/fixtures';

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

  it('Now box details: due (overdue), waiting for with follow-up, agreed in; nothing when none is set', () => {
    const today = '2026-10-16';
    expect(nowDetailsText(task('Plain'), today)).toBe('');
    expect(nowDetailsText(task('Pay', {dueDate: '2026-10-20'}), today)).toMatch(/^Due .*20\.10\./);
    expect(nowDetailsText(task('Pay', {dueDate: '2026-10-12'}), today)).toMatch(/ - overdue$/);
    const wf = task('Offer #wf/anna-meier', {dueDate: '2026-10-19'});
    expect(nowDetailsText(wf, today)).toMatch(/^Waiting for Anna Meier · follow up .*19\.10\./);
    const agreed = task('Send minutes', {fields: {...task('x').fields, meeting: '2026-10-07 Retro alpha'}});
    expect(nowDetailsText(agreed, today)).toMatch(/^Agreed in Retro alpha · /);
  });
  it('linked file button: the file name, without a page link', () => {
    expect(linkedFileButtonText('3 Resources/Garden/Plan v2.pdf')).toBe('File: Plan v2.pdf ›');
    expect(linkedFileButtonText('Note/Beds.note#page=3')).toBe('File: Beds.note ›');
  });
  it('prompt labels are shortened', () => {
    expect(promptTodoLabel('Plan dinner')).toBe('Plan dinner');
    expect(promptTodoLabel('Plan the whole offsite dinner with everyone')).toBe('Plan the whole offsit…');
  });
});
