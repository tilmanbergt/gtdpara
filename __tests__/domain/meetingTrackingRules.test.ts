/** Prep/review tracking applies when any matching setup asks for it (docs/dev/history/technical-design-loops.md §1.2, note-setups §4.2). */
import {isReviewOutstanding, resolveMeetingTracking, trackingSummary} from '../../src/domain/meetingTracking';
import {createNoteSetup, NoteSetup, NoteSetupConfig, seedNoteSetupDefaults} from '../../src/domain/noteSetups';

const setup = (id: string, kind: 'thread' | 'loop', tags: string[], extra: Partial<NoteSetup> = {}): NoteSetup => ({
  ...createNoteSetup(id, kind),
  name: id,
  tags,
  ...extra,
});
const config = (setups: NoteSetup[], trackPrep = false): NoteSetupConfig => ({
  setups,
  defaults: {...seedNoteSetupDefaults(), tracking: {trackPrep, trackReview: false}},
});
const NOW = new Date('2026-10-10T08:00:00');
const meeting = (tags: string[], date = '2026-10-12') => ({date, time: '', tags, cancelled: false});

describe('resolveMeetingTracking', () => {
  it('tracks when a later matching setup asks for it', () => {
    const setups = [setup('jf', 'thread', ['jf']), setup('workshop', 'loop', ['workshop'], {tracking: {trackPrep: true, trackReview: false}})];
    expect(resolveMeetingTracking(meeting(['jf/demand', 'workshop/offsite']), config(setups), NOW)).toEqual({kind: 'prep', done: false});
  });
  it("falls back to the Default's tracking only when no setup matches", () => {
    expect(resolveMeetingTracking(meeting(['x']), config([], true), NOW)).toEqual({kind: 'prep', done: false});
    expect(resolveMeetingTracking(meeting(['x']), config([]), NOW)).toBeNull();
    expect(resolveMeetingTracking(meeting(['jf']), config([setup('jf', 'thread', ['jf'])], true), NOW)).toBeNull();
  });
  it('ignores disabled setups and cancelled meetings', () => {
    const tracked = setup('jf', 'thread', ['jf'], {tracking: {trackPrep: true, trackReview: true}});
    expect(resolveMeetingTracking(meeting(['jf']), config([{...tracked, enabled: false}]), NOW)).toBeNull();
    expect(resolveMeetingTracking({...meeting(['jf']), cancelled: true}, config([tracked]), NOW)).toBeNull();
  });
  it('review phase after the meeting; outstanding within the lookback', () => {
    const tracked = setup('jf', 'thread', ['jf'], {tracking: {trackPrep: false, trackReview: true}});
    expect(resolveMeetingTracking(meeting(['jf'], '2026-10-08'), config([tracked]), NOW)).toEqual({kind: 'review', done: false});
    expect(isReviewOutstanding(meeting(['jf'], '2026-10-08'), config([tracked]), NOW)).toBe(true);
    expect(isReviewOutstanding(meeting(['jf', 'reviewed'], '2026-10-08'), config([tracked]), NOW)).toBe(false);
  });
});

describe('trackingSummary', () => {
  it('names what is tracked', () => {
    expect(trackingSummary({trackPrep: true, trackReview: true})).toBe('prep + review');
    expect(trackingSummary({trackPrep: false, trackReview: true})).toBe('review');
    expect(trackingSummary({trackPrep: false, trackReview: false})).toBe('');
  });
});
