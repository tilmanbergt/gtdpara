import {isoDateOffset} from '../../src/domain/meetingTime';
import {meetingKey} from '../../src/domain/provenance';
import {device} from '../../test-helpers/fakeDevice/device';
import {expectNotShows, expectShows, fieldValue, openApp, openEngage, tap, tapTab, type} from '../../test-helpers/scenario/app';
import {areaDir, areaFile, dataFile, fileText, pageKeywords, pageTexts, putFile, sectionLines} from '../../test-helpers/scenario/files';
import {and, given, scenario, then, when} from '../../test-helpers/scenario/scenario';
import {sparringSettings} from '../../test-helpers/scenario/setups';

// Dates relative to today, so "over" and "ahead" hold whenever the suite runs.
const d1 = isoDateOffset(-3); // the sparring session we reflect on
const d2 = isoDateOffset(-1); // a later meeting in the same notebook
const ahead = isoDateOffset(2);
const year = d1.slice(0, 4);

const NOTEBOOK_REL = `Meetings/sparring mieke ${year}.note`;
const NOTEBOOK = `${areaDir('Coaching')}/${NOTEBOOK_REL}`;
const MEETING_KW = `${d1} Sparring Mieke #sparring/mieke`;
const CHECKIN_KW = `${d2} Check-in Mieke #sparring/mieke`;
// 52 characters with the tag, so the keyword leaves the tag out (keyword limit 43).
const REFLECTION_KW = `reflection ${d1} Sparring Mieke`;

const sparringLine = (extra = '', withNote = true) =>
  `- ${d1} 10:00-11:00 Sparring Mieke #sparring/mieke${extra}${withNote ? ` → [[${NOTEBOOK_REL}#${MEETING_KW}]]` : ''}`;
const checkinLine = `- ${d2} 09:00-09:30 Check-in Mieke #sparring/mieke → [[${NOTEBOOK_REL}#${CHECKIN_KW}]]`;

/** Area "Coaching" with the given meeting lines (and todos). */
function coaching(meetings: string[], tasks: string[] = []): void {
  putFile(areaFile('Coaching'), dataFile('area', {Scope: [], Tasks: tasks, Meetings: meetings}, ['abbrev: Co']));
}

/**
 * The sparring notebook: the session's page, two pages Tilman inserted by hand after it (no
 * keywords - they belong to the session), then the check-in's page, which starts the next item.
 */
function sparringNotebook(): void {
  device().sdk.putNote(NOTEBOOK, [{keywords: [d1, MEETING_KW]}, {keywords: []}, {keywords: []}, {keywords: [d2, CHECKIN_KW]}]);
}

async function openCoaching(): Promise<void> {
  await openApp({settings: sparringSettings()});
  await tapTab('Areas');
  await tap(/^Coaching/);
}

scenario('Reflect on a sparring session: the page comes after the meeting\'s page and the pages added to it by hand', {feature: 'Meetings', design: 'technical-design-meeting-reflection.md'}, () => {
  given('area "Coaching" has a sparring session three days ago and a check-in since; in "sparring mieke <year>.note" the session\'s page is followed by two pages added by hand, then the check-in\'s page', () => {
    coaching([sparringLine(), checkinLine]);
    sparringNotebook();
  });
  when('I open Coaching and tap the sparring session', async () => {
    await openCoaching();
    await tap(/^Sparring Mieke/);
  });
  then('the toolbar acts on it and offers "Reflect ›" and "☐ Reviewed"', () => {
    expectShows('Reflect ›');
    expectShows('☐ Reviewed');
  });
  when('I tap "Reflect ›" and confirm the new page', async () => {
    await tap('Reflect ›');
    expectShows(new RegExp(`^Sparring: reflection page in Meetings/sparring mieke ${year}\\.note, after the meeting's page`));
    await tap('Add page');
  });
  then('the reflection page comes after both hand-added pages, not straight after the session\'s page, and before the check-in\'s page', () => {
    const pages = device().sdk.note(NOTEBOOK)!.pages;
    expect(pages).toHaveLength(5);
    expect(pages[0].keywords).toContain(MEETING_KW);
    expect(pages[1].keywords).toEqual([]);
    expect(pages[2].keywords).toEqual([]);
    expect(pageKeywords(NOTEBOOK, 3)).toContain(REFLECTION_KW);
    expect(pages[4].keywords).toContain(CHECKIN_KW);
  });
  and('the reflection page has no date keyword of its own, so it stays part of the meeting', () => {
    expect(pageKeywords(NOTEBOOK, 3)).not.toContain(d1);
  });
  and('it carries the setup\'s heading and guiding question', () => {
    expect(pageTexts(NOTEBOOK, 3)).toEqual(expect.arrayContaining([expect.stringContaining('Sparring Mieke'), 'What did I notice?']));
  });
  and('it was opened, and the toolbar now says "Reflection ›"', () => {
    expect(device().sdk.opened.at(-1)).toEqual({path: NOTEBOOK, page: 3});
    expectShows('Reflection ›');
  });
  and('the meeting is not ticked reviewed and its line is unchanged', () => {
    expect(sectionLines(areaFile('Coaching'), 'Meetings')).toEqual([sparringLine(), checkinLine]);
  });
});

scenario('Reflect on a meeting that has no page yet: one question, then meeting page and reflection in order', {feature: 'Meetings', design: 'technical-design-meeting-reflection.md'}, () => {
  given('area "Coaching" has a sparring session three days ago without a note, and no sparring notebook exists', () => {
    coaching([sparringLine('', false)]);
  });
  when('I tap the session, tap "Reflect ›" and confirm', async () => {
    await openCoaching();
    await tap(/^Sparring Mieke/);
    await tap('Reflect ›');
    expectShows(new RegExp(`^Sparring: pages for the meeting and its reflection in Meetings/sparring mieke ${year}\\.note`));
    await tap('Add pages');
  });
  then('the notebook exists with the meeting\'s page first and the reflection second', () => {
    // A new notebook starts with the empty page the Supernote creates it with; the meeting's page follows it.
    const pages = device().sdk.note(NOTEBOOK)!.pages;
    const meetingPage = pages.findIndex(p => p.keywords.includes(MEETING_KW));
    expect(pages.slice(0, meetingPage).every(p => p.keywords.length === 0)).toBe(true);
    expect(pageKeywords(NOTEBOOK, meetingPage)).toEqual(expect.arrayContaining([d1, MEETING_KW]));
    expect(pageKeywords(NOTEBOOK, meetingPage + 1)).toContain(REFLECTION_KW);
    expect(pages).toHaveLength(meetingPage + 2);
  });
  and('the meeting links its page, and the reflection is what opened', () => {
    expect(sectionLines(areaFile('Coaching'), 'Meetings')).toEqual([sparringLine()]);
    const pages = device().sdk.note(NOTEBOOK)!.pages;
    expect(device().sdk.opened.at(-1)).toEqual({path: NOTEBOOK, page: pages.length - 1});
  });
});

scenario('A renamed meeting finds its reflection again', {feature: 'Meetings', design: 'technical-design-meeting-reflection.md'}, () => {
  given('the sparring session has a reflection page, and its title was changed to "Sparring Mieke roles" since', () => {
    coaching([`- ${d1} 10:00-11:00 Sparring Mieke roles #sparring/mieke → [[${NOTEBOOK_REL}#${MEETING_KW}]]`]);
    device().sdk.putNote(NOTEBOOK, [{keywords: [d1, MEETING_KW]}, {keywords: [REFLECTION_KW]}]);
  });
  when('I tap the session', async () => {
    await openCoaching();
    await tap(/^Sparring Mieke roles/);
  });
  then('the toolbar says "Reflection ›"', () => expectShows('Reflection ›'));
  when('I tap it', () => tap('Reflection ›'));
  then('the same page opens, now with the keyword of the new title', () => {
    expect(device().sdk.opened.at(-1)).toEqual({path: NOTEBOOK, page: 1});
    expect(pageKeywords(NOTEBOOK, 1)).toEqual([`reflection ${d1} Sparring Mieke roles`]);
    expect(device().sdk.note(NOTEBOOK)!.pages).toHaveLength(2);
  });
});

scenario('The toolbar follows the selected meeting', {feature: 'Meetings', design: 'technical-design-meeting-reflection.md'}, () => {
  given('area "Coaching" has a sparring session three days ago and one in two days, both tracked by the Sparring setup', () => {
    coaching([sparringLine(), `- ${ahead} 10:00-11:00 Next sparring Mieke #sparring/mieke`]);
    sparringNotebook();
  });
  when('I open Coaching without tapping a meeting', openCoaching);
  then('the toolbar is there but says "Tap a meeting"', () => expectShows('Tap a meeting'));
  when('I tap the session in two days', () => tap(/^Next sparring Mieke/));
  then('it offers "☐ Prepped" and "Link file", but no reflection yet', () => {
    expectShows('☐ Prepped');
    expectShows('Link file');
    expectNotShows('Reflect ›');
    expectNotShows('☐ Reviewed');
  });
  when('I tap the session three days ago', () => tap(/^Sparring Mieke/));
  then('it offers "☐ Reviewed", "Reflect ›" and "Link file"', () => {
    expectShows('☐ Reviewed');
    expectShows('Reflect ›');
    expectShows('Link file');
    expectNotShows('☐ Prepped');
  });
});

scenario('Tick reviewed in the toolbar while editing the meeting: Save keeps the tick', {feature: 'Meetings', design: 'technical-design-meeting-reflection.md'}, () => {
  given('the sparring session three days ago was ticked prepped before it took place', () => {
    coaching([sparringLine(' #prepped')]);
    sparringNotebook();
  });
  when('I tap the session to edit it', async () => {
    await openCoaching();
    await tap(/^Sparring Mieke/);
  });
  then('the title field shows the title without #prepped', () => {
    expect(fieldValue('New meeting title')).toBe('Sparring Mieke #sparring/mieke');
  });
  when('I change the title, tick "☐ Reviewed" in the toolbar and then tap Save', async () => {
    await type('New meeting title', 'Sparring Mieke roles #sparring/mieke');
    await tap('☐ Reviewed');
    expectShows('✓ Reviewed');
    await tap('Save');
  });
  then('the meeting has the new title and keeps both #prepped and #reviewed', () => {
    const [line] = sectionLines(areaFile('Coaching'), 'Meetings');
    expect(line).toMatch(new RegExp(`^- ${d1} 10:00-11:00 Sparring Mieke roles #sparring/mieke`));
    expect(line).toContain('#prepped');
    expect(line).toContain('#reviewed');
  });
});

scenario('Daily: tomorrow\'s tracked meeting offers Prepped, and Daily has no Link file', {feature: 'Daily', design: 'technical-design-meeting-reflection.md'}, () => {
  given('area "Coaching" has a sparring session tomorrow', () => {
    coaching([`- ${isoDateOffset(1)} 10:00-11:00 Sparring Mieke #sparring/mieke`]);
  });
  when('I open Daily, switch to Tomorrow and tap the session', async () => {
    await openApp({settings: sparringSettings()});
    await tapTab('Daily');
    await tap('Tomorrow');
    await tap(/^Sparring Mieke/);
  });
  then('the toolbar offers "☐ Prepped" and nothing else', () => {
    expectShows('☐ Prepped');
    expectNotShows('Link file');
    expectNotShows('Reflect ›');
  });
});

scenario('Reflect from Review\'s "Meetings to close out" without ticking it reviewed', {feature: 'Weekly Review', design: 'technical-design-meeting-reflection.md'}, () => {
  given('the sparring session three days ago is tracked for review and not reviewed yet; its page is followed by two pages added by hand, then the check-in\'s page', () => {
    coaching([sparringLine(), checkinLine]);
    sparringNotebook();
  });
  when('I open Review, the step "Meetings to close out", tap the session and "Reflect ›", and confirm', async () => {
    await openApp({settings: sparringSettings()});
    await tapTab('Review');
    await tap('Meetings to close out');
    await tap(/^Sparring Mieke/);
    await tap('Reflect ›');
    await tap('Add page');
  });
  then('the reflection page comes after the two hand-added pages and before the check-in\'s page', () => {
    expect(pageKeywords(NOTEBOOK, 3)).toContain(REFLECTION_KW);
    expect(pageKeywords(NOTEBOOK, 4)).toContain(CHECKIN_KW);
    expect(device().sdk.opened.at(-1)).toEqual({path: NOTEBOOK, page: 3});
  });
  and('the meeting is still not reviewed', () => {
    expect(fileText(areaFile('Coaching'))).not.toContain('#reviewed');
    expectShows('Mark reviewed');
  });
});

scenario('Engage on the meeting\'s page offers the reflection; on the reflection page it opens on what was agreed', {feature: 'Engage', design: 'technical-design-meeting-reflection.md'}, () => {
  given('the todo "Send Mieke the role canvas" was agreed in the sparring session three days ago; in the notebook the session\'s page is followed by a page added by hand, then the page of the todo "Prepare the workshop"', () => {
    const key = meetingKey({date: d1, title: 'Sparring Mieke #sparring/mieke'});
    coaching(
      [sparringLine()],
      [`- [ ] Send Mieke the role canvas #next [meeting:: ${key}]`, `- [ ] Prepare the workshop #sparring/mieke [created:: ${d2}] → [[${NOTEBOOK_REL}#Prepare the workshop #sparring/mieke]]`],
    );
    device().sdk.putNote(NOTEBOOK, [{keywords: [d1, MEETING_KW]}, {keywords: []}, {keywords: [d2, 'Prepare the workshop #sparring/mieke']}]);
  });
  when('I open Engage on the meeting\'s page', () => openEngage({fromNote: NOTEBOOK, page: 0, settings: sparringSettings()}));
  then('it offers "Reflect on this meeting ›"', () => expectShows('Reflect on this meeting ›'));
  when('I tap it and confirm', async () => {
    await tap('Reflect on this meeting ›');
    await tap('Add page');
  });
  then('the reflection page comes after the hand-added page and before the todo\'s page, and opens', () => {
    expect(pageKeywords(NOTEBOOK, 2)).toContain(REFLECTION_KW);
    expect(pageKeywords(NOTEBOOK, 3)).toContain('Prepare the workshop #sparring/mieke');
    expect(device().sdk.opened.at(-1)).toEqual({path: NOTEBOOK, page: 2});
  });
  when('I open Engage on the reflection page', () => openEngage({fromNote: NOTEBOOK, page: 2}));
  then('it opens on "Agreed 1" from the sparring session, with the agreed todo', () => {
    expectShows('Agreed 1');
    expectShows(/^Agreed in Sparring Mieke · /);
    // The row draws the title and its #next label as one text: match the title at its start.
    expectShows(/^Send Mieke the role canvas/);
  });
  and('it doesn\'t offer to reflect again', () => expectNotShows('Reflect on this meeting ›'));
});
