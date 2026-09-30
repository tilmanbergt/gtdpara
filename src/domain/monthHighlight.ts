/**
 * Month-view highlights (docs/dev/technical-design-monthly-view.md §2.4): a
 * meeting is a highlight when its line carries the bare tag `#monthly`, and
 * its optional short form is the trailing bracket of its title - e.g.
 * "Art of Transformation Session (AoT)". The short form is plain title text
 * (Tilman, 2026-09-23: "abbreviated form just in brackets ... can be filled
 * in by hand or added explicitly"), so it shows everywhere the title does.
 *
 * 2026-09-29 (docs/dev/technical-design-meeting-lists.md §2.2, Tilman: "any
 * final brackets should be used as short form"): ANY trailing bracket counts
 * now - spaces, umlauts and punctuation included ("(Geburtstag Jörg)",
 * "(AoT-2)"), up to 40 characters. It used to be 1-12 ASCII letters/digits
 * only, so most real brackets silently fell back to the full title. The
 * Month day panel's SHORT editor (setShortForm/isValidShortForm) is gone -
 * the bracket is edited as part of the title in Quick Add.
 * Pure, zero RN/SDK imports (domain/ convention).
 */
import {hasBareTag, setBareTag, stripBareTags} from './flowState';
import {stripAllTags} from './markdown';
import {Meeting} from './types';

export const HIGHLIGHT_TAG = 'monthly';

/** A trailing "( … )" at the end of a title's plain text - anything but nested brackets, 1-40 characters. */
const TRAILING_SHORT_FORM_RE = /\(([^()]{1,40})\)\s*$/;

export function isHighlight(meeting: Pick<Meeting, 'tags'>): boolean {
  return hasBareTag(meeting.tags, HIGHLIGHT_TAG);
}

/** `title` with `#monthly` added (on) or removed (off). */
export function setHighlight(title: string, on: boolean): string {
  return setBareTag(title, HIGHLIGHT_TAG, on);
}

/** The short form in `title` ("AoT" from "... Session (AoT) #monthly"), or null. Tags are ignored, so a trailing tag after the bracket doesn't hide it. */
export function shortFormOf(title: string): string | null {
  const match = TRAILING_SHORT_FORM_RE.exec(stripAllTags(title));
  const short = match ? match[1].trim() : '';
  return short ? short : null;
}

/**
 * What the Month view shows for a highlight: its short form, else its title
 * without tags - or, for a title that is only tags ("#Daily"), the title
 * itself minus the `#monthly` flag, so the label is never empty.
 */
export function monthLabel(meeting: Pick<Meeting, 'title'>): string {
  const short = shortFormOf(meeting.title);
  if (short) return short;
  const plain = stripAllTags(meeting.title);
  return plain || stripBareTags(meeting.title, [HIGHLIGHT_TAG]).trim();
}
