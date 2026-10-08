/** Counterparts per scope (docs/dev/history/technical-design-tending-threads.md §1.3, §3.9.2; D16-D18, D20). */
import {
  counterpartScopes,
  counterpartsOf,
  counterpartTag,
  inactiveLeaves,
  oneOffLabel,
  ruleTypesOf,
  scopeOwnerOf,
} from '../../src/domain/counterparts';
import {parseThreadsSpan} from '../../src/domain/threadsSection';
import {item, meeting, task} from '../../test-helpers/fixtures';

const NOW = new Date(2026, 9, 8, 12, 0);
const TYPES = ruleTypesOf([
  {enabled: true, tags: ['#101', 'retro/team']},
  {enabled: false, tags: ['coaching']},
  {enabled: true, tags: []},
]);
const lines = (text: string) => parseThreadsSpan(`## Threads\n${text}`).threads;

describe('ruleTypesOf', () => {
  it('takes the first segment of enabled rule tags, then wf and owe', () => {
    expect(TYPES).toEqual(['101', 'retro', 'wf', 'owe']);
  });
});

describe('scopes', () => {
  const area = item('area', 'Atruvia');
  const inArea = item('project', 'Tender', {area: 'Atruvia'});
  const lone = item('project', 'Solo');
  const orphan = item('project', 'Orphan', {area: 'Gone'});
  const done = item('project', 'Old', {status: 'done'});
  const items = [inArea, lone, area, orphan, done];

  it('finds the owner: the Area, or the Project without one', () => {
    expect(scopeOwnerOf(inArea.path, items)).toBe(area);
    expect(scopeOwnerOf(area.path, items)).toBe(area);
    expect(scopeOwnerOf(lone.path, items)).toBe(lone);
    expect(scopeOwnerOf(orphan.path, items)).toBe(orphan);
    expect(scopeOwnerOf('/Note/2 Areas/0 Inbox', items)).toBeNull();
  });

  it('lists Areas with their Projects, then lone Projects; Active and On Hold owners only', () => {
    const scopes = counterpartScopes(items);
    expect(scopes.map(s => s.owner.name)).toEqual(['Atruvia', 'Solo', 'Orphan']);
    expect(scopes[0].members.map(m => m.name)).toEqual(['Atruvia', 'Tender']);
  });
});

describe('counterpartsOf', () => {
  it('is one counterpart for an Area and its Projects, confirmed once', () => {
    const area = item('area', 'Atruvia', {
      meetings: [meeting('2026-09-30', '1:1 Mieke #101/mieke', {tags: ['101/mieke']})],
      threads: lines('- mieke: active\n'),
    });
    const project = item('project', 'Tender', {area: 'Atruvia', tasks: [task('Raise budget #101/mieke')]});
    const [scope] = counterpartScopes([area, project]);
    const cps = counterpartsOf(scope, TYPES, NOW);
    expect(cps).toEqual([
      {leaf: 'mieke', status: 'active', threads: [{type: '101', counterpart: 'mieke', tag: '101/mieke'}], oneOff: null, inUse: true, backInUse: false},
    ]);
  });

  it('marks unconfirmed counterparts new, ignores other nested tags and cancelled entries', () => {
    const p = item('project', 'Solo', {
      tasks: [task('a #retro/alpha'), task('b #tax/2026'), task('c #101/gone', {cancelled: true}), task('d #retro/zed', {done: true})],
    });
    const cps = counterpartsOf(counterpartScopes([p])[0], TYPES, NOW);
    expect(cps.map(c => [c.leaf, c.status])).toEqual([
      ['alpha', 'new'],
      ['zed', 'new'],
    ]);
  });

  it('labels one-off counterparts (D17)', () => {
    const p = item('project', 'Solo', {
      tasks: [task('a #wf/anna'), task('b #owe/bert'), task('c #wf/carl'), task('d #owe/carl'), task('e #wf/dora'), task('f #retro/dora')],
    });
    const cps = counterpartsOf(counterpartScopes([p])[0], TYPES, NOW);
    expect(cps.map(c => [c.leaf, c.oneOff])).toEqual([
      ['anna', 'wf'],
      ['bert', 'owe'],
      ['carl', 'wf+owe'],
      ['dora', null],
    ]);
    expect(oneOffLabel('wf')).toBe('w/f only');
    expect(oneOffLabel('owe')).toBe('owe only');
    expect(oneOffLabel('wf+owe')).toBe('w/f · owe only');
    expect(counterpartTag(cps[1])).toBe('owe/bert');
    expect(counterpartTag(cps[0])).toBe('wf/anna');
    expect(counterpartTag(cps[3])).toBe('retro/dora');
  });

  it('lists status lines nobody uses, and merges a stray section in a member Project (owner wins)', () => {
    const area = item('area', 'Atruvia', {threads: lines('- old: inactive\n- sven: active\n')});
    const project = item('project', 'Tender', {area: 'Atruvia', threads: lines('- sven: inactive\n- stray: active\n'), tasks: [task('x #101/sven')]});
    const cps = counterpartsOf(counterpartScopes([area, project])[0], TYPES, NOW);
    expect(cps.map(c => [c.leaf, c.status, c.inUse])).toEqual([
      ['old', 'inactive', false],
      ['stray', 'active', false],
      ['sven', 'active', true],
    ]);
  });

  it('is back in use only with an upcoming meeting of its thread (D20)', () => {
    const base = {threads: lines('- alpha: inactive\n- beta: inactive\n')};
    const p = item('project', 'Solo', {
      ...base,
      tasks: [task('new todo #retro/beta')],
      meetings: [
        meeting('2026-10-20', 'Retro #retro/alpha', {tags: ['retro/alpha']}),
        meeting('2026-09-20', 'Retro #retro/beta', {tags: ['retro/beta']}),
      ],
    });
    const cps = counterpartsOf(counterpartScopes([p])[0], TYPES, NOW);
    expect(cps.map(c => [c.leaf, c.backInUse])).toEqual([
      ['alpha', true],
      ['beta', false],
    ]);
  });
});

describe('inactiveLeaves', () => {
  it('hides a leaf inactive in a scope and active in none', () => {
    const a = item('area', 'A', {threads: lines('- x: inactive\n- y: inactive\n')});
    const b = item('area', 'B', {threads: lines('- y: active\n')});
    expect([...inactiveLeaves([a, b])]).toEqual(['x']);
  });
});
