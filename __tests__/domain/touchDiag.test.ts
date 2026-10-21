import {
  bandOf,
  cellLines,
  classifyTouch,
  countTouches,
  describeTouch,
  intendedLogLine,
  outcomesOf,
  RawTouch,
  rawTouchLogLine,
  targetWords,
  TOUCH_CSV_HEADER,
  touchCsv,
  touchEntry,
  TouchEntry,
  touchFacts,
  touchLogLine,
  TouchOutcome,
  verdictLogLine,
  withIntendedTarget,
  withVerdict,
} from '../../src/domain/touchDiag';

function touch(id: number, startAt: number, endAt: number, extra: Partial<RawTouch> = {}): RawTouch {
  return {id, x: 100, y: 200, endX: 103, endY: 211, maxMove: 11.4, startAt, endAt, pointers: 1, cancelled: false, ...extra};
}
const out = (kind: TouchOutcome['kind'], target: string, at: number, inert = false): TouchOutcome => ({kind, target, at, inert});
const ctx = {mode: 'finger' as const, side: 'left' as const, screenHeight: 1000};

describe('bandOf', () => {
  it('splits the screen into top, middle and bottom 20 %', () => {
    expect([0, 199, 200, 799, 800, 999].map(y => bandOf(y, 1000))).toEqual(['top', 'top', 'middle', 'middle', 'bottom', 'bottom']);
  });
  it('treats an unknown screen height as middle', () => {
    expect(bandOf(10, 0)).toBe('middle');
  });
});

describe('classifyTouch', () => {
  const t = touch(1, 1000, 1140);
  it('is handled when a press fired, with its target', () => {
    expect(classifyTouch(t, [out('pressIn', '7:title', 1010), out('pressOut', '7:title', 1150), out('press', '7:title', 1150)])).toEqual({
      cls: 'handled',
      target: '7:title',
    });
  });
  it('is swallowed when the only press was on a part that needs a second tap (H4)', () => {
    expect(classifyTouch(t, [out('pressIn', '5:label:next', 1010), out('press', '5:label:next', 1150, true)])).toEqual({
      cls: 'swallowed',
      target: '5:label:next',
    });
  });
  it('is handled on the second tap of a double tap', () => {
    expect(classifyTouch(t, [out('press', '5:label:next', 1150)]).cls).toBe('handled');
  });
  it('is cancelled when a press started but none fired (H2)', () => {
    expect(classifyTouch(t, [out('pressIn', '2:checkbox', 1010), out('pressOut', '2:checkbox', 1150)])).toEqual({cls: 'cancelled', target: '2:checkbox'});
  });
  it('is cancelled when a span lost the responder', () => {
    expect(classifyTouch(t, [out('responderTerminate', '3:tag:1', 1100)])).toEqual({cls: 'cancelled', target: '3:tag:1'});
  });
  it('is cancelled when the system cancelled the touch and nothing pressed', () => {
    expect(classifyTouch(touch(1, 0, 10, {cancelled: true}), [])).toEqual({cls: 'cancelled', target: null});
  });
  it('is noTarget when nothing reacted (H3)', () => {
    expect(classifyTouch(t, [])).toEqual({cls: 'noTarget', target: null});
  });
});

describe('outcomesOf', () => {
  it('takes outcomes from just before the start to the end plus the grace time', () => {
    const t = touch(1, 1000, 1100);
    const all = [out('pressIn', '1:title', 940), out('pressIn', '1:title', 960), out('press', '1:title', 1400), out('press', '1:title', 1401)];
    expect(outcomesOf(t, [t], all).map(o => o.at)).toEqual([960, 1400]);
  });
  it('gives an outcome in the overlap of two quick taps to the later touch', () => {
    const a = touch(1, 1000, 1100);
    const b = touch(2, 1250, 1350);
    const all = [out('press', '1:title', 1110), out('pressIn', '1:checkbox', 1255), out('press', '1:checkbox', 1360)];
    expect(outcomesOf(a, [a, b], all).map(o => o.at)).toEqual([1110]);
    expect(outcomesOf(b, [a, b], all).map(o => o.at)).toEqual([1255, 1360]);
  });
});

describe('words', () => {
  const entry = (outcomes: TouchOutcome[], extra: Partial<RawTouch> = {}) => {
    const t = touch(12, 1000, 1140, extra);
    return touchEntry(t, [t], outcomes, ctx);
  };
  it('names targets without any text from the rows', () => {
    expect(targetWords('7:label:next')).toBe('Row 7 · label #next');
    expect(targetWords('3:tag:2')).toBe('Row 3 · tag 2');
    expect(targetWords('4:noteIcon')).toBe('Row 4 · note icon');
    expect(targetWords('6:rowBody')).toBe('Row 6 · meeting');
    expect(targetWords('6:label:source')).toBe('Row 6 · label source');
  });
  it('says what the last tap hit', () => {
    expect(describeTouch(entry([out('press', '7:label:next', 1150, true)]), 1.41)).toBe('Row 7 · label #next · swallowed (needs double tap)');
    expect(describeTouch(entry([out('press', '2:title', 1150)]), 1.41)).toBe('Row 2 · title · handled');
    expect(describeTouch(entry([]), 1.41)).toBe('Nothing hit');
    expect(describeTouch(entry([out('pressIn', '2:title', 1010)], {maxMove: 10}), 1.41)).toBe('Row 2 · title · press cancelled (moved 14 px)');
    expect(describeTouch(entry([], {cancelled: true, maxMove: 10}), 1.41)).toBe('Press cancelled (moved 14 px)');
  });
  it('gives position, band, movement and duration in device pixels', () => {
    expect(touchFacts(entry([]), 1.41)).toBe('#12 · finger · middle · x 141 y 282 px · moved 16 px · 140 ms');
  });
});

describe('counts', () => {
  const e = (mode: TouchEntry['mode'], side: TouchEntry['side'], y: number, cls: TouchEntry['cls'], verdict: TouchEntry['verdict']): TouchEntry => ({
    ...touch(1, 0, 1, {y}),
    mode,
    side,
    band: bandOf(y, 1000),
    cls,
    target: null,
    verdict,
    intendedTarget: null,
  });
  it('splits classes and verdicts by mode, side and band', () => {
    const counts = countTouches([
      e('finger', 'left', 900, 'noTarget', 'notIntended'),
      e('finger', 'left', 950, 'handled', 'intended'),
      e('pen', 'right', 100, 'swallowed', null),
    ]);
    expect(counts.finger.left.bottom).toEqual({handled: 1, swallowed: 0, cancelled: 0, noTarget: 1, intended: 1, notIntended: 1});
    expect(counts.pen.right.top.swallowed).toBe(1);
    expect(counts.finger.right.bottom.handled).toBe(0);
    expect(cellLines(counts.finger.left.bottom)).toEqual(['●1 ◐0 ○0 ×1', '✓1 ✗1']);
  });
});

describe('verdicts', () => {
  const t = touch(4, 0, 10);
  const base = [touchEntry(t, [t], [], ctx)];
  it('sets and clears a verdict, and the intended target only with "not intended"', () => {
    const wrong = withIntendedTarget(withVerdict(base, 4, 'notIntended'), 4, '9:title');
    expect(wrong[0]).toMatchObject({verdict: 'notIntended', intendedTarget: '9:title'});
    expect(withVerdict(wrong, 4, 'intended')[0]).toMatchObject({verdict: 'intended', intendedTarget: null});
    expect(withVerdict(wrong, 4, null)[0]).toMatchObject({verdict: null, intendedTarget: null});
    expect(withVerdict(wrong, 5, 'intended')).toEqual(wrong);
  });
});

describe('output', () => {
  const t = touch(7, 1000, 1140, {y: 950, endY: 961});
  const entry = touchEntry(t, [t], [out('press', '3:tag:1', 1150)], {...ctx, side: 'right'});

  it('logs ids and numbers only, in device pixels', () => {
    expect(touchLogLine(entry, 1)).toBe('touch: finger side=right band=bottom class=handled target=3:tag:1 x=100 y=950 dx=3 dy=11 move=11 ms=140 pointers=1 id=7');
    expect(verdictLogLine(7, 'notIntended')).toBe('touch verdict: id=7 verdict=notIntended');
    expect(verdictLogLine(7, null)).toBe('touch verdict: id=7 verdict=skip');
    expect(intendedLogLine(7, 'none')).toBe('touch intended: id=7 target=none');
    expect(rawTouchLogLine(touch(1, 0, 90, {cancelled: true, pointers: 2}), 1000, 2)).toBe(
      'touch(app): band=middle x=200 y=400 dx=6 dy=22 move=23 ms=90 pointers=2 end=cancel',
    );
  });
  it('writes CSV with the agreed columns', () => {
    const judged = withIntendedTarget(withVerdict([entry], 7, 'notIntended'), 7, '3:title');
    expect(touchCsv(judged, 1).split('\n')).toEqual([TOUCH_CSV_HEADER, '7,finger,right,bottom,100,950,103,961,11,140,1,handled,3:tag:1,notIntended,3:title', '']);
    expect(TOUCH_CSV_HEADER).toBe('id,mode,side,band,x,y,endX,endY,maxMove,ms,pointers,class,target,verdict,intendedTarget');
  });
});
