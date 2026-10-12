/**
 * Tag Rules (docs/dev/history/technical-design-note-templates.md): context
 * (Project/Area/Todo/Meeting/Loop) + optional tag match + one page layout
 * (domain/pageLayout.ts) + where the note goes and meeting tracking. Rule
 * matching (`resolveNoteTemplate`, `tagMatchesRuleTag`, `ruleSubtag`,
 * `ruleTypeTag`) and the seeded default rule live here; everything about the
 * page's content lives in domain/pageLayout.ts. Pure domain: zero RN/SDK
 * imports (design-overview.md §3).
 *
 * A Meeting/Todo rule can target a shared `.note` file (one page per item,
 * located by keyword) instead of its own file per item - `noteTarget`/
 * `sharedFileName`/`sharedFileFolder` below, plus `effectiveNoteTarget`/
 * `resolvedSharedFileName`/`resolvedSharedFileFolder`
 * (docs/dev/history/technical-design-shared-note-pages.md §2.1/§12). The anchor
 * encoding, keyword derivation and chronological-insertion math live in
 * `domain/sharedNotePages.ts`.
 */
// Type-only import (erased at compile time, so this doesn't create a real
// runtime circular dependency even though domain/settings.ts imports
// TagRule back from this file) - migrateTagRuleDefaults
// below is the one function here that needs the whole settings shape.
import type {GtdParaSettings} from './settings';
import {
  addPiece,
  NotePiece,
  NoteTextItem,
  PageLayout,
  pieceIsHeading,
  pieceMaxWidthPx,
  PieceType,
} from './pageLayout';
import {LOOP_NOTE_NAME_DEFAULT, setupSubtag, setupTypeTag, tagMatchesSetupTag} from './noteSetups';

export {LOOP_NOTE_NAME_DEFAULT};
/** Rule-named aliases of the setup matching functions (domain/noteSetups.ts), used until the rules are gone. */
export const tagMatchesRuleTag = tagMatchesSetupTag;
export const ruleSubtag = (itemTags: string[], ruleTags: string[]): string => setupSubtag(itemTags, ruleTags);
export const ruleTypeTag = (itemTags: string[], ruleTags: string[]): string => setupTypeTag(itemTags, ruleTags);

/**
 * `loop` (docs/dev/history/technical-design-loops.md §3.1): a Loop rule's
 * tags are kinds of loops - `#<kind>/<name>` is one loop - and its pieces
 * make the loop note's first page. Its `sharedFileName` is the loop note's
 * name (`LOOP_NOTE_NAME_DEFAULT` when blank); the note always lives in the
 * owner's own folder.
 */
export type NoteContext = 'project' | 'area' | 'todo' | 'meeting' | 'loop';


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

export interface TagRule extends PageLayout {
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
  /** This rule's own reusable static texts (see NoteTextItem). Optional so rules saved before this existed need no migration (absent === none) - read through `layoutTexts`. */
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
  title: ['project', 'area', 'todo', 'meeting', 'loop'],
  date: ['meeting'],
  time: ['meeting'],
  text: ['project', 'area', 'todo', 'meeting', 'loop'],
  related: ['todo', 'meeting'],
  link: ['todo', 'meeting', 'loop'],
  sinceLast: ['meeting'],
  dateTitle: ['meeting', 'loop'],
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
  loop: ['dateTitle', 'link'],
};

/** Default pieces seeded with the Heading switch set on explicitly (a todo's heading is its Title, §2.1 R3). */
const DEFAULT_HEADING_PIECES: Partial<Record<NoteContext, PieceType[]>> = {todo: ['title']};

/** Adds `DEFAULT_PIECE_TYPES[definition.context]` to `definition`, stacked via addPiece's own seed logic. */
export function withDefaultPieces(definition: TagRule): TagRule {
  const seeded = DEFAULT_PIECE_TYPES[definition.context].reduce((def, type) => addPiece(def, type), definition);
  const headings = DEFAULT_HEADING_PIECES[definition.context] ?? [];
  const start = definition.pieces.length;
  return {
    ...seeded,
    pieces: seeded.pieces.map((p, i) => (i >= start && headings.includes(p.type) ? {...p, heading: true} : p)),
  };
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
    ...(context === 'loop' ? {sharedFileName: LOOP_NOTE_NAME_DEFAULT} : {}),
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
 * Seeds the one "Meeting (default)" definition (date & title + time + link + related items,
 * at the standard 100/100 seed - NOT meetingNoteBlockTopX/Y (60/60), a
 * deliberate choice, see technical-design-note-templates.md §7). Built via
 * addPiece so the pieces stack automatically using its own
 * nextPieceSeedPosition logic. `template` starts blank, same as any other
 * new definition.
 */
export function createDefaultMeetingRule(id: string): TagRule {
  // The standard Meeting defaults (Date & title, Time, Linked file) plus Related items at the bottom,
  // so this seeded rule also carries the related-todos content.
  let def = createEmptyTagRule(id, 'meeting');
  def = {...def, name: 'Meeting (default)', isDefault: true};
  def = withDefaultPieces(def);
  def = addPiece(def, 'related');
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
