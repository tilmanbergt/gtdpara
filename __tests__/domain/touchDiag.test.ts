import {
  bandOf,
  classifyTouch,
  countTouches,
  outcomesOf,
  RawTouch,
  rawTouchLogLine,
  TOUCH_CSV_HEADER,
  touchCsv,
  touchEntry,
  touchLogLine,
  TouchOutcome,
} from '../../src/domain/touchDiag';

function touch(id: number, startAt: number, endAt: number, extra: Partial<RawTouch> = {}): RawTouch {
  return {id, x: 100, y: 200, endX: 103, endY: 211, maxMove: 11.4, startAt, endAt, pointers: 1, cancelled: false, ...extra};
}
const out = (kind: TouchOutcome['kind'], target: TouchOutcome['target'], at: number): TouchOutcome => ({kind, target, at});

describe('bandOf', () => {
  it('splits the screen into top, middle and bottom 20 %', () => {
    expect(bandOf(0, 1000)).toBe('top');
    expect(bandOf(199, 1000)).toBe('top');
    expect(bandOf(200, 1000)).toBe('middle');
    expect(bandOf(799, 1000)).toBe('middle');
    expect(bandOf(800, 1000)).toBe('bottom');
    expect(bandOf(999, 1000)).toBe('bottom');
  });
  it('treats an unknown screen height as middle', () => {
    expect(bandOf(10, 0)).toBe('middle');
  });
});

describe('classifyTouch', () => {
  const t = touch(1, 1000, 1140);
  it('is handled when a press fired, with its target', () => {
    expect(classifyTouch(t, [out('pressIn', 'title', 1010), out('pressOut', 'title', 1150), out('press', 'title', 1150)])).toEqual({
      cls: 'handled',
      target: 'title',
    });
  });
  it('is cancelled when a press started but none fired (H2)', () => {
    expect(classifyTouch(t, [out('pressIn', 'checkbox', 1010), out('pressOut', 'checkbox', 1150)])).toEqual({cls: 'cancelled', target: 'checkbox'});
  });
  it('is cancelled when a span lost the responder', () => {
    expect(classifyTouch(t, [out('responderTerminate', 'tag', 1100)])).toEqual({cls: 'cancelled', target: 'tag'});
  });
  it('is cancelled when the system cancelled the touch and nothing pressed', () => {
    expect(classifyTouch(touch(1, 0, 10, {cancelled: true}), [])).toEqual({cls: 'cancelled', target: null});
  });
  it('is noTarget when nothing reacted (H3/H4)', () => {
    expect(classifyTouch(t, [])).toEqual({cls: 'noTarget', target: null});
  });
  it('is swallowed when the only press was a single tap on #next (H4)', () => {
    expect(classifyTouch(t, [out('pressIn', 'next', 1010), out('press', 'next', 1150)])).toEqual({cls: 'swallowed', target: 'next'});
  });
  it('is handled on the second tap of a #next double tap', () => {
    expect(classifyTouch(t, [out('press', 'next', 1150), out('press', 'nowToggle', 1150)])).toEqual({cls: 'handled', target: 'nowToggle'});
  });
});

describe('outcomesOf', () => {
  it('takes outcomes from just before the start to the end plus the grace time', () => {
    const t = touch(1, 1000, 1100);
    const all = [out('pressIn', 'title', 940), out('pressIn', 'title', 960), out('press', 'title', 1400), out('press', 'title', 1401)];
    expect(outcomesOf(t, [t], all).map(o => o.at)).toEqual([960, 1400]);
  });
  it('gives an outcome in the overlap of two quick taps to the later touch', () => {
    const a = touch(1, 1000, 1100);
    const b = touch(2, 1250, 1350);
    const all = [out('press', 'title', 1110), out('pressIn', 'checkbox', 1255), out('press', 'checkbox', 1360)];
    expect(outcomesOf(a, [a, b], all).map(o => o.at)).toEqual([1110]);
    expect(outcomesOf(b, [a, b], all).map(o => o.at)).toEqual([1255, 1360]);
  });
});

describe('touchEntry and output', () => {
  const t = touch(7, 1000, 1140, {y: 1250, endY: 1261});
  const entry = touchEntry(t, [t], [], 'finger', 1300);

  it('adds mode, band and class', () => {
    expect(entry).toMatchObject({id: 7, mode: 'finger', band: 'bottom', cls: 'noTarget', target: null});
  });
  it('logs numbers only', () => {
    expect(touchLogLine(entry)).toBe('touch: finger band=bottom class=noTarget x=100 y=1250 dx=3 dy=11 move=11 ms=140 target=- pointers=1');
    expect(rawTouchLogLine(touch(1, 0, 90, {cancelled: true, pointers: 2}), 1000)).toBe(
      'touch(app): band=middle x=100 y=200 dx=3 dy=11 move=11 ms=90 pointers=2 end=cancel',
    );
  });
  it('writes CSV with the agreed columns', () => {
    const handled = touchEntry(touch(8, 0, 50), [touch(8, 0, 50)], [out('press', 'clip', 60)], 'pen', 1000);
    expect(touchCsv([entry, handled]).split('\n')).toEqual([
      TOUCH_CSV_HEADER,
      '7,finger,bottom,100,1250,103,1261,11,140,noTarget,,1',
      '8,pen,middle,100,200,103,211,11,50,handled,clip,1',
      '',
    ]);
  });
  it('counts per mode, band and class', () => {
    const counts = countTouches([entry, entry, touchEntry(touch(9, 0, 1), [touch(9, 0, 1)], [], 'pen', 1300)]);
    expect(counts.finger.bottom.noTarget).toBe(2);
    expect(counts.pen.top.noTarget).toBe(1);
    expect(counts.finger.top.handled).toBe(0);
  });
});
