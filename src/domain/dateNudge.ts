/**
 * Date "nudge" arithmetic behind ui/DateInput.tsx's -1 / Today / +1 / +7
 * button strip (docs/dev/technical-design-meeting-date-nudge-and-new-from-this.md
 * §A). The point of the buttons is to avoid retyping a whole YYYY-MM-DD just
 * to move a date by a day or a week, so every rule reduces to one:
 *
 *   base = the field's date if it is a REAL YYYY-MM-DD date, else today
 *   result = base + delta            (Today ignores the base and returns today)
 *
 * which gives exactly the requested behaviour for an empty field too: -1 is
 * yesterday, +1 is tomorrow, +7 is today + 7 (= the same weekday next week).
 * Half-typed text ("2026-09-") and impossible dates ("2026-02-31") count as
 * "not a date" and are simply replaced.
 *
 * Pure, zero RN/SDK imports (domain/ convention, see markdown.ts) - every
 * wall-clock read goes through an injectable `now` so this stays testable
 * without mocking global Date.
 */
import {MEETING_DATE_RE, todayIso} from './meetingTime';

export type DateNudge = 'minus1' | 'today' | 'plus1' | 'plus7';

/** Button order and labels, as rendered left to right. ASCII on purpose - no reliance on a font having a proper minus sign. */
export const DATE_NUDGES: ReadonlyArray<{kind: DateNudge; label: string}> = [
  {kind: 'minus1', label: '-1'},
  {kind: 'today', label: 'Today'},
  {kind: 'plus1', label: '+1'},
  {kind: 'plus7', label: '+7'},
];

const NUDGE_DAYS: Record<Exclude<DateNudge, 'today'>, number> = {
  minus1: -1,
  plus1: 1,
  plus7: 7,
};

/** True only for a real calendar date written as YYYY-MM-DD ("2026-02-31" is not one - it would silently roll over into March). */
export function isValidIsoDate(value: string): boolean {
  if (!MEETING_DATE_RE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/**
 * `iso` shifted by `days` calendar days, as YYYY-MM-DD. Precondition:
 * `isValidIsoDate(iso)`. Built from calendar fields (not milliseconds), same
 * technique as meetingTime.ts's isoDateOffset, so a DST transition can never
 * land the result on the wrong calendar day.
 */
export function addDaysToIso(iso: string, days: number): string {
  const [year, month, day] = iso.split('-').map(Number);
  return todayIso(new Date(year, month - 1, day + days));
}

/** The date `nudge` turns `current` into - see the module doc comment for the base rule. */
export function nudgeIsoDate(current: string, nudge: DateNudge, now: Date = new Date()): string {
  if (nudge === 'today') return todayIso(now);
  const trimmed = current.trim();
  const base = isValidIsoDate(trimmed) ? trimmed : todayIso(now);
  return addDaysToIso(base, NUDGE_DAYS[nudge]);
}
