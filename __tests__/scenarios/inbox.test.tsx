import {device} from '../../test-helpers/fakeDevice/device';
import {expectShows, openApp, tap, tapTab} from '../../test-helpers/scenario/app';
import {dataFile, INBOX_FILE, PATHS, projectDir, projectFile, putFile, sectionLines} from '../../test-helpers/scenario/files';
import {given, scenario, then, when} from '../../test-helpers/scenario/scenario';

const NOTE_IN_INBOX = `${PATHS.inboxFolder}/Todos/Call Anna.note`;

scenario('Refile a todo with its note from the Inbox to a project', {feature: 'Inbox', design: 'technical-design-filing-unification.md'}, () => {
  given('Inbox.txt has the todo "Call Anna" with its note "Call Anna.note", and project "Website" exists', () => {
    putFile(INBOX_FILE, dataFile('inbox', {Tasks: ['- [ ] Call Anna #next → [[Todos/Call Anna.note]]'], Meetings: []}));
    device().sdk.putNote(NOTE_IN_INBOX, [{keywords: ['call']}]);
    putFile(projectFile('Website'), dataFile('project', {Scope: [], Tasks: ['- [ ] Write copy'], Meetings: []}));
  });
  when('I open the Inbox, tap "Call Anna", tap Refile, open Projects, tap "Website" and confirm Move', async () => {
    await openApp();
    await tapTab('Inbox');
    await tap('Call Anna');
    await tap('Refile');
    await tap('📁 Projects ›');
    await tap(/Website/);
    expectShows(/^Move "Call Anna #next" to Website\? Its note Call Anna.note moves along\./);
    await tap('Move');
  });
  then('Website\'s project.txt has the todo with its note link, after "Write copy"', () => {
    const tasks = sectionLines(projectFile('Website'), 'Tasks');
    expect(tasks[0]).toBe('- [ ] Write copy');
    expect(tasks[1]).toMatch(/^- \[ \] Call Anna #next → \[\[.*Call Anna\.note\]\]/);
    expect(tasks).toHaveLength(2);
  });
  then('Inbox.txt no longer has it', () => {
    expect(sectionLines(INBOX_FILE, 'Tasks')).toEqual([]);
  });
  then('the note moved into the project\'s folder, keywords and all', () => {
    const moved = device().fs.paths(projectDir('Website')).filter(p => p.endsWith('Call Anna.note'));
    expect(moved).toHaveLength(1);
    expect(device().sdk.note(moved[0])?.pages[0].keywords).toEqual(['call']);
    expect(device().fs.exists(NOTE_IN_INBOX)).toBe(false);
  });
});
