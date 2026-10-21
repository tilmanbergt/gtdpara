/** The Reflection page's keyword and place (docs/dev/history/technical-design-meeting-reflection.md §2.2). */
import {KEYWORD_MAX_LENGTH} from '../../src/domain/keywordLength';
import {pageMarks} from '../../src/domain/pageOrder';
import {
  isReflectionKeyword,
  reflectionKeyword,
  reflectionKeywordOfPageKeyword,
  reflectionOffered,
  reflectionPageOf,
} from '../../src/domain/reflection';
import {parseKeywordLeadingDate} from '../../src/domain/sharedNotePages';
import {meeting} from '../../test-helpers/fixtures';

describe('reflectionKeyword', () => {
  it('is the prefix, the date and the title', () => {
    expect(reflectionKeyword(meeting('2026-10-14', 'Sparring'))).toBe('reflection 2026-10-14 Sparring');
  });

  it('leaves out the state tags', () => {
    expect(reflectionKeyword(meeting('2026-10-14', 'Sparring #prepped #reviewed #monthly'))).toBe('reflection 2026-10-14 Sparring');
  });

  it('is fitted to the keyword limit, the tags going first', () => {
    const kw = reflectionKeyword(meeting('2026-10-14', 'Sparring Mieke #sparring/mieke'));
    expect(kw).toBe('reflection 2026-10-14 Sparring Mieke');
    const long = reflectionKeyword(meeting('2026-10-14', 'A very long sparring session title about roles and canvases'));
    expect(long.length).toBeLessThanOrEqual(KEYWORD_MAX_LENGTH);
    expect(long.startsWith('reflection 2026-10-14 ')).toBe(true);
    expect(long.endsWith('…')).toBe(true);
  });

  it('never starts with a date, so the page never starts an item', () => {
    expect(parseKeywordLeadingDate(reflectionKeyword(meeting('2026-10-14', 'Sparring')))).toBeNull();
  });

  it('is what the stored meeting-page keyword gives, before a rename was opened', () => {
    expect(reflectionKeywordOfPageKeyword('2026-10-14 Sparring Mieke #sparring/mieke')).toBe('reflection 2026-10-14 Sparring Mieke');
  });
});

describe('isReflectionKeyword', () => {
  it('needs the prefix and a date', () => {
    expect(isReflectionKeyword('reflection 2026-10-14 Sparring')).toBe(true);
    expect(isReflectionKeyword('reflection 2026-10-14')).toBe(true);
    expect(isReflectionKeyword('reflection on roles')).toBe(false);
    expect(isReflectionKeyword('2026-10-14 reflection')).toBe(false);
  });
});

describe('reflectionPageOf', () => {
  const find = (pages: string[][], itemPage: number) => {
    const keywords = pages.flatMap((kws, page) => kws.map(keyword => ({page, keyword})));
    return reflectionPageOf(keywords, pageMarks(keywords, pages.length), itemPage);
  };
  const sparring = ['2026-10-14 Sparring Mieke', '2026-10-14'];
  const checkin = ['2026-10-20 Check-in Mieke', '2026-10-20'];

  it('finds the reflection after the meeting and its hand-added pages', () => {
    expect(find([sparring, [], ['reflection 2026-10-14 Sparring Mieke'], checkin], 0)).toEqual({page: 2, keyword: 'reflection 2026-10-14 Sparring Mieke'});
  });

  it('does not look beyond the next item', () => {
    expect(find([sparring, [], checkin, ['reflection 2026-10-20 Check-in Mieke']], 0)).toBeNull();
  });

  it('finds it by prefix after the meeting was renamed', () => {
    expect(find([sparring, ['reflection 2026-10-14 Sparring Mieke']], 0)?.page).toBe(1);
  });

  it('does not take the meeting page itself, nor look past a pinned page', () => {
    expect(find([['reflection 2026-10-14 X', '2026-10-14']], 0)).toBeNull();
    expect(find([sparring, ['home'], ['reflection 2026-10-14 Sparring Mieke']], 0)).toBeNull();
  });
});

describe('reflectionOffered', () => {
  const now = new Date(2026, 9, 21, 12, 0).getTime();
  it('once the meeting is over and not cancelled', () => {
    expect(reflectionOffered(meeting('2026-10-18', 'Sparring', {time: '10:00', endTime: '11:00'}), now)).toBe(true);
    expect(reflectionOffered(meeting('2026-10-21', 'Sparring', {time: '11:00', endTime: '13:00'}), now)).toBe(false);
    expect(reflectionOffered(meeting('2026-10-18', 'Sparring', {cancelled: true}), now)).toBe(false);
  });
});
