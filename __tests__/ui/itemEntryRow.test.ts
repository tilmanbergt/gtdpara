import {COLUMN_WIDTH_PX, itemEntryDisplayText, itemEntryHeight} from '../../src/ui/itemEntryRow';
import {item} from '../../test-helpers/fixtures';

describe('itemEntryRow (0.7.0 P1/P2)', () => {
  const withAbbrev = item('project', 'Acme Tender', {abbrev: 'ATR'});
  it('shows the abbreviation only when asked and set', () => {
    expect(itemEntryDisplayText(withAbbrev, {showAbbrev: true})).toBe('Acme Tender  #ATR ›');
    expect(itemEntryDisplayText(withAbbrev)).toBe('Acme Tender ›');
    expect(itemEntryDisplayText(item('area', 'Family'), {showAbbrev: true})).toBe('Family ›');
  });
  it('keeps the default height (Review) and grows with padding (Projects/Areas)', () => {
    expect(itemEntryHeight(withAbbrev, COLUMN_WIDTH_PX)).toBe(34);
    expect(itemEntryHeight(withAbbrev, COLUMN_WIDTH_PX, {showAbbrev: true, paddingPx: 8})).toBe(38);
  });
});
