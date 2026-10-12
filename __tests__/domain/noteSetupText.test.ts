// docs/dev/history/technical-design-note-setups.md §6: what Settings → Note setups shows.
import {createDefaultMeetingPage, createNoteSetup, NoteSetup, seedNoteSetupDefaults} from '../../src/domain/noteSetups';
import {
  defaultRowSummary,
  loopNotePreviews,
  notebookPreviews,
  notesSummary,
  pageRowSummary,
  setupRowSummary,
  setupTagChoices,
} from '../../src/domain/noteSetupText';

const sparring: NoteSetup = {
  ...createNoteSetup('1', 'thread'),
  name: 'Sparring',
  tags: ['sparring', 'retro'],
  notebook: {name: '{tag} {subtag} {year}', folder: 'Sparring'},
  tracking: {trackPrep: true, trackReview: true},
};
const workshop: NoteSetup = {...createNoteSetup('2', 'loop'), name: 'Workshop', tags: ['workshop']};

describe('row texts', () => {
  it('setup rows: tags, where notes go, tracking', () => {
    expect(setupRowSummary(sparring)).toBe('#sparring #retro · notebook Sparring/{tag} {subtag} {year} · tracks prep + review');
    expect(setupRowSummary(workshop)).toBe('#workshop · loop note {year}-{month} {tag} {subtag}');
    expect(setupRowSummary(createNoteSetup('3', 'thread'))).toBe('no tags yet · own note per item');
  });

  it('the Default row', () => {
    expect(defaultRowSummary(seedNoteSetupDefaults())).toBe('Meeting page · Todo page · First page · own note per item');
    expect(defaultRowSummary({...seedNoteSetupDefaults(), notebook: {name: 'Daily', folder: ''}})).toContain('notebook Daily');
    expect(notesSummary(null, undefined)).toBe('own note per item');
  });

  it('page rows', () => {
    expect(pageRowSummary(createDefaultMeetingPage(), false)).toBe('Default layout · 4 pieces · blank');
    expect(pageRowSummary({template: 'Lined.png', pieces: [createDefaultMeetingPage().pieces[0]]}, true)).toBe('Own layout · 1 piece · Lined.png');
    expect(pageRowSummary(null, null)).toBe('0 pieces · blank');
  });
});

describe('setupTagChoices', () => {
  it('types first, then plain tags; tags of other setups left out; own tags kept', () => {
    const recent = ['coaching/sabina', 'retro/alpha', 'daily', '#Workshop/offsite', 'sparring'];
    expect(setupTagChoices(recent, [sparring, workshop], null, [])).toEqual(['coaching', 'daily']);
    expect(setupTagChoices(recent, [sparring, workshop], '1', sparring.tags)).toEqual(['sparring', 'retro', 'coaching', 'daily']);
  });
});

describe('previews', () => {
  it('one example per tag, in its folder', () => {
    expect(notebookPreviews('{tag} {subtag} {year}', 'Sparring', ['sparring', 'retro'], 'Sparring', '2026-10-12')).toEqual([
      'Sparring/sparring client 2026.note',
      'Sparring/retro client 2026.note',
    ]);
    expect(notebookPreviews('', 'Daily', [], '', '2026-10-12')).toEqual(['Daily.note']);
  });

  it('a loop note with and without a main date', () => {
    expect(loopNotePreviews('{year}-{month} {tag} {subtag}', ['workshop'], '2026-11-14')).toEqual([
      '2026-11 workshop teamoffsite.note',
      'workshop teamoffsite.note',
    ]);
  });
});
