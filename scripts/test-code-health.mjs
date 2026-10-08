// Plain-node checks for scripts/lib/codeHealth.mjs.  Run: node scripts/test-code-health.mjs
import assert from 'node:assert/strict';
import {brokenDocReferences, checkSourceFile, commentTexts, docReferences, isSourceFile, MAX_FILE_LINES} from './lib/codeHealth.mjs';

let n = 0;
function t(name, fn) {
  fn();
  n++;
}
const rules = findings => findings.map(f => `${f.rule}:${f.line}`);

t('source files', () => {
  assert.ok(isSourceFile('src/ui/TaskRow.tsx'));
  assert.ok(isSourceFile('App.tsx'));
  assert.ok(!isSourceFile('src/generated/buildInfo.ts'));
  assert.ok(!isSourceFile('__tests__/x.test.ts'));
  assert.ok(!isSourceFile('scripts/check.mjs'));
});

t('comment texts', () => {
  const c = commentTexts(['const a = 1; // tail', '/** doc', ' * more', ' */', 'const url = "http://x";', '/* one */ x;']);
  assert.equal(c[0], ' tail');
  assert.equal(c[1], '* doc');
  assert.equal(c[2], ' * more');
  assert.equal(c[3], ' ');
  assert.equal(c[4], '');
  assert.equal(c[5], ' one ');
});

t('file length and ratchet', () => {
  const long = Array(MAX_FILE_LINES + 5).fill('x;').join('\n');
  assert.deepEqual(rules(checkSourceFile('src/a.ts', long)), [`file-length:${MAX_FILE_LINES + 5}`]);
  assert.deepEqual(rules(checkSourceFile('src/a.ts', long, MAX_FILE_LINES + 5)), []);
  assert.deepEqual(rules(checkSourceFile('src/a.ts', long, MAX_FILE_LINES + 2)), [`file-length:${MAX_FILE_LINES + 5}`]);
});

t('error text, console, alert, date format', () => {
  const src = [
    "const m = e instanceof Error ? e.message : String(e);",
    "console.log('x');",
    "// console.log('only a comment')",
    "Alert.alert('x');",
    "const d = String(day).padStart(2, '0');",
  ].join('\n');
  assert.deepEqual(rules(checkSourceFile('src/screens/X.tsx', src)), ['error-text:1', 'console:2', 'alert:4', 'date-format:5']);
  assert.deepEqual(rules(checkSourceFile('src/utils/errorMessage.ts', src)), ['console:2', 'alert:4']);
  assert.deepEqual(rules(checkSourceFile('src/domain/marks.ts', "const d = String(day).padStart(2, '0');")), []);
});

t('deriveTaskFields only in domain', () => {
  const src = ["import {deriveTaskFields} from '../domain/markdown';", '// deriveTaskFields is internal to domain/'].join('\n');
  assert.deepEqual(rules(checkSourceFile('src/screens/X.tsx', src)), ['task-edit:1']);
  assert.deepEqual(rules(checkSourceFile('src/domain/taskEdit.ts', src)), []);
});

t('history in comments', () => {
  const src = [
    '// Fixed 2026-09-17 after Tilman reported it',
    '/** `2026-10-05` -> `5.10.` */',
    "// the old picker used to expand in place",
    '// returns the previously selected row',
    "const iso = '2026-10-05';",
    '// keeps the page size',
  ].join('\n');
  assert.deepEqual(rules(checkSourceFile('src/domain/x.ts', src)), ['history-comment:1', 'history-comment:3', 'history-comment:4']);
});

t('doc references', () => {
  const docs = ['docs/dev/design-overview.md', 'docs/dev/history/technical-design-tags.md'];
  const text = [
    'see docs/dev/design-overview.md §3',
    'and technical-design-tags.md §2',
    'old path docs/dev/technical-design-tags.md',
    'docs/dev/history/technical-design-tags.md is fine',
    'technical-design-missing.md',
  ].join('\n');
  assert.equal(docReferences(text).length, 5);
  assert.deepEqual(rules(brokenDocReferences('src/x.ts', text, docs)), ['doc-reference:3', 'doc-reference:5']);
});

console.log(`code-health: ${n} groups passed`);
