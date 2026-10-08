// docs/dev/history/technical-design-tending-threads.md §3.3: the thread overview's lists, counts and ages.
import {deriveMeetingFields} from '../../src/domain/markdown';
import {meetingKey} from '../../src/domain/provenance';
import {emptyTaskFields} from '../../src/domain/taskLine';
import {Meeting, Task} from '../../src/domain/types';
import {buildThreadOverview} from '../../src/storage/threadAggregate';
import {item, meeting, task} from '../../test-helpers/fixtures';

// Thursday 2026-10-08, 12:00 local time.
const NOW = new Date(2026, 9, 8, 12, 0, 0);
const INBOX = '/Note/2 Areas/0 Inbox';

function m(date: string, title: string, extra: Partial<Meeting> = {}): Meeting {
  return meeting(date, title, {...deriveMeetingFields(title), ...extra});
}
function agreedIn(text: string, mt: Meeting, extra: Partial<Task> = {}, created: string | null = null): Task {
  return task(text, {fields: {...emptyTaskFields(), meeting: meetingKey(mt), created}, ...extra});
}

const retro1 = m('2026-09-23', 'Retro #retro/alpha', {time: '10:00', endTime: '11:00'});
const retro2 = m('2026-09-30', 'Retro #retro/alpha', {time: '10:00', endTime: '11:00'});
const retroToday = m('2026-10-08', 'Retro #retro/alpha', {time: '15:00', endTime: '16:00'});
const review = m('2026-10-01', 'Review #review/alpha');
const otherRetro = m('2026-10-02', 'Retro #retro/beta');

const coaching = item('area', 'Coaching', {
  meetings: [retro1, retro2, retroToday, review, otherRetro, m('2026-10-20', 'Retro #retro/alpha', {cancelled: true})],
  tasks: [
    task('Draft agenda #retro/alpha'),
    task('Ask about budget #alpha #someday'),
    task('Plain parent #retro'),
    task('Other thread #review/alpha'),
    task('Signed offer #wf/alpha'),
    task('Feedback form #retro/alpha #wf'),
    task('Unrelated #wf/beta'),
    agreedIn('Send minutes #retro/alpha', retro2, {}, '2026-10-01'),
    agreedIn('Book room #retro/alpha', retro2, {done: true}),
    agreedIn('Old point #retro/alpha', retro1),
    agreedIn('Dropped #retro/alpha', retro2, {cancelled: true}),
  ],
});
const tender = item('project', 'Tender', {area: 'Coaching', tasks: [task('Prepare slides #retro/alpha/2026')]});
const elsewhere = item('area', 'Health', {
  tasks: [task('Elsewhere #retro/alpha')],
  meetings: [m('2026-10-15', 'Retro #retro/alpha')],
});
const items = [coaching, tender, elsewhere];
const inbox = {path: INBOX, tasks: [task('Inbox thing #retro/alpha')], meetings: []};

const texts = (entries: Array<{task: Task}>) => entries.map(e => e.task.text);

describe('buildThreadOverview - thread lens', () => {
  const o = buildThreadOverview(items, inbox, 'retro/alpha', 'thread', coaching.path, NOW)!;

  it('is scoped to the owner Area and its Projects', () => {
    expect(o.scope.sort()).toEqual([coaching.path, tender.path].sort());
    expect(o.owner).toMatchObject({kind: 'area', name: 'Coaching'});
  });

  it('lists the meetings ahead, not cancelled, soonest first, today until it is over', () => {
    expect(o.ahead.meetings.map(e => e.meeting.date)).toEqual(['2026-10-08']);
  });

  it('lists what I owe: the thread, deeper tags and the plain leaf, never the plain parent', () => {
    expect(texts(o.ahead.owe)).toEqual([
      'Draft agenda #retro/alpha',
      'Ask about budget #alpha #someday',
      'Send minutes #retro/alpha',
      'Old point #retro/alpha',
      'Prepare slides #retro/alpha/2026',
    ]);
  });

  it('lists Waiting For of the counterpart or the thread', () => {
    expect(texts(o.ahead.waiting)).toEqual(['Signed offer #wf/alpha', 'Feedback form #retro/alpha #wf']);
  });

  it('lists past meetings newest first with agreed todos, counts and ages', () => {
    expect(o.past.map(p => p.entry.meeting.date)).toEqual(['2026-09-30', '2026-09-23']);
    const [last, first] = o.past;
    expect(texts(last.agreed)).toEqual(['Send minutes #retro/alpha', 'Book room #retro/alpha']);
    expect(last.counts).toEqual({agreed: 2, done: 1, open: 1, oldestOpenDays: 7});
    expect(first.counts).toEqual({agreed: 1, done: 0, open: 1, oldestOpenDays: 15});
    expect(last.entry.meetingIndex).toBe(1);
  });

  it('carries full-array indexes for every entry', () => {
    const entry = o.ahead.owe.find(e => e.task.text === 'Send minutes #retro/alpha')!;
    expect(coaching.tasks[entry.taskIndex].text).toBe('Send minutes #retro/alpha');
  });
});

describe('buildThreadOverview - counterpart lens', () => {
  const o = buildThreadOverview(items, inbox, 'retro/alpha', 'counterpart', tender.path, NOW)!;

  it('widens the owner Project to its Area', () => {
    expect(o.scope.sort()).toEqual([coaching.path, tender.path].sort());
  });

  it('uses every type of the counterpart in the scope', () => {
    expect(o.types).toEqual(['retro', 'review', 'wf']);
    expect(o.past.map(p => p.entry.meeting.title)).toEqual(['Review #review/alpha', 'Retro #retro/alpha', 'Retro #retro/alpha']);
    expect(texts(o.ahead.owe)).toContain('Other thread #review/alpha');
    expect(texts(o.ahead.owe)).not.toContain('Plain parent #retro');
  });
});

describe('buildThreadOverview - owner', () => {
  it('keeps the Inbox on its own', () => {
    const o = buildThreadOverview(items, inbox, 'retro/alpha', 'thread', INBOX, NOW)!;
    expect(o.scope).toEqual([INBOX]);
    expect(texts(o.ahead.owe)).toEqual(['Inbox thing #retro/alpha']);
    expect(o.owner).toMatchObject({kind: 'inbox'});
  });

  it('falls back to the item with the latest meeting of the thread', () => {
    const o = buildThreadOverview(items, inbox, 'retro/alpha', 'thread', null, NOW)!;
    expect(o.owner?.path).toBe(elsewhere.path);
    expect(texts(o.ahead.owe)).toEqual(['Elsewhere #retro/alpha']);
  });

  it('is null for a plain tag', () => {
    expect(buildThreadOverview(items, inbox, 'retro', 'thread', coaching.path, NOW)).toBeNull();
  });
});
