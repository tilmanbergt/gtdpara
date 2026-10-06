// docs/dev/history/technical-design-lasso-0.8.md §3.7: page links, open-mark collection, recognition order.
jest.mock('../../src/storage/marks', () => ({recognizeMark: jest.fn()}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));

import {buildPageAnchor, parsePageAnchor, parseSharedNoteAnchor, stripPageAnchor} from '../../src/domain/sharedNotePages';
import {collectOpenMarks} from '../../src/domain/marks';
import {checkHashNotePath} from '../../src/domain/integrityCheck';
import {nextToRecognize, PREFETCH} from '../../src/ui/capture/useRecognitionQueue';
import {Mark} from '../../src/domain/types';

describe('page anchors', () => {
  it('builds 1-based and parses back 0-based', () => {
    const anchor = buildPageAnchor('/Note/A b.note', 2);
    expect(anchor).toBe('/Note/A b.note#page=3');
    expect(parsePageAnchor(anchor)).toEqual({filePath: '/Note/A b.note', page: 2});
    expect(stripPageAnchor(anchor)).toBe('/Note/A b.note');
  });
  it('is never read as a shared-note keyword, and keywords stay keywords', () => {
    expect(parseSharedNoteAnchor('/Note/A.note#page=3')).toBeNull();
    expect(parseSharedNoteAnchor('Meetings/Daily.note#2026-09-21 Daily')).toEqual({
      filePath: 'Meetings/Daily.note',
      keyword: '2026-09-21 Daily',
    });
    expect(parsePageAnchor('Meetings/Daily.note#page 3')).toBeNull();
    expect(parsePageAnchor('A.note#page=0')).toBeNull();
    expect(stripPageAnchor('Todos/x.note')).toBe('Todos/x.note');
  });
  it('integrity check: a page link only needs its file', async () => {
    const input = {
      itemKind: 'project' as const,
      itemPath: '/Note/1 Projects/P',
      tasks: [{text: 't', notePath: '/Note/A.note#page=3'}],
      meetings: [],
    } as never;
    expect(await checkHashNotePath(input, {fileExists: async p => p === '/Note/A.note', folderExists: async () => true})).toEqual([]);
    const missing = await checkHashNotePath(input, {fileExists: async () => false, folderExists: async () => true});
    expect(missing).toHaveLength(1);
  });
});

const mark = (id: string, notePath: string): Mark => ({id, createdAt: '2026-10-05 10:00', notePath, page: 0, text: null});

describe('collectOpenMarks', () => {
  const items = [
    {kind: 'project' as const, name: 'P', path: '/Note/1 Projects/P', marks: [mark('m-2', 'Plan.note')]},
    {kind: 'area' as const, name: 'A', path: '/Note/2 Areas/A', marks: [mark('m-3', '/Note/elsewhere.note')]},
  ];
  const inbox = {marks: [mark('m-1', '/Document/x.pdf')]};
  it('collects all with owners and absolute paths', () => {
    const all = collectOpenMarks(items, inbox, '/Note/2 Areas/0 Inbox', {type: 'all'});
    expect(all.map(m => [m.mark.id, m.owner.type, m.absPath])).toEqual([
      ['m-1', 'inbox', '/Document/x.pdf'],
      ['m-2', 'item', '/Note/1 Projects/P/Plan.note'],
      ['m-3', 'item', '/Note/elsewhere.note'],
    ]);
  });
  it('limits to one item', () => {
    expect(collectOpenMarks(items, inbox, '/x', {type: 'item', path: '/Note/1 Projects/P'}).map(m => m.mark.id)).toEqual(['m-2']);
  });
});

describe('nextToRecognize', () => {
  const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
  it('takes the selected first, then the next few after it', () => {
    expect(nextToRecognize(ids, 'c', new Map())).toBe('c');
    const done = new Map([['c', {state: 'done' as const, text: 'x'}]]);
    expect(nextToRecognize(ids, 'c', done)).toBe('d');
  });
  it('stops after PREFETCH marks ahead', () => {
    const results = new Map(ids.slice(0, 1 + PREFETCH).map(id => [id, {state: 'done' as const, text: ''}]));
    expect(nextToRecognize(ids, 'a', results)).toBeNull();
    expect(nextToRecognize(ids, null, new Map())).toBe('a');
  });
});
