// docs/dev/history/technical-design-home-notebooks.md §3.5, §6: the Contents of a home notebook.
import {buildContents, HANDWRITTEN_HEADING} from '../../src/domain/notebookContents';

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
