import {isoDateOffset} from '../../src/domain/meetingTime';
import {describeScreen, expectNotShows, expectShows, openApp, tap, tapTab, type} from '../../test-helpers/scenario/app';
import {areaFile, dataFile, fileText, projectFile, putFile, sectionLines} from '../../test-helpers/scenario/files';
import {and, given, scenario, then, when} from '../../test-helpers/scenario/scenario';
import {sparringSettings} from '../../test-helpers/scenario/setups';

const today = isoDateOffset(0);
const past = isoDateOffset(-10);
const year = today.slice(0, 4);
const sparringLine = `- ${past} 10:00-11:00 Sparring Mieke #sparring/mieke`;

/** Area "Coaching" with a past sparring session and the given agreement lines. */
function coaching(agreements: string[], extra: Record<string, string[]> = {}): void {
  putFile(areaFile('Coaching'), dataFile('area', {Scope: [], Tasks: [], Meetings: [sparringLine], Threads: ['- mieke: active'], Agreements: agreements, ...extra}, ['abbrev: Co']));
}

async function openMiekeOverview(): Promise<void> {
  await openApp({settings: sparringSettings()});
  await tapTab('Areas');
  await tap(/^Coaching/);
  await tap('#sparring/mieke');
  expectShows('Looking back');
}

scenario('An agreement in the thread overview: it shows in the block "Agreements", another thread\'s does not', {feature: 'Agreements', design: 'technical-design-meetings-0.21.md'}, () => {
  given('area "Coaching" has an agreement tagged #mieke and one tagged #sparring/sven', () => {
    coaching([`- Feedback only in our 1:1s #mieke [created:: ${past}]`, `- Sven owns the slides #sparring/sven [created:: ${past}]`]);
  });
  when('I open Mieke\'s thread overview', openMiekeOverview);
  then('Ahead lists the block "Agreements" with the first one only', () => {
    expectShows('Agreements');
    expectShows('◇ Feedback only in our 1:1s #mieke');
    expectNotShows('◇ Sven owns the slides #sparring/sven');
  });
  when('I switch to All mieke', () => tap('All mieke'));
  then('the agreement shows there too', () => expectShows('◇ Feedback only in our 1:1s #mieke'));
});

scenario('Add an agreement from the thread overview with valid till end of year', {feature: 'Agreements', design: 'technical-design-meetings-0.21.md'}, () => {
  given('area "Coaching" has a past sparring session with Mieke and no agreements', () => coaching([]));
  when('I open Mieke\'s thread overview, choose the Agreement tab and type "No calls after six"', async () => {
    await openMiekeOverview();
    await tap('Agreement', 1);
    await type('New agreement', 'No calls after six');
  });
  and('I tap "valid till" and choose "end of year", then + Add', async () => {
    await tap('valid till');
    await tap('end of year');
    expectShows(`till 31.12.`);
    await tap('+ Add', 1);
  });
  then('the area file has the agreement with the thread tag, the meeting it was made in, today and the valid-till date', () => {
    expect(sectionLines(areaFile('Coaching'), 'Agreements')).toEqual([
      `- No calls after six #sparring/mieke [meeting:: ${past} Sparring Mieke sparring/mieke] [created:: ${today}] [valid:: ${year}-12-31]`,
    ]);
  });
  and('the status slot says where it went, and the overview lists it', () => {
    expectShows('Agreement added to Coaching');
    expectShows('◇ No calls after six #sparring/mieke');
  });
});

scenario('Change an agreement: the old one is ended, the new one added; Cancel changes nothing', {feature: 'Agreements', design: 'technical-design-meetings-0.21.md'}, () => {
  const line = `- Feedback only in our 1:1s #sparring/mieke [created:: ${past}] [valid:: ${year}-12-31]`;
  given('area "Coaching" has the agreement "Feedback only in our 1:1s" with Mieke', () => coaching([line]));
  when('I open Mieke\'s thread overview, tap the agreement and Change on its card, then Cancel', async () => {
    await openMiekeOverview();
    await tap('◇ Feedback only in our 1:1s #sparring/mieke');
    expectShows(/^Agreement · since/);
    await tap('Change');
    expectShows(/^↳ replaces 'Feedback only in our 1:1s'/);
    await tap('Cancel');
  });
  then('the file is unchanged', () => expect(sectionLines(areaFile('Coaching'), 'Agreements')).toEqual([line]));
  when('I tap Change again, edit the words to "Feedback only in our 1:1s, except urgent" and tap + Add', async () => {
    await tap('◇ Feedback only in our 1:1s #sparring/mieke');
    await tap('Change');
    await type('New agreement', 'Feedback only in our 1:1s, except urgent #sparring/mieke');
    await tap('+ Add', 1);
  });
  then('the old line is ended today and the new one is added after it, made in the meeting the overview shows', () => {
    expect(sectionLines(areaFile('Coaching'), 'Agreements')).toEqual([
      `${line} [ended:: ${today}]`,
      `- Feedback only in our 1:1s, except urgent #sparring/mieke [meeting:: ${past} Sparring Mieke sparring/mieke] [created:: ${today}] [valid:: ${year}-12-31]`,
    ]);
  });
  and('the overview lists only the new one, and Looking back counts the ended one', () => {
    expectShows('◇ Feedback only in our 1:1s, except urgent #sparring/mieke');
    expectNotShows('◇ Feedback only in our 1:1s #sparring/mieke');
    expectShows('1 agreement ended ›');
  });
});

scenario('End an agreement: asked once, then ended today', {feature: 'Agreements', design: 'technical-design-meetings-0.21.md'}, () => {
  given('area "Coaching" has the agreement "Feedback only in our 1:1s" with Mieke', () =>
    coaching([`- Feedback only in our 1:1s #sparring/mieke [created:: ${past}]`]),
  );
  when('I tap it in Mieke\'s thread overview, tap End on its card and confirm', async () => {
    await openMiekeOverview();
    await tap('◇ Feedback only in our 1:1s #sparring/mieke');
    await tap('End');
    expectShows('End "Feedback only in our 1:1s"?');
    // The status slot's End is drawn above the card's.
    await tap('End', 0);
  });
  then('the line gets [ended:: today]', () =>
    expect(sectionLines(areaFile('Coaching'), 'Agreements')).toEqual([`- Feedback only in our 1:1s #sparring/mieke [created:: ${past}] [ended:: ${today}]`]),
  );
  and('the overview shows "1 agreement ended ›" in Looking back', () => {
    expectShows('Ended the agreement');
    expectShows('1 agreement ended ›');
    expectNotShows('◇ Feedback only in our 1:1s #sparring/mieke');
  });
});

scenario('A hand-edited Agreements section keeps every other line byte for byte when one agreement is ended', {feature: 'Agreements', design: 'technical-design-meetings-0.21.md'}, () => {
  given('area "Coaching" has two agreements, one with the unknown field [who:: both], a comment line and a blank line between them', () => {
    coaching([`- Feedback only in our 1:1s #sparring/mieke [created:: ${past}] [who:: both]`, '% agreed on paper', '', `-   Fridays  are quiet #mieke   [created::${past}]`]);
  });
  when('I end the first one in Mieke\'s thread overview', async () => {
    await openMiekeOverview();
    await tap('◇ Feedback only in our 1:1s #sparring/mieke');
    await tap('End');
    await tap('End', 0);
  });
  then('only that line changed; everything else is byte-identical', () => {
    const before = dataFile(
      'area',
      {
        Scope: [],
        Tasks: [],
        Meetings: [sparringLine],
        Threads: ['- mieke: active'],
        Agreements: [`- Feedback only in our 1:1s #sparring/mieke [created:: ${past}] [who:: both]`, '% agreed on paper', '', `-   Fridays  are quiet #mieke   [created::${past}]`],
      },
      ['abbrev: Co'],
    );
    expect(fileText(areaFile('Coaching'))).toBe(
      before.replace(`[created:: ${past}] [who:: both]`, `[created:: ${past}] [ended:: ${today}] [who:: both]`),
    );
  });
});

scenario('A Project page lists its own agreements; a thread\'s agreement shows in the thread overview instead', {feature: 'Agreements', design: 'technical-design-meetings-0.21.md'}, () => {
  given('project "Leadership program" has one untagged agreement and one tagged #sparring/mieke', () => {
    putFile(
      projectFile('Leadership program'),
      dataFile('project', {Scope: [], Tasks: ['- [ ] Plan module 2'], Meetings: [sparringLine], Agreements: ['- Slides go out a day ahead', '- Mieke reviews module 1 #sparring/mieke']}),
    );
  });
  when('I open the project', async () => {
    await openApp({settings: sparringSettings()});
    await tapTab('Projects');
    await tap(/^Leadership program/);
  });
  then('its todo list ends with "◇ Agreements 1 ›"', () => expectShows('◇ Agreements 1 ›'));
  when('I tap it', () => tap('◇ Agreements 1 ›'));
  then('the column lists the untagged agreement, with "‹ Todos" back', () => {
    expectShows('‹ Todos');
    expectShows('◇ Slides go out a day ahead');
    expectNotShows('◇ Mieke reviews module 1 #sparring/mieke');
  });
  when('I open Mieke\'s thread overview from the meeting', async () => {
    await tap('‹ Todos');
    await tap('#sparring/mieke');
  });
  then('the tagged one shows there', () => {
    if (!describeScreen().includes('Looking back')) throw new Error(describeScreen());
    expectShows('◇ Mieke reviews module 1 #sparring/mieke');
  });
});
