/** Loops (docs/dev/history/technical-design-loops.md §3). */
import {
  closeBlockers,
  groupTodosByLoop,
  isLoopIdea,
  loopIdeas,
  loopItselfOf,
  loopItselfOfLine,
  loopKindsOf,
  loopMembers,
  loopNoteBaseName,
  loopOf,
  loopsInUse,
} from '../../src/domain/loops';
import {newLoopLine, parseLoopsSpan, writeLoopsIntoContent, withLoopLine} from '../../src/domain/loopsSection';
import {ruleTypesOf} from '../../src/domain/counterparts';
import {renderSharedFileName} from '../../src/domain/sharedNotePages';
import {newTask, parseTaskInput} from '../../src/domain/taskEdit';
import {Meeting, Task} from '../../src/domain/types';
import {parseProjectFileContent} from '../../src/storage/projectFile';

jest.mock('../../src/supernote/fileSystem', () => ({readTextFile: jest.fn(), writeTextFile: jest.fn()}));

const KINDS = ['workshop', 'read'];

function todo(line: string, extra: Partial<Task> = {}): Task {
  const {text, fields} = parseTaskInput(line);
  return {...newTask({text, fields}), ...extra};
}

function meeting(title: string, date: string, extra: Partial<Meeting> = {}): Meeting {
  const tags = (title.match(/#([\w/-]+)/g) ?? []).map(t => t.slice(1).toLowerCase());
  return {title, date, time: '10:00', endTime: '', days: 1, tags, cancelled: false, notePath: '', linkedFile: '', ...extra};
}

describe('loop kinds', () => {
  const rules = [
    {enabled: true, context: 'loop', tags: ['#Workshop', 'read']},
    {enabled: false, context: 'loop', tags: ['trip']},
    {enabled: true, context: 'meeting', tags: ['workshop', 'retro']},
  ];
  it('are the tags of enabled Loop rules', () => {
    expect(loopKindsOf(rules)).toEqual(['workshop', 'read']);
  });
  it('never become counterpart types, whatever rule shares the tag', () => {
    expect(ruleTypesOf(rules)).toEqual(['retro', 'wf', 'owe']);
  });
  it('name a loop by the full tag only', () => {
    expect(loopOf('workshop/teamoffsite', KINDS)).toEqual({kind: 'workshop', name: 'teamoffsite', tag: 'workshop/teamoffsite'});
    expect(loopOf('workshop/teamoffsite/day1', KINDS)?.tag).toBe('workshop/teamoffsite');
    expect(loopOf('workshop', KINDS)).toBeNull();
    expect(loopOf('retro/demand', KINDS)).toBeNull();
  });
});

describe('the loop itself vs a todo of it', () => {
  it('is a bare loop tag, also with #next/#now and a due date', () => {
    expect(loopItselfOfLine('#workshop/teamoffsite', KINDS)?.tag).toBe('workshop/teamoffsite');
    expect(loopItselfOfLine('#workshop/teamoffsite #next [due:: 2026-11-14]', KINDS)?.tag).toBe('workshop/teamoffsite');
    expect(loopItselfOfLine('#workshop/teamoffsite #now', KINDS)?.tag).toBe('workshop/teamoffsite');
  });
  it('is a todo when there are words, someday/maybe, w/f, other tags or two loop tags', () => {
    expect(loopItselfOfLine('Book room #workshop/teamoffsite', KINDS)).toBeNull();
    expect(loopItselfOfLine('#read/oldshatterhand #someday', KINDS)).toBeNull();
    expect(loopItselfOfLine('#read/oldshatterhand #maybe', KINDS)).toBeNull();
    expect(loopItselfOfLine('#workshop/teamoffsite #wf/bob', KINDS)).toBeNull();
    expect(loopItselfOfLine('#workshop/teamoffsite #mieke', KINDS)).toBeNull();
    expect(loopItselfOfLine('#workshop/a #read/b', KINDS)).toBeNull();
    expect(loopItselfOfLine('#retro/demand', KINDS)).toBeNull();
    expect(loopItselfOfLine('#workshop/teamoffsite', [])).toBeNull();
  });
  it('ignores done and cancelled todos', () => {
    expect(loopItselfOf(todo('#workshop/x', {done: true}), KINDS)).toBeNull();
    expect(loopItselfOf(todo('#workshop/x', {cancelled: true}), KINDS)).toBeNull();
  });
  it('a bare tag with someday/maybe is a loop idea', () => {
    expect(isLoopIdea(todo('#read/oldshatterhand #someday'), KINDS)?.tag).toBe('read/oldshatterhand');
    expect(isLoopIdea(todo('Buy book #read/oldshatterhand #someday'), KINDS)).toBeNull();
    expect(isLoopIdea(todo('#read/oldshatterhand'), KINDS)).toBeNull();
  });
});

describe('members, blockers, New and ideas', () => {
  const item = {
    tasks: [
      todo('Book room #workshop/teamoffsite #next'),
      todo('Draft agenda #workshop/teamoffsite'),
      todo('Agree date #workshop/teamoffsite', {done: true}),
      todo('Order catering #workshop/catering #next'),
      todo('Plan menu #workshop/menu'),
      todo('#read/oldshatterhand #someday'),
      todo('Unrelated'),
    ],
    meetings: [
      meeting('Dry run #workshop/teamoffsite', '2026-11-06'),
      meeting('Kick-off #workshop/teamoffsite', '2026-10-01'),
      meeting('Tasting #workshop/food', '2026-10-20', {cancelled: true}),
      meeting('Venue visit #workshop/venue', '2026-10-21'),
    ],
    loops: [newLoopLine('workshop/teamoffsite', '2026-11-14')],
  };
  it('members are the tagged todos and meetings, cancelled meetings left out', () => {
    const m = loopMembers(item, 'workshop/teamoffsite');
    expect(m.tasks.map(t => t.text.split(' #')[0])).toEqual(['Book room', 'Draft agenda', 'Agree date']);
    expect(m.meetings.map(x => x.date)).toEqual(['2026-11-06', '2026-10-01']);
  });
  it('blockers are open todos and meetings not over yet', () => {
    const now = new Date('2026-10-10T12:00:00').getTime();
    const b = closeBlockers(item, 'workshop/teamoffsite', now);
    expect(b.openTodos).toHaveLength(2);
    expect(b.upcomingMeetings.map(m => m.date)).toEqual(['2026-11-06']);
  });
  it('New: loop tags on active todos and meetings, without a line', () => {
    expect(loopsInUse(item, KINDS).map(l => l.tag)).toEqual(['workshop/catering', 'workshop/venue']);
  });
  it('ideas: someday/maybe bare tags without a line', () => {
    expect(loopIdeas(item, KINDS).map(l => l.tag)).toEqual(['read/oldshatterhand']);
  });
});

describe('the loop note name', () => {
  const loop = {kind: 'workshop', name: 'teamoffsite', tag: 'workshop/teamoffsite'};
  it('takes the main date, or leaves the date out', () => {
    expect(loopNoteBaseName(undefined, loop, '2026-11-14')).toBe('2026-11 workshop teamoffsite');
    expect(loopNoteBaseName('', loop, null)).toBe('workshop teamoffsite');
    expect(loopNoteBaseName('{subtag} {day}.{month}.{year}', loop, '2026-11-04')).toBe('teamoffsite 04.11.2026');
    expect(loopNoteBaseName('{subtag} {day}.{month}.{year}', loop, null)).toBe('teamoffsite');
  });
  it('drops date placeholders with their separator for shared notes too', () => {
    const base = {ruleName: 'Retro', tag: 'retro', subtag: 'demand'};
    expect(renderSharedFileName({...base, template: '{tag}-{year}', date: ''})).toBe('retro');
    expect(renderSharedFileName({...base, template: '{tag} {subtag} {year}', date: '2026-10-07'})).toBe('retro demand 2026');
    expect(renderSharedFileName({...base, template: '{year}_{month}_{day} {tag}', date: '2026-10-07'})).toBe('2026_10_07 retro');
  });
});

describe('## Loops', () => {
  const FILE = [
    '## Tasks',
    '- [ ] Book room #workshop/teamoffsite',
    '',
    '## Loops',
    '- workshop/teamoffsite: active, 2026-11-14, [[Offsite brief.pdf]]',
    '- Study/PSM2:  Done ,2026-10-03',
    '- buy/ebike: dropped',
    '- read/x: active, someday, [[a.epub]]',
    'a note by hand',
    '- plainleaf: active',
    '',
  ].join('\n');

  it('reads status, main date, linked file and other columns', () => {
    const {loops, extraLines} = parseLoopsSpan(FILE);
    expect(loops.map(l => [l.tag, l.status, l.mainDate, l.linkedFile, l.extraColumns])).toEqual([
      ['workshop/teamoffsite', 'active', '2026-11-14', 'Offsite brief.pdf', []],
      ['study/psm2', 'done', '2026-10-03', null, []],
      ['buy/ebike', 'dropped', null, null, []],
      ['read/x', 'active', null, null, ['someday', '[[a.epub]]']],
    ]);
    expect(extraLines).toEqual(['a note by hand', '- plainleaf: active']);
  });

  it('writes an unchanged section back byte-identical', () => {
    const {loops, extraLines} = parseLoopsSpan(FILE);
    expect(writeLoopsIntoContent(FILE, loops, extraLines)).toBe(FILE);
  });

  it('rewrites a changed line in canonical form', () => {
    const {loops, extraLines} = parseLoopsSpan(FILE);
    const next = withLoopLine(loops, 'study/psm2', l => ({...l, status: 'active', mainDate: '2026-12-01', linkedFile: 'Course.pdf'}));
    expect(writeLoopsIntoContent(FILE, next, extraLines)).toContain('- study/psm2: active, 2026-12-01, [[Course.pdf]]\n');
  });

  it('appends a new line and a missing section', () => {
    const written = writeLoopsIntoContent('## Tasks\n- [ ] x\n', [newLoopLine('Workshop/A')]);
    expect(written).toBe('## Tasks\n- [ ] x\n\n## Loops\n- workshop/a: active\n');
  });

  it('is part of the parsed file state', () => {
    const state = parseProjectFileContent(FILE);
    expect(state.loops.map(l => l.tag)).toEqual(['workshop/teamoffsite', 'study/psm2', 'buy/ebike', 'read/x']);
    expect(state.tasks).toHaveLength(1);
  });
});

describe('grouping todos by loop', () => {
  const loops = [
    newLoopLine('workshop/late', '2026-12-01'),
    newLoopLine('workshop/early', '2026-10-20'),
    newLoopLine('workshop/none'),
    {...newLoopLine('workshop/closed', '2026-09-01'), status: 'done' as const},
  ];
  it('orders loops by main date, then the rest; empty and closed loops have no group', () => {
    const todos = [
      {text: 'a', tags: ['workshop/late']},
      {text: 'b', tags: []},
      {text: 'c', tags: ['workshop/early']},
      {text: 'd', tags: ['workshop/closed']},
      {text: 'e', tags: ['workshop/early']},
    ];
    const groups = groupTodosByLoop(todos, loops);
    expect(groups.map(g => [g.loop?.tag ?? null, g.todos.map(t => t.text)])).toEqual([
      ['workshop/early', ['c', 'e']],
      ['workshop/late', ['a']],
      [null, ['b', 'd']],
    ]);
  });
});
