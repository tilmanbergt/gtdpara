// The fake device must behave like the native GtdParaFile module (android/.../GtdParaFileModule.kt),
// or the scenario tests prove nothing (docs/dev/history/technical-design-quality-hardening.md §4.8).
import {FakeFs, PRIVATE_DIR, SimulatedCrash} from '../../test-helpers/fakeDevice/fakeFs';

let fs: FakeFs;
beforeEach(() => {
  fs = new FakeFs();
  fs.put('/N/1 Projects/Web/project.txt', 'web');
  fs.put('/N/1 Projects/Web/.project.txt.gtdpara-tmp', 'tmp');
  fs.put('/N/1 Projects/Web/x.mark', 'mark');
  fs.put('/N/1 Projects/Web/Meetings/a.note', '{}');
  fs.put('/N/1 Projects/alpha/project.txt', 'alpha');
});

it('lists sorted case-insensitively, hides dot and .mark files, tells folders from files', async () => {
  expect(await fs.module.listFolderEntries('/N/1 Projects')).toEqual([
    {name: 'alpha', path: '/N/1 Projects/alpha', isFolder: true},
    {name: 'Web', path: '/N/1 Projects/Web', isFolder: true},
  ]);
  expect((await fs.module.listFolderEntries('/N/1 Projects/Web')).map(e => [e.name, e.isFolder])).toEqual([
    ['Meetings', true],
    ['project.txt', false],
  ]);
  expect(await fs.module.listFolderEntries('/missing')).toEqual([]);
});

it('reads null for a missing file and stats like the native call', async () => {
  expect(await fs.module.readTextFile('/N/none.txt')).toBeNull();
  const [a, b] = await fs.module.statFiles(['/N/1 Projects/Web/project.txt', '/N/none.txt']);
  expect(a).toMatchObject({exists: true, size: 3});
  expect(b).toEqual({path: '/N/none.txt', exists: false, lastModified: 0, size: -1});
});

it('moves refuse an existing destination; merge refuses collisions and keeps the source folder', async () => {
  await expect(fs.module.moveFolder('/N/1 Projects/Web', '/N/1 Projects/alpha')).rejects.toThrow('already exists');
  await expect(fs.module.moveFile('/N/1 Projects/Web/project.txt', '/N/1 Projects/alpha/project.txt')).rejects.toThrow('already exists');
  await expect(fs.module.moveFolderMerge('/N/1 Projects/Web', '/N/1 Projects/alpha')).rejects.toThrow('Already in the destination: project.txt');
  fs.deleteExternally('/N/1 Projects/alpha/project.txt');
  await fs.module.moveFolderMerge('/N/1 Projects/Web', '/N/1 Projects/alpha');
  expect(fs.get('/N/1 Projects/alpha/Meetings/a.note')).toBe('{}');
  expect(fs.exists('/N/1 Projects/Web')).toBe(true);
  expect(await fs.module.listFolderEntries('/N/1 Projects/Web')).toEqual([]);
});

it('deletes only empty folders, and private trees only inside their folder', async () => {
  await expect(fs.module.deleteEmptyFolder('/N/1 Projects/Web')).rejects.toThrow('not empty');
  fs.mkdir('/N/empty');
  await fs.module.deleteEmptyFolder('/N/empty');
  expect(fs.exists('/N/empty')).toBe(false);
  await expect(fs.module.deleteTempTree('/N/1 Projects')).rejects.toThrow('Refusing');
  fs.put(`${PRIVATE_DIR}/tmp/job/page.png`, 'png');
  await fs.module.deleteTempTree(`${PRIVATE_DIR}/tmp/job`);
  expect(fs.exists(`${PRIVATE_DIR}/tmp/job/page.png`)).toBe(false);
});

it('fails the next matching call once, and crashes after n writes until restart', async () => {
  fs.failNext('writeTextFile', /alpha/);
  await fs.module.writeTextFile('/N/1 Projects/Web/project.txt', 'web 2');
  await expect(fs.module.writeTextFile('/N/1 Projects/alpha/project.txt', 'x')).rejects.toThrow('simulated failure');
  await fs.module.writeTextFile('/N/1 Projects/alpha/project.txt', 'alpha 2');
  fs.crashAfter(1);
  await fs.module.writeTextFile('/N/a.txt', 'a');
  await expect(fs.module.writeTextFile('/N/b.txt', 'b')).rejects.toBeInstanceOf(SimulatedCrash);
  await expect(fs.module.readTextFile('/N/a.txt')).rejects.toBeInstanceOf(SimulatedCrash);
  fs.restart();
  expect(await fs.module.readTextFile('/N/a.txt')).toBe('a');
  expect(fs.exists('/N/b.txt')).toBe(false);
});

it('an outside edit changes content and time', async () => {
  const [before] = await fs.module.statFiles(['/N/1 Projects/Web/project.txt']);
  fs.editExternally('/N/1 Projects/Web/project.txt', t => `${t}!`);
  const [after] = await fs.module.statFiles(['/N/1 Projects/Web/project.txt']);
  expect(fs.get('/N/1 Projects/Web/project.txt')).toBe('web!');
  expect(after.lastModified).toBeGreaterThan(before.lastModified);
});
