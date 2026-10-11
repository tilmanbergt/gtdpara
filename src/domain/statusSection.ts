/**
 * A status section of an Area or Project file: one line per entry,
 * `- <key>: <status>[, <columns>]`. Shared by `## Threads`
 * (domain/threadsSection.ts) and `## Loops` (domain/loopsSection.ts). Pure.
 *
 * - The key and the status are read case-insensitively and kept lowercased.
 * - Everything after the first comma is kept verbatim (`rest`) - room for
 *   columns a section defines, or adds later.
 * - Lines that are not status lines are kept and written after the status
 *   lines, like every other section's unknown lines.
 * - A line nobody changed is written back exactly as it was read (`raw`).
 */
import {readSectionLines, writeSectionLines} from './markdown';

export interface StatusLine<S extends string> {
  /** Lowercased. */
  key: string;
  status: S;
  /** Everything after the first comma, verbatim; null when there is none. */
  rest: string | null;
  /** The line as read; null for a line built here. Written back unchanged while key/status/rest match it. */
  raw: string | null;
}

export interface StatusSectionSpec<S extends string> {
  heading: string;
  statuses: readonly S[];
  /** The key's pattern (no anchors, no groups). */
  keyPattern: string;
}

function lineRegExp(spec: StatusSectionSpec<string>): RegExp {
  return new RegExp(`^-\\s+(${spec.keyPattern})\\s*:\\s*(${spec.statuses.join('|')})\\s*(?:,(.*))?$`, 'i');
}

/** One status line, or null when `line` is not one. */
export function parseStatusLine<S extends string>(spec: StatusSectionSpec<S>, line: string): StatusLine<S> | null {
  const m = lineRegExp(spec).exec(line.trim());
  if (!m) return null;
  return {key: m[1].toLowerCase(), status: m[2].toLowerCase() as S, rest: m[3] ?? null, raw: line};
}

/** The line to write: the line as read while it still says the same, else `- key: status[,rest]`. */
export function serializeStatusLine<S extends string>(spec: StatusSectionSpec<S>, entry: StatusLine<S>): string {
  if (entry.raw !== null) {
    const reread = parseStatusLine(spec, entry.raw);
    if (reread && reread.key === entry.key && reread.status === entry.status && reread.rest === entry.rest) return entry.raw;
  }
  return `- ${entry.key}: ${entry.status}${entry.rest !== null ? `,${entry.rest}` : ''}`;
}

/** The status lines of `content`'s section, in file order, and its other non-blank lines. */
export function parseStatusSection<S extends string>(
  spec: StatusSectionSpec<S>,
  content: string,
): {lines: StatusLine<S>[]; extraLines: string[]} {
  const lines: StatusLine<S>[] = [];
  const extraLines: string[] = [];
  for (const line of readSectionLines(content, spec.heading).lines) {
    if (line.trim() === '') continue;
    const entry = parseStatusLine(spec, line);
    if (entry) lines.push(entry);
    else extraLines.push(line);
  }
  return {lines, extraLines};
}

/** Rewrites only this section (appended when missing): status lines, then the kept lines. */
export function writeStatusSection<S extends string>(
  spec: StatusSectionSpec<S>,
  content: string,
  lines: readonly StatusLine<S>[],
  extraLines: readonly string[] = [],
): string {
  return writeSectionLines(content, spec.heading, [...lines.map(l => serializeStatusLine(spec, l)), ...extraLines]);
}
