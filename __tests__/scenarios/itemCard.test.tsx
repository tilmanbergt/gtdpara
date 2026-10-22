import {isoDateOffset} from '../../src/domain/meetingTime';
import {expectNotShows, expectShows, fieldValue, openApp, tap, tapTab, type} from '../../test-helpers/scenario/app';
import {areaFile, dataFile, INBOX_FILE, loggedErrors, projectFile, putFile, sectionLines} from '../../test-helpers/scenario/files';
import {given, scenario, then, when} from '../../test-helpers/scenario/scenario';

const today = isoDateOffset(0);

scenario('Save to <Name>: an abbreviation tag typed while editing saves the meeting and moves it there', {feature: 'Quick Add', design: 'technical-design-item-card.md'}, () => {
  given('project "Garden renovation" (#GR) and the Inbox meeting "Site visit" today', () => {
    putFile(projectFile('Garden renovation'), dataFile('project', {Scope: [], Tasks: [], Meetings: []}, ['abbrev: GR']));
    putFile(INBOX_FILE, dataFile('inbox', {Tasks: [], Meetings: [`- ${today} 14:00 Site visit`]}));
  });
  when('I open Daily, tap the meeting, add "#GR" to its title', async () => {
    await openApp();
    await tapTab('Daily');
    await tap(/^Site visit/);
    await type('New meeting title', 'Site visit with Tom #GR');
  });
  then('the main button offers "Save to Garden renovat…" instead of Save', () => {
    expectShows(/^Save to Garden renovat/);
    expectNotShows('Save');
  });
  when('I tap it', () => tap(/^Save to Garden renovat/));
  then('the meeting, renamed and without the tag, is in the project and no longer in the Inbox', () => {
    expect(sectionLines(projectFile('Garden renovation'), 'Meetings')).toEqual([expect.stringMatching(new RegExp(`^- ${today} 14:00 Site visit with Tom$`))]);
    expect(sectionLines(INBOX_FILE, 'Meetings')).toEqual([]);
    expect(loggedErrors()).toEqual([]);
  });
});

scenario('After + Add with an abbreviation tag, the next todo starts with that tag', {feature: 'Quick Add', design: 'technical-design-item-card.md'}, () => {
  given('project "Website" (#WEB) and an empty Inbox', () => {
    putFile(projectFile('Website'), dataFile('project', {Scope: [], Tasks: [], Meetings: []}, ['abbrev: WEB']));
    putFile(INBOX_FILE, dataFile('inbox', {Tasks: [], Meetings: []}));
  });
  when('I add "Call the designer #web" from the Inbox', async () => {
    await openApp();
    await tapTab('Inbox');
    await type('New task', 'Call the designer #web');
    await tap(/^\+ Add to Website/);
  });
  then('the field starts the next todo with "#WEB ", and the button still files to Website', () => {
    expect(fieldValue('New task')).toBe('#WEB ');
    expectShows(/^\+ Add to Website/);
  });
  when('I tap + Add with nothing but the tag', () => tap(/^\+ Add to Website/));
  then('nothing is added', () => {
    expect(sectionLines(projectFile('Website'), 'Tasks')).toHaveLength(1);
  });
  when('I write the next todo after the tag and add it', async () => {
    await type('New task', '#WEB Order photos');
    await tap(/^\+ Add to Website/);
  });
  then('both todos are in Website without the tag, none in the Inbox', () => {
    expect(sectionLines(projectFile('Website'), 'Tasks')).toEqual([
      expect.stringMatching(/^- \[ \] Call the designer( \[created:: [\d-]+\])?$/),
      expect.stringMatching(/^- \[ \] Order photos( \[created:: [\d-]+\])?$/),
    ]);
    expect(sectionLines(INBOX_FILE, 'Tasks')).toEqual([]);
    expectShows(/Added todo "Order photos" to Website/);
  });
  when('I delete the tag from the field and add a todo', async () => {
    await type('New task', 'Water the plants');
    await tap('+ Add');
  });
  then('it goes to the Inbox, and the next draft starts empty', () => {
    expect(sectionLines(INBOX_FILE, 'Tasks')).toEqual([expect.stringMatching(/^- \[ \] Water the plants( \[created:: [\d-]+\])?$/)]);
    expect(fieldValue('New task')).toBe('');
  });
});

scenario('In a thread overview, Quick Add adds the thread tag it shows in Row 4', {feature: 'Quick Add', design: 'technical-design-item-card.md'}, () => {
  given('area "Coaching" has the todo "Draft agenda #retro/alpha"', () => {
    putFile(areaFile('Coaching'), dataFile('area', {Scope: [], Tasks: ['- [ ] Draft agenda #retro/alpha'], Meetings: []}));
  });
  when('I open the thread overview from the tag and add the todo "Book room"', async () => {
    await openApp();
    await tapTab('Areas');
    await tap(/^Coaching/);
    await tap('#retro/alpha');
    expectShows('Looking back');
  });
  when('I add the todo "Book room" there', async () => {
    // The overview draws over the Area page: its Quick Add is the second one.
    await type('New task', 'Book room', 1);
    await tap('+ Add', 1);
  });
  then('the area has the new todo with the thread tag', () => {
    expect(sectionLines(areaFile('Coaching'), 'Tasks')).toEqual([
      '- [ ] Draft agenda #retro/alpha',
      expect.stringMatching(/^- \[ \] Book room #retro\/alpha/),
    ]);
  });
});
