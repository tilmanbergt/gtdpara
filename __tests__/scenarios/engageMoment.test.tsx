import {meetingKey} from '../../src/domain/provenance';
import {resetMomentChoices} from '../../src/ui/meetingMomentStore';
import {describeScreen, expectNotShows, expectShows, fieldValue, labelled, openEngage, tap, type} from '../../test-helpers/scenario/app';
import {areaDir, areaFile, dataFile, INBOX_FILE, putFile, sectionLines} from '../../test-helpers/scenario/files';
import {and, given, scenario, then, when} from '../../test-helpers/scenario/scenario';
import {sparringSettings} from '../../test-helpers/scenario/setups';
import {device} from '../../test-helpers/fakeDevice/device';

// The design's demo-like data (docs/dev/history/technical-design-meetings-0.21.md §11), on a fixed day:
// the clock is set per scenario, so Before, During and After hold whenever the suite runs.
const TODAY = '2026-10-24';
const EARLIER = '2026-10-14';
const NOTEBOOK_REL = 'Meetings/sparring mieke 2026.note';
const NOTEBOOK = `${areaDir('Coaching')}/${NOTEBOOK_REL}`;
const kw = (date: string) => `${date} Sparring Mieke #sparring/mieke`;
const sparring = (date: string, extra = '') => `- ${date} 10:00-11:00 Sparring Mieke #sparring/mieke${extra} → [[${NOTEBOOK_REL}#${kw(date)}]]`;
const KEY_EARLIER = meetingKey({date: EARLIER, title: 'Sparring Mieke #sparring/mieke'});
const KEY_TODAY = meetingKey({date: TODAY, title: 'Sparring Mieke #sparring/mieke'});

/** Only the clock is faked: timers stay real, so the app's settling works as everywhere else. */
function clock(hour: number, minute = 0, day = 24): void {
  jest.useFakeTimers({
    now: new Date(2026, 9, day, hour, minute),
    doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'hrtime', 'performance'],
  });
}

beforeEach(() => resetMomentChoices());
afterEach(() => jest.useRealTimers());

/** Area "Coaching" with the two sparring sessions, the todos agreed on 14.10., and `extra` lines. */
function coaching(extra: {tasks?: string[]; meetings?: string[]; agreements?: string[]} = {}): void {
  putFile(
    areaFile('Coaching'),
    dataFile(
      'area',
      {
        Scope: [],
        Tasks: [
          `- [ ] Draft feedback [meeting:: ${KEY_EARLIER}]`,
          `- [ ] Org chart from Mieke #wf/mieke [meeting:: ${KEY_EARLIER}]`,
          `- [x] Send role canvas [meeting:: ${KEY_EARLIER}] [completion:: 2026-10-20]`,
          ...(extra.tasks ?? []),
        ],
        Meetings: [sparring(EARLIER), sparring(TODAY), ...(extra.meetings ?? [])],
        Threads: ['- mieke: active'],
        ...(extra.agreements ? {Agreements: extra.agreements} : {}),
      },
      ['abbrev: Co'],
    ),
  );
  device().sdk.putNote(NOTEBOOK, [{keywords: [EARLIER, kw(EARLIER)]}, {keywords: [TODAY, kw(TODAY)]}]);
}

/** Engage on today's meeting page. */
const engageOnToday = () => openEngage({fromNote: NOTEBOOK, page: 1, settings: sparringSettings()});

scenario('Engage before the meeting: Before is chosen, the strip offers prep and the last note, From Thread shows the last session', {feature: 'Engage', design: 'technical-design-meetings-0.21.md'}, () => {
  given('it is 09:30 and today\'s sparring with Mieke is at 10:00; on 14.10. "Draft feedback" and "Org chart from Mieke" were agreed and "Send role canvas" is done', () => {
    clock(9, 30);
    coaching();
  });
  when('I open Engage on today\'s meeting page', engageOnToday);
  then('the meeting line shows the meeting with Before chosen', () => {
    expectShows('Sparring Mieke · today 10:00–11:00');
    expect(labelled('Before')?.on).toBe(true);
    expect(labelled('During')?.on).toBe(false);
  });
  and('the strip offers Mark prepped and Note from last meeting ›', () => {
    expectShows('Mark prepped');
    expectShows('Note from last meeting ›');
  });
  and('From Thread is open with the group of 14.10.: the two agreed todos, the done one struck last', () => {
    expectShows('From Thread 3');
    expectShows('Wed 14.10. · Sparring Mieke');
    // A row draws its title and labels as one text: match the title at its start.
    expectShows(/^Draft feedback/);
    expectShows(/^Org chart from Mieke/);
    expectShows(/^Send role canvas/);
  });
  and('"Next here" does not repeat today\'s meeting', () => expectNotShows(/^Next here: /));
  when('I tap Mark prepped', () => tap('Mark prepped'));
  then('today\'s meeting line in area.txt carries #prepped and the button is gone', () => {
    expect(sectionLines(areaFile('Coaching'), 'Meetings')[1]).toBe(sparring(TODAY, ' #prepped'));
    expectNotShows('Mark prepped');
  });
});

scenario('During the meeting: a todo and an agreement carry the meeting and the thread tag', {feature: 'Engage', design: 'technical-design-meetings-0.21.md'}, () => {
  given('it is 10:20, during today\'s sparring', () => {
    clock(10, 20);
    coaching();
  });
  when('I open Engage on the meeting page, open Quick Add and add "Book follow-up with HR"', async () => {
    await engageOnToday();
    expect(labelled('During')?.on).toBe(true);
    await tap('+ Quick Add');
    expectShows(/^↳ from Sparring Mieke/);
    expectShows('#sparring/mieke');
    await type('New task', 'Book follow-up with HR');
    await tap('+ Add');
  });
  then('the todo records the meeting and has the thread tag', () => {
    expect(sectionLines(areaFile('Coaching'), 'Tasks')).toContain(`- [ ] Book follow-up with HR #sparring/mieke [meeting:: ${KEY_TODAY}] [created:: ${TODAY}]`);
  });
  and('From Thread shows today\'s group on top, with it', () => {
    const all = describeScreen();
    expect(all.indexOf('today · Sparring Mieke')).toBeGreaterThanOrEqual(0);
    expect(all.indexOf('today · Sparring Mieke')).toBeLessThan(all.indexOf('Wed 14.10. · Sparring Mieke'));
    expect(all).toContain('Book follow-up with HR');
  });
  when('at 10:30 I add on the Agreement tab "Feedback only in our 1:1s", valid till end of year', async () => {
    clock(10, 30);
    await tap('+ Quick Add');
    await tap('Agreement');
    await type('New agreement', 'Feedback only in our 1:1s');
    await tap('valid till');
    await tap('end of year');
    await tap('+ Add');
  });
  then('area.txt has it under ## Agreements with the meeting, today and the end of the year', () => {
    expect(sectionLines(areaFile('Coaching'), 'Agreements')).toEqual([
      `- Feedback only in our 1:1s #sparring/mieke [meeting:: ${KEY_TODAY}] [created:: ${TODAY}] [valid:: 2026-12-31]`,
    ]);
  });
  and('the Agreements tab lists it, and From Thread lists it in today\'s group', async () => {
    expectShows('Agreements 1');
    expectShows('◇');
    await tap('Agreements 1');
    expectShows('Feedback only in our 1:1s #sparring/mieke');
    expectShows('since 24.10. · till 31.12.');
  });
});

scenario('Ended early: After is chosen by hand and kept when Engage opens again; after the end it is After by time', {feature: 'Engage', design: 'technical-design-meetings-0.21.md'}, () => {
  given('it is 10:40, during today\'s sparring', () => {
    clock(10, 40);
    coaching();
  });
  when('I open Engage on the meeting page and tap After', async () => {
    await engageOnToday();
    expect(labelled('During')?.on).toBe(true);
    await tap('After');
  });
  then('the strip shows Reflect › and Mark reviewed', () => {
    expect(labelled('After')?.on).toBe(true);
    expectShows('Reflect ›');
    expectShows('Mark reviewed');
  });
  when('I close Engage and open it again on the page', engageOnToday);
  then('After is still chosen', () => expect(labelled('After')?.on).toBe(true));
  when('it is 11:01 and I open Engage again', async () => {
    resetMomentChoices();
    clock(11, 1);
    await engageOnToday();
  });
  then('the moment is After without a tap', () => expect(labelled('After')?.on).toBe(true));
});

scenario('Done rows follow the moment: Before the last session\'s, During both, After only today\'s', {feature: 'Engage', design: 'technical-design-meetings-0.21.md'}, () => {
  given('"Send role canvas" (from 14.10.) is done, and "Book follow-up" was agreed today and is done', () => {
    clock(9, 30);
    coaching({tasks: [`- [x] Book follow-up [meeting:: ${KEY_TODAY}] [completion:: ${TODAY}]`]});
  });
  when('I open Engage on the meeting page at 09:30', engageOnToday);
  then('only 14.10.\'s done row shows', () => {
    expectShows('Send role canvas');
    expectNotShows('Book follow-up');
  });
  when('I choose During', () => tap('During'));
  then('both show', () => {
    expectShows('Send role canvas');
    expectShows('Book follow-up');
  });
  when('I choose After', () => tap('After'));
  then('only today\'s shows', () => {
    expectShows('Book follow-up');
    expectNotShows('Send role canvas');
  });
});

scenario('The Waiting tab lists what I wait for from Mieke, where it was agreed, with Done', {feature: 'Engage', design: 'technical-design-meetings-0.21.md'}, () => {
  given('"Org chart from Mieke #wf/mieke" was agreed on 14.10. and "Budget numbers #wf/mieke" not in a meeting', () => {
    clock(12, 0);
    coaching({tasks: ['- [ ] Budget numbers #wf/mieke']});
  });
  when('I open Engage on the meeting page and choose Waiting', async () => {
    await engageOnToday();
    await tap('Waiting 2');
  });
  then('it lists both, the first "from 14.10."; "Also here" counts no waiting', () => {
    expectShows(/^Org chart from Mieke.*from 14\.10\./);
    expectShows(/^Budget numbers/);
    expectNotShows(/^Also here: .*waiting/);
  });
  when('I tap Done on the first', () => tap('Done', 0));
  then('it is ticked in the file', () => {
    expect(sectionLines(areaFile('Coaching'), 'Tasks')[1]).toMatch(/^- \[x\] Org chart from Mieke #wf\/mieke/);
  });
});

scenario('+ Next sparring only when no session follows today\'s', {feature: 'Engage', design: 'technical-design-meetings-0.21.md'}, () => {
  given('it is 10:20 during today\'s sparring, and no sparring with Mieke is planned after it', () => {
    clock(10, 20);
    coaching();
  });
  when('I open Engage on the meeting page', engageOnToday);
  then('the strip offers + Next sparring', () => expectShows('+ Next sparring'));
  when('I tap it', () => tap('+ Next sparring'));
  then('Quick Add\'s Meeting tab holds the next session, ten days on', () => {
    expect(fieldValue('New meeting title')).toBe('Sparring Mieke #sparring/mieke');
    expect(fieldValue('YYYY-MM-DD')).toBe('2026-11-03');
  });
});

scenario('No + Next when the next session is planned already', {feature: 'Engage', design: 'technical-design-meetings-0.21.md'}, () => {
  given('it is 10:20 during today\'s sparring, and a sparring is planned on 6.11.', () => {
    clock(10, 20);
    coaching({meetings: ['- 2026-11-06 10:00-11:00 Sparring Mieke #sparring/mieke']});
  });
  when('I open Engage on the meeting page', engageOnToday);
  then('there is no + Next', () => expectNotShows('+ Next sparring'));
});

scenario('Change an agreement from the Agreements tab: the old one ends, the new one is added', {feature: 'Engage', design: 'technical-design-meetings-0.21.md'}, () => {
  const line = `- Feedback only in our 1:1s #sparring/mieke [meeting:: ${KEY_TODAY}] [created:: ${TODAY}] [valid:: 2026-12-31]`;
  given('today\'s sparring made the agreement "Feedback only in our 1:1s"', () => {
    clock(10, 45);
    coaching({agreements: [line]});
  });
  when('I open Engage on the meeting page, tap the agreement on the Agreements tab and Change, then Cancel', async () => {
    await engageOnToday();
    await tap('Agreements 1');
    await tap('Feedback only in our 1:1s #sparring/mieke');
    await tap('Change');
    expectShows(/^↳ replaces 'Feedback only in our 1:1s'/);
    await tap('Cancel', 0);
  });
  then('the file is unchanged', () => expect(sectionLines(areaFile('Coaching'), 'Agreements')).toEqual([line]));
  when('I change it to "Feedback only in our 1:1s, except urgent" and add it', async () => {
    await tap('Agreements 1');
    await tap('Feedback only in our 1:1s #sparring/mieke');
    await tap('Change');
    await type('New agreement', 'Feedback only in our 1:1s, except urgent #sparring/mieke');
    await tap('+ Add');
  });
  then('the old line is ended today and the new one added with today as created', () => {
    expect(sectionLines(areaFile('Coaching'), 'Agreements')).toEqual([
      `${line} [ended:: ${TODAY}]`,
      `- Feedback only in our 1:1s, except urgent #sparring/mieke [meeting:: ${KEY_TODAY}] [created:: ${TODAY}] [valid:: 2026-12-31]`,
    ]);
  });
  and('the tab lists only the new one', async () => {
    await tap('Agreements 1');
    expectShows('Feedback only in our 1:1s, except urgent #sparring/mieke');
    expectNotShows('Feedback only in our 1:1s #sparring/mieke');
  });
});

scenario('On a todo\'s page, w/f Mieke turns #next into Waiting For, with Undo', {feature: 'Engage', design: 'technical-design-meetings-0.21.md'}, () => {
  const TODO_NOTE = `${areaDir('Coaching')}/Todos/Send Mieke the role canvas.note`;
  given('area "Coaching" has "Send Mieke the role canvas #next #sparring/mieke" with its own note', () => {
    clock(12, 0);
    coaching({tasks: ['- [ ] Send Mieke the role canvas #next #sparring/mieke → [[Todos/Send Mieke the role canvas.note]]']});
    device().sdk.putNote(TODO_NOTE, [{keywords: []}]);
  });
  when('I open Engage on the todo\'s note and tap w/f Mieke', async () => {
    await openEngage({fromNote: TODO_NOTE, page: 0, settings: sparringSettings()});
    expectShows('Working on');
    await tap('w/f Mieke');
  });
  then('the line carries #wf/mieke instead of #next', () => {
    expect(sectionLines(areaFile('Coaching'), 'Tasks')[3]).toBe('- [ ] Send Mieke the role canvas #sparring/mieke #wf/mieke → [[Todos/Send Mieke the role canvas.note]]');
  });
  and('the ack offers Undo, and the todo is on the Waiting tab', async () => {
    expectShows('Undo');
    await tap(/^Waiting \d/);
    expectShows(/^Send Mieke the role canvas/);
  });
});

scenario('An Inbox meeting\'s page: no Agreement tab, agreements are never kept in the Inbox', {feature: 'Engage', design: 'technical-design-meetings-0.21.md'}, () => {
  const INBOX_NOTE = `${INBOX_FILE.replace(/\/[^/]+$/, '')}/Meetings/Call.note`;
  given('the Inbox has a meeting "Call with Sven" today with its own note', () => {
    clock(12, 0);
    putFile(INBOX_FILE, dataFile('inbox', {Tasks: [], Meetings: [`- ${TODAY} 11:00-11:30 Call with Sven → [[Meetings/Call.note#${TODAY} Call with Sven]]`]}));
    device().sdk.putNote(INBOX_NOTE, [{keywords: [TODAY, `${TODAY} Call with Sven`]}]);
  });
  when('I open Engage on its page and open Quick Add if offered', async () => {
    await openEngage({fromNote: INBOX_NOTE, page: 0});
    if (describeScreen().includes('+ Quick Add')) await tap('+ Quick Add');
  });
  then('Quick Add has no Agreement tab', () => expectNotShows('Agreement'));
});
