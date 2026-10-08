/**
 * Provenance: the meeting a todo was agreed in
 * (docs/dev/history/technical-design-tending-threads.md §3.4). Pure.
 *
 * Written as the trailing field `[meeting:: <key>]`; the key is the meeting's
 * shared-page keyword `<date> <display title>` (domain/sharedNotePages.ts's
 * `meetingPageKeyword`) with `#`, `[` and `]` left out: the brackets would end
 * the field, and Obsidian reads a `#tag` inside a field as a tag of the todo.
 * The tag text stays (`2026-10-08 1:1 Mieke mh 101/mieke`), so two meetings
 * with the same title on one day but different thread tags keep different
 * keys. Resolution (decisions D11, D14): an exact key match among the
 * meetings of the todo's own scope, then among all meetings; failing that
 * (the meeting was renamed) a meeting on the key's date whose thread tags
 * appear as words in the key; else unresolved, shown as "from <key>".
 * Renaming a meeting never rewrites other lines.
 *
 * Provenance records where a todo was agreed and nothing else: writing it
 * sets only the field, never a tag (decision D12; tags are only ever set by
 * the user). Quick Add shows it in one grey line before saving
 * (`provenanceLabel`), and ✕ there drops it for that one todo.
 */
import {formatDayHeader} from './dateFormat';
import {stripAllTags} from './markdown';
import {meetingDisplayTitle} from './meetingTracking';
import {meetingPageKeyword, parseKeywordLeadingDate} from './sharedNotePages';
import {appendTaskFields} from './taskLine';
import {parseTaskInput} from './taskEdit';
import {threadOf, threadsOfTags} from './threads';
import {Meeting, Task} from './types';

/** `text` as a provenance key: without `#`, `[` and `]`, whitespace collapsed. */
export function normalizeMeetingKey(text: string): string {
  return text.replace(/[#[\]]/g, '').replace(/\s+/g, ' ').trim();
}

/** The provenance key of `meeting`. */
export function meetingKey(meeting: Pick<Meeting, 'date' | 'title'>): string {
  return normalizeMeetingKey(meetingPageKeyword(meeting));
}

/**
 * A composed Quick Add line (text plus trailing fields) with provenance
 * applied: `[meeting:: key]` is set; the text stays as typed.
 */
export function applyProvenance(composedLine: string, key: string): string {
  const {text, fields} = parseTaskInput(composedLine);
  return appendTaskFields(text, {...fields, meeting: key});
}

/** The meeting's title without tags, for the provenance line ("Retro alpha"). */
function plainTitle(meeting: Pick<Meeting, 'title'>): string {
  const display = meetingDisplayTitle(meeting);
  return stripAllTags(display) || display;
}

/** Quick Add's grey line: `↳ from Retro alpha · Tue 30.9.`. */
export function provenanceLabel(meeting: Pick<Meeting, 'date' | 'title'>, today: string): string {
  return `↳ from ${plainTitle(meeting)} · ${formatDayHeader(meeting.date, today)}`;
}

/** The meetings of one Project/Area or the Inbox. */
export interface ProvenanceSource {
  path: string;
  meetings: readonly Meeting[];
}

export interface ProvenanceMatch {
  path: string;
  /** Index into that source's full meetings array. */
  meetingIndex: number;
  meeting: Meeting;
  /** False when found by the date + thread tag fallback (D14). */
  exact: boolean;
}

function findIn(
  sources: readonly ProvenanceSource[],
  test: (meeting: Meeting) => boolean,
  exact: boolean,
): ProvenanceMatch | null {
  for (const source of sources) {
    const index = source.meetings.findIndex(test);
    if (index >= 0) return {path: source.path, meetingIndex: index, meeting: source.meetings[index], exact};
  }
  return null;
}

/**
 * The meeting `task` was agreed in, or null - see the module doc comment.
 * `scopePaths` is the scope of the todo's own item (domain/threads.ts's
 * `scopeOf`), searched first.
 */
export function resolveProvenance(
  task: Pick<Task, 'fields'>,
  sources: readonly ProvenanceSource[],
  scopePaths: readonly string[],
): ProvenanceMatch | null {
  // Normalized, so a hand-written key with `#` still matches.
  const key = task.fields.meeting ? normalizeMeetingKey(task.fields.meeting) : '';
  if (!key) return null;
  const inScope = sources.filter(s => scopePaths.includes(s.path));
  const exactTest = (m: Meeting) => meetingKey(m) === key;
  const exact = findIn(inScope, exactTest, true) ?? findIn(sources, exactTest, true);
  if (exact) return exact;
  const date = parseKeywordLeadingDate(key);
  // The key's words as thread tags: `retro/alpha/2026` counts as `retro/alpha`.
  const keyThreads = key
    .toLowerCase()
    .split(' ')
    .map(word => threadOf(word)?.tag)
    .filter((tag): tag is string => !!tag);
  if (!date || keyThreads.length === 0) return null;
  const fallbackTest = (m: Meeting) =>
    !m.cancelled && m.date === date && threadsOfTags(m.tags).some(thread => keyThreads.includes(thread.tag));
  return findIn(inScope, fallbackTest, false) ?? findIn(sources, fallbackTest, false);
}
