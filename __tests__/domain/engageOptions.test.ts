// docs/dev/history/technical-design-engage.md §3.2: options of an owner and the focus screens' owner lines.
import {EngageItem, EngageSource} from '../../src/domain/engageOwner';
import {effectiveFocus, focusOwnerLines, optionsOf, ownersLeft} from '../../src/domain/engageOptions';
import {LoopLine} from '../../src/domain/loopsSection';
import {ownerLineText} from '../../src/domain/engageText';
import {item, meeting, task} from '../../test-helpers/fixtures';

const NOW = new Date(2026, 9, 16, 12, 0).getTime();
const loopLine = (tag: string): LoopLine => ({tag, status: 'active', mainDate: null, linkedFile: null, extraColumns: [], raw: null});
const src = (items: EngageItem[]): EngageSource => ({items, inboxPath: '/Note/0 Inbox', loopKinds: ['proj'], threadTypes: ['sparring']});
const texts = (refs: Array<{task: {text: string}}>) => refs.map(r => r.task.text);

describe('optionsOf', () => {
  const loopItem = item('area', 'Coaching', {
    loops: [loopLine('proj/launch')],
    tasks: [
      task('Plan #proj/launch'),
      task('Brief #proj/launch #next'),
      task('Wait on Bob #proj/launch #wf/bob'),
      task('Someday thing #proj/launch #someday'),
      task('Maybe thing #proj/launch #maybe'),
      task('Now thing #proj/launch #now'),
      task('Book room #proj/launch'),
      task('Loose #next'),
    ],
  });
  const loop = {kind: 'loop' as const, itemPath: loopItem.path, tag: 'proj/launch'};

  it('#next (and #now) and the plan, file order; waiting-for/someday/maybe never', () => {
    const o = optionsOf(loop, src([loopItem]), NOW);
    expect(texts(o.next)).toEqual(['Brief #proj/launch #next', 'Now thing #proj/launch #now']);
    expect(texts(o.plan)).toEqual(['Plan #proj/launch', 'Book room #proj/launch']);
    expect(o.ownerEmpty).toBe(false);
  });
  it('the current todo is in neither list', () => {
    const o = optionsOf(loop, src([loopItem]), NOW, {itemPath: loopItem.path, taskText: 'Brief #proj/launch #next', taskIndex: 1});
    expect(texts(o.next)).toEqual(['Now thing #proj/launch #now']);
  });
  it('an Area leaves its active loops\' todos out', () => {
    expect(texts(optionsOf({kind: 'item', itemPath: loopItem.path}, src([loopItem]), NOW).next)).toEqual(['Loose #next']);
  });
  it('ownerEmpty: no open todo and no meeting ahead', () => {
    const done = item('project', 'Done', {tasks: [task('x', {done: true})]});
    const owner = {kind: 'item' as const, itemPath: done.path};
    expect(optionsOf(owner, src([done]), NOW).ownerEmpty).toBe(true);
    const ahead = {...done, meetings: [meeting('2026-10-20', 'Review')]};
    expect(optionsOf(owner, src([ahead]), NOW).ownerEmpty).toBe(false);
    const past = {...done, meetings: [meeting('2026-10-01', 'Kickoff')]};
    expect(optionsOf(owner, src([past]), NOW).ownerEmpty).toBe(true);
    const waiting = {...done, tasks: [task('Wait #wf/bob')]};
    expect(optionsOf(owner, src([waiting]), NOW)).toMatchObject({next: [], plan: [], ownerEmpty: false});
  });
});

describe('focus', () => {
  const area = item('area', 'Coaching', {
    dailyFocus: true,
    weeklyFocus: true,
    loops: [loopLine('proj/launch')],
    threads: [{leaf: 'anna', status: 'active', rest: null, raw: null}],
    tasks: [task('Brief #proj/launch #next'), task('Ask Anna #sparring/anna'), task('Loose #next'), task('Bob #sparring/bob #next')],
  });
  const web = item('project', 'Website', {area: 'Coaching', weeklyFocus: true, tasks: [task('Copy #next'), task('Anna again #sparring/anna #next')]});
  const solo = item('project', 'Solo', {dailyFocus: true, weeklyFocus: true, tasks: [task('Solo plan')]});
  const idle = item('project', 'Idle', {dailyFocus: true, tasks: [task('Waiting #wf/x')]});
  const held = item('project', 'Held', {status: 'on-hold', dailyFocus: true, tasks: [task('Held #next')]});
  const s = src([area, web, solo, idle, held]);

  it('effective focus: daily when any Active item has it, else weekly', () => {
    expect(effectiveFocus(s)).toBe('daily');
    expect(effectiveFocus(src([web]))).toBe('weekly');
  });

  it('daily lines: Projects first, then Areas; loops, tended threads, then the item; empty ones left out', () => {
    expect(focusOwnerLines('daily', null, s, NOW).map(ownerLineText)).toEqual([
      'Project · Solo · pick next ›',
      'Loop · launch · 1 next ›',
      'Thread · #sparring/anna · 1 next ›', // its scope includes Website's #next
      'Area · Coaching · 2 next ›',
    ]);
    expect(ownersLeft('daily', s, NOW)).toBe(4);
  });

  it('ring order around the current owner: same counterpart, then same scope, then the rest; current left out', () => {
    const current = {kind: 'item' as const, itemPath: web.path};
    const lines = focusOwnerLines('weekly', current, s, NOW).map(l => l.name);
    // Website (a Project) comes first in focus order, so its thread leads its scope's block.
    expect(lines).toEqual(['#sparring/anna', 'launch', 'Coaching', 'Solo']);
    const fromThread = focusOwnerLines('weekly', {kind: 'thread', scopeOwnerPath: '/elsewhere', tag: 'sparring/anna'}, s, NOW).map(l => l.name);
    expect(fromThread[0]).toBe('#sparring/anna');
  });
});
