/** Page order in a notebook: Timeline (docs/dev/history/technical-design-note-setups.md §13). */
import {afterItemIndex, pageMarks, timelineInsertIndex} from '../../src/domain/pageOrder';

type Page = string[];

/** The Timeline index for a page dated `date` in a file whose pages carry `pages` keywords. */
const insertAt = (pages: Page[], date: string) =>
  timelineInsertIndex(
    pageMarks(
      pages.flatMap((keywords, page) => keywords.map(keyword => ({page, keyword}))),
      pages.length,
    ),
    date,
  );

const meeting = (date: string, title: string): Page => [`${date} ${title}`, date];
const todo = (created: string, text: string): Page => [text, created];
const handAdded: Page = [];

describe('timelineInsertIndex', () => {
  it('puts the first page of an empty file at 0', () => {
    expect(insertAt([], '2026-10-08')).toBe(0);
  });

  it('puts a meeting between the meetings around its date', () => {
    expect(insertAt([meeting('2026-10-01', 'Retro'), meeting('2026-10-15', 'Retro')], '2026-10-08')).toBe(1);
  });

  it('puts a todo created between two meetings between them', () => {
    expect(insertAt([meeting('2026-10-01', 'Retro'), meeting('2026-10-15', 'Retro')], '2026-10-13')).toBe(1);
  });

  it('keeps an item’s hand-added pages with it and goes before the next start', () => {
    const pages = [meeting('2026-10-01', 'Retro'), handAdded, ['my own heading'], meeting('2026-10-15', 'Retro'), handAdded];
    expect(insertAt(pages, '2026-10-08')).toBe(3);
    expect(insertAt(pages, '2026-10-20')).toBe(5);
  });

  it('goes after all items of the same date', () => {
    const pages = [meeting('2026-10-08', 'Standup'), todo('2026-10-08', 'Call supplier'), handAdded, meeting('2026-10-09', 'Retro')];
    expect(insertAt(pages, '2026-10-08')).toBe(3);
  });

  it('goes first when its date is before everything', () => {
    expect(insertAt([todo('2026-10-02', 'Call'), meeting('2026-10-15', 'Retro')], '2026-09-01')).toBe(0);
  });

  it('reads a file from before 0.13: meeting anchors by their date, todo pages as continuation', () => {
    const pages = [['2026-10-01 Retro'], ['Call supplier'], ['2026-10-15 Retro'], ['Order paper']];
    expect(insertAt(pages, '2026-10-08')).toBe(2);
    expect(insertAt(pages, '2026-10-20')).toBe(4);
  });

  it('prefers the bare date over an anchor’s leading date', () => {
    expect(insertAt([['2026-10-20 Retro', '2026-10-01'], meeting('2026-10-15', 'Retro')], '2026-10-08')).toBe(1);
  });

  it('never goes before a loop note’s first page', () => {
    expect(insertAt([['loop workshop/offsite', '2026-12-01']], '2026-10-08')).toBe(1);
    expect(insertAt([['loop workshop/offsite'], handAdded, meeting('2026-10-15', 'Offsite')], '2026-10-08')).toBe(2);
  });

  it('never goes before a home notebook’s Home page', () => {
    expect(insertAt([['home']], '2026-10-08')).toBe(1);
    expect(insertAt([['home', '2026-12-01'], meeting('2026-12-02', 'Retro')], '2026-10-08')).toBe(1);
    expect(insertAt([['home'], handAdded, meeting('2026-10-15', 'Retro')], '2026-10-08')).toBe(2);
  });

  it('treats a page with only the user’s own keywords as a continuation page', () => {
    expect(insertAt([meeting('2026-10-15', 'Retro'), ['ideas', 'team/a']], '2026-10-20')).toBe(2);
    expect(insertAt([['ideas'], meeting('2026-10-15', 'Retro')], '2026-10-08')).toBe(1);
  });
});

describe('pageMarks', () => {
  it('marks starts, continuation and pinned pages, ignoring keywords past the last page', () => {
    const keywords = [
      {page: 0, keyword: 'loop workshop/offsite'},
      {page: 1, keyword: 'Call'},
      {page: 1, keyword: '2026-10-02'},
      {page: 3, keyword: '2026-10-09'},
    ];
    expect(pageMarks(keywords, 3)).toEqual([
      {startDate: null, pinned: true},
      {startDate: '2026-10-02', pinned: false},
      {startDate: null, pinned: false},
    ]);
  });
});

describe('afterItemIndex (meeting reflection, R3)', () => {
  const marksOf = (pages: Page[]) =>
    pageMarks(
      pages.flatMap((keywords, page) => keywords.map(keyword => ({page, keyword}))),
      pages.length,
    );
  const after = (pages: Page[], itemPage: number) => afterItemIndex(marksOf(pages), itemPage);
  const loopPage: Page = ['loop workshop/offsite'];
  const reflection: Page = ['reflection 2026-10-14 Sparring Mieke'];

  it('goes right after a one-page item', () => {
    expect(after([meeting('2026-10-14', 'Sparring'), meeting('2026-10-20', 'Check-in')], 0)).toBe(1);
  });

  it('goes after the pages added by hand before the next meeting page', () => {
    expect(after([meeting('2026-10-14', 'Sparring'), handAdded, handAdded, meeting('2026-10-20', 'Check-in')], 0)).toBe(3);
  });

  it('goes after the pages added by hand before the next todo page', () => {
    expect(after([meeting('2026-10-14', 'Sparring'), handAdded, todo('2026-10-15', 'Prepare the workshop')], 0)).toBe(2);
  });

  it('goes at the end when no item follows', () => {
    expect(after([meeting('2026-10-01', 'Retro'), meeting('2026-10-14', 'Sparring'), handAdded], 1)).toBe(3);
  });

  it('stops before a pinned page and ignores pinned pages before the item', () => {
    expect(after([loopPage, meeting('2026-10-14', 'Sparring'), handAdded], 1)).toBe(3);
    expect(afterItemIndex([{startDate: '2026-10-14', pinned: false}, {startDate: null, pinned: true}], 0)).toBe(1);
  });

  it('keeps a reflection page a continuation page, so a later meeting goes after it', () => {
    const pages = [meeting('2026-10-14', 'Sparring'), reflection, meeting('2026-10-20', 'Check-in')];
    expect(marksOf(pages)[1]).toEqual({startDate: null, pinned: false});
    expect(after(pages, 0)).toBe(2);
    expect(insertAt([meeting('2026-10-14', 'Sparring'), reflection], '2026-10-16')).toBe(2);
  });
});
