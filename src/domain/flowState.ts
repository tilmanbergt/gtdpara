/**
 * GTD flow-state derivation, mutation, and grouping helpers
 * (technical-design-tags.md §1-2, §4). Pure, zero RN/SDK imports - same
 * domain/ convention as markdown.ts, unit-testable via the project's
 * standalone Node scripts without a device.
 *
 * Flow-state (`Task.flowState`) is exclusive by UI convention: the chip row
 * (ui/FlowStateChips.tsx) clears any other flow-state tag before applying a
 * new one, via `setFlowStateTag` below. The *parser* (`deriveFlowState`)
 * stays permissive about what it reads - a hand-edited file carrying more
 * than one flow tag doesn't throw, it just picks one by the fixed priority
 * order `FLOW_STATE_WORDS` lists, same "never invent structure, never
 * load-bearing-fail on messy input" posture as every other parser in
 * domain/markdown.ts.
 */
import {FlowState, Task} from './types';

const FLOW_STATE_WORDS: Exclude<FlowState, null>[] = ['next', 'waiting-for', 'someday', 'maybe'];

/** First match wins, in FLOW_STATE_WORDS' priority order - see the module doc comment. */
export function deriveFlowState(tags: string[]): FlowState {
  for (const word of FLOW_STATE_WORDS) {
    if (tags.some(tag => tag === word || tag.startsWith(`${word}:`))) return word;
  }
  return null;
}

const WAITING_FOR_VALUE_RE = /^waiting-for:([\w-]+)$/;

/** The slug out of a `#waiting-for:<slug>` tag, or null. First match wins if more than one is present (same convention as domain/markdown.ts's deriveDueDate). */
export function deriveWaitingOn(tags: string[]): string | null {
  for (const tag of tags) {
    const match = WAITING_FOR_VALUE_RE.exec(tag);
    if (match) return match[1];
  }
  return null;
}

/**
 * Free text typed into the "Waiting on" field -> a tag-safe slug (lowercase,
 * every run of non `[a-z0-9-]` characters collapsed to one `-`, leading/
 * trailing `-` trimmed). Deliberately lossy - punctuation, exact spacing and
 * capitalization aren't recoverable - technical-design-tags.md §1's accepted
 * trade-off, the same shape `#due:` already lives inside rather than a new
 * syntax. "" in, "" out (an empty/all-punctuation input slugifies to "").
 */
export function slugifyWaitingOn(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/** `meier-sohn` -> `Meier Sohn`, for badge display (ui/TaskBadges.tsx). Empty slug -> empty string. */
export function titleCaseSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map(word => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

// Matches a bare flow-state tag, or (waiting-for only) one carrying a
// `:value` suffix, so a single strip below covers both `#waiting-for` and
// `#waiting-for:meier-sohn` in one pass.
const FLOW_STATE_TAG_RE = /#(next|waiting-for(?::[\w-]+)?|someday|maybe)\b/gi;

/**
 * Removes any existing flow-state tag (bare, or `waiting-for:<slug>`) from
 * `text` and appends the new one, if any. The one place UI code edits `text`
 * for flow-state - callers re-derive tags/dueDate/flowState immediately
 * after via domain/markdown.ts's `deriveTaskFields`, same as every other
 * text edit in this codebase (text is hand-typed truth, tags are a derived
 * read of it, never a parallel source of state).
 */
export function setFlowStateTag(text: string, next: FlowState, waitingOnSlug?: string): string {
  const stripped = text.replace(FLOW_STATE_TAG_RE, '').replace(/\s{2,}/g, ' ').trim();
  if (!next) return stripped;
  const tag = next === 'waiting-for' && waitingOnSlug ? `#waiting-for:${waitingOnSlug}` : `#${next}`;
  return stripped ? `${stripped} ${tag}` : tag;
}

// Bare (value-less) reserved tags - `#now` (docs/dev/technical-design-now-focus-mode.md
// §2) and, since docs/dev/technical-design-meeting-tracking.md, `#prepped`/
// `#reviewed`. Unlike flow-state tags, a bare tag never carries a `:value`
// suffix, and it is additive on top of everything else rather than exclusive
// with it. One derive/set/strip trio (`hasBareTag`/`setBareTag`/
// `stripBareTags` below) serves all of them instead of one regex-and-helper
// pair per word - deriveNow/setNowTag are now thin wrappers over it, so their
// call sites are unchanged.
//
// The trailing lookahead mirrors domain/markdown.ts's TAG_RE (`[\w-]*`, nested
// `/[\w-]+` segments, then an optional `:[\w-]+`): `#now` must be the WHOLE
// tag, so `#nowhere`, `#now-x`, `#now/x` and `#now:x` are different tags and
// are neither matched nor stripped.
function bareTagRe(tag: string): RegExp {
  return new RegExp(`#${tag}(?![\\w-]|[/:][\\w-])`, 'gi');
}

/**
 * Bare reserved words that are NOT free/context tags - one list, consumed by
 * `isContextTag` below so a new bare tag can never be added to the derive/set
 * helpers and forgotten in the context-tag exclusion (which would make it
 * show up as a tappable filter tag and a suggestion chip).
 */
// 'monthly' = the Month view's meeting highlight flag (docs/dev/technical-design-monthly-view.md §2.4).
export const RESERVED_BARE_TAGS: readonly string[] = ['next', 'someday', 'maybe', 'now', 'prepped', 'reviewed', 'monthly'];

/**
 * Whether `tags` (already-extracted, lowercased - see domain/markdown.ts's
 * extractTags) includes the bare tag `tag`. Deliberately independent of
 * deriveFlowState - a bare tag is additive on top of #next etc., never
 * exclusive with it, so this never consults FlowState at all.
 */
export function hasBareTag(tags: string[], tag: string): boolean {
  return tags.some(t => t === tag);
}

/**
 * Removes any existing bare `#tag` from `text` and appends a fresh one if
 * `value` is true - the bare-tag counterpart to setFlowStateTag/setDueTag
 * (domain/markdown.ts). Same "strip then reappend" convention, and the same
 * contract: callers re-derive tags immediately after via domain/markdown.ts's
 * deriveTaskFields/deriveMeetingFields, `text` stays the one source of truth.
 */
export function setBareTag(text: string, tag: string, value: boolean): string {
  const stripped = text.replace(bareTagRe(tag), '').replace(/\s{2,}/g, ' ').trim();
  if (!value) return stripped;
  return stripped ? `${stripped} #${tag}` : `#${tag}`;
}

/**
 * Removes every occurrence of each bare tag in `tags` from `text` for
 * DISPLAY (state tags like `#prepped` are machine-managed and shouldn't show
 * up in a row's title or a note's title piece) - collapses the resulting
 * double spaces and trims, same shape as setBareTag's own strip step.
 */
export function stripBareTags(text: string, tags: readonly string[]): string {
  let out = text;
  for (const tag of tags) out = out.replace(bareTagRe(tag), '');
  return out.replace(/\s{2,}/g, ' ').trim();
}

/** Whether `tags` includes a bare `now` tag - a thin wrapper over hasBareTag, see the block comment above. */
export function deriveNow(tags: string[]): boolean {
  return hasBareTag(tags, 'now');
}

/** Adds/removes `#now` - the #now counterpart to setFlowStateTag/setDueTag, a thin wrapper over setBareTag. Only ever called from ui/TaskBadges.tsx's double-tap gesture today. */
export function setNowTag(text: string, value: boolean): string {
  return setBareTag(text, 'now', value);
}

/**
 * Whether a (lowercased, already-extracted) tag is a free/context tag rather
 * than one of the reserved flow-vocabulary words this module owns -
 * technical-design-context-tags.md §4. Excludes every RESERVED_BARE_TAGS word
 * (the flow-state words, `now`, `prepped`, `reviewed`), and both
 * `:value`-suffixed forms (`waiting-for:<slug>`, `due:<date>` - the latter
 * owned by domain/markdown.ts's setDueTag, not this file, but the
 * reserved-word list is one contract) via prefix match,
 * same convention FLOW_STATE_TAG_RE/DUE_TAG_ANY_RE use for the `:value`
 * suffix. Anything else - including tags that merely look reserved, like a
 * hand-typed `#nextsteps` - is a context tag: this only excludes exact
 * reserved words and their `:value` forms, never prefix-matches a longer
 * word.
 */
export function isContextTag(tag: string): boolean {
  if (RESERVED_BARE_TAGS.includes(tag)) return false;
  if (tag === 'waiting-for' || tag.startsWith('waiting-for:')) return false;
  if (tag === 'due' || tag.startsWith('due:')) return false;
  return true;
}

/**
 * The free/context tags among an item's `tags`, once each, in order - the
 * keywords a todo's or meeting's own note gets (docs/dev/technical-design-
 * cleanup-0.5.md S7), the same set a Quick Add "Note" note gets from its
 * title (domain/markdown.ts's extractContextTags).
 */
export function contextTagsOf(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const tag of tags) {
    if (isContextTag(tag) && !out.includes(tag)) out.push(tag);
  }
  return out;
}

export interface TaskGroup {
  key: Exclude<FlowState, null> | 'other';
  label: string;
  entries: Array<{task: Task; index: number}>;
}

const GROUP_ORDER: Array<{key: TaskGroup['key']; label: string}> = [
  {key: 'next', label: 'Next'},
  {key: 'waiting-for', label: 'Waiting For'},
  {key: 'someday', label: 'Someday'},
  {key: 'maybe', label: 'Maybe'},
  {key: 'other', label: 'Other'},
];

/**
 * Pure grouping over one item's own tasks (technical-design-tags.md §4) -
 * not-cancelled tasks only (same "cancelled is a soft-delete, hidden from
 * every normal view" rule TodosSection's own `visible` filter already
 * applies); done tasks stay in their group, same as today's flat list.
 * Empty groups are omitted entirely, the same convention
 * technical-design-status-archive.md §7 already established for the
 * Projects/Areas list's status sections.
 */
export function groupTasksByFlowState(tasks: Task[]): TaskGroup[] {
  const indexed = tasks.map((task, index) => ({task, index})).filter(({task}) => !task.cancelled);
  const buckets: Record<TaskGroup['key'], Array<{task: Task; index: number}>> = {
    next: [],
    'waiting-for': [],
    someday: [],
    maybe: [],
    other: [],
  };
  for (const entry of indexed) {
    buckets[entry.task.flowState ?? 'other'].push(entry);
  }
  return GROUP_ORDER.map(group => ({...group, entries: buckets[group.key]})).filter(
    group => group.entries.length > 0,
  );
}
