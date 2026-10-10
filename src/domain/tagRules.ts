/**
 * Note creation templates (docs/dev/history/technical-design-note-templates.md).
 *
 * A small, user-editable catalog of "note creation definitions" - context
 * (Project/Area/Todo/Meeting) + optional tag match + a MyStyle background +
 * an ordered set of content pieces, each positioned and sized independently -
 * that every note-creation path in the app resolves against instead of each
 * hardcoding its own template logic. This file is pure domain: zero RN/SDK
 * imports (design-overview.md §3), so it's usable from both `screens/` and a
 * plain Node script for verification.
 *
 * Meeting and Todo note creation read these rules through `resolveNoteTemplate`
 * and `renderPieceText` (storage/meetingNoteContent.ts's refreshMeetingNoteBlock
 * and refreshTodoNoteBlock). `migrateTagRuleDefaults` seeds one
 * "Meeting (default)" definition when the list is empty, so meeting notes get
 * title+date+related content out of the box (§7). Todos get no seeded default.
 *
 * Each rule owns a `texts` list (`NoteTextItem`); the Add-piece page places
 * each piece/text at most once, and a placed text piece points at its text by
 * `textId` (see the "Once-only placement" helpers near `setPieceStep`, §6.1).
 *
 * A Meeting/Todo rule can target a shared `.note` file (one page per item,
 * located by keyword) instead of its own file per item - `noteTarget`/
 * `sharedFileName`/`sharedFileFolder` below, plus `effectiveNoteTarget`/
 * `resolvedSharedFileName`/`resolvedSharedFileFolder`
 * (docs/dev/history/technical-design-shared-note-pages.md §2.1/§12). The anchor
 * encoding, keyword derivation and chronological-insertion math live in
 * `domain/sharedNotePages.ts`, so this file need not import `Task`/`Meeting`
 * tag-stripping logic.
 */
import {formatDayHeader, formatHeadingDate, formatTime} from './dateFormat';
// Type-only import (erased at compile time, so this doesn't create a real
// runtime circular dependency even though domain/settings.ts imports
// TagRule back from this file) - migrateTagRuleDefaults
// below is the one function here that needs the whole settings shape.
import type {GtdParaSettings} from './settings';
import type {Task} from './types';
import {renderSinceLast, SinceLast} from './sinceLastText';

export type NoteContext = 'project' | 'area' | 'todo' | 'meeting';
/**
 * `link` (docs/dev/history/technical-design-linked-file-piece.md): a tappable
 * Supernote link element to the item's own `linkedFile` (the paperclip
 * attachment) - Todo/Meeting only. A rule without a `link` piece writes no
 * link at all.
 */
/**
 * `sinceLast` (docs/dev/history/technical-design-tending-threads.md §3.11):
 * Meeting only, never in a rule's defaults - a printed snapshot of the thread
 * overview for the meeting's first thread tag since the previous meeting of
 * that thread (domain/sinceLastText.ts, storage/sinceLast.ts).
 */
/**
 * `dateTitle` (docs/dev/history/technical-design-projects-findable-notes.md
 * §2.1 R2): Meeting only - `30.9.2026 · Retro demand retro/demand`, the date
 * with the year and the display title with its tags as words (no `#`). A
 * heading unless switched off.
 */
export type PieceType = 'title' | 'date' | 'time' | 'text' | 'related' | 'link' | 'sinceLast' | 'dateTitle';

/**
 * Where a Meeting/Todo definition's note content ends up (
 * docs/dev/history/technical-design-shared-note-pages.md §2.1) - 'own' is one file per item, 'shared'
 * files it as a page in one shared `.note` per Project/Area, located by
 * keyword. Project/Area definitions never read this (§9 of the design doc:
 * there's no single natural shared file for a Project/Area's own standalone
 * note).
 */
export type NoteTarget = 'own' | 'shared';

/** Where a shared-target note's file lives: the item's existing Meetings/Todos subfolder (default, matches own-note notes' current location), or the Project/Area's own root. */
export type SharedNoteFolder = 'subfolder' | 'root';

export interface NotePiece {
  type: PieceType;
  /**
   * Only meaningful for type === 'text' - the user's own text, verbatim. When
   * `textId` is set this is a denormalized copy of that `NoteTextItem`'s text,
   * kept in sync by `updateTextItem` below, so the render path
   * (`renderPieceText`) never has to look anything up.
   */
  text?: string;
  /** Only for type === 'text': which of the owning definition's `texts` this piece places. Absent on pieces saved before rule-owned texts existed - `migrateLegacyTextPieces` gives those one when their rule is opened for editing. */
  textId?: string;
  x: number;
  y: number;
  fontSize: number;
  /** Last nudge-step (5 or 25) used on this piece in the Settings UI - UI memory only, never read by rendering. */
  step: number;
  /**
   * Maximum textbox width in device px for THIS piece
   * (docs/dev/history/technical-design-textbox-metrics.md) - per piece, not per
   * definition. Read through `pieceMaxWidthPx` below, never compared to
   * `undefined` directly; absent resolves to `DEFAULT_MAX_PIECE_WIDTH_PX`. The
   * written textbox width is never wider than this AND never wider than
   * `pieceWidthPx(x)` (the page-edge ceiling) - see storage/
   * notePieceMetrics.ts's `measureNotePieceRect`.
   */
  maxWidthPx?: number;
  /**
   * Whether this piece is also written as a Supernote title element (a
   * heading in the note's table of contents) - docs/dev/history/
   * technical-design-projects-findable-notes.md §2.1 R1/R3. Absent = the
   * type's default (on for `dateTitle`, off otherwise), so rules saved
   * before the switch existed don't change. Read through `pieceIsHeading`,
   * never directly.
   */
  heading?: boolean;
}

/**
 * A reusable static text that belongs to exactly ONE rule, listed on the
 * Add-piece page next to the predefined pieces. A piece of type 'text' places
 * one of these by `textId`; each text can be placed at most once per rule.
 * Editing the text updates the placed piece in place (`updateTextItem`), so
 * its position/font never need redoing.
 */
export interface NoteTextItem {
  id: string;
  /** Shown as the row label on the Add-piece page. */
  name: string;
  text: string;
}

export interface TagRule {
  id: string;
  name: string;
  context: NoteContext;
  /** Empty = never matched by tag; only reachable via isDefault. */
  tags: string[];
  isDefault: boolean;
  enabled: boolean;
  /** '' = blank (style_white); else a MYSTYLE_FOLDER filename, same convention storage/noteLinks.ts's getNoteTemplate already uses. */
  template: string;
  pieces: NotePiece[];
  /** This rule's own reusable static texts (see NoteTextItem). Optional so rules saved before this existed need no migration (absent === none) - read through `ruleTexts`. */
  texts?: NoteTextItem[];
  /**
   * Meeting context only (docs/dev/history/technical-design-meeting-tracking.md): meetings
   * this definition resolves for track "prepare before" / "review after" as a
   * checkpoint - see domain/meetingTracking.ts. Optional so settings saved
   * before this existed need no migration (absent === false). Read off the
   * SAME definition resolveNoteTemplate picks for the note, never resolved
   * separately - one rule per meeting decides both its note and its tracking.
   */
  trackPrep?: boolean;
  trackReview?: boolean;
  /**
   * Meeting/Todo context only (see NoteTarget's doc comment). Optional so
   * rules saved before this existed need no migration - absent reads as
   * 'own' everywhere via `effectiveNoteTarget` below, never compared
   * directly.
   */
  noteTarget?: NoteTarget;
  /** Only meaningful when noteTarget === 'shared'. Blank/absent falls back to the rule's own `name` - see `resolvedSharedFileName`. */
  sharedFileName?: string;
  /** Only meaningful when noteTarget === 'shared'. Absent reads as 'subfolder' via `resolvedSharedFileFolder`. */
  sharedFileFolder?: SharedNoteFolder;
}

/** Which note contexts each piece type is meaningful for - drives the Add-piece list in the Settings UI (todo/meeting-only pieces filtered out for Project/Area, same shape abbreviation/quick-file matching already filters by context elsewhere in this codebase). `related` carries no per-piece tag override - it always matches by whichever tags the note being created actually has (see storage/meetingNoteAggregate.ts's relatedItemsFor), so it can never drift out of sync with the note's own tags. */
export const PIECE_CONTEXTS: Record<PieceType, NoteContext[]> = {
  title: ['project', 'area', 'todo', 'meeting'],
  date: ['meeting'],
  time: ['meeting'],
  text: ['project', 'area', 'todo', 'meeting'],
  related: ['todo', 'meeting'],
  link: ['todo', 'meeting'],
  sinceLast: ['meeting'],
  dateTitle: ['meeting'],
};

/**
 * The pieces a freshly created rule starts with, in top-to-bottom order
 * (docs/dev/history/technical-design-projects-findable-notes.md §2.1 R3):
 * a meeting rule Date & title, Time, Linked file; a todo rule Title and
 * Linked file. Project/Area only get Title - Date/Time/Linked file don't
 * exist in those contexts.
 */
export const DEFAULT_PIECE_TYPES: Record<NoteContext, PieceType[]> = {
  meeting: ['dateTitle', 'time', 'link'],
  todo: ['title', 'link'],
  project: ['title'],
  area: ['title'],
};

/** Default pieces seeded with the Heading switch set on explicitly (a todo's heading is its Title, §2.1 R3). */
const DEFAULT_HEADING_PIECES: Partial<Record<NoteContext, PieceType[]>> = {todo: ['title']};

/** Adds `DEFAULT_PIECE_TYPES[definition.context]` to `definition`, stacked via addPieceToRule's own seed logic. */
export function withDefaultPieces(definition: TagRule): TagRule {
  const seeded = DEFAULT_PIECE_TYPES[definition.context].reduce((def, type) => addPieceToRule(def, type), definition);
  const headings = DEFAULT_HEADING_PIECES[definition.context] ?? [];
  const start = definition.pieces.length;
  return {
    ...seeded,
    pieces: seeded.pieces.map((p, i) => (i >= start && headings.includes(p.type) ? {...p, heading: true} : p)),
  };
}

/**
 * Whether `piece` is written as a heading (docs/dev/history/
 * technical-design-projects-findable-notes.md §2.1 R1/R3): its own switch,
 * else the type's default - on for `dateTitle`, off otherwise. Never for a
 * `link` piece (a link element can't be a title).
 */
export function pieceIsHeading(piece: Pick<NotePiece, 'type' | 'heading'>): boolean {
  if (piece.type === 'link') return false;
  return piece.heading ?? piece.type === 'dateTitle';
}

/** Sets the Heading switch of `definition.pieces[index]` (the rule editor's toggle). */
export function setPieceHeading(definition: TagRule, index: number, on: boolean): TagRule {
  const pieces = definition.pieces.map((p, i) => (i === index ? {...p, heading: on} : p));
  return {...definition, pieces};
}

/**
 * Whether `definition.pieces` is still exactly the untouched default stack
 * for its own context (types, order and x/y/fontSize/maxWidth as seeded) -
 * Settings uses this on a NEW draft to decide whether switching context may
 * re-seed the defaults for the new context, or must leave the user's own
 * edits alone.
 */
export function hasUntouchedDefaultPieces(definition: TagRule): boolean {
  const seeded = withDefaultPieces({...definition, pieces: []}).pieces;
  if (seeded.length !== definition.pieces.length) return false;
  return seeded.every((p, i) => {
    const q = definition.pieces[i];
    return (
      q.type === p.type &&
      q.x === p.x &&
      q.y === p.y &&
      q.fontSize === p.fontSize &&
      pieceMaxWidthPx(q) === pieceMaxWidthPx(p) &&
      pieceIsHeading(q) === pieceIsHeading(p)
    );
  });
}

/** Supernote A5X page dimensions in device px (design-device-rendering.md). A piece has no stored width - it always extends from its own `x` to the page's right edge. NOTE_PAGE_WIDTH_PX is the one place both the Settings-UI preview and the real element writer get a piece's width from; NOTE_PAGE_HEIGHT_PX exists only for the Settings-UI preview's aspect ratio - nothing here reads it for layout math. */
export const NOTE_PAGE_WIDTH_PX = 1404;
export const NOTE_PAGE_HEIGHT_PX = 1872;

export function pieceWidthPx(x: number): number {
  return Math.max(0, NOTE_PAGE_WIDTH_PX - x);
}

/**
 * Starting position for a brand-new piece. Deliberately not a mirror of
 * `meetingNoteBlockTopX/Y` (60/60) - see technical-design-note-templates.md §7.
 */
export const DEFAULT_PIECE_X = 100;
export const DEFAULT_PIECE_Y = 100;
/** Supernote's own smallest selectable text size on a real note page - looks much better on a note page than this app's small Settings-UI font sizes. */
export const DEFAULT_PIECE_FONT_SIZE = 36;
/** Default nudge-step for a newly added piece, one of ui/NudgePad.tsx's two step sizes (5 or 25). Both steps stay available in the UI; this only decides which one a new piece starts on. */
export const DEFAULT_PIECE_STEP = 25;
/**
 * Default per-piece max width for a newly added piece - half of
 * NOTE_PAGE_WIDTH_PX, computed rather than hardcoded so the two stay in sync
 * if the page dimensions ever change.
 */
export const DEFAULT_MAX_PIECE_WIDTH_PX = Math.round(NOTE_PAGE_WIDTH_PX / 2);
/** Floor for the max-width ± control - a narrower box can't fit most single words at a readable font size. */
export const MIN_PIECE_MAX_WIDTH_PX = 100;

/** `piece.maxWidthPx`, defaulting a pre-existing (un-migrated) piece to DEFAULT_MAX_PIECE_WIDTH_PX - the one place this optional field is read, same "resolver function, never compared to undefined at the call site" convention as `effectiveNoteTarget`/`resolvedSharedFileName` above. */
export function pieceMaxWidthPx(piece: Pick<NotePiece, 'maxWidthPx'>): number {
  return piece.maxWidthPx ?? DEFAULT_MAX_PIECE_WIDTH_PX;
}

/**
 * Where the next piece added to a definition should start. The first piece
 * in an empty definition seeds at DEFAULT_PIECE_X/Y; every piece after that
 * stacks below the lowest existing one at the same x, so pieces don't pile
 * up on top of each other by default - mirrors the UI draft's own `addPiece`
 * helper.
 */
export function nextPieceSeedPosition(pieces: NotePiece[]): {x: number; y: number} {
  if (pieces.length === 0) {
    return {x: DEFAULT_PIECE_X, y: DEFAULT_PIECE_Y};
  }
  const lowest = pieces.reduce((acc, p) => (p.y > acc.y ? p : acc), pieces[0]);
  // A generous fixed gap rather than measuring the lowest piece's real
  // rendered height - this only decides where a *new* piece starts, which
  // the user can always nudge afterward, so it doesn't need to be exact.
  const stackGap = Math.round(lowest.fontSize * 1.5) + 10;
  return {x: lowest.x, y: lowest.y + stackGap};
}

export function createEmptyTagRule(id: string, context: NoteContext): TagRule {
  return {
    id,
    name: '',
    context,
    tags: [],
    isDefault: false,
    enabled: true,
    template: '',
    pieces: [],
    trackPrep: false,
    trackReview: false,
    noteTarget: 'own',
  };
}

/** `definition.noteTarget`, defaulting a pre-existing (un-migrated) rule to 'own' - the one place this optional field is read, so no call site compares it to `undefined` directly. */
export function effectiveNoteTarget(definition: Pick<TagRule, 'noteTarget'>): NoteTarget {
  return definition.noteTarget ?? 'own';
}

/** The shared file's base name (no folder, no ".note" extension) - the rule's own `sharedFileName` when set, else its `name`. Only meaningful when `effectiveNoteTarget(definition) === 'shared'`. */
export function resolvedSharedFileName(definition: Pick<TagRule, 'name' | 'sharedFileName'>): string {
  const explicit = definition.sharedFileName?.trim();
  return explicit ? explicit : definition.name;
}

/** `definition.sharedFileFolder`, defaulting to 'subfolder' (the Meetings/Todos location) when unset. */
export function resolvedSharedFileFolder(definition: Pick<TagRule, 'sharedFileFolder'>): SharedNoteFolder {
  return definition.sharedFileFolder ?? 'subfolder';
}

export function addPieceToRule(
  definition: TagRule,
  type: PieceType,
  text?: string,
  textId?: string,
): TagRule {
  const {x, y} = nextPieceSeedPosition(definition.pieces);
  const piece: NotePiece = {
    type,
    ...(type === 'text' ? {text: text ?? '', ...(textId !== undefined ? {textId} : {})} : {}),
    x,
    y,
    fontSize: DEFAULT_PIECE_FONT_SIZE,
    step: DEFAULT_PIECE_STEP,
    maxWidthPx: DEFAULT_MAX_PIECE_WIDTH_PX,
  };
  return {...definition, pieces: [...definition.pieces, piece]};
}

export function removePieceFromRule(definition: TagRule, index: number): TagRule {
  return {...definition, pieces: definition.pieces.filter((_, i) => i !== index)};
}

/** Moves a piece by `dx`/`dy` (device px - typically ±5 or ±25, the two nudge steps from the UI draft), clamped so it can't be nudged off the top/left of the page. */
export function nudgePieceAt(definition: TagRule, index: number, dx: number, dy: number): TagRule {
  const pieces = definition.pieces.map((p, i) =>
    i === index ? {...p, x: Math.max(0, p.x + dx), y: Math.max(0, p.y + dy)} : p,
  );
  return {...definition, pieces};
}

export function setPieceFontSize(definition: TagRule, index: number, fontSize: number): TagRule {
  const clamped = Math.max(8, Math.round(fontSize));
  const pieces = definition.pieces.map((p, i) => (i === index ? {...p, fontSize: clamped} : p));
  return {...definition, pieces};
}

export function setPieceStep(definition: TagRule, index: number, step: number): TagRule {
  const pieces = definition.pieces.map((p, i) => (i === index ? {...p, step} : p));
  return {...definition, pieces};
}

/** Absolute setter for a piece's max width, clamped to MIN_PIECE_MAX_WIDTH_PX - same shape as setPieceFontSize above; the ±25 buttons in ui/NudgePad.tsx call this with `pieceMaxWidthPx(piece) + delta`, same "resolve current, add delta, clamp" pattern Settings.tsx's handleFontDeltaSelectedPiece already uses for font size. No upper clamp - a cap wider than pieceWidthPx(x) is harmless (storage/notePieceMetrics.ts's measureNotePieceRect already takes the min of the two), and leaving it uncapped here means the ceiling doesn't silently change if x is nudged afterward. */
export function setPieceMaxWidth(definition: TagRule, index: number, maxWidthPx: number): TagRule {
  const clamped = Math.max(MIN_PIECE_MAX_WIDTH_PX, Math.round(maxWidthPx));
  const pieces = definition.pieces.map((p, i) => (i === index ? {...p, maxWidthPx: clamped} : p));
  return {...definition, pieces};
}

// ---- Once-only placement + rule-owned static texts ------------------------
// The Add-piece page's model (docs/dev/history/technical-design-note-templates.md §6.1):
// every piece can be placed at most once per rule - Title/Date/Time/Related
// by type, a static text by its `textId` - and a placed piece shows "Remove"
// instead of "+ Add". Removing a text piece only takes it out of the rule;
// the `NoteTextItem` stays in the rule's list until explicitly deleted.

export function ruleTexts(definition: TagRule): NoteTextItem[] {
  return definition.texts ?? [];
}

/** Index of the (first) piece that is this placement, or -1 - `textId` only matters for type 'text'. Rules saved before the once-only model can hold duplicates of a type; this finds the first one, so "Remove" peels them off one at a time. */
export function findPlacedPieceIndex(definition: TagRule, type: PieceType, textId?: string): number {
  return definition.pieces.findIndex(p => p.type === type && (type !== 'text' || p.textId === textId));
}

export function isPiecePlaced(definition: TagRule, type: PieceType, textId?: string): boolean {
  return findPlacedPieceIndex(definition, type, textId) >= 0;
}

/** Removes the (first) matching placement - a no-op when there isn't one. Never touches `texts`. */
export function removePlacedPiece(definition: TagRule, type: PieceType, textId?: string): TagRule {
  const index = findPlacedPieceIndex(definition, type, textId);
  return index < 0 ? definition : removePieceFromRule(definition, index);
}

/** Next free text id for this rule's own list - simple counter over the existing ids ("t1", "t2", ...), same not-a-UUID convention as `TagRule.id`. Ids are only meaningful inside one rule. */
export function nextTextItemId(texts: NoteTextItem[]): string {
  let max = 0;
  for (const t of texts) {
    const n = Number(t.id.replace(/^t/, ''));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `t${max + 1}`;
}

/** Adds a text to the rule's list (NOT placed on the page - placing is a separate "+ Add"). Returns the new id alongside the updated definition so the caller can select it. */
export function addTextItem(
  definition: TagRule,
  name: string,
  text: string,
): {definition: TagRule; id: string} {
  const texts = ruleTexts(definition);
  const id = nextTextItemId(texts);
  return {definition: {...definition, texts: [...texts, {id, name, text}]}, id};
}

/** Saves a text's new name/text AND updates the denormalized `text` on its placed piece (if any) - position, font size and step stay exactly as they were, which is the whole point of placing by reference. */
export function updateTextItem(
  definition: TagRule,
  id: string,
  name: string,
  text: string,
): TagRule {
  const texts = ruleTexts(definition).map(t => (t.id === id ? {...t, name, text} : t));
  const pieces = definition.pieces.map(p => (p.type === 'text' && p.textId === id ? {...p, text} : p));
  return {...definition, texts, pieces};
}

/** Deletes a text from the rule's list and removes its placed piece too (the caller asks for confirmation first when it is placed). */
export function removeTextItem(definition: TagRule, id: string): TagRule {
  return {
    ...definition,
    texts: ruleTexts(definition).filter(t => t.id !== id),
    pieces: definition.pieces.filter(p => !(p.type === 'text' && p.textId === id)),
  };
}

/** Row label for a text created from a legacy inline text piece: its first line, shortened; 'Text' when empty. */
function legacyTextName(text: string): string {
  const firstLine = text.trim().split('\n')[0].trim();
  if (!firstLine) return 'Text';
  return firstLine.length > 24 ? `${firstLine.slice(0, 24).trimEnd()}…` : firstLine;
}

/**
 * One-time per-rule migration, run when a rule is opened for editing (not at
 * settings load - nothing needs it before then, since `piece.text` is what
 * rendering reads either way): every text piece without a `textId` (i.e.
 * saved before rule-owned texts existed) gets its own `NoteTextItem`, named
 * from its first words, keeping its position/font. Returns the SAME object
 * when there is nothing to migrate, so a caller can cheaply tell.
 */
export function migrateLegacyTextPieces(definition: TagRule): TagRule {
  if (!definition.pieces.some(p => p.type === 'text' && !p.textId)) return definition;
  const texts = [...ruleTexts(definition)];
  const pieces = definition.pieces.map(p => {
    if (p.type !== 'text' || p.textId) return p;
    const text = p.text ?? '';
    const id = nextTextItemId(texts);
    texts.push({id, name: legacyTextName(text), text});
    return {...p, textId: id};
  });
  return {...definition, texts, pieces};
}

/**
 * First enabled, tagged definition (in list order - list order doubles as
 * priority, same "first match wins" rule as domain/abbrev.ts's quick-file)
 * one of whose tags matches one of the note's own tags (directly, or as a
 * parent of a nested tag - see tagMatchesRuleTag); otherwise the context's
 * Default; otherwise `null`. This is also THE rule lookup for a meeting's
 * prep/review tracking (domain/meetingTracking.ts) - one resolved definition
 * per item supplies both its note layout and its tracking flags. Every caller
 * treats `null` as "blank template, no pieces".
 *
 * Matching is case-insensitive. Settings.tsx's handleSaveDefinitionDraft
 * already lowercases the config's tags, but this lowercases both sides
 * anyway: the note's own `tags` come from user-entered text that is never
 * normalized, and older saved config data may not be lowercased either.
 */
export function resolveNoteTemplate(
  context: NoteContext,
  tags: string[],
  definitions: TagRule[],
): TagRule | null {
  const inContext = definitions.filter(d => d.enabled && d.context === context);
  const tagsLower = tags.map(t => t.toLowerCase());
  for (const d of inContext) {
    const dTagsLower = d.tags.map(t => t.toLowerCase());
    if (dTagsLower.length > 0 && dTagsLower.some(ruleTag => tagsLower.some(tag => tagMatchesRuleTag(tag, ruleTag)))) {
      return d;
    }
  }
  return inContext.find(d => d.isDefault) ?? null;
}

/**
 * Whether an item's tag matches a Tag Rule's tag (docs/dev/technical-design-
 * split-by-tag.md §3.2): the tag itself, or a tag nested under it - a rule on
 * `coaching` matches `coaching` and `coaching/sabina`, never `coachingx`, and a
 * rule on `coaching/sabina` never matches plain `coaching` (matching only goes
 * from parent to child). Both sides are expected lowercased; callers already
 * lowercase (see resolveNoteTemplate above).
 */
export function tagMatchesRuleTag(itemTag: string, ruleTag: string): boolean {
  return itemTag === ruleTag || itemTag.startsWith(`${ruleTag}/`);
}

/**
 * The part of the first item tag nested under any of `ruleTags`, with that
 * rule-tag prefix removed (technical-design-split-by-tag.md §3.2) -
 * `['coaching/sabina']` under rule `coaching` gives `"sabina"`; deeper nesting
 * keeps the rest (`coaching/sabina/2026` -> `"sabina/2026"`). Item tags are
 * scanned in their own order (text order, as extracted), so the first nested
 * tag wins. Lowercased; `""` when no item tag is nested under a rule tag
 * (including when the item only carries the plain rule tag).
 */
export function ruleSubtag(itemTags: string[], ruleTags: string[]): string {
  const rulesLower = ruleTags.map(t => t.toLowerCase()).filter(Boolean);
  for (const raw of itemTags) {
    const tag = raw.toLowerCase();
    for (const ruleTag of rulesLower) {
      if (tag.startsWith(`${ruleTag}/`)) return tag.slice(ruleTag.length + 1);
    }
  }
  return '';
}

/**
 * The rule tag the item matched (docs/dev/history/technical-design-tending-threads.md
 * §3.8) - the `{tag}` of a shared file name, so one rule on `sparring` and
 * `retro` names its files `sparring max 2026` and `retro alpha 2026`. The
 * first item tag (text order) that is a rule tag or nested under one wins;
 * lowercased; `""` when none matches.
 */
export function ruleTypeTag(itemTags: string[], ruleTags: string[]): string {
  const rulesLower = ruleTags.map(t => t.toLowerCase()).filter(Boolean);
  for (const raw of itemTags) {
    const tag = raw.toLowerCase();
    const rule = rulesLower.find(ruleTag => tagMatchesRuleTag(tag, ruleTag));
    if (rule) return rule;
  }
  return '';
}

/**
 * What renderPieceText needs to turn a `NotePiece` into real text - built
 * once per note-creation/refresh call from whatever the caller already has
 * (a Meeting, a Task, an item name), not stored anywhere. `date`/`time` are
 * meeting-only sources (see PIECE_CONTEXTS) - a caller rendering pieces for
 * a Project/Area/Todo definition simply never sets them, and a `date`/`time`
 * piece type is filtered out of those contexts' Add-piece list in the first
 * place, so this isn't relied on as the only guard.
 */
export interface PieceRenderContext {
  /** The note's own title - a Meeting's title, a Task's text, or a Project/Area's name, depending on context. */
  title: string;
  /** Meeting only - ISO date (Meeting.date), formatted here (domain/dateFormat.ts), not by the caller. */
  date?: string;
  /** Meeting only - HH:mm 24h, or unset/empty for a date-only meeting. Rendered verbatim (already the display format Meeting.time is stored in), unlike `date`. */
  time?: string;
  /** From a generalized relatedItemsFor(...) call (storage/meetingNoteAggregate.ts) - already filtered/matched by the caller; renderPieceText only formats what it's given. */
  relatedItems?: Array<{text: string}>;
  /** Meeting only - the "Since last time" snapshot (storage/sinceLast.ts), built only when the rule places the piece. */
  sinceLast?: SinceLast | null;
  /** Meeting only - the `dateTitle` piece's text, `30.9.2026 · Retro demand`, built by the caller with `dateTitleText` from the meeting's date and its display title with tags as words (domain/markdown.ts's `tagsAsWords`). */
  dateTitle?: string;
  /** Todo/Meeting only - bare file name of the item's `linkedFile`, set by the caller ONLY when that file actually exists (missing file -> unset -> the `link` piece is skipped, docs/dev/history/technical-design-linked-file-piece.md §1.4). */
  linkedFileName?: string;
}

/** The visible text of a `link` piece's link element - "Link: <file name>". */
export function linkPieceText(fileName: string): string {
  return `Link: ${fileName}`;
}

/**
 * Turns one `NotePiece` into the text its element should contain (docs/
 * technical-design-note-templates.md §4's table) - pure, context-agnostic:
 * every context-specific decision (which tags matched, what the title is)
 * already happened before this is called, building `ctx`. Returns `''` for
 * a piece with nothing to show (an unset `time`, a `related` piece with no
 * matches) rather than a placeholder - the caller (storage/
 * meetingNoteContent.ts's populateNoteFromRule) skips creating an
 * element at all for an empty piece, the "omit rather than show empty" convention.
 */
export function renderPieceText(piece: NotePiece, ctx: PieceRenderContext): string {
  switch (piece.type) {
    case 'title':
      return ctx.title;
    case 'date':
      return ctx.date ? formatDayHeader(ctx.date) : '';
    case 'time':
      return ctx.time ? formatTime(ctx.time) : '';
    case 'text':
      return piece.text ?? '';
    case 'related': {
      const items = ctx.relatedItems ?? [];
      if (items.length === 0) return '';
      return ['Relevant Todos:', ...items.map(item => `- ${item.text}`)].join('\n');
    }
    case 'link':
      return ctx.linkedFileName ? linkPieceText(ctx.linkedFileName) : '';
    case 'sinceLast':
      return renderSinceLast(ctx.sinceLast);
    case 'dateTitle':
      return ctx.dateTitle ?? '';
    default:
      return '';
  }
}

/** The text of a meeting's `dateTitle` piece: `30.9.2026 · Retro demand` - the date always with its year, the title as given (callers pass it with tags as words, `tagsAsWords`). */
export function dateTitleText(date: string, title: string): string {
  const shown = date ? formatHeadingDate(date) : '';
  return [shown, title.trim()].filter(Boolean).join(' · ');
}

/**
 * Seeds the one "Meeting (default)" definition (date & title + time + link + related items,
 * at the standard 100/100 seed - NOT meetingNoteBlockTopX/Y (60/60), a
 * deliberate choice, see technical-design-note-templates.md §7). Built via
 * addPieceToRule so the pieces stack automatically using its own
 * nextPieceSeedPosition logic. `template` starts blank, same as any other
 * new definition.
 */
export function createDefaultMeetingRule(id: string): TagRule {
  // The standard Meeting defaults (Date & title, Time, Linked file) plus Related items at the bottom,
  // so this seeded rule also carries the related-todos content.
  let def = createEmptyTagRule(id, 'meeting');
  def = {...def, name: 'Meeting (default)', isDefault: true};
  def = withDefaultPieces(def);
  def = addPieceToRule(def, 'related');
  return def;
}

/**
 * Ensures `settings.tagRules` has at least the one seeded default (§7) - a
 * no-op (returns the SAME object reference) once it's non-empty, so a caller
 * can cheaply tell "did this seed anything" via `result !== settings` and only
 * persist when it did (storage/settingsStorage.ts's loadSettings). Keyed on
 * "list is empty", not a one-shot migration flag: simpler, and idempotent -
 * if the user deletes every definition, this seeds a fresh default again.
 * That matters because there is no fixed fallback layout - a Meeting with no
 * matching rule gets no content (docs/dev/history/technical-design-linked-file-piece.md §4).
 */
/**
 * Whether a Todo's note should stop being auto-*re*populated on open
 * (storage/meetingNoteContent.ts's `refreshTodoNoteBlock`) - true once the
 * task is done or cancelled, the same way isMeetingAutoUpdateFrozen treats a
 * cancelled meeting. Never gates *creation*: initial population always
 * happens, only the re-populate-on-open path freezes; callers pass an
 * explicit bypass for the creation path.
 */
export function isTodoAutoUpdateFrozen(task: Pick<Task, 'done' | 'cancelled'>): boolean {
  return task.done || task.cancelled;
}

export function migrateTagRuleDefaults(settings: GtdParaSettings): GtdParaSettings {
  if (settings.tagRules.length > 0) return settings;
  const id = String(settings.nextTagRuleId);
  const definition = createDefaultMeetingRule(id);
  return {
    ...settings,
    tagRules: [definition],
    nextTagRuleId: settings.nextTagRuleId + 1,
  };
}
