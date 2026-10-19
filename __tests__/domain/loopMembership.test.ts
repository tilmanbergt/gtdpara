// docs/dev/history/technical-design-engage-in-context.md §2.2 (E2): one rule for a loop's todos.
import {deriveMeetingFields} from '../../src/domain/markdown';
import {isLoopMember, loopRelation} from '../../src/domain/loops';
import {meetingKey} from '../../src/domain/provenance';
import {emptyTaskFields} from '../../src/domain/taskLine';
import {Meeting, Task} from '../../src/domain/types';
import {meeting, task} from '../../test-helpers/fixtures';

const m = (date: string, title: string, extra: Partial<Meeting> = {}): Meeting => meeting(date, title, {...deriveMeetingFields(title), ...extra});
const agreedIn = (text: string, mt: Meeting): Task => task(text, {fields: {...emptyTaskFields(), meeting: meetingKey(mt)}});

const past = m('2026-10-01', 'Kickoff #workshop/offsite', {time: '10:00', endTime: '11:00'});
const ahead = m('2026-10-20', 'Dry run #workshop/offsite', {time: '10:00', endTime: '11:00'});
const cancelled = m('2026-10-05', 'Prep #workshop/offsite', {cancelled: true});
const other = m('2026-10-02', 'Sparring #sparring/mieke');
const item = {path: '/Note/2 Areas/Coaching', meetings: [past, ahead, cancelled, other]};
const LOOP = 'workshop/offsite';

describe('loopRelation', () => {
  it('agreed in a past or an ahead meeting of the loop', () => {
    expect(loopRelation(item, LOOP, agreedIn('Book venue', past))).toBe('agreed');
    expect(loopRelation(item, LOOP, agreedIn('Print handouts', ahead))).toBe('agreed');
  });

  it('agreed wins over tagged', () => {
    expect(loopRelation(item, LOOP, {...agreedIn('Both #workshop/offsite', past), tags: ['workshop/offsite']})).toBe('agreed');
  });

  it('tagged with the loop or deeper', () => {
    expect(loopRelation(item, LOOP, task('Agenda #workshop/offsite'))).toBe('tagged');
    expect(loopRelation(item, LOOP, task('Day 2 #workshop/offsite/day2'))).toBe('tagged');
  });

  it('not: a leaf only, another meeting, a cancelled loop meeting, another loop', () => {
    expect(loopRelation(item, LOOP, task('Leaf #offsite'))).toBeNull();
    expect(loopRelation(item, LOOP, agreedIn('From sparring', other))).toBeNull();
    expect(loopRelation(item, LOOP, agreedIn('From cancelled', cancelled))).toBeNull();
    expect(loopRelation(item, LOOP, task('Other #workshop/retreat'))).toBeNull();
    expect(isLoopMember(item, LOOP, task('Leaf #offsite'))).toBe(false);
    expect(isLoopMember(item, LOOP, agreedIn('Book venue', past))).toBe(true);
  });
});
