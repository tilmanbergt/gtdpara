/**
 * Supernote's keyword length limit (docs/dev/history/technical-design-keyword-length.md,
 * docs/dev/supernote-host-facts.md). The firmware keeps at most 43 characters per keyword: its
 * keyword UI cuts longer input silently, `PluginFileAPI.insertKeyWord` rejects it with "The
 * keyword exceeds the maximum length limit". It counts characters (an umlaut is one), which is
 * what JavaScript's `.length` counts.
 *
 * Every keyword gtdpara writes goes through `fitKeyword`, inside the functions that build it
 * (todo, meeting, loop and tag keywords). Because the page keyword stored in a note link, the
 * keyword written on the page and every later comparison all come from the same builder, the
 * fitted keyword finds its page again: the rule is a pure function of the text.
 */
import {stripTagsFromText} from './markdown';

/** Longest keyword the Supernote accepts, in characters (JS `.length`). */
export const KEYWORD_MAX_LENGTH = 43;

const ELLIPSIS = '…';

/** A cut never goes back further than this to reach a word boundary; one long word is hard-cut. */
const MIN_WORD_CUT = Math.floor((KEYWORD_MAX_LENGTH - 1) / 2);

/** Whether the Supernote accepts `keyword` as it is. */
export function keywordFits(keyword: string): boolean {
  return keyword.length <= KEYWORD_MAX_LENGTH;
}

/** Spacing and brackets left over after tags were taken out: "für (outcome )" -> "für (outcome)". */
function tidy(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\(\s*\)|\[\s*\]/g, '')
    .replace(/([([])\s+/g, '$1')
    .replace(/\s+([)\],.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

/** `text` cut to KEYWORD_MAX_LENGTH - 1 characters at a word boundary where possible, plus "…". */
function cutWithEllipsis(text: string): string {
  const room = KEYWORD_MAX_LENGTH - ELLIPSIS.length;
  let end = room;
  // Never split a surrogate pair (an emoji counts as two characters, as on the device).
  const last = text.charCodeAt(end - 1);
  if (last >= 0xd800 && last <= 0xdbff) end--;
  let head = text.slice(0, end);
  if (text[end] !== ' ') {
    const space = head.lastIndexOf(' ');
    if (space >= MIN_WORD_CUT) head = head.slice(0, space);
  }
  head = head.replace(/[\s,.;:!?([\-–]+$/, '');
  return `${head}${ELLIPSIS}`;
}

/**
 * `keyword` within KEYWORD_MAX_LENGTH, deterministic and idempotent:
 * 1. at most 43 characters: returned exactly as it is (keywords already on pages keep matching);
 * 2. longer: its `#tags` are left out (gtdpara writes them as keywords of their own) and the
 *    spacing tidied; a keyword made only of tags keeps its text for step 3;
 * 3. still longer: cut at a word boundary and ended with "…".
 * A leading `YYYY-MM-DD ` (a meeting's keyword) and the `loop ` prefix always survive the cut.
 */
export function fitKeyword(keyword: string): string {
  if (keywordFits(keyword)) return keyword;
  const withoutTags = tidy(stripTagsFromText(keyword));
  const base = withoutTags.length > 0 ? withoutTags : tidy(keyword);
  return keywordFits(base) ? base : cutWithEllipsis(base);
}
