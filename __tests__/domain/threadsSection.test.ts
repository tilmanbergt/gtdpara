/** The `## Threads` section (docs/dev/history/technical-design-tending-threads.md §3.9.1). */
import {
  parseCounterpartLine,
  parseThreadsSpan,
  statusIn,
  withCounterpartStatus,
  writeThreadsIntoContent,
} from '../../src/domain/threadsSection';
import {parseProjectFileContent} from '../../src/storage/projectFile';

jest.mock('../../src/supernote/fileSystem', () => ({readTextFile: jest.fn(), writeTextFile: jest.fn()}));

const FILE = [
  '---',
  'kind: area',
  'status: active',
  '---',
  '',
  '## Tasks',
  '- [ ] Raise budget #101/sven',
  '',
  '## Threads',
  '- client-a: active',
  '- Client-B:  Inactive',
  '- sven: active, ~3w',
  'a note by hand',
  '',
  '## Meetings',
  '- 2026-10-01 10:00 1:1 #101/sven',
  '',
].join('\n');

describe('parseThreadsSpan', () => {
  it('reads status lines, lowercases leaf and status, keeps columns and other lines', () => {
    const {threads, extraLines} = parseThreadsSpan(FILE);
    expect(threads.map(t => [t.leaf, t.status, t.rest])).toEqual([
      ['client-a', 'active', null],
      ['client-b', 'inactive', null],
      ['sven', 'active', ' ~3w'],
    ]);
    expect(extraLines).toEqual(['a note by hand']);
  });

  it('is empty without the section', () => {
    expect(parseThreadsSpan('## Tasks\n- [ ] x\n')).toEqual({threads: [], extraLines: []});
  });

  it('rejects lines that are not status lines', () => {
    expect(parseCounterpartLine('- alpha: paused')).toBeNull();
    expect(parseCounterpartLine('- [ ] alpha: active')).toBeNull();
    expect(parseCounterpartLine('alpha: active')).toBeNull();
  });

  it('is part of the parsed file state', () => {
    const state = parseProjectFileContent(FILE);
    expect(state.threads.map(t => t.leaf)).toEqual(['client-a', 'client-b', 'sven']);
    expect(state.threadsExtraLines).toEqual(['a note by hand']);
    expect(state.tasks).toHaveLength(1);
  });
});

describe('writeThreadsIntoContent', () => {
  it('writes an unchanged section back byte-identical', () => {
    const {threads, extraLines} = parseThreadsSpan(FILE);
    expect(writeThreadsIntoContent(FILE, threads, extraLines)).toBe(FILE);
  });

  it('rewrites a changed line in canonical form, keeping its columns', () => {
    const {threads, extraLines} = parseThreadsSpan(FILE);
    const next = withCounterpartStatus(withCounterpartStatus(threads, 'client-b', 'active'), 'sven', 'inactive');
    const written = writeThreadsIntoContent(FILE, next, extraLines);
    expect(written).toContain('- client-a: active\n- client-b: active\n- sven: inactive, ~3w\na note by hand\n');
  });

  it('appends a new leaf and a missing section', () => {
    const next = withCounterpartStatus([], 'Mieke', 'active');
    expect(next).toEqual([{leaf: 'mieke', status: 'active', rest: null, raw: null}]);
    const written = writeThreadsIntoContent('## Tasks\n- [ ] x\n', next);
    expect(written).toBe('## Tasks\n- [ ] x\n\n## Threads\n- mieke: active\n');
    expect(parseThreadsSpan(written).threads.map(t => [t.leaf, t.status])).toEqual([['mieke', 'active']]);
  });

  it('changes every line of a duplicated leaf; the first decides the status', () => {
    const {threads} = parseThreadsSpan('## Threads\n- alpha: active\n- alpha: inactive\n');
    expect(statusIn(threads, 'alpha')).toBe('active');
    const next = withCounterpartStatus(threads, 'alpha', 'inactive');
    expect(next.map(t => t.status)).toEqual(['inactive', 'inactive']);
    expect(statusIn(next, 'beta')).toBeNull();
  });
});
