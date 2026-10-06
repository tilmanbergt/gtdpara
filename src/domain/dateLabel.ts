/**
 * Short "where did it go" wording for a just-added meeting's date
 * (docs/dev/technical-design-cache-subscription-and-shared-add-path.md §C,
 * 2026-09-20). ui/QuickAddWidget.tsx appends it to its centre note - e.g.
 * `✓ Added "Team sync" - next week` - when the meeting's date is NOT part of
 * the list the screen currently shows (Week view: outside the displayed
 * week; Daily: not the shown Today/Tomorrow tab), so an Add that
 * legitimately lands off-screen is never mistaken for one that got lost.
 *
 * Always relative to the REAL today (`now`), never to whichever week/day the
 * screen happens to display. First match wins:
 *
 *   same day as today        -> "today"
 *   today + 1 / today - 1    -> "tomorrow" / "yesterday"
 *   inside next ISO week     -> "next week"      (Mon..Sun after today's week)
 *   inside previous ISO week -> "last week"
 *   otherwise                -> "28.9." / "28.9.2027" (domain/dateFormat.ts)
 *
 * Input that is not a real YYYY-MM-DD date is returned unchanged (the
 * widget validates dates before it ever calls this; defensive only).
 *
 * Pure, zero RN/SDK imports (domain/ convention, see markdown.ts) - every
 * wall-clock read goes through the injectable `now`.
 */
import {addDaysToIso, isValidIsoDate} from './dateNudge';
import {todayIso} from './meetingTime';
import {weekRangeIso} from './weekDate';
import {formatDate} from './dateFormat';

export function describeAddedDate(date: string, now: Date = new Date()): string {
  if (!isValidIsoDate(date)) return date;

  const today = todayIso(now);
  if (date === today) return 'today';
  if (date === addDaysToIso(today, 1)) return 'tomorrow';
  if (date === addDaysToIso(today, -1)) return 'yesterday';

  const {start, end} = weekRangeIso(now);
  if (date >= addDaysToIso(end, 1) && date <= addDaysToIso(end, 7)) return 'next week';
  if (date >= addDaysToIso(start, -7) && date <= addDaysToIso(start, -1)) return 'last week';

  return formatDate(date, today);
}
