/** Editing a loop (docs/dev/history/technical-design-loops.md §4.6). */
import {
  loopAsTodo,
  parseLoopEdit,
  renameNoteFile,
  renameNoteLinks,
  retagEntries,
  retagText,
  titleWithLoopTag,
  withLoopTag,
} from '../../src/domain/loopEdit';
import {newLoopLine} from '../../src/domain/loopsSection';
import {meeting, task} from '../../test-helpers/fixtures';

const KINDS = ['workshop'];

describe('parseLoopEdit', () => {
  it('reads the tag and the main date of a bare loop tag', () => {
    expect(parseLoopEdit('#workshop/offsite [due:: 2026-11-14]', KINDS)).toEqual({
      loop: {kind: 'workshop', name: 'offsite', tag: 'workshop/offsite'},
      mainDate: '2026-11-14',
    });
    expect(parseLoopEdit('#workshop/offsite', KINDS)?.mainDate).toBeNull();
  });
  it('refuses words, a second loop tag or someday', () => {
    expect(parseLoopEdit('Book room #workshop/offsite', KINDS)).toBeNull();
    expect(parseLoopEdit('#workshop/a #workshop/b', KINDS)).toBeNull();
    expect(parseLoopEdit('#workshop/offsite #someday', KINDS)).toBeNull();
    expect(parseLoopEdit('#retro/alpha', KINDS)).toBeNull();
  });
  it('round-trips a loop line through the todo Quick Add edits', () => {
    const todo = loopAsTodo({...newLoopLine('workshop/offsite', '2026-11-14'), linkedFile: 'Brief.pdf'});
    expect(todo.text).toBe('#workshop/offsite');
    expect(todo.dueDate).toBe('2026-11-14');
    expect(todo.linkedFile).toBe('Brief.pdf');
  });
});

describe('retagging', () => {
  it('renames the tag and tags below it, nothing else', () => {
    expect(retagText('Book #workshop/offsite and #workshop/offsite/food', 'workshop/offsite', 'workshop/team')).toBe(
      'Book #workshop/team and #workshop/team/food',
    );
    expect(retagText('#workshop/offsite2 #offsite #Workshop/Offsite', 'workshop/offsite', 'workshop/team')).toBe(
      '#workshop/offsite2 #offsite #workshop/team',
    );
  });
  it('rewrites todos and meetings and counts them', () => {
    const result = retagEntries(
      [task('Book room #workshop/offsite #next'), task('Other #x')],
      [meeting('2026-11-01', 'Kickoff #workshop/offsite')],
      'workshop/offsite',
      'workshop/team',
    );
    expect(result.changed).toBe(2);
    expect(result.tasks[0].tags).toEqual(['workshop/team', 'next']);
    expect(result.tasks[0].flowState).toBe('next');
    expect(result.meetings[0].tags).toEqual(['workshop/team']);
  });
});

describe('note links', () => {
  it('follows the note to its new name', () => {
    expect(renameNoteFile('2026-11 workshop offsite.note', '2026-11 workshop offsite.note', '2026-12 workshop offsite.note')).toBe(
      '2026-12 workshop offsite.note',
    );
    expect(renameNoteFile('a.note#2026-11-01 Kickoff', 'a.note', 'b.note')).toBe('b.note#2026-11-01 Kickoff');
    expect(renameNoteFile('a.note#page=2', 'a.note', 'b.note')).toBe('b.note#page=2');
    expect(renameNoteFile('ab.note', 'a.note', 'b.note')).toBe('ab.note');
    const links = renameNoteLinks([task('x', {notePath: 'a.note#k'})], [meeting('2026-11-01', 'y', {notePath: 'Meetings/y.note'})], 'a.note', 'b.note');
    expect(links.changed).toBe(1);
    expect(links.tasks[0].notePath).toBe('b.note#k');
  });
});

describe('adding the loop tag', () => {
  it('adds it before the trailing fields, once', () => {
    expect(withLoopTag('Book room [due:: 2026-11-01]', 'workshop/offsite')).toBe('Book room #workshop/offsite [due:: 2026-11-01]');
    expect(withLoopTag('Book room #workshop/offsite', 'workshop/offsite')).toBe('Book room #workshop/offsite');
    expect(titleWithLoopTag('Kickoff', 'workshop/offsite')).toBe('Kickoff #workshop/offsite');
    expect(titleWithLoopTag('Kickoff #workshop/offsite', 'workshop/offsite')).toBe('Kickoff #workshop/offsite');
  });
});
