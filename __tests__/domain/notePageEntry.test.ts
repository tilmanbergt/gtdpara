// docs/dev/history/technical-design-engage.md §3.4: page → todo or meeting, what the files alone say.
import {notePageCandidates, PageEntrySource, sharedPageHit} from '../../src/domain/notePageEntry';
import {meeting, task} from '../../test-helpers/fixtures';

const AREA = '/Note/2 Areas/Coaching';
const ref = {kind: 'area' as const, name: 'Coaching', path: AREA};
const source = (extra: Partial<PageEntrySource<typeof ref>>): PageEntrySource<typeof ref> => ({ref, tasks: [], meetings: [], ...extra});

describe('notePageCandidates', () => {
  it('a todo\'s own note is a direct hit on any page', () => {
    const own = task('Write brief #next', {notePath: 'Todos/Write brief.note'});
    const {direct} = notePageCandidates(`${AREA}/Todos/Write brief.note`, 3, [source({tasks: [task('x'), own]})]);
    expect(direct).toMatchObject({kind: 'task', taskIndex: 1});
  });

  it('a todo\'s page link only on its page (`#page=N` is 1-based)', () => {
    const linked = task('Write brief', {notePath: '/Note/Loop.note#page=3'});
    expect(notePageCandidates('/Note/Loop.note', 2, [source({tasks: [linked]})]).direct).toMatchObject({kind: 'task', taskIndex: 0});
    expect(notePageCandidates('/Note/Loop.note', 1, [source({tasks: [linked]})]).direct).toBeNull();
  });

  it('todos and meetings in a shared notebook are candidates with their anchor keyword', () => {
    const t = task('Ask Anna #sparring/anna #next', {notePath: 'Sparring.note#Ask Anna #sparring/anna'});
    const m = meeting('2026-10-01', 'Sparring #sparring/anna', {notePath: 'Sparring.note#2026-10-01 Sparring #sparring/anna'});
    const {direct, shared} = notePageCandidates(`${AREA}/Sparring.note`, 4, [source({tasks: [t], meetings: [m]})]);
    expect(direct).toBeNull();
    expect(shared.map(c => [c.kind, c.keyword])).toEqual([
      ['meeting', '2026-10-01 Sparring #sparring/anna'],
      ['task', 'Ask Anna #sparring/anna'],
    ]);
  });

  it('kinds limit the lookup; cancelled entries never count', () => {
    const t = task('Brief', {notePath: 'Todos/Brief.note'});
    const gone = meeting('2026-10-01', 'Old', {notePath: 'Todos/Brief.note', cancelled: true});
    expect(notePageCandidates(`${AREA}/Todos/Brief.note`, 0, [source({tasks: [t], meetings: [gone]})], ['meeting']).direct).toBeNull();
    expect(notePageCandidates(`${AREA}/Todos/Brief.note`, 0, [source({tasks: [{...t, cancelled: true}]})]).direct).toBeNull();
  });

  it('a meeting\'s own note beats a todo\'s page link', () => {
    const m = meeting('2026-10-01', 'Retro', {notePath: 'Meetings/Retro.note'});
    const t = task('Brief', {notePath: 'Meetings/Retro.note#page=1'});
    expect(notePageCandidates(`${AREA}/Meetings/Retro.note`, 0, [source({tasks: [t], meetings: [m]})]).direct?.kind).toBe('meeting');
  });
});

describe('sharedPageHit', () => {
  const t = task('Ask Anna #sparring/anna #next', {notePath: 'Sparring.note#Ask Anna #sparring/anna'});
  const {shared} = notePageCandidates(`${AREA}/Sparring.note`, 4, [source({tasks: [t]})]);
  it('matches the stored keyword or the keyword the todo has now, and strips it from the result', () => {
    expect(sharedPageHit(shared, ['Ask Anna #sparring/anna'])).toEqual({kind: 'task', item: ref, taskIndex: 0, task: t});
    expect(sharedPageHit(shared, ['2026-10-01', 'Other'])).toBeNull();
  });
});

describe('sharedPageHit on a Reflection page (docs/dev/history/technical-design-meeting-reflection.md §2.4)', () => {
  const kw = '2026-10-18 Sparring Mieke #sparring/mieke';
  const renamed = meeting('2026-10-18', 'Sparring Mieke roles #sparring/mieke', {tags: ['sparring/mieke'], notePath: `Meetings/sparring.note#${kw}`});
  const {shared} = notePageCandidates(`${AREA}/Meetings/sparring.note`, 2, [source({meetings: [renamed]})]);
  it('maps the page to its meeting, by the current reflection keyword or the one from the stored page keyword', () => {
    expect(sharedPageHit(shared, ['reflection 2026-10-18 Sparring Mieke roles'])).toMatchObject({kind: 'meeting', meetingIndex: 0});
    expect(sharedPageHit(shared, ['reflection 2026-10-18 Sparring Mieke', 'sparring/mieke'])).toMatchObject({kind: 'meeting', meetingIndex: 0});
    expect(sharedPageHit(shared, ['reflection 2026-10-11 Sparring Mieke'])).toBeNull();
  });
});
