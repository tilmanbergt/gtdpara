/** Headings and the Date & title piece (docs/dev/history/technical-design-projects-findable-notes.md §2.1, §2.5, §2.6). */
import {formatHeadingDate} from '../../src/domain/dateFormat';
import {tagsAsWords} from '../../src/domain/markdown';
import {NOTE_HEADING_USERDATA, notePieceUserData} from '../../src/domain/meetingNoteBlock';
import {staleManagedNums, TITLE_ELEMENT_TYPE} from '../../src/domain/noteFindability';
import {DEFAULT_SETTINGS} from '../../src/domain/settings';
import {
  addPieceToRule,
  createDefaultMeetingRule,
  createEmptyTagRule,
  dateTitleText,
  hasUntouchedDefaultPieces,
  PIECE_CONTEXTS,
  pieceIsHeading,
  renderPieceText,
  setPieceHeading,
  withDefaultPieces,
} from '../../src/domain/tagRules';

const piece = (type: Parameters<typeof addPieceToRule>[1], heading?: boolean) => ({
  ...addPieceToRule(createEmptyTagRule('1', 'meeting'), type).pieces[0],
  ...(heading === undefined ? {} : {heading}),
});

describe('pieceIsHeading', () => {
  it('defaults on for Date & title only', () => {
    expect(pieceIsHeading(piece('dateTitle'))).toBe(true);
    for (const type of ['title', 'date', 'time', 'text', 'related', 'sinceLast'] as const) expect(pieceIsHeading(piece(type))).toBe(false);
  });
  it('follows an explicit switch', () => {
    expect(pieceIsHeading(piece('dateTitle', false))).toBe(false);
    expect(pieceIsHeading(piece('title', true))).toBe(true);
    expect(pieceIsHeading(piece('text', true))).toBe(true);
  });
  it('is never on for a Linked file', () => {
    expect(pieceIsHeading(piece('link', true))).toBe(false);
  });
  it('is set per piece by setPieceHeading', () => {
    const rule = withDefaultPieces(createEmptyTagRule('1', 'meeting'));
    const off = setPieceHeading(rule, 0, false);
    expect(off.pieces.map(pieceIsHeading)).toEqual([false, false, false]);
    expect(setPieceHeading(off, 1, true).pieces.map(pieceIsHeading)).toEqual([false, true, false]);
    expect(rule.pieces.map(pieceIsHeading)).toEqual([true, false, false]);
  });
});

describe('Date & title piece and new-rule defaults', () => {
  it('belongs to meeting rules only', () => {
    expect(PIECE_CONTEXTS.dateTitle).toEqual(['meeting']);
  });
  it('new meeting rules start with Date & title (heading), Time, Linked file', () => {
    const rule = withDefaultPieces(createEmptyTagRule('1', 'meeting'));
    expect(rule.pieces.map(p => p.type)).toEqual(['dateTitle', 'time', 'link']);
    expect(rule.pieces[0].heading).toBeUndefined();
    expect(createDefaultMeetingRule('1').pieces.map(p => p.type)).toEqual(['dateTitle', 'time', 'link', 'related']);
  });
  it('new todo rules start with Title, its switch set on explicitly, and Linked file', () => {
    const rule = withDefaultPieces(createEmptyTagRule('1', 'todo'));
    expect(rule.pieces.map(p => [p.type, p.heading])).toEqual([
      ['title', true],
      ['link', undefined],
    ]);
    expect(hasUntouchedDefaultPieces(rule)).toBe(true);
    expect(hasUntouchedDefaultPieces(setPieceHeading(rule, 0, false))).toBe(false);
  });
  it('treats a switch equal to the default as untouched', () => {
    const rule = withDefaultPieces(createEmptyTagRule('1', 'meeting'));
    expect(hasUntouchedDefaultPieces(setPieceHeading(rule, 0, true))).toBe(true);
    expect(hasUntouchedDefaultPieces(setPieceHeading(rule, 0, false))).toBe(false);
  });
  it('keeps context tags as words without `#`, nested ones with their slash, and drops gtdpara’s own', () => {
    expect(tagsAsWords('Retro demand #retro/demand')).toBe('Retro demand retro/demand');
    expect(tagsAsWords('Call #Anna about #wf/bert the offer #next  #now')).toBe('Call Anna about the offer');
    expect(tagsAsWords('#team sync')).toBe('team sync');
  });
  it('renders `d.M.yyyy · title` with tags as words, the year always shown', () => {
    expect(formatHeadingDate('2026-09-30')).toBe('30.9.2026');
    const text = dateTitleText('2026-09-30', tagsAsWords('Retro demand #retro/demand'));
    expect(text).toBe('30.9.2026 · Retro demand retro/demand');
    expect(renderPieceText(piece('dateTitle'), {title: 'Retro demand #retro/demand', dateTitle: text})).toBe(text);
    expect(renderPieceText(piece('dateTitle'), {title: 'x'})).toBe('');
    expect(dateTitleText('2026-09-30', '  ')).toBe('30.9.2026');
  });
  it('has the heading style default 3 (dark grey)', () => {
    expect(DEFAULT_SETTINGS.noteHeadingStyle).toBe(3);
  });
});

describe('staleManagedNums', () => {
  const box = (numInPage: number, userData?: string) => ({type: 500, numInPage, userData});
  const title = (numInPage: number, covers: number[], userData?: string) => ({type: TITLE_ELEMENT_TYPE, numInPage, userData, title: {controlTrailNums: covers}});

  it('deletes our textboxes and links, never the user’s', () => {
    expect(staleManagedNums([box(1), box(2, notePieceUserData(0)), {type: 600, numInPage: 3, userData: notePieceUserData(2)}, box(4)])).toEqual([2, 3]);
  });
  it('deletes titles carrying our heading marker', () => {
    expect(staleManagedNums([box(1, notePieceUserData(0)), title(2, [1], NOTE_HEADING_USERDATA)])).toEqual([1, 2]);
  });
  it('deletes a hand-made title over one of our textboxes', () => {
    expect(staleManagedNums([box(1, notePieceUserData(0)), box(2, notePieceUserData(1)), title(3, [1, 2])])).toEqual([1, 2, 3]);
  });
  it('keeps a title over the user’s own textbox or strokes', () => {
    expect(staleManagedNums([box(1), title(2, [1]), box(3, notePieceUserData(0))])).toEqual([3]);
  });
  it('keeps a title covering ours and the user’s together, and one covering nothing', () => {
    expect(staleManagedNums([box(1, notePieceUserData(0)), box(2), title(3, [1, 2]), title(4, [])])).toEqual([1]);
  });
});
