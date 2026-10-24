import {device} from '../../test-helpers/fakeDevice/device';
import {expectShows, openApp, tap, tapTab} from '../../test-helpers/scenario/app';
import {dataFile, fileText, projectFile, putFile} from '../../test-helpers/scenario/files';
import {given, scenario, then, when} from '../../test-helpers/scenario/scenario';
import {DEBUG_LOG_FOLDER_PATH} from '../../src/supernote/fileSystem';

const DESIGN = 'technical-design-kept-gtd.md';

scenario('Settings → About shows the name Kept GTD, its slogan and where it came from', {feature: 'Settings', design: DESIGN}, () => {
  given('an empty PARA folder', () => undefined);
  when('I open Settings → About', async () => {
    await openApp();
    await tapTab('Settings');
    await tap('About');
  });
  then('it shows "Kept GTD" with the version, the slogan, "Formerly gtdpara" and the project link', () => {
    expectShows(/^Kept GTD \d+\.\d+\.\d+/);
    expectShows('Kept GTD – for those who write, where they write.');
    expectShows('Formerly gtdpara');
    expectShows('github.com/tilmanbergt/kept-gtd');
  });
});

scenario('Export debug bundle writes a file named after Kept GTD', {feature: 'Settings', design: DESIGN}, () => {
  given('an empty PARA folder', () => undefined);
  when('I tap Export debug bundle on Settings → About', async () => {
    await openApp();
    await tapTab('Settings');
    await tap('About');
    await tap('Export debug bundle');
  });
  then('one kept-gtd-debug file is in the debug folder, it says Kept GTD, and the status line names it', () => {
    const bundles = device()
      .fs.paths(DEBUG_LOG_FOLDER_PATH)
      .filter(p => /\/kept-gtd-debug-[^/]+\.txt$/.test(p));
    expect(bundles).toHaveLength(1);
    expect(fileText(bundles[0])).toMatch(/^=== Kept GTD debug bundle ===\n/);
    expectShows(new RegExp(`^Saved .*/${bundles[0].slice(bundles[0].lastIndexOf('/') + 1)} - check it before sharing\\.$`));
  });
});

scenario('A close-out PDF says it was created by Kept GTD', {feature: 'Close-out', design: DESIGN}, () => {
  given('project "Website" has only done todos', () => {
    putFile(projectFile('Website'), dataFile('project', {Scope: ['Relaunch the site.'], Tasks: ['- [x] Write copy'], Meetings: []}, ['abbrev: WEB']));
  });
  when('I close it out up to the PDF and tap "Create PDF"', async () => {
    await openApp();
    await tapTab('Projects');
    await tap(/^Website/);
    await tap('🗄 Close out…');
    await tap('Next: Contents ›');
    await tap('Next: Outcomes ›');
    await tap('Next: PDF ›');
    await tap('Create PDF');
  });
  then('the PDF\'s footer line says "Created by Kept GTD"', () => {
    const spec = JSON.stringify(device().pdf.builds.at(-1)!.spec);
    expect(spec).toContain('Created by Kept GTD on ');
    expect(spec).not.toMatch(/gtdpara/i);
  });
});
