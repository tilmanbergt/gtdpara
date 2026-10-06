#!/usr/bin/env node
// Build info, changelog and user guide (in-app help) for the app, and small helpers for release.ps1.
// Design: docs/dev/history/technical-design-versioning-release.md
//
//   node scripts/gen-bundled-content.mjs                  dev: write src/generated/* (versionCode 0)
//   node scripts/gen-bundled-content.mjs --build [--stage alpha|beta]
//                                                        + compute versionCode, write build/build-info.json
//   node scripts/gen-bundled-content.mjs --patch-config <PluginConfig.json copy>
//   node scripts/gen-bundled-content.mjs --release-notes <x.y.z> <outfile>
//   node scripts/gen-bundled-content.mjs --next-version <patch|minor|major>   prints the next version
//   node scripts/gen-bundled-content.mjs --check-release <x.y.z>              exit 1 + message if not releasable
//   node scripts/gen-bundled-content.mjs --set-version <x.y.z>                package.json + PluginConfig.json versionName
//   node scripts/gen-bundled-content.mjs --set-next <x.y.z>                   package.json nextVersion (the release being worked on)
//   node scripts/gen-bundled-content.mjs --target-version                     prints nextVersion if it is above version, else nothing
//   node scripts/gen-bundled-content.mjs --stamp-changelog <x.y.z> <YYYY-MM-DD>

import {execFileSync} from 'node:child_process';
import {existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  BUILD_STAGES,
  bumpVersion,
  buildLabel,
  compareVersions,
  computeVersionCode,
  isSemver,
  packagedVersionName,
  parseChangelog,
  releaseNotes,
  renderBuildInfoTs,
  renderChangelogTs,
  selectChangelogForApp,
  setJsonStringField,
  stampChangelog,
  targetVersion,
  unreleasedIsEmpty,
} from './lib/versioning.mjs';
import {buildUserDocs, renderUserDocsTs} from './lib/userDocs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const P = {
  pkg: join(ROOT, 'package.json'),
  pluginConfig: join(ROOT, 'PluginConfig.json'),
  changelog: join(ROOT, 'CHANGELOG.md'),
  userDocsDir: join(ROOT, 'docs', 'user'),
  generatedDir: join(ROOT, 'src', 'generated'),
  buildDir: join(ROOT, 'build'),
  buildInfoJson: join(ROOT, 'build', 'build-info.json'),
  lastVersionCode: join(ROOT, 'build', 'last-version-code'),
};

function read(path) {
  // Strip a UTF-8 BOM (PowerShell 5.1's Set-Content -Encoding UTF8 writes one).
  return readFileSync(path, 'utf8').replace(/^﻿/, '');
}

/** Writes only when the content changed (keeps Metro/tsc from seeing needless changes). */
function writeIfChanged(path, content) {
  if (existsSync(path) && read(path) === content) return false;
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, content, 'utf8');
  return true;
}

function git(args) {
  try {
    return execFileSync('git', args, {cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).trim();
  } catch {
    return null;
  }
}

function packageVersion() {
  const v = JSON.parse(read(P.pkg)).version;
  if (!isSemver(v)) throw new Error(`package.json version "${v}" is not x.y.z`);
  return v;
}

function packageNextVersion() {
  const v = JSON.parse(read(P.pkg)).nextVersion;
  return typeof v === 'string' && isSemver(v) ? v : null;
}

function snPluginLibVersion() {
  try {
    return JSON.parse(read(join(ROOT, 'node_modules', 'sn-plugin-lib', 'package.json'))).version || 'unknown';
  } catch {
    const spec = JSON.parse(read(P.pkg)).dependencies?.['sn-plugin-lib'];
    return spec ? String(spec) : 'unknown';
  }
}

function gitInfo(version) {
  const commit = git(['rev-parse', '--short=7', 'HEAD']) || 'unknown';
  const status = git(['status', '--porcelain']);
  const dirty = status === null ? false : status.length > 0;
  const tags = (git(['tag', '--points-at', 'HEAD']) || '').split(/\s+/).filter(Boolean);
  const tagged = tags.includes(`v${version}`);
  return {commit, dirty, release: tagged && !dirty && commit !== 'unknown'};
}

function generate({build, stage = 'alpha'}) {
  if (!BUILD_STAGES.includes(stage)) throw new Error(`unknown stage "${stage}" (${BUILD_STAGES.join(', ')})`);
  const version = packageVersion();
  const nextVersion = packageNextVersion();
  const {commit, dirty, release} = gitInfo(version);
  const target = release ? null : targetVersion(version, nextVersion);
  let versionCode = 0;
  if (build) {
    const last = existsSync(P.lastVersionCode) ? parseInt(read(P.lastVersionCode).trim(), 10) : 0;
    versionCode = computeVersionCode(Date.now(), last);
  }
  const info = {
    version,
    versionCode,
    label: buildLabel({version, commit, dirty, release, nextVersion, stage}),
    versionName: packagedVersionName({version, release, nextVersion, stage}),
    nextVersion: target,
    stage: target ? stage : null,
    commit,
    dirty,
    release,
    builtAt: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    snPluginLib: snPluginLibVersion(),
  };

  const changelog = existsSync(P.changelog)
    ? selectChangelogForApp(parseChangelog(read(P.changelog)), {includeUnreleased: !release})
    : [];

  // builtAt changes every run; only rewrite buildInfo.ts in build mode or when
  // anything else differs, so `npm run gen` doesn't touch it needlessly.
  const buildInfoPath = join(P.generatedDir, 'buildInfo.ts');
  const prev = existsSync(buildInfoPath) ? read(buildInfoPath) : '';
  const withoutDate = s => s.replace(/builtAt: .*/, '');
  const next = renderBuildInfoTs(info);
  if (build || withoutDate(prev) !== withoutDate(next)) writeIfChanged(buildInfoPath, next);
  writeIfChanged(join(P.generatedDir, 'changelog.ts'), renderChangelogTs(changelog));
  // In-app help (docs/dev/history/technical-design-in-app-help.md §3.1).
  const docFiles = existsSync(P.userDocsDir)
    ? readdirSync(P.userDocsDir)
        .filter(f => f.endsWith('.md'))
        .map(f => ({id: f.slice(0, -3), markdown: read(join(P.userDocsDir, f))}))
    : [];
  writeIfChanged(join(P.generatedDir, 'userDocs.ts'), renderUserDocsTs(buildUserDocs(docFiles)));

  if (build) {
    mkdirSync(P.buildDir, {recursive: true});
    writeFileSync(P.lastVersionCode, String(versionCode), 'utf8');
    writeFileSync(P.buildInfoJson, JSON.stringify(info, null, 2) + '\n', 'utf8');
    const cfgVersion = /"versionName"\s*:\s*"([^"]*)"/.exec(read(P.pluginConfig))?.[1];
    if (cfgVersion !== version) {
      console.warn(
        `WARNING: package.json version ${version} differs from PluginConfig.json versionName ${cfgVersion}` +
          ' (the package gets ' + version + ').',
      );
    }
    console.log(`gtdpara ${info.label}  build ${versionCode}${dirty ? '  (uncommitted changes!)' : ''}`);
    if (!release && !target) {
      console.warn(`No next version set - this build is labelled after ${version}. Set it with: npm run next-version -- <x.y.z>`);
    }
  } else {
    console.log(`src/generated updated: gtdpara ${info.label}`);
  }
}

function patchConfig(path) {
  if (!existsSync(P.buildInfoJson)) throw new Error('build/build-info.json missing - run with --build first');
  const info = JSON.parse(read(P.buildInfoJson));
  let text = read(path);
  text = setJsonStringField(text, 'versionName', info.versionName || info.version);
  text = setJsonStringField(text, 'versionCode', String(info.versionCode));
  writeFileSync(path, text, 'utf8');
  console.log(`Patched ${path}: versionName ${info.versionName || info.version}, versionCode ${info.versionCode}`);
}

function checkRelease(version) {
  const problems = [];
  if (!isSemver(version)) problems.push(`"${version}" is not x.y.z`);
  const changelog = read(P.changelog);
  if (unreleasedIsEmpty(changelog)) problems.push('CHANGELOG.md: the [Unreleased] section is empty');
  if (parseChangelog(changelog).some(r => r.version === version)) {
    problems.push(`CHANGELOG.md already has a section for ${version}`);
  }
  if (problems.length) {
    problems.forEach(p => console.error(p));
    process.exit(1);
  }
}

function setVersion(version) {
  if (!isSemver(version)) throw new Error(`"${version}" is not x.y.z`);
  writeFileSync(P.pkg, setJsonStringField(read(P.pkg), 'version', version), 'utf8');
  writeFileSync(P.pluginConfig, setJsonStringField(read(P.pluginConfig), 'versionName', version), 'utf8');
  console.log(`Version set to ${version} (package.json, PluginConfig.json)`);
}

/** Sets package.json's nextVersion - the release the following builds are for. */
function setNext(version) {
  if (!isSemver(version)) throw new Error(`"${version}" is not x.y.z`);
  const current = packageVersion();
  if (compareVersions(version, current) <= 0) throw new Error(`next version ${version} must be above the current version ${current}`);
  let text = read(P.pkg);
  if (/"nextVersion"\s*:/.test(text)) text = setJsonStringField(text, 'nextVersion', version);
  else text = text.replace(/("version"\s*:\s*"[^"]*",)/, `$1\n  "nextVersion": "${version}",`);
  writeFileSync(P.pkg, text, 'utf8');
  console.log(`Next version set to ${version}: builds are now labelled ${version}-alpha / ${version}-beta`);
}

function main(argv) {
  const [cmd, a, b] = argv;
  switch (cmd) {
    case undefined:
      return generate({build: false});
    case '--build': {
      const stage = a === '--stage' ? b : 'alpha';
      return generate({build: true, stage});
    }
    case '--set-next':
      return setNext(a);
    case '--target-version': {
      const target = targetVersion(packageVersion(), packageNextVersion());
      if (target) console.log(target);
      return;
    }
    case '--patch-config':
      if (!a) throw new Error('--patch-config needs a path');
      return patchConfig(resolve(a));
    case '--release-notes':
      if (!a || !b) throw new Error('--release-notes needs <version> <outfile>');
      writeFileSync(resolve(b), releaseNotes(read(P.changelog), a) + '\n', 'utf8');
      return;
    case '--next-version':
      return console.log(bumpVersion(packageVersion(), a));
    case '--check-release':
      return checkRelease(a);
    case '--set-version':
      return setVersion(a);
    case '--stamp-changelog':
      if (!a || !b) throw new Error('--stamp-changelog needs <version> <YYYY-MM-DD>');
      writeFileSync(P.changelog, stampChangelog(read(P.changelog), a, b), 'utf8');
      return console.log(`CHANGELOG.md: [Unreleased] -> [${a}] — ${b}`);
    default:
      throw new Error(`unknown option ${cmd}`);
  }
}

try {
  main(process.argv.slice(2));
} catch (e) {
  console.error(`gen-bundled-content: ${e.message}`);
  process.exit(1);
}
