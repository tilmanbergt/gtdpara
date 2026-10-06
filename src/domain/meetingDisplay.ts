/**
 * How a meeting is labelled in every list (docs/dev/technical-design-meeting-
 * lists.md §2.1) - one place for the time column and the Week chip label,
 * instead of the five local variants the lists used to carry (MeetingRow's
 * date prefix, MonthDayPanel's "all day 2/3", GoogleCalendarPanel's "All
 * day", Review's ISO dates, the Week-ahead text list). Pure, zero RN/SDK
 * imports (domain/ convention).
 */
import {formatTime} from './dateFormat';
import {meetingDatePrefix} from './meetingTime';
import {MeetingSpanDay, withSpanArrows} from './meetingSpan';
import {meetingDisplayTitle} from './meetingTracking';
import {shortFormOf} from './monthHighlight';
import {Meeting} from './types';

/**
 * `time`: single-day lists (Daily, day panels) - the day is known, only the
 * time is shown. `dateTime`: lists spanning several days (Project, Inbox,
 * Review) - the date is shown too ("29.9. 10:00"; today shows the time only,
 * as meetingDatePrefix always has).
 */
export type MeetingTimeMode = 'time' | 'dateTime';

/** The time column's text: `oneLine` for 1-line rows, `line1`/`line2` for 2-line rows. */
export interface MeetingTimeCell {
  oneLine: string;
  line1: string;
  line2: string;
}

export const ALL_DAY_LABEL = 'all day';
const TODAY_LABEL = 'today';

type TimeFields = Pick<Meeting, 'date' | 'time' | 'endTime'>;

export function meetingTimeCell(
  meeting: TimeFields,
  span: MeetingSpanDay | undefined,
  mode: MeetingTimeMode,
  now: Date = new Date(),
): MeetingTimeCell {
  const multiDay = span != null && span.dayCount > 1 ? `day ${span.dayNumber}/${span.dayCount}` : '';
  const time = formatTime(meeting.time);
  const end = meeting.time && meeting.endTime ? formatTime(meeting.endTime) : '';

  if (mode === 'time') {
    if (meeting.time) return {oneLine: time, line1: time, line2: end ? `–${end}` : ''};
    return {oneLine: ALL_DAY_LABEL, line1: ALL_DAY_LABEL, line2: multiDay};
  }

  const prefix = meetingDatePrefix(span?.date ?? meeting.date, now);
  if (meeting.time) {
    return {
      oneLine: prefix ? `${prefix} ${time}` : time,
      line1: prefix || TODAY_LABEL,
      line2: end ? `${time}–${end}` : time,
    };
  }
  return {
    oneLine: prefix || TODAY_LABEL,
    line1: prefix || TODAY_LABEL,
    line2: multiDay || ALL_DAY_LABEL,
  };
}

/**
 * The Week chip's label: the title's short form (any trailing bracket,
 * domain/monthHighlight.ts) if it has one, else the displayed title - which
 * keeps tags, since some meetings are titled by a tag alone ("#Daily") -
 * with the multi-day arrows ("Offsite ▸").
 */
export function meetingChipLabel(meeting: Pick<Meeting, 'title'>, span?: MeetingSpanDay): string {
  const label = shortFormOf(meeting.title) ?? meetingDisplayTitle(meeting).trim();
  return withSpanArrows(label, span?.part);
}
