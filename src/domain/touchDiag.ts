/**
 * The touch test's bookkeeping (Settings → Advanced → Touch test): which
 * class a recorded touch falls into, given the press events the test rows
 * reported while it lasted. Pure, so the rules that tell the hypotheses apart
 * are tested on their own:
 *
 * - `handled`: a press fired on a real target.
 * - `cancelled`: a press started (pressIn) or the system cancelled the touch,
 *   but no press fired - finger jitter or contact size ended it (H2).
 * - `noTarget`: the touch reached the app but nothing took it - dead area
 *   between targets, or a span that only reacts to something else (H3/H4).
 * - `swallowed`: the only press was a single tap on the `#next`/`#now` label,
 *   which waits for a second tap and does nothing on its own (H4).
 *
 * A touch the host never passes on (H1) leaves no record at all; it shows as
 * a numbered target tapped without a new marker.
 */

export type TouchMode = 'finger' | 'pen';
export type TouchBand = 'top' | 'middle' | 'bottom';
export type TouchClass = 'handled' | 'cancelled' | 'noTarget' | 'swallowed';
/** What a test row reports a press on. `nowToggle` is the second tap of a `#next` double tap. */
export type TouchTarget = 'row' | 'title' | 'tag' | 'label' | 'next' | 'nowToggle' | 'checkbox' | 'note' | 'clip' | 'source';
export type OutcomeKind = 'pressIn' | 'pressOut' | 'press' | 'responderTerminate';

/** One finger or pen contact as the root observer saw it. Positions in dp, times in ms (one clock). */
export interface RawTouch {
  id: number;
  x: number;
  y: number;
  endX: number;
  endY: number;
  /** Largest distance from the start point while the touch lasted. */
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
  target: TouchTarget;
  at: number;
}

export interface TouchEntry extends RawTouch {
  mode: TouchMode;
  band: TouchBand;
  cls: TouchClass;
  /** The target a press fired on (the first one), or null. */
  target: TouchTarget | null;
}

/** How long after a touch ends its press events may still arrive (pressOut waits for a minimum press time). */
export const OUTCOME_GRACE_MS = 300;
/** A pressIn can be dispatched just before the observer's own touch start. */
export const OUTCOME_EARLY_MS = 50;
/** The top and bottom bands are this share of the screen height each. */
export const EDGE_BAND_SHARE = 0.2;

export function bandOf(y: number, screenHeight: number): TouchBand {
  if (screenHeight <= 0) return 'middle';
  if (y < screenHeight * EDGE_BAND_SHARE) return 'top';
  if (y >= screenHeight * (1 - EDGE_BAND_SHARE)) return 'bottom';
  return 'middle';
}

/**
 * The outcomes that belong to `touch`: those inside its time window and not
 * claimed by a later touch whose window also holds them (quick taps overlap
 * in the grace period; an outcome goes to the latest touch that started
 * before it).
 */
export function outcomesOf(touch: RawTouch, touches: readonly RawTouch[], outcomes: readonly TouchOutcome[]): TouchOutcome[] {
  const inWindow = (t: RawTouch, o: TouchOutcome) => o.at >= t.startAt - OUTCOME_EARLY_MS && o.at <= t.endAt + OUTCOME_GRACE_MS;
  return outcomes.filter(o => {
    if (!inWindow(touch, o)) return false;
    const owner = touches
      .filter(t => inWindow(t, o))
      .reduce<RawTouch | null>((best, t) => (best === null || t.startAt > best.startAt ? t : best), null);
    return owner === null || owner.id === touch.id;
  });
}

/** The class of one touch from its own outcomes - see the module doc comment. */
export function classifyTouch(touch: RawTouch, outcomes: readonly TouchOutcome[]): {cls: TouchClass; target: TouchTarget | null} {
  const presses = outcomes.filter(o => o.kind === 'press');
  const real = presses.find(o => o.target !== 'next');
  if (real) return {cls: 'handled', target: real.target};
  if (presses.length > 0) return {cls: 'swallowed', target: 'next'};
  const pressIn = outcomes.find(o => o.kind === 'pressIn');
  if (pressIn) return {cls: 'cancelled', target: pressIn.target};
  const terminated = outcomes.find(o => o.kind === 'responderTerminate');
  if (terminated) return {cls: 'cancelled', target: terminated.target};
  if (touch.cancelled) return {cls: 'cancelled', target: null};
  return {cls: 'noTarget', target: null};
}

/** A finished touch with everything the test view shows and saves. */
export function touchEntry(
  touch: RawTouch,
  touches: readonly RawTouch[],
  outcomes: readonly TouchOutcome[],
  mode: TouchMode,
  screenHeight: number,
): TouchEntry {
  const {cls, target} = classifyTouch(touch, outcomesOf(touch, touches, outcomes));
  return {...touch, mode, band: bandOf(touch.y, screenHeight), cls, target};
}

export const TOUCH_CLASSES: readonly TouchClass[] = ['handled', 'cancelled', 'noTarget', 'swallowed'];
export const TOUCH_BANDS: readonly TouchBand[] = ['top', 'middle', 'bottom'];
export const TOUCH_MODES: readonly TouchMode[] = ['finger', 'pen'];

export type TouchCounts = Record<TouchMode, Record<TouchBand, Record<TouchClass, number>>>;

export function countTouches(entries: readonly TouchEntry[]): TouchCounts {
  const zero = (): Record<TouchClass, number> => ({handled: 0, cancelled: 0, noTarget: 0, swallowed: 0});
  const band = (): Record<TouchBand, Record<TouchClass, number>> => ({top: zero(), middle: zero(), bottom: zero()});
  const counts: TouchCounts = {finger: band(), pen: band()};
  for (const e of entries) counts[e.mode][e.band][e.cls] += 1;
  return counts;
}

const round = (n: number) => Math.round(n);

/** The log line for one classified touch: numbers and classes only, no text. */
export function touchLogLine(e: TouchEntry): string {
  return (
    `touch: ${e.mode} band=${e.band} class=${e.cls} x=${round(e.x)} y=${round(e.y)}` +
    ` dx=${round(e.endX - e.x)} dy=${round(e.endY - e.y)} move=${round(e.maxMove)} ms=${round(e.endAt - e.startAt)}` +
    ` target=${e.target ?? '-'} pointers=${e.pointers}${e.cancelled ? ' syscancel' : ''}`
  );
}

/** The log line for one touch seen by the app-wide observer: raw numbers only, no outcome. */
export function rawTouchLogLine(t: RawTouch, screenHeight: number): string {
  return (
    `touch(app): band=${bandOf(t.y, screenHeight)} x=${round(t.x)} y=${round(t.y)}` +
    ` dx=${round(t.endX - t.x)} dy=${round(t.endY - t.y)} move=${round(t.maxMove)} ms=${round(t.endAt - t.startAt)}` +
    ` pointers=${t.pointers} end=${t.cancelled ? 'cancel' : 'lift'}`
  );
}

export const TOUCH_CSV_HEADER = 'id,mode,band,x,y,endX,endY,maxMove,ms,class,target,pointers';

/** The session's touches as CSV (positions in dp), header first. */
export function touchCsv(entries: readonly TouchEntry[]): string {
  const rows = entries.map(e =>
    [e.id, e.mode, e.band, round(e.x), round(e.y), round(e.endX), round(e.endY), round(e.maxMove), round(e.endAt - e.startAt), e.cls, e.target ?? '', e.pointers].join(','),
  );
  return [TOUCH_CSV_HEADER, ...rows].join('\n') + '\n';
}
