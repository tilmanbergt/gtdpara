import {HELP_PAGE_FOR_TAB, helpStartPage, stripLeadingTitle} from '../../src/domain/helpTopics';
import {USER_DOCS} from '../../src/generated/userDocs';

const all = new Set(['index', 'daily', 'review', 'week-and-month']);

describe('helpStartPage', () => {
  it('opens the page mapped to the tab', () => {
    expect(helpStartPage('daily', null, all)).toBe('daily');
    expect(helpStartPage('month', null, all)).toBe('week-and-month');
  });
  it('returns to the last page read when opened from the same tab', () => {
    expect(helpStartPage('daily', {tab: 'daily', pageId: 'review'}, all)).toBe('review');
    expect(helpStartPage('week', {tab: 'daily', pageId: 'review'}, all)).toBe('week-and-month');
  });
  it('falls back to the overview', () => {
    expect(helpStartPage('settings', null, all)).toBe('index');
    expect(helpStartPage('unknown', null, all)).toBe('index');
    expect(helpStartPage('daily', {tab: 'daily', pageId: 'gone'}, all)).toBe('daily');
  });
});

describe('bundled user docs', () => {
  it('every tab maps to a bundled page', () => {
    for (const page of Object.values(HELP_PAGE_FOR_TAB)) {
      expect(USER_DOCS.pages[page]).toBeDefined();
    }
    expect(USER_DOCS.pages.index).toBeDefined();
  });
  it('the left list fits one screen', () => {
    const rows = 1 + USER_DOCS.groups.reduce((n, g) => n + 1 + g.pageIds.length, 0);
    expect(rows).toBeLessThanOrEqual(26);
  });
});

it('stripLeadingTitle', () => {
  expect(stripLeadingTitle('# Daily\n\nText\n# Other')).toBe('\nText\n# Other');
  expect(stripLeadingTitle('Text')).toBe('Text');
});
