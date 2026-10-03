import {DailyItemRef, DailyTaskEntry, groupDailyTasksByItem, inboxItemRef} from '../../src/storage/dailyAggregate';
import {task} from '../../test-helpers/fixtures';

const ref = (name: string, focus = false): DailyItemRef => ({
  kind: 'project',
  name,
  path: `/P/${name}`,
  dailyFocus: focus,
  weeklyFocus: false,
  monthlyFocus: false,
  abbrev: null,
});
const entry = (item: DailyItemRef, i: number): DailyTaskEntry => ({item, taskIndex: i, task: task(`t${i}`)});

describe('groupDailyTasksByItem', () => {
  const a = ref('A');
  const b = ref('B', true);
  const inbox = inboxItemRef('/Note/2 Areas/0 Inbox');
  const groups = groupDailyTasksByItem([entry(a, 0), entry(b, 1), entry(a, 2), entry(inbox, 3)]);

  it('makes one group per item, entries in arrival order', () => {
    expect(groups.find(g => g.item.name === 'A')?.entries.map(e => e.taskIndex)).toEqual([0, 2]);
  });
  it('puts the Inbox first, then focused items, then the rest', () => {
    expect(groups.map(g => g.item.name)).toEqual(['Inbox', 'B', 'A']);
  });
  it('is empty for no entries', () => {
    expect(groupDailyTasksByItem([])).toEqual([]);
  });
});
