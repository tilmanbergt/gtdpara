/** storage/agreements.ts: the one write path for agreements - re-finds the line, writes the file, then the cache (docs/dev/history/technical-design-meetings-0.21.md §2.3, R22). */
import {item} from '../../test-helpers/fixtures';
import {parseProjectFileContent} from '../../src/storage/projectFile';
import type {CachedItem} from '../../src/storage/dataCache';

const mockWrites: Array<[string, string]> = [];
let mockItems: CachedItem[] = [];
const INBOX = '/Note/2 Areas/0 Inbox';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('sn-plugin-lib', () => ({PluginCommAPI: {}, PluginFileAPI: {}, PluginManager: {}, NativePluginManager: {}, PluginNoteAPI: {}}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
jest.mock('../../src/domain/meetingTime', () => ({...jest.requireActual('../../src/domain/meetingTime'), todayIso: () => '2026-10-24'}));
jest.mock('../../src/supernote/fileSystem', () => ({
  readTextFile: async (path: string) => {
    const written = [...mockWrites].reverse().find(([p]) => p === path);
    if (written) return written[1];
    return mockItems.find(i => path.startsWith(`${i.path}/`))?.rawContent ?? null;
  },
  writeTextFile: async (path: string, text: string) => {
    mockWrites.push([path, text]);
  },
}));
jest.mock('../../src/storage/dataCache', () => ({
  getCachedData: () => ({items: mockItems, paths: {inboxFolder: '/Note/2 Areas/0 Inbox'}}),
  findCachedItem: (path: string) => mockItems.find(i => i.path === path),
  updateItemAgreements: (path: string, rawContent: string, agreements: unknown, agreementsExtraLines: unknown) => {
    const found = mockItems.find(i => i.path === path);
    if (found) Object.assign(found, {rawContent, agreements, agreementsExtraLines});
  },
}));

import {addAgreement, changeAgreement, editAgreement, endAgreement, keepAgreement} from '../../src/storage/agreements';
import {buildAgreement} from '../../src/domain/agreements';
import {agreementsSummary} from '../../src/storage/debugBundle';

const AREA_FILE = [
  '---',
  'kind: area',
  'status: active',
  '---',
  '',
  '## Tasks',
  '',
  '## Agreements',
  '- Feedback only in our 1:1s #sparring/mieke [created:: 2026-10-01] [who:: both]',
  '% a comment line',
  '',
  '- Fridays are quiet #mieke [created:: 2026-10-02]',
  '',
  '## Meetings',
  '',
].join('\n');

function area(raw = AREA_FILE): CachedItem {
  const state = parseProjectFileContent(raw);
  return item('area', 'Coaching', {...state});
}

const last = () => mockWrites[mockWrites.length - 1][1];
const ref = (i: number) => ({itemPath: mockItems[0].path, index: i, agreement: mockItems[0].agreements[i]});

beforeEach(() => {
  mockWrites.length = 0;
  mockItems = [area()];
});

it('adds to the file and the cache', async () => {
  await addAgreement(mockItems[0].path, buildAgreement('No calls after 6 #mieke', {today: '2026-10-24', valid: '2026-12-31', meeting: '2026-10-24 Sparring Mieke'}));
  expect(mockWrites[0][0]).toBe(`${mockItems[0].path}/area.txt`);
  expect(last()).toBe(
    AREA_FILE.replace(
      '- Fridays are quiet #mieke [created:: 2026-10-02]\n',
      '- Fridays are quiet #mieke [created:: 2026-10-02]\n- No calls after 6 #mieke [meeting:: 2026-10-24 Sparring Mieke] [created:: 2026-10-24] [valid:: 2026-12-31]\n',
    ),
  );
  expect(mockItems[0].agreements).toHaveLength(3);
});

it('a file without the section gets one', async () => {
  mockItems = [area('---\nkind: area\nstatus: active\n---\n\n## Tasks\n')];
  await addAgreement(mockItems[0].path, buildAgreement('One', {today: '2026-10-24', valid: null, meeting: null}));
  expect(last()).toBe('---\nkind: area\nstatus: active\n---\n\n## Tasks\n\n## Agreements\n- One [created:: 2026-10-24]\n');
});

it('ending changes only that line (scenario 17)', async () => {
  await endAgreement(ref(0));
  expect(last()).toBe(
    AREA_FILE.replace('[created:: 2026-10-01] [who:: both]', '[created:: 2026-10-01] [ended:: 2026-10-24] [who:: both]'),
  );
});

it('changing ends the old one and adds the new one in one write (scenario 10)', async () => {
  await changeAgreement(ref(1), 'Fridays are quiet, except launches #mieke', null, null);
  expect(mockWrites).toHaveLength(1);
  expect(last()).toContain('- Fridays are quiet #mieke [created:: 2026-10-02] [ended:: 2026-10-24]\n- Fridays are quiet, except launches #mieke [created:: 2026-10-24]\n');
  expect(mockItems[0].agreements.map(a => a.fields.ended)).toEqual([null, '2026-10-24', null]);
});

it('edit keeps created and unknown fields; keep sets a new valid-till', async () => {
  await editAgreement(ref(0), 'Feedback only 1:1 #sparring/mieke', '2026-12-31');
  expect(last()).toContain('- Feedback only 1:1 #sparring/mieke [created:: 2026-10-01] [valid:: 2026-12-31] [who:: both]\n');
  await keepAgreement(ref(0), null);
  expect(last()).toContain('- Feedback only 1:1 #sparring/mieke [created:: 2026-10-01] [who:: both]\n');
});

it('finds the line again when it moved, and refuses one that is gone', async () => {
  const stale = {itemPath: mockItems[0].path, index: 0, agreement: mockItems[0].agreements[1]};
  await endAgreement(stale);
  expect(mockItems[0].agreements[1].fields.ended).toBe('2026-10-24');
  const gone = {itemPath: mockItems[0].path, index: 0, agreement: buildAgreement('Never written', {today: '2026-10-24', valid: null, meeting: null})};
  await expect(endAgreement(gone)).rejects.toThrow('That agreement changed in the file - look again');
});

it('refuses the Inbox', async () => {
  await expect(addAgreement(INBOX, buildAgreement('x', {today: '2026-10-24', valid: null, meeting: null}))).rejects.toThrow(/not in the Inbox/);
  expect(mockWrites).toHaveLength(0);
});

it('the debug bundle counts, never names', () => {
  const text = agreementsSummary([mockItems[0], item('project', 'Empty')]);
  expect(text).toBe('agreements: active=2 ended=0 files=1');
  expect(text).not.toContain('mieke');
  expect(agreementsSummary(null)).toContain('not available');
});
