/**
 * Note setups (docs/dev/history/technical-design-note-setups.md §3-§4): one
 * setup per thing you track - a name, one or more tags, a kind (Thread or
 * Loop), where its notes go, meeting tracking, and a page per item kind whose
 * layout is either the Default's or its own. Every decision about setups lives
 * here: matching, the places a first note can go, which layout a page uses,
 * validation and the seeded Default. Pure domain (design-overview.md §3).
 */
import type {LoopRef} from './loops';
import {addPiece, emptyPageLayout, PageKind, PageLayout, withDefaultPieces} from './pageLayout';
import {invalidFileNameChars} from './fileName';

export type SetupKind = 'thread' | 'loop';

/** A loop note's name when its field is blank (docs/dev/history/technical-design-loops.md §3.1). */
export const LOOP_NOTE_NAME_DEFAULT = '{year}-{month} {tag} {subtag}';

export interface Notebook {
  /** Name template; placeholders as SHARED_FILE_NAME_PLACEHOLDERS (domain/sharedNotePages.ts). */
  name: string;
  /**
   * Folder inside the Project/Area: '' = its root, else a relative path
   * ('Meetings', 'Sparring', 'Coaching/2026'); created on first use. Checked
   * by validateNotebookFolder. Ignored for loops (the loop note lives in the
   * owner's folder).
   */
  folder: string;
}

export interface MeetingTracking {
  trackPrep: boolean;
  trackReview: boolean;
}

export interface NoteSetup {
  id: string;
  name: string;
  kind: SetupKind;
  /** Lowercase, without '#'. Each tag belongs to one setup only (validateSetupTags). */
  tags: string[];
  enabled: boolean;
  /** null = own note per item (Thread only). A Loop setup always has one: the loop note. */
  notebook: Notebook | null;
  /** Own layouts. A missing entry = Default layout (the Default page for that kind). */
  pages: Partial<Record<PageKind, PageLayout>>;
  tracking: MeetingTracking;
}

export interface NoteSetupDefaults {
  /** The Default page per kind; a missing entry = a blank page with no pieces. */
  pages: Partial<Record<PageKind, PageLayout>>;
  tracking: MeetingTracking;
  /**
   * Where the notes of items no setup matches go: a notebook, or null = own
   * note per item. Absent only in settings migrated before the Default had a
   * notebook (domain/noteSetupMigration.ts fills it in once); read as null.
   */
  notebook?: Notebook | null;
}

/** What every consumer of setups needs: the list and the Default. */
export interface NoteSetupConfig {
  setups: readonly NoteSetup[];
  defaults: NoteSetupDefaults;
}

/** The setups and the Default out of the settings. */
export function noteSetupConfig(settings: {noteSetups: readonly NoteSetup[]; noteSetupDefaults: NoteSetupDefaults}): NoteSetupConfig {
  return {setups: settings.noteSetups, defaults: settings.noteSetupDefaults};
}

/** A config with no setups and a Default without pages or tracking - until settings are loaded. */
export const EMPTY_NOTE_SETUP_CONFIG: NoteSetupConfig = {setups: [], defaults: {pages: {}, tracking: {trackPrep: false, trackReview: false}, notebook: null}};

/** The page rows a setup of `kind` has, in the order the setup page lists them. */
// The Home page is the Default's only (docs/dev/history/technical-design-home-notebooks.md §3.2).
export function pageKindsOf(kind: SetupKind): PageKind[] {
  return kind === 'loop' ? ['meeting', 'todo', 'first'] : ['meeting', 'todo'];
}

// ---- Tags -------------------------------------------------------------------

/**
 * Whether an item's tag matches a setup tag (docs/dev/history/
 * technical-design-split-by-tag.md §3.2): the tag itself, or a tag nested
 * under it - `coaching` matches `coaching` and `coaching/sabina`, never
 * `coachingx`, and `coaching/sabina` never matches plain `coaching`.
 * Both sides are expected lowercased.
 */
export function tagMatchesSetupTag(itemTag: string, setupTag: string): boolean {
  return itemTag === setupTag || itemTag.startsWith(`${setupTag}/`);
}

/**
 * The part of the first item tag nested under any of `setupTags`, with that
 * prefix removed - `['coaching/sabina']` under `coaching` gives `"sabina"`;
 * deeper nesting keeps the rest (`coaching/sabina/2026` -> `"sabina/2026"`).
 * Item tags are scanned in their own order, so the first nested tag wins.
 * Lowercased; `""` when no item tag is nested under a setup tag.
 */
export function setupSubtag(itemTags: readonly string[], setupTags: readonly string[]): string {
  const lower = setupTags.map(t => t.toLowerCase()).filter(Boolean);
  for (const raw of itemTags) {
    const tag = raw.toLowerCase();
    for (const setupTag of lower) {
      if (tag.startsWith(`${setupTag}/`)) return tag.slice(setupTag.length + 1);
    }
  }
  return '';
}

/**
 * The setup tag the item matched (docs/dev/history/technical-design-tending-threads.md
 * §3.8) - the `{tag}` of a notebook name, so one setup on `sparring` and
 * `retro` names its files `sparring max 2026` and `retro alpha 2026`. The
 * first item tag (text order) that is a setup tag or nested under one wins;
 * lowercased; `""` when none matches.
 */
export function setupTypeTag(itemTags: readonly string[], setupTags: readonly string[]): string {
  const lower = setupTags.map(t => t.toLowerCase()).filter(Boolean);
  for (const raw of itemTags) {
    const tag = raw.toLowerCase();
    const match = lower.find(setupTag => tagMatchesSetupTag(tag, setupTag));
    if (match) return match;
  }
  return '';
}

/** Whether one of `tags` matches one of the setup's tags (case-insensitive). */
export function setupMatchesTags(setup: Pick<NoteSetup, 'tags'>, tags: readonly string[]): boolean {
  return setupTypeTag(tags, setup.tags) !== '';
}

/** Enabled setups one of whose tags matches one of `tags`, in list order. */
export function matchingSetups(tags: readonly string[], setups: readonly NoteSetup[]): NoteSetup[] {
  return setups.filter(s => s.enabled && setupMatchesTags(s, tags));
}

// ---- Where a first note goes (§1.2, §4.1) ----------------------------------

export interface NoteCandidate {
  /** null = the Default. */
  setup: NoteSetup | null;
  target: 'own' | 'notebook' | 'loop';
  /** Target 'loop' only: the loop whose note gets the page. */
  loop?: LoopRef;
}

/** The loop of `setup` among `activeLoops` (a loop whose kind is one of the setup's tags), or undefined. */
function activeLoopOf(setup: NoteSetup, activeLoops: readonly LoopRef[]): LoopRef | undefined {
  const kinds = setup.tags.map(t => t.toLowerCase());
  return activeLoops.find(loop => kinds.includes(loop.kind));
}

function candidateOf(setup: NoteSetup, activeLoops: readonly LoopRef[]): NoteCandidate {
  if (setup.kind === 'loop') {
    const loop = activeLoopOf(setup, activeLoops);
    return loop ? {setup, target: 'loop', loop} : {setup, target: 'own'};
  }
  return {setup, target: setup.notebook ? 'notebook' : 'own'};
}

/** Whether two candidates certainly lead to the same note: every 'own' note of an item is the same file; one loop has one note. */
function sameTarget(a: NoteCandidate, b: NoteCandidate): boolean {
  if (a.target !== b.target) return false;
  if (a.target === 'own') return true;
  if (a.target === 'loop') return a.loop?.tag === b.loop?.tag;
  return a.setup?.id === b.setup?.id;
}

/**
 * The places a first note of this item can go, best first (§1.2):
 * meeting: Thread setups, then Loop setups; todo: Loop setups, then Thread
 * setups; list order within a kind. A Loop setup counts as 'loop' only when
 * the item's tag names an active loop of its file (`activeLoops`); otherwise
 * it is an 'own' candidate with its layout. No match: one candidate, the
 * Default - its notebook when it has one (`defaultNotebook`), else 'own'.
 * Inbox (`forceOwn`): the first candidate, as 'own'.
 * Candidates that certainly lead to the same note are merged (the first
 * stays); `distinctCandidates` merges the ones only storage can tell apart.
 */
export function noteCandidates(input: {
  pageKind: 'meeting' | 'todo';
  tags: readonly string[];
  setups: readonly NoteSetup[];
  activeLoops: readonly LoopRef[];
  forceOwn: boolean;
  /** Whether the Default has a notebook. */
  defaultNotebook?: boolean;
}): NoteCandidate[] {
  const matched = matchingSetups(input.tags, input.setups);
  const first: SetupKind = input.pageKind === 'meeting' ? 'thread' : 'loop';
  const ordered = [...matched.filter(s => s.kind === first), ...matched.filter(s => s.kind !== first)];
  if (ordered.length === 0) return [{setup: null, target: input.defaultNotebook && !input.forceOwn ? 'notebook' : 'own'}];
  if (input.forceOwn) return [{setup: ordered[0], target: 'own'}];
  const out: NoteCandidate[] = [];
  for (const setup of ordered) {
    const candidate = candidateOf(setup, input.activeLoops);
    if (!out.some(c => sameTarget(c, candidate))) out.push(candidate);
  }
  return out;
}

/** Keeps the first of every group of candidates whose `fileOf` is the same file. */
export function distinctCandidates<C>(candidates: readonly C[], fileOf: (c: C) => string): C[] {
  const seen = new Set<string>();
  const out: C[] = [];
  for (const c of candidates) {
    const file = fileOf(c);
    if (seen.has(file)) continue;
    seen.add(file);
    out.push(c);
  }
  return out;
}

/** The layout a page of `pageKind` uses under `setup` (null = the Default): its own layout, else the Default page, else null (blank). */
export function layoutFor(setup: NoteSetup | null, pageKind: PageKind, defaults: NoteSetupDefaults): PageLayout | null {
  return setup?.pages[pageKind] ?? defaults.pages[pageKind] ?? null;
}

/** Which candidate an existing note link belongs to: the one whose file equals the link's file; else the first. */
export function candidateForLink<C>(candidates: readonly C[], linkFile: string, fileOf: (c: C) => string): C {
  return candidates.find(c => fileOf(c) === linkFile) ?? candidates[0];
}

// ---- Validation (§4.5) -------------------------------------------------------

/** A tag as a setup stores it: trimmed, without '#', lowercase; '' when nothing is left. */
export function normalizeSetupTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').trim().toLowerCase();
}

/** `tags` normalized, empty ones dropped, each once, in order. */
export function normalizeSetupTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const tag = normalizeSetupTag(raw);
    if (tag && !out.includes(tag)) out.push(tag);
  }
  return out;
}

export type SetupTagProblem =
  | {kind: 'taken'; tag: string; otherSetup: string}
  | {kind: 'loopNested'; tag: string};

/**
 * Why `setup`'s tags can't be saved, or null: a tag another setup already has
 * (enabled or not - one tag, one setup), or a Loop setup tag with `/` (a loop
 * kind is one word). `all` may contain `setup` itself (matched by id).
 */
export function validateSetupTags(setup: Pick<NoteSetup, 'id' | 'kind' | 'tags'>, all: readonly NoteSetup[]): SetupTagProblem | null {
  const tags = normalizeSetupTags(setup.tags);
  if (setup.kind === 'loop') {
    const nested = tags.find(t => t.includes('/'));
    if (nested) return {kind: 'loopNested', tag: nested};
  }
  for (const tag of tags) {
    const other = all.find(s => s.id !== setup.id && normalizeSetupTags(s.tags).includes(tag));
    if (other) return {kind: 'taken', tag, otherSetup: other.name || 'another setup'};
  }
  return null;
}

/** The status-slot text for a tag problem. */
export function setupTagProblemText(problem: SetupTagProblem): string {
  if (problem.kind === 'loopNested') return 'A loop kind is one word, like workshop.';
  return `#${problem.tag} is already in ${problem.otherSetup}.`;
}

const MAX_FOLDER_SEGMENTS = 3;
const MAX_FOLDER_LENGTH = 60;

/**
 * A notebook folder as typed, checked (§4.5): trimmed, `\` read as `/`,
 * leading/trailing `/` dropped. Refused when a segment is empty, `.`/`..`,
 * starts with a dot, or contains characters a file name can't
 * (domain/fileName.ts); at most 3 segments and 60 characters. `''` is valid
 * (the Project/Area root).
 */
export function validateNotebookFolder(text: string): {ok: true; folder: string} | {ok: false; message: string} {
  const folder = text
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
  if (!folder) return {ok: true, folder: ''};
  if (folder.length > MAX_FOLDER_LENGTH) return {ok: false, message: `The folder is too long (${MAX_FOLDER_LENGTH} characters at most).`};
  const segments = folder.split('/').map(s => s.trim());
  if (segments.length > MAX_FOLDER_SEGMENTS) return {ok: false, message: `A folder can be at most ${MAX_FOLDER_SEGMENTS} levels deep.`};
  for (const segment of segments) {
    if (!segment) return {ok: false, message: 'A folder name cannot be empty (two slashes in a row).'};
    if (segment.startsWith('.')) return {ok: false, message: 'A folder name cannot start with a dot.'};
    const bad = invalidFileNameChars(segment);
    if (bad.length > 0) return {ok: false, message: `A folder name cannot contain ${bad.join(' ')}`};
  }
  return {ok: true, folder: segments.join('/')};
}

// ---- New setups and the seeded Default -----------------------------------------

const NO_TRACKING: MeetingTracking = {trackPrep: false, trackReview: false};

/** A fresh setup: no tags, enabled, Default layout for every page. A Loop setup starts with the default loop note name. */
export function createNoteSetup(id: string, kind: SetupKind): NoteSetup {
  return {
    id,
    name: '',
    kind,
    tags: [],
    enabled: true,
    notebook: kind === 'loop' ? {name: LOOP_NOTE_NAME_DEFAULT, folder: ''} : null,
    pages: {},
    tracking: {...NO_TRACKING},
  };
}

/** The standard Meeting page: Date & title, Time, Linked file, and Related items at the bottom. */
export function createDefaultMeetingPage(): PageLayout {
  return addPiece(withDefaultPieces(emptyPageLayout(), 'meeting'), 'related');
}

/** The standard Home page (docs/dev/history/technical-design-home-notebooks.md §3.2): Title (a heading), Scope, Goals. */
export function createDefaultHomePage(): PageLayout {
  return withDefaultPieces(emptyPageLayout(), 'home');
}

/** The Default a fresh install starts with: the standard Meeting, First and Home pages; no Todo page (blank); no tracking; own notes. */
export function seedNoteSetupDefaults(): NoteSetupDefaults {
  return {
    pages: {
      meeting: createDefaultMeetingPage(),
      first: withDefaultPieces(emptyPageLayout(), 'first'),
      home: createDefaultHomePage(),
    },
    tracking: {...NO_TRACKING},
    notebook: null,
  };
}
