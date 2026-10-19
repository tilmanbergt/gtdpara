import {device} from '../../test-helpers/fakeDevice/device';
import {expectShows, openApp, tap, tapTab} from '../../test-helpers/scenario/app';
import {dataFile, fileText, PATHS, projectDir, projectFile, putFile} from '../../test-helpers/scenario/files';
import {and, given, scenario, then, when} from '../../test-helpers/scenario/scenario';

const year = String(new Date().getFullYear());
const archiveDir = `${PATHS.archive}/${year}/Website`;

scenario('Close out a finished project: PDF, archive folder and Archived status', {feature: 'Close-out', design: 'technical-design-project-close-out.md'}, () => {
  given('project "Website" has only done todos and a meeting note in its folder', () => {
    putFile(projectFile('Website'), dataFile('project', {Scope: ['Relaunch the site.'], Tasks: ['- [x] Write copy'], Meetings: []}, ['abbrev: WEB']));
    device().sdk.putNote(`${projectDir('Website')}/Meetings/Kick-off.note`);
  });
  when('I open its page, tap "Close out…" and go through the checklist, contents and outcomes', async () => {
    await openApp();
    await tapTab('Projects');
    await tap(/^Website/);
    await tap('🗄 Close out…');
    expectShows('Readiness · all clear');
    await tap('Next: Contents ›');
    await tap('Next: Outcomes ›');
    await tap('Next: PDF ›');
  });
  and('I create the PDF and confirm I checked it', async () => {
    await tap('Create PDF');
    expectShows(/^✓ PDF created · \d+ pages/);
    await tap('I checked the PDF - it looks right');
    await tap('Next: Archive ›');
  });
  then('the Archive step lists what will happen before it happens', () => {
    expectShows(`Project PDF → 4 Archive/${year}/Website.pdf`);
    expectShows(`Project folder → 4 Archive/${year}/Website/`);
  });
  when('I tap "Archive now"', () => tap('Archive now'));
  then('the project folder, with its note, is in the archive and gone from Projects', () => {
    expect(device().fs.exists(`${archiveDir}/project.txt`)).toBe(true);
    expect(device().fs.exists(`${archiveDir}/Meetings/Kick-off.note`)).toBe(true);
    expect(device().fs.exists(projectFile('Website'))).toBe(false);
  });
  and('the PDF sits next to it and holds the project record', () => {
    const pdf = device().pdf.builds.at(-1)!;
    expect(fileText(`${PATHS.archive}/${year}/Website.pdf`)).toContain('%PDF-fake');
    expect(pdf.pages).toBeGreaterThan(0);
    expect(JSON.stringify(pdf.spec)).toContain('Relaunch the site.');
  });
  and('its project.txt says archived, and the screen says so', () => {
    expect(fileText(`${archiveDir}/project.txt`)).toMatch(/^status: archived$/m);
    expectShows('✓ Website is archived');
  });
});
