import {device} from '../../test-helpers/fakeDevice/device';
import {closeApp, expectShows, openApp, runIntegrityCheck, shows, tap, tapLabel, tapTab, type} from '../../test-helpers/scenario/app';
import {dataFile, INBOX_FILE, PATHS, projectDir, projectFile, putFile} from '../../test-helpers/scenario/files';
import {and, freshDevice, given, scenario, then, when} from '../../test-helpers/scenario/scenario';

// docs/dev/history/technical-design-quality-hardening.md §5: a flow stopped after any single
// file write loses nothing, and is either complete, can be finished, or is named by the
// Integrity Check.

/** Stops the app's file system after `writes` more writes, runs `action`, and starts again. */
async function stopAfter(writes: number, action: () => Promise<void>): Promise<void> {
  device().fs.crashAfter(writes);
  await action();
  await closeApp();
  device().fs.restart();
}

const NOTE_IN_INBOX = `${PATHS.inboxFolder}/Todos/Call Anna.note`;

/** Every line about "Call Anna" in the Inbox and in Website, with whether its note link resolves. */
function annaLines(): Array<{where: string; noteFound: boolean}> {
  const out: Array<{where: string; noteFound: boolean}> = [];
  for (const [file, dir, where] of [
    [INBOX_FILE, PATHS.inboxFolder, 'Inbox'],
    [projectFile('Website'), projectDir('Website'), 'Website'],
  ]) {
    for (const line of (device().fs.get(file) ?? '').split('\n').filter(l => l.includes('Call Anna'))) {
      const link = /\[\[([^\]]+)\]\]/.exec(line)?.[1] ?? '';
      out.push({where, noteFound: device().fs.exists(link.startsWith('/') ? link : `${dir}/${link}`)});
    }
  }
  return out;
}

const REFILE_WRITES = 6;

scenario('A refile with its note, stopped after any write, loses nothing and is repairable', {feature: 'Interruptions', design: 'technical-design-quality-hardening.md'}, () => {
  then('for every point where Kept GTD can be stopped: the todo and its note still exist, and a broken link is named with the note\'s new place', async () => {
    for (let n = 0; n <= REFILE_WRITES; n++) {
      await freshDevice();
      putFile(INBOX_FILE, dataFile('inbox', {Tasks: ['- [ ] Call Anna #next → [[Todos/Call Anna.note]]'], Meetings: []}));
      putFile(projectFile('Website'), dataFile('project', {Scope: [], Tasks: [], Meetings: []}, ['abbrev: WEB']));
      device().sdk.putNote(NOTE_IN_INBOX);

      await openApp();
      await tapTab('Inbox');
      await tap('Call Anna');
      await tapLabel('Refile');
      await tap('📁 Projects ›');
      await tap(/Website/);
      await stopAfter(n, () => tap('Move'));

      const lines = annaLines();
      const notes = device().fs.paths().filter(x => x.endsWith('Call Anna.note'));
      expect({n, todoKept: lines.length > 0, notes: notes.length}).toEqual({n, todoKept: true, notes: 1});
      await openApp();
      if (lines.some(l => !l.noteFound)) {
        expect({n, report: await runIntegrityCheck()}).toEqual({n, report: expect.stringContaining('a note with this name is in "1 Projects/Website/Todos/Call Anna.note"')});
      }
      await closeApp();
    }
  });
});

const year = String(new Date().getFullYear());
const archived = `${PATHS.archive}/${year}/Website`;
const ARCHIVE_WRITES = 7;

async function prepareCloseOut(): Promise<void> {
  await openApp();
  await tapTab('Projects');
  await tap(/^Website/);
  await tap('🗄 Close out…');
  for (const label of ['Next: Contents ›', 'Next: Outcomes ›', 'Next: PDF ›', 'Create PDF', 'I checked the PDF - it looks right', 'Next: Archive ›']) await tap(label);
}

scenario('A close-out stopped during "Archive now" can be finished, or is fully archived', {feature: 'Interruptions', design: 'technical-design-quality-hardening.md'}, () => {
  then('for every point where Kept GTD can be stopped: reopening the close-out and tapping "Archive now" finishes it, or the project is archived and the Integrity Check says what is left', async () => {
    for (let n = 0; n <= ARCHIVE_WRITES; n++) {
      await freshDevice();
      putFile(projectFile('Website'), dataFile('project', {Scope: ['Relaunch'], Tasks: ['- [x] Write copy'], Meetings: []}, ['abbrev: WEB']));
      device().sdk.putNote(`${projectDir('Website')}/Meetings/Kick-off.note`);
      await prepareCloseOut();
      await stopAfter(n, () => tap('Archive now'));

      await openApp();
      await tapTab('Projects');
      if (shows(/^Website +#WEB/)) {
        await tap(/^Website +#WEB/);
        await tap('🗄 Close out…');
        for (const label of ['Next: Contents ›', 'Next: Outcomes ›', 'Next: PDF ›', 'I checked the PDF - it looks right', 'Next: Archive ›']) if (shows(label)) await tap(label);
        await tap('Archive now');
        expectShows('✓ Website is archived');
      } else if (!/^status: archived$/m.test(device().fs.get(`${archived}/project.txt`) ?? '')) {
        expect({n, report: await runIntegrityCheck()}).toEqual({n, report: expect.stringContaining('it is fully archived, only "status:"')});
      }
      expect({n, folder: device().fs.exists(`${archived}/Meetings/Kick-off.note`), pdf: device().fs.exists(`${PATHS.archive}/${year}/Website.pdf`)}).toEqual({n, folder: true, pdf: true});
      await closeApp();
    }
  });
});

scenario('A project file saved with Windows line endings shows its todos', {feature: 'Your files', design: 'technical-design-quality-hardening.md'}, () => {
  given('project "Website" was saved in a Windows editor (CRLF line endings)', () => {
    putFile(projectFile('Website'), dataFile('project', {Scope: ['Relaunch'], Tasks: ['- [ ] Write copy #next', '- [ ] Fix footer'], Meetings: []}).replace(/\n/g, '\r\n'));
  });
  when('I open its page', async () => {
    await openApp();
    await tapTab('Projects');
    await tap(/^Website/);
  });
  then('both todos and the Scope show', () => {
    expectShows('Write copy');
    expectShows('Fix footer');
    expectShows('Relaunch');
  });
  and('adding a todo keeps both and writes the file with plain line endings', async () => {
    await type('New task', 'Call the designer');
    await tap('+ Add');
    const text = device().fs.get(projectFile('Website')) ?? '';
    expect(text).not.toContain('\r');
    expect(text).toMatch(/- \[ \] Write copy #next\n- \[ \] Fix footer\n- \[ \] Call the designer/);
  });
});
