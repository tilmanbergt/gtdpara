// docs/dev/history/technical-design-engage.md §3.4: the open note page → owner and current todo.
let mockKeywords: Array<{page: number; keyword: string}> = [];
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
jest.mock('../../src/supernote/fileSystem', () => ({getKeyWords: async () => mockKeywords}));
jest.mock('../../src/storage/loopNotes', () => ({
  loopNoteOf: (ownerPath: string, tag: string) => ({absolutePath: `${ownerPath}/${tag.replace('/', ' ')}.note`}),
}));

import {EngageSource} from '../../src/domain/engageOwner';
import {LoopLine} from '../../src/domain/loopsSection';
import {ResolvedParaPaths} from '../../src/domain/settings';
import {noteContextOf} from '../../src/storage/noteOwnerOf';
import {log} from '../../src/utils/log';
import {item, meeting, task} from '../../test-helpers/fixtures';

const loopLine = (tag: string): LoopLine => ({tag, status: 'active', mainDate: null, linkedFile: null, extraColumns: [], raw: null});
const coaching = item('area', 'Coaching', {
  loops: [loopLine('proj/launch')],
  tasks: [
    task('Brief #proj/launch #next', {notePath: 'Todos/Brief.note'}),
    task('Ask Anna #sparring/anna', {notePath: 'Sparring.note#Ask Anna #sparring/anna'}),
    task('Done one', {notePath: 'Todos/Done one.note', done: true}),
  ],
  meetings: [meeting('2026-10-01', 'Sparring #sparring/anna', {tags: ['sparring/anna'], notePath: 'Sparring.note#2026-10-01 Sparring #sparring/anna'})],
});
const source: EngageSource = {items: [coaching], inboxPath: '/Note/2 Areas/0 Inbox', loopKinds: ['proj'], threadTypes: ['sparring']};
const paths: ResolvedParaPaths = {
  base: '/Note',
  projects: '/Note/1 Projects',
  areas: '/Note/2 Areas',
  resources: '/Note/3 Resources',
  archive: '/Note/4 Archive',
  inboxFolder: '/Note/2 Areas/0 Inbox',
  inbox: '/Note/2 Areas/0 Inbox/Inbox.txt',
};
const A = coaching.path;

beforeEach(() => {
  mockKeywords = [];
});

describe('noteContextOf', () => {
  it('a todo\'s own note: that todo is current, its loop the owner', async () => {
    expect(await noteContextOf(`${A}/Todos/Brief.note`, 0, source, paths)).toEqual({
      owner: {kind: 'loop', itemPath: A, tag: 'proj/launch'},
      todo: {itemPath: A, taskText: 'Brief #proj/launch #next', taskIndex: 0},
      rule: 'todoNote',
    });
    expect(log).toHaveBeenCalledWith('noteOwnerOf: context', 'rule=todoNote', 'owner=loop', 'todo=yes');
  });
  it('a done todo\'s note: its owner, no current todo', async () => {
    expect(await noteContextOf(`${A}/Todos/Done one.note`, 0, source, paths)).toMatchObject({owner: {kind: 'item'}, todo: null, rule: 'todoNote'});
  });
  it('a todo\'s page in a shared notebook (by keyword)', async () => {
    mockKeywords = [{page: 3, keyword: 'Ask Anna #sparring/anna'}];
    expect(await noteContextOf(`${A}/Sparring.note`, 3, source, paths)).toMatchObject({
      owner: {kind: 'item', itemPath: A},
      todo: {taskIndex: 1},
      rule: 'todoNote',
    });
  });
  it('a meeting\'s page in a shared notebook: its thread, no current todo', async () => {
    mockKeywords = [{page: 1, keyword: '2026-10-01 Sparring #sparring/anna'}];
    expect(await noteContextOf(`${A}/Sparring.note`, 1, source, paths)).toEqual({
      owner: {kind: 'thread', scopeOwnerPath: A, tag: 'sparring/anna'},
      todo: null,
      rule: 'meetingNote',
    });
  });
  it('a loop note page no entry claims: the loop', async () => {
    expect(await noteContextOf(`${A}/proj launch.note`, 4, source, paths)).toMatchObject({owner: {kind: 'loop', tag: 'proj/launch'}, rule: 'loopNote'});
  });
  it('any other note in the item\'s folder: the item; outside: none', async () => {
    expect(await noteContextOf(`${A}/Meetings/Other.note`, 0, source, paths)).toMatchObject({owner: {kind: 'item', itemPath: A}, rule: 'item'});
    expect(await noteContextOf('/Note/Elsewhere.note', 0, source, paths)).toEqual({owner: null, todo: null, rule: 'none'});
    expect(await noteContextOf(null, null, source, paths)).toEqual({owner: null, todo: null, rule: 'none'});
  });
});
