/** The meeting-list toolbar's slots (docs/dev/history/technical-design-meeting-reflection.md §2.6, M3-M4). */
import {emptyToolbarSlots, meetingToolbarSlots, toolbarSlotText, ToolbarSlot} from '../../src/domain/meetingToolbar';
import {createNoteSetup, NoteSetupConfig} from '../../src/domain/noteSetups';
import {Meeting} from '../../src/domain/types';
import {deriveMeetingFields} from '../../src/domain/markdown';
import {meeting} from '../../test-helpers/fixtures';

const nowMs = new Date(2026, 9, 21, 12, 0).getTime();
const sparring = {...createNoteSetup('1', 'thread'), name: 'Sparring', tags: ['sparring'], tracking: {trackPrep: true, trackReview: true}};
const reviewOnly = {...sparring, tracking: {trackPrep: false, trackReview: true}};
const config = (setup = sparring): NoteSetupConfig => ({setups: [setup], defaults: {pages: {}, tracking: {trackPrep: false, trackReview: false}, notebook: null}});

const m = (date: string, title: string, extra: Partial<Meeting> = {}) => meeting(date, title, {time: '10:00', endTime: '11:00', ...deriveMeetingFields(title), ...extra});
const before = m('2026-10-23', 'Sparring #sparring/mieke');
const over = m('2026-10-18', 'Sparring #sparring/mieke');

const texts = (slots: ToolbarSlot[]) => slots.map(toolbarSlotText);
const slots = (meetingIn: Meeting | null, extra: Partial<Parameters<typeof meetingToolbarSlots>[0]> = {}) =>
  meetingToolbarSlots({meeting: meetingIn, setups: config(), nowMs, reflection: 'none', canLink: false, ...extra});

describe('meetingToolbarSlots', () => {
  it('before the meeting: Prepped only when tracked', () => {
    expect(texts(slots(before))).toEqual(['☐ Prepped']);
    expect(texts(meetingToolbarSlots({meeting: before, setups: config(reviewOnly), nowMs, reflection: 'none', canLink: false}))).toEqual([]);
  });

  it('after the meeting: Reviewed and Reflect', () => {
    expect(texts(slots(over))).toEqual(['☐ Reviewed', 'Reflect ›']);
    expect(texts(slots(m('2026-10-18', 'Sparring #sparring/mieke #reviewed')))).toEqual(['✓ Reviewed', 'Reflect ›']);
  });

  it('a cancelled meeting gets nothing', () => {
    expect(slots(m('2026-10-18', 'Sparring #sparring', {cancelled: true}))).toEqual([]);
  });

  it('an untracked meeting that is over: Reflect only', () => {
    expect(texts(slots(m('2026-10-18', 'Lunch with Anna')))).toEqual(['Reflect ›']);
  });

  it('Link file where the list can link', () => {
    expect(texts(slots(before, {canLink: true}))).toEqual(['☐ Prepped', 'Link file']);
  });

  it('while the lookup runs, Reflect is disabled; once a page exists it says Reflection', () => {
    expect(slots(over, {reflection: 'unknown'})[1]).toEqual({kind: 'reflection', label: 'Reflect ›', pending: true});
    expect(slots(over, {reflection: 'exists'})[1]).toEqual({kind: 'reflection', label: 'Reflection ›', pending: false});
  });

  it('nothing selected: no slots; the empty row shows greyed ones', () => {
    expect(slots(null)).toEqual([]);
    expect(texts(emptyToolbarSlots(true))).toEqual(['Reflect ›', 'Link file']);
    expect(texts(emptyToolbarSlots(false))).toEqual(['Reflect ›']);
  });
});
