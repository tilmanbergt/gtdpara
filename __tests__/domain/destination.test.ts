import {destinationCandidates} from '../../src/domain/destination';
import {ItemStatus} from '../../src/domain/types';

const c = (name: string, status: ItemStatus, focus: Partial<{dailyFocus: boolean; weeklyFocus: boolean; monthlyFocus: boolean}> = {}) => ({
  name,
  status,
  dailyFocus: false,
  weeklyFocus: false,
  monthlyFocus: false,
  ...focus,
});

describe('destinationCandidates', () => {
  it('offers only active items', () => {
    const out = destinationCandidates([c('A', 'active'), c('B', 'on-hold'), c('C', 'done'), c('D', 'archived')]);
    expect(out.map(x => x.name)).toEqual(['A']);
  });
  it('puts focused items (daily, weekly or monthly) first and keeps the order otherwise', () => {
    const out = destinationCandidates([
      c('A', 'active'),
      c('B', 'active', {monthlyFocus: true}),
      c('C', 'active'),
      c('D', 'active', {dailyFocus: true}),
    ]);
    expect(out.map(x => x.name)).toEqual(['B', 'D', 'A', 'C']);
  });
  it('does not change the input array', () => {
    const input = [c('A', 'active'), c('B', 'active', {weeklyFocus: true})];
    destinationCandidates(input);
    expect(input.map(x => x.name)).toEqual(['A', 'B']);
  });
});
