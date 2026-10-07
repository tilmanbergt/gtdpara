import {spliceWordAtSelection} from '../../src/domain/clipboardText';
import {noteCreationConfirmText} from '../../src/domain/fileChangeText';
import {NoteCreationPlan} from '../../src/domain/noteCreationPlan';
import {renderSharedFileName} from '../../src/domain/sharedNotePages';

// docs/dev/history/technical-design-split-by-tag.md §3.3, §3.5, §3.6

describe('renderSharedFileName', () => {
  const base = {template: 'Coaching {subtag} {year}', ruleName: 'Coaching', subtag: 'sabina', date: '2026-10-02'};

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
    ruleName: 'Coaching',
    ...extra,
  });
  const full = 'Note/2 Areas/Coaching/Meetings/Coaching sabina 2026.note';

  it('names the rule and the file for first-time notes', () => {
    expect(noteCreationConfirmText(plan('new-shared-file'), full)).toMatchObject({
      text: 'Rule Coaching: new file Meetings/Coaching sabina 2026.note',
      actionLabel: 'Create',
    });
    expect(noteCreationConfirmText(plan('new-page'), full)).toMatchObject({
      text: 'Rule Coaching: new page in Meetings/Coaching sabina 2026.note',
      actionLabel: 'Add page',
    });
    expect(noteCreationConfirmText(plan('new-own-file', {file: 'Todos/Call.note'}), full).text).toBe(
      'Rule Coaching: new note Todos/Call.note',
    );
    expect(noteCreationConfirmText(plan('new-own-file', {file: 'Todos/Call.note', ruleName: null}), full).text).toBe(
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
      const t = noteCreationConfirmText(plan(kind, {ruleName: null}), full);
      expect(t.text).toContain('(deleted?)');
      expect(t.detail).toContain('Earlier content is not restored');
      expect(t.detail).toContain(full);
    }
  });
});
