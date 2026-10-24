import AsyncStorage from '@react-native-async-storage/async-storage';
import {DEFAULT_SETTINGS} from '../../src/domain/settings';
import {device} from '../../test-helpers/fakeDevice/device';
import {expectShows, fieldValue, openApp, shows, tap, tapTab, type} from '../../test-helpers/scenario/app';
import {dataFile, expectFileContains, fileText, INBOX_FILE, projectFile, putFile, sectionLines} from '../../test-helpers/scenario/files';
import {and, given, scenario, then, when} from '../../test-helpers/scenario/scenario';

const HAND_EDITED = [
  '---',
  'kind: project',
  'status: active',
  'owner: Tilman',
  '---',
  '',
  'A paragraph written in Obsidian before the first section.',
  '',
  '## Scope',
  'Relaunch the site.',
  '',
  '## Tasks',
  '- [ ] Write copy #next',
  'a stray line typed by hand',
  '- [ ] Old style due #due:2026-10-03',
  '',
  '## Meetings',
  '',
  '## Research',
  '- my own section gtdpara does not know',
  '',
].join('\n');

scenario('A hand-edited project file keeps everything Kept GTD does not own when a todo is added', {feature: 'Your files', design: 'technical-design-tags.md'}, () => {
  given('project "Website" has a frontmatter line, a paragraph, a stray line, an old-style due date and a section of its own, all by hand', () => {
    putFile(projectFile('Website'), HAND_EDITED);
  });
  when('I add the todo "Call the designer" on its page', async () => {
    await openApp();
    await tapTab('Projects');
    await tap(/^Website/);
    await type('New task', 'Call the designer');
    await tap('+ Add');
  });
  then('the new todo is in the Tasks section', () => {
    expect(sectionLines(projectFile('Website'), 'Tasks')).toContainEqual(expect.stringMatching(/^- \[ \] Call the designer/));
  });
  and('the frontmatter line, the paragraph, the stray line, the old due date and the own section are all still there', () => {
    for (const kept of ['owner: Tilman', 'A paragraph written in Obsidian', 'a stray line typed by hand', '#due:2026-10-03', '## Research\n- my own section gtdpara does not know']) {
      expectFileContains(projectFile('Website'), kept);
    }
  });
});

scenario('An outside edit to another part of the file is kept when Kept GTD saves', {feature: 'Your files', design: 'technical-design-quality-hardening.md'}, () => {
  given('project "Website" is open in Kept GTD', async () => {
    putFile(projectFile('Website'), dataFile('project', {Scope: ['Old scope'], Tasks: ['- [ ] Write copy'], Meetings: []}));
    await openApp();
    await tapTab('Projects');
    await tap(/^Website/);
  });
  when('its Scope is changed in Obsidian, and I then add a todo in Kept GTD', async () => {
    device().fs.editExternally(projectFile('Website'), t => t.replace('Old scope', 'Scope from Obsidian'));
    await type('New task', 'Call the designer');
    await tap('+ Add');
  });
  then('project.txt has both: the new Scope and the new todo, and nobody was asked', () => {
    expectFileContains(projectFile('Website'), 'Scope from Obsidian');
    expect(sectionLines(projectFile('Website'), 'Tasks')).toEqual(['- [ ] Write copy', expect.stringMatching(/^- \[ \] Call the designer/)]);
    expect(shows(/Which version wins\?/)).toBe(false);
  });
});

scenario('When Kept GTD and another app changed the same list, the user decides which wins', {feature: 'Your files', design: 'technical-design-quality-hardening.md'}, () => {
  given('project "Website" is open in Kept GTD', async () => {
    putFile(projectFile('Website'), dataFile('project', {Scope: [], Tasks: ['- [ ] Write copy'], Meetings: []}));
    await openApp();
    await tapTab('Projects');
    await tap(/^Website/);
  });
  when('its todo is changed in Obsidian, and I then add a todo in Kept GTD', async () => {
    device().fs.editExternally(projectFile('Website'), t => t.replace('- [ ] Write copy', '- [ ] Write copy, edited in Obsidian'));
    await type('New task', 'Call the designer');
    await tap('+ Add');
  });
  then('Kept GTD asks which version wins and has written nothing yet', () => {
    expectShows('"Website" was also changed outside Kept GTD (Todos). Which version wins?');
    expect(sectionLines(projectFile('Website'), 'Tasks')).toEqual(['- [ ] Write copy, edited in Obsidian']);
  });
  and('"Use the file" keeps the Obsidian version, says nothing was saved and keeps what I typed', async () => {
    await tap('Use the file');
    expect(sectionLines(projectFile('Website'), 'Tasks')).toEqual(['- [ ] Write copy, edited in Obsidian']);
    expectShows(/Not saved: "Website" keeps the version changed outside Kept GTD\./);
    expect(fieldValue('New task')).toBe('Call the designer');
  });
  and('after another change in Obsidian, + Add asks again, and "Use mine" saves the list as Kept GTD shows it, with the new todo', async () => {
    device().fs.editExternally(projectFile('Website'), t => t.replace('edited in Obsidian', 'edited twice'));
    await tap('+ Add');
    await tap('Use mine');
    expect(sectionLines(projectFile('Website'), 'Tasks')).toEqual([
      '- [ ] Write copy, edited in Obsidian',
      expect.stringMatching(/^- \[ \] Call the designer/),
    ]);
  });
});

scenario('Unreadable settings are never replaced by the defaults unasked', {feature: 'Settings', design: 'technical-design-quality-hardening.md'}, () => {
  given('the stored settings are broken and the Inbox has a done todo', async () => {
    await AsyncStorage.setItem('gtdpara:settings:v1', '{"inboxFolder": "0 Inbox", "hideDoneIn');
    putFile(INBOX_FILE, dataFile('inbox', {Tasks: ['- [x] Old todo', '- [ ] Open todo'], Meetings: []}));
  });
  when('I open Kept GTD', () => openApp());
  then('the status line says the settings could not be read', () => {
    expectShows('Settings could not be read - Kept GTD uses defaults and saves no settings.');
  });
  and('a setting changed on the way (Inbox: Hide done tasks) leaves the stored settings as they were', async () => {
    await tapTab('Inbox');
    await tap('Hide done tasks');
    expect(await AsyncStorage.getItem('gtdpara:settings:v1')).toBe('{"inboxFolder": "0 Inbox", "hideDoneIn');
  });
  and('"Start over" stores the defaults and the message goes away', async () => {
    await tap('Start over');
    expect(JSON.parse((await AsyncStorage.getItem('gtdpara:settings:v1'))!)).toEqual(DEFAULT_SETTINGS);
    expect(shows('Settings could not be read - Kept GTD uses defaults and saves no settings.')).toBe(false);
    expect(fileText(INBOX_FILE)).toContain('- [x] Old todo');
  });
});
