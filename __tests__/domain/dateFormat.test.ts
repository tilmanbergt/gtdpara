import {
  formatClock,
  formatDate,
  formatDateRange,
  formatDateTime,
  formatDayHeader,
  formatStamp,
  formatTime,
  formatWeekdayDate,
} from '../../src/domain/dateFormat';

const TODAY = '2026-10-06';

describe('dateFormat', () => {
  it('writes day.month. without leading zeros, the year only for another year', () => {
    expect(formatDate('2026-10-05', TODAY)).toBe('5.10.');
    expect(formatDate('2026-01-09', TODAY)).toBe('9.1.');
    expect(formatDate('2027-01-05', TODAY)).toBe('5.1.2027');
    expect(formatDate('2025-12-31', TODAY)).toBe('31.12.2025');
  });
  it('always adds the year without a today', () => {
    expect(formatDate('2026-10-05')).toBe('5.10.2026');
  });
  it('leaves anything that is not a date unchanged', () => {
    expect(formatDate('soon', TODAY)).toBe('soon');
    expect(formatDate('2026-13-01', TODAY)).toBe('2026-13-01');
    expect(formatDate('', TODAY)).toBe('');
  });
  it('writes times in 24 h without a leading zero on the hour', () => {
    expect(formatTime('09:05')).toBe('9:05');
    expect(formatTime('14:00')).toBe('14:00');
    expect(formatTime('00:30')).toBe('0:30');
    expect(formatTime('later')).toBe('later');
  });
  it('combines date and time', () => {
    expect(formatDateTime('2026-10-06', '09:05', TODAY)).toBe('6.10. 9:05');
    expect(formatDateTime('2026-10-06', '', TODAY)).toBe('6.10.');
    expect(formatStamp('2026-10-05T10:42', TODAY)).toBe('5.10. 10:42');
    expect(formatStamp('2026-10-05 08:07', TODAY)).toBe('5.10. 8:07');
    expect(formatStamp('garbage', TODAY)).toBe('garbage');
  });
  it('day headers carry the weekday', () => {
    expect(formatDayHeader('2026-10-06', TODAY)).toBe('Tue 6.10.');
    expect(formatDayHeader('2026-09-21')).toBe('Mon 21.9.2026');
    expect(formatWeekdayDate(new Date(2026, 8, 28), TODAY)).toBe('Mon 28.9.');
  });
  it('ranges', () => {
    expect(formatDateRange('2026-05-15', '2026-05-16', TODAY)).toBe('15.5.–16.5.');
    expect(formatDateRange('2026-12-30', '2027-01-02', TODAY)).toBe('30.12.–2.1.2027');
    expect(formatDateRange('2026-05-15', '2026-05-15', TODAY)).toBe('15.5.');
  });
  it('clock time of a Date', () => {
    expect(formatClock(new Date(2026, 9, 6, 9, 5))).toBe('9:05');
    expect(formatClock(new Date(2026, 9, 6, 14, 30))).toBe('14:30');
  });
});
