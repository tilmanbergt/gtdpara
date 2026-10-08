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
 * keys. Resolution (decision D11): an exact key match among the meetings of
 * the todo's own scope, then among all meetings; failing that (the meeting
 * was renamed) a meeting on the key's date that shares a thread tag with the
 * todo; else unresolved, shown as "from <key>". Renaming a meeting never
 * rewrites other lines.
 *
 * Writing it adds the meeting's thread tags the todo does not carry yet;
 * Quick Add shows both in one grey line before saving
 * (`provenanceLabel`), and ✕ there drops both for that one todo.
 */
import {formatDayHeader} from './dateFormat';
import {splitTextWithTags, stripAllTags} from './markdown';
import {meetingDisplayTitle} from './meetingTracking';
import {meetingPageKeyword, parseKeywordLeadingDate} from './sharedNotePages';
import {appendTaskFields} from './taskLine';
import {parseTaskInput} from './taskEdit';
import {belongsToThread, threadOf, threadsOfTags} from './threads';
import {Meeting, Task} from './types';

/** `text` as a provenance key: without `#`, `[` and `]`, whitespace collapsed. */
export function normalizeMeetingKey(text: string): string {
  return text.replace(/[#[\]]/g, '').replace(/\s+/g, ' ').trim();
}

/** The provenance key of `meeting`. */
export function meetingKey(meeting: Pick<Meeting, 'date' | 'title'>): string {
  return normalizeMeetingKey(meetingPageKeyword(meeting));
}

/** The thread tags (`type/counterpart`) of a meeting - what provenance adds to a todo. */
export function provenanceTags(meeting: Pick<Meeting, 'tags'>): string[] {
  return threadsOfTags(meeting.tags).map(t => t.tag);
}

/** What a screen writes into a new todo: the key and the tags to add. */
export interface Provenance {
  key: string;
  tags: string[];
}

export function provenanceOf(meeting: Pick<Meeting, 'date' | 'title' | 'tags'>): Provenance {
  return {key: meetingKey(meeting), tags: provenanceTags(meeting)};
}

/**
 * A composed Quick Add line (text plus trailing fields) with provenance
 * applied: the tags the text does not carry yet (itself or nested below) are
 * appended to the text, and `[meeting:: key]` is set.
 */
export function applyProvenance(composedLine: string, provenance: Provenance): string {
  const {text, fields} = parseTaskInput(composedLine);
  const present = splitTextWithTags(text)
    .filter(s => s.kind === 'tag')
    .map(s => s.value);
  const missing = provenance.tags.filter(tag => {
    const thread = threadOf(tag);
    return thread ? !belongsToThread(present, thread) : !present.includes(tag);
  });
  const nextText = [text, ...missing.map(tag => `#${tag}`)].filter(Boolean).join(' ');
  return appendTaskFields(nextText, {...fields, meeting: provenance.key});
}

/** The meeting's title without tags, for the provenance line ("Retro alpha"). */
function plainTitle(meeting: Pick<Meeting, 'title'>): string {
  const display = meetingDisplayTitle(meeting);
  return stripAllTags(display) || display;
}

/** Quick Add's grey line: `↳ from Retro alpha · Tue 30.9. · adds #retro/alpha`. */
export function provenanceLabel(meeting: Pick<Meeting, 'date' | 'title' | 'tags'>, today: string): string {
  const tags = provenanceTags(meeting);
  const parts = [`↳ from ${plainTitle(meeting)}`, formatDayHeader(meeting.date, today)];
  if (tags.length > 0) parts.push(`adds ${tags.map(t => `#${t}`).join(' ')}`);
  return parts.join(' · ');
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
  /** False when found by the date + thread tag fallback. */
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
  task: Pick<Task, 'fields' | 'tags'>,
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
  const taskThreads = threadsOfTags(task.tags).map(t => t.tag);
  if (!date || taskThreads.length === 0) return null;
  const fallbackTest = (m: Meeting) =>
    !m.cancelled && m.date === date && provenanceTags(m).some(tag => taskThreads.includes(tag));
  return findIn(inScope, fallbackTest, false) ?? findIn(sources, fallbackTest, false);
}
