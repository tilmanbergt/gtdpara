/**
 * The one place that turns dates and times into display text.
 *
 * Format: day and month without leading zeros, 24-hour time without a leading
 * zero on the hour - `6.10.`, `6.10. 14:05`, `9:05`. The year is added when it
 * isn't the current one (`6.10.2027`), or always when no `today` is passed
 * (archive PDFs, release dates). Files keep ISO (`2026-10-06`, `09:05`); only
 * what is shown goes through here, so a user-chosen format can later be added
 * in this file alone.
 *
 * Input that isn't a valid ISO date or `HH:mm` time comes back unchanged.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const HH_MM = /^(\d{1,2}):(\d{2})$/;
const LOCAL_STAMP = /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}:\d{2})/;
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parts(iso: string): {year: number; month: number; day: number} | null {
  const m = ISO_DATE.exec(iso);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return {year, month, day};
}

/** `6.10.` (current year, given `today` as YYYY-MM-DD), `6.10.2027` otherwise. */
export function formatDate(iso: string, today?: string): string {
  const p = parts(iso);
  if (!p) return iso;
  const sameYear = today !== undefined && today.slice(0, 4) === String(p.year);
  return sameYear ? `${p.day}.${p.month}.` : `${p.day}.${p.month}.${p.year}`;
}

/** `30.9.2026`: always with the year - the date of a note heading (docs/dev/history/technical-design-projects-findable-notes.md §2.1 R2). */
export function formatHeadingDate(iso: string): string {
  return formatDate(iso);
}

/** `9:05`, `14:05` from `09:05` / `14:05`. */
export function formatTime(hhmm: string): string {
  const m = HH_MM.exec(hhmm);
  if (!m) return hhmm;
  return `${Number(m[1])}:${m[2]}`;
}

/** `6.10. 14:05`; just the date when `hhmm` is empty. */
export function formatDateTime(iso: string, hhmm: string, today?: string): string {
  const date = formatDate(iso, today);
  return hhmm ? `${date} ${formatTime(hhmm)}` : date;
}

/** A stored local timestamp `2026-10-06T14:05` or `2026-10-06 14:05` as `6.10. 14:05`. */
export function formatStamp(stamp: string, today?: string): string {
  const m = LOCAL_STAMP.exec(stamp);
  return m ? formatDateTime(m[1], m[2], today) : stamp;
}

/** `Tue 6.10.` - a day heading. */
export function formatDayHeader(iso: string, today?: string): string {
  const p = parts(iso);
  if (!p) return iso;
  const weekday = WEEKDAYS[new Date(p.year, p.month - 1, p.day).getDay()];
  return `${weekday} ${formatDate(iso, today)}`;
}

/** `15.5.–16.5.`; one date when both are the same day. */
export function formatDateRange(startIso: string, endIso: string, today?: string): string {
  if (startIso === endIso) return formatDate(startIso, today);
  return `${formatDate(startIso, today)}–${formatDate(endIso, today)}`;
}

/** The time of day of `date` (local), e.g. `9:05`. */
export function formatClock(date: Date): string {
  return `${date.getHours()}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** `Tue 28.9.` - a weekday plus date, used where a relative word ("today", "3 days ago") does not fit. */
export function formatWeekdayDate(date: Date, today?: string): string {
  const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return formatDayHeader(iso, today);
}
