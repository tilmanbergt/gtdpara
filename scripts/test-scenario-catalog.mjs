// Plain-node checks for scripts/lib/scenarioCatalog.mjs.  Run: node scripts/test-scenario-catalog.mjs
import assert from 'node:assert/strict';
import {parseScenarios, renderCatalog} from './lib/scenarioCatalog.mjs';

const src = [
  "scenario('Refile a todo', {feature: 'Inbox', design: 'technical-design-x.md'}, () => {",
  "  given('Inbox.txt has \\'Call Anna\\'', () => {});",
  '  when(',
  "    'I tap Refile',",
  '    async () => {},',
  '  );',
  "  then('it moved', () => {});",
  "  and('the note moved too', () => {});",
  '});',
  "scenario('Add a meeting', {feature: 'Daily'}, () => {",
  "  then('it is there', () => {});",
  '});',
].join('\n');

const parsed = parseScenarios(src, 'a.test.tsx');
assert.equal(parsed.length, 2);
assert.deepEqual(parsed[0], {
  title: 'Refile a todo',
  feature: 'Inbox',
  design: 'technical-design-x.md',
  file: 'a.test.tsx',
  steps: [
    {kind: 'Given', text: "Inbox.txt has 'Call Anna'"},
    {kind: 'When', text: 'I tap Refile'},
    {kind: 'Then', text: 'it moved'},
    {kind: 'And', text: 'the note moved too'},
  ],
});
assert.deepEqual(parsed[1].steps, [{kind: 'Then', text: 'it is there'}]);

const md = renderCatalog(parsed);
assert.ok(md.indexOf('## Daily') < md.indexOf('## Inbox'), 'features sorted');
assert.ok(md.includes("- **Given** Inbox.txt has 'Call Anna'"));
assert.ok(md.includes('design: `docs/dev/history/technical-design-x.md`'));
assert.ok(md.includes('2 scenarios.'));
assert.ok(renderCatalog(parsed.slice(0, 1)).includes('1 scenario.'));
console.log('scenario-catalog: 1 group passed');
