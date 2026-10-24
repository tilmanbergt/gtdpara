// docs/dev/history/technical-design-engage.md §3.12: the panel's texts.
import {
  ackLabel,
  fromCaption,
  fromMeetingText,
  alsoHereParts,
  linkedFileButtonText,
  marksLineText,
  nextHereText,
  noNextPromptText,
  nothingLeftText,
  nowDetailsText,
  ownerLineText,
  promptTodoLabel,
  tabLabel,
  todayNextText,
} from '../../src/domain/engageText';
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
    expect(['done', 'someday', 'unnext', 'next'].map(k => ackLabel(k as 'done'))).toEqual(['Done:', 'Someday:', 'No longer #next:', 'Now #next:']);
    expect(tabLabel('next', 2)).toBe('Next 2');
    expect(tabLabel('plan', 0)).toBe('Plan 0');
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

describe('Engage in context labels (docs/dev/history/technical-design-engage-in-context.md)', () => {
  const at = (h: number, m = 0) => new Date(2026, 9, 8, h, m).getTime();

  it('tabs, the From caption, the Waiting origin and Also here (docs/dev/history/technical-design-meetings-0.21.md R9-R11)', () => {
    expect(tabLabel('from', 3, 'thread')).toBe('From Thread 3');
    expect(tabLabel('from', 1, 'loop')).toBe('From Loop 1');
    expect(tabLabel('from', 2, 'item')).toBe('From meetings 2');
    expect(tabLabel('waiting', 2)).toBe('Waiting 2');
    expect(tabLabel('agreements', 1)).toBe('Agreements 1');
    expect(fromCaption({title: 'Sparring Mieke #sparring/mieke', date: '2026-10-14'}, '2026-10-08')).toBe('Wed 14.10. · Sparring Mieke');
    expect(fromCaption({title: 'Sparring Mieke', date: '2026-10-08'}, '2026-10-08')).toBe('today · Sparring Mieke');
    expect(fromMeetingText({date: '2026-10-14'}, '2026-10-24')).toBe('from 14.10.');
    expect(alsoHereParts(1)).toEqual({someday: '1 someday'});
    expect(alsoHereParts(0)).toEqual({someday: null});
  });

  it('Next here: day, time, title; "· next today" when merged', () => {
    const m = {title: 'Sparring Mieke #sparring/mieke', date: '2026-10-23', time: '10:00'};
    expect(nextHereText(m, '2026-10-08', false)).toBe('Next here: Fri 23.10. 10:00 Sparring Mieke ›');
    expect(nextHereText({...m, time: ''}, '2026-10-08', true)).toBe('Next here: Fri 23.10. Sparring Mieke · next today ›');
  });

  it('Today next: relative only under 3 hours', () => {
    const m = {title: 'Retro demand', time: '14:00'};
    expect(todayNextText(m, at(14), at(13, 20))).toBe('Today next: 14:00 Retro demand · in 40 min');
    expect(todayNextText(m, at(14), at(11, 30))).toBe('Today next: 14:00 Retro demand · in 2 h 30 min');
    expect(todayNextText(m, at(14), at(10, 0))).toBe('Today next: 14:00 Retro demand');
    expect(todayNextText(m, at(14), at(14, 10))).toBe('Today next: 14:00 Retro demand · now');
  });
});
