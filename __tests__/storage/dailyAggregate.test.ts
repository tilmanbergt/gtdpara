import {buildDailyAggregate, groupDailyTasksByItem} from '../../src/storage/dailyAggregate';
import {item, task} from '../../test-helpers/fixtures';

// Sunday 2026-10-04, midday local time.
const NOW = new Date(2026, 9, 4, 12, 0, 0);
const INBOX = '/Note/2 Areas/0 Inbox';

const shown = (texts: string[], opts: {focused?: boolean; contextTag?: string} = {}) => {
  const p = item('project', 'P', {tasks: texts.map(t => task(t)), dailyFocus: !!opts.focused});
  return buildDailyAggregate([p], null, INBOX, NOW, opts.contextTag ?? null).tasks.map(e => e.task.text);
};

describe('buildDailyAggregate - Waiting For (0.7.0 W1)', () => {
  it('shows a Waiting For without date from an unfocused project', () => {
    expect(shown(['NDA #waiting-for:meier'])).toEqual(['NDA #waiting-for:meier']);
  });
  it('shows it when its date is today or overdue', () => {
    expect(shown(['a #waiting-for #due:2026-10-04', 'b #waiting-for #due:2026-09-30'])).toHaveLength(2);
  });
  it('hides it while its date is in the future, tomorrow included', () => {
    expect(shown(['a #waiting-for #due:2026-10-05', 'b #waiting-for #due:2026-11-01'])).toEqual([]);
  });
  it('still hides Someday and Maybe, even when due', () => {
    expect(shown(['a #someday #due:2026-10-04', 'b #maybe'], {focused: true})).toEqual([]);
  });
  it('leaves the other rules alone', () => {
    expect(shown(['n #next'])).toEqual([]);
    expect(shown(['n #next'], {focused: true})).toEqual(['n #next']);
    expect(shown(['d #due:2026-10-05'])).toEqual(['d #due:2026-10-05']);
  });
  it('skips done and cancelled Waiting For', () => {
    const p = item('project', 'P', {
      tasks: [task('a #waiting-for', {done: true}), task('b #waiting-for', {cancelled: true})],
    });
    expect(buildDailyAggregate([p], null, INBOX, NOW).tasks).toEqual([]);
  });
  it('applies the same rule to the Inbox', () => {
    const inbox = {tasks: [task('i #waiting-for'), task('j #waiting-for #due:2026-10-06')], meetings: []};
    expect(buildDailyAggregate([], inbox, INBOX, NOW).tasks.map(e => e.task.text)).toEqual(['i #waiting-for']);
  });
  it('a tag filter still lets a future-dated Waiting For through', () => {
    expect(shown(['a #lena #waiting-for #due:2026-11-01'], {contextTag: 'lena'})).toHaveLength(1);
  });
});

describe('groupDailyTasksByItem - Waiting For last (0.7.0 W2)', () => {
  it('moves Waiting For to the end of its group and keeps taskIndex', () => {
    const p = item('project', 'P', {
      tasks: [task('w1 #waiting-for'), task('d #due:2026-10-04'), task('w2 #waiting-for'), task('e #due:2026-10-03')],
    });
    const [group] = groupDailyTasksByItem(buildDailyAggregate([p], null, INBOX, NOW).tasks);
    expect(group.entries.map(e => e.taskIndex)).toEqual([1, 3, 0, 2]);
  });
});
