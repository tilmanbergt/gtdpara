import {spliceWordAtSelection} from '../../src/domain/clipboardText';
import {noteChoiceText, noteCreationConfirmText} from '../../src/domain/fileChangeText';
import {NoteCreationPlan} from '../../src/domain/noteCreationPlan';
import {renderSharedFileName} from '../../src/domain/sharedNotePages';
import {setupTypeTag} from '../../src/domain/noteSetups';

const NO_OWNER = {itemName: '', itemAbbrev: ''};

// docs/dev/history/technical-design-split-by-tag.md §3.3, §3.5, §3.6

describe('renderSharedFileName', () => {
  const base = {template: 'Coaching {subtag} {year}', fallbackName: 'Coaching', subtag: 'sabina', date: '2026-10-02', ...NO_OWNER};

  it('fills every placeholder', () => {
    expect(renderSharedFileName({...base, template: '{subtag} {year}-{quarter} {month}'})).toBe('sabina 2026-Q4 10');
  });

  it('matches placeholders case-insensitively and keeps unknown ones', () => {
    expect(renderSharedFileName({...base, template: 'Coaching {Subtag} {YEAR} {client}'})).toBe('Coaching sabina 2026 {client}');
  });

  it('drops a missing subtag without a double space', () => {
    expect(renderSharedFileName({...base, subtag: ''})).toBe('Coaching 2026');
  });

  it('falls back to the rule name when the result is empty', () => {
    expect(renderSharedFileName({...base, template: '{subtag}', subtag: ''})).toBe('Coaching');
  });

  it('works out quarters at their boundaries', () => {
    const q = (date: string) => renderSharedFileName({...base, template: '{quarter}', date});
    expect(q('2026-01-01')).toBe('Q1');
    expect(q('2026-03-31')).toBe('Q1');
    expect(q('2026-04-01')).toBe('Q2');
    expect(q('2026-09-30')).toBe('Q3');
    expect(q('2026-12-31')).toBe('Q4');
  });

  it('leaves a template without placeholders unchanged', () => {
    expect(renderSharedFileName({...base, template: 'Daily'})).toBe('Daily');
  });
});

// docs/dev/history/technical-design-note-setups-finish.md §1
describe('{name} and {abbr} in note names', () => {
  const base = {template: '{abbr} {tag} {subtag} {year}', fallbackName: 'Sparring', tag: 'sparring', subtag: 'peter', date: '2026-10-02'};
  const owner = {itemName: 'Leadership Program', itemAbbrev: 'LP'};

  it('fills the owner’s abbreviation and name', () => {
    expect(renderSharedFileName({...base, ...owner})).toBe('LP sparring peter 2026');
    expect(renderSharedFileName({...base, ...owner, template: '{name} {year}'})).toBe('Leadership Program 2026');
  });
  it('uses the name for {abbr} when there is no abbreviation', () => {
    expect(renderSharedFileName({...base, itemName: 'Garden', itemAbbrev: ''})).toBe('Garden sparring peter 2026');
  });
  it('matches them case-insensitively', () => {
    expect(renderSharedFileName({...base, ...owner, template: '{ABBR}-{Name}'})).toBe('LP-Leadership Program');
  });
  it('leaves both out when unknown, without double spaces', () => {
    expect(renderSharedFileName({...base, ...NO_OWNER, template: '{abbr} {name} {subtag} {year}', subtag: ''})).toBe('2026');
    expect(renderSharedFileName({...base, ...NO_OWNER, template: '{abbr}{name}'})).toBe('Sparring');
  });
  it('works with date placeholders left out', () => {
    expect(renderSharedFileName({...base, ...owner, template: '{abbr} {subtag} {year}-{month}', date: ''})).toBe('LP peter');
  });
});

describe('spliceWordAtSelection', () => {
  it('appends at the end with a space when never focused', () => {
    expect(spliceWordAtSelection('Coaching', null, '{year}')).toEqual({text: 'Coaching {year}', cursor: 15});
  });

  it('inserts at the cursor with spaces on both sides', () => {
    expect(spliceWordAtSelection('Coaching{year}', {start: 8, end: 8}, '{subtag}')).toEqual({
      text: 'Coaching {subtag} {year}',
      cursor: 18,
    });
  });

  it('adds no extra spaces where there already are some', () => {
    expect(spliceWordAtSelection('Coaching  2026', {start: 9, end: 9}, '{subtag}').text).toBe('Coaching {subtag} 2026');
  });

  it('replaces a selection', () => {
    expect(spliceWordAtSelection('Coaching 2026', {start: 9, end: 13}, '{year}').text).toBe('Coaching {year}');
  });

  it('inserts into an empty field without spaces', () => {
    expect(spliceWordAtSelection('', null, '{subtag}')).toEqual({text: '{subtag}', cursor: 8});
  });
});

describe('noteCreationConfirmText', () => {
  const plan = (kind: NoteCreationPlan['kind'], extra: Partial<NoteCreationPlan> = {}): NoteCreationPlan => ({
    kind,
    file: 'Meetings/Coaching sabina 2026.note',
    absolutePath: '/x',
    setupName: 'Coaching',
    ...extra,
  });
  const full = 'Note/2 Areas/Coaching/Meetings/Coaching sabina 2026.note';

  it('names the rule and the file for first-time notes', () => {
    expect(noteCreationConfirmText(plan('new-shared-file'), full)).toMatchObject({
      text: 'Coaching: new file Meetings/Coaching sabina 2026.note',
      actionLabel: 'Create',
    });
    expect(noteCreationConfirmText(plan('new-page'), full)).toMatchObject({
      text: 'Coaching: new page in Meetings/Coaching sabina 2026.note',
      actionLabel: 'Add page',
    });
    expect(noteCreationConfirmText(plan('new-own-file', {file: 'Todos/Call.note'}), full).text).toBe(
      'Coaching: new note Todos/Call.note',
    );
    expect(noteCreationConfirmText(plan('new-own-file', {file: 'Todos/Call.note', setupName: null}), full).text).toBe(
      'New note Todos/Call.note',
    );
  });

  it('asks before linking to an existing page', () => {
    const t = noteCreationConfirmText(plan('link-page', {keyword: '2026-10-02 Session'}), full);
    expect(t.text).toContain('page "2026-10-02 Session" already exists');
    expect(t.actionLabel).toBe('Link');
  });

  it('says a recreate does not bring content back', () => {
    for (const kind of ['recreate-page', 'recreate-shared-file', 'recreate-own-file'] as const) {
      const t = noteCreationConfirmText(plan(kind, {setupName: null}), full);
      expect(t.text).toContain('(deleted?)');
      expect(t.detail).toContain('Earlier content is not restored');
      expect(t.detail).toContain(full);
    }
  });
});

// docs/dev/history/technical-design-tending-threads.md §3.8: one rule for several types.
describe('{tag} in shared file names', () => {
  it('names the file after the rule tag the item matched', () => {
    const tag = setupTypeTag(['next', 'retro/alpha'], ['sparring', 'retro']);
    expect(tag).toBe('retro');
    const rendered = renderSharedFileName({template: '{tag} {subtag} {year}', fallbackName: 'Sessions', tag, subtag: 'alpha', date: '2026-10-02', ...NO_OWNER});
    expect(rendered).toBe('retro alpha 2026');
    expect(renderSharedFileName({template: '{TAG} {year}', fallbackName: 'S', tag: 'sparring', subtag: '', date: '2026-10-02', ...NO_OWNER})).toBe('sparring 2026');
  });
  it('leaves {tag} empty when no rule tag matches', () => {
    expect(setupTypeTag(['retrox/a', 'other'], ['retro'])).toBe('');
    expect(renderSharedFileName({template: 'Notes {tag} {year}', fallbackName: 'Notes', subtag: '', date: '2026-10-02', ...NO_OWNER})).toBe('Notes 2026');
  });
  it('matches a plain rule tag and keeps the first match in text order', () => {
    expect(setupTypeTag(['Sparring', 'retro/a'], ['RETRO', 'sparring'])).toBe('sparring');
  });
});

describe('note choice text (docs/dev/history/technical-design-note-setups.md §4.4)', () => {
  const full = 'Note/2 Areas/Coaching/2026-11 workshop offsite.note';
  const loopPlan: NoteCreationPlan = {kind: 'new-page', file: '2026-11 workshop offsite.note', absolutePath: '/x', setupName: 'Workshop'};
  const notebook: NoteCreationPlan = {kind: 'new-shared-file', file: 'Sparring/sparring peter 2026.note', absolutePath: '/y', setupName: 'Sparring'};
  const own: NoteCreationPlan = {kind: 'new-own-file', file: 'Todos/Draft.note', absolutePath: '/z', setupName: 'Team'};

  it('one place: the plain confirm', () => {
    expect(noteChoiceText(loopPlan, full)).toEqual({
      text: 'Workshop: new page in 2026-11 workshop offsite.note',
      detail: `Adds a page for this item to ${full}.`,
      labels: ['Add page'],
    });
  });

  it('more places: one button for the best other one, every place in the detail', () => {
    const t = noteChoiceText({...loopPlan, alternatives: [notebook, own]}, full);
    expect(t.labels).toEqual(['Add page', 'In Sparring']);
    expect(t.detail).toContain('Or: Sparring: new file Sparring/sparring peter 2026.note');
    expect(t.detail).toContain('Or: Team: new note Todos/Draft.note');
    expect(noteChoiceText({...loopPlan, alternatives: [own]}, full).labels).toEqual(['Add page', 'Own note']);
  });
});
