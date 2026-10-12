/**
 * One note page's content (docs/dev/history/technical-design-note-setups.md §3.1):
 * a MyStyle background plus positioned content pieces and the page's own
 * reusable texts (docs/dev/history/technical-design-note-templates.md).
 * Pure domain: zero RN/SDK imports (design-overview.md §3).
 *
 * Every piece and text operation here is generic over the layout
 * (`<T extends PageLayout>`): it only ever touches `pieces`, `texts` and
 * `template`, so any object carrying a layout keeps its other fields.
 *
 * A layout owns a `texts` list (`NoteTextItem`); the Add-piece panel places
 * each piece/text at most once, and a placed text piece points at its text by
 * `textId` (see the "Once-only placement" helpers near `setPieceStep`, §6.1).
 */
import {formatDayHeader, formatHeadingDate, formatTime} from './dateFormat';
import type {Task} from './types';
import {renderSinceLast, SinceLast} from './sinceLastText';

/** The kinds of page a note setup can describe (§1.4 keeps more kinds open). */
export type PageKind = 'meeting' | 'todo' | 'first';

/**
 * `link` (docs/dev/history/technical-design-linked-file-piece.md): a tappable
 * Supernote link element to the item's own `linkedFile` (the paperclip
 * attachment) - Todo/Meeting/First page. A layout without a `link` piece
 * writes no link at all.
 *
 * `sinceLast` (docs/dev/history/technical-design-tending-threads.md §3.11):
 * Meeting only, never in a page's defaults - a printed snapshot of the thread
 * overview for the meeting's first thread tag since the previous meeting of
 * that thread (domain/sinceLastText.ts, storage/sinceLast.ts).
 *
 * `dateTitle` (docs/dev/history/technical-design-projects-findable-notes.md
 * §2.1 R2): `30.9.2026 · Retro demand retro/demand`, the date with the year
 * and the display title with its tags as words (no `#`). A heading unless
 * switched off. Meeting pages, and a loop note's first page (main date + loop
 * name; the name alone without a main date).
 */
export type PieceType = 'title' | 'date' | 'time' | 'text' | 'related' | 'link' | 'sinceLast' | 'dateTitle';

export interface NotePiece {
  type: PieceType;
  /**
   * Only meaningful for type === 'text' - the user's own text, verbatim. When
   * `textId` is set this is a denormalized copy of that `NoteTextItem`'s text,
   * kept in sync by `updateTextItem` below, so the render path
   * (`renderPieceText`) never has to look anything up.
   */
  text?: string;
  /** Only for type === 'text': which of the owning layout's `texts` this piece places. Absent on pieces saved before layout-owned texts existed - `migrateLegacyTextPieces` gives those one when their layout is opened for editing. */
  textId?: string;
  x: number;
  y: number;
  fontSize: number;
  /** Last nudge-step (5 or 25) used on this piece in the Settings UI - UI memory only, never read by rendering. */
  step: number;
  /**
   * Maximum textbox width in device px for THIS piece
   * (docs/dev/history/technical-design-textbox-metrics.md) - per piece, not per
   * layout. Read through `pieceMaxWidthPx` below, never compared to
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
   * type's default (on for `dateTitle`, off otherwise), so pieces saved
   * before the switch existed don't change. Read through `pieceIsHeading`,
   * never directly.
   */
  heading?: boolean;
}

/**
 * A reusable static text that belongs to exactly ONE layout, listed on the
 * Add-piece panel next to the predefined pieces. A piece of type 'text' places
 * one of these by `textId`; each text can be placed at most once per layout.
 * Editing the text updates the placed piece in place (`updateTextItem`), so
 * its position/font never need redoing.
 */
export interface NoteTextItem {
  id: string;
  /** Shown as the row label on the Add-piece panel. */
  name: string;
  text: string;
}

export interface PageLayout {
  /** '' = blank (style_white); else a MYSTYLE_FOLDER file name, same convention storage/noteLinks.ts's getNoteTemplate uses. */
  template: string;
  pieces: NotePiece[];
  /** This layout's own reusable static texts (see NoteTextItem). Optional (absent === none) - read through `layoutTexts`. */
  texts?: NoteTextItem[];
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

/** Sets the Heading switch of `layout.pieces[index]` (the layout editor's toggle). */
export function setPieceHeading<T extends PageLayout>(layout: T, index: number, on: boolean): T {
  const pieces = layout.pieces.map((p, i) => (i === index ? {...p, heading: on} : p));
  return {...layout, pieces};
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

/** `piece.maxWidthPx`, defaulting a pre-existing (un-migrated) piece to DEFAULT_MAX_PIECE_WIDTH_PX - the one place this optional field is read, so no call site compares it to `undefined`. */
export function pieceMaxWidthPx(piece: Pick<NotePiece, 'maxWidthPx'>): number {
  return piece.maxWidthPx ?? DEFAULT_MAX_PIECE_WIDTH_PX;
}

/**
 * Where the next piece added to a layout should start. The first piece in an
 * empty layout seeds at DEFAULT_PIECE_X/Y; every piece after that stacks below
 * the lowest existing one at the same x, so pieces don't pile up on top of
 * each other by default.
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

export function addPiece<T extends PageLayout>(layout: T, type: PieceType, text?: string, textId?: string): T {
  const {x, y} = nextPieceSeedPosition(layout.pieces);
  const piece: NotePiece = {
    type,
    ...(type === 'text' ? {text: text ?? '', ...(textId !== undefined ? {textId} : {})} : {}),
    x,
    y,
    fontSize: DEFAULT_PIECE_FONT_SIZE,
    step: DEFAULT_PIECE_STEP,
    maxWidthPx: DEFAULT_MAX_PIECE_WIDTH_PX,
  };
  return {...layout, pieces: [...layout.pieces, piece]};
}

export function removePiece<T extends PageLayout>(layout: T, index: number): T {
  return {...layout, pieces: layout.pieces.filter((_, i) => i !== index)};
}

/** Moves a piece by `dx`/`dy` (device px - typically ±5 or ±25, the two nudge steps), clamped so it can't be nudged off the top/left of the page. */
export function nudgePieceAt<T extends PageLayout>(layout: T, index: number, dx: number, dy: number): T {
  const pieces = layout.pieces.map((p, i) =>
    i === index ? {...p, x: Math.max(0, p.x + dx), y: Math.max(0, p.y + dy)} : p,
  );
  return {...layout, pieces};
}

export function setPieceFontSize<T extends PageLayout>(layout: T, index: number, fontSize: number): T {
  const clamped = Math.max(8, Math.round(fontSize));
  const pieces = layout.pieces.map((p, i) => (i === index ? {...p, fontSize: clamped} : p));
  return {...layout, pieces};
}

export function setPieceStep<T extends PageLayout>(layout: T, index: number, step: number): T {
  const pieces = layout.pieces.map((p, i) => (i === index ? {...p, step} : p));
  return {...layout, pieces};
}

/** Absolute setter for a piece's max width, clamped to MIN_PIECE_MAX_WIDTH_PX; the ±25 buttons in ui/NudgePad.tsx call this with `pieceMaxWidthPx(piece) + delta`. No upper clamp - a cap wider than pieceWidthPx(x) is harmless (storage/notePieceMetrics.ts's measureNotePieceRect takes the min of the two), and leaving it uncapped here means the ceiling doesn't silently change if x is nudged afterward. */
export function setPieceMaxWidth<T extends PageLayout>(layout: T, index: number, maxWidthPx: number): T {
  const clamped = Math.max(MIN_PIECE_MAX_WIDTH_PX, Math.round(maxWidthPx));
  const pieces = layout.pieces.map((p, i) => (i === index ? {...p, maxWidthPx: clamped} : p));
  return {...layout, pieces};
}

// ---- Once-only placement + layout-owned static texts ----------------------
// The Add-piece model (docs/dev/history/technical-design-note-templates.md §6.1):
// every piece can be placed at most once per layout - Title/Date/Time/Related
// by type, a static text by its `textId` - and a placed piece shows "Remove"
// instead of "+ Add". Removing a text piece only takes it out of the page;
// the `NoteTextItem` stays in the layout's list until explicitly deleted.

export function layoutTexts(layout: Pick<PageLayout, 'texts'>): NoteTextItem[] {
  return layout.texts ?? [];
}

/** Index of the (first) piece that is this placement, or -1 - `textId` only matters for type 'text'. Layouts saved before the once-only model can hold duplicates of a type; this finds the first one, so "Remove" peels them off one at a time. */
export function findPlacedPieceIndex(layout: PageLayout, type: PieceType, textId?: string): number {
  return layout.pieces.findIndex(p => p.type === type && (type !== 'text' || p.textId === textId));
}

export function isPiecePlaced(layout: PageLayout, type: PieceType, textId?: string): boolean {
  return findPlacedPieceIndex(layout, type, textId) >= 0;
}

/** Removes the (first) matching placement - a no-op when there isn't one. Never touches `texts`. */
export function removePlacedPiece<T extends PageLayout>(layout: T, type: PieceType, textId?: string): T {
  const index = findPlacedPieceIndex(layout, type, textId);
  return index < 0 ? layout : removePiece(layout, index);
}

/** Next free text id for this layout's own list - simple counter over the existing ids ("t1", "t2", ...). Ids are only meaningful inside one layout. */
export function nextTextItemId(texts: NoteTextItem[]): string {
  let max = 0;
  for (const t of texts) {
    const n = Number(t.id.replace(/^t/, ''));
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `t${max + 1}`;
}

/** Adds a text to the layout's list (NOT placed on the page - placing is a separate "+ Add"). Returns the new id alongside the updated layout so the caller can select it. */
export function addTextItem<T extends PageLayout>(layout: T, name: string, text: string): {layout: T; id: string} {
  const texts = layoutTexts(layout);
  const id = nextTextItemId(texts);
  return {layout: {...layout, texts: [...texts, {id, name, text}]}, id};
}

/** Saves a text's new name/text AND updates the denormalized `text` on its placed piece (if any) - position, font size and step stay exactly as they were, which is the whole point of placing by reference. */
export function updateTextItem<T extends PageLayout>(layout: T, id: string, name: string, text: string): T {
  const texts = layoutTexts(layout).map(t => (t.id === id ? {...t, name, text} : t));
  const pieces = layout.pieces.map(p => (p.type === 'text' && p.textId === id ? {...p, text} : p));
  return {...layout, texts, pieces};
}

/** Deletes a text from the layout's list and removes its placed piece too (the caller asks for confirmation first when it is placed). */
export function removeTextItem<T extends PageLayout>(layout: T, id: string): T {
  return {
    ...layout,
    texts: layoutTexts(layout).filter(t => t.id !== id),
    pieces: layout.pieces.filter(p => !(p.type === 'text' && p.textId === id)),
  };
}

/** Row label for a text created from a legacy inline text piece: its first line, shortened; 'Text' when empty. */
function legacyTextName(text: string): string {
  const firstLine = text.trim().split('\n')[0].trim();
  if (!firstLine) return 'Text';
  return firstLine.length > 24 ? `${firstLine.slice(0, 24).trimEnd()}…` : firstLine;
}

/**
 * Run when a layout is opened for editing (not at settings load - nothing
 * needs it before then, since `piece.text` is what rendering reads either
 * way): every text piece without a `textId` gets its own `NoteTextItem`,
 * named from its first words, keeping its position/font. Returns the SAME
 * object when there is nothing to migrate, so a caller can cheaply tell.
 */
export function migrateLegacyTextPieces<T extends PageLayout>(layout: T): T {
  if (!layout.pieces.some(p => p.type === 'text' && !p.textId)) return layout;
  const texts = [...layoutTexts(layout)];
  const pieces = layout.pieces.map(p => {
    if (p.type !== 'text' || p.textId) return p;
    const text = p.text ?? '';
    const id = nextTextItemId(texts);
    texts.push({id, name: legacyTextName(text), text});
    return {...p, textId: id};
  });
  return {...layout, texts, pieces};
}

/**
 * What renderPieceText needs to turn a `NotePiece` into real text - built
 * once per note-creation/refresh call from whatever the caller already has
 * (a Meeting, a Task, an item name), not stored anywhere. `date`/`time` are
 * meeting-only sources - a caller rendering pieces for another page simply
 * never sets them, and those piece types are not offered on other pages in
 * the first place, so this isn't relied on as the only guard.
 */
export interface PieceRenderContext {
  /** The note's own title - a Meeting's title, a Task's text, or a loop's name, depending on the page. */
  title: string;
  /** Meeting only - ISO date (Meeting.date), formatted here (domain/dateFormat.ts), not by the caller. */
  date?: string;
  /** Meeting only - HH:mm 24h, or unset/empty for a date-only meeting. Rendered verbatim (already the display format Meeting.time is stored in), unlike `date`. */
  time?: string;
  /** From a relatedItemsFor(...) call (storage/meetingNoteAggregate.ts) - already filtered/matched by the caller; renderPieceText only formats what it's given. */
  relatedItems?: Array<{text: string}>;
  /** Meeting only - the "Since last time" snapshot (storage/sinceLast.ts), built only when the layout places the piece. */
  sinceLast?: SinceLast | null;
  /** The `dateTitle` piece's text, `30.9.2026 · Retro demand`, built by the caller with `dateTitleText` from the date and the display title with tags as words (domain/markdown.ts's `tagsAsWords`). */
  dateTitle?: string;
  /** Bare file name of the item's `linkedFile`, set by the caller ONLY when that file actually exists (missing file -> unset -> the `link` piece is skipped, docs/dev/history/technical-design-linked-file-piece.md §1.4). */
  linkedFileName?: string;
}

/** The visible text of a `link` piece's link element - "Link: <file name>". */
export function linkPieceText(fileName: string): string {
  return `Link: ${fileName}`;
}

/**
 * Turns one `NotePiece` into the text its element should contain (docs/dev/
 * history/technical-design-note-templates.md §4's table) - pure and
 * page-agnostic: every decision (which tags matched, what the title is)
 * already happened before this is called, building `ctx`. Returns `''` for a
 * piece with nothing to show (an unset `time`, a `related` piece with no
 * matches) rather than a placeholder - the caller (storage/
 * meetingNoteContent.ts) skips creating an element at all for an empty piece.
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

/** The text of a `dateTitle` piece: `30.9.2026 · Retro demand` - the date always with its year, the title as given (callers pass it with tags as words, `tagsAsWords`). */
export function dateTitleText(date: string, title: string): string {
  const shown = date ? formatHeadingDate(date) : '';
  return [shown, title.trim()].filter(Boolean).join(' · ');
}

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
