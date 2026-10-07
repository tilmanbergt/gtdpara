/**
 * Date/time helpers for Meetings: today's-date default, flexible time-entry
 * parsing, the upcoming/past split+sort ProjectDataPanel's Meetings section
 * uses, and the combined title/date/time validation every Meeting add/edit
 * form (ProjectDataPanel's, DailyView's) runs before saving.
 * Pure, zero RN/SDK imports (domain/ convention, see markdown.ts) - all
 * wall-clock reads happen through an injectable `now` parameter so this
 * stays testable without mocking global Date.
 */
import {Meeting} from './types';
import {formatDate} from './dateFormat';

/** Today's date as YYYY-MM-DD, in local time - used to prefill a new meeting's date field. */
export function todayIso(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * A date `days` away from `now`, as YYYY-MM-DD - `isoDateOffset(1, now)` is
 * "tomorrow". Used by the Daily view to find meetings dated today or
 * tomorrow. Built from calendar fields (not `now.getTime() + days*86400000`)
 * so a DST transition never shifts the result onto the wrong calendar day.
 */
export function isoDateOffset(days: number, now: Date = new Date()): string {
  const shifted = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days);
  return todayIso(shifted);
}

export type FlexibleTimeResult =
  | {ok: true; value: string}
  | {ok: false; error: string};

/**
 * Parses a meeting time field that may be blank (no time at all), a bare
 * 1-2 digit hour ("8", "14" - minutes default to "00"), or "H:MM"/"HH:MM"
 * with an *exactly* 2-digit minute. A 1-digit minute after a colon ("8:5")
 * is rejected rather than silently zero-padded - it reads as a likely
 * truncated entry (probably "8:50" or "8:05"), not a deliberate ":05".
 * Always normalizes to a zero-padded "HH:mm" (or '' for blank) so the
 * result round-trips through domain/markdown.ts's MEETING_LINE_RE, which
 * requires exactly two digits on each side.
 */
export function parseFlexibleTime(input: string): FlexibleTimeResult {
  const trimmed = input.trim();
  if (trimmed.length === 0) return {ok: true, value: ''};

  const bareHour = /^(\d{1,2})$/.exec(trimmed);
  // ":" or "." as the minute separator ("16:30" / "16.30") -
  // docs/dev/history/technical-design-monthly-view.md §3.2.
  const hourAndMinute = /^(\d{1,2})[:.](\d+)$/.exec(trimmed);

  let hour: number;
  let minute: number;

  if (bareHour) {
    hour = Number(bareHour[1]);
    minute = 0;
  } else if (hourAndMinute) {
    hour = Number(hourAndMinute[1]);
    if (hourAndMinute[2].length !== 2) {
      return {
        ok: false,
        error: 'Minutes need two digits, e.g. 8:05 or 8:50 (not 8:5).',
      };
    }
    minute = Number(hourAndMinute[2]);
  } else {
    return {ok: false, error: 'Time must be H:mm or HH:mm (24h), or left blank.'};
  }

  if (hour < 0 || hour > 23) return {ok: false, error: 'Hour must be 0-23.'};
  if (minute < 0 || minute > 59) return {ok: false, error: 'Minutes must be 00-59.'};

  return {ok: true, value: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`};
}

export const MEETING_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** A meeting's "when" beyond its date - what the Quick Add time field parses to (docs/dev/history/technical-design-monthly-view.md §3.2). */
export interface MeetingWhen {
  /** HH:mm start, or '' for a date-only meeting. */
  time: string;
  /** HH:mm end, or '' (none given / date-only). */
  endTime: string;
  /** Whole days for a date-only meeting (>= 1); always 1 when `time` is set. */
  days: number;
}

export const MAX_MEETING_DAYS = 60;

/**
 * Parses the meeting time field:
 * - '' or "1d"       -> date-only, 1 day (a blank field is saved as "1d")
 * - "3d"             -> date-only, 3 days
 * - "15", "9:30", "9.30"            -> start time, no end
 * - "15-16.30", "15:00 - 16:30"     -> start and end
 * A time range must end after it starts (no midnight crossing); days and a
 * time can't be combined.
 */
export function parseMeetingWhen(input: string): {ok: true; value: MeetingWhen} | {ok: false; error: string} {
  const trimmed = input.trim();
  if (trimmed.length === 0) return {ok: true, value: {time: '', endTime: '', days: 1}};
  const daysMatch = /^(\d+)\s*d$/i.exec(trimmed);
  if (daysMatch) {
    const days = Number(daysMatch[1]);
    if (days < 1 || days > MAX_MEETING_DAYS) {
      return {ok: false, error: `Days must be 1-${MAX_MEETING_DAYS} (e.g. 1d, 3d).`};
    }
    return {ok: true, value: {time: '', endTime: '', days}};
  }
  if (/d/i.test(trimmed)) {
    return {ok: false, error: 'Use either a time (15, 15-16.30) or days (1d, 3d), not both.'};
  }
  const parts = trimmed.split('-').map(p => p.trim());
  if (parts.length > 2) return {ok: false, error: 'Time must be like 15, 15:30 or 15-16.30.'};
  const start = parseFlexibleTime(parts[0]);
  if (!start.ok) return start;
  if (!start.value) return {ok: false, error: 'Time must be like 15, 15:30 or 15-16.30.'};
  if (parts.length === 1) return {ok: true, value: {time: start.value, endTime: '', days: 1}};
  const end = parseFlexibleTime(parts[1]);
  if (!end.ok) return end;
  if (!end.value) return {ok: false, error: 'Add an end time after "-", e.g. 15-16.30.'};
  if (end.value <= start.value) return {ok: false, error: 'End time must be after the start time.'};
  return {ok: true, value: {time: start.value, endTime: end.value, days: 1}};
}

/** The time field's text for an existing meeting: "15:00", "15:00-16:30", "1d", "3d". */
export function formatMeetingWhen(w: Pick<Meeting, 'time' | 'endTime' | 'days'>): string {
  if (w.time) return w.endTime ? `${w.time}-${w.endTime}` : w.time;
  return `${Math.max(1, w.days || 1)}d`;
}

/**
 * The date portion to prepend to a meeting/event's displayed time, per the
 * app's list-display rule: today shows no date prefix (the time alone is
 * enough), any other day gets a short "day.month." prefix (e.g. "20.4.")
 * ahead of the time (domain/dateFormat.ts), so a meeting/event list spanning more than one day
 * (ProjectDataPanel's/InboxScreen's Meetings sections, ReviewScreen's
 * Inbox-to-zero cards, ui/GoogleCalendarPanel.tsx's up-to-30-day window)
 * never shows a bare time with no indication of which day it's on. Used by
 * ui/MeetingRow.tsx and ui/GoogleCalendarPanel.tsx so every such list in the
 * app follows the same rule.
 */
export function meetingDatePrefix(date: string, now: Date = new Date()): string {
  const today = todayIso(now);
  return date === today ? '' : formatDate(date, today);
}

/** Which Quick Add field a failed validation is about - drives the in-place ⚠ mark (docs/dev/history/technical-design-status-slot.md §6). */
export type MeetingField = 'title' | 'date' | 'time';

export type MeetingFieldsValidation =
  | {ok: true; time: string; endTime: string; days: number}
  | {ok: false; error: string; field: MeetingField};

/**
 * Validates a meeting's title/date/time input fields together - the same
 * three checks every add/edit form for a Meeting needs (a title, a
 * YYYY-MM-DD date, a parseable time), pulled out of ProjectDataPanel so
 * DailyView's own quick-add/edit forms use exactly the same rules rather
 * than a second, potentially-drifting copy. Returns the normalized time
 * string (see parseFlexibleTime) on success.
 */
export function validateMeetingFields(title: string, date: string, time: string): MeetingFieldsValidation {
  if (!title.trim()) return {ok: false, error: 'A meeting needs a title.', field: 'title'};
  if (!MEETING_DATE_RE.test(date)) return {ok: false, error: 'Date must be YYYY-MM-DD.', field: 'date'};
  // The time field also carries the meeting's length (docs/dev/technical-design-
  // monthly-view.md §3.2) - see parseMeetingWhen.
  const when = parseMeetingWhen(time);
  if (!when.ok) return {ok: false, error: when.error, field: 'time'};
  return {ok: true, ...when.value};
}

/**
 * A meeting's date+time as a comparable timestamp.
 *
 * A date-only meeting (time === '') dated *today* sorts as the very last
 * thing today (23:59:59) rather than the first (00:00): nothing pins it to
 * a specific hour, so it should read as "sometime later today" - still
 * upcoming for as long as today lasts, and after every timed meeting today
 * rather than before them. A date-only meeting on any other date keeps
 * sorting as 00:00 that day, which only affects same-day relative ordering
 * against another entry sharing that exact date, never the upcoming/past
 * split (the date alone already decides that once it isn't today).
 */
export function meetingTimestampMs(
  meeting: Pick<Meeting, 'date' | 'time'>,
  now: Date = new Date(),
): number {
  const time = meeting.time || (meeting.date === todayIso(now) ? '23:59:59' : '00:00:00');
  const parsed = new Date(`${meeting.date}T${time.length === 5 ? `${time}:00` : time}`);
  const ms = parsed.getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * True when a meeting's date is today or later - a whole-DAY comparison, not
 * a timestamp one: a meeting earlier today that already started still counts
 * (unlike `meetingTimestampMs`/`splitAndSortMeetings`' upcoming/past split,
 * which is time-aware). Used by Review's Inbox-to-zero step, which only
 * wants to surface meetings that can still be acted on. A
 * malformed/missing date is treated as "keep it" so such an entry can never
 * silently drop out of the review. Plain string comparison is correct here
 * because both sides are zero-padded YYYY-MM-DD.
 */
export function isTodayOrFuture(date: string, now: Date = new Date()): boolean {
  if (!MEETING_DATE_RE.test(date)) return true;
  return date >= todayIso(now);
}

export interface IndexedMeeting {
  meeting: Meeting;
  index: number;
}

export interface SplitMeetings {
  /** Not yet happened (timestamp >= now), soonest first - the top one is next up. */
  upcoming: IndexedMeeting[];
  /** Already happened (timestamp < now), most recent first. */
  past: IndexedMeeting[];
}

function parseIsoDateLocal(iso: string): {year: number; month: number; day: number} {
  const [year, month, day] = iso.split('-').map(Number);
  return {year, month, day};
}

/**
 * The instant a Meeting's note stops getting auto-*re*populated on open
 * (docs/dev/history/technical-design-note-templates.md Phase 3): auto-update runs
 * through the meeting's day and until one hour after its time. A date-only
 * meeting (no time given) freezes at the end of its date - 23:59:59.999
 * local - since nothing pins it to a specific hour; a timed meeting freezes
 * one hour past its start. Built from calendar fields via
 * `parseIsoDateLocal` + `new Date(year, month-1, day, ...)`, same
 * local-time-construction convention `isoDateOffset` above follows, so this
 * never shifts a day depending on the device's timezone offset. This is
 * *only* the cutoff instant - see `isMeetingAutoUpdateFrozen` below for the
 * actual frozen/not-frozen check, which also folds in `cancelled`.
 */
export function meetingAutoUpdateCutoffMs(meeting: MeetingEndInput): number {
  return meetingEndMs(meeting);
}

/** What `meetingEndMs` reads - `endTime`/`days` optional so callers' narrower Picks still fit (missing = no end / 1 day). */
export type MeetingEndInput = Pick<Meeting, 'date' | 'time'> & Partial<Pick<Meeting, 'endTime' | 'days'>>;

/**
 * The instant a meeting is over (docs/dev/history/technical-design-monthly-view.md
 * §3.2), using the real meeting end when available:
 * - timed with an end time -> that end time
 * - timed without one      -> start + 1 h
 * - date-only              -> end (23:59:59.999) of its LAST covered day
 * Used for the note-refresh freeze and the prep->review switch
 * (domain/meetingTracking.ts), so both follow the real end.
 */
export function meetingEndMs(meeting: MeetingEndInput): number {
  const {year, month, day} = parseIsoDateLocal(meeting.date);
  if (!meeting.time) {
    const days = Math.max(1, meeting.days ?? 1);
    return new Date(year, month - 1, day + days - 1, 23, 59, 59, 999).getTime();
  }
  const [hourStr, minuteStr] = meeting.time.split(':');
  const start = new Date(year, month - 1, day, Number(hourStr), Number(minuteStr)).getTime();
  if (meeting.endTime) {
    const [endH, endM] = meeting.endTime.split(':');
    const end = new Date(year, month - 1, day, Number(endH), Number(endM)).getTime();
    if (end > start) return end;
  }
  return start + 60 * 60 * 1000;
}

/**
 * Whether a Meeting's note should stop being auto-*re*populated on open
 * (storage/meetingNoteContent.ts's `refreshMeetingNoteBlock`) - true once
 * `now` is past `meetingAutoUpdateCutoffMs`, or immediately for a cancelled
 * meeting (a cancelled meeting's note is done changing regardless of its
 * date/time). Never gates *creation* - a newly-linked note always gets its
 * initial data once, however frozen its meeting already is - callers pass
 * an explicit bypass for that path rather than this function trying to
 * distinguish the two itself.
 */
export function isMeetingAutoUpdateFrozen(
  meeting: MeetingEndInput & Pick<Meeting, 'cancelled'>,
  now: Date = new Date(),
): boolean {
  if (meeting.cancelled) return true;
  return now.getTime() > meetingAutoUpdateCutoffMs(meeting);
}

/** Splits and sorts for display - see ProjectDataPanel's MeetingsSection. Original array indexes are preserved on each entry for editing/cancelling. */
export function splitAndSortMeetings(
  entries: IndexedMeeting[],
  nowMs: number = Date.now(),
): SplitMeetings {
  // Computed once and threaded through every call below, rather than each
  // meetingTimestampMs call defaulting to its own `new Date()` - keeps
  // "today" and the >= comparison judged against the exact same instant.
  const now = new Date(nowMs);
  const timestamp = (meeting: Meeting) => meetingTimestampMs(meeting, now);

  const upcoming: IndexedMeeting[] = [];
  const past: IndexedMeeting[] = [];
  for (const entry of entries) {
    if (timestamp(entry.meeting) >= nowMs) {
      upcoming.push(entry);
    } else {
      past.push(entry);
    }
  }
  upcoming.sort((a, b) => timestamp(a.meeting) - timestamp(b.meeting));
  past.sort((a, b) => timestamp(b.meeting) - timestamp(a.meeting));
  return {upcoming, past};
}
