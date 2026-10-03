// docs/dev/technical-design-split-by-tag.md §3.4 / §3.5: what a note-icon tap
// plans, what it asks to confirm, and that ✕ writes nothing. Device APIs are
// replaced by an in-memory file list.

const mockFiles = new Set<string>();
const mockKeywordPages = new Map<string, Map<string, number>>(); // file -> keyword -> page

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

jest.mock('../../src/storage/dataCache', () => ({getCachedData: () => null}));
jest.mock('../../src/storage/linkedFiles', () => ({linkedFileStatus: jest.fn(), resolveLinkedFilePath: jest.fn()}));
jest.mock('../../src/storage/meetingNoteAggregate', () => ({relatedItemsFor: () => []}));
jest.mock('../../src/storage/notePieceMetrics', () => ({measureNoteLinkRect: jest.fn(), measureNotePieceRect: jest.fn()}));
jest.mock('../../src/supernote/noteElements', () => ({buildTextboxElement: jest.fn()}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));

import {NoteCreationPlan} from '../../src/domain/noteCreationPlan';
import {createEmptyDefinition, NoteCreationDefinition} from '../../src/domain/noteTemplate';
import {DEFAULT_SETTINGS, GtdParaSettings} from '../../src/domain/settings';
import {Meeting, Task} from '../../src/domain/types';
import {deriveMeetingFields, deriveTaskFields} from '../../src/domain/markdown';
import {openOrCreateMeetingNote, openOrCreateTodoNote} from '../../src/storage/meetingNoteContent';
import * as sharedPages from '../../src/storage/sharedNotePages';
import * as fs from '../../src/supernote/fileSystem';

const AREA = '/storage/emulated/0/Note/2 Areas/Coaching';

function coachingRule(extra: Partial<NoteCreationDefinition> = {}): NoteCreationDefinition {
  return {
    ...createEmptyDefinition('1', 'meeting'),
    name: 'Coaching',
    tags: ['coaching'],
    enabled: true,
    pieces: [],
    noteTarget: 'shared',
    sharedFileName: 'Coaching {subtag} {year}',
    ...extra,
  };
}

function settingsWith(rules: NoteCreationDefinition[]): GtdParaSettings {
  return {...DEFAULT_SETTINGS, noteCreationDefinitions: rules};
}

function meeting(title: string, date = '2026-10-02', notePath = ''): Meeting {
  return {date, title, notePath, ...deriveMeetingFields(title)} as unknown as Meeting;
}

function task(text: string, notePath = ''): Task {
  return {text, notePath, done: false, cancelled: false, ...deriveTaskFields(text)} as unknown as Task;
}

function recorder(answer: boolean) {
  const plans: NoteCreationPlan[] = [];
  return {plans, confirm: async (plan: NoteCreationPlan) => (plans.push(plan), answer)};
}

beforeEach(() => {
  mockFiles.clear();
  mockKeywordPages.clear();
  jest.clearAllMocks();
});

describe('first-time note on a split-by-tag rule', () => {
  it('plans a new shared file named from the placeholders and creates it on confirm', async () => {
    const r = recorder(true);
    const result = await openOrCreateMeetingNote(meeting('Session #coaching/sabina'), AREA, settingsWith([coachingRule()]), null, {
      confirmCreate: r.confirm,
    });
    expect(r.plans).toHaveLength(1);
    expect(r.plans[0]).toMatchObject({kind: 'new-shared-file', file: 'Meetings/Coaching sabina 2026.note', ruleName: 'Coaching'});
    expect(result.changed).toBe(true);
    expect(result.cancelled).toBe(false);
    expect(result.meeting.notePath).toBe('Meetings/Coaching sabina 2026.note#2026-10-02 Session #coaching/sabina');
    expect(mockFiles.has(`${AREA}/Meetings/Coaching sabina 2026.note`)).toBe(true);
  });

  it('plans a new page when the file exists', async () => {
    mockFiles.add(`${AREA}/Meetings/Coaching sabina 2026.note`);
    const r = recorder(true);
    await openOrCreateMeetingNote(meeting('Session 2 #coaching/sabina'), AREA, settingsWith([coachingRule()]), null, {
      confirmCreate: r.confirm,
    });
    expect(r.plans[0].kind).toBe('new-page');
  });

  it('uses the meeting date for the year, and no subtag drops out cleanly', async () => {
    const r = recorder(false);
    await openOrCreateMeetingNote(meeting('Intro #coaching', '2027-01-05'), AREA, settingsWith([coachingRule()]), null, {
      confirmCreate: r.confirm,
    });
    expect(r.plans[0].file).toBe('Meetings/Coaching 2027.note');
  });

  it('asks before linking to a page that already has this keyword', async () => {
    const file = `${AREA}/Meetings/Coaching sabina 2026.note`;
    mockFiles.add(file);
    mockKeywordPages.set(file, new Map([['2026-10-02 Session #coaching/sabina', 3]]));
    const r = recorder(true);
    const result = await openOrCreateMeetingNote(meeting('Session #coaching/sabina'), AREA, settingsWith([coachingRule()]), null, {
      confirmCreate: r.confirm,
    });
    expect(r.plans[0]).toMatchObject({kind: 'link-page', keyword: '2026-10-02 Session #coaching/sabina'});
    expect(result.outcome?.page).toBe(3);
    expect(sharedPages.insertChronologicalPage).not.toHaveBeenCalled();
  });

  it('✕ writes nothing and opens nothing', async () => {
    const r = recorder(false);
    const m = meeting('Session #coaching/sabina');
    const result = await openOrCreateMeetingNote(m, AREA, settingsWith([coachingRule()]), null, {confirmCreate: r.confirm});
    expect(result).toMatchObject({changed: false, cancelled: true, outcome: null});
    expect(result.meeting).toBe(m);
    expect(mockFiles.size).toBe(0);
    expect(sharedPages.ensureSharedNoteFile).not.toHaveBeenCalled();
    expect(fs.openPath).not.toHaveBeenCalled();
  });

  it('Inbox items stay own notes, with the confirm', async () => {
    const r = recorder(true);
    await openOrCreateMeetingNote(meeting('Session #coaching/sabina'), AREA, settingsWith([coachingRule()]), null, {
      confirmCreate: r.confirm,
      forceOwnTarget: true,
    });
    expect(r.plans[0]).toMatchObject({kind: 'new-own-file', ruleName: 'Coaching'});
  });
});

describe('first-time own note', () => {
  it('confirms even without a matching rule, with the collision-free name', async () => {
    mockFiles.add(`${AREA}/Todos/Call Sabina.note`);
    const r = recorder(true);
    const result = await openOrCreateTodoNote(task('Call Sabina #next'), AREA, settingsWith([]), null, {confirmCreate: r.confirm});
    expect(r.plans[0]).toMatchObject({kind: 'new-own-file', file: 'Todos/Call Sabina (2).note', ruleName: null});
    expect(result.task.notePath).toBe('Todos/Call Sabina (2).note');
    expect(mockFiles.has(`${AREA}/Todos/Call Sabina (2).note`)).toBe(true);
  });
});

describe('keywords on own notes (cleanup 0.5 S7)', () => {
  it('a new own note gets one keyword per free tag, not the functional ones', async () => {
    const r = recorder(true);
    await openOrCreateTodoNote(task('Call Marco #marco #next #due:2026-10-09 #team/jf'), AREA, settingsWith([]), null, {
      confirmCreate: r.confirm,
    });
    const file = `${AREA}/Todos/Call Marco marco team jf.note`;
    expect(mockFiles.has(file)).toBe(true);
    expect((fs.insertKeyWord as jest.Mock).mock.calls).toEqual([
      [file, 0, 'marco'],
      [file, 0, 'team/jf'],
    ]);
  });

  it('a note without free tags gets no keyword', async () => {
    const r = recorder(true);
    await openOrCreateTodoNote(task('Call #next'), AREA, settingsWith([]), null, {confirmCreate: r.confirm});
    expect(fs.insertKeyWord).not.toHaveBeenCalled();
  });

  it('a recreated own note gets its keywords again', async () => {
    const r = recorder(true);
    await openOrCreateTodoNote(task('Call #marco', 'Todos/Call marco.note'), AREA, settingsWith([]), null, {confirmCreate: r.confirm});
    expect(fs.insertKeyWord).toHaveBeenCalledWith(`${AREA}/Todos/Call marco.note`, 0, 'marco');
  });

  it('a failing keyword does not fail the note', async () => {
    (fs.insertKeyWord as jest.Mock).mockRejectedValueOnce(new Error('no permission'));
    const r = recorder(true);
    const result = await openOrCreateMeetingNote(meeting('Kickoff #acme'), AREA, settingsWith([]), null, {confirmCreate: r.confirm});
    expect(result.meeting.notePath).toBe('Meetings/2026-10-02 - Kickoff acme.note');
  });

  it('shared pages are unchanged: no extra keyword call', async () => {
    const r = recorder(true);
    await openOrCreateMeetingNote(meeting('Session #coaching/sabina'), AREA, settingsWith([coachingRule()]), null, {
      confirmCreate: r.confirm,
    });
    expect(fs.insertKeyWord).not.toHaveBeenCalled();
  });
});

describe('existing link', () => {
  it('opens an existing own note without asking', async () => {
    mockFiles.add(`${AREA}/Todos/Call.note`);
    const r = recorder(true);
    const result = await openOrCreateTodoNote(task('Call', 'Todos/Call.note'), AREA, settingsWith([]), null, {confirmCreate: r.confirm});
    expect(r.plans).toHaveLength(0);
    expect(result.changed).toBe(false);
    expect(fs.openPath).toHaveBeenCalledWith(`${AREA}/Todos/Call.note`, 0);
  });

  it('asks before recreating a deleted own note, under the same name', async () => {
    const r = recorder(true);
    const result = await openOrCreateTodoNote(task('Call', 'Todos/Call.note'), AREA, settingsWith([]), null, {confirmCreate: r.confirm});
    expect(r.plans[0]).toMatchObject({kind: 'recreate-own-file', file: 'Todos/Call.note'});
    expect(result.changed).toBe(false);
    expect(mockFiles.has(`${AREA}/Todos/Call.note`)).toBe(true);
  });

  it('never recreates an absolute (lasso source) link', async () => {
    const r = recorder(true);
    await expect(
      openOrCreateTodoNote(task('Call', '/storage/emulated/0/Note/Source.note'), AREA, settingsWith([]), null, {confirmCreate: r.confirm}),
    ).rejects.toThrow('Linked note not found: Note/Source.note');
    expect(r.plans).toHaveLength(0);
  });

  it('keeps using the stored file even when the rule would pick another one now', async () => {
    const file = `${AREA}/Meetings/Coaching sabina 2026.note`;
    mockFiles.add(file);
    mockKeywordPages.set(file, new Map([['2027-01-10 Session #coaching/sabina', 0]]));
    const r = recorder(true);
    const m = meeting('Session #coaching/sabina', '2027-01-10', 'Meetings/Coaching sabina 2026.note#2027-01-10 Session #coaching/sabina');
    const result = await openOrCreateMeetingNote(m, AREA, settingsWith([coachingRule()]), null, {confirmCreate: r.confirm});
    expect(r.plans).toHaveLength(0);
    expect(fs.openPath).toHaveBeenCalledWith(file, 0);
    expect(result.changed).toBe(false);
  });

  it('renames the keyword in place when the title changed', async () => {
    const file = `${AREA}/Meetings/Coaching sabina 2026.note`;
    mockFiles.add(file);
    mockKeywordPages.set(file, new Map([['2026-10-02 Session #coaching/sabina', 2]]));
    const m = meeting('Session #coaching/sabine', '2026-10-02', 'Meetings/Coaching sabina 2026.note#2026-10-02 Session #coaching/sabina');
    const result = await openOrCreateMeetingNote(m, AREA, settingsWith([coachingRule()]), null, {confirmCreate: recorder(true).confirm});
    expect(sharedPages.renameKeywordAt).toHaveBeenCalled();
    expect(result.meeting.notePath).toBe('Meetings/Coaching sabina 2026.note#2026-10-02 Session #coaching/sabine');
    expect(result.outcome?.page).toBe(2);
  });

  it('asks before adding a page whose keyword is gone', async () => {
    mockFiles.add(`${AREA}/Meetings/Coaching sabina 2026.note`);
    const r = recorder(false);
    const m = meeting('Session #coaching/sabina', '2026-10-02', 'Meetings/Coaching sabina 2026.note#2026-10-02 Session #coaching/sabina');
    const result = await openOrCreateMeetingNote(m, AREA, settingsWith([coachingRule()]), null, {confirmCreate: r.confirm});
    expect(r.plans[0]).toMatchObject({kind: 'recreate-page', file: 'Meetings/Coaching sabina 2026.note'});
    expect(result.cancelled).toBe(true);
    expect(sharedPages.insertChronologicalPage).not.toHaveBeenCalled();
  });

  it('asks before recreating a deleted shared file', async () => {
    const r = recorder(true);
    const m = meeting('Session #coaching/sabina', '2026-10-02', 'Meetings/Coaching sabina 2026.note#2026-10-02 Session #coaching/sabina');
    await openOrCreateMeetingNote(m, AREA, settingsWith([coachingRule()]), null, {confirmCreate: r.confirm});
    expect(r.plans[0]).toMatchObject({kind: 'recreate-shared-file', file: 'Meetings/Coaching sabina 2026.note'});
    expect(sharedPages.writeRecreatedNotice).toHaveBeenCalled();
  });

  it('an old own note with # in its real name still opens as an own note', async () => {
    mockFiles.add(`${AREA}/Todos/Plan #daily.note`);
    const r = recorder(true);
    await openOrCreateTodoNote(task('Plan #daily', 'Todos/Plan #daily.note'), AREA, settingsWith([]), null, {confirmCreate: r.confirm});
    expect(r.plans).toHaveLength(0);
    expect(fs.openPath).toHaveBeenCalledWith(`${AREA}/Todos/Plan #daily.note`, 0);
  });
});
