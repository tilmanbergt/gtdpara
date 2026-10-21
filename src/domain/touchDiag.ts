/**
 * The touch test's bookkeeping (Settings → Advanced → Touch test,
 * docs/dev/history/technical-design-touch-test.md). Pure, so the rules that
 * tell the hypotheses apart are tested on their own.
 *
 * A recorded touch plus the press events the test rows reported while it
 * lasted give its class:
 *
 * - `handled`: a press fired on a part that acts on one tap.
 * - `swallowed`: the only press landed on a part that does nothing on a
 *   single tap, like `#next`, which waits for a second one (H4).
 * - `cancelled`: a press started (pressIn), a span lost the responder or the
 *   system cancelled the touch, but no press fired (H2).
 * - `noTarget`: the touch arrived and nothing took it (H3).
 *
 * A touch the host never passes on (H1) leaves no record at all. Whether a
 * press hit what Tilman aimed at (H5) only his verdict can tell.
 *
 * Targets are `<row>:<part>` ids (`7:title`, `3:tag:2`, `5:label:next`), no
 * texts. Positions are kept in dp as React Native reports them; everything
 * written out (log, CSV, the "moved … px" text) is in device pixels.
 */

export type TouchMode = 'finger' | 'pen';
export type TouchSide = 'left' | 'right';
export type TouchBand = 'top' | 'middle' | 'bottom';
export type TouchClass = 'handled' | 'cancelled' | 'noTarget' | 'swallowed';
export type TouchVerdict = 'intended' | 'notIntended';
export type OutcomeKind = 'pressIn' | 'pressOut' | 'press' | 'responderTerminate';

/** One finger or pen contact as the observer saw it. Positions in dp, times in ms (one clock). */
export interface RawTouch {
  id: number;
  x: number;
  y: number;
  endX: number;
  endY: number;
  /** Largest distance from the start point while the touch lasted (dp). */
  maxMove: number;
  startAt: number;
  endAt: number;
  /** Most pointers on the screen at once during this touch. */
  pointers: number;
  /** True when the system ended it with a cancel instead of a lift. */
  cancelled: boolean;
}

export interface TouchOutcome {
  kind: OutcomeKind;
  /** `<row>:<part>`. */
  target: string;
  /** A press on a part that does nothing on its own (a single tap on `#next`). */
  inert: boolean;
  at: number;
}

export interface TouchEntry extends RawTouch {
  mode: TouchMode;
  /** Which side the test column was on. */
  side: TouchSide;
  band: TouchBand;
  cls: TouchClass;
  /** The part that got the press (or the press-in, when cancelled), or null. */
  target: string | null;
  verdict: TouchVerdict | null;
  /** After "Not intended": what the next test tap hit (`none` when it hit nothing). */
  intendedTarget: string | null;
}

/** How long after a touch ends its press events may still arrive (pressOut waits for a minimum press time). */
export const OUTCOME_GRACE_MS = 300;
/** A pressIn can be dispatched just before the observer's own touch start. */
export const OUTCOME_EARLY_MS = 50;
/** The top and bottom bands are this share of the screen height each. */
export const EDGE_BAND_SHARE = 0.2;
/** `intendedTarget` of a follow-up tap that hit nothing. */
export const NO_TARGET = 'none';

export function bandOf(y: number, screenHeight: number): TouchBand {
  if (screenHeight <= 0) return 'middle';
  if (y < screenHeight * EDGE_BAND_SHARE) return 'top';
  if (y >= screenHeight * (1 - EDGE_BAND_SHARE)) return 'bottom';
  return 'middle';
}

/**
 * The outcomes that belong to `touch`: those in its window (start .. end +
 * grace) and not claimed by a later touch whose window also holds them -
 * quick taps overlap in the grace time, and an outcome goes to the latest
 * touch that had started.
 */
export function outcomesOf(touch: RawTouch, touches: readonly RawTouch[], outcomes: readonly TouchOutcome[]): TouchOutcome[] {
  const inWindow = (t: RawTouch, o: TouchOutcome) => o.at >= t.startAt - OUTCOME_EARLY_MS && o.at <= t.endAt + OUTCOME_GRACE_MS;
  return outcomes.filter(o => {
    if (!inWindow(touch, o)) return false;
    const owner = touches.filter(t => inWindow(t, o)).reduce<RawTouch | null>((best, t) => (best === null || t.startAt > best.startAt ? t : best), null);
    return owner === null || owner.id === touch.id;
  });
}

/** The class of one touch from its own outcomes - see the module doc comment. */
export function classifyTouch(touch: RawTouch, outcomes: readonly TouchOutcome[]): {cls: TouchClass; target: string | null} {
  const presses = outcomes.filter(o => o.kind === 'press');
  const real = presses.find(o => !o.inert);
  if (real) return {cls: 'handled', target: real.target};
  if (presses.length > 0) return {cls: 'swallowed', target: presses[0].target};
  const started = outcomes.find(o => o.kind === 'pressIn') ?? outcomes.find(o => o.kind === 'responderTerminate');
  if (started) return {cls: 'cancelled', target: started.target};
  if (touch.cancelled) return {cls: 'cancelled', target: null};
  return {cls: 'noTarget', target: null};
}

/** A finished touch with everything the test view shows and saves; no verdict yet. */
export function touchEntry(
  touch: RawTouch,
  touches: readonly RawTouch[],
  outcomes: readonly TouchOutcome[],
  context: {mode: TouchMode; side: TouchSide; screenHeight: number},
): TouchEntry {
  const {cls, target} = classifyTouch(touch, outcomesOf(touch, touches, outcomes));
  return {...touch, mode: context.mode, side: context.side, band: bandOf(touch.y, context.screenHeight), cls, target, verdict: null, intendedTarget: null};
}

// ------------------------------------------------------------------ words

const LABEL_WORDS: Record<string, string> = {
  next: '#next',
  now: '#now',
  waiting: '#w/f',
  someday: '#someday',
  due: '#due',
  overdue: '#due',
  source: 'source',
};

/** A part id in words: `tag:2` → "tag 2", `label:next` → "label #next". */
export function partWords(part: string): string {
  if (part.startsWith('tag:')) return `tag ${part.slice(4)}`;
  if (part.startsWith('label:')) return `label ${LABEL_WORDS[part.slice(6)] ?? part.slice(6)}`;
  if (part === 'noteIcon') return 'note icon';
  if (part === 'rowBody') return 'meeting';
  return part;
}

/** A target id in words: `7:label:next` → "Row 7 · label #next". */
export function targetWords(target: string): string {
  const at = target.indexOf(':');
  if (at < 0) return target;
  return `Row ${target.slice(0, at)} · ${partWords(target.slice(at + 1))}`;
}

const px = (dp: number, pxPerDp: number) => Math.round(dp * pxPerDp);

/** What the last tap hit, for the info column. */
export function describeTouch(e: TouchEntry, pxPerDp: number): string {
  if (e.cls === 'noTarget') return 'Nothing hit';
  const what = e.target ? targetWords(e.target) : 'Press';
  if (e.cls === 'handled') return `${what} · handled`;
  if (e.cls === 'swallowed') return `${what} · swallowed (needs double tap)`;
  return `${e.target ? `${what} · press` : 'Press'} cancelled (moved ${px(e.maxMove, pxPerDp)} px)`;
}

/** Position, band, movement and duration of a tap, for the info column. */
export function touchFacts(e: TouchEntry, pxPerDp: number): string {
  return (
    `#${e.id} · ${e.mode} · ${e.band} · x ${px(e.x, pxPerDp)} y ${px(e.y, pxPerDp)} px · ` +
    `moved ${px(e.maxMove, pxPerDp)} px · ${Math.round(e.endAt - e.startAt)} ms`
  );
}

// ------------------------------------------------------------------ counts

export const TOUCH_CLASSES: readonly TouchClass[] = ['handled', 'swallowed', 'cancelled', 'noTarget'];
export const TOUCH_BANDS: readonly TouchBand[] = ['top', 'middle', 'bottom'];
export const TOUCH_MODES: readonly TouchMode[] = ['finger', 'pen'];
export const TOUCH_SIDES: readonly TouchSide[] = ['left', 'right'];

export interface TouchCell {
  handled: number;
  swallowed: number;
  cancelled: number;
  noTarget: number;
  intended: number;
  notIntended: number;
}

export type TouchCounts = Record<TouchMode, Record<TouchSide, Record<TouchBand, TouchCell>>>;

const emptyCell = (): TouchCell => ({handled: 0, swallowed: 0, cancelled: 0, noTarget: 0, intended: 0, notIntended: 0});

/** Counts per class and verdict, split by mode, side and band. */
export function countTouches(entries: readonly TouchEntry[]): TouchCounts {
  const side = () => ({top: emptyCell(), middle: emptyCell(), bottom: emptyCell()});
  const counts: TouchCounts = {finger: {left: side(), right: side()}, pen: {left: side(), right: side()}};
  for (const e of entries) {
    const cell = counts[e.mode][e.side][e.band];
    cell[e.cls] += 1;
    if (e.verdict) cell[e.verdict] += 1;
  }
  return counts;
}

/** The touch test's glyph per class and verdict (grayscale, no color). */
export const TOUCH_GLYPH = {handled: '●', swallowed: '◐', cancelled: '○', noTarget: '×', intended: '✓', notIntended: '✗'} as const;

/** One summary cell as two lines: classes "●3 ◐1 ○0 ×2", verdicts "✓2 ✗1". */
export function cellLines(cell: TouchCell): [string, string] {
  const text = (keys: readonly (keyof TouchCell)[]) => keys.map(k => `${TOUCH_GLYPH[k]}${cell[k]}`).join(' ');
  return [text(['handled', 'swallowed', 'cancelled', 'noTarget']), text(['intended', 'notIntended'])];
}

// ------------------------------------------------------------------ output

/** The log line for one classified test tap: ids and numbers only, no text. */
export function touchLogLine(e: TouchEntry, pxPerDp: number): string {
  return (
    `touch: ${e.mode} side=${e.side} band=${e.band} class=${e.cls} target=${e.target ?? '-'}` +
    ` x=${px(e.x, pxPerDp)} y=${px(e.y, pxPerDp)} dx=${px(e.endX - e.x, pxPerDp)} dy=${px(e.endY - e.y, pxPerDp)}` +
    ` move=${px(e.maxMove, pxPerDp)} ms=${Math.round(e.endAt - e.startAt)} pointers=${e.pointers} id=${e.id}${e.cancelled ? ' syscancel' : ''}`
  );
}

/** The log line for a verdict, referring to its touch by id. */
export function verdictLogLine(id: number, verdict: TouchVerdict | null): string {
  return `touch verdict: id=${id} verdict=${verdict ?? 'skip'}`;
}

/** The log line for the follow-up tap after "Not intended". */
export function intendedLogLine(id: number, intendedTarget: string): string {
  return `touch intended: id=${id} target=${intendedTarget}`;
}

/** The log line for one touch seen by the app-wide observer: raw numbers only, no outcome. */
export function rawTouchLogLine(t: RawTouch, screenHeight: number, pxPerDp: number): string {
  return (
    `touch(app): band=${bandOf(t.y, screenHeight)} x=${px(t.x, pxPerDp)} y=${px(t.y, pxPerDp)}` +
    ` dx=${px(t.endX - t.x, pxPerDp)} dy=${px(t.endY - t.y, pxPerDp)} move=${px(t.maxMove, pxPerDp)}` +
    ` ms=${Math.round(t.endAt - t.startAt)} pointers=${t.pointers} end=${t.cancelled ? 'cancel' : 'lift'}`
  );
}

export const TOUCH_CSV_HEADER = 'id,mode,side,band,x,y,endX,endY,maxMove,ms,pointers,class,target,verdict,intendedTarget';

/** The session's test taps as CSV (positions in device pixels), header first. */
export function touchCsv(entries: readonly TouchEntry[], pxPerDp: number): string {
  const rows = entries.map(e =>
    [
      e.id,
      e.mode,
      e.side,
      e.band,
      px(e.x, pxPerDp),
      px(e.y, pxPerDp),
      px(e.endX, pxPerDp),
      px(e.endY, pxPerDp),
      px(e.maxMove, pxPerDp),
      Math.round(e.endAt - e.startAt),
      e.pointers,
      e.cls,
      e.target ?? '',
      e.verdict ?? '',
      e.intendedTarget ?? '',
    ].join(','),
  );
  return [TOUCH_CSV_HEADER, ...rows].join('\n') + '\n';
}

/** `entries` with the verdict of touch `id` set (null clears it). */
export function withVerdict(entries: readonly TouchEntry[], id: number, verdict: TouchVerdict | null): TouchEntry[] {
  return entries.map(e => (e.id === id ? {...e, verdict, intendedTarget: verdict === 'notIntended' ? e.intendedTarget : null} : e));
}

/** `entries` with the intended target of touch `id` set. */
export function withIntendedTarget(entries: readonly TouchEntry[], id: number, intendedTarget: string): TouchEntry[] {
  return entries.map(e => (e.id === id ? {...e, intendedTarget} : e));
}
