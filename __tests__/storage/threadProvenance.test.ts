// docs/dev/history/technical-design-tending-threads.md §3.4: the meeting a captured note page belongs to.
const mockKeywordCalls: Array<[string, number[]]> = [];
let mockKeywords: Array<{page: number; keyword: string}> = [];
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
jest.mock('../../src/supernote/fileSystem', () => ({
  getKeyWords: async (path: string, pages: number[]) => {
    mockKeywordCalls.push([path, pages]);
    return mockKeywords;
  },
}));

import {Meeting} from '../../src/domain/types';
import {ThreadSource} from '../../src/storage/threadAggregate';
import {meetingForNotePage} from '../../src/storage/threadProvenance';
import {meeting} from '../../test-helpers/fixtures';

const AREA = '/Note/2 Areas/Coaching';
function source(meetings: Meeting[]): ThreadSource {
  return {ref: {kind: 'area', name: 'Coaching', path: AREA, abbrev: null}, tasks: [], meetings};
}

beforeEach(() => {
  mockKeywordCalls.length = 0;
  mockKeywords = [];
});

describe('meetingForNotePage', () => {
  it('finds the meeting whose own note it is, without a device call', async () => {
    const own = meeting('2026-09-30', 'Retro', {notePath: 'Meetings/2026-09-30 - Retro.note'});
    const hit = await meetingForNotePage(`${AREA}/Meetings/2026-09-30 - Retro.note`, 2, [source([meeting('2026-09-01', 'x'), own])]);
    expect(hit?.meetingIndex).toBe(1);
    expect(mockKeywordCalls).toHaveLength(0);
  });

  it('finds a page link only on its page', async () => {
    const linked = meeting('2026-09-30', 'Retro', {notePath: '/Note/Notebook.note#page=3'});
    expect((await meetingForNotePage('/Note/Notebook.note', 2, [source([linked])]))?.meeting).toBe(linked);
    expect(await meetingForNotePage('/Note/Notebook.note', 1, [source([linked])])).toBeNull();
  });

  it('reads the page keywords of a shared note once', async () => {
    const a = meeting('2026-09-23', 'Retro #retro/alpha', {notePath: 'Meetings/Retro 2026.note#2026-09-23 Retro #retro/alpha'});
    const b = meeting('2026-09-30', 'Retro #retro/alpha', {notePath: 'Meetings/Retro 2026.note#2026-09-30 Retro #retro/alpha'});
    mockKeywords = [{page: 4, keyword: '2026-09-30 Retro #retro/alpha'}];
    const hit = await meetingForNotePage(`${AREA}/Meetings/Retro 2026.note`, 4, [source([a, b])]);
    expect(hit?.meetingIndex).toBe(1);
    expect(mockKeywordCalls).toEqual([[`${AREA}/Meetings/Retro 2026.note`, [4]]]);
  });

  it('is null for a note no meeting uses', async () => {
    const other = meeting('2026-09-30', 'Retro', {notePath: 'Meetings/x.note'});
    expect(await meetingForNotePage('/Note/Other.note', 0, [source([other])])).toBeNull();
    expect(mockKeywordCalls).toHaveLength(0);
  });
});
