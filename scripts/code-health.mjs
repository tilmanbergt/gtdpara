#!/usr/bin/env node
// Code-health rules for the source and docs (rules: scripts/lib/codeHealth.mjs).
//
//   node scripts/code-health.mjs            report the findings, exit 0
//   node scripts/code-health.mjs --strict   exit 1 when there is any finding (used by npm run check)
//   node scripts/code-health.mjs --update-baseline
//                                           lower the allowed length of long files to their current size
//
// Design: docs/dev/technical-design-quality-0.9.md §3.1.

import {existsSync, readdirSync, readFileSync, statSync, writeFileSync} from 'node:fs';
import {dirname, join, relative, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {brokenDocReferences, checkSourceFile, formatReport, isSourceFile} from './lib/codeHealth.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'scripts', 'code-health-baseline.json');
const SKIP_DIRS = new Set(['node_modules', '.git', 'build', 'android', 'generated', 'Claude outputs', '.idea']);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(relative(ROOT, full).split('\\').join('/'));
  }
  return out;
}

function read(path) {
  return readFileSync(join(ROOT, path), 'utf8');
}

const files = walk(ROOT);
const docFiles = files.filter(f => f.startsWith('docs/dev/') && f.endsWith('.md'));
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).maxLines : {};

const findings = [];
for (const f of files.filter(isSourceFile)) findings.push(...checkSourceFile(f, read(f), baseline[f]));
const referencing = files.filter(f => /\.(ts|tsx|js|mjs|md|ps1)$/.test(f));
for (const f of referencing) findings.push(...brokenDocReferences(f, read(f), docFiles));

if (process.argv.includes('--update-baseline')) {
  const next = {};
  for (const [f, max] of Object.entries(baseline)) {
    if (!existsSync(join(ROOT, f))) continue;
    const lines = read(f).split(/\r?\n/).length;
    if (lines > 1000) next[f] = Math.min(max, lines);
  }
  writeFileSync(BASELINE, JSON.stringify({maxLines: next}, null, 2) + '\n', 'utf8');
  console.log('code-health: baseline updated', next);
  process.exit(0);
}

const {lines, summary} = formatReport(findings);
lines.forEach(l => console.log(l));
console.log(`code-health: ${summary}`);
process.exit(process.argv.includes('--strict') && findings.length > 0 ? 1 : 0);
