/** The loop itself becomes its ## Loops line after a task save (docs/dev/history/technical-design-loops.md §4.3). */
const mockWrites: Array<[string, string]> = [];
const mockMoves: Array<[string, string]> = [];
const mockExisting = new Set<string>();
const mockApplied: string[] = [];
let mockHook: ((path: string) => void) | null = null;
let mockItem: unknown = null;

jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
jest.mock('../../src/supernote/fileSystem', () => ({
  writeTextFile: async (path: string, content: string) => {
    mockWrites.push([path, content]);
  },
  fileExists: async (path: string) => mockExisting.has(path),
  moveFile: async (from: string, to: string) => {
    mockMoves.push([from, to]);
  },
  readTextFile: async () => null,
}));
jest.mock('../../src/storage/dataCache', () => ({
  setTasksWrittenHook: (hook: ((path: string) => void) | null) => {
    mockHook = hook;
  },
  findCachedItem: () => mockItem,
  applyItemRawContent: (path: string) => {
    mockApplied.push(path);
  },
  updateItemLoops: () => undefined,
}));
jest.mock('../../src/storage/loopKinds', () => ({
  getLoopKinds: () => ({kinds: ['workshop', 'buy'], rules: {}}),
}));
jest.mock('../../src/storage/noteLinks', () => ({
  sanitizeFileNameComponent: (name: string) => name,
  classifyNotePath: async (itemPath: string, notePath: string) => ({
    kind: 'own',
    absolutePath: `${itemPath}/${notePath}`,
    exists: true,
    isAbsoluteLink: false,
  }),
}));

import {conversionsOf, installLoopConversion, LoopEvent, subscribeLoopEvents} from '../../src/storage/loops';
import {newLoopLine} from '../../src/domain/loopsSection';
import {item, task} from '../../test-helpers/fixtures';

const PATH = '/Note/2 Areas/Atruvia';

function flush(): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, 0));
}

beforeEach(() => {
  mockWrites.length = 0;
  mockMoves.length = 0;
  mockApplied.length = 0;
  mockExisting.clear();
});

describe('conversionsOf', () => {
  it('takes open bare loop todos whose loop has no line, one per loop', () => {
    const it1 = item('area', 'Atruvia', {
      tasks: [
        task('#workshop/teamoffsite #next'),
        task('#workshop/teamoffsite'),
        task('Book room #workshop/teamoffsite'),
        task('#buy/ebike #someday'),
        task('#workshop/known'),
      ],
      loops: [newLoopLine('workshop/known')],
    });
    expect(conversionsOf(it1, ['workshop', 'buy']).map(c => c.loop.tag)).toEqual(['workshop/teamoffsite']);
  });
});

describe('the conversion after a save', () => {
  let uninstall: () => void;
  const events: LoopEvent[] = [];
  let unsubscribe: () => void;
  beforeAll(() => {
    uninstall = installLoopConversion();
    unsubscribe = subscribeLoopEvents(e => events.push(e));
  });
  afterAll(() => {
    unsubscribe();
    uninstall();
  });
  beforeEach(() => {
    events.length = 0;
  });

  it('writes the loop line instead of the todo, with main date and file, and says so', async () => {
    mockItem = item('area', 'Atruvia', {
      path: PATH,
      rawContent: '## Tasks\n- [ ] Keep me\n- [ ] #workshop/teamoffsite [due:: 2026-11-14]\n',
      tasks: [task('Keep me'), task('#workshop/teamoffsite', {dueDate: '2026-11-14', linkedFile: 'Offsite brief.pdf'})],
    });
    mockHook?.(PATH);
    await flush();
    await flush();
    expect(mockWrites).toHaveLength(1);
    const [file, content] = mockWrites[0];
    expect(file).toBe(`${PATH}/area.txt`);
    expect(content).toContain('- [ ] Keep me');
    expect(content).not.toContain('- [ ] #workshop/teamoffsite');
    expect(content).toContain('## Loops\n- workshop/teamoffsite: active, 2026-11-14, [[Offsite brief.pdf]]');
    expect(mockApplied).toEqual([PATH]);
    expect(events).toEqual([{kind: 'started', tag: 'workshop/teamoffsite', owner: 'Atruvia', noteMovedTo: null}]);
  });

  it('moves the todo own note to the loop note name', async () => {
    mockItem = item('area', 'Atruvia', {
      path: PATH,
      tasks: [task('#buy/ebike', {dueDate: '2026-11-30', notePath: 'Todos/Buy e-bike.note'})],
    });
    mockHook?.(PATH);
    await flush();
    await flush();
    expect(mockMoves).toEqual([[`${PATH}/Todos/Buy e-bike.note`, `${PATH}/2026-11 buy ebike.note`]]);
    expect(events[0]).toEqual({kind: 'started', tag: 'buy/ebike', owner: 'Atruvia', noteMovedTo: '2026-11 buy ebike.note'});
  });

  it('keeps the note where it is when the name is taken', async () => {
    mockExisting.add(`${PATH}/buy ebike.note`);
    mockItem = item('area', 'Atruvia', {path: PATH, tasks: [task('#buy/ebike', {notePath: 'Todos/x.note'})]});
    mockHook?.(PATH);
    await flush();
    await flush();
    expect(mockMoves).toEqual([]);
    expect(mockWrites).toHaveLength(1);
  });

  it('writes nothing when nothing is a loop itself', async () => {
    mockItem = item('area', 'Atruvia', {path: PATH, tasks: [task('Book room #workshop/teamoffsite')]});
    mockHook?.(PATH);
    await flush();
    expect(mockWrites).toEqual([]);
    expect(events).toEqual([]);
  });
});
