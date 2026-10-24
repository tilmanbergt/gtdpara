/**
 * The user's files on the fake device, for scenario set-up and checks
 * (docs/dev/history/technical-design-quality-hardening.md §4.3). Paths are the
 * default folder layout under /storage/emulated/0/Note.
 */
import {DEFAULT_SETTINGS, resolvePaths} from '../../src/domain/settings';
import {device} from '../fakeDevice/device';

export const PATHS = resolvePaths(DEFAULT_SETTINGS);

export const projectDir = (name: string) => `${PATHS.projects}/${name}`;
export const areaDir = (name: string) => `${PATHS.areas}/${name}`;
export const projectFile = (name: string) => `${projectDir(name)}/project.txt`;
export const areaFile = (name: string) => `${areaDir(name)}/area.txt`;
export const INBOX_FILE = PATHS.inbox;

/** A data file's text from its sections: frontmatter lines, then `## ` sections in the given order. */
export function dataFile(kind: 'project' | 'area' | 'inbox', sections: Record<string, string[]>, frontMatter: string[] = []): string {
  const head = ['---', `kind: ${kind}`, 'status: active', ...frontMatter, '---', ''];
  const body = Object.entries(sections).flatMap(([heading, lines]) => [`## ${heading}`, ...lines, '']);
  return [...head, ...body].join('\n');
}

export function putFile(path: string, content: string): void {
  device().fs.put(path, content);
}

export function fileText(path: string): string {
  const text = device().fs.get(path);
  if (text === undefined) throw new Error(`no file ${path}; files: ${device().fs.paths().join(', ')}`);
  return text;
}

/** The lines of a `## ` section of a data file, without blank lines. */
export function sectionLines(path: string, heading: string): string[] {
  const lines = fileText(path).split('\n');
  const start = lines.findIndex(l => l.trim() === `## ${heading}`);
  if (start < 0) return [];
  const end = lines.findIndex((l, i) => i > start && /^##\s/.test(l));
  return lines.slice(start + 1, end < 0 ? undefined : end).filter(l => l.trim() !== '');
}

export function expectFileContains(path: string, text: string): void {
  if (!fileText(path).includes(text)) throw new Error(`${path} does not contain ${JSON.stringify(text)}:\n${fileText(path)}`);
}

export function expectFileLacks(path: string, text: string): void {
  if (fileText(path).includes(text)) throw new Error(`${path} still contains ${JSON.stringify(text)}:\n${fileText(path)}`);
}

/** Error log lines the app wrote; a scenario that expects none checks this at the end. */
export function loggedErrors(): string[] {
  return device()
    .logs.filter(l => l.level === 'error')
    .map(l => l.text);
}

/** The keywords on `page` (0-based) of the note at `notePath`, in the order they were added. */
export function pageKeywords(notePath: string, page: number): string[] {
  const note = device().sdk.note(notePath);
  if (!note) throw new Error(`no note ${notePath}; files: ${device().fs.paths().join(', ')}`);
  if (!note.pages[page]) throw new Error(`${notePath} has no page ${page} (it has ${note.pages.length})`);
  return note.pages[page].keywords;
}

/** The texts gtdpara wrote on `page` (0-based) of the note at `notePath`: its textboxes and links, top to bottom as inserted. */
export function pageTexts(notePath: string, page: number): string[] {
  const note = device().sdk.note(notePath);
  if (!note) throw new Error(`no note ${notePath}; files: ${device().fs.paths().join(', ')}`);
  const elements = note.pages[page]?.elements ?? [];
  return elements.flatMap(el => {
    const text = el.textBox?.textContentFull ?? el.link?.fullText;
    return text ? [text] : [];
  });
}

/** The texts the headings (title elements) on `page` cover. */
export function pageHeadings(notePath: string, page: number): string[] {
  const elements = device().sdk.note(notePath)?.pages[page]?.elements ?? [];
  return elements.flatMap(el => (el.title ? el.title.controlTrailNums : [])).flatMap(num => {
    const text = elements.find(el => el.numInPage === num)?.textBox?.textContentFull;
    return text ? [text] : [];
  });
}
