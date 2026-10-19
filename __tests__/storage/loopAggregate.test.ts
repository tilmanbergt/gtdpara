// docs/dev/history/technical-design-engage-in-context.md §2.2: the loop overview counts a todo agreed in a running loop meeting.
import {deriveMeetingFields} from '../../src/domain/markdown';
import {meetingKey} from '../../src/domain/provenance';
import {emptyTaskFields} from '../../src/domain/taskLine';
import {Meeting, Task} from '../../src/domain/types';
import {buildLoopOverview} from '../../src/storage/loopAggregate';
import {item, meeting, task} from '../../test-helpers/fixtures';

// Thursday 2026-10-08, 10:30: the loop meeting runs from 10:00 to 11:00.
const NOW = new Date(2026, 9, 8, 10, 30, 0);
const m = (date: string, title: string, extra: Partial<Meeting> = {}): Meeting => meeting(date, title, {...deriveMeetingFields(title), ...extra});
const agreedIn = (text: string, mt: Meeting): Task => task(text, {fields: {...emptyTaskFields(), meeting: meetingKey(mt)}});

const past = m('2026-10-01', 'Kickoff #workshop/offsite', {time: '10:00', endTime: '11:00'});
const running = m('2026-10-08', 'Planning #workshop/offsite', {time: '10:00', endTime: '11:00'});
const coaching = item('area', 'Coaching', {
  meetings: [past, running],
  tasks: [
    agreedIn('From the kickoff', past),
    agreedIn('From the running meeting', running),
    task('Tagged #workshop/offsite'),
    task('Leaf only #offsite'),
  ],
});
const texts = (entries: Array<{task: Task}>) => entries.map(e => e.task.text);

describe('buildLoopOverview - membership', () => {
  const o = buildLoopOverview([coaching], 'workshop/offsite', coaching.path, ['workshop'], NOW)!;

  it('counts todos agreed in a past or a running loop meeting as I owe', () => {
    expect(texts(o.lists.ahead.owe)).toEqual(['From the kickoff', 'From the running meeting']);
  });

  it('counts tagged todos, never a leaf-only one', () => {
    expect(texts(o.lists.ahead.relevant)).toEqual(['Tagged #workshop/offsite']);
  });

  it('lists the running meeting ahead, not in Looking back', () => {
    expect(o.lists.ahead.meetings.map(e => e.meeting.title)).toEqual(['Planning #workshop/offsite']);
    expect(o.lists.past.map(p => p.entry.meeting.title)).toEqual(['Kickoff #workshop/offsite']);
  });
});
