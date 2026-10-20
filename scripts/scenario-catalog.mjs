#!/usr/bin/env node
// The readable list of scenario tests, docs/dev/test-scenarios.md
// (docs/dev/history/technical-design-quality-hardening.md §4.4).
//
//   node scripts/scenario-catalog.mjs          write the catalog
//   node scripts/scenario-catalog.mjs --check  exit 1 when the catalog is not up to date (npm run check)

import {existsSync, readdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseScenarios, renderCatalog} from './lib/scenarioCatalog.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, '__tests__', 'scenarios');
const OUT = join(ROOT, 'docs', 'dev', 'test-scenarios.md');

const files = existsSync(DIR) ? readdirSync(DIR).filter(f => /\.test\.tsx?$/.test(f)).sort() : [];
const scenarios = files.flatMap(f => parseScenarios(readFileSync(join(DIR, f), 'utf8'), `__tests__/scenarios/${f}`));
const catalog = renderCatalog(scenarios);

if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8').replace(/\r\n/g, '\n') : '';
  if (current !== catalog) {
    console.error('scenario-catalog: docs/dev/test-scenarios.md is out of date - run npm run scenarios and commit it.');
    process.exit(1);
  }
  console.log(`scenario-catalog: up to date (${scenarios.length} scenarios)`);
} else {
  writeFileSync(OUT, catalog, 'utf8');
  console.log(`scenario-catalog: wrote ${scenarios.length} scenarios to docs/dev/test-scenarios.md`);
}
