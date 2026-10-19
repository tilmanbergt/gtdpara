// docs/dev/history/technical-design-engage-in-context.md §2.10: opening a Review step from outside, with a filter.
import {
  clearReviewStepFilter,
  requestReviewStep,
  reviewEntryKey,
  somedayFilterOf,
  takeReviewStepRequest,
} from '../../src/screens/review/reviewNav';

describe('reviewNav', () => {
  const entries = [{item: {path: '/A'}, taskIndex: 2}, {item: {path: '/B'}, taskIndex: 0}];

  it('builds a filter from entry keys', () => {
    expect(somedayFilterOf('#retro/alpha', entries)).toEqual({label: '#retro/alpha', keys: ['/A#2', '/B#0']});
    expect(reviewEntryKey(entries[0])).toBe('/A#2');
  });

  it('hands a request out once', () => {
    requestReviewStep('somedayMaybe', somedayFilterOf('x', entries));
    expect(takeReviewStepRequest()).toEqual({id: 'somedayMaybe', filter: {label: 'x', keys: ['/A#2', '/B#0']}});
    expect(takeReviewStepRequest()).toBeNull();
    clearReviewStepFilter();
  });
});
