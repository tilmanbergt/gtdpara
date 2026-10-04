import {fitTitleToLines, labelSuffix, taskRowLayout, taskTextWidthPx, TASK_COLUMN_WIDTH_PX} from '../../src/ui/taskRowLayout';
import {activeLineEstimator} from '../../src/ui/textLineEstimator';
import {FONT} from '../../src/ui/theme';
import {task} from '../../test-helpers/fixtures';

const TODAY = '2026-10-04';
const WIDTH = taskTextWidthPx(TASK_COLUMN_WIDTH_PX);
const lines = (text: string) => activeLineEstimator.estimateLines(text, WIDTH, FONT.medium);
const LONG =
  'Ask the supplier about the revised delivery dates for batch two and confirm the new prices with purchasing before Friday';

describe('fitTitleToLines', () => {
  it('leaves a title that fits unchanged', () => {
    expect(fitTitleToLines('Book train', '  #next', WIDTH, 2)).toBe('Book train');
  });
  it('shortens a long title so title and labels fit in two lines', () => {
    const suffix = '  #w/f Meier Sohn  #due 5.10.';
    const fitted = fitTitleToLines(LONG, suffix, WIDTH, 2);
    expect(fitted.endsWith('…')).toBe(true);
    expect(fitted.length).toBeLessThan(LONG.length);
    expect(lines(fitted + suffix)).toBeLessThanOrEqual(2);
    expect(LONG.startsWith(fitted.slice(0, -1))).toBe(true);
  });
  it('cuts at a word boundary', () => {
    const fitted = fitTitleToLines(LONG, '  #w/f Meier', WIDTH, 1);
    const kept = fitted.slice(0, -1);
    expect(LONG.charAt(kept.length)).toBe(' ');
  });
  it('handles a single very long word', () => {
    const word = 'x'.repeat(300);
    const fitted = fitTitleToLines(word, '  #next', WIDTH, 2);
    expect(lines(fitted + '  #next')).toBeLessThanOrEqual(2);
    expect(fitted.endsWith('…')).toBe(true);
  });
  it('returns just "…" when the labels alone fill the lines', () => {
    const suffix = '  ' + 'W'.repeat(80);
    expect(fitTitleToLines('Some title', suffix, WIDTH, 1)).toBe('…');
  });
});

describe('taskRowLayout', () => {
  it('counts the labels in the line estimate (0.6.0 overflow bug)', () => {
    // A title that alone fits one line but not together with its labels.
    let title = 'Signed NDA';
    while (lines(title + ' word') === 1) title += ' word';
    const t = task(`${title} #waiting-for:meier-sohn #due:2026-10-05`);
    const layout = taskRowLayout(t, TASK_COLUMN_WIDTH_PX, 'flat', false, TODAY);
    expect(layout.labels.map(l => l.text)).toEqual(['#w/f Meier Sohn', '#due 5.10.']);
    expect(layout.title).toBe(title);
    expect(layout.lines).toBe(2);
  });
  it('never exceeds two lines and keeps all labels', () => {
    const t = task(`${LONG} #waiting-for:meier #due:2026-09-01`);
    const layout = taskRowLayout(t, TASK_COLUMN_WIDTH_PX, 'flat', false, TODAY);
    expect(layout.lines).toBe(2);
    expect(layout.labels).toHaveLength(2);
    expect(lines(layout.title + labelSuffix(layout.labels))).toBeLessThanOrEqual(2);
  });
  it('a short todo without labels is one line', () => {
    expect(taskRowLayout(task('Book train'), TASK_COLUMN_WIDTH_PX, 'flat', false, TODAY)).toEqual({
      title: 'Book train',
      labels: [],
      lines: 1,
    });
  });
});
