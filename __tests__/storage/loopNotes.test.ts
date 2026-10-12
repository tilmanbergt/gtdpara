// docs/dev/history/technical-design-loops.md §4.4, note-setups §1.2: a todo's or meeting's first
// note goes into its loop's note, which starts with the loop's own page; for a meeting a Thread
// setup matched through another tag comes first, for a todo the loop does.

const mockFiles = new Set<string>();
const mockKeywordPages = new Map<string, Map<string, number>>(); // file -> keyword -> page

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('sn-plugin-lib', () => ({PluginCommAPI: {recycleElement: jest.fn()}}));
jest.mock('../../src/supernote/fileSystem', () => {
  const listFolderEntries = jest.fn(async (folder: string) =>
    [...mockFiles]
      .filter(f => f.slice(0, f.lastIndexOf('/')) === folder)
      .map(f => ({name: f.slice(f.lastIndexOf('/') + 1), isFolder: false})),
  );
  return {
    listFolderEntries,
    fileExists: jest.fn(async (path: string) => mockFiles.has(path)),
    createNote: jest.fn(async (path: string) => {
      mockFiles.add(path);
    }),
    ensureFolderExists: jest.fn(async () => undefined),
    insertKeyWord: jest.fn(async () => undefined),
    openPath: jest.fn(async () => undefined),
    displayPath: (p: string) => p.replace(/^\/storage\/emulated\/0\//, ''),
    getElements: jest.fn(async () => []),
    insertElements: jest.fn(async () => undefined),
    deleteElements: jest.fn(async () => undefined),
    createElement: jest.fn(async () => ({})),
    ELEMENT_TYPE_LINK: 600,
    MYSTYLE_FOLDER: '/storage/emulated/0/MyStyle',
  };
});

jest.mock('../../src/storage/sharedNotePages', () => ({
  ensureSharedNoteFile: jest.fn(async (folder: string, name: string) => {
    mockFiles.add(`${folder}/${name}.note`);
    return `${folder}/${name}.note`;
  }),
  findKeywordPage: jest.fn(async (file: string, keyword: string) => mockKeywordPages.get(file)?.get(keyword) ?? null),
  insertChronologicalPage: jest.fn(async (file: string, keyword: string) => {
    const pages = mockKeywordPages.get(file) ?? new Map<string, number>();
    pages.set(keyword, pages.size);
    mockKeywordPages.set(file, pages);
    return pages.size - 1;
  }),
  renameKeywordAt: jest.fn(async () => undefined),
  writeRecreatedNotice: jest.fn(async () => undefined),
}));

let mockLoops: unknown[] = [];
jest.mock('../../src/storage/dataCache', () => ({
  getCachedData: () => null,
  findCachedItem: (path: string) => ({path, name: 'Coaching', kind: 'area', tasks: [], meetings: [], loops: mockLoops}),
}));
jest.mock('../../src/storage/loopKinds', () => {
  const setups = jest.requireActual('../../src/domain/noteSetups');
  return {
    getLoopKinds: () => ({
      kinds: ['workshop'],
      setups: {workshop: {...setups.createNoteSetup('w', 'loop'), name: 'Workshops', tags: ['workshop']}},
    }),
  };
});
jest.mock('../../src/storage/linkedFiles', () => ({linkedFileStatus: jest.fn(), resolveLinkedFilePath: jest.fn()}));
jest.mock('../../src/storage/meetingNoteAggregate', () => ({relatedItemsFor: () => []}));
jest.mock('../../src/storage/notePieceMetrics', () => ({measureNoteLinkRect: jest.fn(), measureNotePieceRect: jest.fn()}));
jest.mock('../../src/supernote/noteElements', () => ({buildTextboxElement: jest.fn()}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));

import {newLoopLine} from '../../src/domain/loopsSection';
import {createNoteSetup, NoteSetup} from '../../src/domain/noteSetups';
import {DEFAULT_SETTINGS, GtdParaSettings} from '../../src/domain/settings';
import {Meeting, Task} from '../../src/domain/types';
import {deriveMeetingFields, deriveTaskFields} from '../../src/domain/markdown';
import {NoteCreationPlan} from '../../src/domain/noteCreationPlan';
import {openOrCreateLoopNote, openOrCreateMeetingNote, openOrCreateTodoNote} from '../../src/storage/meetingNoteContent';
import * as fs from '../../src/supernote/fileSystem';

const AREA = '/storage/emulated/0/Note/2 Areas/Coaching';
const LOOP_NOTE = `${AREA}/2026-11 workshop offsite.note`;

const WORKSHOPS: NoteSetup = {...createNoteSetup('w', 'loop'), name: 'Workshops', tags: ['workshop']};

function settingsWith(setups: NoteSetup[]): GtdParaSettings {
  return {...DEFAULT_SETTINGS, noteSetups: [WORKSHOPS, ...setups]};
}

function meeting(title: string, date = '2026-10-02'): Meeting {
  return {date, title, notePath: '', ...deriveMeetingFields(title)} as unknown as Meeting;
}

const plans: NoteCreationPlan[] = [];
const confirm = async (plan: NoteCreationPlan) => {
  plans.push(plan);
  return true;
};

beforeEach(() => {
  mockFiles.clear();
  mockKeywordPages.clear();
  plans.length = 0;
  mockLoops = [newLoopLine('workshop/offsite', '2026-11-14')];
  jest.clearAllMocks();
});

describe('loop notes', () => {
  it('puts a loop meeting’s page into a new loop note that starts with the loop’s page', async () => {
    const result = await openOrCreateMeetingNote(meeting('Kickoff #workshop/offsite'), AREA, settingsWith([]), null, {confirmCreate: confirm});
    expect(plans[0]).toMatchObject({kind: 'new-shared-file', file: '2026-11 workshop offsite.note'});
    expect(mockFiles.has(LOOP_NOTE)).toBe(true);
    expect(fs.insertKeyWord).toHaveBeenCalledWith(LOOP_NOTE, 0, 'loop workshop/offsite');
    expect(result.meeting.notePath).toBe('2026-11 workshop offsite.note#2026-10-02 Kickoff #workshop/offsite');
  });

  it('adds a page to the loop note when it exists', async () => {
    mockFiles.add(LOOP_NOTE);
    await openOrCreateMeetingNote(meeting('Prep #workshop/offsite'), AREA, settingsWith([]), null, {confirmCreate: confirm});
    expect(plans[0]).toMatchObject({kind: 'new-page', file: '2026-11 workshop offsite.note'});
    expect(fs.insertKeyWord).not.toHaveBeenCalled();
  });

  it('a meeting goes to a Thread setup matched through another tag first; without an active loop the item gets its own note', async () => {
    const jf: NoteSetup = {...createNoteSetup('1', 'thread'), name: 'JF', tags: ['jf'], notebook: {name: 'JF {subtag}', folder: 'Meetings'}};
    await openOrCreateMeetingNote(meeting('Demand #jf/demand #workshop/offsite'), AREA, settingsWith([jf]), null, {confirmCreate: confirm});
    expect(plans[0]).toMatchObject({kind: 'new-shared-file', file: 'Meetings/JF demand.note', setupName: 'JF'});
    mockLoops = [{...newLoopLine('workshop/offsite'), status: 'done'}];
    await openOrCreateMeetingNote(meeting('Late #workshop/offsite'), AREA, settingsWith([]), null, {confirmCreate: confirm});
    expect(plans[1].kind).toBe('new-own-file');
  });

  it('a todo goes to its active loop first, even with a Thread setup tag', async () => {
    const jf: NoteSetup = {...createNoteSetup('1', 'thread'), name: 'JF', tags: ['jf'], notebook: {name: 'JF {subtag}', folder: 'Meetings'}};
    const todo = {text: 'Draft #jf/demand #workshop/offsite', notePath: '', done: false, cancelled: false, ...deriveTaskFields('Draft #jf/demand #workshop/offsite')};
    await openOrCreateTodoNote(todo as unknown as Task, AREA, settingsWith([jf]), null, {confirmCreate: confirm});
    expect(plans[0]).toMatchObject({kind: 'new-shared-file', file: '2026-11 workshop offsite.note', setupName: 'Workshops'});
  });

  it('opens the loop note at its first page, creating it after a confirm', async () => {
    expect(await openOrCreateLoopNote(AREA, 'workshop/offsite', settingsWith([]), confirm)).toBe(true);
    expect(plans[0]).toMatchObject({kind: 'new-shared-file', file: '2026-11 workshop offsite.note', setupName: 'Workshops'});
    expect(fs.openPath).toHaveBeenCalledWith(LOOP_NOTE, 0);
    plans.length = 0;
    await openOrCreateLoopNote(AREA, 'workshop/offsite', settingsWith([]), confirm);
    expect(plans).toEqual([]);
  });
});
