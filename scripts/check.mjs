#!/usr/bin/env node
// All local checks in one go - run before committing a step and before every release.
//
//   npm run check            gen, tsc, eslint, jest, script tests, code health
//   npm run check -- --quick same without jest
//
// Stops at the first failing check. Design: docs/dev/history/technical-design-quality-0.9.md §3.1;
// rules: docs/dev/DEVELOPMENT-POLICY.md §7.

import {spawnSync} from 'node:child_process';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const quick = process.argv.includes('--quick');

/** ESLint warnings allowed (null = any number). */
const LINT_MAX_WARNINGS = 0;
/** When true, any code-health finding fails the check. */
const CODE_HEALTH_STRICT = true;

const lintArgs = ['eslint', 'src', 'App.tsx', 'index.js', '__tests__', 'test-helpers'];
if (LINT_MAX_WARNINGS !== null) lintArgs.push('--max-warnings', String(LINT_MAX_WARNINGS));

const steps = [
  {name: 'generate src/generated', cmd: 'node', args: ['scripts/gen-bundled-content.mjs']},
  {name: 'type check (tsc)', cmd: 'npx', args: ['tsc', '--noEmit']},
  {name: 'lint (eslint)', cmd: 'npx', args: lintArgs},
  {name: 'tests (jest)', cmd: 'npx', args: ['jest'], skip: quick},
  {name: 'script tests', cmd: 'node', args: ['scripts/test-versioning.mjs']},
  {name: 'help page tests', cmd: 'node', args: ['scripts/test-userdocs.mjs']},
  {name: 'code-health tests', cmd: 'node', args: ['scripts/test-code-health.mjs']},
  {name: 'code health', cmd: 'node', args: ['scripts/code-health.mjs', ...(CODE_HEALTH_STRICT ? ['--strict'] : [])]},
];

const started = Date.now();
for (const step of steps) {
  if (step.skip) {
    console.log(`\n--- ${step.name}: skipped (--quick)`);
    continue;
  }
  console.log(`\n--- ${step.name}`);
  // shell: true so npx resolves to npx.cmd on Windows.
  const r = spawnSync([step.cmd, ...step.args].join(' '), {cwd: ROOT, stdio: 'inherit', shell: true});
  if (r.status !== 0) {
    console.error(`\nCHECK FAILED: ${step.name} (exit ${r.status}). Fix it before committing.`);
    process.exit(1);
  }
}
console.log(`\nAll checks passed in ${Math.round((Date.now() - started) / 1000)} s${quick ? ' (jest skipped)' : ''}.`);
