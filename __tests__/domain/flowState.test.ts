import {groupTasksByFlowState} from '../../src/domain/flowState';
import {task} from '../../test-helpers/fixtures';

describe('groupTasksByFlowState', () => {
  const tasks = [
    task('Plain'),
    task('Do it #next'),
    task('Gone #next', {cancelled: true}),
    task('Ask #waiting-for:anna'),
    task('One day #someday'),
    task('Done next #next', {done: true}),
  ];
  const groups = groupTasksByFlowState(tasks);

  it('orders groups Next, Waiting for, Someday, ..., Other and leaves out empty ones', () => {
    expect(groups.map(g => g.key)).toEqual(['next', 'waiting-for', 'someday', 'other']);
  });
  it('hides cancelled tasks but keeps done ones in their group', () => {
    expect(groups[0].entries.map(e => e.task.text)).toEqual(['Do it #next', 'Done next #next']);
  });
  it('index points into the original array', () => {
    for (const group of groups) {
      for (const entry of group.entries) expect(tasks[entry.index]).toBe(entry.task);
    }
  });
});
