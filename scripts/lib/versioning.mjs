// Pure helpers for versioning, build info and the changelog.
// No I/O here, so scripts/test-versioning.mjs can test them directly.
// Design: docs/dev/technical-design-versioning-release.md

/** versionCode epoch: 2026-01-01T00:00:00Z. */
export const VERSION_CODE_EPOCH_MS = Date.UTC(2026, 0, 1);

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/;

export function isSemver(v) {
  return SEMVER.test(v);
}

/** 'patch' | 'minor' | 'major' applied to "x.y.z". */
export function bumpVersion(version, kind) {
  const m = SEMVER.exec(version);
  if (!m) throw new Error(`not a x.y.z version: "${version}"`);
  let [maj, min, pat] = m.slice(1).map(Number);
  if (kind === 'major') return `${maj + 1}.0.0`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  if (kind === 'patch') return `${maj}.${min}.${pat + 1}`;
  throw new Error(`unknown bump "${kind}" (patch, minor or major)`);
}

/**
 * Minutes since 2026-01-01 UTC, but always at least lastCode + 1, so it is
 * strictly increasing even for two builds within the same minute.
 */
export function computeVersionCode(nowMs, lastCode) {
  const minutes = Math.floor((nowMs - VERSION_CODE_EPOCH_MS) / 60000);
  const last = Number.isFinite(lastCode) ? lastCode : 0;
  return Math.max(minutes, last + 1);
}

export const BUILD_STAGES = ['alpha', 'beta'];

/** -1, 0 or 1 for two "x.y.z" versions. */
export function compareVersions(a, b) {
  const pa = SEMVER.exec(a);
  const pb = SEMVER.exec(b);
  if (!pa || !pb) throw new Error(`not x.y.z versions: "${a}", "${b}"`);
  for (let i = 1; i <= 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/** The release this build works towards: `nextVersion` when it is above `version`, else null. */
export function targetVersion(version, nextVersion) {
  if (!nextVersion || !isSemver(nextVersion)) return null;
  return compareVersions(nextVersion, version) > 0 ? nextVersion : null;
}

/**
 * The build label:
 * - release build (HEAD tagged v<version>, clean): "0.9.0"
 * - work towards a next version: "0.9.0-alpha+a1b2c3d" (".dirty" appended for uncommitted changes)
 * - otherwise: "0.8.0+dev.a1b2c3d[-dirty]"
 */
export function buildLabel({version, commit, dirty, release, nextVersion = null, stage = 'alpha'}) {
  if (release) return version;
  const target = targetVersion(version, nextVersion);
  if (target) return `${target}-${stage}+${commit || 'unknown'}${dirty ? '.dirty' : ''}`;
  return `${version}+dev.${commit || 'unknown'}${dirty ? '-dirty' : ''}`;
}

/** What the packaged PluginConfig.json shows as versionName: "0.9.0", or "0.9.0-alpha" for a build towards 0.9.0. */
export function packagedVersionName({version, release, nextVersion = null, stage = 'alpha'}) {
  if (release) return version;
  const target = targetVersion(version, nextVersion);
  return target ? `${target}-${stage}` : version;
}

function eolOf(text) {
  return text.includes('\r\n') ? '\r\n' : '\n';
}

const RELEASE_HEADING = /^## \[([^\]]+)\](?:\s*[—–-]\s*(\d{4}-\d{2}-\d{2}))?\s*$/;

/**
 * Splits CHANGELOG.md into releases, newest first as written:
 * [{version: 'Unreleased' | 'x.y.z', date: 'YYYY-MM-DD' | null, markdown}].
 * Text above the first "## " heading is ignored. markdown is trimmed and
 * always uses "\n" line endings.
 */
export function parseChangelog(text) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const releases = [];
  let current = null;
  for (const line of lines) {
    if (line.startsWith('## ')) {
      const m = RELEASE_HEADING.exec(line);
      current = m ? {version: m[1], date: m[2] || null, body: []} : null;
      if (current) releases.push(current);
      continue;
    }
    if (current) current.body.push(line);
  }
  return releases.map(r => ({
    version: r.version,
    date: r.date,
    markdown: r.body.join('\n').trim(),
  }));
}

/**
 * What goes into the app: released versions (at most maxReleases), plus the
 * Unreleased section first when includeUnreleased and it isn't empty.
 */
export function selectChangelogForApp(releases, {includeUnreleased, maxReleases = 5}) {
  const out = [];
  const unreleased = releases.find(r => r.version === 'Unreleased');
  if (includeUnreleased && unreleased && unreleased.markdown) out.push(unreleased);
  out.push(...releases.filter(r => r.version !== 'Unreleased').slice(0, maxReleases));
  return out;
}

export function releaseNotes(text, version) {
  const r = parseChangelog(text).find(x => x.version === version);
  if (!r) throw new Error(`CHANGELOG.md has no section for ${version}`);
  return r.markdown;
}

export function unreleasedIsEmpty(text) {
  const r = parseChangelog(text).find(x => x.version === 'Unreleased');
  return !r || !r.markdown;
}

/**
 * Turns "## [Unreleased]" into "## [<version>] — <date>" and puts a fresh
 * empty "## [Unreleased]" above it. Keeps the file's line endings.
 */
export function stampChangelog(text, version, date) {
  if (!isSemver(version)) throw new Error(`not a x.y.z version: "${version}"`);
  if (parseChangelog(text).some(r => r.version === version)) {
    throw new Error(`CHANGELOG.md already has a section for ${version}`);
  }
  if (unreleasedIsEmpty(text)) throw new Error('the [Unreleased] section of CHANGELOG.md is empty');
  const eol = eolOf(text);
  const heading = /^## \[Unreleased\][ \t]*$/m;
  return text.replace(heading, `## [Unreleased]${eol}${eol}## [${version}] — ${date}`);
}

/** Replaces the value of a top-level-looking "key": "value" pair, keeping formatting. */
export function setJsonStringField(text, key, value) {
  const re = new RegExp(`("${key}"\\s*:\\s*)"[^"]*"`);
  if (!re.test(text)) throw new Error(`field "${key}" not found`);
  return text.replace(re, `$1"${value}"`);
}

/** TypeScript source for src/generated/buildInfo.ts. */
export function renderBuildInfoTs(info) {
  return [
    '// GENERATED by scripts/gen-bundled-content.mjs - do not edit, not committed.',
    '// docs/dev/technical-design-versioning-release.md',
    '/* eslint-disable */',
    'export const BUILD_INFO = {',
    `  version: ${JSON.stringify(info.version)},`,
    `  /** Build number (minutes since 2026-01-01 UTC); 0 when generated outside a build. */`,
    `  versionCode: ${Number(info.versionCode) || 0},`,
    `  /** "0.9.0" for a release, "0.9.0-alpha+a1b2c3d" towards a next version, "0.8.0+dev.a1b2c3d" otherwise. */`,
    `  label: ${JSON.stringify(info.label)},`,
    `  /** The release this build works towards ("0.9.0"), or null. */`,
    `  nextVersion: ${JSON.stringify(info.nextVersion ?? null)},`,
    `  /** "alpha" or "beta" for a build towards nextVersion, else null. */`,
    `  stage: ${JSON.stringify(info.stage ?? null)},`,
    `  commit: ${JSON.stringify(info.commit)},`,
    `  dirty: ${info.dirty ? 'true' : 'false'},`,
    `  release: ${info.release ? 'true' : 'false'},`,
    `  builtAt: ${JSON.stringify(info.builtAt)},`,
    `  /** Installed sn-plugin-lib version at build time. */`,
    `  snPluginLib: ${JSON.stringify(info.snPluginLib || 'unknown')},`,
    '} as const;',
    '',
  ].join('\n');
}

/** TypeScript source for src/generated/changelog.ts. */
export function renderChangelogTs(releases) {
  const items = releases.map(
    r =>
      `  {version: ${JSON.stringify(r.version)}, date: ${JSON.stringify(r.date)}, markdown: ${JSON.stringify(
        r.markdown,
      )}},`,
  );
  return [
    '// GENERATED by scripts/gen-bundled-content.mjs from CHANGELOG.md - do not edit, not committed.',
    '/* eslint-disable */',
    'export interface ChangelogRelease {',
    '  version: string;',
    '  date: string | null;',
    '  markdown: string;',
    '}',
    '',
    '/** Newest first. "Unreleased" appears only in non-release builds. */',
    'export const CHANGELOG: ChangelogRelease[] = [',
    ...items,
    '];',
    '',
  ].join('\n');
}
