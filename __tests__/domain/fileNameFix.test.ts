import {fileNameFixConfirmText, fileNameFixDoneText, NoteRef, planFileNameFixes, unsafeFolderNames} from '../../src/domain/fileNameFix';

const A = '/n/1 Projects/Alpha';

function ref(notePath: string, file: string, extra: Partial<NoteRef> = {}): NoteRef {
  return {
    itemKind: 'project',
    itemPath: A,
    inArchive: false,
    entityKind: 'task',
    entityLabel: 'x',
    notePath,
    file,
    keyword: null,
    ...extra,
  };
}

describe('planFileNameFixes', () => {
  it('ignores safe names', () => {
    expect(planFileNameFixes([ref('Todos/Call Marco.note', `${A}/Todos/Call Marco.note`)])).toEqual({fixes: [], reportOnly: []});
  });

  it('plans a rename of an own note with # and rewrites its link', () => {
    const {fixes} = planFileNameFixes([ref('Todos/Call #marco.note', `${A}/Todos/Call #marco.note`)]);
    expect(fixes).toHaveLength(1);
    expect(fixes[0]).toMatchObject({folder: `${A}/Todos`, oldName: 'Call #marco.note', newStem: 'Call marco', ext: '.note', chars: ['#']});
    expect(fixes[0].refs[0].newNotePath('Call marco.note')).toBe('Todos/Call marco.note');
  });

  it('renames a shared file once and keeps every page keyword', () => {
    const file = `${A}/Meetings/Coaching [x].note`;
    const {fixes} = planFileNameFixes([
      ref('Meetings/Coaching [x].note#2026-10-07 Session #a', file, {entityKind: 'meeting', keyword: '2026-10-07 Session #a'}),
      ref('Meetings/Coaching [x].note#2026-10-14 Session', file, {entityKind: 'meeting', keyword: '2026-10-14 Session'}),
    ]);
    expect(fixes).toHaveLength(1);
    expect(fixes[0].chars).toEqual(['[', ']']);
    expect(fixes[0].refs.map(r => r.newNotePath('Coaching x.note'))).toEqual([
      'Meetings/Coaching x.note#2026-10-07 Session #a',
      'Meetings/Coaching x.note#2026-10-14 Session',
    ]);
  });

  it('only reports absolute links and files also linked from the archive', () => {
    const own = '/n/Journal #1.note';
    const shared = `${A}/Meetings/Team ^1.note`;
    const {fixes, reportOnly} = planFileNameFixes([
      ref(own, own),
      ref('Meetings/Team ^1.note', shared),
      ref('Meetings/Team ^1.note', shared, {itemPath: '/n/4 Archive/Old', inArchive: true}),
    ]);
    expect(fixes).toEqual([]);
    expect(reportOnly.map(r => r.file)).toEqual([own, shared]);
    expect(reportOnly[0].reason).toContain('full path');
    expect(reportOnly[1].reason).toContain('archived');
  });
});

describe('unsafeFolderNames', () => {
  it('lists project/area folders with unsafe characters, never the Inbox', () => {
    expect(
      unsafeFolderNames([
        {itemKind: 'project', itemPath: '/p/A#B', name: 'A#B'},
        {itemKind: 'area', itemPath: '/a/Home', name: 'Home'},
        {itemKind: 'inbox', itemPath: '/a/0 Inbox', name: 'Inbox'},
      ]),
    ).toEqual([{itemKind: 'project', itemPath: '/p/A#B', name: 'A#B', chars: ['#']}]);
  });
});

describe('texts', () => {
  it('lists up to 8 renames, then "and k more"', () => {
    const {fixes} = planFileNameFixes(
      Array.from({length: 10}, (_, i) => ref(`Todos/n${i} #t.note`, `${A}/Todos/n${i} #t.note`)),
    );
    const text = fileNameFixConfirmText(fixes);
    expect(text.text).toBe('Rename 10 files so links work in Obsidian? Their links in your projects and areas are updated.');
    expect(text.detail.split('\n')).toHaveLength(9);
    expect(text.detail).toContain('n0 #t.note → n0 t.note');
    expect(text.detail).toContain('and 2 more');
    expect(text.actionLabel).toBe('Rename');
  });

  it('reports the result', () => {
    expect(fileNameFixDoneText(1, 2, 0)).toBe('Renamed 1 file and updated 2 links.');
    expect(fileNameFixDoneText(3, 1, 1)).toBe('Renamed 3 files and updated 1 link. 1 could not be renamed - see the log.');
  });
});
