// docs/dev/history/technical-design-meetings-0.21.md R2, R4, §3.1: the moment by time, the strip's buttons,
// the previous meeting and whether a next one is needed.
import {EngageItemRef, MeetingEntryRef} from '../../src/domain/engageOwner';
import {hasMeetingAfter, MeetingMoment, momentByTime, previousMeeting, StripInput, stripActions} from '../../src/domain/meetingMoment';
import {isCheckpointTicked, tracksCheckpoint} from '../../src/domain/meetingTracking';
import {deriveMeetingFields} from '../../src/domain/markdown';
import {createNoteSetup, NoteSetupConfig, seedNoteSetupDefaults} from '../../src/domain/noteSetups';
import {Meeting} from '../../src/domain/types';
import {meeting} from '../../test-helpers/fixtures';

const at = (day: number, h: number, m = 0) => new Date(2026, 9, day, h, m).getTime();
const timed = meeting('2026-10-24', 'Sparring Mieke #sparring/mieke', {time: '10:00', endTime: '11:00', tags: ['sparring/mieke']});

describe('momentByTime (R2)', () => {
  it.each([
    ['a week before', at(17, 10), 'before'],
    ['one minute before the start', at(24, 9, 59), 'before'],
    ['at the start', at(24, 10), 'during'],
    ['one minute before the planned end', at(24, 10, 59), 'during'],
    ['at the end: no grace', at(24, 11), 'after'],
    ['6 days later', at(30, 10), 'after'],
    ['7 days after the end', at(31, 11), null],
  ] as const)('timed, %s → %s', (_label, now, moment) => {
    expect(momentByTime(timed, now)).toBe(moment);
  });

  it('timed without an end: one hour', () => {
    const noEnd = {...timed, endTime: ''};
    expect(momentByTime(noEnd, at(24, 10, 59))).toBe('during');
    expect(momentByTime(noEnd, at(24, 11))).toBe('after');
  });

  it('date-only: before its date, on its date, after it', () => {
    const allDay = meeting('2026-10-24', 'Offsite');
    expect(momentByTime(allDay, at(23, 23, 59))).toBe('before');
    expect(momentByTime(allDay, at(24, 0))).toBe('during');
    expect(momentByTime(allDay, at(24, 23, 59))).toBe('during');
    expect(momentByTime(allDay, at(25, 0))).toBe('after');
  });

  it('multi-day: During on every one of its days', () => {
    const threeDays = meeting('2026-10-24', 'Offsite', {days: 3});
    expect(momentByTime(threeDays, at(26, 18))).toBe('during');
    expect(momentByTime(threeDays, at(27, 0))).toBe('after');
  });

  it('cancelled: none', () => {
    expect(momentByTime({...timed, cancelled: true}, at(24, 10, 30))).toBeNull();
  });
});

describe('stripActions (R4)', () => {
  const none: StripInput = {tracksPrep: false, prepped: false, tracksReview: false, reviewed: false, lastHasNote: false, nextNeeded: false, onReflectionPage: false};
  const all: StripInput = {...none, tracksPrep: true, tracksReview: true, lastHasNote: true, nextNeeded: true};
  it.each([
    ['before', all, ['markPrepped', 'lastNote']],
    ['before', {...all, prepped: true}, ['lastNote']],
    ['before', {...all, tracksPrep: false, lastHasNote: false}, []],
    ['during', all, ['nextMeeting']],
    ['during', {...all, nextNeeded: false}, []],
    ['after', all, ['reflect', 'markReviewed', 'nextMeeting']],
    ['after', {...all, reviewed: true}, ['reflect', 'nextMeeting']],
    ['after', {...all, onReflectionPage: true}, ['markReviewed', 'nextMeeting']],
    ['after', none, ['reflect']],
  ] as Array<[MeetingMoment, StripInput, string[]]>)('%s with %j → %j', (moment, input, actions) => {
    expect(stripActions(moment, input)).toEqual(actions);
  });
});

describe('previousMeeting and hasMeetingAfter', () => {
  const ref: EngageItemRef = {kind: 'area', name: 'Coaching', path: '/c', abbrev: null};
  const entry = (m: Meeting, i: number): MeetingEntryRef => ({item: ref, meetingIndex: i, meeting: m});
  const m1 = entry(meeting('2026-10-07', 'Sparring', {time: '10:00'}), 0);
  const m2 = entry(meeting('2026-10-14', 'Sparring', {time: '10:00'}), 1);
  const m3 = entry(timed, 2);
  const cancelled = entry(meeting('2026-10-20', 'Sparring', {time: '10:00', cancelled: true}), 3);
  const later = entry(meeting('2026-11-06', 'Sparring', {time: '10:00'}), 4);

  it('the latest one starting before, cancelled ones left out', () => {
    expect(previousMeeting([m1, m2, m3, cancelled], m3)).toBe(m2);
    expect(previousMeeting([m2, m1], m1)).toBeNull();
  });

  it('a meeting after: not cancelled, not itself', () => {
    expect(hasMeetingAfter([m1, m2, m3, cancelled], m2)).toBe(true);
    expect(hasMeetingAfter([m1, m2, m3, cancelled], m3)).toBe(false);
    expect(hasMeetingAfter([m3, later], m3)).toBe(true);
  });
});

describe('tracksCheckpoint / isCheckpointTicked', () => {
  const sparring = {...timed, ...deriveMeetingFields(timed.title)};
  const CONFIG: NoteSetupConfig = {
    setups: [{...createNoteSetup('s', 'thread'), name: 'Sparring', tags: ['sparring'], tracking: {trackPrep: true, trackReview: false}}],
    defaults: seedNoteSetupDefaults(),
  };
  it('asks the matching setup per checkpoint, whatever the time', () => {
    expect(tracksCheckpoint(sparring, CONFIG, 'prep')).toBe(true);
    expect(tracksCheckpoint(sparring, CONFIG, 'review')).toBe(false);
    expect(tracksCheckpoint({...sparring, cancelled: true}, CONFIG, 'prep')).toBe(false);
  });
  it('reads the tick from the tags', () => {
    expect(isCheckpointTicked({tags: ['prepped']}, 'prep')).toBe(true);
    expect(isCheckpointTicked({tags: ['prepped']}, 'review')).toBe(false);
  });
});
