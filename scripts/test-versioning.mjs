// Plain-node checks for scripts/lib/versioning.mjs.  Run: node scripts/test-versioning.mjs
import assert from 'node:assert/strict';
import {
  bumpVersion,
  buildLabel,
  compareVersions,
  computeVersionCode,
  packagedVersionName,
  parseChangelog,
  releaseNotes,
  renderBuildInfoTs,
  renderChangelogTs,
  selectChangelogForApp,
  setJsonStringField,
  stampChangelog,
  unreleasedIsEmpty,
  VERSION_CODE_EPOCH_MS,
} from './lib/versioning.mjs';

let n = 0;
function t(name, fn) {
  fn();
  n++;
}

t('bump', () => {
  assert.equal(bumpVersion('0.1.9', 'patch'), '0.1.10');
  assert.equal(bumpVersion('0.1.9', 'minor'), '0.2.0');
  assert.equal(bumpVersion('0.9.3', 'major'), '1.0.0');
  assert.throws(() => bumpVersion('0.1', 'patch'));
  assert.throws(() => bumpVersion('0.1.0', 'huge'));
});

t('versionCode', () => {
  const at = (iso) => Date.parse(iso);
  assert.equal(computeVersionCode(VERSION_CODE_EPOCH_MS, 0), 1); // minute 0, but > last
  assert.equal(computeVersionCode(at('2026-01-01T01:00:59Z'), 0), 60);
  assert.equal(computeVersionCode(at('2026-01-01T01:00:59Z'), 60), 61); // same minute twice
  assert.equal(computeVersionCode(at('2026-01-01T01:00:59Z'), 5000), 5001); // never goes back
  assert.equal(computeVersionCode(at('2026-01-01T01:00:00Z'), NaN), 60);
  const sept = computeVersionCode(at('2026-09-30T12:00:00Z'), 15);
  assert.ok(sept > 390000 && sept < 395000, String(sept));
});

t('label', () => {
  assert.equal(buildLabel({version: '0.1.0', commit: 'abc1234', dirty: false, release: true}), '0.1.0');
  assert.equal(buildLabel({version: '0.1.0', commit: 'abc1234', dirty: false, release: false}), '0.1.0+dev.abc1234');
  assert.equal(buildLabel({version: '0.1.0', commit: 'abc1234', dirty: true, release: false}), '0.1.0+dev.abc1234-dirty');
});

t('label towards a next version', () => {
  const base = {version: '0.8.0', commit: 'abc1234', dirty: false, release: false, nextVersion: '0.9.0'};
  assert.equal(buildLabel(base), '0.9.0-alpha+abc1234');
  assert.equal(buildLabel({...base, stage: 'beta'}), '0.9.0-beta+abc1234');
  assert.equal(buildLabel({...base, dirty: true}), '0.9.0-alpha+abc1234.dirty');
  // A release build ignores nextVersion; a nextVersion not above version is ignored.
  assert.equal(buildLabel({...base, release: true}), '0.8.0');
  assert.equal(buildLabel({...base, nextVersion: '0.8.0'}), '0.8.0+dev.abc1234');
  assert.equal(buildLabel({...base, nextVersion: null}), '0.8.0+dev.abc1234');
  assert.equal(packagedVersionName(base), '0.9.0-alpha');
  assert.equal(packagedVersionName({...base, stage: 'beta'}), '0.9.0-beta');
  assert.equal(packagedVersionName({...base, release: true}), '0.8.0');
  assert.equal(packagedVersionName({...base, nextVersion: '0.7.0'}), '0.8.0');
});

t('compare versions', () => {
  assert.equal(compareVersions('0.9.0', '0.8.0'), 1);
  assert.equal(compareVersions('0.10.0', '0.9.0'), 1);
  assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
  assert.equal(compareVersions('0.8.1', '0.9.0'), -1);
  assert.throws(() => compareVersions('0.9', '0.8.0'));
});

const CL = [
  '# Changelog',
  '',
  'Intro text.',
  '',
  '## [Unreleased]',
  '',
  '### New',
  '- thing',
  '',
  '## [0.2.0] — 2026-11-02',
  '### Fixed',
  '- bug',
  '',
  '## [0.1.1] - 2026-10-20',
  '- hyphen heading',
  '',
  '## [0.1.0] – 2026-10-12',
  '- first',
  '',
].join('\r\n');

t('parse', () => {
  const r = parseChangelog(CL);
  assert.deepEqual(r.map(x => [x.version, x.date]), [
    ['Unreleased', null],
    ['0.2.0', '2026-11-02'],
    ['0.1.1', '2026-10-20'],
    ['0.1.0', '2026-10-12'],
  ]);
  assert.equal(r[0].markdown, '### New\n- thing');
  assert.ok(!r[1].markdown.includes('\r'));
  assert.equal(releaseNotes(CL, '0.2.0'), '### Fixed\n- bug');
  assert.throws(() => releaseNotes(CL, '9.9.9'));
});

t('select for app', () => {
  const r = parseChangelog(CL);
  assert.deepEqual(selectChangelogForApp(r, {includeUnreleased: true}).map(x => x.version), ['Unreleased', '0.2.0', '0.1.1', '0.1.0']);
  assert.deepEqual(selectChangelogForApp(r, {includeUnreleased: false}).map(x => x.version), ['0.2.0', '0.1.1', '0.1.0']);
  assert.deepEqual(selectChangelogForApp(r, {includeUnreleased: false, maxReleases: 2}).map(x => x.version), ['0.2.0', '0.1.1']);
  const empty = parseChangelog('## [Unreleased]\n\n## [0.1.0] - 2026-10-12\n- a\n');
  assert.deepEqual(selectChangelogForApp(empty, {includeUnreleased: true}).map(x => x.version), ['0.1.0']);
});

t('unreleased empty', () => {
  assert.equal(unreleasedIsEmpty(CL), false);
  assert.equal(unreleasedIsEmpty('# C\n\n## [Unreleased]\n\n\n## [0.1.0] - 2026-10-12\n- a\n'), true);
  assert.equal(unreleasedIsEmpty('# C\n'), true);
});

t('stamp', () => {
  const out = stampChangelog(CL, '0.3.0', '2026-12-01');
  assert.ok(out.includes('## [Unreleased]\r\n\r\n## [0.3.0] — 2026-12-01\r\n'));
  assert.ok(!/[^\r]\n/.test(out), 'keeps CRLF');
  const r = parseChangelog(out);
  assert.equal(r[0].version, 'Unreleased');
  assert.equal(r[0].markdown, '');
  assert.equal(r[1].version, '0.3.0');
  assert.equal(r[1].markdown, '### New\n- thing');
  assert.throws(() => stampChangelog(out, '0.4.0', '2026-12-02'), /empty/);
  assert.throws(() => stampChangelog(CL, '0.2.0', '2026-12-02'), /already/);
});

t('json field', () => {
  const cfg = '{\r\n  "versionName": "0.0.1",\r\n  "versionCode": "15",\r\n  "pluginID": "x"\r\n}\r\n';
  const out = setJsonStringField(setJsonStringField(cfg, 'versionName', '0.1.0'), 'versionCode', '392417');
  assert.equal(out, '{\r\n  "versionName": "0.1.0",\r\n  "versionCode": "392417",\r\n  "pluginID": "x"\r\n}\r\n');
  assert.throws(() => setJsonStringField(cfg, 'nope', '1'));
  const pkg = '{\n  "name": "gtdpara",\n  "version": "0.0.1",\n  "dependencies": {"react": "19.0.0"}\n}\n';
  assert.ok(setJsonStringField(pkg, 'version', '0.1.0').includes('"version": "0.1.0"'));
});

t('render', () => {
  const ts = renderBuildInfoTs({version: '0.1.0', versionCode: 5, label: '0.1.0', commit: 'a"b', dirty: false, release: true, builtAt: 'X'});
  assert.ok(ts.includes('commit: "a\\"b",'));
  assert.ok(ts.includes('release: true,'));
  const cl = renderChangelogTs([{version: '0.1.0', date: null, markdown: 'line "1"\nline 2'}]);
  assert.ok(cl.includes('date: null'));
  assert.ok(cl.includes('"line \\"1\\"\\nline 2"'));
});

console.log(`versioning: ${n} groups passed`);
