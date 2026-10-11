/**
 * The `## Loops` section (docs/dev/history/technical-design-loops.md §3.2):
 * one line per loop of the Area or Project that owns it. Pure.
 *
 * ```
 * ## Loops
 * - workshop/teamoffsite: active, <yyyy-mm-dd>, [[Offsite brief.pdf]]
 * - study/psm2: done, <yyyy-mm-dd>
 * - buy/ebike: dropped
 * ```
 *
 * The key is the loop's tag `kind/name` (lowercased). Columns after the
 * status, comma-separated and each optional: the main date (ISO), the linked
 * file (a wiki link). Other columns are kept verbatim after them. The line
 * format is domain/statusSection.ts's: a line nobody changed is written back
 * as read, and lines that are not loop lines are kept.
 */
import {StatusLine, StatusSectionSpec, parseStatusSection, writeStatusSection} from './statusSection';

export const LOOPS_HEADING = '## Loops';

export type LoopStatus = 'active' | 'done' | 'dropped';

export interface LoopLine {
  /** `kind/name`, lowercased. */
  tag: string;
  status: LoopStatus;
  /** ISO date or null. */
  mainDate: string | null;
  /** The linked file's path as written inside `[[…]]`, or null. */
  linkedFile: string | null;
  /** Further columns, verbatim (trimmed), kept after the known ones. */
  extraColumns: string[];
  /** The line as read; null for a line built here. */
  raw: string | null;
}

const SPEC: StatusSectionSpec<LoopStatus> = {
  heading: LOOPS_HEADING,
  statuses: ['active', 'done', 'dropped'],
  keyPattern: '[a-z0-9][\\w-]*\\/[\\w-]+(?:\\/[\\w-]+)*',
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WIKI_LINK = /^\[\[(.+)\]\]$/;

function columnsOf(rest: string | null): Pick<LoopLine, 'mainDate' | 'linkedFile' | 'extraColumns'> {
  const columns = rest === null ? [] : rest.split(',').map(c => c.trim()).filter(c => c.length > 0);
  let mainDate: string | null = null;
  let linkedFile: string | null = null;
  const extraColumns: string[] = [];
  for (const column of columns) {
    const link = WIKI_LINK.exec(column);
    if (mainDate === null && linkedFile === null && extraColumns.length === 0 && ISO_DATE.test(column)) mainDate = column;
    else if (linkedFile === null && extraColumns.length === 0 && link) linkedFile = link[1];
    else extraColumns.push(column);
  }
  return {mainDate, linkedFile, extraColumns};
}

function restOf(line: Pick<LoopLine, 'mainDate' | 'linkedFile' | 'extraColumns'>): string | null {
  const columns = [
    ...(line.mainDate ? [line.mainDate] : []),
    ...(line.linkedFile ? [`[[${line.linkedFile}]]`] : []),
    ...line.extraColumns,
  ];
  return columns.length > 0 ? ` ${columns.join(', ')}` : null;
}

function fromStatusLine(line: StatusLine<LoopStatus>): LoopLine {
  return {tag: line.key, status: line.status, ...columnsOf(line.rest), raw: line.raw};
}

function toStatusLine(line: LoopLine): StatusLine<LoopStatus> {
  // A line whose columns still read the same keeps its own spelling of them.
  const asRead = line.raw !== null ? parseLoopsSpan(`${LOOPS_HEADING}\n${line.raw}\n`).loops[0] : undefined;
  const sameColumns =
    asRead !== undefined &&
    asRead.mainDate === line.mainDate &&
    asRead.linkedFile === line.linkedFile &&
    asRead.extraColumns.join('\u0000') === line.extraColumns.join('\u0000');
  const rawRest = sameColumns && line.raw !== null ? /,(.*)$/.exec(line.raw.trim())?.[1] ?? null : null;
  return {key: line.tag, status: line.status, rest: sameColumns ? rawRest : restOf(line), raw: line.raw};
}

/** The loop lines of `content`'s `## Loops` section, in file order, and its other non-blank lines. */
export function parseLoopsSpan(content: string): {loops: LoopLine[]; extraLines: string[]} {
  const {lines, extraLines} = parseStatusSection(SPEC, content);
  return {loops: lines.map(fromStatusLine), extraLines};
}

/** Rewrites only the `## Loops` section (appended when missing): loop lines, then the kept lines. */
export function writeLoopsIntoContent(content: string, loops: readonly LoopLine[], extraLines: readonly string[] = []): string {
  return writeStatusSection(SPEC, content, loops.map(toStatusLine), extraLines);
}

/** A new loop line. */
export function newLoopLine(tag: string, mainDate: string | null = null, linkedFile: string | null = null): LoopLine {
  return {tag: tag.toLowerCase(), status: 'active', mainDate, linkedFile, extraColumns: [], raw: null};
}

/** The line for `tag` (the first one wins), or undefined. */
export function findLoopLine(loops: readonly LoopLine[], tag: string): LoopLine | undefined {
  const key = tag.toLowerCase();
  return loops.find(l => l.tag === key);
}

/** `loops` with the line for `tag` replaced by `change(line)`; unchanged when there is no line. */
export function withLoopLine(loops: readonly LoopLine[], tag: string, change: (line: LoopLine) => LoopLine): LoopLine[] {
  const key = tag.toLowerCase();
  return loops.map(l => (l.tag === key ? change(l) : l));
}
