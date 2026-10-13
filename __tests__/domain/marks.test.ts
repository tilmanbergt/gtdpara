import {
  bookmarkPolygon,
  canRecognize,
  checkPolygon,
  formatMarkLine,
  groupMarks,
  iconBox,
  isMarkId,
  isOldStrokeMark,
  MarkDataFile,
  markCreatedAt,
  markLinkPath,
  markOwner,
  newMarkId,
  OpenMark,
  parseMarkDataFile,
  parseMarkLine,
  parseMarkLines,
  parseMarkUserData,
  markDoneUserData,
  markUserData,
  resolveMarkPath,
  serializeMarkLines,
  StoredStroke,
  strokeBounds,
} from '../../src/domain/marks';
import {DEFAULT_SETTINGS, resolvePaths} from '../../src/domain/settings';
import {Mark} from '../../src/domain/types';

const paths = resolvePaths(DEFAULT_SETTINGS);
const PROJECT = `${paths.projects}/Team offsite`;

const mark = (over: Partial<Mark> = {}): Mark => ({
  id: 'm-20261005-104212-351',
  createdAt: '2026-10-05 10:42',
  notePath: 'Offsite prep.note',
  page: 2,
  text: null,
  ...over,
});

describe('mark ids and times', () => {
  it('builds a padded id that is also a valid block id', () => {
    const id = newMarkId(new Date(2026, 9, 5, 9, 4, 7), () => 0.017);
    expect(id).toBe('m-20261005-090407-017');
    expect(isMarkId(id)).toBe(true);
    expect(isMarkId('20261005-090407-17')).toBe(false);
  });
  it('formats the local time', () => {
    expect(markCreatedAt(new Date(2026, 0, 2, 3, 4))).toBe('2026-01-02 03:04');
  });
});

describe('mark line', () => {
  it('round-trips a relative link without text (page shown 1-based)', () => {
    const line = formatMarkLine(mark());
    expect(line).toBe('- 2026-10-05 10:42 [[Offsite prep.note]] p3 ^m-20261005-104212-351');
    expect(parseMarkLine(line)).toEqual(mark());
  });
  it('round-trips an absolute path with text', () => {
    const m = mark({notePath: '/storage/emulated/0/Document/Spec v2.pdf', page: 11, text: 'Order new toner'});
    const line = formatMarkLine(m);
    expect(line).toBe('- 2026-10-05 10:42 [[/storage/emulated/0/Document/Spec v2.pdf]] p12 Order new toner ^m-20261005-104212-351');
    expect(parseMarkLine(line)).toEqual(m);
  });
  it('puts multi-line text on one line', () => {
    const line = formatMarkLine(mark({text: 'Order\n  new  toner ^x'}));
    expect(parseMarkLine(line)?.text).toBe('Order new toner x');
  });
  it('rejects malformed lines and page 0', () => {
    expect(parseMarkLine('- 2026-10-05 10:42 [[a.note]] p3')).toBeNull();
    expect(parseMarkLine('- 2026-10-05 10:42 [[a.note]] p0 ^m-20261005-104212-351')).toBeNull();
    expect(parseMarkLine('- [ ] a todo')).toBeNull();
  });
  it('keeps non-mark lines as extras and drops blank lines', () => {
    const lines = [formatMarkLine(mark()), '', 'a note by hand', formatMarkLine(mark({id: 'm-20261005-104300-001'}))];
    const parsed = parseMarkLines(lines);
    expect(parsed.marks.map(m => m.id)).toEqual(['m-20261005-104212-351', 'm-20261005-104300-001']);
    expect(parsed.extraLines).toEqual(['a note by hand']);
    expect(serializeMarkLines(parsed.marks, parsed.extraLines)).toEqual([lines[0], lines[3], 'a note by hand']);
  });
});

describe('paths and owner', () => {
  it('writes relative inside the owner folder, absolute outside', () => {
    expect(markLinkPath(PROJECT, `${PROJECT}/Meetings/Sync.note`)).toBe('Meetings/Sync.note');
    expect(markLinkPath(PROJECT, '/storage/emulated/0/Document/x.pdf')).toBe('/storage/emulated/0/Document/x.pdf');
    expect(markLinkPath(null, '/a/b.note')).toBe('/a/b.note');
    expect(resolveMarkPath(PROJECT, 'Meetings/Sync.note')).toBe(`${PROJECT}/Meetings/Sync.note`);
    expect(resolveMarkPath(PROJECT, '/a/b.note')).toBe('/a/b.note');
  });
  const known = new Set([PROJECT, `${paths.areas}/Team`]);
  const has = (p: string) => known.has(p);
  it('finds the project or area at any depth', () => {
    expect(markOwner(paths, `${PROJECT}/Offsite prep.note`, has)).toEqual({
      type: 'item',
      kind: 'project',
      name: 'Team offsite',
      path: PROJECT,
    });
    expect(markOwner(paths, `${paths.areas}/Team/Meetings/Coaching.note`, has)).toMatchObject({kind: 'area', name: 'Team'});
  });
  it('falls back to the Inbox', () => {
    expect(markOwner(paths, `${paths.inboxFolder}/Todos/x.note`, has)).toEqual({type: 'inbox'});
    expect(markOwner(paths, `${paths.resources}/Ref.note`, has)).toEqual({type: 'inbox'});
    expect(markOwner(paths, '/storage/emulated/0/Document/Spec.pdf', has)).toEqual({type: 'inbox'});
    expect(markOwner(paths, `${paths.projects}/Unknown/x.note`, has)).toEqual({type: 'inbox'});
  });
});

describe('groupMarks', () => {
  const om = (absPath: string, over: Partial<Mark>): OpenMark => ({mark: mark(over), owner: {type: 'inbox'}, absPath});
  it('puts the current note first, then by oldest mark; inside by page and time', () => {
    const list = [
      om('/n/B.note', {id: 'm-20261001-100000-001', createdAt: '2026-10-01 10:00', page: 0}),
      om('/n/A.note', {id: 'm-20261005-100000-001', createdAt: '2026-10-05 10:00', page: 4}),
      om('/n/A.note', {id: 'm-20261005-090000-001', createdAt: '2026-10-05 09:00', page: 4}),
      om('/n/A.note', {id: 'm-20261005-110000-001', createdAt: '2026-10-05 11:00', page: 1}),
      om('/n/C.note', {id: 'm-20260930-100000-001', createdAt: '2026-09-30 10:00', page: 0}),
    ];
    const groups = groupMarks(list, '/n/A.note');
    expect(groups.map(g => g.fileName)).toEqual(['A.note', 'C.note', 'B.note']);
    expect(groups[0].marks.map(m => m.mark.createdAt)).toEqual(['2026-10-05 11:00', '2026-10-05 09:00', '2026-10-05 10:00']);
    expect(groupMarks(list, null).map(g => g.fileName)).toEqual(['C.note', 'B.note', 'A.note']);
  });
});

describe('icons', () => {
  it('reads and writes userData', () => {
    expect(parseMarkUserData(markUserData('m-1'))).toEqual({id: 'm-1', done: false});
    expect(parseMarkUserData(markDoneUserData('m-1'))).toEqual({id: 'm-1', done: true});
    expect(parseMarkUserData('other')).toBeNull();
    expect(parseMarkUserData(undefined)).toBeNull();
  });
  it('places the icon box top-right inside the lasso and keeps shapes inside it', () => {
    const box = iconBox({left: 100, top: 200, right: 600, bottom: 400});
    expect(box).toEqual({left: 568, top: 204, right: 596, bottom: 232});
    for (const p of [...bookmarkPolygon(box), ...checkPolygon(box)]) {
      expect(p.x).toBeGreaterThanOrEqual(box.left);
      expect(p.x).toBeLessThanOrEqual(box.right);
      expect(p.y).toBeGreaterThanOrEqual(box.top);
      expect(p.y).toBeLessThanOrEqual(box.bottom);
    }
    expect(checkPolygon(box)[0]).toEqual(checkPolygon(box)[checkPolygon(box).length - 1]);
  });
  it('clamps the box for a tiny lasso', () => {
    const lasso = {left: 10, top: 10, right: 20, bottom: 15};
    const box = iconBox(lasso);
    expect(box.right - box.left).toBe(5);
    expect(box.bottom - box.top).toBe(5);
    expect(box.left).toBeGreaterThanOrEqual(lasso.left);
    expect(box.right).toBeLessThanOrEqual(lasso.right);
    expect(box.bottom).toBeLessThanOrEqual(lasso.bottom);
  });
});

describe('strokeBounds', () => {
  const stroke = (points: number[]): StoredStroke => ({
    thickness: 1,
    penColor: 0,
    penType: 10,
    layerNum: 0,
    points,
    pressures: [],
  });
  it('spans every point of every stroke and counts the points', () => {
    expect(strokeBounds([stroke([100, 200, 300, 150]), stroke([50, 900])])).toEqual({
      rect: {left: 50, top: 150, right: 300, bottom: 900},
      points: 3,
    });
  });
  it('has no rect without points and ignores a dangling coordinate', () => {
    expect(strokeBounds([])).toEqual({rect: null, points: 0});
    expect(strokeBounds([stroke([]), stroke([7])])).toEqual({rect: null, points: 0});
  });
});

describe('canRecognize / isOldStrokeMark', () => {
  const s: StoredStroke = {thickness: 1, penColor: 0, penType: 10, layerNum: 0, points: [10, 20], pressures: []};
  const data = (over: Partial<MarkDataFile>): MarkDataFile => ({
    version: 2,
    id: 'm-1',
    path: '/x/A.note',
    page: 0,
    rect: null,
    displaySize: null,
    pageSize: null,
    textBoxText: '',
    strokes: [s],
    icon: null,
    ...over,
  });
  it('recognizes version 2 strokes', () => {
    expect(canRecognize(data({}))).toBe(true);
    expect(isOldStrokeMark(data({}))).toBe(false);
  });
  it('does not send version 1 strokes, with or without kept text', () => {
    expect(canRecognize(data({version: 1}))).toBe(false);
    expect(isOldStrokeMark(data({version: 1}))).toBe(true);
    expect(canRecognize(data({version: 1, recognizedText: 'Call Anna'}))).toBe(false);
  });
  it('treats a file without a version as old', () => {
    const noVersion = data({});
    delete (noVersion as Partial<MarkDataFile>).version;
    expect(canRecognize(noVersion)).toBe(false);
    expect(isOldStrokeMark(noVersion)).toBe(true);
  });
  it('a text-box-only mark needs no recognizer and is not old', () => {
    expect(canRecognize(data({strokes: [], textBoxText: 'Typed'}))).toBe(false);
    expect(isOldStrokeMark(data({version: 1, strokes: [], textBoxText: 'Typed'}))).toBe(false);
  });
});

describe('parseMarkDataFile', () => {
  it('accepts a data file and rejects anything else', () => {
    expect(parseMarkDataFile(JSON.stringify({version: 1, id: 'm-1', strokes: []}))?.id).toBe('m-1');
    expect(parseMarkDataFile('{')).toBeNull();
    expect(parseMarkDataFile(JSON.stringify({id: 'm-1'}))).toBeNull();
    expect(parseMarkDataFile(null)).toBeNull();
  });
});

describe('marks card summary', () => {
  const {summarizeMarks, marksSummaryLine} = jest.requireActual('../../src/domain/marks');
  const om = (path: string, createdAt: string) => ({
    mark: {id: 'm', createdAt, notePath: path, page: 0, text: null},
    owner: {type: 'inbox'},
    absPath: path,
  });
  it('counts marks and notes and the age of the oldest', () => {
    const s = summarizeMarks([om('/a.note', '2026-10-02 09:00'), om('/a.note', '2026-10-05 10:00'), om('/b.note', '2026-10-04 08:00')], '2026-10-05');
    expect(s).toEqual({count: 3, notes: 2, oldestDays: 3});
    expect(marksSummaryLine(s)).toBe('2 notes · oldest 3 days');
    expect(marksSummaryLine(summarizeMarks([om('/a.note', '2026-10-05 10:00')], '2026-10-05'))).toBe('1 note · today');
    expect(summarizeMarks([], '2026-10-05')).toEqual({count: 0, notes: 0, oldestDays: null});
  });
});
