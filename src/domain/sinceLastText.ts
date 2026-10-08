/**
 * The text of the "Since last time" note piece
 * (docs/dev/history/technical-design-tending-threads.md §3.11). Pure.
 *
 * A heading with the previous meeting's day, then the blocks in order -
 * Agreed last time, I owe, Waiting for, Relevant, Done since then - each at
 * most `SINCE_LAST_BLOCK_LINES` lines, then "… +N more" (decision D10).
 * Empty blocks are left out; without blocks there is nothing to write.
 */
import {formatDayHeader} from './dateFormat';

export const SINCE_LAST_BLOCK_LINES = 6;

export interface SinceLastLine {
  text: string;
  done: boolean;
}

export interface SinceLastBlock {
  title: string;
  lines: SinceLastLine[];
}

export interface SinceLast {
  /** The previous meeting's date (YYYY-MM-DD). */
  previous: string;
  blocks: SinceLastBlock[];
}

/** The piece's text, or '' when no block has a line. */
export function renderSinceLast(since: SinceLast | null | undefined, today?: string): string {
  if (!since) return '';
  const blocks = since.blocks.filter(b => b.lines.length > 0);
  if (blocks.length === 0) return '';
  const out = [`Since last time · ${formatDayHeader(since.previous, today)}`];
  for (const block of blocks) {
    out.push(`${block.title}:`);
    for (const line of block.lines.slice(0, SINCE_LAST_BLOCK_LINES)) out.push(`${line.done ? '✓' : '-'} ${line.text}`);
    if (block.lines.length > SINCE_LAST_BLOCK_LINES) out.push(`… +${block.lines.length - SINCE_LAST_BLOCK_LINES} more`);
  }
  return out.join('\n');
}
