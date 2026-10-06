/**
 * ICS (RFC 5545) parsing + RRULE expansion for the Google Calendar feature
 * (docs/dev/history/technical-design-google-calendar.md §4). Ported and trimmed from the
 * sibling SNFolio project's src/domain/icsParser.ts rather than adding an
 * external ICS/RRULE library - that implementation is tested and running in
 * production there, with zero dependencies. Trimmed to this feature's
 * narrower need: VEVENT only (no VTODO), no
 * attendees/description/location/priority - just enough to list upcoming
 * events and copy one as a one-off local Meeting. Pure TS, zero RN/SDK
 * imports (domain/ convention, see markdown.ts).
 */
import {GoogleCalendarEvent} from './googleCalendarEvent';

/** One parsed VEVENT, before RRULE expansion - see parseIcsContent. */
export interface ParsedIcsEvent {
  uid: string;
  summary: string;
  start: Date;
  end: Date;
  allDay: boolean;
  /** Raw RRULE value (e.g. "FREQ=WEEKLY;BYDAY=MO"), or undefined for a one-off event. */
  rrule?: string;
  /** Local-date-keyed (YYYY-MM-DD) occurrences of `rrule` to skip - from EXDATE lines and cancelled RECURRENCE-ID overrides. */
  exceptionDates?: string[];
  /** Present only on a RECURRENCE-ID override instance - not expanded further itself, see the master-folding pass in parseIcsContent. */
  recurrenceId?: Date;
  /** Set on every instance/override of a recurring series to its master's UID, so a copied occurrence can be told apart from a plain one-off if ever needed. */
  recurringSeriesId?: string;
}

/** Unfolds folded lines in ICS files per RFC 5545 (line ending + leading whitespace continuation). */
export function unfoldIcsContent(icsData: string): string[] {
  const lines = icsData.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const unfolded: string[] = [];

  for (const line of lines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else {
      unfolded.push(line);
    }
  }

  return unfolded;
}

/** Unescapes ICS string values (SUMMARY etc.) per RFC 5545. */
export function unescapeIcsValue(val: string): string {
  return val
    .replace(/\\\\/g, '\\')
    .replace(/\\;/g, ';')
    .replace(/\\,/g, ',')
    .replace(/\\n/gi, '\n');
}

/** Parses one ICS date/date-time property line (e.g. "DTSTART;TZID=Europe/Berlin:20260905T090000") into a JS Date plus whether it was an all-day (VALUE=DATE) value. */
export function parseIcsDate(datePropStr: string): {date: Date; allDay: boolean} {
  let valStr = datePropStr;
  let allDay = false;

  if (datePropStr.includes(':')) {
    const parts = datePropStr.split(':');
    const paramPart = parts[0];
    valStr = parts.slice(1).join(':');

    if (paramPart.includes('VALUE=DATE')) {
      allDay = true;
    }
  }

  valStr = valStr.trim();

  // All-day YYYYMMDD
  if (valStr.length === 8 && !valStr.includes('T')) {
    const yr = parseInt(valStr.slice(0, 4), 10);
    const mo = parseInt(valStr.slice(4, 6), 10) - 1;
    const dy = parseInt(valStr.slice(6, 8), 10);
    return {date: new Date(yr, mo, dy, 0, 0, 0), allDay: true};
  }

  // YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
  const match = valStr.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (match) {
    const yr = parseInt(match[1], 10);
    const mo = parseInt(match[2], 10) - 1;
    const dy = parseInt(match[3], 10);
    const hr = parseInt(match[4], 10);
    const mn = parseInt(match[5], 10);
    const sc = parseInt(match[6], 10);
    const isUtc = match[7] === 'Z';

    if (isUtc) {
      return {date: new Date(Date.UTC(yr, mo, dy, hr, mn, sc)), allDay};
    }
    const tzid = datePropStr.match(/(?:^|;)TZID=([^;:]+)/i)?.[1]?.replace(/^"|"$/g, '');
    if (tzid) {
      return {date: zonedDate(yr, mo, dy, hr, mn, sc, tzid), allDay};
    }
    return {date: new Date(yr, mo, dy, hr, mn, sc), allDay};
  }

  const fallback = new Date(valStr);
  return {date: fallback, allDay};
}

/**
 * Converts wall-clock fields in an IANA zone (e.g. "Europe/Berlin") to an
 * absolute Date, via Intl.DateTimeFormat rather than a bundled timezone
 * database - avoids VTIMEZONE parsing and keeps this dependency-free. A
 * second convergence pass resolves the offset correctly on the far side of a
 * DST transition. An unrecognized zone name falls back to device-local time
 * (still usable, just not zone-correct) rather than throwing.
 */
function zonedDate(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timeZone: string,
): Date {
  const desired = Date.UTC(year, month, day, hour, minute, second);
  let guess = desired;
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
    for (let pass = 0; pass < 2; pass++) {
      const parts = Object.fromEntries(
        formatter.formatToParts(new Date(guess)).map(p => [p.type, p.value]),
      );
      const represented = Date.UTC(
        Number(parts.year), Number(parts.month) - 1, Number(parts.day),
        Number(parts.hour), Number(parts.minute), Number(parts.second),
      );
      guess += desired - represented;
    }
    return new Date(guess);
  } catch (_error) {
    return new Date(year, month, day, hour, minute, second);
  }
}

function localDateKey(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

function dateKeys(date: Date): string[] {
  return [...new Set([localDateKey(date), date.toISOString().slice(0, 10)])];
}

/**
 * Parses raw ICS content into VEVENTs only (VTODO is skipped entirely -
 * this feature is calendar events, not tasks-from-a-calendar). A
 * STATUS:CANCELLED plain event is dropped outright; a cancelled
 * RECURRENCE-ID override is folded into its master's exceptionDates instead
 * of appearing as its own instance, same as a real EXDATE would.
 */
export function parseIcsContent(icsData: string): ParsedIcsEvent[] {
  const lines = unfoldIcsContent(icsData);
  const events: (ParsedIcsEvent & {cancelled?: boolean})[] = [];

  let inEvent = false;
  let currentEvent: Partial<ParsedIcsEvent> & {cancelled?: boolean} = {};
  let eventCounter = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'BEGIN:VEVENT') {
      inEvent = true;
      eventCounter++;
      currentEvent = {};
      continue;
    }

    if (trimmed === 'END:VEVENT') {
      if (inEvent) {
        const uid = currentEvent.uid || `evt-auto-${Date.now()}-${eventCounter}`;
        const start = currentEvent.start;
        if (!start) {
          inEvent = false;
          currentEvent = {};
          continue;
        }
        const end = currentEvent.end || new Date(start.getTime() + 60 * 60 * 1000);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
          inEvent = false;
          currentEvent = {};
          continue;
        }
        if (!currentEvent.cancelled || currentEvent.recurrenceId) {
          // A plain cancelled event is dropped outright (the `if` above's
          // left side); a cancelled RECURRENCE-ID override is still pushed
          // here (right side, since it *has* a recurrenceId) so the
          // master-folding pass below can read its cancelled flag and fold
          // it into the master's exceptionDates instead of emitting it.
          events.push({
            uid,
            summary: currentEvent.summary || '(No Title)',
            start,
            end,
            allDay: currentEvent.allDay || false,
            rrule: currentEvent.rrule,
            recurringSeriesId: currentEvent.rrule || currentEvent.recurrenceId ? uid : undefined,
            recurrenceId: currentEvent.recurrenceId,
            exceptionDates: currentEvent.exceptionDates,
            cancelled: currentEvent.cancelled,
          });
        }
      }
      inEvent = false;
      currentEvent = {};
      continue;
    }

    if (!inEvent) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;

    const propNameAndParams = trimmed.slice(0, colonIdx);
    const propVal = trimmed.slice(colonIdx + 1);
    const mainProp = propNameAndParams.split(';')[0].toUpperCase();

    switch (mainProp) {
      case 'UID':
        currentEvent.uid = propVal;
        break;
      case 'SUMMARY':
        currentEvent.summary = unescapeIcsValue(propVal);
        break;
      case 'DTSTART': {
        const {date, allDay} = parseIcsDate(trimmed);
        currentEvent.start = date;
        currentEvent.allDay = allDay;
        break;
      }
      case 'DTEND': {
        const {date} = parseIcsDate(trimmed);
        currentEvent.end = date;
        break;
      }
      case 'RRULE':
        currentEvent.rrule = propVal;
        break;
      case 'EXDATE': {
        const dates = propVal
          .split(',')
          .map(value => parseIcsDate(`${propNameAndParams}:${value}`).date)
          .filter(date => !Number.isNaN(date.getTime()))
          .map(localDateKey);
        currentEvent.exceptionDates = [...(currentEvent.exceptionDates || []), ...dates];
        break;
      }
      case 'RECURRENCE-ID':
        currentEvent.recurrenceId = parseIcsDate(trimmed).date;
        break;
      case 'STATUS':
        currentEvent.cancelled = propVal.toUpperCase() === 'CANCELLED';
        break;
    }
  }

  // A RECURRENCE-ID VEVENT shares its UID with its master. Fold it into the
  // series: always mark its date as an exception on the master (so the
  // RRULE expansion below never double-generates that occurrence), and only
  // emit it as its own standalone instance when it isn't itself cancelled.
  const masters = new Map(events.filter(e => e.rrule).map(e => [e.uid, e]));
  const output: ParsedIcsEvent[] = [];
  for (const event of events) {
    if (!event.recurrenceId) {
      if (!event.cancelled) output.push(event);
      continue;
    }
    const master = masters.get(event.uid);
    const key = localDateKey(event.recurrenceId);
    if (master) master.exceptionDates = [...new Set([...(master.exceptionDates || []), key])];
    if (!event.cancelled) {
      output.push({
        ...event,
        uid: `${event.uid}_${key}`,
        recurrenceId: undefined,
        rrule: undefined,
        recurringSeriesId: event.uid,
      });
    }
  }
  return output;
}

/**
 * Expands every event (recurring or not) that overlaps [rangeStart,
 * rangeEnd] into concrete instances - the single-range equivalent of
 * SNFolio's per-day expandEventsForDate, since this feature always wants
 * "today .. +30 days" in one pass rather than a day at a time.
 */
export function expandEventsForRange(
  events: ParsedIcsEvent[],
  rangeStart: Date,
  rangeEnd: Date,
): ParsedIcsEvent[] {
  const result: ParsedIcsEvent[] = [];

  for (const event of events) {
    if (event.exceptionDates && dateKeys(event.start).some(key => event.exceptionDates?.includes(key)) && !event.rrule) {
      continue;
    }

    if (!event.rrule) {
      // Include overnight/multi-day events on any overlap with the range.
      // End is exclusive, matching all-day DTEND semantics.
      if (event.start <= rangeEnd && event.end > rangeStart) {
        result.push(event);
      }
    } else {
      result.push(...expandRruleInstances(event, rangeStart, rangeEnd));
    }
  }

  return result.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function expandRruleInstances(event: ParsedIcsEvent, rangeStart: Date, rangeEnd: Date): ParsedIcsEvent[] {
  const instances: ParsedIcsEvent[] = [];
  const rule = Object.fromEntries(
    (event.rrule || '').split(';').map(part => {
      const at = part.indexOf('=');
      return [part.slice(0, at).toUpperCase(), part.slice(at + 1).toUpperCase()];
    }),
  );
  const freq = rule.FREQ;
  const interval = Math.max(1, Number.parseInt(rule.INTERVAL || '1', 10) || 1);
  const count = Math.max(0, Number.parseInt(rule.COUNT || '0', 10) || 0);
  const until = rule.UNTIL ? parseIcsDate(rule.UNTIL).date : null;
  const byDays = (rule.BYDAY || '').split(',').filter(Boolean);
  // An absent BYMONTHDAY is represented by an empty string. Number('') is 0,
  // so converting before filtering made a plain FREQ=MONTHLY rule look like
  // BYMONTHDAY=0 - a day that can never match. Keep only actual tokens
  // first; the normal monthly default below can then use DTSTART's day.
  const byMonthDays = (rule.BYMONTHDAY || '')
    .split(',')
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite);

  const origStart = event.start;
  const durationMs = event.end.getTime() - event.start.getTime();

  if (origStart > rangeEnd) return instances;

  const weekday = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const startDay = new Date(origStart.getFullYear(), origStart.getMonth(), origStart.getDate());
  const cur = new Date(origStart);
  let generated = 0;
  let examined = 0;
  while (cur <= rangeEnd && examined < 20000) {
    examined++;
    const dayOnly = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate());
    const daysSince = Math.floor((dayOnly.getTime() - startDay.getTime()) / 86400000);
    const monthsSince =
      (cur.getFullYear() - origStart.getFullYear()) * 12 + cur.getMonth() - origStart.getMonth();
    const yearsSince = cur.getFullYear() - origStart.getFullYear();
    const simpleByDays = byDays.map(v => v.replace(/^[+-]?\d+/, ''));
    let matches = false;

    if (freq === 'DAILY') {
      matches = daysSince >= 0 && daysSince % interval === 0 &&
        (simpleByDays.length === 0 || simpleByDays.includes(weekday[cur.getDay()]));
    } else if (freq === 'WEEKLY') {
      const week = Math.floor(daysSince / 7);
      const wanted = simpleByDays.length > 0 ? simpleByDays : [weekday[origStart.getDay()]];
      matches = daysSince >= 0 && week % interval === 0 && wanted.includes(weekday[cur.getDay()]);
    } else if (freq === 'MONTHLY') {
      const wantedDays = byMonthDays.length > 0 ? byMonthDays : [origStart.getDate()];
      const last = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
      const numericMatch = wantedDays.some(d => cur.getDate() === (d < 0 ? last + d + 1 : d));
      const ordinalMatch = byDays.some(token => {
        const m = token.match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/);
        if (!m || weekday[cur.getDay()] !== m[2]) return false;
        if (!m[1]) return true;
        const ordinal = Number(m[1]);
        const occurrence = ordinal > 0
          ? Math.floor((cur.getDate() - 1) / 7) + 1
          : -(Math.floor((last - cur.getDate()) / 7) + 1);
        return occurrence === ordinal;
      });
      matches = monthsSince >= 0 && monthsSince % interval === 0 &&
        (byDays.length === 0 || ordinalMatch) &&
        (byMonthDays.length > 0 ? numericMatch : byDays.length > 0 || numericMatch);
    } else if (freq === 'YEARLY') {
      matches = yearsSince >= 0 && yearsSince % interval === 0 &&
        cur.getMonth() === origStart.getMonth() && cur.getDate() === origStart.getDate();
    }

    if (matches) {
      generated++;
      if ((count > 0 && generated > count) || (until && cur > until)) break;
    }

    if (matches && cur >= rangeStart && cur <= rangeEnd) {
      const dateStr = localDateKey(cur);
      if (!event.exceptionDates || !dateKeys(cur).some(key => event.exceptionDates?.includes(key))) {
        const instStart = new Date(cur);
        const instEnd = new Date(cur.getTime() + durationMs);

        instances.push({
          ...event,
          uid: `${event.uid}_${dateStr}`,
          start: instStart,
          end: instEnd,
          recurringSeriesId: event.uid,
        });
      }
    }

    if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) break;
    cur.setDate(cur.getDate() + 1);
  }

  return instances;
}

function toLocalDateStr(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function toLocalTimeStr(date: Date, allDay: boolean): string {
  if (allDay) return '';
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Maps expanded ParsedIcsEvents down to the small GoogleCalendarEvent shape
 * the UI/copy layer actually consumes. A multi-day all-day event is
 * deliberately represented on its start date only (docs/dev/technical-design-
 * google-calendar.md's stated assumption) - no per-day expansion here, that
 * would be a different, unrequested feature.
 */
export function toGoogleCalendarEvents(events: ParsedIcsEvent[]): GoogleCalendarEvent[] {
  return events.map(event => ({
    uid: event.uid,
    title: event.summary,
    date: toLocalDateStr(event.start),
    time: toLocalTimeStr(event.start, event.allDay),
    allDay: event.allDay,
    ...eventLength(event),
  }));
}

/**
 * The event's length in the local Meeting model (docs/dev/technical-design-
 * monthly-view.md step 10): an all-day event becomes a day count (DTEND is
 * exclusive, so Mon..Wed = DTEND Thu = 3 days); a timed event ending later
 * on its start day gets that end time. A timed event crossing midnight has
 * no representable end in the Meeting model and gets none.
 */
function eventLength(event: ParsedIcsEvent): {endTime: string; days: number} {
  const endMs = event.end?.getTime();
  if (!endMs || Number.isNaN(endMs) || endMs <= event.start.getTime()) return {endTime: '', days: 1};
  if (event.allDay) {
    const startDay = new Date(event.start.getFullYear(), event.start.getMonth(), event.start.getDate());
    const endDay = new Date(event.end.getFullYear(), event.end.getMonth(), event.end.getDate());
    const days = Math.round((endDay.getTime() - startDay.getTime()) / 86400000);
    return {endTime: '', days: Math.min(60, Math.max(1, days))};
  }
  if (toLocalDateStr(event.end) !== toLocalDateStr(event.start)) return {endTime: '', days: 1};
  return {endTime: toLocalTimeStr(event.end, false), days: 1};
}
