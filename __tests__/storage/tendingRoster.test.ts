/** The tending roster and the counterpart predicate (docs/dev/history/technical-design-tending-threads.md §1.2.1, §3.9.4, §3.10). */
import {ruleTypesOf} from '../../src/domain/counterparts';
import {deriveMeetingFields} from '../../src/domain/markdown';
import {meetingKey} from '../../src/domain/provenance';
import {emptyTaskFields} from '../../src/domain/taskLine';
import {parseThreadsSpan} from '../../src/domain/threadsSection';
import {Meeting, Task} from '../../src/domain/types';
import {counterpartMatcher} from '../../src/storage/threadAggregate';
import {buildTendingRoster} from '../../src/storage/tendingRoster';
import {item, meeting, task} from '../../test-helpers/fixtures';

const NOW = new Date(2026, 9, 8, 12, 0, 0);
const INBOX = '/Note/2 Areas/0 Inbox';
const TYPES = ruleTypesOf([{enabled: true, tags: ['101', 'retro']}]);

function m(date: string, title: string, extra: Partial<Meeting> = {}): Meeting {
  return meeting(date, title, {...deriveMeetingFields(title), ...extra});
}
function withFields(text: string, fields: Partial<Task['fields']>, extra: Partial<Task> = {}): Task {
  return task(text, {fields: {...emptyTaskFields(), ...fields}, ...extra});
}

const mieke1 = m('2026-09-30', '1:1 Mieke #101/mieke', {time: '10:00', endTime: '11:00'});
const mieke2 = m('2026-10-14', '1:1 Mieke #101/mieke', {time: '10:00', endTime: '11:00'});
const sven = m('2026-09-28', '1:1 Sven #101/sven');
const raise = withFields('Raise budget question #101/sven', {meeting: meetingKey(mieke1)});

const area = item('area', 'Atruvia', {
  meetings: [mieke1, mieke2, sven],
  tasks: [
    raise,
    withFields('Contract back #wf/mieke', {created: '2026-09-20'}),
    withFields('Slides #wf/mieke', {created: '2026-10-01'}),
    task('Unrelated #retro/team'),
  ],
  threads: parseThreadsSpan('## Threads\n- mieke: active\n- sven: active\n- gone: inactive\n').threads,
});
const tender = item('project', 'Tender', {
  area: 'Atruvia',
  tasks: [task('Ask Anna #wf/anna'), task('Send Bert the deck #owe/bert'), task('Promise Sven #owe/sven')],
});
const lone = item('project', 'Solo', {meetings: [m('2026-10-02', 'Retro #retro/alpha')]});
const onlyInbox = {path: INBOX, tasks: [task('Inbox only #wf/ivan'), task('#101/mieke from inbox')], meetings: []};
const items = [area, tender, lone];

describe('counterpartMatcher (§1.2.1)', () => {
  it('a todo agreed with Mieke but tagged #101/sven belongs to both', () => {
    const forMieke = counterpartMatcher(items, onlyInbox, '101/mieke', tender.path)!;
    const forSven = counterpartMatcher(items, onlyInbox, '101/sven', tender.path)!;
    expect(forMieke.task(raise)).toBe(true);
    expect(forSven.task(raise)).toBe(true);
    expect(forMieke.task(tender.tasks[2])).toBe(false);
    expect(forSven.task(tender.tasks[2])).toBe(true);
    expect(forMieke.task(area.tasks[1])).toBe(true);
    expect(forMieke.meeting(mieke1)).toBe(true);
    expect(forMieke.meeting(sven)).toBe(false);
  });
});

describe('buildTendingRoster', () => {
  const roster = buildTendingRoster(items, onlyInbox, TYPES, NOW);

  it('has one scope per Area and lone Project, and no Inbox counterparts (D18)', () => {
    expect(roster.map(r => r.owner.name)).toEqual(['Atruvia', 'Solo']);
    const leaves = roster.flatMap(r => [...r.confirm, ...r.active, ...r.inactive].map(e => e.counterpart.leaf));
    expect(leaves).not.toContain('ivan');
  });

  it('splits confirm / active / inactive', () => {
    const [atruvia, solo] = roster;
    expect(atruvia.confirm.map(e => e.counterpart.leaf)).toEqual(['anna', 'bert', 'team']);
    expect(atruvia.active.map(e => e.counterpart.leaf)).toEqual(['mieke', 'sven']);
    expect(atruvia.inactive.map(e => e.counterpart.leaf)).toEqual(['gone']);
    expect(solo.confirm.map(e => e.counterpart.leaf)).toEqual(['alpha']);
  });

  it('gives the overview signals: last, next, I owe, oldest Waiting for', () => {
    const mieke = roster[0].active[0];
    expect(mieke).toMatchObject({lastMeeting: '2026-09-30', nextMeeting: '2026-10-14', oweCount: 1, waitingCount: 2, oldestWaitingDays: 18});
    const svenEntry = roster[0].active[1];
    expect(svenEntry).toMatchObject({lastMeeting: '2026-09-28', nextMeeting: null, oweCount: 1, waitingCount: 0, oldestWaitingDays: null});
    expect(svenEntry.overview.ahead.relevant.map(e => e.task.text)).toEqual(['Raise budget question #101/sven']);
  });

  it('marks one-offs and opens them through wf/ or owe/', () => {
    const [anna, bert] = roster[0].confirm;
    expect([anna.counterpart.oneOff, anna.tag, anna.waitingCount]).toEqual(['wf', 'wf/anna', 1]);
    expect([bert.counterpart.oneOff, bert.tag, bert.oweCount]).toEqual(['owe', 'owe/bert', 1]);
  });
});
