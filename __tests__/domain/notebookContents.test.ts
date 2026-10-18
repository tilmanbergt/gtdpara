// docs/dev/history/technical-design-home-notebooks.md §3.5, §6: the Contents of a home notebook.
import {buildContents, HANDWRITTEN_HEADING, headingText} from '../../src/domain/notebookContents';

const item = {
  name: 'Website relaunch',
  tasks: [{text: 'Draft the sitemap #next'}],
  meetings: [{date: '2026-09-02', title: 'Kick-off with agency #client/acme'}],
};
const kw = (page: number, keyword: string) => ({page, keyword});

describe('buildContents', () => {
  it('titles gtdpara pages from their item, other headings from their text, handwritten ones as such; by page, then y', () => {
    const entries = buildContents({
      keywords: [
        kw(0, 'home'),
        kw(3, '2026-09-02 Kick-off with agency #client/acme'),
        kw(3, '2026-09-02'),
        kw(5, 'Draft the sitemap'),
        kw(7, 'loop workshop/offsite'),
        kw(8, 'ideas'),
      ],
      titles: [
        {page: 0, y: 100, text: 'Website relaunch'},
        {page: 3, y: 100, text: 'never looked up'},
        {page: 1, y: 900, text: 'Second heading\nmore'},
        {page: 1, y: 200, text: '  Intent - what do we want?  '},
        {page: 8, y: 50, text: null},
        {page: 9, y: 10, text: '   '},
      ],
      item,
      today: '2026-10-17',
    });
    expect(entries.map(e => [e.page, e.text, e.detail, e.source])).toEqual([
      [0, 'Website relaunch', '', 'home'],
      [1, 'Intent - what do we want?', '', 'typed'],
      [1, 'Second heading', '', 'typed'],
      [3, 'Kick-off with agency client/acme', '2.9.', 'meeting'],
      [5, 'Draft the sitemap', 'todo', 'todo'],
      [7, 'workshop offsite', '', 'loop'],
      [8, HANDWRITTEN_HEADING, '', 'handwritten'],
      [9, HANDWRITTEN_HEADING, '', 'handwritten'],
    ]);
  });

  it('a date keyword whose item is gone: the page reads like any other', () => {
    const entries = buildContents({keywords: [kw(2, '2026-01-01 Old meeting'), kw(2, '2026-01-01')], titles: [{page: 2, y: 1, text: 'Old meeting'}], item, today: '2026-10-17'});
    expect(entries).toEqual([{page: 2, y: 1, text: 'Old meeting', detail: '', source: 'typed'}]);
  });

  it('an empty notebook has no entries', () => {
    expect(buildContents({keywords: [], titles: [], item, today: '2026-10-17'})).toEqual([]);
  });
});

describe('headingText', () => {
  const rect = (left: number, top: number, right: number, bottom: number) => ({left, top, right, bottom});
  const box = (numInPage: number, r: ReturnType<typeof rect>, text: string) => ({numInPage, textbox: {rect: r, text}});

  it('by the heading\'s own trail', () => {
    expect(headingText({rect: rect(0, 0, 10, 10), trail: [2]}, [box(1, rect(500, 500, 600, 600), 'A'), box(2, rect(900, 900, 950, 950), 'B')])).toBe('B');
  });

  it('by the trail of the page\'s title element at the same position, when getTitles\' trail names nothing', () => {
    const elements = [box(1, rect(500, 500, 600, 600), 'A'), {numInPage: 3, title: {rect: rect(101, 99, 300, 150), trail: [1]}}];
    expect(headingText({rect: rect(100, 100, 300, 150), trail: [7]}, elements)).toBe('A');
  });

  it('by position: the textbox the heading covers most', () => {
    const elements = [box(1, rect(100, 100, 700, 160), 'Intent'), box(2, rect(100, 400, 700, 460), 'Other')];
    expect(headingText({rect: rect(90, 95, 710, 165), trail: []}, elements)).toBe('Intent');
  });

  it('handwriting: no textbox under it', () => {
    expect(headingText({rect: rect(90, 95, 710, 165), trail: []}, [box(1, rect(100, 400, 700, 460), 'Other')])).toBeNull();
    expect(headingText({rect: rect(90, 95, 710, 165), trail: []}, [box(1, rect(100, 100, 700, 160), '   ')])).toBeNull();
  });
});
