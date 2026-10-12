// docs/dev/history/technical-design-note-setups.md §4.1, §4.4: note candidates placed in the
// file system, and the layout an existing note link uses.
let mockLoops: unknown[] = [];
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('sn-plugin-lib', () => ({PluginCommAPI: {recycleElement: jest.fn()}}));
jest.mock('../../src/storage/dataCache', () => ({
  getCachedData: () => null,
  findCachedItem: (path: string) => ({path, name: 'Coaching', kind: 'area', tasks: [], meetings: [], loops: mockLoops}),
}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));

import {newLoopLine} from '../../src/domain/loopsSection';
import {createNoteSetup, NoteSetup, seedNoteSetupDefaults} from '../../src/domain/noteSetups';
import {DEFAULT_SETTINGS, GtdParaSettings} from '../../src/domain/settings';
import {PageLayout} from '../../src/domain/pageLayout';
import {layoutForLink, noteFileKey, NoteTargetInput, placeNoteCandidates} from '../../src/storage/noteTargets';

const AREA = '/n/2 Areas/Coaching';
const sparringTodo: PageLayout = {template: 'sparring.png', pieces: []};
const workshopTodo: PageLayout = {template: 'workshop.png', pieces: []};
const sparring: NoteSetup = {
  ...createNoteSetup('1', 'thread'),
  name: 'Sparring',
  tags: ['sparring', 'retro'],
  notebook: {name: '{tag} {subtag} {year}', folder: 'Sparring'},
  pages: {todo: sparringTodo},
};
const workshop: NoteSetup = {...createNoteSetup('2', 'loop'), name: 'Workshop', tags: ['workshop'], pages: {todo: workshopTodo}};
const team: NoteSetup = {...createNoteSetup('3', 'thread'), name: 'Team', tags: ['team']};
const settings: GtdParaSettings = {...DEFAULT_SETTINGS, noteSetups: [sparring, workshop, team], noteSetupDefaults: seedNoteSetupDefaults()};

function input(tags: string[], extra: Partial<NoteTargetInput> = {}): NoteTargetInput {
  return {itemPath: AREA, tags, pageKind: 'todo', settings, fileDate: '2026-10-12', forceOwn: false, ...extra};
}

beforeEach(() => {
  mockLoops = [newLoopLine('workshop/offsite', '2026-11-14')];
});

describe('placeNoteCandidates', () => {
  it('places a notebook from the setup name template and folder', () => {
    const [first] = placeNoteCandidates(input(['retro/demand'], {pageKind: 'meeting'}));
    expect(first.shared).toEqual({relativeFolder: 'Sparring', fileName: 'retro demand 2026', relativeFile: 'Sparring/retro demand 2026.note'});
  });

  it('a todo of an active loop: the loop note first, then the notebook', () => {
    const placed = placeNoteCandidates(input(['workshop/offsite', 'sparring/peter']));
    expect(placed.map(noteFileKey)).toEqual(['2026-11 workshop offsite.note', 'Sparring/sparring peter 2026.note']);
    expect(placed[0].loopNote?.loop.tag).toBe('workshop/offsite');
  });

  it('a meeting: the notebook first', () => {
    const placed = placeNoteCandidates(input(['workshop/offsite', 'sparring/peter'], {pageKind: 'meeting'}));
    expect(placed.map(p => p.candidate.setup?.name)).toEqual(['Sparring', 'Workshop']);
  });

  it('own notes are one candidate; no setup is the Default', () => {
    mockLoops = [];
    expect(placeNoteCandidates(input(['workshop/offsite', 'team/jf'])).map(p => [p.candidate.setup?.name, p.shared])).toEqual([['Workshop', null]]);
    expect(placeNoteCandidates(input(['other'])).map(p => [p.candidate.setup, p.shared])).toEqual([[null, null]]);
  });

  it('items no setup matches go into the Default notebook, rendered without tags', () => {
    const withNotebook = {...settings, noteSetupDefaults: {...settings.noteSetupDefaults, notebook: {name: 'Daily {year}', folder: 'Meetings'}}};
    const [placed] = placeNoteCandidates(input(['other'], {settings: withNotebook}));
    expect(placed.candidate).toEqual({setup: null, target: 'notebook'});
    expect(placed.shared?.relativeFile).toBe('Meetings/Daily 2026.note');
    expect(layoutForLink({...input(['other'], {settings: withNotebook, pageKind: 'meeting'}), linkedFile: 'Meetings/Daily 2026.note'})).toBe(settings.noteSetupDefaults.pages.meeting);
  });

  it('Inbox: the best setup, its own note', () => {
    const placed = placeNoteCandidates(input(['sparring/peter'], {forceOwn: true}));
    expect(placed.map(p => [p.candidate.setup?.name, p.candidate.target, p.shared])).toEqual([['Sparring', 'own', null]]);
  });
});

describe('layoutForLink', () => {
  const tags = ['workshop/offsite', 'sparring/peter'];

  it('a page in the notebook uses the Thread setup layout, even when the loop is the default place', () => {
    expect(layoutForLink({...input(tags), linkedFile: 'Sparring/sparring peter 2026.note'})).toBe(sparringTodo);
  });

  it('a page in the loop note uses the Loop setup layout', () => {
    expect(layoutForLink({...input(tags), linkedFile: '2026-11 workshop offsite.note'})).toBe(workshopTodo);
  });

  it('an unknown file falls back to the best candidate; an own note to the own candidate', () => {
    expect(layoutForLink({...input(tags), linkedFile: 'Todos/elsewhere.note'})).toBe(workshopTodo);
    mockLoops = [];
    expect(layoutForLink({...input(tags), linkedFile: null})).toBe(workshopTodo);
  });

  it('a setup without its own layout uses the Default page; no setup the Default', () => {
    expect(layoutForLink({...input(['team/jf'], {pageKind: 'meeting'}), linkedFile: null})).toBe(settings.noteSetupDefaults.pages.meeting);
    expect(layoutForLink({...input(['other']), linkedFile: null})).toBeNull();
  });
});
