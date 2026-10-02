/**
 * Note creation templates (docs/dev/technical-design-note-templates.md).
 *
 * A small, user-editable catalog of "note creation definitions" - context
 * (Project/Area/Todo/Meeting) + optional tag match + a MyStyle background +
 * an ordered set of content pieces, each positioned and sized independently -
 * that every note-creation path in the app resolves against instead of each
 * hardcoding its own template logic. This file is pure domain: zero RN/SDK
 * imports (design-overview.md §3), so it's usable from both `screens/` and a
 * plain Node script for verification.
 *
 * Phase 1 (technical-design-note-templates.md §7): this module, plus the
 * `GtdParaSettings` fields that hold the catalog, plus the Settings UI that
 * edits it - inert, nothing yet read `noteCreationDefinitions` at
 * note-creation time.
 *
 * Phase 2 (2026-09-18, §4/§5/§7): `renderPieceText` below + `resolveNoteTemplate`
 * are now wired into meeting-note creation via
 * storage/meetingNoteContent.ts's refreshMeetingNoteBlock. `createDefaultMeetingDefinition`/
 * `migrateNoteTemplateDefaults` are the Phase 2 migration (§7): the first
 * time settings load with an empty `noteCreationDefinitions` list, one
 * "Meeting (default)" definition is seeded so meeting notes keep getting
 * title+date+related content out of the box, same as before this feature
 * existed, just now as real, editable definition data instead of hardcoded
 * logic.
 *
 * Phase 3 (2026-09-18, same day - Todo notes, the feature's last piece for
 * now): the same `resolveNoteTemplate`/`renderPieceText`/
 * `populateNoteFromDefinition` machinery is now wired into Todo-note
 * creation too, via storage/meetingNoteContent.ts's new
 * `refreshTodoNoteBlock` - no new domain functions needed there, since
 * `PieceRenderContext`/`renderPieceText` were already context-agnostic
 * (only `date`/`time` pieces are meeting-only, per `PIECE_CONTEXTS`, and a
 * Todo definition's Add-piece list already excludes those). This phase adds
 * `isTodoAutoUpdateFrozen` below (the Todo counterpart to domain/
 * meetingTime.ts's `isMeetingAutoUpdateFrozen`) and removes the legacy
 * global `meetingNoteTemplate` setting entirely (see domain/settings.ts) -
 * `createDefaultMeetingDefinition` no longer takes a `template` param as a
 * result. No auto-seeded default Todo definition is added (unlike Meeting's
 * migration) - Todos have no legacy single-template setting to carry
 * forward, so the list simply starts empty for that context, same as
 * Project/Area always have.
 *
 * Rule-owned static texts + once-only placement (2026-09-20, §6.1): a rule
 * now carries its own `texts` list (`NoteTextItem`), the Add-piece page
 * places each piece/text at most once, and a placed text piece points at its
 * text by `textId` (see the "Once-only placement" helpers near
 * `setPieceStep` below). Rendering is untouched - `piece.text` stays the
 * source `renderPieceText` reads, kept in sync by `updateTextItem`.
 *
 * Shared Note Pages, Slice 1 of 4 (2026-09-22,
 * docs/dev/technical-design-shared-note-pages.md §2.1/§12): a Meeting/Todo rule
 * can now target a shared `.note` file (one page per item, located by
 * keyword) instead of its own file per item - `noteTarget`/`sharedFileName`/
 * `sharedFileFolder` below, plus `effectiveNoteTarget`/
 * `resolvedSharedFileName`/`resolvedSharedFileFolder`. The anchor encoding
 * (`notePath` as `"relativePath#keyword"`), keyword derivation and
 * chronological-insertion math live in the sibling `domain/
 * sharedNotePages.ts` (kept separate so this file doesn't have to import
 * `Task`/`Meeting`-specific tag-stripping logic it otherwise has no reason
 * to need). Nothing here is wired into note creation yet - purely additive,
 * same "inert until a later slice" posture Phase 1 of this file's own
 * feature used.
 */
import {formatFullDate} from './meetingTime';
// Type-only import (erased at compile time, so this doesn't create a real
// runtime circular dependency even though domain/settings.ts imports
// NoteCreationDefinition back from this file) - migrateNoteTemplateDefaults
// below is the one function here that needs the whole settings shape.
import type {GtdParaSettings} from './settings';
import type {Task} from './types';

export type NoteContext = 'project' | 'area' | 'todo' | 'meeting';
/**
 * `link` (2026-09-25, docs/dev/technical-design-linked-file-piece.md): a tappable
 * Supernote link element to the item's own `linkedFile` (the paperclip
 * attachment) - Todo/Meeting only. Replaces the old always-auto-appended
 * "Link:" element: a rule without a `link` piece writes no link at all.
 */
export type PieceType = 'title' | 'date' | 'time' | 'text' | 'related' | 'link';

/**
 * Where a Meeting/Todo definition's note content ends up (docs/technical-
 * design-shared-note-pages.md §2.1) - 'own' is today's one-file-per-item
 * behavior (unchanged), 'shared' files it as a page in one shared `.note`
 * per Project/Area instead, located by keyword. Project/Area definitions
 * never read this - shared targets are Meeting/Todo only (§9 of the design
 * doc: there's no single natural shared file for a Project/Area's own
 * standalone note).
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
   * Maximum textbox width in device px for THIS piece (2026-09-23,
   * docs/dev/technical-design-textbox-metrics.md - Tilman: "each piece should
   * have its own length cap, separately stored for each definition" -
   * per-PIECE, not per-definition, despite the "definition" wording of the
   * question it answered). Read through `pieceMaxWidthPx` below, never
   * compared to `undefined` directly - absent on any piece saved before this
   * field existed, which resolves to `DEFAULT_MAX_PIECE_WIDTH_PX`, same
   * absent-is-a-default convention as `texts`/`noteTarget` above. The actual
   * written textbox width is never wider than this AND never wider than
   * `pieceWidthPx(x)` (the page-edge ceiling) - see storage/
   * notePieceMetrics.ts's `measureNotePieceRect`.
   */
  maxWidthPx?: number;
}

/**
 * A reusable static text that belongs to exactly ONE rule (Tilman,
 * 2026-09-20: "I don't imagine saved texts to be used across different
 * rules"), listed on the Add-piece page next to the predefined pieces. A
 * piece of type 'text' places one of these by `textId`; each text can be
 * placed at most once per rule. Editing the text updates the placed piece in
 * place (`updateTextItem`), so its position/font never need redoing.
 */
export interface NoteTextItem {
  id: string;
  /** Shown as the row label on the Add-piece page. */
  name: string;
  text: string;
}

export interface NoteCreationDefinition {
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
  /** This rule's own reusable static texts (see NoteTextItem). Optional so rules saved before this existed need no migration (absent === none) - read through `definitionTexts`. */
  texts?: NoteTextItem[];
  /**
   * Meeting context only (docs/dev/technical-design-meeting-tracking.md): meetings
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
};

/**
 * The pieces a freshly created rule starts with, in top-to-bottom order
 * (docs/dev/technical-design-linked-file-piece.md §4.1 - Tilman, 2026-09-25:
 * "title, link, and for meetings date and time as default elements present
 * one below the other", ordered Title, Date, Time, Link). Project/Area only
 * get Title - Date/Time/Linked file don't exist in those contexts.
 */
export const DEFAULT_PIECE_TYPES: Record<NoteContext, PieceType[]> = {
  meeting: ['title', 'date', 'time', 'link'],
  todo: ['title', 'link'],
  project: ['title'],
  area: ['title'],
};

/** Adds `DEFAULT_PIECE_TYPES[definition.context]` to `definition`, stacked via addPieceToDefinition's own seed logic. */
export function withDefaultPieces(definition: NoteCreationDefinition): NoteCreationDefinition {
  return DEFAULT_PIECE_TYPES[definition.context].reduce((def, type) => addPieceToDefinition(def, type), definition);
}

/**
 * Whether `definition.pieces` is still exactly the untouched default stack
 * for its own context (types, order and x/y/fontSize/maxWidth as seeded) -
 * Settings uses this on a NEW draft to decide whether switching context may
 * re-seed the defaults for the new context, or must leave the user's own
 * edits alone.
 */
export function hasUntouchedDefaultPieces(definition: NoteCreationDefinition): boolean {
  const seeded = withDefaultPieces({...definition, pieces: []}).pieces;
  if (seeded.length !== definition.pieces.length) return false;
  return seeded.every((p, i) => {
    const q = definition.pieces[i];
    return (
      q.type === p.type &&
      q.x === p.x &&
      q.y === p.y &&
      q.fontSize === p.fontSize &&
      pieceMaxWidthPx(q) === pieceMaxWidthPx(p)
    );
  });
}

/** Supernote A5X page dimensions in device px (design-device-rendering.md). A piece has no stored width - it always extends from its own `x` to the page's right edge (Tilman, 2026-09-18: "would right now always extend until the right side"). NOTE_PAGE_WIDTH_PX is the one place both the Settings-UI preview and, from Phase 2 on, the real element writer get a piece's width from; NOTE_PAGE_HEIGHT_PX exists alongside it only for the Settings-UI preview's aspect ratio - nothing here reads it for layout math. */
export const NOTE_PAGE_WIDTH_PX = 1404;
export const NOTE_PAGE_HEIGHT_PX = 1872;

export function pieceWidthPx(x: number): number {
  return Math.max(0, NOTE_PAGE_WIDTH_PX - x);
}

/**
 * Starting position for a brand-new piece (Tilman, 2026-09-18: "use 100/100
 * as starting seed for position"). Deliberately not a mirror of today's
 * `meetingNoteBlockTopX/Y` (60/60) - see the Phase 2 migration note in
 * technical-design-note-templates.md §7.
 */
export const DEFAULT_PIECE_X = 100;
export const DEFAULT_PIECE_Y = 100;
/** Supernote's own smallest selectable text size on a real note page (Tilman, 2026-09-18: "set the default size for text to 36, this is the default smallest size on supernote notes and looks much better") - was 17 (a mirror of ui/theme.ts's FONT.medium, tuned for this app's own small Settings-UI text, not for how a note page itself reads). */
export const DEFAULT_PIECE_FONT_SIZE = 36;
/** Default nudge-step for a newly added piece, one of ui/NudgePad.tsx's own two step sizes (5 or 25) - was 5 (Tilman, 2026-09-18: "set default moving speed to 25 instead of 5"). Both steps stay available in the UI either way; this only decides which one a new piece starts on. */
export const DEFAULT_PIECE_STEP = 25;
/**
 * Default per-piece max width for a newly added piece (2026-09-23, Tilman:
 * "should be half the total screen width as default") - half of
 * NOTE_PAGE_WIDTH_PX, computed rather than hardcoded so the two stay in sync
 * if the page dimensions ever change.
 */
export const DEFAULT_MAX_PIECE_WIDTH_PX = Math.round(NOTE_PAGE_WIDTH_PX / 2);
/** Floor for the max-width ± control (Tilman, 2026-09-23, answering "is a 100px minimum sensible": "yes 100 px min seems good") - a box narrower than this can no longer fit most single words at a readable font size. */
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

export function createEmptyDefinition(id: string, context: NoteContext): NoteCreationDefinition {
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
export function effectiveNoteTarget(definition: Pick<NoteCreationDefinition, 'noteTarget'>): NoteTarget {
  return definition.noteTarget ?? 'own';
}

/** The shared file's base name (no folder, no ".note" extension) - the rule's own `sharedFileName` when set, else its `name` (Tilman, 2026-09-21: "File name: ... default = rule name"). Only meaningful when `effectiveNoteTarget(definition) === 'shared'`. */
export function resolvedSharedFileName(definition: Pick<NoteCreationDefinition, 'name' | 'sharedFileName'>): string {
  const explicit = definition.sharedFileName?.trim();
  return explicit ? explicit : definition.name;
}

/** `definition.sharedFileFolder`, defaulting to 'subfolder' (today's Meetings/Todos location) when unset. */
export function resolvedSharedFileFolder(definition: Pick<NoteCreationDefinition, 'sharedFileFolder'>): SharedNoteFolder {
  return definition.sharedFileFolder ?? 'subfolder';
}

export function addPieceToDefinition(
  definition: NoteCreationDefinition,
  type: PieceType,
  text?: string,
  textId?: string,
): NoteCreationDefinition {
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

export function removePieceFromDefinition(definition: NoteCreationDefinition, index: number): NoteCreationDefinition {
  return {...definition, pieces: definition.pieces.filter((_, i) => i !== index)};
}

/** Moves a piece by `dx`/`dy` (device px - typically ±5 or ±25, the two nudge steps from the UI draft), clamped so it can't be nudged off the top/left of the page. */
export function nudgePieceAt(definition: NoteCreationDefinition, index: number, dx: number, dy: number): NoteCreationDefinition {
  const pieces = definition.pieces.map((p, i) =>
    i === index ? {...p, x: Math.max(0, p.x + dx), y: Math.max(0, p.y + dy)} : p,
  );
  return {...definition, pieces};
}

export function setPieceFontSize(definition: NoteCreationDefinition, index: number, fontSize: number): NoteCreationDefinition {
  const clamped = Math.max(8, Math.round(fontSize));
  const pieces = definition.pieces.map((p, i) => (i === index ? {...p, fontSize: clamped} : p));
  return {...definition, pieces};
}

export function setPieceStep(definition: NoteCreationDefinition, index: number, step: number): NoteCreationDefinition {
  const pieces = definition.pieces.map((p, i) => (i === index ? {...p, step} : p));
  return {...definition, pieces};
}

/** Absolute setter for a piece's max width, clamped to MIN_PIECE_MAX_WIDTH_PX - same shape as setPieceFontSize above; the ±25 buttons in ui/NudgePad.tsx call this with `pieceMaxWidthPx(piece) + delta`, same "resolve current, add delta, clamp" pattern Settings.tsx's handleFontDeltaSelectedPiece already uses for font size. No upper clamp - a cap wider than pieceWidthPx(x) is harmless (storage/notePieceMetrics.ts's measureNotePieceRect already takes the min of the two), and leaving it uncapped here means the ceiling doesn't silently change if x is nudged afterward. */
export function setPieceMaxWidth(definition: NoteCreationDefinition, index: number, maxWidthPx: number): NoteCreationDefinition {
  const clamped = Math.max(MIN_PIECE_MAX_WIDTH_PX, Math.round(maxWidthPx));
  const pieces = definition.pieces.map((p, i) => (i === index ? {...p, maxWidthPx: clamped} : p));
  return {...definition, pieces};
}

// ---- Once-only placement + rule-owned static texts (2026-09-20) ------------
// The Add-piece page's model (docs/dev/technical-design-note-templates.md §6.1):
// every piece can be placed at most once per rule - Title/Date/Time/Related
// by type, a static text by its `textId` - and a placed piece shows "Remove"
// instead of "+ Add". Removing a text piece only takes it out of the rule;
// the `NoteTextItem` stays in the rule's list until explicitly deleted.

export function definitionTexts(definition: NoteCreationDefinition): NoteTextItem[] {
  return definition.texts ?? [];
}

/** Index of the (first) piece that is this placement, or -1 - `textId` only matters for type 'text'. Rules saved before the once-only model can hold duplicates of a type; this finds the first one, so "Remove" peels them off one at a time. */
export function findPlacedPieceIndex(definition: NoteCreationDefinition, type: PieceType, textId?: string): number {
  return definition.pieces.findIndex(p => p.type === type && (type !== 'text' || p.textId === textId));
}

export function isPiecePlaced(definition: NoteCreationDefinition, type: PieceType, textId?: string): boolean {
  return findPlacedPieceIndex(definition, type, textId) >= 0;
}

/** Removes the (first) matching placement - a no-op when there isn't one. Never touches `texts`. */
export function removePlacedPiece(definition: NoteCreationDefinition, type: PieceType, textId?: string): NoteCreationDefinition {
  const index = findPlacedPieceIndex(definition, type, textId);
  return index < 0 ? definition : removePieceFromDefinition(definition, index);
}

/** Next free text id for this rule's own list - simple counter over the existing ids ("t1", "t2", ...), same not-a-UUID convention as `NoteCreationDefinition.id`. Ids are only meaningful inside one rule. */
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
  definition: NoteCreationDefinition,
  name: string,
  text: string,
): {definition: NoteCreationDefinition; id: string} {
  const texts = definitionTexts(definition);
  const id = nextTextItemId(texts);
  return {definition: {...definition, texts: [...texts, {id, name, text}]}, id};
}

/** Saves a text's new name/text AND updates the denormalized `text` on its placed piece (if any) - position, font size and step stay exactly as they were, which is the whole point of placing by reference. */
export function updateTextItem(
  definition: NoteCreationDefinition,
  id: string,
  name: string,
  text: string,
): NoteCreationDefinition {
  const texts = definitionTexts(definition).map(t => (t.id === id ? {...t, name, text} : t));
  const pieces = definition.pieces.map(p => (p.type === 'text' && p.textId === id ? {...p, text} : p));
  return {...definition, texts, pieces};
}

/** Deletes a text from the rule's list and removes its placed piece too (the caller asks for confirmation first when it is placed). */
export function removeTextItem(definition: NoteCreationDefinition, id: string): NoteCreationDefinition {
  return {
    ...definition,
    texts: definitionTexts(definition).filter(t => t.id !== id),
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
export function migrateLegacyTextPieces(definition: NoteCreationDefinition): NoteCreationDefinition {
  if (!definition.pieces.some(p => p.type === 'text' && !p.textId)) return definition;
  const texts = [...definitionTexts(definition)];
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
 * priority, same "first match wins" rule domain/abbrev.ts's quick-file
 * already established) one of whose tags matches one of the note's own tags
 * (directly, or as a parent of a nested tag - see tagMatchesRuleTag); otherwise the
 * context's Default; otherwise `null`. This is also THE rule lookup for a
 * meeting's prep/review tracking (domain/meetingTracking.ts) - one resolved
 * definition per item supplies both its note layout and its tracking flags. Every caller treats `null` as "blank
 * template, no pieces" - today's behavior - so a fresh install with zero
 * definitions configured is unchanged.
 *
 * Matching is case-insensitive (2026-09-18, Tilman: "tags should be
 * normalized to small in the config and be applied case insensitive").
 * `d.tags` is already lowercased at the source - Settings.tsx's
 * handleSaveDefinitionDraft normalizes the config's own tags on save - but
 * this comparison lowercases both sides anyway rather than trusting that:
 * the note's own `tags` (a Meeting's, say) come from user-entered text
 * elsewhere in the app that was never asked to normalize its casing, and
 * defending here means the match is correct regardless of what either side
 * actually stored, including any already-saved config data from before this
 * fix.
 */
export function resolveNoteTemplate(
  context: NoteContext,
  tags: string[],
  definitions: NoteCreationDefinition[],
): NoteCreationDefinition | null {
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
  /** Meeting only - ISO date (Meeting.date), formatted here via formatFullDate, not pre-formatted by the caller ("domain does the formatting" convention). */
  date?: string;
  /** Meeting only - HH:mm 24h, or unset/empty for a date-only meeting. Rendered verbatim (already the display format Meeting.time is stored in), unlike `date`. */
  time?: string;
  /** From a generalized relatedItemsFor(...) call (storage/meetingNoteAggregate.ts) - already filtered/matched by the caller; renderPieceText only formats what it's given. */
  relatedItems?: Array<{text: string}>;
  /** Todo/Meeting only - bare file name of the item's `linkedFile`, set by the caller ONLY when that file actually exists (missing file -> unset -> the `link` piece is skipped, docs/dev/technical-design-linked-file-piece.md §1.4). */
  linkedFileName?: string;
}

/** The visible text of a `link` piece's link element - "Link: <file name>" (Tilman, 2026-09-25: keep this label). */
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
 * meetingNoteContent.ts's populateNoteFromDefinition) skips creating an
 * element at all for an empty piece, the "omit rather than show empty" convention.
 */
export function renderPieceText(piece: NotePiece, ctx: PieceRenderContext): string {
  switch (piece.type) {
    case 'title':
      return ctx.title;
    case 'date':
      return ctx.date ? formatFullDate(ctx.date) : '';
    case 'time':
      return ctx.time ?? '';
    case 'text':
      return piece.text ?? '';
    case 'related': {
      const items = ctx.relatedItems ?? [];
      if (items.length === 0) return '';
      return ['Relevant Todos:', ...items.map(item => `- ${item.text}`)].join('\n');
    }
    case 'link':
      return ctx.linkedFileName ? linkPieceText(ctx.linkedFileName) : '';
    default:
      return '';
  }
}

/**
 * Seeds the Phase 2 migration's one "Meeting (default)" definition (Tilman,
 * 2026-09-18: title + date + related-items, at the standard 100/100 seed -
 * NOT today's meetingNoteBlockTopX/Y (60/60), a deliberate, confirmed
 * choice, see technical-design-note-templates.md §7). Built via
 * addPieceToDefinition so the three pieces stack automatically using its
 * own nextPieceSeedPosition logic, rather than hand-computing their x/y
 * here. `template` starts blank (2026-09-18, Phase 3: this used to carry
 * forward whatever the now-retired `GtdParaSettings.meetingNoteTemplate`
 * global was already set to - see domain/settings.ts's doc comment on that
 * field's removal - but there's no longer any such value to carry forward;
 * a fresh migration just gets a blank background, same as any other new
 * definition, editable in the Settings UI same as always).
 */
export function createDefaultMeetingDefinition(id: string): NoteCreationDefinition {
  // 2026-09-25 (docs/dev/technical-design-linked-file-piece.md §4.1): the standard
  // Meeting defaults (Title, Date, Time, Linked file) plus Related items at the
  // bottom, so this seeded rule keeps the related-todos content it always had.
  let def = createEmptyDefinition(id, 'meeting');
  def = {...def, name: 'Meeting (default)', isDefault: true};
  def = withDefaultPieces(def);
  def = addPieceToDefinition(def, 'related');
  return def;
}

/**
 * Ensures `settings.noteCreationDefinitions` has at least the one seeded
 * default (§7's Phase 2 migration) - a no-op (returns the SAME object
 * reference) once it's non-empty, so a caller can cheaply tell "did this
 * actually seed anything" via `result !== settings` and only persist when
 * it did (storage/settingsStorage.ts's loadSettings). Deliberately keyed on
 * "list is empty", not a separate one-shot migration flag: simpler, and
 * idempotent either way - if a future change ever lets the list go back to
 * empty on purpose (e.g. the user deletes every definition), this seeds a
 * fresh default again rather than leaving meeting notes with nothing, which
 * keeps a Meeting default in place (since 2026-09-25 there is no fixed
 * fallback layout any more - a Meeting with no matching rule gets no
 * content, docs/dev/technical-design-linked-file-piece.md §4).
 */
/**
 * Whether a Todo's note should stop being auto-*re*populated on open
 * (storage/meetingNoteContent.ts's `refreshTodoNoteBlock`) - true once the
 * task is done or cancelled (2026-09-18, Phase 3 - Tilman: "stop auto
 * updating existing data when a note is already marked done"; cancelled
 * folded in the same way isMeetingAutoUpdateFrozen treats a cancelled
 * meeting, for the same reason - a cancelled task's note is done changing
 * too). Never gates *creation* - same "initial population always happens,
 * only the *re*-populate-on-open path freezes" split
 * isMeetingAutoUpdateFrozen documents; callers pass an explicit bypass for
 * the creation path rather than this function trying to distinguish the two.
 */
export function isTodoAutoUpdateFrozen(task: Pick<Task, 'done' | 'cancelled'>): boolean {
  return task.done || task.cancelled;
}

export function migrateNoteTemplateDefaults(settings: GtdParaSettings): GtdParaSettings {
  if (settings.noteCreationDefinitions.length > 0) return settings;
  const id = String(settings.nextNoteDefinitionId);
  const definition = createDefaultMeetingDefinition(id);
  return {
    ...settings,
    noteCreationDefinitions: [definition],
    nextNoteDefinitionId: settings.nextNoteDefinitionId + 1,
  };
}
