/**
 * Texts of the thread overview (docs/dev/history/technical-design-tending-threads.md
 * §3.5). Pure; counts and ages only, no scores or rankings (§1.1).
 */
import {formatDayHeader} from './dateFormat';

export interface PastMeetingCounts {
  agreed: number;
  done: number;
  open: number;
  oldestOpenDays: number | null;
}

/** Line 2 of a "Looking back" row: `3 agreed · 1 done · 2 open, oldest 12 d`. */
export function pastMeetingSummary(counts: PastMeetingCounts): string {
  if (counts.agreed === 0) return 'nothing agreed';
  const open = counts.open > 0 && counts.oldestOpenDays !== null ? `${counts.open} open, oldest ${counts.oldestOpenDays} d` : `${counts.open} open`;
  return `${counts.agreed} agreed · ${counts.done} done · ${open}`;
}

/** The group head of done todos in the meeting panel: `Done · Tue 6.10.`, or just `Done` without a date. */
export function doneGroupLabel(completion: string | null, today: string): string {
  return completion ? `Done · ${formatDayHeader(completion, today)}` : 'Done';
}

/** The "Since" row of Looking back: `Since Tue 6.10. · 3 done`. */
export function sinceRowLabel(from: string, count: number, today: string): string {
  return `Since ${formatDayHeader(from, today)} · ${count} done`;
}

/** The overview header's lens switch labels. */
export function lensLabels(thread: {tag: string; counterpart: string}): {thread: string; counterpart: string} {
  return {thread: `#${thread.tag}`, counterpart: `All ${thread.counterpart}`};
}
