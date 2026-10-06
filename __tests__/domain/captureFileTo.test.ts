import {fileToEligible, fileToLabel, fileToShortList, FileToItem} from '../../src/domain/captureFileTo';

const item = (name: string, extra: Partial<FileToItem> = {}): FileToItem => ({
  kind: 'project',
  name,
  path: `/P/${name}`,
  abbrev: name.slice(0, 2).toLowerCase(),
  status: 'active',
  dailyFocus: false,
  weeklyFocus: false,
  monthlyFocus: false,
  ...extra,
});
const dest = (i: FileToItem) => ({type: 'item' as const, kind: i.kind, name: i.name, path: i.path});

describe('File to', () => {
  const items = [
    item('Zeta'),
    item('Alpha', {monthlyFocus: true}),
    item('Beta', {dailyFocus: true}),
    item('Gamma', {status: 'on-hold'}),
    item('Delta'),
    item('Eps', {weeklyFocus: true}),
  ];
  it('offers only Active items, alphabetically', () => {
    expect(fileToEligible(items).map(i => i.name)).toEqual(['Alpha', 'Beta', 'Delta', 'Eps', 'Zeta']);
  });
  it('short list: own place, current choice, focused (daily, weekly, monthly), recent', () => {
    const own = dest(items[0]);
    const current = dest(items[4]);
    expect(fileToShortList(items, own, current, ['/P/Zeta', '/P/Gone', '/P/Beta']).map(i => i.name)).toEqual([
      'Zeta',
      'Delta',
      'Beta',
      'Eps',
      'Alpha',
    ]);
  });
  it('keeps the own place and the current choice past the limit', () => {
    const own = dest(items[0]);
    const current = dest(items[4]);
    expect(fileToShortList(items, own, current, [], 2).map(i => i.name)).toEqual(['Zeta', 'Delta']);
    expect(fileToShortList(items, null, {type: 'inbox'}, [], 1).map(i => i.name)).toEqual(['Beta']);
  });
  it('labels with the abbreviation when there is one', () => {
    expect(fileToLabel({abbrev: 'ab', name: 'Alpha'})).toBe('#AB Alpha');
    expect(fileToLabel({abbrev: null, name: 'Alpha'})).toBe('Alpha');
  });
});
