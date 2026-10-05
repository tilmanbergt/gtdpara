/**
 * Parse/serialize project.txt's/area.txt's frontmatter block and Tasks &
 * Meetings sections.
 *
 * Pure, zero RN/SDK imports (design-overview.md §3's domain/ convention) -
 * everything here is plain string manipulation, unit-testable without a
 * device. The one rule every function here is built around
 * (design-overview.md §6, "Write-through must not clobber hand-added
 * content"): touch only the span you actually mean to change (a "## Heading"
 * span, or the frontmatter block) - everything else passes through
 * unchanged.
 */
import {deriveFlowState, deriveNow, deriveWaitingOn, isContextTag} from './flowState';
import {MARKS_HEADING, parseMarkLines, serializeMarkLines} from './marks';
import {FlowState, GtdParaKind, ItemStatus, Mark, Meeting, MonthlyGoal, Task, WeeklyGoal} from './types';

const SCOPE_HEADING = '## Scope';
const TASKS_HEADING = '## Tasks';
const MEETINGS_HEADING = '## Meetings';
const WEEKLY_GOALS_HEADING = '## Weekly Goals';
const MONTHLY_GOALS_HEADING = '## Monthly Goals';

const TASK_LINE_RE = /^-\s*\[([ xX-])\]\s?(.*)$/;
// Time is optional (design-overview.md's linking spec plus the "leave the
// time open" v1 requirement) - a meeting line is otherwise date + title.
//
// The slot between date and title (docs/dev/technical-design-monthly-view.md
// §2.3) is one of: "HH:mm" (start), "HH:mm-HH:mm" (start-end) or "Nd"
// (date-only, N whole days). It is ALWAYS written ("1d" for a plain all-day
// meeting) but stays optional here, so lines written before that rule still
// load - read as 1 day.
const MEETING_LINE_RE =
  /^-\s*(?:\[(-)\]\s*)?(\d{4}-\d{2}-\d{2})(?:\s+(?:(\d{2}:\d{2})(?:-(\d{2}:\d{2}))?|([1-9]\d?)d))?\s+(.*)$/;
// "- 2026-W37: Ship the technical design doc" - weekKey then free-text goal.
const WEEKLY_GOAL_LINE_RE = /^-\s*(\d{4}-W\d{2}):\s?(.*)$/;
// "- 2026-10: Finish module 2 outline" - monthKey then free-text goal.
const MONTHLY_GOAL_LINE_RE = /^-\s*(\d{4}-\d{2}):\s?(.*)$/;

// A note link is a trailing "→ [[relative/path.note]]" on a Task/Meeting
// line (design-overview.md §3), extended here to todos as well as
// meetings - same syntax, same place (end of line), for both.
const NOTE_LINK_RE = /\s*→\s*\[\[([^\]]+)\]\]\s*$/;

// A linked *file* (technical-design-linked-files.md §3) - a second, separate
// trailing token from the note link above, one position further right:
// "... → [[notePath]] +[[linkedFile]]". Strip right-to-left (this one
// first, then NOTE_LINK_RE on what's left) when parsing; append left-to-
// right (note link first, then this) when serializing, so round-tripping
// reproduces the exact token order.
const LINKED_FILE_RE = /\s*\+\[\[([^\]]+)\]\]\s*$/;

// A tag is "#" followed by a letter/digit, optionally extended with "-",
// nested "/segment" parts and a ":value" suffix - #next, #waiting, #team-jf,
// #coaching/sabina, #due:2026-09-01 are all one tag each (design-overview.md
// §3's "one tag mechanism": GTD flow-state, context, and due dates all share
// this instead of separate syntaxes). Nested tags (docs/dev/technical-design-
// split-by-tag.md §3.1) use the same "/" syntax as Obsidian; a segment needs
// at least one character, so "#coaching/" is tag "coaching" plus text "/".
// Not word-boundary-guarded - "C#5" reads as tag "5", same simplification
// most hashtag parsers (including Obsidian's) make. Tags are read out of
// `text`, never stripped from it - `text` keeps its #tags exactly as typed.
const TAG_RE = /#([a-z0-9][\w-]*(?:\/[\w-]+)*(?::[\w-]+)?)/gi;
const DUE_TAG_RE = /^due:(\d{4}-\d{2}-\d{2})$/;
// Matches a `#due:YYYY-MM-DD` tag anywhere in a line's text - used by
// setDueTag below to strip an existing one before (optionally) appending a
// new one. Separate from DUE_TAG_RE above, which matches one already-
// extracted tag string rather than scanning raw text.
const DUE_TAG_ANY_RE = /#due:\d{4}-\d{2}-\d{2}\b/gi;

/**
 * Collapses any run of whitespace right after every `#` in `text` down to
 * nothing (feature_abbrev_quick_file, 2026-09-17, docs/dev/technical-design-
 * abbrev-quick-file.md) - Supernote's handwriting recognition often inserts
 * a space there, and TAG_RE above requires a non-space character right
 * after `#` to parse as a tag at all, so today a "# " sequence doesn't just
 * look wrong, it silently fails to ever become a tag. Wired into every
 * ui/QuickAddWidget.tsx text field's onChangeText, so it applies live
 * regardless of whether the text arrived by typing, handwriting
 * recognition, or paste.
 */
export function stripSpaceAfterHash(text: string): string {
  return text.replace(/#\s+/g, '#');
}

/** Every #tag in `text`, lowercased, in the order they appear (duplicates kept - harmless, nothing dedupes on this). */
function extractTags(text: string): string[] {
  const tags: string[] = [];
  for (const match of text.matchAll(TAG_RE)) {
    tags.push(match[1].toLowerCase());
  }
  return tags;
}

/** A task's due date from a `#due:YYYY-MM-DD` tag among its already-extracted tags, or null. First match wins if more than one is present. */
function deriveDueDate(tags: string[]): string | null {
  for (const tag of tags) {
    const match = DUE_TAG_RE.exec(tag);
    if (match) return match[1];
  }
  return null;
}

/**
 * Derives a task's `tags`/`dueDate`/`flowState`/`waitingOn` from its `text` -
 * the same read `parseTasksSpan` does on load, exported so UI code can keep
 * an in-memory `Task` internally consistent the moment `text` is set or
 * edited (screens/ProjectDataPanel.tsx's TodosSection, screens/DailyView.tsx,
 * ui/TaskQuickAdd.tsx, ui/TaskEditCard.tsx), rather than leaving stale
 * derived fields sitting there until the next full reload re-parses the
 * file from scratch. `flowState`/`waitingOn` (technical-design-tags.md §1)
 * are additive on top of the original tags/dueDate pair - every existing
 * caller already spreads `...deriveTaskFields(text)` onto a Task object, so
 * they pick up the two new fields with no call-site changes. `now`
 * (docs/dev/technical-design-now-focus-mode.md §2) is the same story again -
 * additive, every caller already spreads this whole object onto a Task.
 */
export function deriveTaskFields(
  text: string,
): {tags: string[]; dueDate: string | null; flowState: FlowState; waitingOn: string | null; now: boolean} {
  const tags = extractTags(text);
  return {
    tags,
    dueDate: deriveDueDate(tags),
    flowState: deriveFlowState(tags),
    waitingOn: deriveWaitingOn(tags),
    now: deriveNow(tags),
  };
}

/**
 * Derives a meeting's `tags` from its `title` - the Meeting counterpart to
 * deriveTaskFields above (technical-design-context-tags.md §3). `Meeting`
 * already carries a `tags: string[]` field (domain/types.ts) but every
 * construction site hardcoded `tags: []`; this is the one place that reads
 * them out, mirroring deriveTaskFields's shape exactly (`extractTags` is
 * already shared, no change needed there - just a second caller) so every
 * add/edit call site can spread `...deriveMeetingFields(title)` the same way
 * Task call sites already spread `...deriveTaskFields(text)`. Meetings have
 * no flow-state/due-date/waiting-on/now fields, so this returns tags alone.
 */
export function deriveMeetingFields(title: string): {tags: string[]} {
  return {tags: extractTags(title)};
}

/**
 * Every context tag in `text` - lowercased, deduped, first-appearance order,
 * reserved flow-state/due/`#now` words excluded via `isContextTag`
 * (technical-design-context-tags.md §4/§8). Shared by ui/TagChips.tsx (which
 * tags in the current draft/edit text get pinned to the front, shown
 * selected) and ui/QuickAddWidget.tsx (which tags to hand
 * storage/tagUsage.ts's `recordTagsUsed` after a successful add/edit save) -
 * one derivation, not reimplemented per UI file.
 */
export function extractContextTags(text: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const tag of extractTags(text)) {
    if (isContextTag(tag) && !seen.has(tag)) {
      seen.add(tag);
      tags.push(tag);
    }
  }
  return tags;
}

export type TextSegment = {kind: 'text'; value: string} | {kind: 'tag'; value: string};

/**
 * Walks `text` once with the same `TAG_RE` `extractTags` uses, yielding
 * alternating plain-text and tag segments in order (technical-design-
 * context-tags.md §7) - the basis for ui/TaskRow.tsx/ui/MeetingRow.tsx
 * rendering individual `#tag`s as their own tap targets without
 * reimplementing any of the flow-state/due-tag display stripping
 * `domain/taskLabels.ts`'s `displayTaskText` already does (callers run this
 * over that function's *output*, not the raw `Task.text`). A `{kind: 'tag'}`
 * segment's `value` is the lowercased tag text with no leading `#` - same
 * normalization `extractTags` applies - so it can be compared directly
 * against `Task.tags`/`Meeting.tags` entries and against an active
 * `dailyContext` string.
 */
export function splitTextWithTags(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let lastIndex = 0;
  for (const match of text.matchAll(TAG_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      segments.push({kind: 'text', value: text.slice(lastIndex, index)});
    }
    segments.push({kind: 'tag', value: match[1].toLowerCase()});
    lastIndex = index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({kind: 'text', value: text.slice(lastIndex)});
  }
  return segments;
}

/**
 * Removes every `#tag` from `text` entirely, collapsing any resulting run of
 * whitespace down to single spaces and trimming the ends (docs/technical-
 * design-note-templates.md Phase 3, 2026-09-18) - used for a Todo note's
 * `title` piece, where `task.text` routinely carries trailing `#next`/
 * context tags that have no business in a note's title (unlike a Meeting's
 * `title`, which is used as-is - a meeting title rarely carries tags the
 * way task text always does, so no equivalent stripping happens there).
 * Built on `splitTextWithTags`'s existing text/tag segment walk - one
 * tokenization, reused, rather than a second ad-hoc regex over `TAG_RE`.
 */
export function stripAllTags(text: string): string {
  const stripped = splitTextWithTags(text)
    .filter((segment): segment is {kind: 'text'; value: string} => segment.kind === 'text')
    .map(segment => segment.value)
    .join('');
  return stripped.replace(/\s{2,}/g, ' ').trim();
}

/**
 * Inserts `#tag` into `text` at `position` (technical-design-context-tags.md
 * §8) - tapping a suggested tag chip in ui/QuickAddWidget.tsx's Row 3 calls
 * this rather than always appending, so a tag lands where the cursor
 * actually was. `position` is clamped to `text`'s length when null or out of
 * range - the "in doubt, at the end" fallback the chat decision called for.
 * A space is added on whichever side needs one (not already whitespace, and
 * not the very start/end of `text`), so inserting mid-word still reads as
 * two separate tokens. Returns the new cursor position (right after the
 * inserted tag, including its trailing space if one was added) so the
 * caller can re-focus the `TextInput`'s selection there instead of letting
 * it jump to the end.
 */
export function insertTagAtPosition(
  text: string,
  tag: string,
  position: number | null,
): {text: string; cursor: number} {
  const pos = position === null || position < 0 || position > text.length ? text.length : position;
  const before = text.slice(0, pos);
  const after = text.slice(pos);
  const leadingSpace = before.length > 0 && !/\s$/.test(before) ? ' ' : '';
  const trailingSpace = after.length > 0 && !/^\s/.test(after) ? ' ' : '';
  const insertion = `${leadingSpace}#${tag}${trailingSpace}`;
  return {text: before + insertion + after, cursor: before.length + insertion.length};
}

/**
 * Removes one `#tag` token (case-insensitive) from `text`, plus one adjacent
 * space, collapsing any resulting double space - the counterpart to
 * insertTagAtPosition above, used when tapping an already-selected/pinned
 * chip in Row 3 to remove it again (technical-design-context-tags.md §8).
 * Same "strip via regex, collapse doubled spaces, trim" shape
 * setFlowStateTag/setDueTag already establish, just parameterized on which
 * tag rather than a fixed reserved word.
 */
export function removeTagFromText(text: string, tag: string): string {
  const escapedTag = tag.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
  // Whole-tag guard instead of `\\b` (technical-design-split-by-tag.md §3.1):
  // removing `#coaching` must not cut it out of `#coaching/sabina`,
  // `#coaching-x` or `#coaching:x` - those are different tags.
  const tagRe = new RegExp(`\\s?#${escapedTag}(?![\\w/:-])`, 'gi');
  return text.replace(tagRe, '').replace(/\s{2,}/g, ' ').trim();
}

/**
 * Removes any existing `#due:YYYY-MM-DD` tag from `text` and appends the new
 * one, if any - the counterpart to domain/flowState.ts's `setFlowStateTag`,
 * used by ui/TaskQuickAdd.tsx and ui/TaskEditCard.tsx so the dedicated due-
 * date field can write the tag for the user instead of requiring it typed
 * by hand. Kept here rather than in flowState.ts since DUE_TAG_RE/
 * deriveDueDate already live in this file.
 */
export function setDueTag(text: string, dueDate: string | null): string {
  const stripped = text.replace(DUE_TAG_ANY_RE, '').replace(/\s{2,}/g, ' ').trim();
  if (!dueDate) return stripped;
  return stripped ? `${stripped} #due:${dueDate}` : `#due:${dueDate}`;
}

/** Splits a parsed line's trailing text into {text, notePath}, stripping a "→ [[...]]" suffix if present. */
function extractNoteLink(rawText: string): {text: string; notePath: string} {
  const match = NOTE_LINK_RE.exec(rawText);
  if (!match) return {text: rawText, notePath: ''};
  return {text: rawText.slice(0, match.index), notePath: match[1]};
}

/** Appends a "→ [[...]]" suffix to `text` if `notePath` is set; returns `text` unchanged otherwise. */
function appendNoteLink(text: string, notePath: string): string {
  return notePath ? `${text} → [[${notePath}]]` : text;
}

/** Splits a parsed line's trailing text into {text, linkedFile}, stripping a "+[[...]]" suffix if present. Run this *before* extractNoteLink - see LINKED_FILE_RE's doc comment on token order. */
function extractLinkedFile(rawText: string): {text: string; linkedFile: string} {
  const match = LINKED_FILE_RE.exec(rawText);
  if (!match) return {text: rawText, linkedFile: ''};
  return {text: rawText.slice(0, match.index), linkedFile: match[1]};
}

/**
 * Appends a "+[[...]]" suffix to `text` if `linkedFile` is set; returns
 * `text` unchanged otherwise. Run this *after* appendNoteLink - see
 * LINKED_FILE_RE's doc comment on token order.
 *
 * Note `linkedFile`, like `notePath`, is a field stripped out of / appended
 * onto the raw line at parse/serialize time - it is never embedded in
 * `Task.text`/`Meeting.title` the way a `#tag` is, so there is no
 * `setLinkedFileTag` text-composition helper here (unlike `setDueTag`/
 * `setFlowStateTag`, which *do* operate on `text` since due-date/flow-state
 * tags stay inline in it). Clearing or setting a link is a plain field
 * assignment on the Task/Meeting object, the same way `notePath` is set by
 * ui/TaskRow.tsx's note-link actions rather than by editing text.
 */
function appendLinkedFile(text: string, linkedFile: string): string {
  return linkedFile ? `${text} +[[${linkedFile}]]` : text;
}

interface Span {
  /** Content up to and including the heading line (with its trailing newline). */
  before: string;
  /** The span's own lines, heading excluded. */
  lines: string[];
  /** Content from the next heading (or EOF) onward, verbatim. */
  after: string;
  found: boolean;
}

/** Splits on '\n' only - files are written with '\n', never '\r\n'. */
function splitLines(content: string): string[] {
  return content.length === 0 ? [] : content.split('\n');
}

/**
 * Finds `heading`'s span: everything after that exact line, up to (not
 * including) the next line starting with "## ", or EOF. If the heading
 * isn't present at all, returns found: false so callers can append a fresh
 * section instead of guessing where one might go.
 */
function getSpan(content: string, heading: string): Span {
  const lines = splitLines(content);
  const headingIndex = lines.findIndex(line => line.trim() === heading);
  if (headingIndex === -1) {
    return {before: content, lines: [], after: '', found: false};
  }
  let endIndex = lines.length;
  for (let i = headingIndex + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      endIndex = i;
      break;
    }
  }
  const before = lines.slice(0, headingIndex + 1).join('\n') + '\n';
  const spanLines = lines.slice(headingIndex + 1, endIndex);
  const after = lines.slice(endIndex).join('\n');
  return {before, lines: spanLines, after, found: true};
}

/** Replaces `heading`'s span with `newLines`, or appends a fresh section if the heading wasn't there. */
function setSpan(content: string, heading: string, newLines: string[]): string {
  const span = getSpan(content, heading);
  const linesBlock = newLines.length > 0 ? newLines.join('\n') + '\n' : '';
  if (span.found) {
    const tail = span.after.length > 0 ? '\n' + span.after : '';
    return span.before + linesBlock + tail;
  }
  // Heading doesn't exist yet in this file - append it as a fresh section
  // (normalizing away however many trailing newlines the file already had,
  // then adding exactly one blank line before the new heading).
  const trimmedEnd = content.replace(/\n+$/, '');
  const prefix = trimmedEnd.length > 0 ? trimmedEnd + '\n\n' : '';
  return prefix + heading + '\n' + linesBlock;
}

/**
 * Generic access to one `## Heading` section's raw lines - for features that
 * own a whole section and parse it themselves (docs/dev/technical-design-
 * project-close-out.md §4.2's `## Close-out`). `found` tells an absent
 * heading apart from an empty section.
 */
export function readSectionLines(content: string, heading: string): {lines: string[]; found: boolean} {
  const {lines, found} = getSpan(content, heading);
  return {lines, found};
}

/** Replaces a section's lines (appending the section if absent) - the write side of readSectionLines. */
export function writeSectionLines(content: string, heading: string, lines: string[]): string {
  return setSpan(content, heading, lines);
}

/**
 * Removes a whole `## Heading` section (heading line and its lines) - used
 * when a feature's section should disappear entirely rather than stay as an
 * empty heading (close-out "Start over"). No-op if the heading is absent.
 */
export function removeSection(content: string, heading: string): string {
  const span = getSpan(content, heading);
  if (!span.found) return content;
  const beforeLines = span.before.split('\n');
  // span.before ends with the heading line plus a trailing '\n' - drop both.
  beforeLines.pop();
  beforeLines.pop();
  const head = beforeLines.join('\n').replace(/\n+$/, '');
  const tail = span.after;
  if (head.length === 0) return tail;
  return tail.length > 0 ? `${head}\n\n${tail}` : `${head}\n`;
}

const FRONTMATTER_DELIM = '---';

/**
 * Finds the frontmatter block: `content`'s very first line must be exactly
 * "---", and the span is everything up to (not including) the next line
 * that's also exactly "---". If the file doesn't open with "---", or never
 * closes it, found: false - same "don't guess" contract as getSpan, so a
 * file without frontmatter (or a malformed one) is left alone rather than
 * having a block invented in the wrong place.
 */
function getFrontMatterSpan(content: string): Span {
  const lines = splitLines(content);
  if (lines.length === 0 || lines[0].trim() !== FRONTMATTER_DELIM) {
    return {before: '', lines: [], after: content, found: false};
  }
  let endIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === FRONTMATTER_DELIM) {
      endIndex = i;
      break;
    }
  }
  if (endIndex === -1) {
    return {before: '', lines: [], after: content, found: false};
  }
  const before = lines.slice(0, 1).join('\n') + '\n';
  const spanLines = lines.slice(1, endIndex);
  // Starts at the closing "---" line itself, same convention as getSpan's
  // `after` starting at the next heading - everything from there onward
  // (the closing delimiter, the blank line, "## Tasks", ...) round-trips
  // untouched.
  const after = lines.slice(endIndex).join('\n');
  return {before, lines: spanLines, after, found: true};
}

/** Replaces the frontmatter block's lines with `newLines`. No-op if the file has no (well-formed) frontmatter block - see getFrontMatterSpan; nothing here fabricates one, that's ensureSkeleton's job. */
function setFrontMatterSpan(content: string, newLines: string[]): string {
  const span = getFrontMatterSpan(content);
  if (!span.found) return content;
  const linesBlock = newLines.length > 0 ? newLines.join('\n') + '\n' : '';
  return span.before + linesBlock + span.after;
}

/**
 * Every frontmatter field this plugin reads/writes, as ONE object
 * (docs/dev/technical-design-monthly-view.md §2.1, 2026-09-23). Replaces the old
 * 8-10 positional parameters of writeFrontMatterIntoContent/saveFrontMatter/
 * updateItemFrontMatter: every call site now spreads the item's current
 * fields (storage/dataCache.ts's `frontMatterOf`) and overrides only what it
 * changes, so adding a field (like `monthlyFocus`) can no longer silently
 * clear another one at a call site that forgot to pass it through - the
 * `area`/`abbrev` pitfall the old signature documented.
 */
export interface FrontMatterFields {
  /** From a `status:` line - defaults to 'active' if the line is missing, or its value isn't one of ItemStatus's known values (a stray hand-edit, or a file written before this field existed). Never throws on an unrecognized value; see technical-design-status-archive.md §2. */
  status: ItemStatus;
  dailyFocus: boolean;
  weeklyFocus: boolean;
  /** Monthly focus (docs/dev/technical-design-monthly-view.md) - same "written only when true" convention as the other two focus flags. */
  monthlyFocus: boolean;
  /** From a `defaultResourceFolder:` line, relative to `paths.resources` (e.g. "Atruvia" or "Atruvia/Templates") - null if the line is absent (technical-design-linked-files.md §3.1). Lets a Project/Area pin which Resources subfolder its Files pane's "Resources" root opens into by default. */
  defaultResourceFolder: string | null;
  /** From an `area:` line - the bare folder name (under `paths.areas`) of the Area this Project supports, or null if absent (technical-design-project-area-assignment.md §2). Areas never have this set - the parser stays permissive about what it *reads* regardless of kind, same posture as `status`/`defaultResourceFolder`, but nothing in the UI ever writes it for an Area. */
  area: string | null;
  /** From an `abbrev:` line (docs/dev/technical-design-project-area-abbreviations.md) - a short, user-editable, case-insensitive-unique tag for this Project/Area (e.g. "AT"), or null if never set. Casing is preserved exactly as saved - uniqueness/reserved-word checks (domain/abbrev.ts) are case-insensitive, but this parser doesn't normalize the stored value itself. */
  abbrev: string | null;
  /** Every other frontmatter line verbatim (kind, sortOrder, anything hand-added), in original order - preserved on save. Same reordering caveat as Task/Meeting extraLines: an unrecognized line survives, but always ends up before the lines this parser does recognize, regardless of where it originally sat. */
  extraLines: string[];
}

/** Kept as an alias - parseFrontMatter's result is exactly the write shape now. */
export type ParsedFrontMatter = FrontMatterFields;

const STATUS_LINE_RE = /^status:\s*(.*)$/;
const DAILY_FOCUS_LINE_RE = /^dailyFocus:\s*(.*)$/;
const WEEKLY_FOCUS_LINE_RE = /^weeklyFocus:\s*(.*)$/;
const MONTHLY_FOCUS_LINE_RE = /^monthlyFocus:\s*(.*)$/;
const DEFAULT_RESOURCE_FOLDER_LINE_RE = /^defaultResourceFolder:\s*(.*)$/;
const AREA_LINE_RE = /^area:\s*(.*)$/;
const ABBREV_LINE_RE = /^abbrev:\s*(.*)$/;
const KNOWN_STATUSES: ItemStatus[] = ['active', 'on-hold', 'done', 'archived'];

/** Parses the frontmatter block's `status`/`dailyFocus`/`weeklyFocus`/`monthlyFocus`/`defaultResourceFolder`/`area`/`abbrev` fields - see storage/dataCache.ts's CachedItem for where these end up (flat fields, not nested under domain/types.ts's FrontMatter - see that type's doc comment). */
export function parseFrontMatter(content: string): FrontMatterFields {
  const {lines} = getFrontMatterSpan(content);
  let status: ItemStatus = 'active';
  let dailyFocus = false;
  let weeklyFocus = false;
  let monthlyFocus = false;
  let defaultResourceFolder: string | null = null;
  let area: string | null = null;
  let abbrev: string | null = null;
  const extraLines: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const statusMatch = STATUS_LINE_RE.exec(trimmed);
    if (statusMatch) {
      const value = statusMatch[1].trim();
      status = (KNOWN_STATUSES as string[]).includes(value) ? (value as ItemStatus) : 'active';
      continue;
    }
    const dailyMatch = DAILY_FOCUS_LINE_RE.exec(trimmed);
    if (dailyMatch) {
      dailyFocus = dailyMatch[1].trim() === 'true';
      continue;
    }
    const weeklyMatch = WEEKLY_FOCUS_LINE_RE.exec(trimmed);
    if (weeklyMatch) {
      weeklyFocus = weeklyMatch[1].trim() === 'true';
      continue;
    }
    const monthlyMatch = MONTHLY_FOCUS_LINE_RE.exec(trimmed);
    if (monthlyMatch) {
      monthlyFocus = monthlyMatch[1].trim() === 'true';
      continue;
    }
    const defaultResourceFolderMatch = DEFAULT_RESOURCE_FOLDER_LINE_RE.exec(trimmed);
    if (defaultResourceFolderMatch) {
      const value = defaultResourceFolderMatch[1].trim();
      defaultResourceFolder = value.length > 0 ? value : null;
      continue;
    }
    const areaMatch = AREA_LINE_RE.exec(trimmed);
    if (areaMatch) {
      const value = areaMatch[1].trim();
      area = value.length > 0 ? value : null;
      continue;
    }
    const abbrevMatch = ABBREV_LINE_RE.exec(trimmed);
    if (abbrevMatch) {
      const value = abbrevMatch[1].trim();
      abbrev = value.length > 0 ? value : null;
      continue;
    }
    extraLines.push(line);
  }
  return {status, dailyFocus, weeklyFocus, monthlyFocus, defaultResourceFolder, area, abbrev, extraLines};
}

/**
 * Rebuilds only the frontmatter block; everything else in `content` is
 * untouched. `status` is always written (it always has a meaningful value,
 * unlike the focus flags below); the three focus-flag lines are written
 * only when true, so a file with nothing focused keeps as clean a
 * frontmatter block as it has today. No-op (same as setFrontMatterSpan) if
 * `content` has no well-formed frontmatter block yet - callers should run
 * `ensureSkeleton` first, same as writeTasksIntoContent/writeMeetingsIntoContent
 * already do. `defaultResourceFolder`/`area`/`abbrev` are omitted when null.
 */
export function writeFrontMatterIntoContent(content: string, fm: FrontMatterFields): string {
  const lines = [...fm.extraLines, `status: ${fm.status}`];
  if (fm.dailyFocus) lines.push('dailyFocus: true');
  if (fm.weeklyFocus) lines.push('weeklyFocus: true');
  if (fm.monthlyFocus) lines.push('monthlyFocus: true');
  if (fm.defaultResourceFolder) lines.push(`defaultResourceFolder: ${fm.defaultResourceFolder}`);
  if (fm.area) lines.push(`area: ${fm.area}`);
  if (fm.abbrev) lines.push(`abbrev: ${fm.abbrev}`);
  return setFrontMatterSpan(content, lines);
}

/**
 * If `content` is empty (no data file existed yet, or this is the very
 * first write to a fresh project/area/inbox file), scaffolds minimal
 * frontmatter plus empty Scope/Tasks/Meetings sections so all three
 * headings always exist from the first save onward, regardless of which
 * one is actually filled in first. `kind` is written into the frontmatter
 * verbatim (widened from 'project' | 'area' to the full GtdParaKind so
 * Inbox.txt gets `kind: inbox` the same way project.txt/area.txt get
 * their own kind).
 *
 * `## Scope` (docs/dev/technical-design-item-scope.md, 2026-09-14) is
 * scaffolded here too - deliberately, unlike `## Weekly Goals` below,
 * which stays lazy - specifically so a brand-new Project/Area already
 * has the heading to type into directly from Obsidian, with no
 * dependency on ever opening the item in the app first. Placed right
 * after the frontmatter block, before Tasks/Meetings, matching its
 * top-of-page position on the detail screen. This only affects
 * brand-new files (this function still no-ops the instant `content` is
 * non-empty) - an item created before this change, or hand-created in
 * Obsidian without going through the app, still gets `## Scope` the old
 * lazy way (via `setSpan`, in `writeScopeIntoContent` below) the first
 * time a scope is actually set on it, so no migration is needed for
 * existing files.
 */
export function ensureSkeleton(content: string, kind: GtdParaKind): string {
  if (content.trim().length > 0) return content;
  return `---\nkind: ${kind}\nstatus: active\n---\n\n${SCOPE_HEADING}\n\n${TASKS_HEADING}\n\n${MEETINGS_HEADING}\n`;
}

/**
 * Parses the `## Scope` span (docs/dev/technical-design-item-scope.md) - a
 * single free-text value, unlike Tasks/Meetings/Weekly Goals: there's no
 * per-line grammar here, so the whole span *is* the value. The span's
 * lines are joined back with '\n' and trimmed - this deliberately
 * preserves a hand-edited multi-line/multi-paragraph Scope exactly as
 * written (a blank line between two sentences round-trips untouched),
 * rather than collapsing it to one line. Returns '' if the heading is
 * absent (a pre-feature file that's never had one added) or present but
 * empty (the scaffolded-but-unfilled case `ensureSkeleton` now creates
 * for every new Project/Area).
 */
export function parseScopeSpan(content: string): string {
  const {lines} = getSpan(content, SCOPE_HEADING);
  return lines.join('\n').trim();
}

/**
 * Rebuilds only the Scope span; everything else in `content` is
 * untouched. An empty `scope` keeps the heading with no lines beneath it
 * (same convention as an empty Tasks/Meetings span) rather than removing
 * the heading outright - so clearing a Scope through the app leaves the
 * heading sitting there ready to be typed into again, from the app or
 * from Obsidian either one.
 */
export function writeScopeIntoContent(content: string, scope: string): string {
  const trimmed = scope.trim();
  const lines = trimmed.length > 0 ? trimmed.split('\n') : [];
  return setSpan(content, SCOPE_HEADING, lines);
}

export interface ParsedTasks {
  tasks: Task[];
  /** Non-blank lines in the Tasks span this plugin didn't understand - preserved verbatim on save, never shown or editable. */
  extraLines: string[];
}

export function parseTasksSpan(content: string): ParsedTasks {
  const {lines} = getSpan(content, TASKS_HEADING);
  const tasks: Task[] = [];
  const extraLines: string[] = [];
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const match = TASK_LINE_RE.exec(line);
    if (!match) {
      extraLines.push(line);
      continue;
    }
    const [, state, rawText] = match;
    const {text: afterLinkedFile, linkedFile} = extractLinkedFile(rawText);
    const {text, notePath} = extractNoteLink(afterLinkedFile);
    tasks.push({
      text,
      done: state.toLowerCase() === 'x',
      cancelled: state === '-',
      ...deriveTaskFields(text),
      notePath,
      linkedFile,
    });
  }
  return {tasks, extraLines};
}

function serializeTaskLine(task: Task): string {
  const state = task.cancelled ? '-' : task.done ? 'x' : ' ';
  const withNoteLink = appendNoteLink(task.text, task.notePath);
  return `- [${state}] ${appendLinkedFile(withNoteLink, task.linkedFile)}`;
}

/** Rebuilds only the Tasks span; everything else in `content` is untouched. */
export function writeTasksIntoContent(
  content: string,
  tasks: Task[],
  extraLines: string[] = [],
): string {
  const lines = [...tasks.map(serializeTaskLine), ...extraLines];
  return setSpan(content, TASKS_HEADING, lines);
}

export interface ParsedMeetings {
  meetings: Meeting[];
  /** Non-blank lines in the Meetings span this plugin didn't understand (e.g. a hand-written recurring meeting) - preserved verbatim on save, never shown or editable. */
  extraLines: string[];
}

export function parseMeetingsSpan(content: string): ParsedMeetings {
  const {lines} = getSpan(content, MEETINGS_HEADING);
  const meetings: Meeting[] = [];
  const extraLines: string[] = [];
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    // Indented lines (e.g. the occurrence list under a hand-written series
    // line - gtdpara has no recurring meetings) are kept as extra lines and
    // written back untouched.
    if (/^\s/.test(line)) {
      extraLines.push(line);
      continue;
    }
    const match = MEETING_LINE_RE.exec(line);
    if (!match) {
      extraLines.push(line);
      continue;
    }
    const [, cancelledMark, date, time, endTime, days, rawTitle] = match;
    const {text: afterLinkedFile, linkedFile} = extractLinkedFile(rawTitle);
    const {text: title, notePath} = extractNoteLink(afterLinkedFile);
    meetings.push({
      title,
      date,
      time: time ?? '',
      endTime: time ? endTime ?? '' : '',
      days: time ? 1 : days ? Number(days) : 1,
      ...deriveMeetingFields(title),
      cancelled: cancelledMark === '-',
      notePath,
      linkedFile,
    });
  }
  return {meetings, extraLines};
}

function serializeMeetingLine(meeting: Meeting): string {
  const cancelledMark = meeting.cancelled ? '[-] ' : '';
  // Always one slot (see MEETING_LINE_RE): "HH:mm", "HH:mm-HH:mm" or "Nd".
  const timePart = meeting.time
    ? `${meeting.time}${meeting.endTime ? `-${meeting.endTime}` : ''} `
    : `${Math.max(1, meeting.days || 1)}d `;
  const titleWithNoteLink = appendNoteLink(meeting.title, meeting.notePath);
  const titleWithLink = appendLinkedFile(titleWithNoteLink, meeting.linkedFile);
  return `- ${cancelledMark}${meeting.date} ${timePart}${titleWithLink}`;
}

/** Rebuilds only the Meetings span; everything else in `content` is untouched. */
export function writeMeetingsIntoContent(
  content: string,
  meetings: Meeting[],
  extraLines: string[] = [],
): string {
  const lines = [...meetings.map(serializeMeetingLine), ...extraLines];
  return setSpan(content, MEETINGS_HEADING, lines);
}

export interface ParsedWeeklyGoals {
  goals: WeeklyGoal[];
  /** Non-blank lines in the Weekly Goals span this plugin didn't understand - preserved verbatim on save, never shown or editable. */
  extraLines: string[];
}

export interface ParsedMonthlyGoals {
  goals: MonthlyGoal[];
  /** Non-blank lines in the Monthly Goals span this plugin didn't understand - preserved verbatim on save. */
  extraLines: string[];
}

/**
 * One generic "keyed goals span" parser (docs/dev/technical-design-monthly-view.md
 * §2.2) - `## Weekly Goals` (`- YYYY-Www: text`) and `## Monthly Goals`
 * (`- YYYY-MM: text`) are the same shape, differing only in heading and key
 * syntax. Deliberately sparse, unlike Tasks/Meetings: most files have zero
 * or a handful of lines here, and neither heading is scaffolded by
 * ensureSkeleton - `setSpan` appends a fresh heading the first time one is
 * actually needed.
 */
function parseKeyedGoalsSpan(
  content: string,
  heading: string,
  lineRe: RegExp,
): {goals: Array<{key: string; text: string}>; extraLines: string[]} {
  const {lines} = getSpan(content, heading);
  const goals: Array<{key: string; text: string}> = [];
  const extraLines: string[] = [];
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    const match = lineRe.exec(line);
    if (!match) {
      extraLines.push(line);
      continue;
    }
    const [, key, text] = match;
    goals.push({key, text});
  }
  return {goals, extraLines};
}

function writeKeyedGoalsIntoContent(
  content: string,
  heading: string,
  goals: Array<{key: string; text: string}>,
  extraLines: string[],
): string {
  const lines = [...goals.map(g => `- ${g.key}: ${g.text}`), ...extraLines];
  return setSpan(content, heading, lines);
}

/**
 * Replaces `key`'s entry with `text` (added if absent), or removes it if
 * `text` is blank - so clearing a goal deletes that period's line rather
 * than leaving an empty one behind. One goal per item per period, by
 * construction - this is the only place a goal is ever added or changed.
 */
function setKeyedGoal<T>(goals: T[], keyOf: (g: T) => string, make: (text: string) => T, key: string, text: string): T[] {
  const trimmed = text.trim();
  const without = goals.filter(g => keyOf(g) !== key);
  if (trimmed.length === 0) return without;
  return [...without, make(trimmed)];
}

/** Parses the `## Weekly Goals` span (docs/dev/technical-design-weekly-goals.md) - see parseKeyedGoalsSpan. */
export function parseWeeklyGoalsSpan(content: string): ParsedWeeklyGoals {
  const {goals, extraLines} = parseKeyedGoalsSpan(content, WEEKLY_GOALS_HEADING, WEEKLY_GOAL_LINE_RE);
  return {goals: goals.map(g => ({weekKey: g.key, text: g.text})), extraLines};
}

/** Rebuilds only the Weekly Goals span; everything else in `content` is untouched. */
export function writeWeeklyGoalsIntoContent(
  content: string,
  goals: WeeklyGoal[],
  extraLines: string[] = [],
): string {
  return writeKeyedGoalsIntoContent(content, WEEKLY_GOALS_HEADING, goals.map(g => ({key: g.weekKey, text: g.text})), extraLines);
}

/** Sets/clears `weekKey`'s goal - see setKeyedGoal. */
export function setGoalForWeek(goals: WeeklyGoal[], weekKey: string, text: string): WeeklyGoal[] {
  return setKeyedGoal(goals, g => g.weekKey, t => ({weekKey, text: t}), weekKey, text);
}

/** Parses the `## Monthly Goals` span (docs/dev/technical-design-monthly-view.md §2.2). */
export function parseMonthlyGoalsSpan(content: string): ParsedMonthlyGoals {
  const {goals, extraLines} = parseKeyedGoalsSpan(content, MONTHLY_GOALS_HEADING, MONTHLY_GOAL_LINE_RE);
  return {goals: goals.map(g => ({monthKey: g.key, text: g.text})), extraLines};
}

/** Rebuilds only the Monthly Goals span; everything else in `content` is untouched. */
export function writeMonthlyGoalsIntoContent(
  content: string,
  goals: MonthlyGoal[],
  extraLines: string[] = [],
): string {
  return writeKeyedGoalsIntoContent(content, MONTHLY_GOALS_HEADING, goals.map(g => ({key: g.monthKey, text: g.text})), extraLines);
}

/**
 * Parses the `## Marks` span (docs/dev/technical-design-lasso-0.8.md §3.1):
 * one line per open "Mark for later". Other lines in the section are kept.
 */
export function parseMarksSpan(content: string): {marks: Mark[]; extraLines: string[]} {
  const {lines} = getSpan(content, MARKS_HEADING);
  return parseMarkLines(lines);
}

/**
 * Rebuilds only the Marks span; everything else in `content` is untouched.
 * Created lazily (appended at the end) like Weekly Goals - `ensureSkeleton`
 * never writes it. With no marks left the heading stays, empty.
 */
export function writeMarksIntoContent(content: string, marks: Mark[], extraLines: string[] = []): string {
  return setSpan(content, MARKS_HEADING, serializeMarkLines(marks, extraLines));
}

/** Sets/clears `monthKey`'s goal - see setKeyedGoal. */
export function setGoalForMonth(goals: MonthlyGoal[], monthKey: string, text: string): MonthlyGoal[] {
  return setKeyedGoal(goals, g => g.monthKey, t => ({monthKey, text: t}), monthKey, text);
}
