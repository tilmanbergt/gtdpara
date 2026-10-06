/**
 * "Mark for later" - the pure part (docs/dev/technical-design-lasso-0.8.md
 * §3.1-§3.2, §3.8, §3.10): the `## Marks` line format, mark ids, which
 * project/area/Inbox owns a mark, icon geometry, the shifted copy of the
 * stored strokes that recognition uses (§2.1), and the
 * grouping of the marks column.
 *
 * No React Native, no sn-plugin-lib, no I/O (design-overview.md §3).
 */
import {Destination} from './destination';
import {findEnclosingItem, ResolvedParaPaths} from './settings';
import {Mark} from './types';

// ---------------------------------------------------------------------------
// Ids and times

export const MARK_ID_PREFIX = 'm-';
const MARK_ID_RE = /^m-\d{8}-\d{6}-\d{3}$/;

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 'm-YYYYMMDD-HHmmss-NNN' (local time + 3 random digits). Also a valid Obsidian block id. */
export function newMarkId(now: Date, random: () => number = Math.random): string {
  const nnn = String(Math.floor(random() * 1000) % 1000).padStart(3, '0');
  return (
    `${MARK_ID_PREFIX}${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-` +
    `${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}-${nnn}`
  );
}

export function isMarkId(value: string): boolean {
  return MARK_ID_RE.test(value);
}

/** 'YYYY-MM-DD HH:mm' in local time - the first two fields of a mark line. */
export function markCreatedAt(now: Date): string {
  return (
    `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())} ` +
    `${pad2(now.getHours())}:${pad2(now.getMinutes())}`
  );
}

/** The date part of `createdAt` ('YYYY-MM-DD'), e.g. the default date of a meeting made from a mark. */
export function markDate(mark: Pick<Mark, 'createdAt'>): string {
  return mark.createdAt.slice(0, 10);
}

// ---------------------------------------------------------------------------
// The `## Marks` line

export const MARKS_HEADING = '## Marks';

/**
 * `- 2026-10-05 10:42 [[Offsite prep.note]] p3 Optional text ^m-20261005-104212-351`
 * Page is 1-based in the line. A path containing `]` can't be written as a
 * wiki link; such a line doesn't parse and is kept as an extra line (the
 * Integrity Check already reports `[`/`]` in file names).
 */
const MARK_LINE_RE =
  /^- (\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}) \[\[([^\]]+)\]\] p(\d+)(?: (.*?))? \^(m-\d{8}-\d{6}-\d{3})\s*$/;

export function formatMarkLine(mark: Mark): string {
  const text = mark.text ? collapseLineText(mark.text) : '';
  return `- ${mark.createdAt} [[${mark.notePath}]] p${mark.page + 1}${text ? ` ${text}` : ''} ^${mark.id}`;
}

export function parseMarkLine(line: string): Mark | null {
  const m = MARK_LINE_RE.exec(line.trim());
  if (!m) {return null;}
  const page = Number(m[4]) - 1;
  if (!Number.isFinite(page) || page < 0) {return null;}
  const text = m[5]?.trim() ?? '';
  return {id: m[6], createdAt: `${m[1]} ${m[2]}`, notePath: m[3], page, text: text || null};
}

/** Section lines -> marks + the lines that aren't marks (kept, blank lines dropped). */
export function parseMarkLines(lines: string[]): {marks: Mark[]; extraLines: string[]} {
  const marks: Mark[] = [];
  const extraLines: string[] = [];
  for (const line of lines) {
    if (!line.trim()) {continue;}
    const mark = parseMarkLine(line);
    if (mark) {marks.push(mark);}
    else {extraLines.push(line);}
  }
  return {marks, extraLines};
}

export function serializeMarkLines(marks: Mark[], extraLines: string[]): string[] {
  return [...marks.map(formatMarkLine), ...extraLines];
}

/** Text on one line, without anything that would end the line format early. */
function collapseLineText(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/\s\^/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Paths and owners

/** Path as written into the line: relative when the note lies inside `ownerFolder`, else absolute. */
export function markLinkPath(ownerFolder: string | null, absNotePath: string): string {
  if (!ownerFolder) {return absNotePath;}
  const prefix = `${ownerFolder.replace(/\/+$/, '')}/`;
  return absNotePath.startsWith(prefix) ? absNotePath.slice(prefix.length) : absNotePath;
}

/** Inverse of markLinkPath. */
export function resolveMarkPath(ownerFolder: string, notePath: string): string {
  if (notePath.startsWith('/')) {return notePath;}
  return `${ownerFolder.replace(/\/+$/, '')}/${notePath}`;
}

/**
 * Which file a new mark goes into (§3.2): the project/area whose folder holds
 * the note (any depth - Todos/, Meetings/, shared Tag Rule notes), else the
 * Inbox (Inbox folder, Resources, Archive, PDFs in Document/, loose notes).
 * `hasItem` says whether that project/area is known (its data file exists);
 * an unknown one falls back to the Inbox too.
 */
export function markOwner(
  paths: ResolvedParaPaths,
  absNotePath: string,
  hasItem: (itemPath: string) => boolean,
): Destination {
  const enclosing = findEnclosingItem(paths, absNotePath);
  if (enclosing && hasItem(enclosing.path)) {
    return {type: 'item', kind: enclosing.kind, name: enclosing.name, path: enclosing.path};
  }
  return {type: 'inbox'};
}

// ---------------------------------------------------------------------------
// The marks column (§3.7): open marks with their owner, grouped by note

export interface OpenMark {
  mark: Mark;
  owner: Destination;
  /** Absolute path of the note or PDF. */
  absPath: string;
}

/** Which marks a processing screen shows: all, or those of one project/area. */
export type MarkScope = {type: 'all'} | {type: 'item'; path: string};

/** Open marks of the Inbox and the given items, with owner and absolute note path. */
export function collectOpenMarks(
  items: Array<{kind: 'project' | 'area'; name: string; path: string; marks: Mark[]}>,
  inbox: {marks: Mark[]} | null,
  inboxFolder: string,
  scope: MarkScope,
): OpenMark[] {
  const out: OpenMark[] = [];
  if (scope.type === 'all' && inbox) {
    for (const mark of inbox.marks) {
      out.push({mark, owner: {type: 'inbox'}, absPath: resolveMarkPath(inboxFolder, mark.notePath)});
    }
  }
  for (const item of items) {
    if (scope.type === 'item' && item.path !== scope.path) continue;
    for (const mark of item.marks) {
      out.push({
        mark,
        owner: {type: 'item', kind: item.kind, name: item.name, path: item.path},
        absPath: resolveMarkPath(item.path, mark.notePath),
      });
    }
  }
  return out;
}

export interface MarkGroup {
  absPath: string;
  /** File name without folder, e.g. 'Offsite prep.note'. */
  fileName: string;
  marks: OpenMark[];
}

export function fileNameOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.slice(i + 1) : path;
}

/**
 * Groups by note: `currentPath`'s group first, then the others by their
 * oldest mark. Inside a group: by page, then by time, then by id.
 */
export function groupMarks(marks: OpenMark[], currentPath: string | null): MarkGroup[] {
  const byPath = new Map<string, OpenMark[]>();
  for (const m of marks) {
    const list = byPath.get(m.absPath);
    if (list) {list.push(m);}
    else {byPath.set(m.absPath, [m]);}
  }
  const groups: MarkGroup[] = [];
  for (const [absPath, list] of byPath) {
    list.sort(
      (a, b) =>
        a.mark.page - b.mark.page ||
        a.mark.createdAt.localeCompare(b.mark.createdAt) ||
        a.mark.id.localeCompare(b.mark.id),
    );
    groups.push({absPath, fileName: fileNameOf(absPath), marks: list});
  }
  const oldest = (g: MarkGroup) =>
    g.marks.reduce((min, m) => (m.mark.createdAt < min ? m.mark.createdAt : min), '9999');
  groups.sort((a, b) => {
    if (currentPath) {
      if (a.absPath === currentPath && b.absPath !== currentPath) {return -1;}
      if (b.absPath === currentPath && a.absPath !== currentPath) {return 1;}
    }
    return oldest(a).localeCompare(oldest(b)) || a.absPath.localeCompare(b.absPath);
  });
  return groups;
}

/** What a "marks to process" card says (§3.10): count, notes, age of the oldest. */
export interface MarksSummary {
  count: number;
  notes: number;
  /** Whole days since the oldest mark was made (0 = today); null without marks. */
  oldestDays: number | null;
}

export function summarizeMarks(marks: OpenMark[], today: string): MarksSummary {
  if (marks.length === 0) {return {count: 0, notes: 0, oldestDays: null};}
  const notes = new Set(marks.map(m => m.absPath)).size;
  const oldest = marks.reduce((min, m) => (m.mark.createdAt < min ? m.mark.createdAt : min), '9999');
  const day = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  const oldestDays = Math.max(0, Math.round((day(today) - day(oldest.slice(0, 10))) / 86400000));
  return {count: marks.length, notes, oldestDays};
}

/** "3 notes · oldest 3 days" / "1 note · today". */
export function marksSummaryLine(s: MarksSummary): string {
  const notes = `${s.notes} note${s.notes === 1 ? '' : 's'}`;
  if (s.oldestDays === null) {return notes;}
  const age = s.oldestDays === 0 ? 'today' : s.oldestDays === 1 ? 'oldest 1 day' : `oldest ${s.oldestDays} days`;
  return `${notes} · ${age}`;
}

// ---------------------------------------------------------------------------
// Icons (§3.8)

export interface PxPoint {
  x: number;
  y: number;
}

export interface PxRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export const MARK_USERDATA_PREFIX = 'gtdpara:mark:';
const DONE_SUFFIX = ':done';

export function markUserData(id: string): string {
  return `${MARK_USERDATA_PREFIX}${id}`;
}

export function markDoneUserData(id: string): string {
  return `${MARK_USERDATA_PREFIX}${id}${DONE_SUFFIX}`;
}

/** 'gtdpara:mark:<id>[:done]' -> {id, done}; anything else -> null. */
export function parseMarkUserData(value: unknown): {id: string; done: boolean} | null {
  if (typeof value !== 'string' || !value.startsWith(MARK_USERDATA_PREFIX)) {return null;}
  let rest = value.slice(MARK_USERDATA_PREFIX.length);
  const done = rest.endsWith(DONE_SUFFIX);
  if (done) {rest = rest.slice(0, -DONE_SUFFIX.length);}
  return rest ? {id: rest, done} : null;
}

export const ICON_SIZE_PX = 28;
const ICON_INSET_PX = 4;

/**
 * Where the icon goes: a square of ICON_SIZE_PX in the top-right corner
 * inside the lasso rect (inset a little), clamped for a very small lasso.
 */
export function iconBox(lasso: PxRect, size = ICON_SIZE_PX): PxRect {
  const width = Math.max(1, lasso.right - lasso.left);
  const height = Math.max(1, lasso.bottom - lasso.top);
  const s = Math.min(size, width, height);
  const right = lasso.right - Math.min(ICON_INSET_PX, Math.max(0, width - s));
  const top = lasso.top + Math.min(ICON_INSET_PX, Math.max(0, height - s));
  return {left: Math.round(right - s), top: Math.round(top), right: Math.round(right), bottom: Math.round(top + s)};
}

/** A bookmark ribbon (closed polygon) filling `box`, notched at the bottom. */
export function bookmarkPolygon(box: PxRect): PxPoint[] {
  const w = box.right - box.left;
  const h = box.bottom - box.top;
  const inset = Math.round(w * 0.15);
  const left = box.left + inset;
  const right = box.right - inset;
  const midX = Math.round((left + right) / 2);
  const notchY = box.top + Math.round(h * 0.72);
  return [
    {x: left, y: box.top},
    {x: right, y: box.top},
    {x: right, y: box.bottom},
    {x: midX, y: notchY},
    {x: left, y: box.bottom},
    {x: left, y: box.top},
  ];
}

/**
 * A thick check mark as one closed polygon filling `box` - the "done" icon
 * the bookmark turns into after saving (same element, new points).
 */
export function checkPolygon(box: PxRect): PxPoint[] {
  const w = box.right - box.left;
  const h = box.bottom - box.top;
  const at = (fx: number, fy: number): PxPoint => ({x: Math.round(box.left + w * fx), y: Math.round(box.top + h * fy)});
  return [
    at(0.05, 0.55),
    at(0.2, 0.4),
    at(0.4, 0.6),
    at(0.8, 0.1),
    at(0.95, 0.25),
    at(0.4, 0.9),
    at(0.05, 0.55),
  ];
}

// ---------------------------------------------------------------------------
// Stored strokes and the shifted copy for recognition (§2.1, §3.4)

/** One stroke as saved at mark time: EMR points flattened [x0, y0, x1, y1, ...]. */
export interface StoredStroke {
  thickness: number | null;
  penColor: number | null;
  penType: number | null;
  layerNum: number | null;
  points: number[];
  pressures: number[];
}

/** Where the shifted copy starts, in EMR units from the top-left. */
export const SHIFT_ORIGIN_EMR = 300;

/**
 * The same strokes moved so the smallest x and y sit at SHIFT_ORIGIN_EMR.
 * The host recognizer maps points with the page size it is given; on the
 * A5 X the points use a larger EMR range than that size implies, so text low
 * on the page fell outside and failed (error 117) or came back partial.
 * Moving the strokes to the top-left keeps them inside on every device.
 * Relative positions (lines, words) are unchanged.
 */
export function shiftStrokes(strokes: StoredStroke[], origin = SHIFT_ORIGIN_EMR): StoredStroke[] {
  let minX = Infinity;
  let minY = Infinity;
  for (const s of strokes) {
    for (let i = 0; i + 1 < s.points.length; i += 2) {
      if (s.points[i] < minX) {minX = s.points[i];}
      if (s.points[i + 1] < minY) {minY = s.points[i + 1];}
    }
  }
  if (!Number.isFinite(minX) || !Number.isFinite(minY)) {return strokes.map(s => ({...s, points: [...s.points]}));}
  const dx = origin - minX;
  const dy = origin - minY;
  return strokes.map(s => ({
    ...s,
    points: s.points.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)),
  }));
}

// ---------------------------------------------------------------------------
// Text boxes

export interface TextPiece {
  text: string;
  rect: PxRect | null;
}

/**
 * Joins text-box pieces in reading order: top to bottom, and left to right
 * for pieces whose tops are within `lineTolerance` px. Pieces without a rect go last.
 */
export function joinInReadingOrder(pieces: TextPiece[], lineTolerance = 20): string {
  const placed = pieces.filter(p => p.rect && p.text.trim().length > 0);
  const unplaced = pieces.filter(p => !p.rect && p.text.trim().length > 0);
  placed.sort((a, b) => {
    const dy = a.rect!.top - b.rect!.top;
    if (Math.abs(dy) > lineTolerance) {return dy;}
    return a.rect!.left - b.rect!.left;
  });
  return [...placed, ...unplaced].map(p => p.text.trim()).join('\n');
}

// ---------------------------------------------------------------------------
// The private data file (§3.3)

export const MARK_DATA_VERSION = 1;

export interface MarkDataFile {
  version: number;
  id: string;
  /** Absolute path of the note/PDF at mark time. */
  path: string;
  page: number;
  rect: PxRect | null;
  displaySize: {width: number; height: number} | null;
  pageSize: {width: number; height: number} | null;
  textBoxText: string;
  strokes: StoredStroke[];
  icon: {box: PxRect; placed: boolean} | null;
  /**
   * The text recognition returned the first time:
   * kept here so a mark is recognized once, not on every open. Private data -
   * the `## Marks` line itself never gets it.
   */
  recognizedText?: string;
}

/** Parses mark.json; null when it isn't one. */
export function parseMarkDataFile(text: string | null): MarkDataFile | null {
  if (!text) {return null;}
  try {
    const parsed = JSON.parse(text) as MarkDataFile;
    if (!parsed || typeof parsed.id !== 'string' || !Array.isArray(parsed.strokes)) {return null;}
    return parsed;
  } catch {
    return null;
  }
}
