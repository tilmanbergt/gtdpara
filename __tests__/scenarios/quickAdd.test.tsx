import {expectShows, fieldValue, firstCheckboxOf, openApp, tap, tapTab, type} from '../../test-helpers/scenario/app';
import {dataFile, expectFileContains, INBOX_FILE, loggedErrors, projectFile, putFile, sectionLines} from '../../test-helpers/scenario/files';
import {given, scenario, then, when} from '../../test-helpers/scenario/scenario';

scenario('Quick Add a todo in a project', {feature: 'Quick Add', design: 'technical-design-filing-unification.md'}, () => {
  given('project "Website" has the todo "Write copy" and a hand-written Scope', () => {
    putFile(
      projectFile('Website'),
      dataFile('project', {Scope: ['Relaunch the site.', 'A second paragraph, by hand.'], Tasks: ['- [ ] Write copy #next'], Meetings: []}),
    );
  });
  when('I open gtdpara, go to Projects, open "Website" and add the todo "Call the designer"', async () => {
    await openApp();
    await tapTab('Projects');
    await tap(/^Website/);
    await type('New task', 'Call the designer');
    await tap('+ Add');
  });
  then('project.txt lists both todos', () => {
    const tasks = sectionLines(projectFile('Website'), 'Tasks');
    expect(tasks[0]).toBe('- [ ] Write copy #next');
    expect(tasks[1]).toMatch(/^- \[ \] Call the designer/);
    expect(tasks).toHaveLength(2);
  });
  then('the Scope and the rest of the file are unchanged', () => {
    expectFileContains(projectFile('Website'), '## Scope\nRelaunch the site.\nA second paragraph, by hand.\n');
    expectFileContains(projectFile('Website'), '## Meetings');
  });
  then('the status line confirms it and nothing was logged as an error', () => {
    expectShows(/Added todo "Call the designer"/);
    expect(loggedErrors()).toEqual([]);
  });
});

scenario('Edit a todo, then tap another one: the first edit is saved', {feature: 'Quick Add', design: 'technical-design-meeting-lists.md'}, () => {
  given('project "Website" has the todos "Write copy" and "Fix footer"', () => {
    putFile(projectFile('Website'), dataFile('project', {Scope: [], Tasks: ['- [ ] Write copy #next', '- [ ] Fix footer'], Meetings: []}));
  });
  when('I open "Website", tap "Write copy", change it to "Write landing page copy" and tap "Fix footer"', async () => {
    await openApp();
    await tapTab('Projects');
    await tap(/^Website/);
    await tap('Write copy');
    await type('New task', 'Write landing page copy');
    await tap('Fix footer');
  });
  then('project.txt has the changed todo, still #next, and "Fix footer" unchanged', () => {
    expect(sectionLines(projectFile('Website'), 'Tasks')).toEqual(['- [ ] Write landing page copy #next', '- [ ] Fix footer']);
  });
  then('"Fix footer" is now the one being edited', () => {
    expectShows('Save');
    expect(fieldValue('New task')).toBe('Fix footer');
  });
});

scenario('An abbreviation tag files a todo into its project while editing', {feature: 'Quick Add', design: 'technical-design-abbrev-quick-file.md'}, () => {
  given('project "Website" (#WEB) and the Inbox todo "Ask about hosting"', () => {
    putFile(projectFile('Website'), dataFile('project', {Scope: [], Tasks: [], Meetings: []}, ['abbrev: WEB']));
    putFile(INBOX_FILE, dataFile('inbox', {Tasks: ['- [ ] Ask about hosting'], Meetings: []}));
  });
  when('I edit the Inbox todo, add "#WEB" and tap "File: Website"', async () => {
    await openApp();
    await tapTab('Inbox');
    await tap('Ask about hosting');
    await type('New task', 'Ask about hosting #WEB');
    await tap(/^File: Website/);
  });
  then('the todo is in Website\'s project.txt, without the #WEB tag', () => {
    expect(sectionLines(projectFile('Website'), 'Tasks')).toEqual([expect.stringMatching(/^- \[ \] Ask about hosting$|^- \[ \] Ask about hosting \[/)]);
  });
  then('Inbox.txt no longer has it', () => {
    expect(sectionLines(INBOX_FILE, 'Tasks')).toEqual([]);
  });
});

scenario('Ticking a todo off writes its completion date', {feature: 'Quick Add', design: 'technical-design-tags.md'}, () => {
  given('project "Website" has the todo "Write copy"', () => {
    putFile(projectFile('Website'), dataFile('project', {Scope: [], Tasks: ['- [ ] Write copy #next'], Meetings: []}));
  });
  when('I open "Website" and tick "Write copy" off', async () => {
    await openApp();
    await tapTab('Projects');
    await tap(/^Website/);
    await tap('☐', firstCheckboxOf('Write copy'));
  });
  then('project.txt has it done, with today\'s date as completion field', () => {
    expect(sectionLines(projectFile('Website'), 'Tasks')).toEqual([expect.stringMatching(/^- \[x\] Write copy #next .*\[completion:: \d{4}-\d{2}-\d{2}\]$/)]);
  });
});
