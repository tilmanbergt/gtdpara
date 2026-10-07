/**
 * Removes secrets and personal addresses from text that leaves the device in
 * a debug bundle (docs/dev/history/technical-design-about-debug-experimental.md §3.4).
 * Pure; unit-tested in __tests__/domain/redact.test.ts.
 *
 * File paths stay as they are on purpose (needed for debugging); the export
 * screen asks the user to look before sharing.
 */

export interface RedactionSecrets {
  gmailEmail?: string;
  gmailAppPassword?: string;
  googleCalendarIcsUrl?: string;
}

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
// Any URL that looks like a calendar feed (Google's private address contains
// "/ical/", other providers end in ".ics").
const ICS_URL = /(?:https?|webcal):\/\/[^\s"'<>]*(?:\/ical\/|\.ics)[^\s"'<>]*/gi;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceLiteral(text: string, literal: string | undefined, replacement: string): string {
  const value = (literal ?? '').trim();
  if (value.length < 4) {return text;} // too short to be a meaningful secret, and too risky to replace
  return text.replace(new RegExp(escapeRegExp(value), 'g'), replacement);
}

export function redactText(text: string, secrets: RedactionSecrets = {}): string {
  let out = text;
  // Literal secrets first, so their exact values never survive in any form.
  out = replaceLiteral(out, secrets.googleCalendarIcsUrl, '[ics-url]');
  const password = (secrets.gmailAppPassword ?? '').trim();
  out = replaceLiteral(out, password, '[gmail-password]');
  // Google shows app passwords as "abcd efgh ijkl mnop"; people paste either form.
  if (password.includes(' ')) {out = replaceLiteral(out, password.replace(/\s+/g, ''), '[gmail-password]');}
  out = replaceLiteral(out, secrets.gmailEmail, '[email]');
  out = out.replace(ICS_URL, '[ics-url]');
  out = out.replace(EMAIL, '[email]');
  return out;
}
