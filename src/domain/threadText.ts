/**
 * Texts of the thread overview (docs/dev/history/technical-design-tending-threads.md
 * §3.5). Pure; counts and ages only, no scores or rankings (§1.1).
 */
import {formatDate, formatDayHeader} from './dateFormat';

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

/** What a roster row needs for its two signal texts (storage/tendingRoster.ts's RosterEntry fits). */
export interface RosterSignals {
  lastMeeting: string | null;
  nextMeeting: string | null;
  oweCount: number;
  waitingCount: number;
  oldestWaitingDays: number | null;
}

/**
 * The meeting text of a counterpart row: `last 30.9. · next 14.10.` (a dash
 * for a missing date), or for a one-off counterpart its label alone - no
 * "next —", since no meeting is expected (decision D17).
 */
export function rosterMeetingText(signals: RosterSignals, oneOffText: string | null, today: string): string {
  if (oneOffText) return oneOffText;
  const date = (iso: string | null) => (iso ? formatDate(iso, today) : '—');
  return `last ${date(signals.lastMeeting)} · next ${date(signals.nextMeeting)}`;
}

/** The counts text of a counterpart row: `2 owe · w/f 18 d` (`1 w/f` when no Waiting-for todo has a created date); '' when both are empty. */
export function rosterCountsText(signals: RosterSignals): string {
  const parts: string[] = [];
  if (signals.oweCount > 0) parts.push(`${signals.oweCount} owe`);
  if (signals.waitingCount > 0) {
    parts.push(signals.oldestWaitingDays !== null ? `w/f ${signals.oldestWaitingDays} d` : `${signals.waitingCount} w/f`);
  }
  return parts.join(' · ');
}
