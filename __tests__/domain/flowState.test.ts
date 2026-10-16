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
  const groups = groupTasksByFlowState(tasks, 'inbox');

  it('Inbox: Next, Waiting for, Someday, ..., Other (not processed yet) last; empty groups left out', () => {
    expect(groups.map(g => g.label)).toEqual(['Next', 'Waiting For', 'Someday', 'Other']);
  });
  it('a Project or Area: untagged todos are the Plan, after Next and Waiting For, before Someday and Maybe', () => {
    const item = groupTasksByFlowState([...tasks, task('Perhaps #maybe')], 'item');
    expect(item.map(g => g.label)).toEqual(['Next', 'Waiting For', 'Plan', 'Someday', 'Maybe']);
    expect(item[2].entries.map(e => e.task.text)).toEqual(['Plain']);
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
