// docs/dev/history/technical-design-engage.md §3.6: the Engage panel's writes through the one action hook.
jest.mock('react-native-svg', () => ({Svg: 'Svg', Path: 'Path', Circle: 'Circle', Rect: 'Rect', Line: 'Line', Polyline: 'Polyline', G: 'G'}));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('@react-native-clipboard/clipboard', () => ({setString: jest.fn(), getString: jest.fn(async () => '')}));
jest.mock('sn-plugin-lib', () => ({PluginManager: {}, PluginCommAPI: {}, PluginFileAPI: {}, PluginNoteAPI: {}, NativePluginManager: {}}));
jest.mock('../../src/utils/screenRefresh', () => ({requestEinkRefresh: jest.fn(), useEinkRefreshOnLoad: jest.fn()}));
jest.mock('../../src/utils/log', () => ({log: jest.fn(), logWarn: jest.fn(), logError: jest.fn()}));
const mockStore: {tasks: Task[]} = {tasks: []};
jest.mock('../../src/storage/dataCache', () => ({
  ...jest.requireActual('../../src/storage/dataCache'),
  getCachedData: () => ({paths: {inboxFolder: '/Note/2 Areas/0 Inbox'}, items: [{...mockItem, tasks: mockStore.tasks}]}),
}));
jest.mock('../../src/storage/itemMutations', () => ({
  ...jest.requireActual('../../src/storage/itemMutations'),
  mutateEntryTasks: async (_entry: unknown, mutate: (tasks: Task[]) => Task[]) => {
    mockStore.tasks = mutate(mockStore.tasks.slice());
    return {nextInbox: null};
  },
}));

import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {UndoRecord} from '../../src/domain/engageFlow';
import {Task} from '../../src/domain/types';
import {StatusEntry, StatusProvider, useStatusList} from '../../src/ui/status/StatusProvider';
import {EntryActions, useEntryActions} from '../../src/ui/useEntryActions';
import {task} from '../../test-helpers/fixtures';

const mockItem = {kind: 'area' as const, name: 'Coaching', path: '/Note/2 Areas/Coaching', abbrev: null};
let actions: EntryActions | null = null;
let list: StatusEntry[] = [];
function Probe(): null {
  actions = useEntryActions('EngageOverlay');
  list = useStatusList();
  return null;
}
const entry = (i: number) => ({item: mockItem, taskIndex: i, task: mockStore.tasks[i]});

beforeEach(async () => {
  mockStore.tasks = [task('Plan offsite'), task('Brief #next #now')];
  await act(async () => {
    TestRenderer.create(
      <StatusProvider>
        <Probe />
      </StatusProvider>,
    );
  });
});

describe('useEntryActions for Engage', () => {
  it('pick adds #next; Undo restores the plan todo', async () => {
    let undo: UndoRecord | null = null;
    await act(async () => {
      undo = await actions!.setTaskFlow(entry(0), 'next');
    });
    expect(mockStore.tasks[0]).toMatchObject({text: 'Plan offsite #next', flowState: 'next'});
    await act(async () => {
      await actions!.undoTask(undo!);
    });
    expect(mockStore.tasks[0]).toMatchObject({text: 'Plan offsite', flowState: null});
  });

  it('Remove #next drops #now too; Someday parks', async () => {
    await act(async () => {
      await actions!.setTaskFlow(entry(1), null);
    });
    expect(mockStore.tasks[1]).toMatchObject({text: 'Brief', flowState: null, now: false});
    await act(async () => {
      await actions!.setTaskFlow(entry(0), 'someday');
    });
    expect(mockStore.tasks[0].flowState).toBe('someday');
  });

  it('Done ticks it with a completion date; Undo reopens it', async () => {
    let undo: UndoRecord | null = null;
    await act(async () => {
      undo = await actions!.completeTask(entry(1));
    });
    expect(mockStore.tasks[1].done).toBe(true);
    expect(mockStore.tasks[1].fields.completion).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    await act(async () => {
      await actions!.undoTask(undo!);
    });
    expect(mockStore.tasks[1]).toMatchObject({done: false, fields: expect.objectContaining({completion: null})});
  });

  it('Undo writes nothing when the todo changed meanwhile, and says so', async () => {
    let undo: UndoRecord | null = null;
    await act(async () => {
      undo = await actions!.setTaskFlow(entry(0), 'next');
    });
    mockStore.tasks[0] = task('Plan the offsite #next');
    let undone = true;
    await act(async () => {
      undone = await actions!.undoTask(undo!);
    });
    expect(undone).toBe(false);
    expect(mockStore.tasks[0].text).toBe('Plan the offsite #next');
    expect(list.map(e => e.msg.text)).toContain('The todo changed meanwhile - nothing undone.');
  });
});
