jest.mock('../../src/storage/dataCache', () => ({}));
jest.mock('../../src/storage/projectFile', () => ({}));

import {parseTasksSpan} from '../../src/domain/markdown';
import {
  applyTaskInput,
  newTask,
  parseTaskInput,
  withTaskCancelled,
  withTaskDone,
  withTaskDue,
  withTaskText,
} from '../../src/domain/taskEdit';
import {applyTaskEdit, buildTask} from '../../src/storage/itemMutations';

const parseOne = (line: string) => parseTasksSpan(`## Tasks\n${line}\n`).tasks[0];

describe('taskEdit', () => {
  const stored = parseOne('- [ ] Call Anna #next → [[n.note]] [meeting:: 2026-10-01 Retro] [created:: 2026-10-01] [due:: 2026-10-09] [prio:: 1]');

  it('withTaskText keeps fields and re-derives tags', () => {
    const next = withTaskText(stored, 'Call Anna #someday');
    expect(next.flowState).toBe('someday');
    expect(next.fields).toEqual(stored.fields);
    expect(next.dueDate).toBe('2026-10-09');
    expect(next.notePath).toBe('n.note');
  });

  it('withTaskDue sets the field and strips a legacy tag', () => {
    const legacy = parseOne('- [ ] Pay #due:2026-11-05');
    const moved = withTaskDue(legacy, '2026-12-01');
    expect(moved.text).toBe('Pay');
    expect(moved.fields.due).toBe('2026-12-01');
    expect(moved.dueDate).toBe('2026-12-01');
    const cleared = withTaskDue(legacy, null);
    expect(cleared.text).toBe('Pay');
    expect(cleared.dueDate).toBeNull();
  });

  it('withTaskDone writes completion, keeps an existing one, clears it on undone', () => {
    const done = withTaskDone(stored, true, '2026-10-07');
    expect(done.done).toBe(true);
    expect(done.fields.completion).toBe('2026-10-07');
    expect(withTaskDone(done, true, '2026-10-08').fields.completion).toBe('2026-10-07');
    const undone = withTaskDone(done, false, '2026-10-08');
    expect(undone.done).toBe(false);
    expect(undone.fields.completion).toBeNull();
    expect(undone.fields.created).toBe('2026-10-01');
  });

  it('withTaskCancelled only changes the state', () => {
    const c = withTaskCancelled(stored, true);
    expect(c.cancelled).toBe(true);
    expect(c.fields).toEqual(stored.fields);
  });

  it('parseTaskInput splits a composed line', () => {
    expect(parseTaskInput('  Order soil #next [due:: 2026-10-09] ')).toEqual({
      text: 'Order soil #next',
      fields: {due: '2026-10-09', created: null, completion: null, meeting: null, extra: []},
    });
  });

  it('applyTaskInput takes text and due from the line and keeps created, meeting, extra', () => {
    const edited = applyTaskInput(stored, 'Call Anna and Ben #next [due:: 2026-10-20]');
    expect(edited.text).toBe('Call Anna and Ben #next');
    expect(edited.fields).toEqual({meeting: '2026-10-01 Retro', created: '2026-10-01', due: '2026-10-20', completion: null, extra: ['[prio:: 1]']});
    expect(edited.dueDate).toBe('2026-10-20');
  });

  it('applyTaskInput clears the due date when the line has none', () => {
    const edited = applyTaskInput(stored, 'Call Anna #next');
    expect(edited.fields.due).toBeNull();
    expect(edited.dueDate).toBeNull();
    expect(edited.fields.created).toBe('2026-10-01');
  });

  it('newTask derives everything', () => {
    const t = newTask({text: 'Ask #wf/marco'});
    expect(t.flowState).toBe('waiting-for');
    expect(t.waitingOn).toBe('marco');
    expect(t.fields.created).toBeNull();
  });
});

describe('itemMutations task builders', () => {
  it('buildTask records created and the due field', () => {
    const t = buildTask('Order soil #next [due:: 2026-10-09]', {today: '2026-10-07'});
    expect(t.text).toBe('Order soil #next');
    expect(t.fields.created).toBe('2026-10-07');
    expect(t.fields.due).toBe('2026-10-09');
    expect(t.dueDate).toBe('2026-10-09');
  });

  it('buildTask keeps a created date the line carries', () => {
    expect(buildTask('X [created:: 2026-01-01]', {today: '2026-10-07'}).fields.created).toBe('2026-01-01');
  });

  it('applyTaskEdit keeps the note and sets the linked file', () => {
    const stored = parseOne('- [x] Done → [[n.note]] [created:: 2026-10-01] [completion:: 2026-10-05]');
    const edited = applyTaskEdit(stored, 'Done again', 'a.pdf');
    expect(edited.notePath).toBe('n.note');
    expect(edited.linkedFile).toBe('a.pdf');
    expect(edited.done).toBe(true);
    expect(edited.fields.completion).toBe('2026-10-05');
  });
});
