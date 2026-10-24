// docs/dev/history/technical-design-engage-in-context.md §2.4, §2.5, §5: Engage holds what the overviews hold,
// "I owe" first, the Agreed tab, "Also here", and the meeting lines.
import {EngageSource, ownerMeetings, ownerOfTodo, ownerTodos, threadOfTodo} from '../../src/domain/engageOwner';
import {focusOwnerLines, optionsOf, todayNextMeeting} from '../../src/domain/engageOptions';
import {LoopLine} from '../../src/domain/loopsSection';
import {deriveMeetingFields} from '../../src/domain/markdown';
import {meetingKey} from '../../src/domain/provenance';
import {emptyTaskFields} from '../../src/domain/taskLine';
import {CounterpartLine} from '../../src/domain/threadsSection';
import {Meeting, Task} from '../../src/domain/types';
import {item, meeting, task} from '../../test-helpers/fixtures';

// Thursday 2026-10-08, 12:00 local time.
const NOW = new Date(2026, 9, 8, 12, 0, 0).getTime();
const INBOX = '/Note/2 Areas/0 Inbox';

const m = (date: string, title: string, extra: Partial<Meeting> = {}): Meeting => meeting(date, title, {...deriveMeetingFields(title), ...extra});
const agreedIn = (text: string, mt: Meeting, extra: Partial<Task> = {}): Task => task(text, {fields: {...emptyTaskFields(), meeting: meetingKey(mt)}, ...extra});
const loopLine = (tag: string): LoopLine => ({tag, status: 'active', mainDate: null, linkedFile: null, extraColumns: [], raw: null});
const texts = (refs: Array<{task: Task}>) => refs.map(r => r.task.text);

const spar1 = m('2026-09-30', 'Sparring Mieke #sparring/mieke', {time: '10:00', endTime: '11:00'});
const spar2 = m('2026-10-06', 'Sparring Mieke #sparring/mieke', {time: '10:00', endTime: '11:00'});
const sparNext = m('2026-10-23', 'Sparring Mieke #sparring/mieke', {time: '10:00', endTime: '11:00'});
const loopPast = m('2026-10-01', 'Kickoff #proj/offsite', {time: '09:00', endTime: '10:00'});
const loopRunning = m('2026-10-08', 'Planning #proj/offsite', {time: '11:30', endTime: '12:30'});

const coaching = item('area', 'Coaching', {
  meetings: [spar1, spar2, sparNext, loopPast, loopRunning, m('2026-10-08', 'Retro demand', {time: '14:00', endTime: '15:00'})],
  loops: [loopLine('proj/offsite')],
  threads: [{leaf: 'mieke', status: 'active'} as CounterpartLine],
  tasks: [
    task('Read article #mieke #next'), // 0 leaf, relevant
    agreedIn('Book follow-up #next', spar2), // 1 agreed, owe
    task('Tagged plan #sparring/mieke'), // 2 tagged, relevant
    agreedIn('Draft feedback', spar2), // 3 agreed plan, owe
    task('Promise #owe/mieke'), // 4 owe
    task('Org chart #wf/mieke'), // 5 waiting
    agreedIn('Parked #someday', spar2), // 6 someday
    task('Other person #sparring/sven #next'), // 7 not Mieke's
    agreedIn('Old agreement', spar1), // 8 agreed in the earlier meeting
    task('Venue #proj/offsite'), // 9 loop tagged
    agreedIn('Catering', loopPast), // 10 loop, agreed in a past meeting
    agreedIn('Name tags', loopRunning), // 11 loop, agreed in the running meeting
    task('Leaf only #offsite'), // 12 not the loop's
    task('Maybe later #maybe #mieke'), // 13 maybe
    task('Loose #next'), // 14 item's
  ],
});
const website = item('project', 'Website', {area: 'Coaching', tasks: [task('Check copy #sparring/mieke #next')]});
const inboxMeeting = m('2026-10-08', 'Dentist', {time: '13:00', endTime: '13:30'});
const source: EngageSource = {
  items: [coaching, website],
  inbox: {path: INBOX, tasks: [task('Inbox thing #sparring/mieke')], meetings: [inboxMeeting]},
  loopKinds: ['proj'],
  threadTypes: ['sparring'],
};
const mieke = {kind: 'thread' as const, scopeOwnerPath: coaching.path, tag: 'sparring/mieke'};
const offsite = {kind: 'loop' as const, itemPath: coaching.path, tag: 'proj/offsite'};
const area = {kind: 'item' as const, itemPath: coaching.path};

describe('ownerTodos - thread (E1)', () => {
  const refs = ownerTodos(mieke, source);

  it('holds the overview\'s thread lens: tagged, leaf, agreed, #owe/<cp>, #wf/<cp>', () => {
    expect(texts(refs)).toEqual(
      expect.arrayContaining(['Read article #mieke #next', 'Book follow-up #next', 'Tagged plan #sparring/mieke', 'Promise #owe/mieke', 'Org chart #wf/mieke', 'Check copy #sparring/mieke #next']),
    );
    const byText = (t: string) => refs.find(r => r.task.text === t)!;
    expect(byText('Book follow-up #next').relation).toBe('owe');
    expect(byText('Book follow-up #next').agreedIn).toEqual({itemPath: coaching.path, meetingIndex: 1});
    expect(byText('Promise #owe/mieke').relation).toBe('owe');
    expect(byText('Org chart #wf/mieke').relation).toBe('waiting');
    expect(byText('Read article #mieke #next').relation).toBe('relevant');
  });

  it('leaves out another counterpart and the Inbox (not the owner)', () => {
    expect(texts(refs)).not.toContain('Other person #sparring/sven #next');
    expect(texts(refs)).not.toContain('Inbox thing #sparring/mieke');
  });

  it('lists leaf-tagged meetings of the lens', () => {
    expect(ownerMeetings(mieke, source).map(e => e.meeting.date)).toEqual(['2026-09-30', '2026-10-06', '2026-10-23']);
  });
});

describe('ownerTodos - loop (E2) and item (E3)', () => {
  it('a loop: tagged, agreed in a past or a running meeting; never a leaf-only todo', () => {
    expect(texts(ownerTodos(offsite, source))).toEqual(['Venue #proj/offsite', 'Catering', 'Name tags']);
    expect(ownerTodos(offsite, source).map(r => r.relation)).toEqual(['relevant', 'owe', 'owe']);
  });

  it('the Area leaves out all three loop members', () => {
    const own = texts(ownerTodos(area, source));
    expect(own).not.toContain('Venue #proj/offsite');
    expect(own).not.toContain('Catering');
    expect(own).not.toContain('Name tags');
    expect(own).toContain('Leaf only #offsite');
  });
});

describe('optionsOf - order (E5)', () => {
  it('a thread: I owe before relevant in Next and Plan, file order inside', () => {
    const o = optionsOf(mieke, source, NOW);
    expect(texts(o.next)).toEqual(['Book follow-up #next', 'Read article #mieke #next', 'Check copy #sparring/mieke #next']);
    expect(texts(o.plan)).toEqual(['Draft feedback', 'Promise #owe/mieke', 'Old agreement', 'Tagged plan #sparring/mieke']);
  });

  it('an Area keeps file order', () => {
    expect(texts(optionsOf(area, source, NOW).next)).toEqual([
      'Read article #mieke #next',
      'Book follow-up #next',
      'Other person #sparring/sven #next',
      'Loose #next',
    ]);
  });
});

describe('optionsOf - Also here (E7) and Next here (E8)', () => {
  it('counts someday + maybe together; waiting has its own tab', () => {
    expect(optionsOf(mieke, source, NOW).alsoHere).toEqual({someday: 2});
    expect(texts(optionsOf(mieke, source, NOW).waiting)).toEqual(['Org chart #wf/mieke']);
  });

  it('the owner\'s next meeting that is not over, any date; a running one counts until its end', () => {
    expect(optionsOf(mieke, source, NOW).nextMeeting?.meeting).toBe(sparNext);
    expect(optionsOf(offsite, source, NOW).nextMeeting?.meeting).toBe(loopRunning);
    expect(optionsOf(offsite, source, new Date(2026, 9, 8, 12, 31).getTime()).nextMeeting).toBeNull();
  });
});

describe('todayNextMeeting (E9)', () => {
  it('the earliest timed meeting today that is not over, the Inbox included', () => {
    expect(todayNextMeeting(source, NOW)?.meeting).toBe(loopRunning);
    expect(todayNextMeeting(source, new Date(2026, 9, 8, 12, 45).getTime())?.meeting).toBe(inboxMeeting);
    expect(todayNextMeeting(source, new Date(2026, 9, 8, 13, 45).getTime())?.meeting.title).toBe('Retro demand');
  });

  it('leaves out cancelled, over, untimed and other-day meetings', () => {
    const only = (meetings: Meeting[]): EngageSource => ({...source, items: [{...coaching, meetings}], inbox: null});
    expect(todayNextMeeting(only([m('2026-10-08', 'Off', {time: '15:00', cancelled: true})]), NOW)).toBeNull();
    expect(todayNextMeeting(only([m('2026-10-08', 'Over', {time: '09:00', endTime: '10:00'})]), NOW)).toBeNull();
    expect(todayNextMeeting(only([m('2026-10-08', 'All day')]), NOW)).toBeNull();
    expect(todayNextMeeting(only([m('2026-10-09', 'Tomorrow', {time: '09:00'})]), NOW)).toBeNull();
  });
});

describe('ownerOfTodo (E4)', () => {
  it('loop > own thread tag > the thread of the meeting it was agreed in > item', () => {
    const of = (index: number) => ownerOfTodo({itemPath: coaching.path, task: coaching.tasks[index]}, source);
    expect(of(11)).toEqual(offsite);
    expect(of(2)).toEqual(mieke);
    expect(of(3)).toEqual(mieke);
    expect(of(14)).toEqual(area);
    // A plain leaf names no thread of its own.
    expect(of(0)).toEqual(area);
  });

  it('a Project\'s todo is in its Area\'s thread', () => {
    expect(threadOfTodo(website.path, website.tasks[0], source)).toEqual(mieke);
  });
});

describe('focusOwnerLines - a thread with only agreed todos gets its line', () => {
  it('lists the tended thread from an agreed todo', () => {
    const agreedOnly = item('area', 'Coaching', {
      dailyFocus: true,
      meetings: [spar2],
      threads: [{leaf: 'mieke', status: 'active'} as CounterpartLine],
      tasks: [agreedIn('Book follow-up #next', spar2)],
    });
    const lines = focusOwnerLines('daily', null, {...source, items: [agreedOnly]}, NOW);
    expect(lines.map(l => l.owner)).toEqual([mieke, {kind: 'item', itemPath: agreedOnly.path}]);
  });
});
