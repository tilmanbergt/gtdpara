import {expectShows, openApp, tap, tapTab, type} from '../../test-helpers/scenario/app';
import {dataFile, expectFileContains, loggedErrors, projectFile, putFile, sectionLines} from '../../test-helpers/scenario/files';
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
