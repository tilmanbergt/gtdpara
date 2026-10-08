/** Writing heading titles after the pieces (docs/dev/history/technical-design-projects-findable-notes.md §2.6). */
const mockInserted: Array<{path: string; page: number; elements: any[]}> = [];
let mockPage: any[] = [];
jest.mock('sn-plugin-lib', () => ({PluginCommAPI: {recycleElement: jest.fn()}}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
jest.mock('../../src/supernote/fileSystem', () => ({
  createElement: async (type: number) => ({uuid: `u${type}`, type, numInPage: 0, pageNum: 0, layerNum: 0, textBox: null, link: null}),
  getElements: async () => mockPage,
  insertElements: async (path: string, page: number, elements: any[]) => {
    mockInserted.push({path, page, elements});
  },
}));

import {NOTE_HEADING_USERDATA, notePieceUserData} from '../../src/domain/meetingNoteBlock';
import {addPieceToRule, createEmptyTagRule, setPieceHeading} from '../../src/domain/tagRules';
import {applyPieceHeadings, headingPieceIndexes} from '../../src/storage/noteFindability';
import {logWarn} from '../../src/utils/log';

let rule = createEmptyTagRule('1', 'meeting');
for (const type of ['dateTitle', 'time', 'title', 'link'] as const) rule = addPieceToRule(rule, type);
rule = setPieceHeading(rule, 2, true);
const rect = {left: 100, top: 100, right: 500, bottom: 150};

beforeEach(() => {
  mockInserted.length = 0;
  mockPage = [];
});

describe('headingPieceIndexes', () => {
  it('takes switched-on pieces with text only', () => {
    expect(headingPieceIndexes(rule, ['30.9.2026 · Retro', '10:00', 'Retro #r', 'Link: a.pdf'])).toEqual([0, 2]);
    expect(headingPieceIndexes(rule, ['', '10:00', 'Retro', ''])).toEqual([2]);
  });
});

describe('applyPieceHeadings', () => {
  it('inserts one title per heading textbox in one call, on element.title', async () => {
    mockPage = [
      {type: 500, numInPage: 1, userData: notePieceUserData(0), textBox: {textRect: rect}},
      {type: 500, numInPage: 2, userData: notePieceUserData(1), textBox: {textRect: rect}},
      {type: 500, numInPage: 3, userData: notePieceUserData(2), textBox: {textRect: {...rect, top: 200, bottom: 240}}},
    ];
    await applyPieceHeadings('/n/a.note', 4, rule, ['A', 'B', 'C', ''], 3);
    expect(mockInserted).toHaveLength(1);
    const [call] = mockInserted;
    expect(call.page).toBe(4);
    expect(call.elements.map(e => [e.type, e.pageNum, e.userData, e.title.controlTrailNums, e.title.style, e.title.page])).toEqual([
      [100, 4, NOTE_HEADING_USERDATA, [1], 3, 4],
      [100, 4, NOTE_HEADING_USERDATA, [3], 3, 4],
    ]);
    expect(call.elements[1].title).toMatchObject({X: 100, Y: 200, width: 400, height: 40});
  });

  it('skips a missing textbox and writes nothing without heading pieces', async () => {
    mockPage = [{type: 500, numInPage: 1, userData: notePieceUserData(0), textBox: {textRect: rect}}];
    await applyPieceHeadings('/n/a.note', 0, rule, ['A', '', 'C', ''], 2);
    expect(mockInserted[0].elements.map(e => e.title.controlTrailNums)).toEqual([[1]]);
    expect(logWarn).toHaveBeenCalledWith('noteFindability: heading textbox missing, skipped', 'piece=2');
    mockInserted.length = 0;
    await applyPieceHeadings('/n/a.note', 0, setPieceHeading(setPieceHeading(rule, 0, false), 2, false), ['A', '', 'C', ''], 2);
    expect(mockInserted).toHaveLength(0);
  });
});
