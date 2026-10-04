import {planNoteRelocation, relocatedNotePath} from '../../src/domain/noteRelocation';

const A = '/storage/Note/1 Projects/Alpha';
const B = '/storage/Note/1 Projects/Beta';

describe('planNoteRelocation', () => {
  it('does nothing without a note', () => {
    expect(planNoteRelocation('', {kind: 'none'}, B)).toEqual({kind: 'none'});
  });

  it('leaves an absolute link (lasso source note) alone', () => {
    const notePath = '/storage/Note/Journal.note';
    expect(planNoteRelocation(notePath, {kind: 'own', absolutePath: notePath, exists: true, isAbsoluteLink: true}, B)).toEqual({kind: 'none'});
  });

  it('moves an own note to the same relative place in the target', () => {
    const plan = planNoteRelocation('Todos/Call Marco.note', {kind: 'own', absolutePath: `${A}/Todos/Call Marco.note`, exists: true, isAbsoluteLink: false}, B);
    expect(plan).toEqual({kind: 'own', from: `${A}/Todos/Call Marco.note`, toFolder: `${B}/Todos`, stem: 'Call Marco', ext: '.note', relativeDir: 'Todos'});
    if (plan.kind !== 'own') throw new Error('expected own');
    expect(relocatedNotePath(plan, 'Call Marco (2).note')).toBe('Todos/Call Marco (2).note');
  });

  it('reports a missing own note without moving anything', () => {
    expect(planNoteRelocation('Todos/x.note', {kind: 'own', absolutePath: `${A}/Todos/x.note`, exists: false, isAbsoluteLink: false}, B)).toEqual({kind: 'missing'});
  });

  it('keeps a shared page where it is and makes the link absolute', () => {
    const file = `${A}/Meetings/Coaching 2026.note`;
    const plan = planNoteRelocation(
      'Meetings/Coaching 2026.note#2026-10-07 Session',
      {kind: 'shared', anchor: {filePath: 'Meetings/Coaching 2026.note', keyword: '2026-10-07 Session'}, absolutePath: file, exists: true},
      B,
    );
    expect(plan).toEqual({kind: 'shared', file, exists: true, newNotePath: `${file}#2026-10-07 Session`});
  });

  it('leaves an already absolute shared anchor alone', () => {
    const file = `${A}/Meetings/Coaching 2026.note`;
    expect(
      planNoteRelocation(`${file}#kw`, {kind: 'shared', anchor: {filePath: file, keyword: 'kw'}, absolutePath: file, exists: true}, B),
    ).toEqual({kind: 'none'});
  });

  it('handles a note path without a folder part', () => {
    const plan = planNoteRelocation('x.note', {kind: 'own', absolutePath: `${A}/x.note`, exists: true, isAbsoluteLink: false}, B);
    expect(plan).toMatchObject({kind: 'own', toFolder: B, relativeDir: ''});
    if (plan.kind === 'own') expect(relocatedNotePath(plan, 'x.note')).toBe('x.note');
  });
});
