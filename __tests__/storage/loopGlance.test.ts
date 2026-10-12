/** The loops of an Area or Project at a glance (docs/dev/history/technical-design-loops.md §4.7). */
import {newLoopLine} from '../../src/domain/loopsSection';
import {buildLoopGlance, loopDateText} from '../../src/storage/loopGlance';
import {buildLoopRoster, loopRosterCount} from '../../src/storage/loopRoster';
import {item, meeting, task} from '../../test-helpers/fixtures';

const KINDS = ['workshop', 'buy'];
const TODAY = '2026-10-10';
const NOW = new Date('2026-10-10T12:00:00');

describe('buildLoopGlance', () => {
  const owner = item('area', 'Atruvia', {
    loops: [
      {...newLoopLine('workshop/offsite'), mainDate: null},
      newLoopLine('workshop/piplanning', '2026-11-14'),
      {...newLoopLine('buy/ebike', '2026-05-01'), status: 'done'},
      {...newLoopLine('buy/desk', '2026-08-01'), status: 'dropped'},
    ],
    tasks: [
      task('Book room #workshop/piplanning #next'),
      task('Agenda #workshop/piplanning'),
      task('Old #workshop/piplanning', {done: true}),
      task('Ask Anna #workshop/retro #next'),
      task('#buy/kayak #someday'),
      task('Plain todo'),
    ],
    meetings: [meeting('2026-10-20', 'Prep', {tags: ['workshop/piplanning']})],
  });
  const glance = buildLoopGlance(owner, KINDS, TODAY, NOW);

  it('lists active loops by main date, those without one last', () => {
    expect(glance.active.map(r => r.line.tag)).toEqual(['workshop/piplanning', 'workshop/offsite']);
  });

  it('counts the loop’s own open todos and its next meeting', () => {
    const row = glance.active[0];
    expect(row.loop).toEqual({kind: 'workshop', name: 'piplanning', tag: 'workshop/piplanning'});
    expect(row.open).toBe(2);
    expect(row.next).toBe(1);
    expect(row.nextMeeting).toBe('2026-10-20');
    expect(glance.active[1].open).toBe(0);
  });

  it('lists used loop tags without a line as new, and someday loop tags as ideas', () => {
    expect(glance.fresh.map(l => l.tag)).toEqual(['workshop/retro']);
    expect(glance.ideas.map(l => l.tag)).toEqual(['buy/kayak']);
  });

  it('lists closed loops newest main date first', () => {
    expect(glance.closed.map(r => [r.line.tag, r.line.status])).toEqual([
      ['buy/desk', 'dropped'],
      ['buy/ebike', 'done'],
    ]);
  });

  it('writes the date line', () => {
    const fmt = (iso: string) => iso.slice(5);
    expect(loopDateText(glance.active[0], fmt)).toBe('11-14 · next 10-20');
    expect(loopDateText(glance.active[1], fmt)).toBe('no main date · next —');
  });
});

describe('buildLoopRoster', () => {
  it('groups active loops per scope and flags the ones needing a look', () => {
    const area = item('area', 'Atruvia', {loops: [newLoopLine('workshop/past', '2026-10-01'), newLoopLine('workshop/idle')]});
    const project = item('project', 'Garden', {
      area: 'Atruvia',
      loops: [newLoopLine('buy/soil')],
      tasks: [task('Order #buy/soil #next')],
    });
    const roster = buildLoopRoster([area, project], KINDS, TODAY, NOW);
    expect(roster).toHaveLength(1);
    expect(roster[0].loops.map(l => [l.glance.line.tag, l.owner.name, l.attention])).toEqual([
      ['workshop/past', 'Atruvia', 'pastMainDate'],
      ['workshop/idle', 'Atruvia', 'noNext'],
      ['buy/soil', 'Garden', null],
    ]);
    expect(loopRosterCount(roster)).toBe(2);
  });
});
