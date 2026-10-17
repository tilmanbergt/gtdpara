// docs/dev/history/technical-design-home-notebooks.md §3.1, §6: the home notebook's name, its years and the tap plan.
import {hasYear, homeNotebookName, homeNotebookYears, planHomeNotebookTap} from '../../src/domain/homeNotebook';

const base = {itemName: 'Leadership', itemAbbrev: 'LEAD', date: '2026-10-17'};

describe('homeNotebookName', () => {
  it('renders {name}, {abbr} and the date placeholders', () => {
    expect(homeNotebookName({...base, template: '{name} {year}'})).toBe('Leadership 2026');
    expect(homeNotebookName({...base, template: '{abbr} {year}-{month}'})).toBe('LEAD 2026-10');
    expect(homeNotebookName({...base, template: '{name} {quarter}'})).toBe('Leadership Q4');
  });

  it('{abbr} falls back to the name without an abbreviation', () => {
    expect(homeNotebookName({...base, itemAbbrev: '', template: '{abbr} {year}'})).toBe('Leadership 2026');
  });

  it('leaves {tag} and {subtag} empty', () => {
    expect(homeNotebookName({...base, template: '{tag} {name} {subtag} {year}'})).toBe('Leadership 2026');
  });

  it('sanitizes characters a file name may not carry', () => {
    expect(homeNotebookName({...base, itemName: 'R&D: #1 [x]', template: '{name}'})).toBe('R&D 1 x');
  });

  it('an empty template or an empty render gives Notes', () => {
    expect(homeNotebookName({...base, template: '  '})).toBe('Notes');
    expect(homeNotebookName({...base, template: '{subtag}'})).toBe('Notes');
  });
});

describe('hasYear', () => {
  it('needs {year} and no finer date placeholder', () => {
    expect(hasYear('{name} {year}')).toBe(true);
    expect(hasYear('{name} {YEAR}')).toBe(true);
    expect(hasYear('{name}')).toBe(false);
    expect(hasYear('{name} {year}-{month}')).toBe(false);
    expect(hasYear('{name} {year} {quarter}')).toBe(false);
    expect(hasYear('{name} {day}')).toBe(false);
  });
});

describe('homeNotebookYears', () => {
  const input = {...base, template: '{name} {year}'};

  it('lists this year, then every earlier year whose file exists, with gaps skipped', () => {
    expect(homeNotebookYears(input, ['Leadership 2024.note', 'Leadership 2022.note', 'Other.note'], 2026)).toEqual([
      {year: 2026, fileName: 'Leadership 2026', exists: false},
      {year: 2024, fileName: 'Leadership 2024', exists: true},
      {year: 2022, fileName: 'Leadership 2022', exists: true},
    ]);
  });

  it('marks this year as existing', () => {
    expect(homeNotebookYears(input, ['Leadership 2026.note'], 2026)).toEqual([{year: 2026, fileName: 'Leadership 2026', exists: true}]);
  });

  it('looks back ten years at most', () => {
    expect(homeNotebookYears(input, ['Leadership 2015.note', 'Leadership 2016.note'], 2026).map(y => y.year)).toEqual([2026, 2016]);
  });

  it('a template without {year} has one entry', () => {
    expect(homeNotebookYears({...base, template: '{name}'}, ['Leadership.note'], 2026)).toEqual([{year: 2026, fileName: 'Leadership', exists: true}]);
  });

  it('a {month} template has one entry, rendered for the given date', () => {
    expect(homeNotebookYears({...base, template: '{name} {year}-{month}'}, ['Leadership 2025-10.note'], 2026)).toEqual([
      {year: 2026, fileName: 'Leadership 2026-10', exists: false},
    ]);
  });
});

describe('planHomeNotebookTap', () => {
  const path = (y: number) => `/n/Leadership/Leadership ${y}.note`;

  it('opens an existing notebook', () => {
    expect(planHomeNotebookTap({absolutePath: path(2026), exists: true, years: []})).toEqual({kind: 'open', path: path(2026)});
  });

  it('creates a missing one without earlier years', () => {
    expect(planHomeNotebookTap({absolutePath: path(2026), exists: false, years: [{year: 2026, absolutePath: path(2026), exists: false}]}))
      .toEqual({kind: 'create', path: path(2026)});
    expect(planHomeNotebookTap({absolutePath: path(2026), exists: false, years: []})).toEqual({kind: 'create', path: path(2026)});
  });

  it('offers this year and the latest earlier year', () => {
    const years = [
      {year: 2026, absolutePath: path(2026), exists: false},
      {year: 2025, absolutePath: path(2025), exists: true},
      {year: 2023, absolutePath: path(2023), exists: true},
    ];
    expect(planHomeNotebookTap({absolutePath: path(2026), exists: false, years})).toEqual({
      kind: 'choose-year',
      createYear: 2026,
      createPath: path(2026),
      openYear: 2025,
      openPath: path(2025),
    });
  });
});
