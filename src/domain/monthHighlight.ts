/**
 * Month-view highlights (docs/dev/history/technical-design-monthly-view.md §2.4): a
 * meeting is a highlight when its line carries the bare tag `#monthly`, and
 * its optional short form is the trailing bracket of its title - e.g.
 * "Art of Transformation Session (AoT)". The short form is plain title text,
 * filled in by hand, so it shows everywhere the title does and is edited as
 * part of the title in Quick Add.
 *
 * ANY trailing bracket counts (docs/dev/history/technical-design-meeting-lists.md
 * §2.2) - spaces, umlauts and punctuation included ("(Geburtstag Jörg)",
 * "(AoT-2)"), up to 40 characters.
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
