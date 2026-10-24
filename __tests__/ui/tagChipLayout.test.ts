// ui/tagChipLayout.ts: width-based paging of Quick Add's tag chips, one row and two rows
// (docs/dev/history/technical-design-item-card.md §5).
jest.mock('../../src/utils/screenRefresh', () => ({requestEinkRefresh: jest.fn()}));

import {paginateByWidth, paginateTwoRows, TAG_ARROW_WIDTH, tagChipLabel} from '../../src/ui/tagChipLayout';

// Every chip is 100 wide unless it says otherwise ("wide" = 400).
const w = (item: string) => (item.startsWith('wide') ? 400 : 100);
const tags = (n: number) => Array.from({length: n}, (_, i) => `t${i}`);

describe('tagChipLabel', () => {
  it('shortens long labels and upper-cases recognized abbreviations', () => {
    expect(tagChipLabel('call', false)).toBe('#call');
    expect(tagChipLabel('verylongtag', false)).toBe('#verylong…');
    expect(tagChipLabel('gr', true)).toBe('#GR');
  });
});

describe('paginateByWidth (one row)', () => {
  it('fills page 0 narrow and later pages wide, reserving the arrows', () => {
    const pages = paginateByWidth(tags(7), w, 250, 450);
    expect(pages[0]).toEqual(['t0', 't1']);
    // 450 - ‹ leaves room for 4 chips of 100, and "›" (more follow) still fits beside them.
    expect(pages[1]).toEqual(['t2', 't3', 't4', 't5']);
    expect(pages.flat()).toEqual(tags(7));
  });
});

describe('paginateTwoRows', () => {
  const widths = {row3First: 250, row3Later: 450, row4: 500};

  it('puts everything on page 0 when it fits, R3 first', () => {
    expect(paginateTwoRows(tags(5), w, widths)).toEqual([{row3: ['t0', 't1'], row4: ['t2', 't3', 't4']}]);
  });

  it('keeps room for "›" at the end of R4 when more pages follow', () => {
    const pages = paginateTwoRows(tags(8), w, widths);
    // R4 holds 5 chips of 100 in 500, but "›" needs its room: 4 stay.
    expect(pages[0]).toEqual({row3: ['t0', 't1'], row4: ['t2', 't3', 't4', 't5']});
    expect(pages[1]).toEqual({row3: ['t6', 't7'], row4: []});
  });

  it('uses the wider R3 on later pages and reserves "‹" in R4', () => {
    const pages = paginateTwoRows(tags(16), w, widths);
    expect(pages[1].row3).toEqual(['t6', 't7', 't8', 't9']);
    // R4 on page 1: 500 - ‹ leaves room for 4, and "›" (more follow) still fits.
    expect(pages[1].row4).toEqual(['t10', 't11', 't12', 't13']);
    expect(pages[2]).toEqual({row3: ['t14', 't15'], row4: []});
    expect(pages.flatMap(p => [...p.row3, ...p.row4])).toEqual(tags(16));
  });

  it('page 0 can start in R4 when R3 has no room (w/f: the "Waiting on" field fills R3)', () => {
    expect(paginateTwoRows(tags(3), w, {row3First: 0, row3Later: 0, row4: 500})).toEqual([{row3: [], row4: ['t0', 't1', 't2']}]);
  });

  it('pinned tags come first and may spill into R4 and onto page 1', () => {
    const items = ['pinA', 'pinB', 'pinC', 'pinD', 'pinE', 'pinF', 'pinG', 'r1'];
    const pages = paginateTwoRows(items, w, widths);
    expect(pages[0].row3).toEqual(['pinA', 'pinB']);
    expect(pages[0].row4).toEqual(['pinC', 'pinD', 'pinE', 'pinF']);
    expect(pages[1].row3).toEqual(['pinG', 'r1']);
  });

  it('an over-wide chip still makes progress on later pages', () => {
    const pages = paginateTwoRows(['t0', 'wide1', 'wide2'], w, {row3First: 100, row3Later: 300, row4: 300});
    expect(pages.flatMap(p => [...p.row3, ...p.row4])).toEqual(['t0', 'wide1', 'wide2']);
    expect(pages.every((p, i) => i === 0 || p.row3.length + p.row4.length >= 1)).toBe(true);
  });

  it('the arrow width is a real reservation', () => {
    expect(TAG_ARROW_WIDTH).toBeGreaterThan(0);
  });
});
