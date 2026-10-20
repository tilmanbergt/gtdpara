/** The Supernote's keyword limit (docs/dev/history/technical-design-keyword-length.md §4.1, §6). */
import {fitKeyword, KEYWORD_MAX_LENGTH, keywordFits} from '../../src/domain/keywordLength';
import {planPageKeywords} from '../../src/domain/noteFindability';
import {meetingPageKeyword, parseKeywordLeadingDate, todoPageKeyword} from '../../src/domain/sharedNotePages';
import {loopPageKeyword} from '../../src/storage/loopNotes';
import {meeting, task} from '../../test-helpers/fixtures';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('sn-plugin-lib', () => ({PluginCommAPI: {recycleElement: jest.fn()}}));
jest.mock('../../src/supernote/fileSystem', () => ({}));

describe('fitKeyword', () => {
  it('measures 43 characters, an umlaut counting as one', () => {
    expect(KEYWORD_MAX_LENGTH).toBe(43);
    expect(keywordFits('ä'.repeat(43))).toBe(true);
    expect(keywordFits('1'.repeat(44))).toBe(false);
  });

  it('keeps every keyword of 43 characters or less exactly as it is', () => {
    for (const k of ['WIP Concept entwickeln für #owe/Demand', 'a  ( b )  c', 'x'.repeat(43), ' lead ']) {
      expect(fitKeyword(k)).toBe(k);
    }
  });

  it('leaves out tags first: the todo from the device log', () => {
    expect(fitKeyword('WIP Concept entwickeln für #owe/Demand (outcome #retro/demand)')).toBe('WIP Concept entwickeln für (outcome)');
  });

  it('cuts at a word boundary with "…" when leaving out tags is not enough', () => {
    expect(fitKeyword('Entscheidungsvorlage für Lenkungskreis vorbereiten und mit Bereichsleitung abstimmen')).toBe(
      'Entscheidungsvorlage für Lenkungskreis…',
    );
    expect(fitKeyword('Entscheidungsvorlage für Lenkungskreis vorbereiten #a #b und mit Bereichsleitung')).toBe(
      'Entscheidungsvorlage für Lenkungskreis…',
    );
  });

  it('hard-cuts one long word and a keyword made only of tags', () => {
    expect(fitKeyword('Donaudampfschifffahrtsgesellschaftskapitänsmützenhersteller ok')).toBe(
      'Donaudampfschifffahrtsgesellschaftskapitän…',
    );
    const onlyTags = fitKeyword('#aaaaaaaaaaaaaaaaaaaa/bbbbbbbbbbbbbbbbbbbbbbbbbbbb');
    expect(onlyTags).toBe('#aaaaaaaaaaaaaaaaaaaa/bbbbbbbbbbbbbbbbbbbb…');
  });

  it('never splits an emoji', () => {
    const k = `${'a'.repeat(41)}😀 more text here`;
    const fitted = fitKeyword(k);
    expect(fitted).toBe(`${'a'.repeat(41)}…`);
    expect(keywordFits(fitted)).toBe(true);
  });

  it('is always within the limit and idempotent', () => {
    const words = ['Plan', 'Review', '#tag/sub', 'für', '(outcome', '#x)', 'Ärger', '-', 'Abstimmung,', '😀', 'Lenkungskreis'];
    for (let seed = 1; seed < 400; seed++) {
      let n = seed;
      const parts: string[] = [];
      for (let i = 0; i < 3 + (seed % 17); i++) {
        n = (n * 1103515245 + 12345) % 2147483648;
        parts.push(words[n % words.length]);
      }
      const k = parts.join(' ');
      const fitted = fitKeyword(k);
      expect(fitted.length).toBeLessThanOrEqual(KEYWORD_MAX_LENGTH);
      expect(fitKeyword(fitted)).toBe(fitted);
    }
  });
});

describe('keyword builders use the fitted keyword', () => {
  it('todo: the same long text always gives the same keyword', () => {
    const long = task('WIP Concept entwickeln für #owe/Demand (outcome #retro/demand) #next');
    expect(todoPageKeyword(long)).toBe('WIP Concept entwickeln für (outcome)');
    expect(todoPageKeyword(task('WIP Concept entwickeln für #owe/Demand (outcome #retro/demand)'))).toBe(todoPageKeyword(long));
  });

  it('todo: a short keyword is unchanged', () => {
    expect(todoPageKeyword(task('Call Anna #coaching #next'))).toBe('Call Anna #coaching');
  });

  it('meeting: the date stays in front and is still read by the page order', () => {
    const kw = meetingPageKeyword(meeting('2026-10-19', 'Refine & Replenish mit allen Teamleads und PO #replenishment/demand'));
    expect(kw).toBe('2026-10-19 Refine & Replenish mit allen…');
    expect(parseKeywordLeadingDate(kw)).toBe('2026-10-19');
  });

  it('loop: the prefix stays', () => {
    const kw = loopPageKeyword('coaching/a-very-long-client-name-with-many-parts');
    expect(kw.startsWith('loop ')).toBe(true);
    expect(keywordFits(kw)).toBe(true);
    expect(loopPageKeyword('coaching/anna')).toBe('loop coaching/anna');
  });

  it('tag keywords: a long tag is added once, in its fitted form', () => {
    const tag = 'project/a-very-long-nested-tag-name/with-more-parts';
    const first = planPageKeywords({onPage: [], date: null, tags: [tag]});
    expect(first.add).toEqual([fitKeyword(tag)]);
    const again = planPageKeywords({onPage: [{keyword: fitKeyword(tag), index: 1}], date: null, tags: [tag]});
    expect(again.add).toEqual([]);
  });
});
