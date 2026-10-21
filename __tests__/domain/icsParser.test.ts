// docs/dev/history/technical-design-quality-hardening.md §5.2 F6: the Google Calendar link's ICS
// text comes from outside - odd input never throws, and the usual shapes parse right.
import {parseIcsContent, unfoldIcsContent} from '../../src/domain/icsParser';

const cal = (...event: string[]) => ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', ...event, 'END:VEVENT', 'END:VCALENDAR', ''].join('\r\n');

it('never throws on garbage, broken dates or an unclosed event', () => {
  for (const text of ['', 'not a calendar\n\u0000', 'BEGIN:VCALENDAR\nBEGIN:VEVENT\nDTSTART:2026102\nSUMMARY:Broken\n']) {
    expect(() => parseIcsContent(text)).not.toThrow();
    expect(parseIcsContent(text)).toEqual([]);
  }
});

it('joins folded lines', () => {
  expect(unfoldIcsContent('SUMMARY:A long title that is fol\r\n ded across lines\r\nX:y')).toEqual(['SUMMARY:A long title that is folded across lines', 'X:y']);
  const [event] = parseIcsContent(cal('DTSTART:20261020T090000Z', 'DTEND:20261020T100000Z', 'SUMMARY:A long title that is fol', ' ded'));
  expect(event.summary).toBe('A long title that is folded');
});

it('converts a named time zone to UTC', () => {
  const [event] = parseIcsContent(cal('DTSTART;TZID=Europe/Berlin:20261020T090000', 'DTEND;TZID=Europe/Berlin:20261020T100000', 'SUMMARY:Berlin'));
  expect(event.start.toISOString()).toBe('2026-10-20T07:00:00.000Z');
  expect(event.end?.toISOString()).toBe('2026-10-20T08:00:00.000Z');
  expect(event.allDay).toBe(false);
});

it('reads all-day events and keeps the recurrence rule', () => {
  const [allDay] = parseIcsContent(cal('DTSTART;VALUE=DATE:20261020', 'DTEND;VALUE=DATE:20261022', 'SUMMARY:Two days'));
  expect(allDay).toMatchObject({allDay: true, summary: 'Two days'});
  const [weekly] = parseIcsContent(cal('DTSTART:20261020T090000Z', 'RRULE:FREQ=WEEKLY', 'SUMMARY:Weekly'));
  expect(weekly.rrule).toBe('FREQ=WEEKLY');
});

it('reads an event with an unknown time zone instead of dropping it', () => {
  const events = parseIcsContent(cal('DTSTART;TZID=Mars/Olympus:20261020T090000', 'SUMMARY:Mars'));
  expect(events.map(e => e.summary)).toEqual(['Mars']);
});
