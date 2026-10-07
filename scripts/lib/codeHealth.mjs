// Pure rules for scripts/code-health.mjs - no I/O here, so scripts/test-code-health.mjs can test them.
// Design: docs/dev/history/technical-design-quality-0.9.md §3.1. Rules and limits: docs/dev/DEVELOPMENT-POLICY.md §3, §5, §6.

/** New source files stay at or below this many lines; longer existing files are listed in the baseline. */
export const MAX_FILE_LINES = 1000;

const ERROR_TEXT_ALLOWED = ['src/utils/errorMessage.ts'];
const CONSOLE_ALLOWED = ['src/utils/log.ts', 'src/utils/logSink.ts'];
/** Display code - the only place date text must come from domain/dateFormat.ts. */
const DISPLAY_DIRS = ['src/ui/', 'src/screens/'];

const DATE_RE = /\b20\d\d-\d\d-\d\d\b/;
const HISTORY_RE = /\b(used to|previously|replaces the old|replaced the old|no longer)\b/i;

/** Is `path` one of the TypeScript source files the source rules look at? */
export function isSourceFile(path) {
  return (path === 'App.tsx' || path.startsWith('src/')) && /\.(ts|tsx)$/.test(path) && !path.startsWith('src/generated/');
}

/**
 * The comment text of each line (an empty string for lines without a comment), so the comment
 * rules can look at comments only. Knows `//`, `/* ... *\/` and `*` continuation lines; a `//`
 * inside a string is rare enough in this code base to be ignored.
 */
export function commentTexts(lines) {
  const out = [];
  let inBlock = false;
  for (const line of lines) {
    if (inBlock) {
      const end = line.indexOf('*/');
      out.push(end >= 0 ? line.slice(0, end) : line);
      if (end >= 0) inBlock = false;
      continue;
    }
    const start = line.indexOf('/*');
    const slashes = line.indexOf('//');
    const urlLike = slashes > 0 && line[slashes - 1] === ':';
    if (start >= 0 && (slashes < 0 || start < slashes)) {
      const end = line.indexOf('*/', start + 2);
      if (end < 0) inBlock = true;
      out.push(line.slice(start + 2, end < 0 ? undefined : end));
    } else if (slashes >= 0 && !urlLike) {
      out.push(line.slice(slashes + 2));
    } else {
      out.push('');
    }
  }
  return out;
}

/** Comment text with quoted or backticked examples removed - `2026-10-05` in an example is not history. */
function withoutQuoted(text) {
  return text.replace(/`[^`]*`/g, '').replace(/"[^"]*"/g, '').replace(/'[^']*'/g, '');
}

/**
 * Findings for one source file: [{rule, path, line, message}].
 * `baselineLines` is the allowed length of an already-long file (undefined for every other file).
 */
export function checkSourceFile(path, text, baselineLines) {
  const findings = [];
  const lines = text.split(/\r?\n/);
  const add = (rule, line, message) => findings.push({rule, path, line, message});

  const limit = baselineLines ?? MAX_FILE_LINES;
  if (lines.length > limit) {
    add('file-length', lines.length, baselineLines
      ? `${lines.length} lines - may not grow beyond its baseline of ${baselineLines}`
      : `${lines.length} lines - new files stay at or below ${MAX_FILE_LINES}; split it`);
  }

  const comments = commentTexts(lines);
  lines.forEach((line, i) => {
    const n = i + 1;
    if (!ERROR_TEXT_ALLOWED.includes(path) && /instanceof Error \?/.test(line)) {
      add('error-text', n, 'use errorMessage(e) from utils/errorMessage.ts');
    }
    if (!CONSOLE_ALLOWED.includes(path) && /\bconsole\.(log|warn|error|info|debug)\b/.test(line) && !comments[i]) {
      add('console', n, 'log through utils/log.ts (log, logWarn, logError)');
    }
    if (/\bAlert\.alert\b/.test(line) && !comments[i]) {
      add('alert', n, 'messages go through the status slot, not Alert.alert');
    }
    if (DISPLAY_DIRS.some(d => path.startsWith(d)) && /padStart\(2, ?'0'\)/.test(line) && !comments[i]) {
      add('date-format', n, 'build date and time text with domain/dateFormat.ts');
    }
    const comment = withoutQuoted(comments[i]);
    if (DATE_RE.test(comment)) add('history-comment', n, 'a date in a comment - say what and why now; history lives in git and the design docs');
    else if (HISTORY_RE.test(comment)) add('history-comment', n, 'history wording in a comment - describe the code as it is');
  });
  return findings;
}

/** Design-doc file names referenced in a text: "docs/dev/x.md" or a bare "technical-design-x.md". */
export function docReferences(text) {
  const re = /((?:docs\/(?:dev\/(?:history\/)?)?)?)((?:technical-design|design|spike|requirements|device-test)-[A-Za-z0-9.-]*[A-Za-z0-9]\.md)\b/g;
  const out = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    let m;
    re.lastIndex = 0;
    while ((m = re.exec(line))) out.push({line: i + 1, prefix: m[1], name: m[2]});
  });
  return out;
}

/**
 * A reference is fine when the named file exists: at the exact path when one is given, anywhere
 * under docs/dev/ for a bare name. `docFiles` holds repository paths such as "docs/dev/history/x.md".
 */
export function brokenDocReferences(path, text, docFiles) {
  const set = new Set(docFiles);
  const names = new Set(docFiles.map(f => f.slice(f.lastIndexOf('/') + 1)));
  return docReferences(text)
    .filter(r => (r.prefix ? !set.has(r.prefix + r.name) : !names.has(r.name)))
    .map(r => ({rule: 'doc-reference', path, line: r.line, message: `${r.prefix}${r.name} does not exist`}));
}

/** One line per finding plus a per-rule count. */
export function formatReport(findings) {
  const lines = findings.map(f => `${f.rule}  ${f.path}:${f.line}  ${f.message}`);
  const counts = {};
  for (const f of findings) counts[f.rule] = (counts[f.rule] ?? 0) + 1;
  const summary = Object.keys(counts).length
    ? Object.entries(counts).map(([rule, n]) => `${rule}: ${n}`).join(', ')
    : 'no findings';
  return {lines, summary};
}
