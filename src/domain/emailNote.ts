/**
 * Pure helpers for "Link email as note" (docs/dev/technical-design-gmail-email-note.md
 * 3.5): the note's file name and its text. No RN/SDK imports.
 */

/** Emails longer than this many pages are cut, ending with "mail capped". */
import {sanitizeFileNameComponent} from './fileName';

export const EMAIL_NOTE_MAX_PAGES = 10;
export const EMAIL_NOTE_TRUNCATION_NOTICE = '[mail capped]';
/** Subject part of the file name is cut to this many characters. */
export const EMAIL_NOTE_SUBJECT_MAX_CHARS = 80;


function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

/** "2026-01-31" in local time. */
function isoDay(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/** "2026-01-31 14:05" in local time. */
function isoDayTime(date: Date): string {
  return `${isoDay(date)} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Parses the message's ISO timestamp; null for '' / unparseable (GmailMessageSummary.date is '' when unparseable). */
function parseMessageDate(dateIso: string): Date | null {
  if (!dateIso) return null;
  const parsed = new Date(dateIso);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** File-name-safe (domain/fileName.ts's rule), single-line, at most `maxChars` characters (counted in code points so an emoji is never cut in half). */
function sanitizeSubject(subject: string, maxChars: number): string {
  const cleaned = sanitizeFileNameComponent(subject, '');
  const chars = Array.from(cleaned);
  const cut = (chars.length > maxChars ? chars.slice(0, maxChars).join('') : cleaned)
    // A file name must not end in a dot or space.
    .replace(/[.\s]+$/, '');
  return cut.length > 0 ? cut : 'No subject';
}

/**
 * "2026-01-31 Subject" - the note's file name without extension. The date is
 * the email's own date in local time; `today` is the fallback when the
 * message has none/an unparseable one.
 */
export function emailNoteBaseName(dateIso: string, subject: string, today: Date): string {
  const date = parseMessageDate(dateIso) ?? today;
  return `${isoDay(date)} ${sanitizeSubject(subject, EMAIL_NOTE_SUBJECT_MAX_CHARS)}`;
}

/**
 * The note's full text: a Subject/From/Date header (single newlines, so it
 * stays together as the first paragraph), a blank line, then the body.
 */
export function buildEmailNoteText(
  message: {subject: string; from: string; date: string},
  body: string,
  today: Date,
): string {
  const date = parseMessageDate(message.date);
  const dateLine = date ? isoDayTime(date) : isoDay(today);
  const subject = message.subject.replace(/\s+/g, ' ').trim() || '(no subject)';
  const from = message.from.replace(/\s+/g, ' ').trim();
  return `Subject: ${subject}\nFrom: ${from}\nDate: ${dateLine}\n\n${body}`;
}
