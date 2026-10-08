/** Date and tag keywords of note pages (docs/dev/history/technical-design-projects-findable-notes.md §2.7). */
import {isBareDateKeyword, itemDateKeyword, planPageKeywords} from '../../src/domain/noteFindability';
import {chronologicalInsertIndex} from '../../src/domain/sharedNotePages';
import {emptyTaskFields} from '../../src/domain/taskLine';
import {meeting, task} from '../../test-helpers/fixtures';

const at = (...keywords: string[]) => keywords.map((keyword, index) => ({keyword, index}));

describe('itemDateKeyword', () => {
  it('is the meeting date', () => {
    expect(itemDateKeyword(meeting('2026-09-30', 'Retro'))).toBe('2026-09-30');
  });
  it('is a todo’s created date, never its due date', () => {
    expect(itemDateKeyword(task('Call', {fields: {...emptyTaskFields(), created: '2026-10-02', due: '2026-10-20'}}))).toBe('2026-10-02');
    expect(itemDateKeyword(task('Call', {fields: {...emptyTaskFields(), due: '2026-10-20'}}))).toBeNull();
  });
  it('is null for a malformed date', () => {
    expect(itemDateKeyword(meeting('2026-13-01', 'x'))).toBeNull();
    expect(itemDateKeyword(meeting('2026-02-30', 'x'))).toBeNull();
    expect(itemDateKeyword(task('x', {fields: {...emptyTaskFields(), created: 'soon'}}))).toBeNull();
  });
  it('recognises bare dates only', () => {
    expect(isBareDateKeyword('2026-09-30')).toBe(true);
    expect(isBareDateKeyword('2026-09-30 Retro demand')).toBe(false);
    expect(isBareDateKeyword('retro')).toBe(false);
  });
});

describe('planPageKeywords', () => {
  it('does nothing when the page is up to date', () => {
    expect(planPageKeywords({onPage: at('2026-09-30 Retro', '2026-09-30', 'retro/demand'), date: '2026-09-30', tags: ['retro/demand']})).toEqual({
      add: [],
      deleteIndexes: [],
    });
  });
  it('adds the date and the missing tags, keeping the anchor', () => {
    expect(planPageKeywords({onPage: at('2026-09-30 Retro', 'retro'), date: '2026-09-30', tags: ['retro', 'team/a']})).toEqual({
      add: ['2026-09-30', 'team/a'],
      deleteIndexes: [],
    });
  });
  it('replaces a changed date, deleting high to low, never tags or the anchor', () => {
    expect(planPageKeywords({onPage: at('2026-09-30', 'old-tag', '2026-09-30 Retro', '2026-09-01'), date: '2026-10-07', tags: []})).toEqual({
      add: ['2026-10-07'],
      deleteIndexes: [3, 0],
    });
  });
  it('without a date leaves bare dates of other days to be removed and adds nothing', () => {
    expect(planPageKeywords({onPage: at('2026-09-30'), date: null, tags: []})).toEqual({add: [], deleteIndexes: [0]});
  });
});

describe('chronologicalInsertIndex with date keywords', () => {
  it('keeps a todo page with a bare date unordered', () => {
    const keywords = [
      {page: 0, keyword: 'Call supplier'},
      {page: 0, keyword: '2026-12-01'},
      {page: 1, keyword: '2026-09-30 Retro'},
    ];
    expect(chronologicalInsertIndex(keywords, 2, '2026-10-07 Retro')).toBe(2);
  });
  it('orders meeting pages by their anchor, whatever extra bare date they carry', () => {
    const keywords = [
      {page: 0, keyword: '2026-01-01'},
      {page: 0, keyword: '2026-09-30 Retro'},
      {page: 1, keyword: '2026-10-14 Retro'},
      {page: 1, keyword: '2026-10-14'},
    ];
    expect(chronologicalInsertIndex(keywords, 2, '2026-10-07 Retro')).toBe(1);
  });
});
