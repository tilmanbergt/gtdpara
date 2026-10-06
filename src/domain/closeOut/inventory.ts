/**
 * Close-out inventory (docs/dev/technical-design-project-close-out.md §5.2):
 * turns the scan of a project folder (storage/closeOut/scan.ts) plus the
 * project's todos/meetings and the plan into the grouped contents model the
 * Contents step shows and the archive document is built from. Pure.
 *
 * Rules (decisions 5, 10, 11, 13 of docs/dev/spike-project-archive-pdf.md):
 * - Meetings (date order) and todos with a note are listed by the item, not
 *   by file; a shared note (Daily.note) contributes one entry per keyword
 *   page, plus "<file> - other pages" for pages no item claims.
 * - Notes and images are included by default; PDFs are kept as separate
 *   files and only listed; other file types can't be included.
 * - Files linked from outside the folder are listed as references - except
 *   Gmail email notes, which are part of the project's record and are
 *   included by default (as in the approved mockup); their attachments
 *   follow the normal PDF/other rules.
 * - The plan only stores deviations (exclude/include) from those defaults.
 */
import {Meeting, Task} from '../types';
import {meetingDisplayTitle} from '../meetingTracking';
import {PageKeyword, meetingPageKeyword, parseSharedNoteAnchor, todoPageKeyword} from '../sharedNotePages';
import {CloseOutPlan, OutcomeDest} from './plan';

export type FileType = 'note' | 'pdf' | 'image' | 'other';

export function fileTypeOf(name: string): FileType {
  const lower = name.toLowerCase();
  if (lower.endsWith('.note')) return 'note';
  if (lower.endsWith('.pdf')) return 'pdf';
  if (/\.(png|jpe?g)$/.test(lower)) return 'image';
  return 'other';
}

/** One file inside the project folder (paths relative to it). */
export interface ScanFile {
  relPath: string;
  name: string;
  type: FileType;
  /** Notes only; null = the page count could not be read (locked or damaged note). */
  pageCount: number | null;
}

/** A file some todo/meeting of this project links to that lives OUTSIDE the project folder. */
export interface OutsideFile {
  /** Base-root-relative path as stored in the todo/meeting's linkedFile. */
  linkedFile: string;
  absPath: string;
  name: string;
  type: FileType;
  pageCount: number | null;
  exists: boolean;
  /** Labels of the todos/meetings linking it. */
  linkedBy: string[];
  /** Lives under Resources' Gmail email-notes / attachments folders. */
  isGmail: boolean;
  isGmailEmailNote: boolean;
}

export interface ProjectScan {
  projectPath: string;
  files: ScanFile[];
  /** Keywords per shared note file referenced by a todo/meeting anchor, keyed by relPath. */
  sharedKeywords: Record<string, PageKeyword[]>;
  outside: OutsideFile[];
}

export type ContentGroupId = 'record' | 'meetings' | 'todos' | 'emails' | 'other' | 'outside';

export const CONTENT_GROUP_TITLES: Record<ContentGroupId, string> = {
  record: 'Project record',
  meetings: 'Meetings',
  todos: 'Todos',
  emails: 'Emails and attachments',
  other: 'Other notes and files',
  outside: 'Linked from outside this folder',
};

export type ContentSource =
  | {kind: 'note'; absPath: string; pages: number[]}
  | {kind: 'image'; absPath: string}
  | {kind: 'record'}
  | {kind: 'none'};

export interface ContentEntry {
  /** Stable id - also the PDF anchor and the key the plan's exclude/include lines use. */
  key: string;
  group: ContentGroupId;
  title: string;
  /** Second line: location and size, e.g. "Meetings/ · 3 pages". */
  meta: string;
  source: ContentSource;
  /** Pages this entry adds to the PDF when included. */
  pageCount: number;
  includable: boolean;
  includedByDefault: boolean;
  included: boolean;
  /** Why an entry is listed only, e.g. "PDF · kept as separate file". */
  listedReason?: string;
  /** Meetings: YYYY-MM-DD, used for ordering and the record page. */
  date?: string;
  /** The todo/meeting this note belongs to (index into the project's tasks/meetings), for linking from the record page. */
  item?: {kind: 'todo' | 'meeting'; index: number};
  /** Files inside the folder: relative path (outcome moves are keyed by it). Outside files: absolute path. */
  filePath?: string;
  insideFolder: boolean;
  /** Outcome destination chosen for this file, if any. */
  movedTo?: OutcomeDest;
}

export interface ContentGroup {
  id: ContentGroupId;
  title: string;
  entries: ContentEntry[];
}

export interface ContentsModel {
  groups: ContentGroup[];
  /** Pages of all included entries plus the text pages' estimate. */
  includedNotePages: number;
  includedEntries: number;
  /** Rough, from the spike: about 1.3 s per rendered page. */
  estimatedSeconds: number;
  /** Files inside the folder that may be moved out as outcomes (not the project's own meeting/todo notes). */
  outcomeCandidates: ContentEntry[];
  /** Notes whose page count could not be read. */
  unreadable: ContentEntry[];
}

export interface InventoryInput {
  projectPath: string;
  tasks: Task[];
  meetings: Meeting[];
  scan: ProjectScan;
  plan: CloseOutPlan;
  /** File name of the close-out PDF inside the project folder (never part of its own contents). */
  ownPdfName: string | null;
}

export const SECONDS_PER_PAGE = 1.3;

function folderOf(relPath: string): string {
  const i = relPath.lastIndexOf('/');
  return i === -1 ? '' : `${relPath.slice(0, i)}/`;
}

function pagesLabel(n: number | null): string {
  if (n === null) return 'could not be read';
  return n === 1 ? '1 page' : `${n} pages`;
}

function stripNoteExt(name: string): string {
  return name.replace(/\.note$/i, '');
}

function isIncluded(plan: CloseOutPlan, key: string, includable: boolean, byDefault: boolean): boolean {
  if (!includable) return false;
  return byDefault ? !plan.exclude.includes(key) : plan.include.includes(key);
}

function normalizeRel(notePath: string): string {
  return notePath.replace(/^\.?\/+/, '');
}

export function buildContents(input: InventoryInput): ContentsModel {
  const {scan, plan, tasks, meetings, projectPath} = input;
  const filesByRel = new Map(scan.files.map(f => [f.relPath, f]));
  const claimedFiles = new Set<string>();
  /** Shared files: pages claimed by items. */
  const claimedPages = new Map<string, Set<number>>();
  const moveByPath = new Map(plan.moves.map(m => [m.path, m.dest]));
  const abs = (rel: string) => `${projectPath.replace(/\/+$/, '')}/${rel}`;

  const entry = (e: Omit<ContentEntry, 'included'>): ContentEntry => ({...e, included: isIncluded(plan, e.key, e.includable, e.includedByDefault)});

  // Items (meetings/todos) with notes.
  const itemEntries = (
    group: 'meetings' | 'todos',
    notePath: string,
    title: string,
    keyword: string,
    item: {kind: 'todo' | 'meeting'; index: number},
    date?: string,
  ): ContentEntry | null => {
    if (!notePath || notePath.startsWith('/')) return null;
    const anchor = parseSharedNoteAnchor(notePath);
    if (anchor && filesByRel.has(normalizeRel(anchor.filePath)) && scan.sharedKeywords[normalizeRel(anchor.filePath)]) {
      const rel = normalizeRel(anchor.filePath);
      const kws = scan.sharedKeywords[rel];
      // The stored keyword first; the one derived from the current title as a
      // fallback (titles edited since the page was created - shared-note
      // pages are renamed lazily on the next open).
      const hit = kws.find(k => k.keyword === anchor.keyword) ?? kws.find(k => k.keyword === keyword);
      if (!hit) return null;
      claimedFiles.add(rel);
      if (!claimedPages.has(rel)) claimedPages.set(rel, new Set());
      claimedPages.get(rel)!.add(hit.page);
      return entry({
        key: `${rel}#${hit.page}`,
        group,
        title,
        meta: `${stripNoteExt(filesByRel.get(rel)!.name)} · page ${hit.page + 1}`,
        source: {kind: 'note', absPath: abs(rel), pages: [hit.page]},
        pageCount: 1,
        includable: true,
        includedByDefault: true,
        date,
        item,
        insideFolder: true,
      });
    }
    const rel = normalizeRel(notePath);
    const file = filesByRel.get(rel);
    if (!file || file.type !== 'note' || claimedFiles.has(rel)) return null;
    claimedFiles.add(rel);
    const readable = file.pageCount !== null && file.pageCount > 0;
    return entry({
      key: rel,
      group,
      title,
      meta: `${folderOf(rel)} · ${pagesLabel(file.pageCount)}`,
      source: readable ? {kind: 'note', absPath: abs(rel), pages: Array.from({length: file.pageCount!}, (_, i) => i)} : {kind: 'none'},
      pageCount: readable ? file.pageCount! : 0,
      includable: readable,
      includedByDefault: readable,
      listedReason: readable ? undefined : 'could not be read',
      date,
      item,
      filePath: rel,
      insideFolder: true,
    });
  };

  const meetingEntries: ContentEntry[] = [];
  meetings
    .map((m, i) => ({m, i}))
    .sort((a, b) => (a.m.date + a.m.time).localeCompare(b.m.date + b.m.time) || a.i - b.i)
    .forEach(({m, i}) => {
      const title = `${m.date} · ${meetingDisplayTitle(m)}`;
      const e = itemEntries('meetings', m.notePath, title, meetingPageKeyword(m), {kind: 'meeting', index: i}, m.date);
      if (e) meetingEntries.push(e);
    });

  const todoEntries: ContentEntry[] = [];
  tasks.forEach((t, index) => {
    const e = itemEntries('todos', t.notePath, t.text, todoPageKeyword(t), {kind: 'todo', index});
    if (e) todoEntries.push(e);
  });

  // Unclaimed pages of shared files.
  for (const rel of Object.keys(scan.sharedKeywords)) {
    const file = filesByRel.get(rel);
    if (!file || file.pageCount === null) continue;
    const claimed = claimedPages.get(rel) ?? new Set<number>();
    const rest = Array.from({length: file.pageCount}, (_, i) => i).filter(p => !claimed.has(p));
    claimedFiles.add(rel);
    if (rest.length === 0) continue;
    const usedByTodosOnly =
      todoEntries.some(e => e.key.startsWith(`${rel}#`)) && !meetingEntries.some(e => e.key.startsWith(`${rel}#`));
    const target = usedByTodosOnly ? todoEntries : meetingEntries;
    target.push(
      entry({
        key: `${rel}#other`,
        group: target === meetingEntries ? 'meetings' : 'todos',
        title: `${stripNoteExt(file.name)} - other pages`,
        meta: `${folderOf(rel)}${file.name} · ${pagesLabel(rest.length)}`,
        source: {kind: 'note', absPath: abs(rel), pages: rest},
        pageCount: rest.length,
        includable: true,
        includedByDefault: true,
        insideFolder: true,
      }),
    );
  }

  // Everything else inside the folder.
  const otherEntries: ContentEntry[] = [];
  const unreadable: ContentEntry[] = [];
  for (const f of [...scan.files].sort((a, b) => a.relPath.localeCompare(b.relPath))) {
    if (claimedFiles.has(f.relPath)) continue;
    if (input.ownPdfName && f.relPath === input.ownPdfName) continue;
    let e: ContentEntry;
    if (f.type === 'note') {
      const readable = f.pageCount !== null && f.pageCount > 0;
      e = entry({
        key: f.relPath,
        group: 'other',
        title: stripNoteExt(f.name),
        meta: `${folderOf(f.relPath)}${folderOf(f.relPath) ? ' · ' : ''}${pagesLabel(f.pageCount)}`,
        source: readable ? {kind: 'note', absPath: abs(f.relPath), pages: Array.from({length: f.pageCount!}, (_, i) => i)} : {kind: 'none'},
        pageCount: readable ? f.pageCount! : 0,
        includable: readable,
        includedByDefault: readable,
        listedReason: readable ? undefined : 'could not be read',
        filePath: f.relPath,
        insideFolder: true,
      });
      if (!readable) unreadable.push(e);
    } else if (f.type === 'image') {
      e = entry({key: f.relPath, group: 'other', title: f.name, meta: `${folderOf(f.relPath)}image · 1 page`, source: {kind: 'image', absPath: abs(f.relPath)}, pageCount: 1, includable: true, includedByDefault: true, filePath: f.relPath, insideFolder: true});
    } else {
      e = entry({
        key: f.relPath,
        group: 'other',
        title: f.name,
        meta: `${folderOf(f.relPath)}${f.type === 'pdf' ? 'PDF' : 'file'}`,
        source: {kind: 'none'},
        pageCount: 0,
        includable: false,
        includedByDefault: false,
        listedReason: f.type === 'pdf' ? 'PDF · kept as separate file' : "can't be included",
        filePath: f.relPath,
        insideFolder: true,
      });
    }
    const dest = moveByPath.get(f.relPath);
    otherEntries.push(dest ? {...e, movedTo: dest} : e);
  }

  // Outside the folder.
  const emailEntries: ContentEntry[] = [];
  const outsideEntries: ContentEntry[] = [];
  for (const o of scan.outside) {
    const readableNote = o.type === 'note' && o.exists && o.pageCount !== null && o.pageCount > 0;
    const includable = readableNote || (o.type === 'image' && o.exists);
    const group: ContentGroupId = o.isGmail ? 'emails' : 'outside';
    const e = entry({
      key: `outside:${o.linkedFile}`,
      group,
      title: o.isGmailEmailNote ? stripNoteExt(o.name) : o.name,
      meta: !o.exists ? 'missing' : `${o.linkedFile}${o.type === 'note' ? ` · ${pagesLabel(o.pageCount)}` : ''}`,
      source: readableNote
        ? {kind: 'note', absPath: o.absPath, pages: Array.from({length: o.pageCount!}, (_, i) => i)}
        : o.type === 'image' && o.exists
        ? {kind: 'image', absPath: o.absPath}
        : {kind: 'none'},
      pageCount: readableNote ? o.pageCount! : o.type === 'image' && o.exists ? 1 : 0,
      includable,
      includedByDefault: o.isGmailEmailNote && readableNote,
      listedReason: !o.exists ? 'missing' : o.type === 'pdf' ? 'PDF · kept as separate file' : includable ? 'reference' : "can't be included",
      filePath: o.absPath,
      insideFolder: false,
    });
    (group === 'emails' ? emailEntries : outsideEntries).push(e);
  }

  const record: ContentEntry = {
    key: 'record',
    group: 'record',
    title: 'Cover, contents, todos and meetings as text',
    meta: 'always included',
    source: {kind: 'record'},
    pageCount: 0,
    includable: true,
    includedByDefault: true,
    included: true,
    insideFolder: true,
  };

  const groups: ContentGroup[] = (
    [
      ['record', [record]],
      ['meetings', meetingEntries],
      ['todos', todoEntries],
      ['emails', emailEntries],
      ['other', otherEntries],
      ['outside', outsideEntries],
    ] as [ContentGroupId, ContentEntry[]][]
  )
    .filter(([, entries]) => entries.length > 0)
    .map(([id, entries]) => ({id, title: CONTENT_GROUP_TITLES[id], entries}));

  const all = groups.flatMap(g => g.entries);
  const includedNotePages = all.filter(e => e.included).reduce((n, e) => n + e.pageCount, 0);
  return {
    groups,
    includedNotePages,
    includedEntries: all.filter(e => e.included && e.group !== 'record').length,
    estimatedSeconds: Math.round(includedNotePages * SECONDS_PER_PAGE),
    outcomeCandidates: otherEntries,
    unreadable,
  };
}
