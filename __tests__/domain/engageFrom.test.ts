// docs/dev/history/technical-design-meetings-0.21.md R10-R12, §4.1, §11 (scenarios 1, 3, 4, 7, 8): the From,
// Waiting and Agreements tabs of Engage, over the design's demo-like data.
import {buildAgreement} from '../../src/domain/agreements';
import {engagePageOf, FromGroup, fromRowCount, optionsOf} from '../../src/domain/engageOptions';
import {EngageSource, MeetingRef} from '../../src/domain/engageOwner';
import {MeetingMoment} from '../../src/domain/meetingMoment';
import {deriveMeetingFields} from '../../src/domain/markdown';
import {meetingKey} from '../../src/domain/provenance';
import {emptyTaskFields} from '../../src/domain/taskLine';
import {CounterpartLine} from '../../src/domain/threadsSection';
import {Meeting, Task} from '../../src/domain/types';
import {item, meeting, task} from '../../test-helpers/fixtures';

const TODAY = '2026-10-24';
const at = (h: number, m = 0) => new Date(2026, 9, 24, h, m).getTime();
const m = (date: string, title: string): Meeting => meeting(date, title, {...deriveMeetingFields(title), time: '10:00', endTime: '11:00'});
const agreed = (text: string, mt: Meeting, extra: Partial<Task> = {}): Task => task(text, {fields: {...emptyTaskFields(), meeting: meetingKey(mt)}, ...extra});

const m14 = m('2026-10-14', 'Sparring Mieke #sparring/mieke');
const mToday = m(TODAY, 'Sparring Mieke #sparring/mieke');
const coaching = item('area', 'Coaching', {
  meetings: [m14, mToday],
  threads: [{leaf: 'mieke', status: 'active'} as CounterpartLine],
  tasks: [
    agreed('Draft feedback', m14), // 0 plan
    agreed('Org chart from Mieke #wf/mieke', m14), // 1 waiting
    agreed('Send role canvas', m14, {done: true, fields: {...emptyTaskFields(), meeting: meetingKey(m14), completion: '2026-10-20'}}), // 2 done
    agreed('Book follow-up with HR', mToday, {done: true}), // 3 done today
    task('Budget numbers #wf/mieke'), // 4 waiting, not from a meeting
    agreed('Parked idea #someday', m14), // 5 someday: never in From
    task('Area chore'), // 6 the Area's own
  ],
  agreements: [buildAgreement('Feedback only in our 1:1s #sparring/mieke', {today: TODAY, valid: '2026-12-31', meeting: meetingKey(mToday)})],
});
const source: EngageSource = {items: [coaching], inbox: null, loopKinds: [], threadTypes: ['sparring']};
const mieke = {kind: 'thread' as const, scopeOwnerPath: coaching.path, tag: 'sparring/mieke'};
const area = {kind: 'item' as const, itemPath: coaching.path};
const todayRef: MeetingRef = {itemPath: coaching.path, meetingIndex: 1};

/** Each group as "caption date: row texts" (done rows marked ✓, agreements ◇). */
function shape(groups: FromGroup[]): string[] {
  return groups.map(
    g =>
      `${g.meeting.meeting.date}: ${g.rows
        .map(r => (r.kind === 'agreement' ? `◇ ${r.agreement.agreement.text}` : `${r.todo.task.done ? '✓ ' : ''}${r.todo.task.text}`))
        .join(' | ')}`,
  );
}
const fromAt = (nowMs: number, moment: MeetingMoment | null, owner: typeof mieke | typeof area = mieke) =>
  optionsOf(owner, source, nowMs, null, moment ? {meeting: todayRef, moment} : null).from;

describe('From Thread (R10)', () => {
  it('Before (scenario 1): only the meetings that have started; the previous meeting\'s done rows, struck last', () => {
    expect(shape(fromAt(at(9, 30), 'before'))).toEqual([
      '2026-10-14: Draft feedback | Org chart from Mieke #wf/mieke | ✓ Send role canvas',
    ]);
  });

  it('During (scenario 7): this meeting first, with its agreement; done rows of both', () => {
    expect(shape(fromAt(at(10, 20), 'during'))).toEqual([
      `${TODAY}: ◇ Feedback only in our 1:1s #sparring/mieke | ✓ Book follow-up with HR`,
      '2026-10-14: Draft feedback | Org chart from Mieke #wf/mieke | ✓ Send role canvas',
    ]);
  });

  it('After (scenario 7): done rows of this meeting only', () => {
    expect(shape(fromAt(at(11, 1), 'after'))).toEqual([
      `${TODAY}: ◇ Feedback only in our 1:1s #sparring/mieke | ✓ Book follow-up with HR`,
      '2026-10-14: Draft feedback | Org chart from Mieke #wf/mieke',
    ]);
  });

  it('off a meeting page: done rows of the latest meeting that is over', () => {
    expect(shape(fromAt(at(12), null))).toEqual([
      `${TODAY}: ◇ Feedback only in our 1:1s #sparring/mieke | ✓ Book follow-up with HR`,
      '2026-10-14: Draft feedback | Org chart from Mieke #wf/mieke',
    ]);
  });

  it('a page meeting chosen During or After counts as started, before its start', () => {
    expect(shape(fromAt(at(9, 30), 'during'))[0]).toBe(`${TODAY}: ◇ Feedback only in our 1:1s #sparring/mieke | ✓ Book follow-up with HR`);
  });

  it('the current todo and Someday/Maybe are left out; row count without captions', () => {
    const current = {itemPath: coaching.path, taskText: 'Draft feedback', taskIndex: 0};
    const groups = optionsOf(mieke, source, at(9, 30), current, {meeting: todayRef, moment: 'before'}).from;
    expect(shape(groups)).toEqual(['2026-10-14: Org chart from Mieke #wf/mieke | ✓ Send role canvas']);
    expect(fromRowCount(groups)).toBe(2);
  });
});

describe('From meetings for a Project/Area (R10)', () => {
  it('only on a meeting\'s page', () => {
    expect(fromAt(at(12), null, area)).toEqual([]);
  });

  it('its page meeting\'s group, and the previous one\'s done rows Before/During', () => {
    expect(shape(fromAt(at(10, 20), 'during', area))).toEqual([`${TODAY}: ✓ Book follow-up with HR`, '2026-10-14: ✓ Send role canvas']);
    expect(shape(fromAt(at(9, 30), 'before', area))).toEqual(['2026-10-14: ✓ Send role canvas']);
    expect(shape(fromAt(at(11, 1), 'after', area))).toEqual([`${TODAY}: ✓ Book follow-up with HR`]);
  });
});

describe('Waiting (R11) and Agreements (R12)', () => {
  it('scenario 8: the thread\'s open Waiting For todos, file order, with where they were agreed', () => {
    const waiting = optionsOf(mieke, source, at(12)).waiting;
    expect(waiting.map(w => w.task.text)).toEqual(['Org chart from Mieke #wf/mieke', 'Budget numbers #wf/mieke']);
    expect(waiting.map(w => w.agreedIn)).toEqual([{itemPath: coaching.path, meetingIndex: 0}, null]);
  });

  it('the thread\'s active agreements; the Area holds none of the thread\'s', () => {
    expect(optionsOf(mieke, source, at(12)).agreements.map(r => r.agreement.text)).toEqual(['Feedback only in our 1:1s #sparring/mieke']);
    expect(optionsOf(area, source, at(12)).agreements).toEqual([]);
  });
});

describe('engagePageOf', () => {
  it('the moment by time, or the one chosen; none outside the After window', () => {
    expect(engagePageOf(todayRef, source, at(9, 30))).toEqual({meeting: todayRef, moment: 'before'});
    expect(engagePageOf(todayRef, source, at(10, 40), 'after')).toEqual({meeting: todayRef, moment: 'after'});
    expect(engagePageOf(todayRef, source, new Date(2026, 10, 5).getTime())).toBeNull();
    expect(engagePageOf(null, source, at(9))).toBeNull();
  });
});
