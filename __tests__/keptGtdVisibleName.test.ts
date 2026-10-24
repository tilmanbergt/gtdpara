// docs/dev/history/technical-design-kept-gtd.md §3.5: no text the plugin shows, logs or writes says
// "gtdpara" except the values that keep the old name on purpose (§3.1, the allowlist below).
// Only string literals, template parts and JSX text count; comments keep the old name (§8 U1).
import {readdirSync, readFileSync, statSync} from 'fs';
import {join, relative} from 'path';
import ts from 'typescript';

const ROOT = join(__dirname, '..');

/** Each entry is cut out of a literal before the check; what is left must not say gtdpara. */
const ALLOWED: RegExp[] = [
  /gtdpara:[A-Za-z][\w-]*(:v\d+)?:?/g, // storage keys and note markers
  /gtdpara-profile/g, // profile format id
  /\.gtdpara-tmp/g, // temp suffix of the atomic write
  /GtdPara(File|PdfProgress|Pdf|Runtime)\b/g, // native module names
  /\[GtdPara\]/g, // log line prefix (§8 U2)
  /\bopenGtdpara\b/g, // ENGAGE_TEXT key
  /Formerly gtdpara/g, // About (R9)
  /^\/storage\/emulated\/0\/EXPORT\/gtdpara$/, // LEGACY_EXPORT_ROOT, the export folder of 0.19 and older (the whole literal)
];

const LITERAL_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
  ts.SyntaxKind.JsxText,
]);

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name !== 'generated') {sourceFiles(path, out);}
    } else if (/\.(tsx?|js)$/.test(name)) {
      out.push(path);
    }
  }
  return out;
}

function literalsSayingGtdpara(path: string): string[] {
  const text = readFileSync(path, 'utf8');
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : path.endsWith('.js') ? ts.ScriptKind.JSX : ts.ScriptKind.TS;
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (LITERAL_KINDS.has(node.kind)) {
      const literal = (node as ts.LiteralLikeNode).text;
      const rest = ALLOWED.reduce((s, re) => s.replace(re, ''), literal);
      if (/gtdpara/i.test(rest)) {
        const line = file.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        found.push(`${relative(ROOT, path)}:${line}: ${literal.trim().slice(0, 100)}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
}

it('no visible text in the app says gtdpara outside the allowlist', () => {
  const files = [...sourceFiles(join(ROOT, 'src')), join(ROOT, 'App.tsx'), join(ROOT, 'index.js')];
  expect(files.flatMap(literalsSayingGtdpara)).toEqual([]);
});

it('finds a literal that says gtdpara', () => {
  const rest = ALLOWED.reduce((s, re) => s.replace(re, ''), 'Open gtdpara (gtdpara:settings:v1)');
  expect(rest).toMatch(/gtdpara/);
});
