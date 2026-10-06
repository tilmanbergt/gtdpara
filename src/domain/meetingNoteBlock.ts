/**
 * Pure text/marker/measurement logic for note-creation content (docs/
 * technical-design-meeting-notes.md §3, docs/dev/technical-design-note-templates.md
 * §4). Zero RN/SDK imports (domain/ convention, see markdown.ts) - reusing
 * ui/textLineEstimator.ts here is safe since that module is plain TS with
 * no RN import of its own.
 *
 * The file name is narrower than its content: it serves every
 * note-creation context, not just meetings. technical-design-note-templates.md
 * §4/§8 names `domain/notePieceBlock.ts` as the intended name.
 */
import {activeLineEstimator} from '../ui/textLineEstimator';

/**
 * LEGACY userData marker of the fixed-shape meeting-note block written by
 * older versions (docs/dev/technical-design-linked-file-piece.md §4 - a
 * Meeting with no matching rule gets no content). Nothing writes it; kept
 * only so isNoteTemplateManagedElement cleans it off older notes.
 */
export const MEETING_NOTE_BLOCK_USERDATA = 'gtdpara:meeting-note-block:v1';

/**
 * LEGACY userData marker of the always-auto-appended "Link: <file>" element
 * written by older versions; links are now the placeable `link` piece with
 * an ordinary per-piece marker (docs/dev/technical-design-linked-file-piece.md).
 * Nothing writes it; kept only so isNoteTemplateManagedElement cleans it
 * off older notes.
 */
export const NOTE_LINK_USERDATA = 'gtdpara:meeting-note-link:v1';

/** Prefix for a definition-driven piece's own per-index userData marker (docs/dev/technical-design-note-templates.md §4: one marker per index, since piece count and order are data-driven). See notePieceUserData below. */
const NOTE_PIECE_USERDATA_PREFIX = 'gtdpara:note-piece:';

/** The userData marker `storage/meetingNoteContent.ts`'s populateNoteFromRule writes on the textbox element for `definition.pieces[index]` - one marker per piece, not one shared block marker, so a definition's pieces can be found/replaced/reordered independently. */
export function notePieceUserData(index: number): string {
  return `${NOTE_PIECE_USERDATA_PREFIX}${index}:v1`;
}

/**
 * True for any element this feature has ever written - the two LEGACY
 * markers (fixed block, auto-link) or a per-piece marker.
 * populateNoteFromRule deletes every element matching this before
 * inserting its fresh set, so notes written by an older version get their
 * legacy block/link cleaned up on the next refresh instead of keeping a
 * stale duplicate.
 *
 * `userData` is `string | null | undefined`, NOT plain `string`: pages also
 * carry elements this feature never wrote (the user's handwriting, their own
 * textboxes), and for those the SDK returns no `userData` at all. Calling
 * `startsWith` on that would throw. Anything that is not a string is simply
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

/** Default font size for estimatePieceTextHeight/noteLinkLineHeight when a caller passes none. */
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
 * line count to px via NOTE_LINE_HEIGHT_MULTIPLIER. Called once per piece
 * (docs/dev/technical-design-note-templates.md §4); used as the fallback
 * measurement by supernote/textboxMetrics.ts.
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

/** One line's worth of height at `fontSizePx` (supernote/textboxMetrics.ts's fallback line height; link elements themselves are measured by storage/notePieceMetrics.ts's measureNoteLinkRect). */
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
 * Only `.note` is a note link (1), images are 3, everything else is a
 * document link (2). A note-file link to a non-note (e.g. a `.txt`) makes
 * the host reject the whole insertElements call ("Destination file is not a
 * note file. Cannot call the API!"), so the note would get no content.
 * storage/meetingNoteContent.ts's populateNoteFromRule also retries without
 * the link if the host still rejects one. Pure lookup, no I/O.
 */
export function linkTypeForExtension(path: string): number {
  const ext = extensionOf(path);
  if (ext === 'note') return 1;
  if (IMAGE_EXTENSIONS.has(ext)) return 3;
  return 2;
}
