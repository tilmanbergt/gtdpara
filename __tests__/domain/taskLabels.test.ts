import {displayTaskText, isFlowStateConveyed, shortDate, taskLabels} from '../../src/domain/taskLabels';
import {isWaitingForShownOnDaily} from '../../src/domain/flowState';
import {task} from '../../test-helpers/fixtures';

const TODAY = '2026-10-04';
const texts = (t: string, context: 'flat' | 'grouped' = 'flat', contextActive = false) =>
  taskLabels(task(t), context, TODAY, contextActive).map(l => l.text);

describe('shortDate', () => {
  it('writes day.month. without leading zeros', () => {
    expect(shortDate('2026-10-05', TODAY)).toBe('5.10.');
    expect(shortDate('2026-01-09', TODAY)).toBe('9.1.');
  });
  it('adds the year for another year', () => {
    expect(shortDate('2027-01-05', TODAY)).toBe('5.1.2027');
  });
  it('leaves anything else unchanged', () => {
    expect(shortDate('soon', TODAY)).toBe('soon');
  });
});

describe('taskLabels - flat', () => {
  it('#next and #now', () => {
    expect(texts('Draft offer #next')).toEqual(['#next']);
    expect(texts('Draft offer #next #now')).toEqual(['#now']);
  });
  it('#w/f with and without a name', () => {
    expect(texts('Signed NDA #waiting-for:meier-sohn')).toEqual(['#w/f Meier Sohn']);
    expect(texts('Signed NDA #waiting-for')).toEqual(['#w/f']);
  });
  it('shortens a long waiting name', () => {
    const [label] = texts('x #waiting-for:a-very-long-company-name-gmbh');
    expect(label.startsWith('#w/f ')).toBe(true);
    expect(label.endsWith('…')).toBe(true);
    expect(label.length).toBeLessThanOrEqual('#w/f '.length + 20);
  });
  it('#someday only under an active tag filter', () => {
    expect(texts('Idea #someday')).toEqual([]);
    expect(texts('Idea #someday', 'flat', true)).toEqual(['#someday']);
  });
  it('due and overdue after the flow state', () => {
    expect(texts('Price sheet #next #due:2026-10-05')).toEqual(['#next', '#due 5.10.']);
    expect(texts('Price sheet #due:2026-09-28')).toEqual(['#due 28.9. !']);
    expect(texts('Today #due:2026-10-04')).toEqual(['#due 4.10.']);
  });
  it('nothing for a plain todo', () => {
    expect(texts('Book train')).toEqual([]);
  });
});

describe('taskLabels - grouped', () => {
  it('leaves out what the heading shows', () => {
    expect(texts('Draft #next', 'grouped')).toEqual([]);
    expect(texts('NDA #waiting-for', 'grouped')).toEqual([]);
    expect(texts('Idea #someday', 'grouped')).toEqual([]);
  });
  it('keeps the waiting name and the due date', () => {
    expect(texts('NDA #waiting-for:meier #due:2026-10-05', 'grouped')).toEqual(['#w/f Meier', '#due 5.10.']);
  });
});

describe('displayTaskText / isFlowStateConveyed', () => {
  it('strips tags a label shows (flat)', () => {
    expect(displayTaskText(task('Draft #next #now'), 'flat')).toBe('Draft');
    expect(displayTaskText(task('NDA #waiting-for'), 'flat')).toBe('NDA');
    expect(displayTaskText(task('NDA #waiting-for:meier #due:2026-10-05'), 'flat')).toBe('NDA');
  });
  it('keeps #someday in a flat list without tag filter', () => {
    expect(isFlowStateConveyed(task('Idea #someday'), 'flat')).toBe(false);
    expect(displayTaskText(task('Idea #someday'), 'flat')).toBe('Idea #someday');
  });
  it('strips the flow state under its heading (grouped)', () => {
    expect(displayTaskText(task('NDA #waiting-for'), 'grouped')).toBe('NDA');
    expect(displayTaskText(task('Maybe this #maybe'), 'grouped')).toBe('Maybe this');
  });
  it('keeps context tags', () => {
    expect(displayTaskText(task('Call #lena #next'), 'flat')).toBe('Call #lena');
  });
});

describe('isWaitingForShownOnDaily', () => {
  it('no date or date reached: shown', () => {
    expect(isWaitingForShownOnDaily(task('x #waiting-for'), TODAY)).toBe(true);
    expect(isWaitingForShownOnDaily(task('x #waiting-for #due:2026-10-04'), TODAY)).toBe(true);
    expect(isWaitingForShownOnDaily(task('x #waiting-for #due:2026-09-01'), TODAY)).toBe(true);
  });
  it('future date (tomorrow too): hidden', () => {
    expect(isWaitingForShownOnDaily(task('x #waiting-for #due:2026-10-05'), TODAY)).toBe(false);
  });
  it('other flow states: false', () => {
    expect(isWaitingForShownOnDaily(task('x #next'), TODAY)).toBe(false);
  });
});
