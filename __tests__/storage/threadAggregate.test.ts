// docs/dev/history/technical-design-tending-threads.md §1.2.1, §3.3: the thread overview's lists, classification, counts and ages.
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
function agreedIn(text: string, mt: Meeting, extra: Partial<Task> = {}, created: string | null = null, completion: string | null = null): Task {
  return task(text, {fields: {...emptyTaskFields(), meeting: meetingKey(mt), created, completion}, ...extra});
}
function doneOn(text: string, completion: string | null): Task {
  return task(text, {done: true, fields: {...emptyTaskFields(), completion}});
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

  it('lists what I owe: the todos agreed in the thread\'s meetings', () => {
    expect(texts(o.ahead.owe)).toEqual(['Send minutes #retro/alpha', 'Old point #retro/alpha']);
  });

  it('lists as relevant the thread, deeper tags and the plain leaf, never the plain parent', () => {
    expect(texts(o.ahead.relevant)).toEqual([
      'Draft agenda #retro/alpha',
      'Ask about budget #alpha #someday',
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
    expect(texts(o.ahead.relevant)).toContain('Other thread #review/alpha');
    expect(texts(o.ahead.relevant)).not.toContain('Plain parent #retro');
  });
});

describe('buildThreadOverview - owner', () => {
  it('keeps the Inbox on its own', () => {
    const o = buildThreadOverview(items, inbox, 'retro/alpha', 'thread', INBOX, NOW)!;
    expect(o.scope).toEqual([INBOX]);
    expect(texts(o.ahead.relevant)).toEqual(['Inbox thing #retro/alpha']);
    expect(o.owner).toMatchObject({kind: 'inbox'});
  });

  it('falls back to the item with the latest meeting of the thread', () => {
    const o = buildThreadOverview(items, inbox, 'retro/alpha', 'thread', null, NOW)!;
    expect(o.owner?.path).toBe(elsewhere.path);
    expect(texts(o.ahead.relevant)).toEqual(['Elsewhere #retro/alpha']);
  });

  it('is null for a plain tag', () => {
    expect(buildThreadOverview(items, inbox, 'retro', 'thread', coaching.path, NOW)).toBeNull();
  });
});

describe('buildThreadOverview - how a todo relates to a thread (§1.2.1)', () => {
  // Agreed in the 1:1 with Mieke, to be raised with Sven.
  const mieke1 = m('2026-09-30', '1:1 Mieke #101/mieke', {time: '09:00', endTime: '09:30'});
  const mieke2 = m('2026-10-06', '1:1 Mieke #101/mieke', {time: '09:00', endTime: '09:30'});
  const sven = m('2026-10-01', '1:1 Sven #101/sven', {time: '09:00', endTime: '09:30'});
  const team = item('area', 'Team', {
    meetings: [mieke1, mieke2, sven],
    tasks: [
      agreedIn('Raise budget question #101/sven', mieke1),
      agreedIn('Agreed only', mieke2),
      agreedIn('Agreed and tagged #101/mieke', mieke2),
      task('Tagged only #101/mieke'),
      task('Leaf only #mieke #next'),
      task('Promised #owe/mieke #next'),
      task('Promised someday #owe/mieke #someday'),
      task('Bare owe #owe #101/sven'),
      task('Contract #wf/mieke'),
      agreedIn('Her feedback #wf', mieke2),
      task('Her slides #wf #101/mieke'),
      agreedIn('Sven\'s numbers #wf/sven', mieke2),
      task('Untagged bare wf #wf'),
      task('Bare wf with a promise #wf #owe/mieke'),
      task('Cancelled #owe/mieke', {cancelled: true}),
      // Done: since the latest past meeting (6.10.) or before, and one ticked before completion dates.
      {...agreedIn('Done agreed', mieke1, {done: true}, null, '2026-10-07')},
      doneOn('Done tagged #101/mieke', '2026-10-06'),
      doneOn('Done before #101/mieke', '2026-10-05'),
      doneOn('Done without date #101/mieke', null),
      doneOn('Done elsewhere #101/sven', '2026-10-07'),
    ],
  });
  const inboxAgreed = {path: INBOX, tasks: [agreedIn('Still in the Inbox', mieke2)], meetings: []};
  const overview = (tag: string, lens: 'thread' | 'counterpart' = 'thread') =>
    buildThreadOverview([team], inboxAgreed, tag, lens, team.path, NOW)!;
  const mieke = overview('101/mieke');

  it('agreed only, or agreed and tagged with the same thread: I owe, once', () => {
    expect(texts(mieke.ahead.owe)).toContain('Agreed only');
    expect(texts(mieke.ahead.owe)).toContain('Agreed and tagged #101/mieke');
    expect(texts(mieke.ahead.relevant)).not.toContain('Agreed and tagged #101/mieke');
  });

  it('agreed with Mieke and tagged #101/sven: I owe for Mieke, Relevant for Sven', () => {
    const svens = overview('101/sven');
    expect(texts(mieke.ahead.owe)).toContain('Raise budget question #101/sven');
    expect(texts(mieke.ahead.relevant)).not.toContain('Raise budget question #101/sven');
    expect(texts(svens.ahead.relevant)).toContain('Raise budget question #101/sven');
    expect(texts(svens.ahead.owe)).not.toContain('Raise budget question #101/sven');
    // And under Mieke's meeting of 30.9. in Looking back.
    const sept30 = mieke.past.find(p => p.entry.meeting.date === '2026-09-30')!;
    expect(texts(sept30.agreed)).toContain('Raise budget question #101/sven');
  });

  it('#owe/<counterpart> only: I owe, with #next or #someday; a bare #owe means nothing', () => {
    expect(texts(mieke.ahead.owe)).toEqual(
      expect.arrayContaining(['Promised #owe/mieke #next', 'Promised someday #owe/mieke #someday']),
    );
    expect(texts(mieke.ahead.owe)).not.toContain('Cancelled #owe/mieke');
    const svens = overview('101/sven');
    expect(texts(svens.ahead.relevant)).toContain('Bare owe #owe #101/sven');
    expect(texts(svens.ahead.owe)).not.toContain('Bare owe #owe #101/sven');
  });

  it('the thread tag or the plain leaf only: Relevant', () => {
    expect(texts(mieke.ahead.relevant)).toEqual(['Tagged only #101/mieke', 'Leaf only #mieke #next']);
  });

  it('Waiting for: #wf/<counterpart>, or bare #wf when agreed in the thread or tagged with it', () => {
    expect(texts(mieke.ahead.waiting)).toEqual(['Contract #wf/mieke', 'Her feedback #wf', 'Her slides #wf #101/mieke']);
    // Waiting on Sven, agreed with Mieke: Waiting for in Sven's thread; for Mieke it is a commitment made to her.
    expect(texts(overview('101/sven').ahead.waiting)).toContain("Sven's numbers #wf/sven");
    expect(texts(mieke.ahead.owe)).toContain("Sven's numbers #wf/sven");
    const all = [...mieke.ahead.waiting, ...mieke.ahead.owe, ...mieke.ahead.relevant];
    expect(texts(all)).not.toContain('Untagged bare wf #wf');
    // #owe/<cp> is not a tag of the lens: bare #wf with it stays a promise, in both lenses.
    expect(texts(mieke.ahead.owe)).toContain('Bare wf with a promise #wf #owe/mieke');
    expect(texts(overview('101/mieke', 'counterpart').ahead.owe)).toContain('Bare wf with a promise #wf #owe/mieke');
  });

  it('shows every todo once', () => {
    const all = texts([...mieke.ahead.waiting, ...mieke.ahead.owe, ...mieke.ahead.relevant]);
    expect(new Set(all).size).toBe(all.length);
  });

  it('counts an agreed todo where it is filed: not while it is in the Inbox (D15)', () => {
    expect(texts(mieke.ahead.owe)).not.toContain('Still in the Inbox');
  });

  it('the counterpart lens collects every thread of the counterpart', () => {
    const allMieke = overview('101/mieke', 'counterpart');
    expect(texts(allMieke.ahead.owe)).toContain('Agreed only');
    expect(texts(allMieke.ahead.waiting)).toContain('Contract #wf/mieke');
    expect(texts(allMieke.ahead.relevant)).toEqual(['Tagged only #101/mieke', 'Leaf only #mieke #next']);
  });

  it('#wf/<name> and #owe/<name> open the counterpart lens', () => {
    for (const tag of ['wf/mieke', 'owe/mieke']) {
      const o = overview(tag, 'thread');
      expect(o.lens).toBe('counterpart');
      expect(texts(o.ahead.owe)).toContain('Agreed only');
      expect(texts(o.ahead.waiting)).toContain('Contract #wf/mieke');
      expect(o.past.map(p => p.entry.meeting.date)).toEqual(['2026-10-06', '2026-09-30']);
    }
  });

  it('Since: todos done on or after the latest past meeting, in any of the three ways', () => {
    expect(mieke.since.from).toBe('2026-10-06');
    expect(texts(mieke.since.done)).toEqual(['Done agreed', 'Done tagged #101/mieke']);
  });

  it('Since: no row without a past meeting', () => {
    const fresh = item('area', 'Fresh', {
      meetings: [m('2026-10-20', '1:1 #101/kai')],
      tasks: [doneOn('Done #101/kai', '2026-10-07')],
    });
    const o = buildThreadOverview([fresh], null, '101/kai', 'thread', fresh.path, NOW)!;
    expect(o.since).toEqual({from: null, done: []});
  });
});
