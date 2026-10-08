// docs/dev/history/technical-design-tending-threads.md §3.6: "+ Next <type>".
import {deriveMeetingFields} from '../../src/domain/markdown';
import {nextMeetingSeed} from '../../src/domain/nextMeeting';
import {Meeting} from '../../src/domain/types';
import {meeting} from '../../test-helpers/fixtures';

function m(date: string, title: string, extra: Partial<Meeting> = {}): Meeting {
  return meeting(date, title, {...deriveMeetingFields(title), ...extra});
}

describe('nextMeetingSeed', () => {
  it('is null without a meeting', () => {
    expect(nextMeetingSeed([], '2026-10-08')).toBeNull();
    expect(nextMeetingSeed([m('2026-10-01', 'Retro', {cancelled: true})], '2026-10-08')).toBeNull();
  });

  it('repeats the interval of the two latest meetings', () => {
    const seed = nextMeetingSeed(
      [m('2026-09-16', 'Retro #retro/alpha', {time: '10:00', endTime: '11:00'}), m('2026-09-30', 'Retro #retro/alpha #reviewed', {time: '10:00', endTime: '11:30'})],
      '2026-10-08',
    );
    expect(seed).toEqual({title: 'Retro #retro/alpha', date: '2026-10-14', time: '10:00', endTime: '11:30', days: 1});
  });

  it('uses a week when there is one meeting only', () => {
    expect(nextMeetingSeed([m('2026-10-06', 'Retro')], '2026-10-08')?.date).toBe('2026-10-13');
  });

  it('goes past a meeting already planned in the future', () => {
    const seed = nextMeetingSeed([m('2026-10-01', 'Retro'), m('2026-10-15', 'Retro')], '2026-10-08');
    expect(seed?.date).toBe('2026-10-29');
  });

  it('steps forward past today', () => {
    const seed = nextMeetingSeed([m('2026-08-01', 'Retro'), m('2026-08-08', 'Retro')], '2026-10-08');
    expect(seed?.date).toBe('2026-10-10');
  });

  it('lands on today when the step hits it', () => {
    expect(nextMeetingSeed([m('2026-10-01', 'Retro')], '2026-10-08')?.date).toBe('2026-10-08');
  });

  it('copies the length of a multi-day meeting', () => {
    const seed = nextMeetingSeed([m('2026-06-01', 'Offsite #off/team', {days: 3}), m('2026-09-01', 'Offsite #off/team', {days: 3})], '2026-10-08');
    expect(seed).toMatchObject({time: '', endTime: '', days: 3, date: '2026-12-02'});
  });

  it('treats two meetings on the same day as one interval of a week', () => {
    expect(nextMeetingSeed([m('2026-10-06', 'A', {time: '09:00'}), m('2026-10-06', 'B', {time: '15:00'})], '2026-10-08')).toMatchObject({
      title: 'B',
      date: '2026-10-13',
      time: '15:00',
    });
  });
});
