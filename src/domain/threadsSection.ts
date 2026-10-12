/**
 * The `## Threads` section (docs/dev/history/technical-design-tending-threads.md
 * §3.9.1): the confirmed status of each counterpart of a scope, one line per
 * counterpart. Pure.
 *
 * ```
 * ## Threads
 * - client-a: active
 * - client-b: inactive
 * ```
 *
 * The section lives in the scope's owner file (decision D16): `area.txt` for
 * an Area and its Projects, `project.txt` for a Project without an Area, never
 * `Inbox.txt` (decision D18). Text after a comma (`- client-a: active, ~3w`)
 * is room for later columns: kept verbatim, not read. Lines that are not a
 * status line are kept and written after the status lines, like every other
 * section's unknown lines. A line nobody changed is written back exactly as
 * it was read. The line format itself is domain/statusSection.ts.
 */
import {parseStatusLine, parseStatusSection, serializeStatusLine, StatusLine, StatusSectionSpec, writeStatusSection} from './statusSection';

export const THREADS_HEADING = '## Threads';

/** A confirmed counterpart's status. "New" is not a status: it is a counterpart in use without a line. */
export type CounterpartStatus = 'active' | 'inactive';

export interface CounterpartLine {
  /** The counterpart, lowercased (the leaf of its nested tags). */
  leaf: string;
  status: CounterpartStatus;
  /** Everything after the first comma, verbatim; null when there is none. */
  rest: string | null;
  /** The line as read; null for a line built here. Written back unchanged while leaf/status/rest match it. */
  raw: string | null;
}

const SPEC: StatusSectionSpec<CounterpartStatus> = {
  heading: THREADS_HEADING,
  statuses: ['active', 'inactive'],
  keyPattern: '[a-z0-9][\\w-]*',
};

const toLine = (e: CounterpartLine): StatusLine<CounterpartStatus> => ({key: e.leaf, status: e.status, rest: e.rest, raw: e.raw});
const fromLine = (l: StatusLine<CounterpartStatus>): CounterpartLine => ({leaf: l.key, status: l.status, rest: l.rest, raw: l.raw});

/** One status line, or null when `line` is not one. */
export function parseCounterpartLine(line: string): CounterpartLine | null {
  const parsed = parseStatusLine(SPEC, line);
  return parsed ? fromLine(parsed) : null;
}

/** The line to write: the line as read while it still says the same, else the canonical form. */
export function serializeCounterpartLine(entry: CounterpartLine): string {
  return serializeStatusLine(SPEC, toLine(entry));
}

/** The status lines of `content`'s `## Threads` section, in file order, and its other non-blank lines. */
export function parseThreadsSpan(content: string): {threads: CounterpartLine[]; extraLines: string[]} {
  const {lines, extraLines} = parseStatusSection(SPEC, content);
  return {threads: lines.map(fromLine), extraLines};
}

/** Rewrites only the `## Threads` section (appended when missing): status lines, then the kept lines. */
export function writeThreadsIntoContent(content: string, threads: readonly CounterpartLine[], extraLines: readonly string[] = []): string {
  return writeStatusSection(SPEC, content, threads.map(toLine), extraLines);
}

/** The status `threads` give `leaf` (the first line for it wins), or null when there is no line. */
export function statusIn(threads: readonly CounterpartLine[], leaf: string): CounterpartStatus | null {
  return threads.find(t => t.leaf === leaf)?.status ?? null;
}

/**
 * `threads` with `leaf` set to `status`: every line for the leaf changes (a
 * hand-written duplicate keeps saying the same), its columns kept; a leaf
 * without a line gets one at the end.
 */
export function withCounterpartStatus(threads: readonly CounterpartLine[], leaf: string, status: CounterpartStatus): CounterpartLine[] {
  const key = leaf.toLowerCase();
  if (!threads.some(t => t.leaf === key)) return [...threads, {leaf: key, status, rest: null, raw: null}];
  return threads.map(t => (t.leaf === key ? {...t, status} : t));
}
