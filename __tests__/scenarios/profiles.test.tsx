import {device} from '../../test-helpers/fakeDevice/device';
import {expectNotShows, expectShows, openApp, tap, tapTab, type} from '../../test-helpers/scenario/app';
import {dataFile, INBOX_FILE, projectFile, putFile, sectionLines} from '../../test-helpers/scenario/files';
import {and, given, scenario, then, when} from '../../test-helpers/scenario/scenario';

const DEMO_INBOX = '/storage/emulated/0/Note/kept-gtd-demo/2 Areas/0 Inbox/Inbox.txt';

scenario('Try things in the demo space without touching the real files, then switch back', {feature: 'Profiles and demo space', design: 'technical-design-profiles-demo-space.md'}, () => {
  given('my real PARA folder has project "Website" and an empty Inbox', () => {
    putFile(projectFile('Website'), dataFile('project', {Scope: [], Tasks: ['- [ ] Write copy #next'], Meetings: []}, ['abbrev: WEB']));
    putFile(INBOX_FILE, dataFile('inbox', {Tasks: [], Meetings: []}));
  });
  when('I create the demo space in Settings → Advanced and switch to it', async () => {
    await openApp();
    await tapTab('Settings');
    await tap('Advanced');
    await tap('Create demo space');
    expectShows(/demo files written to Note\/kept-gtd-demo, profile "Demo" added\./);
    await tap('Switch');
    expectShows('Switch to profile "Demo"? The current profile is saved first.');
    await tap('Switch');
  });
  then('the tab bar says DEMO and Projects shows the demo projects, not "Website"', async () => {
    expectShows('DEMO');
    await tapTab('Projects');
    expectShows(/Garden renovation/);
    expectNotShows(/^Website +#WEB/);
  });
  when('I add the todo "Try the demo" in the Inbox', async () => {
    await tapTab('Inbox');
    await type('New task', 'Try the demo');
    await tap('+ Add');
  });
  then('it is in the demo space\'s Inbox.txt, and my real Inbox.txt is untouched', () => {
    expect(sectionLines(DEMO_INBOX, 'Tasks')).toContainEqual(expect.stringMatching(/^- \[ \] Try the demo/));
    expect(sectionLines(INBOX_FILE, 'Tasks')).toEqual([]);
  });
  when('I tap DEMO in the tab bar and switch back to Production', async () => {
    await tap('DEMO');
    await tap('Switch');
    await tap('Switch');
  });
  then('"Website" is back, and the demo todo is not in my Inbox', async () => {
    expectNotShows('DEMO');
    await tapTab('Projects');
    expectShows(/^Website +#WEB/);
    await tapTab('Inbox');
    expectNotShows(/Try the demo/);
  });
  and('both profiles are saved as files in EXPORT/kept-gtd/profiles', () => {
    expect(device().fs.exists('/storage/emulated/0/EXPORT/kept-gtd/profiles/production.json')).toBe(true);
    expect(device().fs.exists('/storage/emulated/0/EXPORT/kept-gtd/profiles/demo.json')).toBe(true);
  });
});
