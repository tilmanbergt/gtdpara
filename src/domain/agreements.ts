/**
 * Agreements (docs/dev/history/technical-design-meetings-0.21.md R17, §2.1):
 * plain bullets in an Area's or Project's `## Agreements` section. Pure.
 *
 *   - <text> #tags [meeting:: <date> <title>] [created:: <date>] [valid:: <date>] [ended:: <date>]
 *
 * No checkbox, so Obsidian's Tasks plugin never lists one. Scope comes from
 * the tags, like todos. Active = no `ended`; over = active with a `valid`
 * date before today. Nothing is ever deleted: ending and changing write
 * `[ended::]`.
 *
 * The trailing fields are split with domain/taskLine.ts's splitter; fields
 * other than the four above (a task's `due` or `completion` included) are
 * kept verbatim after them. A line nobody changed is written back exactly as
 * read (`raw`). The section keeps its layout on write: blank lines and lines
 * that are not agreements stay where they are, each agreement line is
 * replaced in place, and new agreements go after the last one - so an
 * untouched line stays byte-identical even when its neighbour changes.
 */
import {deriveMeetingFields, readSectionLines, writeSectionLines} from './markdown';
import {todayIso} from './meetingTime';
import {daysInMonth} from './period';
import {splitTrailingFields} from './taskLine';

export const AGREEMENTS_HEADING = '## Agreements';

export interface AgreementFields {
  /** `<date> <title>` of the meeting it was made in, as found (domain/provenance.ts's key). */
  meeting: string | null;
  /** YYYY-MM-DD. */
  created: string | null;
  /** YYYY-MM-DD it is valid till; null = open-ended. */
  valid: string | null;
  /** YYYY-MM-DD it was ended; null = active. */
  ended: string | null;
  /** Unknown `[k:: v]` tokens, verbatim, in file order. */
  extra: string[];
}

export interface Agreement {
  /** The text without the trailing fields; tags stay inline. */
  text: string;
  /** The text's tags, lowercased. */
  tags: string[];
  fields: AgreementFields;
  /** The line as read; null for one built here. Written back unchanged while text and fields still match it. */
  raw: string | null;
}

/** Written in this order, before any unknown field. */
const AGREEMENT_FIELD_ORDER = ['meeting', 'created', 'valid', 'ended'] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// A top-level bullet that is not a checkbox (`- [ ]`, `- [x]`, `- [-]` are todos).
const AGREEMENT_LINE = /^-\s+(?!\[[ xX-]\](?:\s|$))(\S.*)$/;
const FIELD_TOKEN = /^\[([a-z][\w-]*)::[ \t]*([^\]]*)\]$/;

function tagsOf(text: string): string[] {
  return deriveMeetingFields(text).tags;
}

/** One agreement line, or null when `line` is not one. */
export function parseAgreementLine(line: string): Agreement | null {
  const m = AGREEMENT_LINE.exec(line.trimEnd());
  if (!m) return null;
  const split = splitTrailingFields(m[1]);
  const fields: AgreementFields = {meeting: split.fields.meeting, created: split.fields.created, valid: null, ended: null, extra: []};
  // The splitter knows a task's keys; `due` and `completion` mean nothing here and stay as found.
  if (split.fields.due) fields.extra.push(`[due:: ${split.fields.due}]`);
  if (split.fields.completion) fields.extra.push(`[completion:: ${split.fields.completion}]`);
  for (const token of split.fields.extra) {
    const f = FIELD_TOKEN.exec(token);
    const value = f?.[2].trim() ?? '';
    if (f && f[1] === 'valid' && fields.valid === null && value) fields.valid = value;
    else if (f && f[1] === 'ended' && fields.ended === null && value) fields.ended = value;
    else fields.extra.push(token);
  }
  const text = split.text.trim();
  if (!text) return null;
  return {text, tags: tagsOf(text), fields, raw: line};
}

function sameFields(a: AgreementFields, b: AgreementFields): boolean {
  return (
    AGREEMENT_FIELD_ORDER.every(key => a[key] === b[key]) &&
    a.extra.length === b.extra.length &&
    a.extra.every((token, i) => token === b.extra[i])
  );
}

/** The line to write: the line as read while it still says the same, else `- text [meeting::] [created::] [valid::] [ended::] extra…`. */
export function serializeAgreementLine(a: Agreement): string {
  if (a.raw !== null) {
    const reread = parseAgreementLine(a.raw);
    if (reread && reread.text === a.text && sameFields(reread.fields, a.fields)) return a.raw;
  }
  const tokens: string[] = [];
  for (const key of AGREEMENT_FIELD_ORDER) {
    const value = a.fields[key];
    if (value) tokens.push(`[${key}:: ${value}]`);
  }
  tokens.push(...a.fields.extra);
  return `- ${[a.text, ...tokens].join(' ')}`;
}

/** The agreements of `content`'s section, in file order, and its other non-blank lines. */
export function parseAgreementsSpan(content: string): {agreements: Agreement[]; extraLines: string[]} {
  const agreements: Agreement[] = [];
  const extraLines: string[] = [];
  for (const line of readSectionLines(content, AGREEMENTS_HEADING).lines) {
    if (line.trim() === '') continue;
    const agreement = parseAgreementLine(line);
    if (agreement) agreements.push(agreement);
    else extraLines.push(line);
  }
  return {agreements, extraLines};
}

/**
 * Rewrites only the `## Agreements` section (appended when missing) - see
 * the module doc comment for how its layout is kept. The n-th agreement line
 * found becomes `agreements[n]`; agreements beyond the lines found are new
 * and go after the last agreement line. `extraLines` are kept where they
 * are; ones the section does not hold go to its end.
 */
export function writeAgreementsIntoContent(content: string, agreements: readonly Agreement[], extraLines: readonly string[] = []): string {
  const current = readSectionLines(content, AGREEMENTS_HEADING).lines;
  const pendingExtra = [...extraLines];
  const out: string[] = [];
  let next = 0;
  let insertAt = -1;
  for (const line of current) {
    if (line.trim() === '') {
      out.push(line);
      continue;
    }
    if (parseAgreementLine(line)) {
      if (next < agreements.length) {
        out.push(serializeAgreementLine(agreements[next++]));
        insertAt = out.length;
      }
      continue;
    }
    const kept = pendingExtra.indexOf(line);
    if (kept >= 0) {
      pendingExtra.splice(kept, 1);
      out.push(line);
    }
  }
  if (insertAt < 0) {
    // No agreement line yet: after the section's last non-blank line, so trailing blank lines stay last.
    insertAt = out.length;
    while (insertAt > 0 && out[insertAt - 1].trim() === '') insertAt--;
  }
  const added = agreements.slice(next).map(serializeAgreementLine);
  out.splice(insertAt, 0, ...added);
  let end = out.length;
  while (end > 0 && out[end - 1].trim() === '') end--;
  out.splice(end, 0, ...pendingExtra);
  // The span's last line is the blank line the section ends with; writeSectionLines adds it back.
  if (out.length > 0 && out[out.length - 1].trim() === '') out.pop();
  return writeSectionLines(content, AGREEMENTS_HEADING, out);
}

/** A new agreement made `today`. */
export function buildAgreement(text: string, opts: {today: string; valid: string | null; meeting: string | null}): Agreement {
  const trimmed = text.trim();
  return {
    text: trimmed,
    tags: tagsOf(trimmed),
    fields: {meeting: opts.meeting, created: opts.today, valid: opts.valid, ended: null, extra: []},
    raw: null,
  };
}

export function isActiveAgreement(a: Agreement): boolean {
  return !a.fields.ended;
}

/** Active and valid till a day before `today`. A `valid` that is not a date never makes it over. */
export function isOverAgreement(a: Agreement, today: string): boolean {
  const valid = a.fields.valid;
  return isActiveAgreement(a) && valid !== null && ISO_DATE.test(valid) && valid < today;
}

/** The same agreement with new wording and valid-till; created, meeting and unknown fields stay. */
export function withAgreementEdit(a: Agreement, text: string, valid: string | null): Agreement {
  const trimmed = text.trim();
  return {...a, text: trimmed, tags: tagsOf(trimmed), fields: {...a.fields, valid}};
}

export function endedAgreement(a: Agreement, today: string): Agreement {
  return {...a, fields: {...a.fields, ended: today}};
}

/** Kept in a review: a new valid-till, or none. */
export function keptAgreement(a: Agreement, valid: string | null): Agreement {
  return {...a, fields: {...a.fields, valid}};
}

export type ValidPreset = 'none' | '1m' | '3m' | 'eoy';

function addMonthsClamped(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const first = new Date(y, m - 1 + months, 1);
  return todayIso(new Date(first.getFullYear(), first.getMonth(), Math.min(d, daysInMonth(first))));
}

/** The valid-till date a preset gives from `today`: +1 m and +3 m clamp to the month's end (31.1. + 1 m = 28./29.2.). */
export function validTillOf(preset: ValidPreset, today: string): string | null {
  switch (preset) {
    case 'none':
      return null;
    case '1m':
      return addMonthsClamped(today, 1);
    case '3m':
      return addMonthsClamped(today, 3);
    case 'eoy':
      return `${today.slice(0, 4)}-12-31`;
  }
}
