import {device} from '../../test-helpers/fakeDevice/device';
import {expectNotShows, expectShows, openApp, reopenApp, tap, tapTab} from '../../test-helpers/scenario/app';
import {dataFile, fileText, projectFile, putFile} from '../../test-helpers/scenario/files';
import {and, given, scenario, then, when} from '../../test-helpers/scenario/scenario';
import {DEFAULT_SETTINGS} from '../../src/domain/settings';
import {serializeProfile} from '../../src/domain/profiles';

const DESIGN = 'technical-design-kept-gtd.md';
const OLD_PROFILES = '/storage/emulated/0/EXPORT/gtdpara/profiles';
const NEW_PROFILES = '/storage/emulated/0/EXPORT/kept-gtd/profiles';
const COPIED_TWO = 'Copied 2 profiles from EXPORT/gtdpara - you can delete that folder.';

const profile = (name: string, inboxFolder: string) =>
  serializeProfile(name, {...DEFAULT_SETTINGS, inboxFolder}, new Date('2026-10-01T09:00:00Z'), '0.19.0');

/** The old folder as gtdpara 0.19 left it: two profiles of my own and the demo profile. */
function putOldProfiles(): void {
  putFile(`${OLD_PROFILES}/work.json`, profile('Work', 'Work Inbox'));
  putFile(`${OLD_PROFILES}/home.json`, profile('Home', 'Home Inbox'));
  putFile(`${OLD_PROFILES}/demo.json`, profile('Demo', 'Demo Inbox'));
}

const writesUnder = (folder: string, from = 0) =>
  device().fs.calls.slice(from).filter(c => c.method === 'writeTextFile' && c.path.startsWith(folder + '/'));

scenario('Saved profiles are copied once into the new export folder', {feature: 'Profiles and demo space', design: DESIGN}, () => {
  given('EXPORT/gtdpara/profiles holds work.json, home.json and the demo profile, and EXPORT/kept-gtd/profiles does not exist', () => {
    putOldProfiles();
  });
  when('Kept GTD starts', () => openApp());
  then('work.json and home.json are in EXPORT/kept-gtd/profiles with the same content, the demo profile is not', () => {
    expect(fileText(`${NEW_PROFILES}/work.json`)).toBe(fileText(`${OLD_PROFILES}/work.json`));
    expect(fileText(`${NEW_PROFILES}/home.json`)).toBe(fileText(`${OLD_PROFILES}/home.json`));
    expect(device().fs.exists(`${NEW_PROFILES}/demo.json`)).toBe(false);
  });
  and('the old folder is unchanged, and the status line says what was copied', () => {
    expect(device().fs.paths(OLD_PROFILES).sort()).toEqual([`${OLD_PROFILES}/demo.json`, `${OLD_PROFILES}/home.json`, `${OLD_PROFILES}/work.json`]);
    expect(writesUnder(OLD_PROFILES)).toEqual([]);
    expectShows(COPIED_TWO);
  });
  when('Kept GTD starts again', async () => {
    const before = device().fs.calls.length;
    await reopenApp();
    expect(writesUnder(NEW_PROFILES, before)).toEqual([]);
  });
  then('no file is written to the profiles folder and no copy message appears', () => {
    expectNotShows(COPIED_TWO);
  });
});

scenario('Profiles are not copied when the new export folder is already in use', {feature: 'Profiles and demo space', design: DESIGN}, () => {
  given('EXPORT/kept-gtd/profiles holds work.json and the old folder holds home.json', () => {
    putFile(`${NEW_PROFILES}/work.json`, profile('Work', 'Work Inbox'));
    putFile(`${OLD_PROFILES}/home.json`, profile('Home', 'Home Inbox'));
  });
  when('Kept GTD starts', () => openApp());
  then('nothing is copied and no copy message appears', () => {
    expect(device().fs.exists(`${NEW_PROFILES}/home.json`)).toBe(false);
    expectNotShows(/^Copied \d+ profiles? from/);
  });
});

scenario('A fresh install copies no profiles', {feature: 'Profiles and demo space', design: DESIGN}, () => {
  given('neither export folder exists', () => undefined);
  when('Kept GTD starts', () => openApp());
  then('nothing is copied, no copy message appears and nothing is written under EXPORT/gtdpara', () => {
    expect(device().fs.paths(NEW_PROFILES)).toEqual([]);
    expectNotShows(/^Copied \d+ profiles? from/);
    expect(device().fs.paths('/storage/emulated/0/EXPORT/gtdpara')).toEqual([]);
  });
});

scenario('The demo space lives in Note/kept-gtd-demo', {feature: 'Profiles and demo space', design: DESIGN}, () => {
  given('an empty PARA folder', () => undefined);
  when('I create the demo space in Settings → Advanced and switch to it', async () => {
    await openApp();
    await tapTab('Settings');
    await tap('Advanced');
    await tap('Create demo space');
    await tap('Switch');
    await tap('Switch');
  });
  then('its folders are under Note/kept-gtd-demo and nothing is written under Note/gtdpara-demo', () => {
    expect(device().fs.paths('/storage/emulated/0/Note/kept-gtd-demo').some(p => p.endsWith('/Inbox.txt'))).toBe(true);
    expect(device().fs.paths('/storage/emulated/0/Note/gtdpara-demo')).toEqual([]);
  });
});

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
  then('one kept-gtd-debug file is in EXPORT/kept-gtd/debug, it says Kept GTD, and the status line names it', () => {
    const bundles = device()
      .fs.paths('/storage/emulated/0/EXPORT/kept-gtd/debug')
      .filter(p => /\/kept-gtd-debug-[^/]+\.txt$/.test(p));
    expect(bundles).toHaveLength(1);
    expect(fileText(bundles[0])).toMatch(/^=== Kept GTD debug bundle ===\n/);
    expectShows(new RegExp(`^Saved EXPORT/kept-gtd/debug/${bundles[0].slice(bundles[0].lastIndexOf('/') + 1)} - check it before sharing\\.$`));
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
