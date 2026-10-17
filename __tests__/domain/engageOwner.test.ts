// docs/dev/history/technical-design-engage.md §3.2, §3.4, §3.5: owners, their todos, and the current todo's key.
import {
  decideOpening,
  EngageSource,
  ownerExists,
  ownerKey,
  ownerOfMeeting,
  ownerOfTodo,
  ownerTitle,
  ownerTodos,
  resolveTodoKey,
  sameOwner,
} from '../../src/domain/engageOwner';
import {LoopLine} from '../../src/domain/loopsSection';
import {item, meeting, task} from '../../test-helpers/fixtures';

const loopLine = (tag: string, status: LoopLine['status'] = 'active'): LoopLine => ({tag, status, mainDate: null, linkedFile: null, extraColumns: [], raw: null});

const coaching = item('area', 'Coaching', {
  tasks: [
    task('Plan offsite #next'),
    task('Draft brief #proj/launch #next'),
    task('Old done thing', {done: true}),
    task('Ask Anna #sparring/anna'),
    task('Cancelled one', {cancelled: true}),
    task('Idea #proj/old'),
  ],
  meetings: [meeting('2026-11-01', 'Sparring #sparring/anna', {tags: ['sparring/anna']}), meeting('2026-11-02', 'Launch sync', {tags: ['proj/launch']})],
  loops: [loopLine('proj/launch'), loopLine('proj/old', 'done')],
});
const website = item('project', 'Website', {area: 'Coaching', tasks: [task('Check copy #sparring/anna #next')]});
const lone = item('project', 'Lone', {tasks: [task('Lone todo #sparring/anna')]});

const source: EngageSource = {
  items: [coaching, website, lone],
  inboxPath: '/Note/0 Inbox',
  loopKinds: ['proj'],
  threadTypes: ['sparring'],
};

describe('ownerTodos', () => {
  it('an item: its open todos outside its active loops, file order', () => {
    expect(ownerTodos({kind: 'item', itemPath: coaching.path}, source).map(r => [r.task.text, r.taskIndex])).toEqual([
      ['Plan offsite #next', 0],
      ['Ask Anna #sparring/anna', 3],
      ['Idea #proj/old', 5], // a closed loop's tag doesn't take the todo away
    ]);
  });
  it('a loop: its open members', () => {
    expect(ownerTodos({kind: 'loop', itemPath: coaching.path, tag: 'proj/launch'}, source).map(r => r.task.text)).toEqual(['Draft brief #proj/launch #next']);
  });
  it('a thread: across its scope, not outside it', () => {
    const refs = ownerTodos({kind: 'thread', scopeOwnerPath: coaching.path, tag: 'sparring/anna'}, source);
    expect(refs.map(r => [r.item.name, r.task.text])).toEqual([
      ['Coaching', 'Ask Anna #sparring/anna'],
      ['Website', 'Check copy #sparring/anna #next'],
    ]);
  });
  it('an unknown item has none', () => {
    expect(ownerTodos({kind: 'item', itemPath: '/nowhere'}, source)).toEqual([]);
  });
});

describe('owner of a todo or meeting', () => {
  it('a todo: its active loop, else its item', () => {
    expect(ownerOfTodo({itemPath: coaching.path, task: coaching.tasks[1]}, source)).toEqual({kind: 'loop', itemPath: coaching.path, tag: 'proj/launch'});
    expect(ownerOfTodo({itemPath: coaching.path, task: coaching.tasks[5]}, source)).toEqual({kind: 'item', itemPath: coaching.path});
    expect(ownerOfTodo({itemPath: '/nowhere', task: coaching.tasks[0]}, source)).toBeNull();
  });
  it('a meeting: its thread (scope owner = the Area), else its loop, else its item', () => {
    expect(ownerOfMeeting({itemPath: website.path, meeting: {tags: ['sparring/anna']}}, source)).toEqual({kind: 'thread', scopeOwnerPath: coaching.path, tag: 'sparring/anna'});
    expect(ownerOfMeeting({itemPath: coaching.path, meeting: coaching.meetings[1]}, source)).toEqual({kind: 'loop', itemPath: coaching.path, tag: 'proj/launch'});
    expect(ownerOfMeeting({itemPath: lone.path, meeting: {tags: []}}, source)).toEqual({kind: 'item', itemPath: lone.path});
  });
});

describe('resolveTodoKey', () => {
  it('finds the task at its index when the text matches', () => {
    expect(resolveTodoKey({itemPath: coaching.path, taskText: 'Plan offsite #next', taskIndex: 0}, source)?.taskIndex).toBe(0);
  });
  it('finds a moved task with the same text', () => {
    expect(resolveTodoKey({itemPath: coaching.path, taskText: 'Ask Anna #sparring/anna', taskIndex: 0}, source)?.taskIndex).toBe(3);
  });
  it('drops a renamed, done or vanished task', () => {
    expect(resolveTodoKey({itemPath: coaching.path, taskText: 'Plan the offsite #next', taskIndex: 0}, source)).toBeNull();
    expect(resolveTodoKey({itemPath: coaching.path, taskText: 'Old done thing', taskIndex: 2}, source)).toBeNull();
    expect(resolveTodoKey({itemPath: '/nowhere', taskText: 'x', taskIndex: 0}, source)).toBeNull();
  });
});

describe('owner identity and title', () => {
  it('keys and equality', () => {
    expect(ownerKey({kind: 'loop', itemPath: '/a', tag: 'proj/x'})).toBe('loop:/a:proj/x');
    expect(sameOwner({kind: 'item', itemPath: '/a'}, {kind: 'item', itemPath: '/a'})).toBe(true);
    expect(sameOwner({kind: 'item', itemPath: '/a'}, null)).toBe(false);
  });
  it('exists while its item (and a loop its line) is there', () => {
    expect(ownerExists({kind: 'loop', itemPath: coaching.path, tag: 'proj/launch'}, source)).toBe(true);
    expect(ownerExists({kind: 'loop', itemPath: coaching.path, tag: 'proj/none'}, source)).toBe(false);
    expect(ownerExists({kind: 'thread', scopeOwnerPath: '/nowhere', tag: 'sparring/anna'}, source)).toBe(false);
  });
  it('titles: kind, name, parent', () => {
    expect(ownerTitle({kind: 'item', itemPath: website.path}, source)).toEqual({kindLabel: 'Project', name: 'Website', parent: 'Coaching'});
    expect(ownerTitle({kind: 'item', itemPath: coaching.path}, source)).toEqual({kindLabel: 'Area', name: 'Coaching', parent: null});
    expect(ownerTitle({kind: 'loop', itemPath: coaching.path, tag: 'proj/launch'}, source)).toEqual({kindLabel: 'Loop', name: 'launch', parent: 'Coaching'});
    expect(ownerTitle({kind: 'thread', scopeOwnerPath: coaching.path, tag: 'sparring/anna'}, source)).toEqual({kindLabel: 'Thread', name: '#sparring/anna', parent: 'Coaching'});
  });
});

describe('decideOpening (Engage follows the note)', () => {
  const A = {kind: 'item' as const, itemPath: '/A'};
  const B = {kind: 'item' as const, itemPath: '/B'};
  const loopA = {kind: 'loop' as const, itemPath: '/A', tag: 'proj/x'};
  const keyA = {itemPath: '/A', taskText: 'Brief #next', taskIndex: 1};
  const keyB = {itemPath: '/B', taskText: 'Call #next', taskIndex: 0};
  const stored = {owner: loopA, key: keyA};
  it.each([
    ['"Engage ›" wins, no way back', {pageOwner: B, noteOwner: A, noteTodo: null, stored}, {owner: B, current: null, back: null, store: null}],
    ['"Engage ›" on the stored owner keeps its todo', {pageOwner: loopA, noteOwner: null, noteTodo: null, stored}, {owner: loopA, current: keyA, back: null, store: null}],
    ['the note page\'s todo: current and stored, the replaced todo is the way back', {pageOwner: null, noteOwner: B, noteTodo: keyB, stored}, {owner: B, current: keyB, back: stored, store: {owner: B, key: keyB}}],
    ['the note\'s owner wins over the stored todo, even nested in the same Area', {pageOwner: null, noteOwner: A, noteTodo: null, stored}, {owner: A, current: null, back: stored, store: null}],
    ['the note\'s owner is the stored owner: its todo, no way back', {pageOwner: null, noteOwner: loopA, noteTodo: null, stored}, {owner: loopA, current: keyA, back: null, store: null}],
    ['a note that belongs to nothing: the stored todo', {pageOwner: null, noteOwner: null, noteTodo: null, stored}, {owner: loopA, current: keyA, back: null, store: null}],
    ['nothing at all', {pageOwner: null, noteOwner: null, noteTodo: null, stored: null}, {owner: null, current: null, back: null, store: null}],
  ])('%s', (_name, input, expected) => {
    expect(decideOpening(input)).toEqual(expected);
  });
});
