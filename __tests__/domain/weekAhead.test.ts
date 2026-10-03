import {countMeetingsInRange} from '../../src/domain/meetingSpan';
import {weekAheadOffset, weekAheadRangeIso} from '../../src/domain/weekDate';

const m = (date: string, extra: Partial<{time: string; days: number; cancelled: boolean}> = {}) => ({
  date,
  time: extra.time ?? '',
  days: extra.days ?? 1,
  cancelled: extra.cancelled ?? false,
});

describe('weekAheadOffset / weekAheadRangeIso', () => {
  it('looks at this week Monday to Thursday', () => {
    // 2026-10-01 is a Thursday
    expect(weekAheadOffset(new Date(2026, 9, 1))).toBe(0);
    expect(weekAheadRangeIso(new Date(2026, 9, 1))).toEqual({start: '2026-09-28', end: '2026-10-04'});
    expect(weekAheadOffset(new Date(2026, 8, 28))).toBe(0); // Monday
  });
  it('looks at next week Friday to Sunday', () => {
    expect(weekAheadOffset(new Date(2026, 9, 2))).toBe(1); // Friday
    expect(weekAheadOffset(new Date(2026, 9, 3))).toBe(1); // Saturday
    expect(weekAheadOffset(new Date(2026, 9, 4))).toBe(1); // Sunday
    expect(weekAheadRangeIso(new Date(2026, 9, 3))).toEqual({start: '2026-10-05', end: '2026-10-11'});
  });
});

describe('countMeetingsInRange', () => {
  const start = '2026-10-05';
  const end = '2026-10-11';
  it('counts meetings inside the range, including both ends', () => {
    expect(countMeetingsInRange([m('2026-10-05', {time: '09:00'}), m('2026-10-11')], start, end)).toBe(2);
  });
  it('ignores meetings outside the range', () => {
    expect(countMeetingsInRange([m('2026-10-04', {time: '09:00'}), m('2026-10-12')], start, end)).toBe(0);
  });
  it('counts a multi-day meeting that started before the range once', () => {
    expect(countMeetingsInRange([m('2026-10-03', {days: 3})], start, end)).toBe(1);
    expect(countMeetingsInRange([m('2026-10-03', {days: 2})], start, end)).toBe(0);
  });
  it('counts a multi-day meeting inside the range once', () => {
    expect(countMeetingsInRange([m('2026-10-06', {days: 3})], start, end)).toBe(1);
  });
  it('leaves out cancelled meetings', () => {
    expect(countMeetingsInRange([m('2026-10-06', {cancelled: true})], start, end)).toBe(0);
  });
});
