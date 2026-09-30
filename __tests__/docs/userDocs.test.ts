/// <reference types="node" />
/**
 * The user docs (docs/user/*.md) are read on GitHub and shown in the app's
 * Help, whose renderer (domain/markdownBlocks.ts) supports only a subset of
 * markdown. This keeps the docs inside that subset and the links working.
 */
import * as fs from 'fs';
import * as path from 'path';
import {parseMarkdownBlocks} from '../../src/domain/markdownBlocks';

const DIR = path.join(__dirname, '..', '..', 'docs', 'user');
const pages = fs.readdirSync(DIR).filter(f => f.endsWith('.md')).sort();

function outsideCode(text: string): string[] {
  const out: string[] = [];
  let inCode = false;
  for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*```/.test(line)) {inCode = !inCode; continue;}
    if (!inCode) {out.push(line);}
  }
  return out;
}

describe('user docs', () => {
  it('has pages and an index', () => {
    expect(pages).toContain('index.md');
    expect(pages.length).toBeGreaterThan(5);
  });

  it.each(pages)('%s uses only the device-safe markdown subset', page => {
    const text = fs.readFileSync(path.join(DIR, page), 'utf8');
    expect((text.match(/^\s*```/gm) ?? []).length % 2).toBe(0); // fences are closed
    const problems: string[] = [];
    outsideCode(text).forEach((line, i) => {
      const where = `${page}:${i + 1}: ${line.trim()}`;
      if (/^\s*\|.*\|\s*$/.test(line)) {problems.push(`table: ${where}`);}
      if (/!\[/.test(line)) {problems.push(`image: ${where}`);}
      if (/<\/?[a-zA-Z][^>]*>/.test(line.replace(/`[^`]*`/g, ''))) {problems.push(`html: ${where}`);}
      const indent = /^(\s*)([-*+]|\d+[.)])\s/.exec(line)?.[1].length ?? 0;
      if (indent >= 4) {problems.push(`list nested deeper than one level: ${where}`);}
      if (/^\s*(\*\*\*|___|---)\s*$/.test(line) && i > 0) {problems.push(`horizontal rule: ${where}`);}
    });
    expect(problems).toEqual([]);
    expect(parseMarkdownBlocks(text).length).toBeGreaterThan(0);
  });

  it.each(pages)('%s links only to existing pages', page => {
    const text = fs.readFileSync(path.join(DIR, page), 'utf8');
    const broken: string[] = [];
    for (const m of text.matchAll(/\[[^\]]+\]\(([^)\s]+)\)/g)) {
      const target = m[1];
      if (/^(https?:|mailto:)/.test(target)) {continue;}
      const file = target.split('#')[0];
      if (file && !fs.existsSync(path.resolve(DIR, file))) {broken.push(target);}
    }
    expect(broken).toEqual([]);
  });
});
