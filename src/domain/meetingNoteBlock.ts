/**
 * Pure text/marker/measurement logic for note-creation content (docs/
 * technical-design-meeting-notes.md §3, generalized by docs/technical-
 * design-note-templates.md §4 Phase 2). Zero RN/SDK imports (domain/
 * convention, see markdown.ts) - reusing ui/textLineEstimator.ts here is
 * safe under that same convention since that module is itself plain TS with
 * no RN import of its own.
 *
 * FILE NAME NOTE (2026-09-18, Phase 2): technical-design-note-templates.md
 * §4/§8 calls for renaming this file to `domain/notePieceBlock.ts` now that
 * it serves every note-creation context, not just meetings - "keeping the
 * old name ... would be actively misleading." That rename isn't done in
 * this pass: this session has no file-delete capability on the linked
 * device (only stage/commit, which can write files but not remove the old
 * path), so renaming would leave an orphaned, un-deletable duplicate behind
 * rather than a clean rename. The exports below ARE renamed/generalized
 * per §4 (estimatePieceTextHeight, noteLinkLineHeight, NOTE_LINK_USERDATA,
 * notePieceUserData, isNoteTemplateManagedElement) - only the file's own
 * path is deferred. Trivial manual follow-up: rename this file to
 * notePieceBlock.ts and update its one import line in
 * storage/meetingNoteContent.ts (itself flagged the same way there).
 */
import {activeLineEstimator} from '../ui/textLineEstimator';

/**
 * LEGACY userData marker of the old fixed-shape meeting-note block (removed
 * 2026-09-25, docs/dev/technical-design-linked-file-piece.md §4 - a Meeting with
 * no matching rule now gets no content). Nothing writes it any more; kept
 * only so isNoteTemplateManagedElement still cleans it off older notes.
 */
export const MEETING_NOTE_BLOCK_USERDATA = 'gtdpara:meeting-note-block:v1';

/**
 * LEGACY userData marker of the old always-auto-appended "Link: <file>"
 * element (replaced 2026-09-25 by the placeable `link` piece, which carries
 * an ordinary per-piece marker - docs/dev/technical-design-linked-file-piece.md).
 * Nothing writes it any more; kept only so isNoteTemplateManagedElement still
 * cleans it off older notes. String value unchanged since Phase 1.
 */
export const NOTE_LINK_USERDATA = 'gtdpara:meeting-note-link:v1';

/** Prefix for a definition-driven piece's own per-index userData marker (docs/dev/technical-design-note-templates.md §4: "gtdpara:note-piece:<index>:v1 ... since piece count and order are now data-driven rather than fixed"). See notePieceUserData below. */
const NOTE_PIECE_USERDATA_PREFIX = 'gtdpara:note-piece:';

/** The userData marker `storage/meetingNoteContent.ts`'s populateNoteFromRule writes on the textbox element for `definition.pieces[index]` - one marker per piece, not one shared block marker, so a definition's pieces can be found/replaced/reordered independently. */
export function notePieceUserData(index: number): string {
  return `${NOTE_PIECE_USERDATA_PREFIX}${index}:v1`;
}

/**
 * True for any element this feature has ever written - the two LEGACY
 * markers (old fixed block, old auto-link) or a per-piece marker.
 * populateNoteFromRule deletes every element matching this before
 * inserting its fresh set, so notes written by an older version get their
 * legacy block/link cleaned up on the next refresh instead of keeping a
 * stale duplicate.
 *
 * `userData` is `string | null | undefined`, NOT plain `string` (bugfix
 * 2026-09-21, "Cannot read 'startsWith' of undefined" on re-opening a note):
 * every page also carries elements this feature never wrote - the user's own
 * handwriting strokes, textboxes they typed themselves - and for those the
 * SDK returns no `userData` at all. The Phase 2 `startsWith` call assumed a
 * string and threw as soon as such an element was on the page (i.e. from the
 * second open on, once the user had written something); the pre-Phase-2
 * `===`-only comparison never could. Anything that is not a string is simply
 * not ours.
 */
export function isNoteTemplateManagedElement(userData: string | null | undefined): boolean {
  if (typeof userData !== 'string') return false;
  return (
    userData === MEETING_NOTE_BLOCK_USERDATA ||
    userData === NOTE_LINK_USERDATA ||
    userData.startsWith(NOTE_PIECE_USERDATA_PREFIX)
  );
}

/** Default font size for estimatePieceTextHeight/noteLinkLineHeight when a caller passes none (the old fixed block's size; that block itself was removed 2026-09-25). */
export const MEETING_NOTE_FONT_SIZE = 24;
// design-device-rendering.md §5's standing approximation for on-device line
// height vs. font size - the same ~1.2x estimate ui/textLineEstimator.ts's
// own callers already lean on elsewhere in this codebase, not a new guess.
const NOTE_LINE_HEIGHT_MULTIPLIER = 1.2;

/**
 * Predicts a text block's rendered height in px for `text` at
 * `availableWidthPx` - summing ui/textLineEstimator.ts's
 * activeLineEstimator.estimateLines over every logical (`\n`-split) line (a
 * blank line calls estimateLines('', ...), which already returns 1 - no
 * separate "blank lines count as 1" case needed), then converting wrapped-
 * line count to px via NOTE_LINE_HEIGHT_MULTIPLIER.
 *
 * Renamed from estimateMeetingNoteBlockHeight (2026-09-18, Phase 2,
 * docs/dev/technical-design-note-templates.md §4: "already piece-agnostic ...
 * reused as-is, just called once per piece instead of once for a whole
 * hardcoded block") - pure rename, behavior unchanged. Used as the
 * fallback measurement by supernote/textboxMetrics.ts.
 *
 * This is a known-imprecise reuse - textLineEstimator was calibrated for
 * this plugin's own React Native row rendering, not for predicting how the
 * NOTE app's native textbox renderer wraps text - so treat this as a rough
 * starting rect, over-provisioning being the safe failure mode exactly as
 * that module's own doc comment argues. Flagged for recalibration once a
 * real on-device screenshot of an actual inserted textbox element exists to
 * compare against.
 */
export function estimatePieceTextHeight(
  text: string,
  availableWidthPx: number,
  fontSizePx: number = MEETING_NOTE_FONT_SIZE,
): number {
  const logicalLines = text.split('\n');
  const wrappedLineCount = logicalLines.reduce(
    (sum, line) => sum + activeLineEstimator.estimateLines(line, availableWidthPx, fontSizePx),
    0,
  );
  return Math.ceil(wrappedLineCount * fontSizePx * NOTE_LINE_HEIGHT_MULTIPLIER);
}

/** One line's worth of height at `fontSizePx` (supernote/textboxMetrics.ts's fallback line height; link elements are measured since 2026-09-25, storage/notePieceMetrics.ts's measureNoteLinkRect). Renamed from meetingNoteLinkLineHeight (2026-09-18, Phase 2) - same pure rename as estimatePieceTextHeight above, no behavior change. */
export function noteLinkLineHeight(fontSizePx: number = MEETING_NOTE_FONT_SIZE): number {
  return Math.ceil(fontSizePx * NOTE_LINE_HEIGHT_MULTIPLIER);
}

function extensionOf(path: string): string {
  const match = /\.([^./]+)$/.exec(path);
  return match ? match[1].toLowerCase() : '';
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'bmp', 'webp']);

/**
 * Which `ElementLink.linkType` to use for a link pointing at `path`, by
 * extension. SDK values (sn-plugin-lib TextLink): 0 = note page, 1 = note
 * file, 2 = document, 3 = image, 4 = URL.
 *
 * Bugfix 2026-09-28: anything unrecognized used to fall back to 1 (note
 * file), so a link to e.g. a `.txt` made the host reject the whole
 * insertElements call ("Destination file is not a note file. Cannot call the
 * API!") and the note got no content at all. Now only `.note` is a note link
 * (Tilman: "note really only makes sense for .note"), images stay 3, and
 * everything else is a document link (2). storage/meetingNoteContent.ts's
 * populateNoteFromRule additionally retries without the link if the
 * host still rejects one. Pure lookup, no I/O.
 */
export function linkTypeForExtension(path: string): number {
  const ext = extensionOf(path);
  if (ext === 'note') return 1;
  if (IMAGE_EXTENSIONS.has(ext)) return 3;
  return 2;
}
