import {emailNoteBaseName} from '../../src/domain/emailNote';
import {invalidFileNameChars, sanitizeFileNameComponent} from '../../src/domain/fileName';

describe('sanitizeFileNameComponent', () => {
  it('replaces every forbidden character with a space', () => {
    for (const ch of ['\\', '/', ':', '*', '?', '"', '<', '>', '|', '#', '[', ']', '^']) {
      expect(sanitizeFileNameComponent(`a${ch}b`)).toBe('a b');
    }
  });
  it('replaces control characters', () => {
    expect(sanitizeFileNameComponent('a\tb\nc\u0001d')).toBe('a b c d');
  });
  it('collapses whitespace and trims', () => {
    expect(sanitizeFileNameComponent('  Site  visit #marco  ')).toBe('Site visit marco');
    expect(sanitizeFileNameComponent('Plan [v2] #x')).toBe('Plan v2 x');
  });
  it('falls back for an empty result', () => {
    expect(sanitizeFileNameComponent('#[]^')).toBe('Untitled');
    expect(sanitizeFileNameComponent('', 'No subject')).toBe('No subject');
  });
  it('keeps letters, umlauts, emoji, dots and dashes', () => {
    expect(sanitizeFileNameComponent('Übergabe 2.0 - 🚀 (Team)')).toBe('Übergabe 2.0 - 🚀 (Team)');
  });
});

describe('invalidFileNameChars', () => {
  it('lists each forbidden character once, in order', () => {
    expect(invalidFileNameChars('A#B#C[d]')).toEqual(['#', '[', ']']);
  });
  it('is empty for a valid name', () => {
    expect(invalidFileNameChars('Kunde Müller 2026')).toEqual([]);
  });
  it('shows control characters as \\u escapes', () => {
    expect(invalidFileNameChars('a\tb')).toEqual(['\\u0009']);
  });
});

describe('emailNoteBaseName uses the same rule', () => {
  const today = new Date(2026, 9, 3);
  it('strips # [ ] ^ from the subject', () => {
    expect(emailNoteBaseName('', 'Re: [Ticket #42] Update ^ now', today)).toBe('2026-10-03 Re Ticket 42 Update now');
  });
  it('falls back to "No subject"', () => {
    expect(emailNoteBaseName('', '###', today)).toBe('2026-10-03 No subject');
  });
});
