/**
 * Copies one Google Calendar event into a Project/Area/Inbox as a normal
 * one-off local Meeting (docs/dev/technical-design-google-calendar.md §7) - the
 * exact same write-through path every other Meeting mutation in this app
 * uses (saveMeetings then updateItemMeetings, file first - design-
 * overview.md §3), no new write mechanism. From this point on the copy is
 * indistinguishable from a hand-added meeting: nothing links it back to the
 * source event (decided one-way copy/snapshot, title+date+time dedup -
 * later edits on either side never propagate).
 */
import {Destination} from '../domain/destination';
import {deriveMeetingFields} from '../domain/markdown';
import {setHighlight} from '../domain/monthHighlight';
import {Meeting} from '../domain/types';
import {GoogleCalendarEvent} from '../domain/googleCalendarEvent';
import {ensureItemCached, updateItemMeetings} from './dataCache';
import {loadProjectFile, saveMeetings} from './projectFile';

/** Exported so ui/GoogleCalendarPanel.tsx's optimistic Inbox update builds the exact same Meeting (it used to carry its own literal copy). */
export function buildMeetingFromEvent(event: GoogleCalendarEvent, opts?: {highlight?: boolean}): Meeting {
  // Copied from the Month view -> a Month highlight right away (Tilman,
  // 2026-09-23: "if I add on the monthly view from the google calendar: the
  // item should automatically be Monthly highlight").
  const title = opts?.highlight ? setHighlight(event.title, true) : event.title;
  return {
    title,
    date: event.date,
    time: event.time,
    // Length taken over from Google (docs/dev/technical-design-monthly-view.md step 10).
    endTime: event.time ? event.endTime ?? '' : '',
    days: event.time ? 1 : Math.max(1, event.days ?? 1),
    ...deriveMeetingFields(title),
    cancelled: false,
    // No recurrence is ever created from a copy, even for an occurrence of
    // a recurring Google event - decided: copy just takes that occurrence's
    // own start date/time as a plain one-off (this app's Meeting UI only
    // ever creates one-offs anyway, §2's outstanding-scope "Recurrence UI").
    recurrence: null,
    notePath: '',
    linkedFile: '',
    occurrences: [],
  };
}

export async function copyGoogleEventToDestination(
  event: GoogleCalendarEvent,
  destination: Destination,
  inboxPath: string,
  opts?: {highlight?: boolean},
): Promise<void> {
  const meeting = buildMeetingFromEvent(event, opts);

  if (destination.type === 'inbox') {
    const inbox = await loadProjectFile('inbox', inboxPath);
    const nextMeetings = [...inbox.meetings, meeting];
    // Inbox.txt is never part of storage/dataCache.ts's cache (§2.9 of
    // design-overview.md), so there's no matching cache write-through here
    // - same as every other Inbox save in this app (screens/InboxScreen.tsx,
    // storage/inboxFiling.ts).
    await saveMeetings('inbox', inboxPath, inbox.rawContent, nextMeetings, inbox.meetingExtraLines);
    return;
  }

  const item = await ensureItemCached(destination.kind, destination.name, destination.path);
  const nextMeetings = [...item.meetings, meeting];
  const nextContent = await saveMeetings(
    item.kind,
    item.path,
    item.rawContent,
    nextMeetings,
    item.meetingExtraLines,
  );
  updateItemMeetings(item.path, nextContent, nextMeetings, item.meetingExtraLines);
}
