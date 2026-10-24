/**
 * State tags out of the edit title (docs/dev/history/technical-design-meeting-reflection.md
 * §2.5, M7): the edit form shows no #prepped/#reviewed, and Save keeps the meeting's
 * current state - a tick made in the toolbar while the edit is open survives Save.
 */
jest.mock('sn-plugin-lib', () => ({NativePluginManager: {}, PluginManager: {}, PluginCommAPI: {}, PluginFileAPI: {}, PluginNoteAPI: {}}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
let mockCachedItems: Array<{path: string; meetings: unknown[]}> = [];
jest.mock('../../src/storage/dataCache', () => ({
  ...jest.requireActual('../../src/storage/dataCache'),
  findCachedItem: (path: string) => mockCachedItems.find(i => i.path === path),
}));

import {deriveMeetingFields} from '../../src/domain/markdown';
import {toggleMeetingTrackingAt} from '../../src/domain/meetingTracking';
import {Meeting} from '../../src/domain/types';
import {applyMeetingEdit, currentEntryMeeting} from '../../src/storage/itemMutations';
import {loadEditFields} from '../../src/ui/quickAdd/editFields';
import {item, meeting} from '../../test-helpers/fixtures';

const titled = (title: string): Meeting => meeting('2026-10-18', title, {time: '10:00', endTime: '11:00', ...deriveMeetingFields(title)});

afterEach(() => (mockCachedItems = []));

it('loads the title without #prepped and #reviewed, and without #monthly', () => {
  const loaded = loadEditFields(undefined, titled('Sparring Mieke #sparring/mieke #prepped #monthly'));
  expect(loaded?.kind === 'meeting' && loaded.fields.title).toBe('Sparring Mieke #sparring/mieke');
  expect(loaded?.kind === 'meeting' && loaded.fields.monthly).toBe(true);
});

it('Save after a toolbar tick keeps the new title and both ticks', () => {
  const opened = titled('Sparring Mieke #sparring/mieke #prepped');
  const loaded = loadEditFields(undefined, opened);
  if (loaded?.kind !== 'meeting') throw new Error('not a meeting edit');

  // The toolbar ticks reviewed on the stored copy while the edit is open.
  const [ticked] = toggleMeetingTrackingAt([opened], 0, 'review');
  const fields = {title: 'Sparring Mieke roles #sparring/mieke', date: opened.date, time: '10:00', endTime: '11:00'};
  const saved = applyMeetingEdit(ticked, fields, '');
  expect(saved.title).toBe('Sparring Mieke roles #sparring/mieke #prepped #reviewed');
  expect(saved.tags).toEqual(expect.arrayContaining(['prepped', 'reviewed', 'sparring/mieke']));
});

it('reads the stored copy for a move, not the entry the screen rendered', () => {
  const rendered = titled('Sparring #sparring #prepped');
  const [stored] = toggleMeetingTrackingAt([rendered], 0, 'review');
  const area = item('area', 'Coaching', {meetings: [stored]});
  mockCachedItems = [area];
  const entry = {item: {kind: 'area' as const, path: area.path}, meetingIndex: 0, meeting: rendered};
  expect(currentEntryMeeting(entry, {inbox: null, inboxPath: null}).title).toBe('Sparring #sparring #prepped #reviewed');
  expect(currentEntryMeeting({...entry, meetingIndex: 3}, {inbox: null, inboxPath: null})).toBe(rendered);
});
