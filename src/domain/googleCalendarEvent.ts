/**
 * The trimmed event shape the Google Calendar feature needs for display and
 * copy (docs/dev/history/technical-design-google-calendar.md §2) - deliberately much
 * smaller than a full ICS VEVENT (no attendees/description/location/etc.),
 * since this feature only ever shows a title+date+time and, on request,
 * copies that into a one-off local Meeting (domain/types.ts). Pure data, no
 * RN/SDK imports (domain/ convention, see markdown.ts).
 */
export interface GoogleCalendarEvent {
  /**
   * The source VEVENT's own UID, or `${uid}_${date}` for one expanded
   * instance of a recurring event (icsParser.ts's expandEventsForRange).
   * Used only as a stable list/React key - dedup against already-copied
   * local meetings is title+date+time (technical design §6), never this.
   */
  uid: string;
  title: string;
  /** YYYY-MM-DD, local - same convention as Meeting.date. */
  date: string;
  /** HH:mm 24h, or '' for an all-day event - same convention as Meeting.time. */
  time: string;
  allDay: boolean;
  /**
   * HH:mm end of a timed event on its start day, '' when unknown or when it
   * runs past midnight (docs/dev/history/technical-design-monthly-view.md step 10).
   * Optional: events restored from the persisted cache written before this
   * field existed simply don't have it (treated as '').
   */
  endTime?: string;
  /** Whole days of an all-day event (DTEND is exclusive), >= 1; undefined = 1. */
  days?: number;
}
